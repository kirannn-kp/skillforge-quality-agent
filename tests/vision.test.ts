import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { AzureConversationService } from '../server/conversation';
import { InvestigationEngine, WorkflowError } from '../server/engine';
import type { VisionService } from '../server/services';
import { maxVisionImageBytes, type VisionAnalysis } from '../shared/domain';
import { scenarios } from '../shared/scenarios';
import { assistantSpeech } from '../shared/speech';
import type { VisionImage } from '../shared/vision';

const metadata = { name: 'synthetic-demo.jpg', size: 200, type: 'image/jpeg', sample: false };
const dataUrl = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 255, 217]).toString('base64')}`;
const image: VisionImage = { consent: true, dataUrl };
const result = {
  relevance: 'relevant' as const, summary: 'An illustrative door hinge is visible; no defect is established.',
  observations: [{ region: 'Door hinge', observation: 'Hinge attachment points are visible.',
    classification: 'requires_validation' as const, limitations: 'A single view cannot establish dimensional tolerance.' }],
  recommendedNextChecks: ['Have a qualified engineer check hinge alignment.', 'Compare measured closing force with specification.'],
};
function service(analysis: Partial<VisionAnalysis> = {}) {
  return { status: () => ({ configured: true, model: 'synthetic-vision' }),
    analyze: vi.fn(async () => ({ ...result, source: 'azure-model' as const, model: 'synthetic-vision', durationMs: 12, ...analysis })) };
}
async function ready(engine: InvestigationEngine) { for (let i = 0; i < 4; i++) await engine.advance(); }
async function apiReady(vision = service()) {
  const agent = request.agent(createApp({ latency: 0, vision }));
  await agent.post('/api/session').send({});
  for (let i = 0; i < 4; i++) await agent.post('/api/advance').send({});
  return { agent, vision };
}

describe('actual image transport with synthetic model responses', () => {
  it('sends image pixels, not expected scenario observations, and shares cached model authorization', async () => {
    const getToken = vi.fn(async () => ({ token: 'synthetic-only', expiresOnTimestamp: Date.now() + 3600000 }));
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }],
    }));
    const model = new AzureConversationService({
      endpoint: 'https://synthetic.openai.azure.com', deployment: 'synthetic-model', apiVersion: '2025-01-01-preview',
    }, { getToken }, fetcher);
    await model.prepare();
    const actual = await model.analyze(metadata, scenarios['Q-2048'], image);
    await model.analyze(metadata, scenarios['Q-2048'], image);
    expect(getToken).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetcher.mock.calls[0][1]!.body));
    expect(body.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } });
    expect(JSON.stringify(body)).not.toContain(scenarios['Q-2048'].visual);
    expect(JSON.stringify(body)).not.toContain(scenarios['Q-2048'].probableCause);
    expect(body.messages[0].content).toContain('untrusted visual content');
    expect(actual).toMatchObject({ source: 'azure-model', model: 'synthetic-model', relevance: 'relevant' });
    expect(actual.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(actual)).not.toContain('synthetic-only');
    await expect(model.analyze(metadata, scenarios['Q-2048'])).rejects.toThrow('consent');
  });
  it.each([
    Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...result, relevance: 'confirmed' }) } }] }),
    new Response('private-provider-body', { status: 429 }),
  ])('surfaces invalid/truncated/rejected model calls without mock output or raw provider details', async response => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const model = new AzureConversationService({ endpoint: 'https://synthetic.openai.azure.com',
        deployment: 'synthetic-model', apiVersion: 'test' },
      { getToken: async () => ({ token: 'synthetic-only', expiresOnTimestamp: Date.now() + 3600000 }) },
      vi.fn<typeof fetch>(async () => response));
      await expect(model.analyze(metadata, scenarios['Q-2048'], image)).rejects.toThrow();
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-provider-body');
      expect(JSON.stringify(log.mock.calls)).not.toContain(dataUrl);
    } finally { log.mockRestore(); }
  });
  it('requires a session, same-origin JSON, consent and image content before calling the model', async () => {
    const vision = service();
    const app = createApp({ vision });
    await request(app).post('/api/photo/analyze').send({ ...metadata, ...image }).expect(401);
    const { agent } = await apiReady(vision);
    await agent.post('/api/photo/analyze').set('Origin', 'https://other.example').send({ ...metadata, ...image }).expect(403);
    await agent.post('/api/photo/analyze').set('Content-Type', 'text/plain').send('invalid').expect(415);
    await agent.post('/api/photo/analyze').send({ ...metadata, ...image, consent: false }).expect(400);
    await agent.post('/api/photo').send(metadata).expect(400);
    for (const invalid of ['https://example.com/image.jpg', 'data:image/jpeg;base64,@@@@',
      'data:image/jpeg;base64,aGVsbG8=', 'data:image/png;base64,/9j//9k=']) {
      await agent.post('/api/photo/analyze').send({ ...metadata, consent: true, dataUrl: invalid }).expect(400);
    }
    expect(vision.analyze).not.toHaveBeenCalled();
  });
  it('enforces exact original/encoded size limits and keeps image bytes out of state and audit', async () => {
    const { agent, vision } = await apiReady();
    const bytes = Buffer.alloc(maxVisionImageBytes);
    bytes.set([255, 216, 255]); bytes.set([255, 217], bytes.length - 2);
    const maximum = `data:image/jpeg;base64,${bytes.toString('base64')}`;
    await agent.post('/api/photo/analyze').send({ ...metadata, ...image, size: 8 * 1024 * 1024 + 1 }).expect(400);
    await agent.post('/api/photo/analyze').send({ ...metadata, ...image, dataUrl: `${maximum}AAAA` }).expect(400);
    await agent.post('/api/photo/analyze').send({ ...metadata, ...image, dataUrl: 'x'.repeat(2 * 1024 * 1024) }).expect(413);
    const response = await agent.post('/api/photo/analyze').send({
      ...metadata, ...image, size: 8 * 1024 * 1024, dataUrl: maximum,
    }).expect(200);
    expect(vision.analyze).toHaveBeenCalledOnce();
    expect(response.body.phase).toBe('WAITING_FOR_APPROVAL');
    expect(JSON.stringify(response.body)).not.toContain('data:image/');
    expect(JSON.stringify((await agent.get('/api/state')).body)).not.toContain('data:image/');
    expect(response.body.audit.find((item: { tool: string }) => item.tool === 'vision.analyze').source).toBe('Azure image analysis');
    expect(response.body.action).toBeUndefined();
    await agent.post('/api/action').send({}).expect(403);
  });
  it('does not expose malformed image JSON in error logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await request(createApp()).post('/api/photo/analyze').set('Content-Type', 'application/json')
        .send('{"dataUrl":"private-image-payload" invalid}').expect(400);
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-image-payload');
    } finally { log.mockRestore(); }
  });
});
describe('advisory image workflow and meaningful narration', () => {
  it.each(['unclear', 'unrelated'] as const)('requests a better photo for %s images without seeded diagnosis/action', async relevance => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await ready(engine);
    await engine.collectPhoto(metadata, { service: service({ relevance }), image });
    expect(engine.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
    expect(engine.state.fields.probableCause).toBeUndefined();
    expect(engine.state.approval).toBeUndefined();
    expect(engine.state.skillActive).toBe(false);
    expect(engine.state.evidence.some(item => item.type === 'Retrieved')).toBe(false);
    await engine.collectPhoto(metadata, { service: service(), image });
    expect(engine.state.phase).toBe('WAITING_FOR_APPROVAL');
  });
  it('surfaces connected failures and permits explicit re-upload without a mock fallback', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await ready(engine);
    const failed: VisionService = { analyze: async () => { throw new WorkflowError('Synthetic vision unavailable; no mock fallback.', 502); } };
    await expect(engine.collectPhoto(metadata, { service: failed, image })).rejects.toThrow('unavailable');
    expect(engine.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
    expect(engine.state.vision).toBeUndefined();
    expect(engine.state.error).toContain('unavailable');
    expect(engine.state.skillActive).toBe(false);
    await engine.collectPhoto(metadata, { service: service(), image });
    expect(engine.state.error).toBeUndefined();
    expect(engine.state.phase).toBe('WAITING_FOR_APPROVAL');
  });
  it('discards delayed image output after reset', async () => {
    const engine = new InvestigationEngine('Q-2048', undefined, 0);
    await ready(engine);
    let resolve!: (value: VisionAnalysis) => void;
    const pending = engine.collectPhoto(metadata, { service: { analyze: () => new Promise(done => { resolve = done; }) }, image });
    engine.reset();
    resolve({ ...result, source: 'azure-model' });
    await pending;
    expect(engine.state.phase).toBe('IDLE');
    expect(engine.state.vision).toBeUndefined();
    expect(engine.state.messages).toHaveLength(0);
  });
  it.each(['Q-2048', 'Q-3012'] as const)('speaks actual observations and engineer-led recommendations for %s, not a generic approval prompt', async id => {
    const engine = new InvestigationEngine(id, undefined, 0);
    await ready(engine);
    await engine.collectPhoto(metadata, { service: service(), image });
    const observations = engine.state.messages.find(item => item.kind === 'photo-observation')!;
    const recommendation = engine.state.messages.find(item => item.kind === 'recommendation')!;
    expect(assistantSpeech(engine.state, observations.id)).toContain(result.summary);
    const spoken = assistantSpeech(engine.state, recommendation.id);
    expect(spoken).toContain(scenarios[id].probableCause);
    expect(spoken).toContain(scenarios[id].historical.procedure[0]);
    expect(spoken).toContain(scenarios[id].historical.procedure[1]);
    expect(spoken).toContain('Approve request creation only');
    expect(spoken).not.toContain('Please review the board');
    expect(engine.state.action).toBeUndefined();
  });
});
