import { randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  ApprovalRequest, AuditEvent, CorrectiveAction, InvestigationState, Message, PhotoMetadata, Scenario, Skill, WorkerId,
} from '../shared/domain.js';
import { busyPhases } from '../shared/domain.js';
import { compatibleComponent, scenarioForStation, scenarios } from '../shared/scenarios.js';
import { LocalSkillRegistry, MockTools, MockVisionService, type ApprovalService, type SkillRegistry, type VisionService } from './services.js';
import type { VisionImage } from '../shared/vision.js';
import { conversationTurnSchema, type IncidentConfirmationInput } from '../shared/conversation.js';
import type { ConversationService } from './conversation.js';
import { skillAgents } from '../shared/skills.js';
import { incidentHref, stationHref, type FleetDetection } from '../shared/incidents.js';
import type { IncidentStore } from './incidentStore.js';

export class WorkflowError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
const smallNumbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const incidentAffirmations = new Set(['yes', 'yes please', 'yes go ahead', 'yes please go ahead', 'yes please do',
  'yes do that', 'yes create it', 'yes create the incident', 'yes create incident',
  'yes create the incident and send the alert', 'yes create incident and send alert', 'go ahead', 'please go ahead']);
const incidentDeclines = new Set(['no', 'no thanks', 'no thank you', 'no do not create it', "no don't create it"]);
function normalizedDecision(text: string) { return text.toLowerCase().replace(/\u2019/g, "'").replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim(); }
function confirmsIncident(text: string) {
  if (/[?"]/u.test(text)) return false;
  const decision = normalizedDecision(text);
  return incidentAffirmations.has(decision) ||
    /^(?:yes(?: please)?(?: go ahead(?: and)?)?|please(?: go ahead(?: and)?)?|go ahead(?: and)?) create (?:the |an )?incident(?: (?:and )?(?:send|publish) (?:the |an? )?(?:station )?(?:dashboard )?alert)?(?: and save (?:the |these )?(?:findings|evidence|details))?(?: please)?$/.test(decision);
}
function asksForFindings(text: string) {
  return /\b(tell|show|summari[sz]e|explain|review|what|any)\b.*\b(investigation|findings|found|find|detected|quality|issues|results)\b/i.test(text);
}
function emptyIntake(state: InvestigationState) {
  return state.phase === 'INTAKE' && state.intakeStep === 0 && Object.values(state.fields).every(value => value === undefined);
}
const spokenNumberPattern = [...smallNumbers, ...tens, 'hundred', 'thousand'].join('|');
function intakeNumber(text: string): number | undefined {
  const digits = text.match(/\d+/)?.[0];
  if (digits !== undefined) return Number(digits);
  const phrase = text.toLowerCase().match(new RegExp(`\\b(?:${spokenNumberPattern})(?:[\\s-]+(?:and[\\s-]+)?(?:${spokenNumberPattern}))*\\b`))?.[0];
  if (!phrase) return undefined;
  let total = 0, group = 0;
  let previous: 'small' | 'tens' | 'hundred' | 'thousand' | undefined;
  for (const word of phrase.split(/[\s-]+/).filter(word => word !== 'and')) {
    if (word === 'hundred') {
      if (previous !== 'small' || group < 1 || group > 9) return undefined;
      group *= 100; previous = 'hundred';
    } else if (word === 'thousand') {
      if (!group || total || previous === 'thousand') return undefined;
      total = group * 1000; group = 0; previous = 'thousand';
    } else {
      const small = smallNumbers.indexOf(word);
      const value = small >= 0 ? small : (tens.indexOf(word) + 2) * 10;
      if (previous === 'small' || (previous === 'tens' && (value < 1 || value > 9))) return undefined;
      group += value; previous = small >= 0 ? 'small' : 'tens';
    }
  }
  return total + group;
}
class SessionApproval implements ApprovalService {
  request?: ApprovalRequest;
  private token?: string;
  requestApproval(summary: string) {
    this.token = undefined;
    this.request = { id: randomUUID(), summary, status: 'pending' };
    return this.request.id;
  }
  approve(requestId: string) {
    if (!this.request || this.request.id !== requestId || this.request.status !== 'pending') throw new WorkflowError('Approval is not pending for this request.');
    this.request.status = 'approved';
    this.request.approvedAt = new Date().toISOString();
    this.token = randomUUID();
    return this.token;
  }
  reject(requestId: string) {
    if (!this.request || this.request.id !== requestId || this.request.status !== 'pending') throw new WorkflowError('Approval is not pending for this request.');
    this.request.status = 'rejected';
    this.token = undefined;
  }
  validate(token: string) {
    const expected = Buffer.from(this.token ?? '');
    const supplied = Buffer.from(token);
    if (!this.request || this.request.status !== 'approved' || !this.token ||
      expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new WorkflowError('Explicit, session-bound approval is required.', 403);
  }
  consume(token: string) {
    this.validate(token);
    this.token = undefined;
  }
}
export function initialState(id: Scenario['id'] = 'Q-2048'): InvestigationState {
  return {
    correlationId: randomUUID(), scenarioId: id, agent: scenarios[id].agent, phase: 'IDLE', intakeStep: 0,
    fields: {}, messages: [], evidence: [], audit: [], skillActive: false, skillStep: 0, skillVersion: '1.0.0',
    failProduction: false, noHistorical: false, speed: 1,
    workers: [
      { id: 'quality', name: 'Quality Investigator', status: 'Idle', detail: 'Awaiting investigation' },
      { id: 'vision', name: 'Visual Inspection', status: 'Idle', detail: 'Awaiting visual evidence' },
      { id: 'production', name: 'Production Analyst', status: 'Idle', detail: 'Measurements not retrieved' },
      { id: 'maintenance', name: 'Maintenance Correlation', status: 'Idle', detail: 'Station history not retrieved' },
      { id: 'knowledge', name: 'Engineering Knowledge', status: 'Idle', detail: 'Historical search not started' },
      { id: 'action', name: 'Corrective Action', status: 'Idle', detail: 'Human approval required' },
    ],
  };
}
export class InvestigationEngine {
  state: InvestigationState;
  private approval = new SessionApproval();
  private tools: MockTools;
  private vision = new MockVisionService();
  private controller = new AbortController();
  private listeners = new Set<(state: InvestigationState) => void>();
  private conversationRequest?: symbol;
  private procedure: Skill;
  private procedures = new Map<string, Skill>();
  constructor(id: Scenario['id'] = 'Q-2048', public registry: SkillRegistry = new LocalSkillRegistry(), private latency = 850,
    private incidents?: IncidentStore) {
    this.state = initialState(id);
    this.tools = new MockTools(this.scenario, this.approval);
    this.procedure = this.registry.load('vehicle-quality-investigation', this.state.agent);
    this.captureProcedures();
    this.describeProcedure();
  }
  get scenario() { return scenarios[this.state.scenarioId]; }
  subscribe(fn: (state: InvestigationState) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  snapshot() { return structuredClone(this.state); }
  currentSkill() { return structuredClone(this.procedure); }
  private captureProcedures() {
    this.procedures = new Map(skillAgents.map(agent => [agent, this.registry.load('vehicle-quality-investigation', agent)]));
  }
  private describeProcedure() {
    const { name, version, source, provenance } = this.procedure;
    this.state.skillVersion = version;
    this.state.skillReference = { name, version, source, provenance: provenance ? { ...provenance } : undefined };
  }
  refreshSkillBinding() {
    if (this.state.phase !== 'IDLE') throw new WorkflowError('Existing investigations remain pinned. Start a new investigation to use another skill.');
    this.procedure = this.registry.load('vehicle-quality-investigation', this.state.agent);
    this.captureProcedures();
    this.describeProcedure();
    this.emit();
  }
  private emit() { for (const fn of this.listeners) fn(this.snapshot()); }
  private message(role: 'assistant' | 'operator' | 'system', text: string, speech: Pick<Message, 'kind' | 'spokenText'> = {}) {
    const id = randomUUID();
    this.state.messages.push({ id, role, text, at: new Date().toISOString(), ...speech });
    return id;
  }
  private audit(tool: string, input: string, output: string, result: AuditEvent['result'] = 'success', category = 'read') {
    this.state.audit.push({ id: randomUUID(), at: new Date().toISOString(), agent: this.state.agent,
      skill: this.state.skillActive ? this.procedure.name : 'not loaded', version: this.state.skillVersion,
      tool, inputSummary: input, outputSummary: output,
      source: category === 'vision' ? 'Azure image analysis' :
        category === 'conversation' ? `Azure Foundry ${this.state.conversation?.model}` : 'Synthetic local service', category,
      approval: this.approval.request?.status ?? 'not requested', result, correlationId: this.state.correlationId });
  }
  private setWorker(id: WorkerId, status: 'Working' | 'Complete' | 'Failed' | 'Needs input', detail: string, durationMs?: number) {
    const worker = this.state.workers.find(w => w.id === id);
    if (!worker) throw new Error('Worker configuration missing.');
    Object.assign(worker, { status, detail, durationMs });
    this.emit();
  }
  private async wait(signal: AbortSignal, multiplier = 1) {
    if (signal.aborted) throw new WorkflowError('Investigation cancelled.');
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new WorkflowError('Investigation cancelled.')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, this.latency * multiplier / this.state.speed);
      signal.addEventListener('abort', abort, { once: true });
    });
    if (signal.aborted) throw new WorkflowError('Investigation cancelled.');
  }
  reset(id: Scenario['id'] = this.state.scenarioId) {
    if (this.state.phase === 'CREATING_ACTION') throw new WorkflowError('Wait for request creation to finish before resetting.');
    this.controller.abort();
    this.controller = new AbortController();
    this.conversationRequest = undefined;
    this.approval = new SessionApproval();
    this.state = initialState(id);
    this.tools = new MockTools(this.scenario, this.approval);
    this.procedure = this.registry.load('vehicle-quality-investigation', this.state.agent);
    this.captureProcedures();
    this.describeProcedure();
    this.emit();
  }
  cancel() {
    if (this.state.phase === 'CREATING_ACTION' || this.state.action) throw new WorkflowError('A routed action cannot be cancelled locally. Engineer review is required.');
    this.controller.abort();
    if (this.approval.request?.status === 'pending') this.approval.reject(this.approval.request.id);
    this.state.approval = this.approval.request;
    this.state.incidentConfirmation = undefined;
    this.state.phase = 'CANCELLED';
    this.state.workers.forEach(w => { if (w.status === 'Working') { w.status = 'Needs input'; w.detail = 'Cancelled by operator'; } });
    this.audit('workflow.cancel', this.state.scenarioId, 'Cancelled by operator', 'success', 'control');
    this.message('system', 'Investigation cancelled. No further action will be taken.');
    this.emit();
  }
  configure(config: { failProduction?: boolean; noHistorical?: boolean; speed?: number }) {
    if (busyPhases.includes(this.state.phase)) throw new WorkflowError('Wait for the current operation before changing demo settings.');
    if (config.noHistorical !== undefined && this.state.skillActive) throw new WorkflowError('Configure historical search before evidence retrieval starts.');
    Object.assign(this.state, config);
    this.emit();
  }
  start() {
    if (this.state.phase !== 'IDLE') throw new WorkflowError('Reset before starting another investigation.');
    this.refreshSkillBinding();
    this.state.phase = 'INTAKE';
    this.message('assistant', 'Hi. What have you observed?');
    this.emit();
  }
  async investigateDetection(detection: FleetDetection, fromEmptyConversation = false) {
    if (this.state.phase !== 'IDLE' && !(fromEmptyConversation && emptyIntake(this.state))) throw new WorkflowError('An investigation is already open. Review it or explicitly reset before opening a fleet detection.');
    if (!this.incidents) throw new WorkflowError('The local incident database is not configured.', 503);
    const canonical = this.incidents.detection(detection.vehicle.id);
    if (JSON.stringify(canonical) !== JSON.stringify(detection)) throw new WorkflowError('Detection does not match the stored synthetic records.');
    const existing = this.incidents.existing(detection);
    if (existing) throw new WorkflowError(`An incident already exists: ${existing.id}. Open the saved details from the control tower.`);
    this.state.phase = 'IDLE';
    this.state.scenarioId = detection.scenarioId;
    this.state.agent = this.scenario.agent;
    this.tools = new MockTools(this.scenario, this.approval);
    this.refreshSkillBinding();
    this.state.detection = structuredClone(detection);
    this.state.intakeStep = 3;
    this.state.fields = { vehicle: `${detection.vehicle.id} / ${detection.vehicle.model}`, plant: this.scenario.plant,
      line: this.scenario.line, station: detection.station, component: detection.component,
      issue: `Measured door-closing force ${detection.vehicle.measurement} N exceeds the ${detection.vehicle.limit} N upper limit.`,
      reportedCount: detection.vehicleIds.length, count: detection.vehicleIds.length,
      severity: 'Measurement exception; engineer assessment required', visual: detection.imageNote };
    this.state.photo = { name: 'Associated synthetic station illustration', type: 'image/png', size: 0, sample: true };
    this.state.evidence.push({ id: randomUUID(), source: 'Fleet measurement monitor', at: detection.vehicle.recordedAt,
      observation: `${detection.vehicle.id}: ${this.state.fields.issue} ${detection.vehicleIds.length} synthetic records exceed the limit.`,
      type: 'Retrieved', reference: detection.id });
    this.setWorker('vision', 'Needs input', 'Illustration only; no pixel analysis or confirmed visual defect');
    this.message('assistant', `I flagged ${detection.vehicle.id} at ${detection.station}: door-closing force is above the synthetic limit. ` +
      `There are ${detection.vehicleIds.length} related measurement exceptions. I will compare the records and draft an incident for your review. No incident or station alert has been created.`,
      { spokenText: `I've flagged vehicle ${detection.vehicle.id} at ${detection.station}. Door-closing force is above the demo limit. I'll compare the records before proposing an incident. Nothing has been sent yet.` });
    this.audit('fleet.detect', detection.vehicle.id, 'Synthetic measurement-rule exception; no model or camera inference claimed');
    try { await this.loadAndRetrieve(); }
    catch (error) { if (!this.controller.signal.aborted) this.fail(error); }
  }
  input(text: string) {
    if (this.state.phase === 'IDLE') this.start();
    if (['COMPLETE', 'CANCELLED', 'REJECTED'].includes(this.state.phase)) throw new WorkflowError('This investigation is closed to intake. Reset or review the action.');
    if (this.state.phase !== 'INTAKE') {
      this.message('operator', text);
      this.audit('quality.updateInvestigationNotes', this.state.scenarioId, 'Operator note recorded');
      this.message('assistant', 'I recorded your note. This deterministic mock does not interpret new instructions or grant approval from chat.');
      this.emit();
      return;
    }
    const s = this.scenario;
    if (this.state.intakeStep === 0) {
      this.state.fields = { vehicle: s.vehicle, plant: s.plant, line: s.line, component: s.component,
        issue: text, severity: 'Requires engineer assessment' };
      this.state.intakeStep = 1;
      this.message('operator', text);
      this.message('assistant', 'I will start an investigation while we talk. Which production station is affected?');
      this.setWorker('quality', 'Working', `Opening ${s.id} in the synthetic Quality Portal`);
    } else if (this.state.intakeStep === 1) {
      const stationNumber = s.station.match(/\d+/)?.[0];
      if (!stationNumber || (!new RegExp(`\\b${stationNumber}\\b`).test(text) && intakeNumber(text) !== Number(stationNumber))) {
        throw new WorkflowError(`This synthetic scenario has data only for ${s.station}.`, 400);
      }
      this.state.fields.station = s.station;
      this.state.intakeStep = 2;
      this.message('operator', text);
      this.message('assistant', 'Thank you. Is this affecting a single vehicle or multiple vehicles? How many are affected?');
    } else {
      const count = intakeNumber(text);
      if (count === undefined || !Number.isInteger(count) || count < 1 || count > 10000) throw new WorkflowError('Enter an affected-vehicle count from 1 to 10,000.', 400);
      this.state.fields.reportedCount = count;
      this.state.fields.count = count;
      this.state.intakeStep = 3;
      this.state.phase = 'COLLECTING_VISUAL_EVIDENCE';
      this.message('operator', text);
      this.message('assistant', 'I have recorded the initial scope. Could you upload or show me a photo of the affected component?');
      this.setWorker('quality', 'Needs input', 'Scope captured; awaiting evidence');
    }
    this.emit();
  }
  async converse(text: string, service: ConversationService, confirmation?: IncidentConfirmationInput) {
    if (this.conversationRequest) throw new WorkflowError('A conversation reply is already in progress. Please wait.');
    if ((this.state.phase === 'COMPLETE' && !this.state.incident) || ['CANCELLED', 'REJECTED', 'CREATING_ACTION'].includes(this.state.phase)) {
      throw new WorkflowError('This investigation is closed to conversation. Review the action or reset.');
    }
    const request = Symbol();
    this.conversationRequest = request;
    const correlationId = this.state.correlationId;
    const signal = this.controller.signal;
    const started = Date.now();
    try {
      if (await this.incidentDialogue(text, confirmation)) return;
      this.state.incidentConfirmation = undefined;
      if (this.state.phase === 'IDLE') this.start();
      const intake = ['INTAKE', 'COLLECTING_VISUAL_EVIDENCE'].includes(this.state.phase);
      const turn = conversationTurnSchema.parse(await service.respond(
        this.snapshot(), text, this.currentSkill(), signal));
      if (signal.aborted || this.state.correlationId !== correlationId) throw new WorkflowError('Conversation cancelled; no fields were changed.');
      this.message('operator', text);
      let reply = turn.reply;
      if (intake && ['INTAKE', 'COLLECTING_VISUAL_EVIDENCE'].includes(this.state.phase)) {
        const previousScope = [this.state.fields.station, this.state.fields.component, this.state.fields.reportedCount];
        for (const [key, value] of Object.entries(turn.fields)) {
          switch (key) {
            case 'reportedCount': this.state.fields.reportedCount = turn.fields.reportedCount ?? undefined; break;
            case 'issue': case 'component': case 'station': case 'vehicle': case 'plant': case 'line':
              this.state.fields[key] = typeof value === 'string' ? value : undefined; break;
          }
        }
        const f = this.state.fields;
        this.state.reportedContext = { vehicle: f.vehicle, plant: f.plant, line: f.line };
        const selected = f.station ? scenarioForStation(f.station) : undefined;
        if (selected && selected.id !== this.state.scenarioId) {
          this.state.scenarioId = selected.id;
          this.state.agent = selected.agent;
          this.tools = new MockTools(selected, this.approval);
          const pinned = this.procedures.get(selected.agent);
          if (!pinned) throw new Error('No pinned procedure exists for the selected agent.');
          this.procedure = structuredClone(pinned);
          this.describeProcedure();
          const selection = `Selected synthetic dataset ${selected.id} / ${selected.station} from the reported station.`;
          this.message('system', selection);
          this.audit('workflow.selectScenario', f.station!, selection, 'success', 'control');
        }
        if (previousScope.some((value, index) => value !== [f.station, f.component, f.reportedCount][index])) {
          this.state.photo = undefined;
          this.state.vision = undefined;
          f.visual = undefined;
          this.state.evidence = [];
          this.setWorker('vision', 'Needs input', 'Scope changed; a new component photo is required');
        }
        const s = this.scenario;
        f.count = f.reportedCount;
        this.state.scopeNote = undefined;
        if (f.station && !selected) {
          const available = Object.values(scenarios).map(item => item.station).join(', ');
          this.state.scopeNote = `Reported ${f.station} is unverified. Available synthetic records: ${available}.`;
          reply = `I've recorded ${f.station} as unverified. The demo covers ${available}. Which station should we investigate?`;
        } else if (selected && f.reportedCount !== undefined && f.reportedCount !== s.count) {
          this.state.scopeNote = `Reported ${f.reportedCount} vehicles; synthetic records contain ${s.count}. Reconcile before investigation.`;
          reply = `You've reported ${f.reportedCount} vehicles; the demo records list ${s.count}. I'll keep your number. Could you clarify the difference?`;
        } else if (selected && f.component && !compatibleComponent(f.component, s)) {
          this.state.scopeNote = `Reported component is outside the selected ${s.component} scenario.`;
          reply = `I've recorded ${f.component}. The ${s.station} dataset covers ${s.component}; could you clarify the component or station?`;
        }
        const ready = !!(f.issue && f.component && f.station && f.reportedCount !== undefined && !this.state.scopeNote);
        this.state.intakeStep = !f.issue || !f.component ? 0 : !f.station ? 1 : 2;
        this.state.phase = ready ? 'COLLECTING_VISUAL_EVIDENCE' : 'INTAKE';
        if (ready) {
          this.state.intakeStep = 3;
          f.vehicle ??= s.vehicle; f.plant ??= s.plant; f.line ??= s.line;
          f.severity = 'Requires engineer assessment';
          this.setWorker('quality', 'Needs input', 'Reported scope captured; awaiting photo evidence');
          if (!/\b(photo|image|camera|picture)\b/i.test(reply)) {
            reply = `Got it: ${f.station}, ${f.reportedCount} vehicles. Could you upload a photo of the affected component?`;
          }
        }
      } else if ((turn.fields.station && scenarioForStation(turn.fields.station)?.id !== this.state.scenarioId) ||
        (turn.fields.component && !compatibleComponent(turn.fields.component, this.scenario)) ||
        (turn.fields.reportedCount !== null && turn.fields.reportedCount !== this.state.fields.reportedCount)) {
        reply = 'Evidence collection has locked this case. Start a new investigation to change station, component or scope; existing evidence and approvals cannot transfer.';
        this.audit('workflow.changeScope', 'Reported correction after evidence collection', 'Case unchanged; new investigation required', 'denied', 'control');
      }
      this.state.conversation = { model: service.status().model ?? 'connected model', durationMs: Date.now() - started };
      if (/\b(approv(?:e|al)|recalibrate|calibrate|release)\b|\bgo ahead\b|create.{0,30}incident|send.{0,30}alert/i.test(text)) {
        reply = 'Spoken approval cannot execute actions. Review and use the approval button; production changes still need separate engineer authorization.';
      }
      this.message('assistant', reply);
      this.audit('conversation.respond', 'Operator turn; synthetic context', `Validated intake; ${this.state.conversation.durationMs} ms`, 'success', 'conversation');
      this.emit();
    } finally {
      if (this.conversationRequest === request) this.conversationRequest = undefined;
    }
  }
  private incidentQuestion() {
    return `Would you like me to create an incident, send an alert to the ${this.scenario.station} dashboard, and save the evidence? ` +
      'Say "yes" or use the approval button. This does not authorize production changes.';
  }
  private armIncidentConfirmation(promptId: string) {
    if (this.state.detection && this.state.phase === 'WAITING_FOR_APPROVAL' && this.state.approval?.status === 'pending') {
      this.state.incidentConfirmation = { requestId: this.state.approval.id, promptId, expiresAt: Date.now() + 120000 };
    }
  }
  private presentIncidentFindings() {
    const detection = this.state.detection;
    if (!detection) throw new WorkflowError('No vehicle investigation is available.');
    const summary = `I found high door-closing force on ${detection.vehicle.id} at ${detection.station}: ` +
      `${detection.vehicle.measurement} N against a ${detection.vehicle.limit} N upper limit. ` +
      `${detection.vehicleIds.length} vehicle records exceed that limit. Possible hinge/tooling deviation needs engineer validation; the reference image is not a photo diagnosis.`;
    const reply = this.state.incident ? `${summary} Incident ${this.state.incident.id} is already saved and the station alert is published. What else would you like me to investigate?` :
      `${summary} ${this.incidentQuestion()}`;
    const promptId = this.message('assistant', reply, { kind: 'recommendation', spokenText: reply });
    this.armIncidentConfirmation(promptId);
    this.audit('conversation.incidentSummary', detection.vehicle.id, 'Reported stored measurement facts and explicit operation scope');
    this.emit();
  }
  private presentIncidentConfirmation() {
    if (!this.state.detection || this.state.phase !== 'WAITING_FOR_APPROVAL' || this.state.approval?.status !== 'pending') {
      throw new WorkflowError('A pending incident proposal is required before confirmation.');
    }
    const reply = `I can create the incident, post an alert to the ${this.state.detection.station} dashboard, and save these findings. ` +
      'Shall I go ahead? Say yes or use the approval button. No production changes are included.';
    const promptId = this.message('assistant', reply, { kind: 'incident-confirmation', spokenText: reply });
    this.armIncidentConfirmation(promptId);
    this.audit('conversation.incidentConfirmation', this.state.detection.vehicle.id, 'Requested fresh human confirmation for incident, local station alert and saved evidence');
    this.emit();
  }
  private async incidentDialogue(text: string, confirmation?: IncidentConfirmationInput) {
    const decision = normalizedDecision(text);
    const yes = confirmsIncident(text), no = incidentDeclines.has(decision);
    const requestsIncident = /\b(create|send|publish|save)\b.*\b(incident|alert|evidence|details|findings)\b/i.test(text);
    if (asksForFindings(text) && this.incidents && (this.state.phase === 'IDLE' || emptyIntake(this.state))) {
      this.message('operator', text);
      await this.investigateDetection(this.incidents.nextDetection(), true);
      return true;
    }
    if (!this.state.detection) return false;
    if (this.state.incident && (yes || no || asksForFindings(text) || requestsIncident)) {
      this.message('operator', text);
      this.presentIncidentFindings();
      return true;
    }
    if (this.state.phase !== 'WAITING_FOR_APPROVAL' || this.state.approval?.status !== 'pending') return false;
    if (yes || no) {
      const current = this.state.incidentConfirmation;
      if (!current || !confirmation || current.requestId !== confirmation.requestId || current.promptId !== confirmation.promptId ||
        current.expiresAt <= Date.now() || this.state.messages.filter(message => message.role === 'assistant').at(-1)?.id !== current.promptId) {
        this.audit('approval.conversation', confirmation?.requestId ?? 'missing context', 'Stale, missing or expired confirmation rejected', 'denied', 'approval');
        this.state.incidentConfirmation = undefined;
        this.presentIncidentConfirmation();
        throw new WorkflowError('Confirmation was not bound to the latest incident proposal. Listen to the refreshed proposal, then say yes again.', 409);
      }
      this.message('operator', text);
      const token = this.decide(current.requestId, yes ? 'approve' : 'reject', 'conversation');
      if (token) {
        try { await this.createAction(token); }
        catch (error) { if (!this.state.incident) this.propose(); throw error; }
      }
      return true;
    }
    this.state.incidentConfirmation = undefined;
    if (requestsIncident) {
      this.message('operator', text);
      this.presentIncidentConfirmation();
      return true;
    }
    if (asksForFindings(text)) {
      this.message('operator', text);
      this.presentIncidentFindings();
      return true;
    }
    return false;
  }
  async advance() {
    if (this.state.phase === 'IDLE') return this.start();
    if (this.state.phase === 'INTAKE') return this.input(this.state.intakeStep === 0 ? this.scenario.symptom :
      this.state.intakeStep === 1 ? this.scenario.station : `We have identified ${this.scenario.count} affected vehicles.`);
    if (this.state.phase === 'COLLECTING_VISUAL_EVIDENCE') return this.collectPhoto({
      name: `reference-${this.scenario.sample.split('/').at(-1)}`,
      size: 0, type: this.scenario.sample.endsWith('.jpg') ? 'image/jpeg' : 'image/png', sample: true,
    });
    if (this.state.phase === 'FAILED') return this.retrieve();
    if (this.state.phase === 'REJECTED') { this.propose(); this.emit(); return; }
    throw new WorkflowError('Review the pending approval or reset. Guided advance never approves an action.');
  }
  async collectPhoto(photo: PhotoMetadata, connectedVision?: { service: VisionService; image: VisionImage }) {
    if (this.state.phase !== 'COLLECTING_VISUAL_EVIDENCE') throw new WorkflowError('Visual evidence is not currently requested.');
    if (scenarioForStation(this.state.fields.station ?? '')?.id !== this.state.scenarioId ||
      !compatibleComponent(this.state.fields.component ?? '', this.scenario)) {
      throw new WorkflowError('Reported scope does not match this scenario. Clarify it in Live conversation or reset the guided demo before using seeded evidence.');
    }
    const signal = this.controller.signal;
    this.state.error = undefined;
    this.state.vision = undefined;
    this.state.fields.visual = undefined;
    this.state.photo = photo;
    this.state.phase = 'ANALYZING_VISUAL_EVIDENCE';
    this.setWorker('vision', 'Working', connectedVision ? 'Inspecting consented image with Azure' :
      photo.sample ? 'Reading synthetic sample observation' : 'Recording uploaded evidence (mock; no pixel analysis)');
    const started = Date.now();
    let analyzed = false;
    try {
      if (!connectedVision) await this.wait(signal);
      const analysis = connectedVision ?
        await connectedVision.service.analyze(photo, this.scenario, connectedVision.image, signal) :
        await this.vision.analyze(photo, this.scenario);
      if (signal.aborted) return;
      analyzed = true;
      this.state.vision = analysis;
      this.state.fields.visual = analysis.observations[0].observation;
      this.state.evidence.push({ id: randomUUID(), source: 'Visual evidence', at: new Date().toISOString(),
        observation: this.state.fields.visual, type: 'Requires validation', reference: `Photo: ${photo.name}` });
      this.audit('vision.analyze', connectedVision ? 'Consented, bounded image sent to Azure; bytes not retained by app' :
        'Image metadata only; no image leaves browser', this.state.fields.visual, 'success', connectedVision ? 'vision' : 'read');
      if (connectedVision && analysis.relevance !== 'relevant') {
        this.state.phase = 'COLLECTING_VISUAL_EVIDENCE';
        this.setWorker('vision', 'Needs input', 'Clearer, relevant component photo required', Date.now() - started);
        const reply = `${analysis.summary} ${analysis.recommendedNextChecks.join(' ')} I have not proposed a cause or action from this image.`;
        this.message('assistant', reply, { kind: 'photo-observation', spokenText: reply });
        this.emit();
        return;
      }
      this.setWorker('vision', 'Complete', 'Advisory observation; measurement validation required', Date.now() - started);
      const photoReply = connectedVision ?
        `Photo review: ${analysis.summary} ${analysis.recommendedNextChecks[0]} This is advisory, not a confirmed defect. I will check the synthetic records next.` : photo.sample ?
        'The reference image is displayed, but this guided path has not analyzed its pixels. I will correlate the synthetic measurements and maintenance records; an engineer must inspect the actual component.' :
        'Your photo is retained only in this browser session. Guided mode cannot analyze its pixels. I will correlate the synthetic measurements and maintenance records without claiming the image confirms a defect.';
      this.message('assistant', photoReply, { kind: 'photo-observation',
        spokenText: connectedVision ? `${analysis.summary} A photo alone cannot confirm a defect.` : photoReply });
      await this.loadAndRetrieve();
    } catch (error) {
      if (signal.aborted) return;
      if (!analyzed) {
        const detail = error instanceof WorkflowError ? error.message : 'Image analysis failed. Upload again to retry explicitly; no mock fallback was used.';
        this.state.error = detail;
        this.state.phase = 'COLLECTING_VISUAL_EVIDENCE';
        this.audit('vision.analyze', 'Consented image analysis', detail, 'failed', connectedVision ? 'vision' : 'read');
        this.setWorker('vision', 'Needs input', detail);
        throw new WorkflowError(detail, error instanceof WorkflowError ? error.status : 502);
      }
      this.fail(error);
    }
  }
  private async loadAndRetrieve() {
    this.state.phase = 'LOADING_SKILL';
    this.emit();
    await this.wait(this.controller.signal, 0.5);
    const skill = this.registry.attach('vehicle-quality-investigation', this.state.agent, this.procedure);
    this.state.skillActive = true;
    this.state.skillVersion = skill.version;
    this.state.skillStep = 5;
    this.audit('skill.load', skill.name, `Pinned ${skill.name} v${skill.version} attached to ${this.state.agent}; ${skill.source}${skill.provenance ? `; SHA-256 ${skill.provenance.sha256}` : ''}`);
    this.message('system', `${skill.name} loaded - v${skill.version}`);
    await this.retrieve();
  }
  private fail(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected investigation error.';
    this.state.error = message;
    this.state.phase = 'FAILED';
    this.message('assistant', `${message} I will not propose a cause or corrective action until required evidence is available.`);
    this.emit();
  }
  async retrieve() {
    if (!this.state.skillActive || !['FAILED', 'LOADING_SKILL'].includes(this.state.phase)) throw new WorkflowError('A reviewed skill and visual evidence are required.');
    const signal = this.controller.signal;
    this.state.phase = 'RETRIEVING_EVIDENCE';
    this.state.error = undefined;
    const s = this.scenario;
    const tasks: { id: WorkerId; tool: string; run: () => Promise<{ detail: string; reference: string }> }[] = [
      { id: 'quality', tool: 'quality.getIssue', run: async () => {
        const issue = await this.tools.getIssue(s.id);
        this.state.fields.count = issue.count;
        return { detail: this.state.detection ? `${issue.count} vehicle measurement exceptions in synthetic records; defects remain unconfirmed` :
          `${issue.count} affected vehicles confirmed in synthetic records`, reference: s.id };
      } },
      { id: 'production', tool: 'production.getMeasurements', run: async () => {
        if (this.state.failProduction) throw new Error('Production API temporarily unavailable.');
        const measurements = await this.tools.getMeasurements(s.station, s.component);
        this.state.measurements = measurements;
        this.state.fields.production = measurements.observation;
        this.state.fields.firstObserved = measurements.firstObserved;
        return { detail: measurements.observation, reference: `PROD-${s.id}` };
      } },
      { id: 'maintenance', tool: 'maintenance.getRecentStationEvents', run: async () => {
        const [event] = await this.tools.getRecentStationEvents(s.station);
        this.state.fields.maintenance = `${event.id} at ${event.at}: ${event.description}`;
        return { detail: this.state.fields.maintenance, reference: event.id };
      } },
      { id: 'knowledge', tool: 'engineering.searchSimilarCases', run: async () => {
        const cases = this.state.noHistorical ? [] : await this.tools.searchSimilarCases(s.component, s.symptom);
        if (!cases.length) {
          this.state.fields.historical = 'No similar approved historical case found.';
          return { detail: this.state.fields.historical, reference: 'SEARCH-NO-MATCH' };
        }
        const prior = cases[0];
        await this.tools.getApprovedProcedure(prior.id);
        this.state.fields.historical = `${prior.id}: ${prior.description}`;
        return { detail: this.state.fields.historical, reference: prior.id };
      } },
    ];
    await Promise.all(tasks.map(async (task, index) => {
      if (this.state.workers.find(w => w.id === task.id)?.status === 'Complete') return;
      const start = Date.now();
      this.setWorker(task.id, 'Working', `Retrieving ${task.id} evidence...`);
      try {
        await this.wait(signal, 1 + index * 0.5);
        const result = await task.run();
        if (signal.aborted) return;
        this.state.evidence.push({ id: randomUUID(), source: task.id, at: new Date().toISOString(),
          observation: result.detail, type: 'Retrieved', reference: result.reference });
        this.audit(task.tool, `${s.id}; ${s.station}`, result.detail);
        this.setWorker(task.id, 'Complete', result.detail, Date.now() - start);
      } catch (error) {
        if (signal.aborted) return;
        const detail = error instanceof Error ? error.message : 'Tool retrieval failed.';
        this.audit(task.tool, s.id, detail, 'failed');
        this.setWorker(task.id, 'Failed', detail, Date.now() - start);
      }
    }));
    if (signal.aborted) return;
    if (this.state.workers.some(w => w.status === 'Failed')) { this.fail(new Error('Required production evidence could not be retrieved. Disable the simulated failure and retry.')); return; }
    if (this.state.fields.reportedCount !== s.count) {
      this.fail(new Error(`Reported scope (${this.state.fields.reportedCount}) conflicts with synthetic records (${s.count}). Reset and reconcile the scope before proceeding.`));
      return;
    }
    this.state.phase = 'CORRELATING_EVIDENCE';
    this.state.skillStep = 8;
    this.emit();
    await this.wait(signal);
    if (signal.aborted) return;
    this.state.fields.probableCause = s.probableCause;
    this.state.evidence.push({ id: randomUUID(), source: 'Evidence correlation', at: new Date().toISOString(),
      observation: `${s.probableCause} Temporal association is not causation; engineer validation required.`,
      type: 'Inferred', reference: `PROD-${s.id} + ${s.event.id}` });
    const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
    const elapsed = minutes(s.firstObserved) - minutes(s.event.at);
    this.message('assistant', `The anomaly began ${elapsed} minutes after ${s.event.id}. ${this.state.noHistorical ?
      'No similar approved historical case was found. I can draft inspection-only checks for engineering review.' :
      `I found similar symptoms in ${s.historical.id}.`} The evidence suggests ${s.probableCause.toLowerCase()} An engineer must validate this hypothesis.`);
    this.audit('workflow.correlate', 'Measurements and maintenance timestamps', 'Hypothesis only; no numerical confidence assigned');
    this.propose();
    this.emit();
  }
  private propose() {
    this.state.fields.recommendedAction = this.state.noHistorical ?
      `Request engineer-led inspection and measurement at ${this.scenario.station}. No approved corrective procedure was found; do not recalibrate or release production.` :
      this.scenario.action;
    if (this.state.detection) this.state.fields.recommendedAction =
      `Create an incident for ${this.state.detection.vehicle.id}, publish an alert to the ${this.scenario.station} dashboard, ` +
      `and save the evidence, related vehicle IDs and inspection recommendations in the local database. ${this.state.fields.recommendedAction}`;
    this.approval.requestApproval(this.state.fields.recommendedAction);
    this.state.approval = this.approval.request;
    this.state.skillStep = 12;
    this.state.phase = 'WAITING_FOR_APPROVAL';
    this.setWorker('action', 'Needs input', 'Draft ready; explicit human approval required');
    this.audit('action.prepare', this.scenario.id, this.state.fields.recommendedAction, 'success', 'prepare');
    const checks = this.state.noHistorical ? ['Engineer-led inspection and measurement only; no approved corrective procedure was found.'] :
      this.scenario.historical.procedure;
    const briefing = this.state.detection ?
      `The records flag high door-closing force on ${this.state.detection.vehicle.id} at ${this.scenario.station}: ${this.state.detection.vehicle.measurement} N against a ${this.state.detection.vehicle.limit} N upper limit. The hinge-alignment/calibration explanation remains a hypothesis. ` +
      `Recommended checks: ${checks.slice(0, 2).join(' ')} Would you like me to create an incident, send an alert to the ${this.scenario.station} dashboard, ` +
      'and save the details for later evaluation? Say "yes" or use the approval button to authorize these three operations. No production changes are included.' :
      `The synthetic records suggest ${this.scenario.probableCause} This is a hypothesis, not a confirmed cause. ` +
      `Recommended checks: ${checks.slice(0, 2).join(' ')} ` +
      'I can draft and route an engineer-review request. Approve request creation only; no calibration, hold or production-release changes will be executed.';
    const spokenBriefing = this.state.detection ?
      `Vehicle ${this.state.detection.vehicle.id} at ${this.scenario.station} measured ${this.state.detection.vehicle.measurement} N against a ${this.state.detection.vehicle.limit} N upper limit. The cause needs engineer validation. ` +
      'Would you like me to create an incident, publish a station dashboard alert, and store the evidence? Say yes or use the approval button.' :
      `A hypothesis from the synthetic records: ${this.scenario.probableCause} ` +
      `Recommended checks: ${checks.slice(0, 2).join(' ')} ` +
      'Approve request creation only; no calibration, hold or production-release changes.';
    const promptId = this.message('assistant', briefing, { kind: 'recommendation', spokenText: spokenBriefing });
    this.armIncidentConfirmation(promptId);
  }
  decide(requestId: string, decision: 'approve' | 'reject', method: 'button' | 'conversation' = 'button') {
    if (this.state.phase !== 'WAITING_FOR_APPROVAL') {
      this.audit('approval.decide', requestId, 'Not at approval boundary', 'denied', 'approval');
      this.emit();
      throw new WorkflowError('Approval is only valid for a pending corrective-action request.');
    }
    const token = decision === 'approve' ? this.approval.approve(requestId) : undefined;
    if (decision === 'reject') {
      this.approval.reject(requestId);
      this.state.phase = 'REJECTED';
      this.message('assistant', 'Request rejected. No action was created. You may review or reopen the proposal explicitly.');
    }
    this.state.approval = this.approval.request;
    this.state.approval!.method = method;
    this.state.incidentConfirmation = undefined;
    this.audit('approval.decide', requestId, `Operator ${decision === 'approve' ? 'approved request creation' : 'rejected request'} via ${method}`, 'success', 'approval');
    this.emit();
    return token;
  }
  async createAction(token: string) {
    if (this.state.phase !== 'WAITING_FOR_APPROVAL' || this.state.approval?.status !== 'approved') {
      this.audit('action.create', this.scenario.id, 'Missing pending approved request', 'denied', 'write');
      this.emit();
      throw new WorkflowError('Explicit human approval is required before action creation.', 403);
    }
    // Lock the workflow before awaiting preparation, preventing concurrent duplicate writes.
    this.state.phase = 'CREATING_ACTION';
    let result: CorrectiveAction;
    try {
      const tasks = this.state.noHistorical ? ['Engineer-led inspection and measurement only; no approved procedure found.'] : await this.tools.prepareCorrectiveAction(this.scenario.id);
      if (this.state.detection) {
        if (!this.incidents) throw new WorkflowError('The local incident database is not configured.', 503);
        this.approval.validate(token);
        const record = this.incidents.createApproved(this.snapshot(), this.currentSkill(), tasks);
        this.approval.consume(token);
        this.state.incident = { id: record.id, href: incidentHref(record.id), stationHref: stationHref(record.detection.station),
          alertId: record.alert.id, station: record.detection.station };
        result = { id: record.id, issueId: this.scenario.id, tasks,
          status: 'Routed for Quality Engineer approval', productionReleaseAuthorized: false };
      } else result = await this.tools.createCorrectiveAction(this.scenario.id, tasks, token);
    } catch (error) {
      if (this.state.phase === 'CREATING_ACTION') this.state.phase = 'WAITING_FOR_APPROVAL';
      this.audit('action.create', this.scenario.id, error instanceof Error ? error.message : 'Action creation denied', 'denied', 'write');
      this.emit();
      throw error;
    }
    this.setWorker('action', 'Working', 'Creating simulated record and routing for engineer approval');
    const start = Date.now();
    await this.wait(this.controller.signal);
    this.state.action = result;
    this.state.phase = 'COMPLETE';
    this.state.skillStep = 14;
    this.audit('action.create', this.scenario.id, `${result.id} routed; production release NOT authorized`, 'success', 'write');
    this.setWorker('action', 'Complete', `${result.id} routed for Quality Engineer approval`, Date.now() - start);
    this.message('assistant', this.state.incident ?
      `Incident ${result.id} created. Sent alert to ${this.state.incident.station} dashboard. ` +
      'The vehicle details, evidence, recommendations and approval were saved in the local database for further evaluation. Open the saved incident using the link on the board. No production changes were authorized. What else would you like me to investigate?' :
      `Corrective action ${result.id} has been prepared and routed to the responsible Quality Engineer for approval. No production release has been authorized automatically.`,
      this.state.incident ? { spokenText: `Incident ${result.id} created. Sent alert to the ${this.state.incident.station} dashboard and saved the evidence. Click the incident for more details. What else would you like me to investigate?` } : {});
    this.emit();
    return result;
  }
}
