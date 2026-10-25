import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  CorrectiveAction, HistoricalCase, Measurements, PhotoMetadata, Scenario, Skill, StationEvent, VisionAnalysis,
} from '../shared/domain.js';
import type { VisionImage } from '../shared/vision.js';

export interface SkillRegistry {
  list(): Skill[];
  load(name: string, agent?: string): Skill;
  attach(name: string, agent: string, pinned?: Skill): Skill;
}
export class LocalSkillRegistry implements SkillRegistry {
  private skill: Skill;
  constructor(content = readFileSync(resolve('skills', 'vehicle-quality-investigation', 'SKILL.md'), 'utf8')) {
    const steps = [...content.matchAll(/^\d+\.\s+(.+)$/gm)].map(match => match[1]);
    const version = content.match(/version:\s*"([^"]+)"/)?.[1];
    if (steps.length !== 14 || version !== '1.0.0') throw new Error('Skill must contain 14 reviewed steps and pinned version 1.0.0.');
    this.skill = { name: 'vehicle-quality-investigation', description: 'Evidence-led manufacturing quality investigation',
      version, source: 'Synthetic reviewed Skill Recorder export example', content, steps,
      approvals: ['Create or route a corrective action', 'Change calibration', 'Place or remove a hold', 'Release production', 'Close an issue'],
      attachedAgents: [] };
  }
  list(): Skill[] { return [structuredClone(this.skill)]; }
  load(name: string): Skill {
    if (name !== this.skill.name) throw new Error(`Skill not registered: ${name}`);
    return structuredClone(this.skill);
  }
  attach(name: string, agent: string): Skill {
    this.load(name);
    if (!this.skill.attachedAgents.includes(agent)) this.skill.attachedAgents.push(agent);
    return this.load(name);
  }
}
export interface QualityIssueTool {
  getIssue(issueId: string): Promise<{ id: string; count: number }>;
  updateInvestigationNotes(issueId: string, notes: string): Promise<void>;
}
export interface ProductionDataTool {
  getMeasurements(stationId: string, component: string): Promise<Measurements>;
  getAffectedVehicleCount(issueId: string): Promise<number>;
}
export interface MaintenanceTool {
  getRecentStationEvents(stationId: string): Promise<StationEvent[]>;
  getCalibrationEvent(eventId: string): Promise<StationEvent>;
}
export interface EngineeringKnowledgeTool {
  searchSimilarCases(component: string, symptom: string): Promise<HistoricalCase[]>;
  getApprovedProcedure(caseId: string): Promise<string[]>;
}
export interface CorrectiveActionTool {
  prepareCorrectiveAction(issueId: string): Promise<string[]>;
  createCorrectiveAction(issueId: string, tasks: string[], approvalToken: string): Promise<CorrectiveAction>;
  getCorrectiveAction(actionId: string): Promise<CorrectiveAction>;
}
export interface ApprovalService {
  requestApproval(summary: string): string;
  approve(requestId: string): string;
  reject(requestId: string): void;
  consume(token: string): void;
}
export interface VisionService {
  analyze(photo: PhotoMetadata, scenario: Scenario, image?: VisionImage, signal?: AbortSignal): Promise<VisionAnalysis>;
}
export class MockVisionService implements VisionService {
  async analyze(photo: PhotoMetadata, scenario: Scenario): Promise<VisionAnalysis> {
    return {
      source: 'synthetic',
      observations: [{ region: photo.sample ? scenario.region : 'uploaded image',
        observation: photo.sample ? `Reference image displayed. Dataset hypothesis: ${scenario.visual} No pixels were analyzed.` :
          'Image received. Guided mode cannot inspect arbitrary uploaded pixels; physical inspection is required.',
        classification: 'requires_validation',
        limitations: 'The reference image is not vehicle-specific evidence. Guided annotations come from synthetic records, not pixel analysis or model output.' }],
      recommendedNextChecks: ['Compare measurements against specification', 'Verify the approved configuration', 'Inspect additional affected vehicles'],
    };
  }
}
export class MockTools implements QualityIssueTool, ProductionDataTool, MaintenanceTool, EngineeringKnowledgeTool, CorrectiveActionTool {
  private action?: CorrectiveAction;
  constructor(private scenario: Scenario, private approval: ApprovalService) {}
  private requireIssue(id: string) { if (id !== this.scenario.id) throw new Error('Unknown synthetic issue.'); }
  async getIssue(issueId: string) { this.requireIssue(issueId); return { id: issueId, count: this.scenario.count }; }
  async updateInvestigationNotes(issueId: string, _notes: string) { this.requireIssue(issueId); }
  async getMeasurements(stationId: string, _component: string) {
    if (stationId !== this.scenario.station) throw new Error('No measurements for that synthetic station.');
    return structuredClone(this.scenario.measurements);
  }
  async getAffectedVehicleCount(issueId: string) { this.requireIssue(issueId); return this.scenario.count; }
  async getRecentStationEvents(stationId: string) {
    if (stationId !== this.scenario.station) throw new Error('Unknown synthetic station.');
    return [structuredClone(this.scenario.event)];
  }
  async getCalibrationEvent(eventId: string) {
    if (eventId !== this.scenario.event.id) throw new Error('Unknown synthetic event.');
    return structuredClone(this.scenario.event);
  }
  async searchSimilarCases(_component: string, _symptom: string) { return [structuredClone(this.scenario.historical)]; }
  async getApprovedProcedure(caseId: string) {
    if (caseId !== this.scenario.historical.id) throw new Error('No approved procedure for this case.');
    return [...this.scenario.historical.procedure];
  }
  async prepareCorrectiveAction(issueId: string) { this.requireIssue(issueId); return [...this.scenario.historical.procedure]; }
  async createCorrectiveAction(issueId: string, tasks: string[], approvalToken: string) {
    this.requireIssue(issueId);
    this.approval.consume(approvalToken);
    this.action = { id: this.scenario.actionId, issueId, tasks: [...tasks],
      status: 'Routed for Quality Engineer approval', productionReleaseAuthorized: false };
    return structuredClone(this.action);
  }
  async getCorrectiveAction(actionId: string) {
    if (!this.action || this.action.id !== actionId) throw new Error('Corrective action not found.');
    return structuredClone(this.action);
  }
}
