import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';

describe('local API integration', () => {
  it('starts without credentials and reports connected mode as unavailable', async () => {
    const app = createApp({ latency: 0 });
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body.mode).toBe('mock');
    expect(health.body.connected.available).toBe(false);
    await request(app).get('/api/state').expect(401);
  });
  it('runs the complete mock scenario and enforces approval at the REST boundary', async () => {
    const agent = request.agent(createApp({ latency: 0 }));
    await agent.post('/api/session').send({}).expect(200);
    const denied = await agent.post('/api/action').send({}).expect(403);
    expect(denied.body.error).toContain('approval');
    for (let i = 0; i < 5; i++) await agent.post('/api/advance').send({}).expect(200);
    const pending = await agent.get('/api/state').expect(200);
    expect(pending.body.phase).toBe('WAITING_FOR_APPROVAL');
    await agent.post('/api/action').send({ approvalToken: 'fake' }).expect(403);
    await agent.post('/api/approval').send({ requestId: pending.body.approval.id, decision: 'reject' }).expect(200);
    await agent.post('/api/action').send({ approvalToken: 'fake' }).expect(403);
    await agent.post('/api/advance').send({}).expect(200);
    const revised = await agent.get('/api/state');
    const approval = await agent.post('/api/approval').send({ requestId: revised.body.approval.id, decision: 'approve' }).expect(200);
    const result = await agent.post('/api/action').send({ approvalToken: approval.body.token }).expect(200);
    expect(result.body.action.id).toBe('CA-1041');
    expect(result.body.action.productionReleaseAuthorized).toBe(false);
    await agent.post('/api/action').send({ approvalToken: approval.body.token }).expect(403);
    expect(result.body.state.audit.some((event: { result: string }) => event.result === 'denied')).toBe(true);
  });
  it('isolates different sessions', async () => {
    const app = createApp({ latency: 0 });
    const first = request.agent(app), second = request.agent(app);
    await first.post('/api/session').send({});
    await second.post('/api/session').send({});
    await first.post('/api/advance').send({});
    expect((await second.get('/api/state')).body.phase).toBe('IDLE');
  });
  it('validates image metadata and configurable byte threshold exactly', async () => {
    const agent = request.agent(createApp({ latency: 0, maxImageBytes: 100 }));
    await agent.post('/api/session').send({});
    for (let i = 0; i < 4; i++) await agent.post('/api/advance').send({});
    await agent.post('/api/photo').send({ name: 'bad.svg', type: 'image/svg+xml', size: 90, sample: false }).expect(400);
    await agent.post('/api/photo').send({ name: 'large.png', type: 'image/png', size: 101, sample: false }).expect(400);
    await agent.post('/api/photo').send({ name: 'empty.png', type: 'image/png', size: 0, sample: false }).expect(400);
    const accepted = await agent.post('/api/photo').send({ name: 'boundary.png', type: 'image/png', size: 100, sample: false }).expect(200);
    expect(accepted.body.phase).toBe('WAITING_FOR_APPROVAL');
    expect(accepted.body.vision.observations[0].observation).toContain('cannot inspect');
  });
  it('rejects invalid control input and cross-origin JSON requests', async () => {
    const agent = request.agent(createApp({ latency: 0 }));
    await agent.post('/api/session').send({});
    await agent.post('/api/reset').send({ scenarioId: 'UNKNOWN' }).expect(400);
    await agent.post('/api/settings').send({ speed: 10 }).expect(400);
    await agent.post('/api/start').set('Origin', 'https://untrusted.example').send({}).expect(403);
    await agent.post('/api/start').set('Content-Type', 'text/plain').send('{}').expect(415);
  });
  it('returns unknown endpoint errors rather than a success-shaped default', async () => {
    await request(createApp()).get('/api/missing').expect(404);
  });
});
