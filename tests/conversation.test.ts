import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AzureConversationService, conversationFromEnvironment, type ConversationService } from '../server/conversation';
import { InvestigationEngine } from '../server/engine';
import { createApp } from '../server/app';
import { conversationTurnSchema, type ConversationTurn } from '../shared/conversation';
import { scenarios } from '../shared/scenarios';
import { scenarioIds } from '../shared/domain';

const empty: ConversationTurn['fields'] = {
  issue: null, component: null, station: null, reportedCount: null, vehicle: null, plant: null, line: null,
};
const scope: ConversationTurn['fields'] = {
  ...empty, issue: 'High door closing force', component: 'Front-left door', station: 'Station 42', reportedCount: 18,
};
function service(fields: ConversationTurn['fields'] = empty, reply = 'I am listening. What have you observed?'): ConversationService {
  return { status: () => ({ configured: true, model: 'synthetic-model' }),
    prepare: async () => {},
    respond: vi.fn(async () => ({ fields, reply })) };
}
const settings = { endpoint: 'https://synthetic.openai.azure.com', deployment: 'test-model', apiVersion: '2025-01-01-preview' };
const credential = { getToken: vi.fn(async () => ({ token: 'synthetic-token-only', expiresOnTimestamp: Date.now() + 3600000 })) };
const modelResponse = (turn: unknown, finishReason = 'stop') =>
  Response.json({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(turn) } }] });

describe('conversational workflow with synthetic model responses', () => {
  it('handles a greeting or microphone check without making it the issue', async () => {
    const engine = new InvestigationEngine();
    await engine.converse('Can you hear me?', service());
    expect(engine.state.fields.issue).toBeUndefined();
    expect(engine.state.intakeStep).toBe(0);
    expect(engine.state.messages.at(-1)?.text).toContain('listening');
  });
  it.each(scenarioIds)('captures several out-of-order facts and selects the matching dataset for %s', async id => {
    const s = scenarios[id], engine = new InvestigationEngine();
    await engine.converse('All details in one answer.', service({ ...empty,
      issue: s.symptom, component: s.component, station: s.station, reportedCount: s.count }, 'Could you show me a photo?'));
    expect(engine.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
    expect(engine.state.fields.station).toBe(s.station);
    expect(engine.state.scenarioId).toBe(id);
    expect(engine.state.agent).toBe(s.agent);
    expect(engine.state.fields.reportedCount).toBe(s.count);
    expect(engine.state.conversation).toEqual({ model: 'synthetic-model', durationMs: expect.any(Number) });
    expect(engine.state.messages.filter(m => m.role === 'operator')).toHaveLength(1);
    expect(engine.state.approval).toBeUndefined();
  });
  it('records unsupported stations as unverified and accepts a later correction without substituting data', async () => {
    const engine = new InvestigationEngine();
    await engine.converse('Station 99.', service({ ...scope, station: 'Station 99' }));
    expect(engine.state.phase).toBe('INTAKE');
    expect(engine.state.fields.station).toBe('Station 99');
    expect(engine.state.scopeNote).toContain('Available synthetic records');
    expect(engine.state.messages.at(-1)?.text).toContain('unverified');
    await expect(engine.collectPhoto({ name: 'test.png', size: 1, type: 'image/png', sample: false })).rejects.toThrow('not currently requested');
    await engine.converse('Actually, Station 42.', service(scope));
    expect(engine.state.scopeNote).toBeUndefined();
    expect(engine.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
  });
  it('accepts unknown or retracted fields and asks again rather than keeping stale confirmation', async () => {
    const engine = new InvestigationEngine();
    await engine.converse('Station 42, eighteen vehicles with a stiff door.', service(scope));
    await engine.converse("Actually, I don't know the station.", service({ ...scope, station: null }));
    expect(engine.state.fields.station).toBeUndefined();
    expect(engine.state.phase).toBe('INTAKE');
    expect(engine.state.intakeStep).toBe(1);
  });
  it('does not replace reported counts or investigate an incompatible component', async () => {
    const engine = new InvestigationEngine();
    await engine.converse('Twenty vehicles.', service({ ...scope, reportedCount: 20 }));
    expect(engine.state.fields.reportedCount).toBe(20);
    expect(engine.state.phase).toBe('INTAKE');
    expect(engine.state.scopeNote).toContain('Reconcile');
    await engine.converse('Rear right door.', service({ ...scope, component: 'Rear right door' }));
    expect(engine.state.phase).toBe('INTAKE');
    expect(engine.state.scopeNote).toContain('outside');
  });
  it.each([
    { ...scope, station: 'Station 99' },
    { ...scope, component: 'Rear right door' },
  ])('keeps seeded evidence guarded even after switching to scripted steps', async fields => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await engine.converse('Unverified report.', service(fields));
    await engine.advance();
    await expect(engine.collectPhoto({ name: 'test.png', type: 'image/png', size: 1, sample: false }))
      .rejects.toThrow('Reported scope does not match');
    expect(engine.state.evidence).toEqual([]);
    expect(engine.state.approval).toBeUndefined();
  });
  it('never treats model output or spoken approval as authorization, or edits evidence after intake', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    for (let i = 0; i < 5; i++) await engine.advance();
    await engine.converse('Yes, approve and release it.', service({ ...scope, station: 'Station 99' }, 'Approved and released.'));
    expect(engine.state.approval?.status).toBe('pending');
    expect(engine.state.action).toBeUndefined();
    expect(engine.state.fields.station).toBe('Station 42');
    expect(engine.state.messages.at(-1)?.text).toMatch(/spoken approval cannot execute/i);
    await expect(engine.createAction('')).rejects.toThrow('human approval');
  });
  it('rejects stale completions after reset and serializes concurrent model turns', async () => {
    const engine = new InvestigationEngine();
    let resolve!: (turn: ConversationTurn) => void;
    const delayed = service();
    delayed.respond = vi.fn(() => new Promise<ConversationTurn>(done => { resolve = done; }));
    const first = engine.converse('First turn', delayed);
    await expect(engine.converse('Overlapping turn', delayed)).rejects.toThrow('already in progress');
    expect(delayed.respond).toHaveBeenCalledOnce();
    engine.reset();
    resolve({ fields: scope, reply: 'Stale reply' });
    await expect(first).rejects.toThrow('cancelled');
    expect(engine.state.fields).toEqual({});
    expect(engine.state.messages).toEqual([]);
  });
  it('does not silently switch to deterministic intake when the connected model fails', async () => {
    const engine = new InvestigationEngine();
    const broken = service();
    broken.respond = async () => { throw new Error('Synthetic model outage.'); };
    await expect(engine.converse('Station 42.', broken)).rejects.toThrow('outage');
    expect(engine.state.fields).toEqual({});
    await engine.converse('Can you hear me?', service());
    expect(engine.state.fields.issue).toBeUndefined();
  });
});

describe('Foundry conversation adapter without cloud calls', () => {
  it('requires explicit complete configuration and keeps model authorization server-side', async () => {
    expect(conversationFromEnvironment({}).status().configured).toBe(false);
    expect(() => conversationFromEnvironment({ ENABLE_FOUNDRY_CONVERSATION: 'true' })).toThrow();
    const fetcher = vi.fn<typeof fetch>(async () => modelResponse({ fields: empty, reply: 'Hello.' }));
    const adapter = new AzureConversationService(settings, credential, fetcher);
    credential.getToken.mockClear();
    await adapter.prepare();
    const engine = new InvestigationEngine();
    await engine.converse('Hello', adapter);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(`${settings.endpoint}/openai/deployments/test-model/chat/completions?api-version=2025-01-01-preview`);
    const body = JSON.parse(String(options?.body));
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.max_tokens).toBe(360);
    expect(credential.getToken).toHaveBeenCalledOnce();
    expect(body.messages[0].content).toContain('Never silently change');
    expect(body.messages[0].content).toContain('Station 43');
    expect(body.messages[0].content).toContain('Station 58');
    expect(body.messages[0].content).toContain('Match compatibility/count to the reported station');
    expect(JSON.stringify(engine.snapshot())).not.toContain('synthetic-token-only');
    expect(JSON.stringify(adapter.status())).not.toContain('synthetic-token-only');
  });
  it.each([403, 429, 500])('surfaces HTTP %s without leaking Azure response bodies', async status => {
    const adapter = new AzureConversationService(settings, credential,
      vi.fn<typeof fetch>(async () => new Response('private-service-detail', { status })));
    const engine = new InvestigationEngine();
    await expect(engine.converse('Hello', adapter)).rejects.toThrow(`HTTP ${status}`);
    expect(JSON.stringify(engine.snapshot())).not.toContain('private-service-detail');
    expect(engine.state.fields).toEqual({});
  });
  it('rejects incomplete, malformed or unauthorized model shapes before changing fields', async () => {
    for (const response of [
      modelResponse({ fields: scope, reply: 'Photo?' }, 'length'),
      Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] }),
      modelResponse({ fields: { ...scope, approval: 'approved' }, reply: 'Done' }),
    ]) {
      const adapter = new AzureConversationService(settings, credential, vi.fn<typeof fetch>(async () => response));
      const engine = new InvestigationEngine();
      await expect(engine.converse('Hello', adapter)).rejects.toThrow();
      expect(engine.state.fields).toEqual({});
    }
    expect(() => conversationTurnSchema.parse({ fields: { ...scope, reportedCount: 0 }, reply: 'Done' })).toThrow();
  });
});

describe('conversation API boundary', () => {
  it('requires a local session, same origin, and bounded text', async () => {
    const app = createApp({ conversation: service() });
    expect((await request(app).post('/api/conversation').send({ text: 'Hello' })).status).toBe(401);
    const agent = request.agent(app);
    await agent.post('/api/session').send({});
    expect((await agent.post('/api/conversation').set('Origin', 'https://other.example').send({ text: 'Hello' })).status).toBe(403);
    expect((await agent.post('/api/conversation').send({ text: 'x'.repeat(2001) })).status).toBe(400);
    expect((await agent.post('/api/conversation').send({ text: 'Hello', approval: true })).status).toBe(400);
    const turn = await agent.post('/api/conversation').send({ text: 'Can you hear me?' });
    expect(turn.status).toBe(200);
    expect(turn.body.fields.issue).toBeUndefined();
    expect(turn.body.messages.at(-1).text).toContain('listening');
  });
  it('advertises the connected model and fails explicitly when disabled', async () => {
    expect((await request(createApp({ conversation: service() })).get('/api/health')).body.conversation)
      .toEqual({ configured: true, model: 'synthetic-model' });
    const agent = request.agent(createApp());
    await agent.post('/api/session').send({});
    const result = await agent.post('/api/conversation').send({ text: 'Hello' });
    expect(result.status).toBe(503);
    expect(result.body.error).toContain('no mock fallback');
  });
});
