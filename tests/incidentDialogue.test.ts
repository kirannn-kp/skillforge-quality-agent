import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { InvestigationEngine } from '../server/engine';
import { IncidentStore } from '../server/incidentStore';
import { createApp } from '../server/app';
import type { ConversationService } from '../server/conversation';
import type { IncidentConfirmationInput } from '../shared/conversation';

const stores: IncidentStore[] = [];
function setup() {
  const store = new IncidentStore(); stores.push(store);
  const engine = new InvestigationEngine('Q-2048', undefined, 0, store);
  const service: ConversationService = {
    status: () => ({ configured: true, model: 'synthetic-dialogue-test' }), prepare: async () => {},
    respond: vi.fn(async () => ({ reply: 'The cause needs physical verification; no new action was executed.',
      fields: { issue: null, component: null, station: null, reportedCount: null, vehicle: null, plant: null, line: null } })),
  };
  return { engine, store, service };
}
function context(engine: InvestigationEngine): IncidentConfirmationInput {
  const prompt = engine.state.incidentConfirmation!;
  return { requestId: prompt.requestId, promptId: prompt.promptId };
}
afterEach(() => { stores.splice(0).forEach(store => store.close()); });

describe('server-bound human confirmation for mock incidents only', () => {
  it('does not replace a reported station with the default fleet detection when intake already has facts', async () => {
    const { engine, store, service } = setup();
    engine.start();
    engine.state.fields.station = 'Station 43';
    vi.mocked(service.respond).mockResolvedValueOnce({ reply: 'What was observed at Station 43?',
      fields: { issue: null, component: null, station: 'Station 43', reportedCount: null, vehicle: null, plant: null, line: null } });
    await engine.converse('Tell me your investigation', service);
    expect(engine.state.detection).toBeUndefined();
    expect(engine.state.fields.station).toBe('Station 43');
    expect(store.list()).toEqual([]);
  });
  it('starts a record investigation from a spoken-style findings request without repeating manual intake', async () => {
    const { engine, store, service } = setup();
    engine.start();
    await engine.converse('Can you tell me your investigation?', service);
    expect(engine.state.phase).toBe('WAITING_FOR_APPROVAL');
    expect(engine.state.messages.at(-1)?.text).toContain('62 N against a 50 N');
    expect(engine.state.messages.at(-1)?.spokenText).toContain('Say yes');
    expect(engine.state.incidentConfirmation?.requestId).toBe(engine.state.approval?.id);
    expect(service.respond).not.toHaveBeenCalled();
    expect(store.list()).toEqual([]);
  });
  it('answers an incident request with a short confirmation instead of repeating the investigation', async () => {
    const { engine, store, service } = setup();
    await engine.converse('What did you find?', service);
    const previous = context(engine);
    await engine.converse('Can you create an incident, alert Station 42 and save these findings?', service);
    const reply = engine.state.messages.at(-1)!;
    expect(reply.kind).toBe('incident-confirmation');
    expect(reply.text).toContain('Station 42');
    expect(reply.text).toContain('Shall I go ahead?');
    expect(reply.text).not.toContain('62 N');
    expect(reply.text).not.toContain('Possible hinge/tooling deviation');
    expect(context(engine).promptId).not.toBe(previous.promptId);
    expect(service.respond).not.toHaveBeenCalled();
    expect(store.list()).toEqual([]);
    await engine.converse('Yes', service, context(engine));
    expect(store.list()).toHaveLength(1);
    expect(store.alerts('Station 42')).toHaveLength(1);
  });
  it.each([
    'Yes, please create the incident and send the alert.',
    'Yes, create an incident and send an alert.',
    'Yes, please go ahead and create the incident.',
    'Please go ahead and create the incident and save these findings.',
    'Yes, create the incident, publish the dashboard alert and save the evidence.',
  ])('accepts natural confirmation only with a fresh bound prompt: %s', async text => {
    const { engine, store, service } = setup();
    await engine.converse('What did you find?', service);
    await engine.converse(text, service, context(engine));
    expect(engine.state.phase).toBe('COMPLETE');
    expect(store.list()).toHaveLength(1);
    expect(store.alerts('Station 42')).toHaveLength(1);
    expect(service.respond).not.toHaveBeenCalled();
  });
  it('rejects natural confirmation captured for an old prompt, then accepts a fresh yes without a summary loop', async () => {
    const { engine, store, service } = setup();
    await engine.converse('What did you find?', service);
    const old = context(engine);
    await engine.converse('Can you create an incident and send the alert?', service);
    await expect(engine.converse('Yes, please create the incident and send the alert.', service, old)).rejects.toThrow('not bound');
    expect(store.list()).toEqual([]);
    expect(engine.state.messages.at(-1)?.kind).toBe('incident-confirmation');
    expect(engine.state.messages.at(-1)?.text).not.toContain('62 N');
    await engine.converse('Yes', service, context(engine));
    await engine.converse('Yes', service);
    expect(store.list()).toHaveLength(1);
    expect(store.alerts('Station 42')).toHaveLength(1);
  });
  it('accepts a fresh bound yes, persists human confirmation provenance, and continues read-only after success', async () => {
    const { engine, store, service } = setup();
    await engine.converse('What did you find?', service);
    await engine.converse('Tell me your findings.', service);
    expect(engine.state.messages.at(-1)?.text).toContain('18 vehicle records');
    await engine.converse('Yes, please.', service, context(engine));
    expect(engine.state.phase).toBe('COMPLETE');
    expect(engine.state.messages.at(-1)?.spokenText).toContain('What else would you like me to investigate?');
    expect(engine.state.incidentConfirmation).toBeUndefined();
    const saved = store.get(engine.state.incident!.id);
    expect(saved.approval.method).toBe('conversation');
    expect(saved.productionReleaseAuthorized).toBe(false);
    expect(saved.audit.some(event => event.tool === 'approval.decide' && event.outputSummary.includes('via conversation'))).toBe(true);
    await engine.converse('Yes', service);
    await engine.converse('Tell me your investigation', service);
    await engine.converse('Is the cause confirmed?', service);
    expect(service.respond).toHaveBeenCalledOnce();
    expect(engine.state.phase).toBe('COMPLETE');
    expect(store.list()).toHaveLength(1);
    expect(store.alerts('Station 42')).toHaveLength(1);
    const next = new InvestigationEngine('Q-2048', undefined, 0, store);
    await next.converse('What did you find?', service);
    expect(next.state.detection?.vehicle.id).toBe('DEMO-00428');
    expect(store.list()).toHaveLength(1);
  });
  it('rejects missing, stale, expired and cross-session confirmation contexts without writing', async () => {
    const { engine, store, service } = setup();
    await engine.converse('What did you find?', service);
    await expect(engine.converse('Yes', service)).rejects.toThrow('not bound');
    const old = context(engine);
    await engine.converse('Tell me your findings', service);
    await expect(engine.converse('Yes', service, old)).rejects.toThrow('not bound');
    const expired = context(engine);
    engine.state.incidentConfirmation!.expiresAt = Date.now() - 1;
    await expect(engine.converse('Yes', service, expired)).rejects.toThrow('not bound');
    await expect(engine.converse('Yes', service, { requestId: randomUUID(), promptId: randomUUID() })).rejects.toThrow('not bound');
    const other = new InvestigationEngine('Q-2048', undefined, 0, store);
    await other.investigateDetection(store.detection('DEMO-00428'));
    await expect(other.converse('Yes', service, context(engine))).rejects.toThrow('not bound');
    expect(store.list()).toEqual([]);
    expect(store.alerts('Station 42')).toEqual([]);
    expect(engine.state.audit.filter(event => event.result === 'denied').length).toBeGreaterThanOrEqual(4);
  });
  it('does not treat qualified, quoted or interrogative yes text as approval and invalidates context after unrelated dialogue', async () => {
    const { engine, store, service } = setup();
    await engine.converse('What did you find?', service);
    for (const text of ['Yes, but do not send an alert.', 'Should I say yes?', 'The image says "yes"', 'Yes, release production too.',
      'Yes, please create the incident but do not send the alert.', 'Yes, create the incident and release production.',
      'Please create the incident?', 'Yes, create the incident and alert Station 43.']) {
      await engine.converse(text, service, engine.state.incidentConfirmation ? context(engine) : undefined);
      expect(store.list()).toHaveLength(0);
      expect(engine.state.approval?.status).toBe('pending');
    }
    await engine.converse('Tell me your findings', service);
    const previous = context(engine);
    await engine.converse('Is the image a confirmed diagnosis?', service);
    expect(engine.state.incidentConfirmation).toBeUndefined();
    await expect(engine.converse('Yes', service, previous)).rejects.toThrow('not bound');
    expect(store.list()).toEqual([]);
  });
  it('records a bound no without writes and rejects confirmation after cancellation/reset', async () => {
    const { engine, store, service } = setup();
    await engine.converse('What did you find?', service);
    await engine.converse('No, thanks.', service, context(engine));
    expect(engine.state.phase).toBe('REJECTED');
    expect(engine.state.approval?.method).toBe('conversation');
    engine.reset();
    await engine.converse('What did you find?', service);
    const previous = context(engine);
    engine.cancel();
    await expect(engine.converse('Yes', service, previous)).rejects.toThrow('closed');
    engine.reset();
    await engine.converse('Yes', service, previous);
    expect(engine.state.approval).toBeUndefined();
    expect(store.list()).toEqual([]);
  });
  it('requires fresh human approval after a failed conversational write and prevents concurrent duplicate yes turns', async () => {
    const { engine, store, service } = setup();
    await engine.converse('What did you find?', service);
    const previous = context(engine);
    vi.spyOn(store, 'createApproved').mockImplementationOnce(() => { throw new Error('Synthetic database failure'); });
    await expect(engine.converse('Yes', service, previous)).rejects.toThrow('Synthetic database failure');
    expect(engine.state.approval?.status).toBe('pending');
    expect(context(engine).requestId).not.toBe(previous.requestId);
    expect(store.list()).toEqual([]);
    const current = context(engine);
    const results = await Promise.allSettled([engine.converse('Yes', service, current), engine.converse('Yes', service, current)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(store.list()).toHaveLength(1);
    expect(store.alerts('Station 42')).toHaveLength(1);
  });
  it('does not extend verbal approval to ordinary corrective actions or allow model-generated approval', async () => {
    const { engine, store, service } = setup();
    for (let i = 0; i < 5; i++) await engine.advance();
    expect(engine.state.incidentConfirmation).toBeUndefined();
    await engine.converse('Yes, please.', service, { requestId: engine.state.approval!.id, promptId: randomUUID() });
    expect(engine.state.approval?.status).toBe('pending');
    expect(engine.state.action).toBeUndefined();
    expect(store.list()).toEqual([]);
  });
  it('enforces confirmation context at the REST boundary and accepts explicit bound human text without using a model fallback', async () => {
    const { store } = setup();
    const agent = request.agent(createApp({ latency: 0, incidentStore: store }));
    await agent.post('/api/session').send({});
    const response = await agent.post('/api/conversation').send({ text: 'Tell me your investigation' }).expect(200);
    await agent.post('/api/conversation').send({ text: 'Yes' }).expect(409);
    const refreshed = (await agent.get('/api/state')).body.incidentConfirmation;
    await agent.post('/api/conversation').send({ text: 'Yes', confirmation: {
      requestId: refreshed.requestId, promptId: refreshed.promptId, executeProduction: true,
    } }).expect(400);
    const result = await agent.post('/api/conversation').send({ text: 'Yes', confirmation: {
      requestId: refreshed.requestId, promptId: refreshed.promptId,
    } }).expect(200);
    expect(result.body.phase).toBe('COMPLETE');
    expect(response.body.incidentConfirmation.requestId).not.toBeUndefined();
    expect((await agent.get(`/api/incidents/${result.body.incident.id}`)).body.approval.method).toBe('conversation');
  });
});
