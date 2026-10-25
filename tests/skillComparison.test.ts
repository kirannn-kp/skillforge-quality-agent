import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { AzureConversationService, type ConversationService } from '../server/conversation';
import { comparisonQuestion } from '../shared/skills';
import { manualGuidanceFixture } from './fixtures/skillGuidance';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'quality-comparison-test-'));
  directories.push(path);
  return path;
}
const settings = { endpoint: 'https://synthetic.openai.azure.com', deployment: 'test-model', apiVersion: '2025-01-01-preview' };
const credential = { getToken: vi.fn(async () => ({ token: 'synthetic-test-only', expiresOnTimestamp: Date.now() + 3600000 })) };

describe('genuine read-only skill briefing comparison', () => {
  it('changes only expert guidance and records matched evidence/model/question without mutating the case or actions', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{
      finish_reason: 'stop', message: { content: JSON.stringify({ briefing: 'Synthetic test briefing; requires engineer verification.' }) },
    }] }));
    const app = createApp({ latency: 0, skillDirectory: directory(),
      conversation: new AzureConversationService(settings, credential, fetcher) });
    const agent = request.agent(app);
    await agent.post('/api/session').send({});
    const before = (await agent.get('/api/state')).body;
    const input = { scenarioId: 'Q-2048', mode: 'baseline', consent: true };
    const baseline = await agent.post('/api/skills/briefing').send(input).expect(200);
    const draft = (await agent.post('/api/skills/import').send({ sourceFile: 'SKILL.md', content: manualGuidanceFixture }).expect(200)).body;
    const publication = (await agent.post('/api/skills/publish').send({
      draftId: draft.id, sha256: draft.sha256, version: '1.0.0-test', reviewedBy: 'Synthetic comparison reviewer',
      source: 'manual-guidance', recordingReference: '', reviewed: true, syntheticOnly: true, understandLimits: true, allowModelContext: true,
    }).expect(200)).body;
    await agent.post('/api/skills/attach').send({ agent: 'Quality Live Agent', publicationId: publication.id, sha256: publication.sha256, confirm: true }).expect(200);
    const afterAttach = (await agent.get('/api/state')).body;
    const expert = await agent.post('/api/skills/briefing').send({ ...input, mode: 'expert', expectedSkillHash: publication.sha256 }).expect(200);
    expect(expert.body.contextSha256).toBe(baseline.body.contextSha256);
    expect(expert.body.question).toBe(comparisonQuestion);
    expect(expert.body.model).toBe(baseline.body.model);
    expect(baseline.body.skill).toBeUndefined();
    expect(expert.body.skill.sha256).toBe(publication.sha256);
    const prompts = fetcher.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
    expect(prompts[0].messages).toHaveLength(2);
    expect(JSON.stringify(prompts[0])).not.toContain('measure, correlate, validate');
    expect(JSON.stringify(prompts[0])).not.toContain('Pinned local procedure');
    expect(prompts[1].messages).toHaveLength(3);
    expect(JSON.stringify(prompts[1])).toContain('measure, correlate, validate');
    expect(prompts[1].messages.at(-1)).toEqual(prompts[0].messages.at(-1));
    expect(prompts[1].messages[0]).toEqual(prompts[0].messages[0]);
    expect(prompts[1].temperature).toBe(prompts[0].temperature);
    expect((await agent.get('/api/state')).body).toEqual(afterAttach);
    expect(afterAttach.correlationId).toBe(before.correlationId);
    expect((await agent.get('/api/incidents')).body).toEqual([]);
    expect((await agent.get('/api/station-alerts?station=Station%2042')).body).toEqual([]);
    await agent.post('/api/skills/briefing').send({ ...input, mode: 'expert', expectedSkillHash: '0'.repeat(64) }).expect(409);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('requires session, explicit model consent and an attached skill, with no disabled-service fallback', async () => {
    const app = createApp({ skillDirectory: directory() });
    const input = { scenarioId: 'Q-2048', mode: 'baseline', consent: true };
    await request(app).post('/api/skills/briefing').send(input).expect(401);
    const agent = request.agent(app);
    await agent.post('/api/session').send({});
    await agent.post('/api/skills/briefing').send({ ...input, consent: false }).expect(400);
    await agent.post('/api/skills/briefing').send({ ...input, expectedSkillHash: '0'.repeat(64) }).expect(400);
    await agent.post('/api/skills/briefing').send(input).expect(503);
  });
  it('serializes model calls per session and releases the guard after completion', async () => {
    let finish!: (value: string) => void;
    const brief = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const conversation: ConversationService = {
      status: () => ({ configured: true, model: 'synthetic-test-model' }), prepare: async () => {},
      respond: async () => { throw new Error('Comparison must not call conversation intake.'); }, brief,
    };
    const agent = request.agent(createApp({ skillDirectory: directory(), conversation }));
    await agent.post('/api/session').send({});
    const input = { scenarioId: 'Q-2048', mode: 'baseline', consent: true };
    const first = agent.post('/api/skills/briefing').send(input).then(response => response);
    await vi.waitFor(() => expect(brief).toHaveBeenCalledOnce());
    await agent.post('/api/skills/briefing').send(input).expect(429);
    finish('Synthetic read-only result.');
    expect((await first).status).toBe(200);
    const second = agent.post('/api/skills/briefing').send(input).then(response => response);
    await vi.waitFor(() => expect(brief).toHaveBeenCalledTimes(2));
    finish('Another synthetic read-only result.');
    expect((await second).status).toBe(200);
  });
});
