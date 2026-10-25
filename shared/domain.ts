import type { ConversationTiming, IncidentConfirmationInput } from './conversation.js';
import type { FleetDetection, IncidentReceipt } from './incidents.js';

export type Phase = 'IDLE' | 'INTAKE' | 'COLLECTING_VISUAL_EVIDENCE' | 'ANALYZING_VISUAL_EVIDENCE' |
  'LOADING_SKILL' | 'RETRIEVING_EVIDENCE' | 'CORRELATING_EVIDENCE' | 'WAITING_FOR_APPROVAL' |
  'CREATING_ACTION' | 'COMPLETE' | 'FAILED' | 'CANCELLED' | 'REJECTED';
export type WorkerId = 'quality' | 'vision' | 'production' | 'maintenance' | 'knowledge' | 'action';
export type WorkerStatus = 'Idle' | 'Working' | 'Complete' | 'Needs input' | 'Failed';
export interface Worker { id: WorkerId; name: string; status: WorkerStatus; detail: string; durationMs?: number }
export interface Message {
  id: string; role: 'operator' | 'assistant' | 'system'; text: string; at: string;
  kind?: 'photo-observation' | 'recommendation' | 'incident-confirmation'; spokenText?: string;
}
export interface Evidence {
  id: string; source: string; at: string; observation: string;
  type: 'Observed' | 'Retrieved' | 'Correlated' | 'Inferred' | 'Requires validation';
  reference: string;
}
export interface VisionAnalysis {
  observations: { region: string; observation: string; classification: 'requires_validation'; limitations: string }[];
  recommendedNextChecks: string[];
  relevance?: 'relevant' | 'unclear' | 'unrelated';
  summary?: string;
  source?: 'azure-model' | 'synthetic';
  model?: string;
  durationMs?: number;
}
export interface PhotoMetadata { name: string; size: number; type: string; sample: boolean }
export const maxVisionImageBytes = 1024 * 1024;
export interface Measurements { baseline: number; limit: number; limitDirection: 'upper' | 'lower'; unit: string; values: number[]; times: string[]; firstObserved: string; observation: string }
export interface StationEvent { id: string; at: string; description: string }
export interface HistoricalCase { id: string; description: string; procedure: string[] }
export const scenarioIds = ['Q-2048', 'Q-3012', 'Q-2049', 'Q-2050'] as const;
export interface Scenario {
  id: typeof scenarioIds[number]; agent: string; vehicle: string; plant: string; line: string;
  componentType: 'door-hinge' | 'door-latch' | 'paint' | 'tailgate';
  station: string; component: string; symptom: string; count: number;
  firstObserved: string; event: StationEvent; historical: HistoricalCase;
  measurements: Measurements; visual: string; region: string; probableCause: string;
  action: string; actionId: string; sample: string;
}
export interface InvestigationFields {
  vehicle?: string; plant?: string; line?: string; station?: string; component?: string;
  issue?: string; reportedCount?: number; count?: number; firstObserved?: string; severity?: string;
  visual?: string; production?: string; maintenance?: string; historical?: string;
  probableCause?: string; recommendedAction?: string;
}
export interface AuditEvent {
  id: string; at: string; agent: string; skill: string; version: string; tool: string;
  inputSummary: string; outputSummary: string; source: string; category: string;
  approval: string; result: 'success' | 'denied' | 'failed'; correlationId: string;
}
export interface ApprovalRequest { id: string; summary: string; status: 'pending' | 'approved' | 'rejected'; approvedAt?: string; method?: 'button' | 'conversation' }
export interface CorrectiveAction {
  id: string; issueId: string; tasks: string[]; status: 'Routed for Quality Engineer approval';
  productionReleaseAuthorized: false;
}
export interface Skill {
  name: string; description: string; version: string; source: string; content: string;
  steps: string[]; approvals: string[]; attachedAgents: string[];
  guidance?: string;
  provenance?: { publicationId: string; sha256: string; reviewedBy: string; reviewedAt: string;
    source: 'recorder-export' | 'manual-guidance'; recordingReference: string };
}
export interface InvestigationState {
  correlationId: string; scenarioId: Scenario['id']; agent: string; phase: Phase; intakeStep: number;
  fields: InvestigationFields; messages: Message[]; workers: Worker[]; evidence: Evidence[];
  audit: AuditEvent[]; skillActive: boolean; skillStep: number; skillVersion: string;
  photo?: PhotoMetadata; vision?: VisionAnalysis; measurements?: Measurements;
  approval?: ApprovalRequest; action?: CorrectiveAction; error?: string;
  failProduction: boolean; noHistorical: boolean; speed: number;
  conversation?: ConversationTiming;
  scopeNote?: string;
  reportedContext?: Pick<InvestigationFields, 'vehicle' | 'plant' | 'line'>;
  skillReference?: Pick<Skill, 'name' | 'version' | 'source' | 'provenance'>;
  detection?: FleetDetection;
  incident?: IncidentReceipt;
  incidentConfirmation?: IncidentConfirmationInput & { expiresAt: number };
}
export interface ChecklistItem { label: string; complete: boolean }
export function checklist(s: InvestigationState): ChecklistItem[] {
  const f = s.fields;
  return [
    ['Vehicle / model identified', !!f.vehicle], ['Plant identified', !!f.plant],
    ['Station identified', !!f.station], ['Component identified', !!f.component],
    ['Issue captured', !!f.issue], ['Scope determined', f.count !== undefined],
    ['Visual evidence collected', !!s.vision && (s.vision.source !== 'azure-model' || s.vision.relevance === 'relevant')], ['Production measurements checked', !!f.production],
    ['Maintenance checked', !!f.maintenance], ['Historical search completed', !!f.historical],
    ['Probable cause documented', !!f.probableCause], ['Corrective action prepared', !!f.recommendedAction],
    ['Human approval received', s.approval?.status === 'approved'],
  ].map(([label, complete]) => ({ label: String(label), complete: Boolean(complete) }));
}
export function nextQuestion(s: InvestigationState): string {
  if (s.scopeNote) return s.scopeNote;
  if (s.phase === 'IDLE') return 'Start an investigation to begin structured intake.';
  if (s.phase === 'INTAKE') return s.intakeStep === 1 ? 'Which production station is affected?' :
    s.intakeStep === 2 ? 'How many vehicles are affected?' : 'What have you observed?';
  if (s.phase === 'COLLECTING_VISUAL_EVIDENCE') return 'Upload a component photo or use the synthetic sample.';
  if (s.phase === 'WAITING_FOR_APPROVAL') return 'Review the proposed request. Explicit human approval is required.';
  if (s.phase === 'FAILED') return 'Resolve the missing evidence and retry. No cause will be proposed yet.';
  if (s.phase === 'COMPLETE') return 'Request routed. Engineer approval and production release remain separate.';
  if (s.phase === 'CANCELLED') return 'Investigation cancelled. Reset to start again.';
  if (s.phase === 'REJECTED') return 'Action rejected. Review details or explicitly reopen the proposal.';
  return 'Evidence collection is running; you can continue taking notes.';
}
export const busyPhases: Phase[] = ['ANALYZING_VISUAL_EVIDENCE', 'LOADING_SKILL', 'RETRIEVING_EVIDENCE', 'CORRELATING_EVIDENCE', 'CREATING_ACTION'];
