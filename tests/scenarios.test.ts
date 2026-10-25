import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { InvestigationEngine } from '../server/engine';
import { createApp } from '../server/app';
import type { ConversationService } from '../server/conversation';
import type { ConversationTurn } from '../shared/conversation';
import { scenarioIds, type Scenario } from '../shared/domain';
import { compatibleComponent, scenarioForStation, scenarios } from '../shared/scenarios';

function reported(id: Scenario['id']): ConversationTurn['fields'] {
  const s = scenarios[id];
  return { issue: s.symptom, component: s.component, station: s.station, reportedCount: s.count,
    vehicle: null, plant: null, line: null };
}
function model(fields: ConversationTurn['fields']): ConversationService {
  return { status: () => ({ configured: true, model: 'synthetic-test' }), prepare: async () => {},
    respond: async () => ({ fields, reply: 'Could you upload a component photo?' }) };
}
async function guided(engine: InvestigationEngine) {
  for (let i = 0; i < 5; i++) await engine.advance();
}
describe('synthetic case catalog and case-bound evidence', () => {
  it.each(scenarioIds)('runs %s with its own sample, measurements, references and approved action', async id => {
    const s = scenarios[id], engine = new InvestigationEngine(id, undefined, 0);
    await guided(engine);
    expect(engine.state.phase).toBe('WAITING_FOR_APPROVAL');
    expect(engine.state.photo?.name).toBe(`reference-${s.sample.split('/').at(-1)}`);
    expect(s.sample).toMatch(/^\/reference-images\/.+\.(png|jpg)$/);
    const image = readFileSync(join(process.cwd(), 'public', ...s.sample.split('/')));
    expect(image.subarray(0, s.sample.endsWith('.jpg') ? 3 : 8)).toEqual(
      Buffer.from(s.sample.endsWith('.jpg') ? [0xff, 0xd8, 0xff] : [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(engine.state.photo?.type).toBe(s.sample.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
    expect(engine.state.fields.visual).toContain('No pixels were analyzed');
    expect(engine.state.measurements).toEqual(s.measurements);
    expect(engine.state.fields.maintenance).toContain(s.event.id);
    expect(engine.state.fields.historical).toContain(s.historical.id);
    expect(engine.state.fields.probableCause).toBe(s.probableCause);
    expect(engine.state.evidence.filter(item => item.type === 'Retrieved').map(item => item.reference))
      .toEqual(expect.arrayContaining([id, `PROD-${id}`, s.event.id, s.historical.id]));
    await expect(engine.createAction('')).rejects.toThrow('human approval');
    const token = engine.decide(engine.state.approval!.id, 'approve')!;
    await engine.createAction(token);
    expect(engine.state.action).toMatchObject({ id: s.actionId, issueId: id,
      tasks: s.historical.procedure, productionReleaseAuthorized: false });
  });
  it('matches exact known stations, not guesses, compound stations or components alone', () => {
    expect(scenarioForStation('station-43')?.id).toBe('Q-2049');
    expect(scenarioForStation('58')?.id).toBe('Q-2050');
    expect(scenarioForStation('Paint Booth 7')?.id).toBe('Q-3012');
    for (const station of ['Station 99', 'Station 43 or 58', 'maybe station 43', 'Station 7', 'tailgate']) {
      expect(scenarioForStation(station)).toBeUndefined();
    }
    expect(compatibleComponent('Front-left door', scenarios['Q-2049'])).toBe(true);
    expect(compatibleComponent('Upper hinge', scenarios['Q-2049'])).toBe(false);
    expect(compatibleComponent('Door striker', scenarios['Q-2048'])).toBe(false);
    expect(compatibleComponent('rear hatch gap', scenarios['Q-2050'])).toBe(true);
    expect(compatibleComponent('front-right door', scenarios['Q-2050'])).toBe(false);
  });
  it.each(scenarioIds)('accepts %s through the reset API and rejects unknown IDs', async id => {
    const agent = request.agent(createApp({ latency: 0 }));
    await agent.post('/api/session').send({}).expect(200);
    const response = await agent.post('/api/reset').send({ scenarioId: id }).expect(200);
    expect(response.body.scenarioId).toBe(id);
    expect(response.body.fields).toEqual({});
    await agent.post('/api/reset').send({ scenarioId: 'Q-unknown' }).expect(400);
  });
});
describe('safe conversational dataset selection', () => {
  it('keeps out-of-order facts without treating default dataset context as a reported answer', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await engine.converse('Nine vehicles with a wide tailgate gap; station unknown.', model({ ...reported('Q-2050'), station: null }));
    expect(engine.state.phase).toBe('INTAKE');
    expect(engine.state.scopeNote).toBeUndefined();
    expect(engine.state.fields.station).toBeUndefined();
    expect(engine.state.fields.vehicle).toBeUndefined();
    await engine.converse('Station 58.', model(reported('Q-2050')));
    expect(engine.state.scenarioId).toBe('Q-2050');
    expect(engine.state.fields.vehicle).toBe(scenarios['Q-2050'].vehicle);
    expect(engine.state.reportedContext?.vehicle).toBeUndefined();
    expect(engine.state.audit.find(item => item.tool === 'workflow.selectScenario')).toMatchObject({
      inputSummary: 'Station 58', result: 'success',
    });
  });
  it('accepts corrections before evidence and does not retain previous dataset context', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await engine.converse('Door issue at 42.', model(reported('Q-2048')));
    await engine.converse('Correction: tailgate at 58, nine vehicles.', model(reported('Q-2050')));
    expect(engine.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
    expect(engine.state.fields.vehicle).toBe('SUV Demo Vehicle');
    expect(engine.state.fields.plant).toBe('Sindelfingen Demo Plant');
    expect(engine.state.fields.line).toBe('Closure Assembly Line C');
    expect(engine.state.fields.issue).toBe(scenarios['Q-2050'].symptom);
    expect(engine.state.evidence).toEqual([]);
    await engine.advance();
    expect(engine.state.fields.maintenance).toContain('TF-5803');
    expect(JSON.stringify(engine.state.evidence)).not.toContain('TC-4412');
  });
  it('keeps explicit operator context and count conflicts instead of substituting catalog values', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    const fields = { ...reported('Q-2049'), reportedCount: 18, vehicle: 'Operator-reported demo vehicle' };
    await engine.converse('Eighteen vehicles at 43.', model(fields));
    expect(engine.state.scenarioId).toBe('Q-2049');
    expect(engine.state.phase).toBe('INTAKE');
    expect(engine.state.fields.reportedCount).toBe(18);
    expect(engine.state.scopeNote).toContain('synthetic records contain 12');
    expect(engine.state.approval).toBeUndefined();
    await engine.converse('Twelve, not eighteen.', model({ ...fields, reportedCount: 12 }));
    expect(engine.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
    expect(engine.state.fields.vehicle).toBe('Operator-reported demo vehicle');
  });
  it('clears unrelated photo evidence when scope is corrected before retrieval', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await engine.converse('Door issue at 42.', model(reported('Q-2048')));
    await engine.collectPhoto({ name: 'unrelated.jpg', size: 4, type: 'image/jpeg', sample: false }, {
      image: { consent: true, dataUrl: 'data:image/jpeg;base64,/9j/2Q==' },
      service: { analyze: async () => ({ relevance: 'unrelated', source: 'azure-model', summary: 'Different subject.',
        observations: [{ region: 'image', observation: 'No door is visible.', classification: 'requires_validation', limitations: 'Unrelated subject.' }],
        recommendedNextChecks: ['Show the component.'] }) },
    });
    expect(engine.state.evidence).toHaveLength(1);
    await engine.converse('Actually Station 58, nine vehicles with a wide tailgate gap.', model(reported('Q-2050')));
    expect(engine.state.scenarioId).toBe('Q-2050');
    expect(engine.state.photo).toBeUndefined();
    expect(engine.state.vision).toBeUndefined();
    expect(engine.state.fields.visual).toBeUndefined();
    expect(engine.state.evidence).toEqual([]);
    expect(engine.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
  });
  it('locks collected evidence and approvals to a case, rejecting transfers after reset', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await guided(engine);
    const before = engine.snapshot();
    await engine.converse('Switch to Station 43.', model(reported('Q-2049')));
    expect(engine.state.scenarioId).toBe('Q-2048');
    expect(engine.state.fields).toEqual(before.fields);
    expect(engine.state.evidence).toEqual(before.evidence);
    expect(engine.state.approval).toEqual(before.approval);
    expect(engine.state.messages.at(-1)?.text).toContain('locked this case');
    const oldId = engine.state.approval!.id;
    const oldToken = engine.decide(oldId, 'approve')!;
    engine.reset('Q-2049');
    expect(engine.state.approval).toBeUndefined();
    expect(engine.state.evidence).toEqual([]);
    expect(() => engine.decide(oldId, 'approve')).toThrow();
    await guided(engine);
    const newToken = engine.decide(engine.state.approval!.id, 'approve')!;
    await expect(engine.createAction(oldToken)).rejects.toThrow('session-bound');
    await engine.createAction(newToken);
    expect(engine.state.action?.id).toBe('CA-1043');
  });
});
