import { describe, expect, it } from 'vitest';
import { InvestigationEngine, initialState } from '../server/engine';
import { checklist } from '../shared/domain';
import { scenarios } from '../shared/scenarios';
import { LocalSkillRegistry, MockVisionService } from '../server/services';

async function investigate(engine: InvestigationEngine) {
  for (let i = 0; i < 5; i++) await engine.advance();
}
describe('reviewed skill and checklist', () => {
  it('loads the file-backed pinned procedure and attaches once per agent', () => {
    const registry = new LocalSkillRegistry();
    expect(registry.load('vehicle-quality-investigation').steps).toHaveLength(14);
    registry.attach('vehicle-quality-investigation', 'Quality Live Agent');
    registry.attach('vehicle-quality-investigation', 'Quality Live Agent');
    expect(registry.list()[0].attachedAgents).toEqual(['Quality Live Agent']);
    expect(() => registry.load('missing')).toThrow('not registered');
    expect(() => new LocalSkillRegistry('invalid')).toThrow('14 reviewed steps');
  });
  it('starts with 13 missing checks and tracks approval separately from action completion', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    expect(checklist(initialState()).every(item => !item.complete)).toBe(true);
    await investigate(engine);
    expect(checklist(engine.state).filter(item => item.complete)).toHaveLength(12);
    const token = engine.decide(engine.state.approval!.id, 'approve')!;
    expect(checklist(engine.state).every(item => item.complete)).toBe(true);
    await engine.createAction(token);
    expect(engine.state.action?.productionReleaseAuthorized).toBe(false);
  });
});
describe('investigation state machine', () => {
  it.each([
    ['Q-2048', 'The affected station is number forty-two.', 'Eighteen vehicles are affected.', 18],
    ['Q-3012', 'Paint Booth seven.', 'Thirty-one vehicles.', 31],
    ['Q-2048', 'Station 42.', 'One hundred and eighteen vehicles.', 118],
    ['Q-2048', 'Station forty two.', 'Two thousand three hundred and forty-five vehicles.', 2345],
  ] as const)('accepts transcribed number words for %s intake', (scenarioId, station, scope, count) => {
    const engine = new InvestigationEngine(scenarioId, undefined, 0);
    engine.input('Synthetic component issue.');
    engine.input(station);
    engine.input(scope);
    expect(engine.state.fields.station).toBe(scenarios[scenarioId].station);
    expect(engine.state.fields.reportedCount).toBe(count);
    expect(engine.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
  });
  it.each(['one two vehicles', 'zero vehicles', 'eleven thousand vehicles', 'unknown vehicles'])('rejects ambiguous or invalid spoken scope: %s', scope => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    engine.input('Synthetic component issue.');
    engine.input('Station forty-two.');
    expect(() => engine.input(scope)).toThrow('affected-vehicle count');
    expect(engine.state.phase).toBe('INTAKE');
  });
  it('progressively fills Q-2048 and routes CA-1041 only after human approval', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    const phases: string[] = [];
    engine.subscribe(state => phases.push(state.phase));
    await engine.advance();
    expect(engine.state.fields).toEqual({});
    await engine.advance();
    expect(engine.state.fields.component).toContain('door');
    expect(engine.state.fields.station).toBeUndefined();
    await engine.advance();
    expect(engine.state.fields.station).toBe('Station 42');
    await engine.advance();
    expect(engine.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
    await engine.advance();
    expect(engine.state.phase).toBe('WAITING_FOR_APPROVAL');
    expect(engine.state.action).toBeUndefined();
    expect(engine.state.fields.firstObserved).toBe('14:32');
    expect(engine.state.fields.maintenance).toContain('TC-4412');
    expect(engine.state.fields.historical).toContain('QI-1847');
    expect(engine.state.messages.some(m => m.text.includes('27 minutes'))).toBe(true);
    expect(engine.state.vision?.observations[0].classification).toBe('requires_validation');
    expect(phases).toContain('RETRIEVING_EVIDENCE');
    expect(phases).toContain('CORRELATING_EVIDENCE');
    const token = engine.decide(engine.state.approval!.id, 'approve')!;
    const action = await engine.createAction(token);
    expect(action.id).toBe('CA-1041');
    expect(engine.state.phase).toBe('COMPLETE');
    expect(engine.state.messages.at(-1)?.text).toContain('No production release has been authorized automatically.');
    expect(engine.state.audit.find(e => e.tool === 'skill.load')?.version).toBe('1.0.0');
    expect(engine.state.workers.every(w => w.status === 'Complete')).toBe(true);
    expect(engine.state.audit.find(e => e.tool === 'action.create' && e.result === 'success')?.approval).toBe('approved');
  });
  it('rejects missing, forged, cross-session and replayed approval tokens', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await expect(engine.createAction('')).rejects.toThrow('human approval');
    await investigate(engine);
    await expect(engine.createAction('forged')).rejects.toThrow('human approval');
    const token = engine.decide(engine.state.approval!.id, 'approve')!;
    await expect(engine.createAction('forged')).rejects.toThrow('session-bound');
    const other = new InvestigationEngine('Q-2048', undefined, 0);
    await investigate(other);
    other.decide(other.state.approval!.id, 'approve');
    await expect(other.createAction(token)).rejects.toThrow('session-bound');
    await engine.createAction(token);
    await expect(engine.createAction(token)).rejects.toThrow('human approval');
    expect(engine.state.audit.filter(e => e.result === 'denied').length).toBeGreaterThan(2);
  });
  it('locks concurrent creation so only one request can be routed', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await investigate(engine);
    const token = engine.decide(engine.state.approval!.id, 'approve')!;
    const results = await Promise.allSettled([engine.createAction(token), engine.createAction(token)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(engine.state.phase).toBe('COMPLETE');
    expect(engine.state.audit.filter(e => e.tool === 'action.create' && e.result === 'success')).toHaveLength(1);
  });
  it('does not convert a spoken yes or a guided advance into approval', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await investigate(engine);
    engine.input('yes, approve');
    await expect(engine.advance()).rejects.toThrow('never approves');
    expect(engine.state.approval?.status).toBe('pending');
    expect(engine.state.action).toBeUndefined();
  });
  it('supports rejection and a fresh explicit proposal', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await investigate(engine);
    const originalId = engine.state.approval!.id;
    engine.decide(originalId, 'reject');
    expect(engine.state.phase).toBe('REJECTED');
    await expect(engine.createAction('')).rejects.toThrow();
    await engine.advance();
    expect(engine.state.approval?.id).not.toBe(originalId);
    expect(engine.state.approval?.status).toBe('pending');
  });
  it('blocks cause recommendations on failed production evidence and resumes safely', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    engine.configure({ failProduction: true });
    await investigate(engine);
    expect(engine.state.phase).toBe('FAILED');
    expect(engine.state.fields.probableCause).toBeUndefined();
    expect(engine.state.approval).toBeUndefined();
    const maintenanceCount = engine.state.evidence.filter(e => e.source === 'maintenance').length;
    engine.configure({ failProduction: false });
    await engine.advance();
    expect(engine.state.phase).toBe('WAITING_FOR_APPROVAL');
    expect(engine.state.evidence.filter(e => e.source === 'maintenance')).toHaveLength(maintenanceCount);
  });
  it('discloses no historical match and prepares inspection-only tasks', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    engine.configure({ noHistorical: true });
    await investigate(engine);
    expect(engine.state.fields.historical).toContain('No similar');
    expect(engine.state.fields.recommendedAction).toContain('No approved corrective procedure');
    const token = engine.decide(engine.state.approval!.id, 'approve')!;
    const action = await engine.createAction(token);
    expect(action.tasks).toHaveLength(1);
    expect(action.tasks[0]).toContain('inspection');
    expect(engine.state.fields.historical).not.toContain('QI-1847');
  });
  it('cancels in-flight retrieval without stale updates or action creation', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 15);
    for (let i = 0; i < 4; i++) await engine.advance();
    const pending = engine.advance();
    engine.cancel();
    await pending;
    expect(engine.state.phase).toBe('CANCELLED');
    expect(engine.state.approval).toBeUndefined();
    expect(engine.state.workers.every(w => w.status !== 'Working')).toBe(true);
  });
  it('reset invalidates approvals and preserves reusable skill availability', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await investigate(engine);
    const token = engine.decide(engine.state.approval!.id, 'approve')!;
    engine.reset('Q-3012');
    await expect(engine.createAction(token)).rejects.toThrow();
    expect(engine.state.phase).toBe('IDLE');
    expect(engine.state.agent).toBe('Production Support Assistant');
  });
  it('reuses one skill with different tools and evidence for Q-3012', async () => {
    const registry = new LocalSkillRegistry();
    const engine = new InvestigationEngine('Q-2048', registry, 0);
    await investigate(engine);
    engine.reset('Q-3012');
    await investigate(engine);
    expect(engine.state.fields.component).toBe('Painted exterior panel');
    expect(engine.state.fields.maintenance).toContain('NM-901');
    expect(engine.state.fields.historical).toContain('QI-1772');
    expect(engine.state.fields.probableCause).toContain('nozzle pressure');
    expect(engine.state.fields.probableCause).not.toContain('hinge');
    expect(registry.list()[0].attachedAgents).toEqual(['Quality Live Agent', 'Production Support Assistant']);
    const token = engine.decide(engine.state.approval!.id, 'approve')!;
    expect((await engine.createAction(token)).id).toBe('CA-1042');
  });
  it('fails explicitly for wrong station, invalid scope and conflicting scope', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    engine.start(); engine.input('Closing force issue');
    expect(() => engine.input('Station 99')).toThrow('only for Station 42');
    engine.input('Station 42');
    expect(() => engine.input('many')).toThrow('affected-vehicle count');
    engine.input('20 vehicles');
    await engine.advance();
    expect(engine.state.phase).toBe('FAILED');
    expect(engine.state.error).toContain('conflicts');
    expect(engine.state.fields.probableCause).toBeUndefined();
  });
  it('never fabricates image analysis for an arbitrary uploaded image', async () => {
    const analysis = await new MockVisionService().analyze({ name: 'photo.png', type: 'image/png', size: 100, sample: false }, scenarios['Q-2048']);
    expect(analysis.observations[0].observation).toContain('cannot inspect');
    expect(analysis.observations[0].observation).not.toContain('hinge');
  });
});
