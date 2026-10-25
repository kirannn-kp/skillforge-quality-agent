import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app';
import { IncidentStore } from '../server/incidentStore';
import { fleetVehicleSchema, incidentSchema, outsideSpecification } from '../shared/incidents';
import type { InvestigationState } from '../shared/domain';

const stores: IncidentStore[] = [];
const directories: string[] = [];
function store(path?: string) { const value = new IncidentStore(path); stores.push(value); return value; }
function databasePath() {
  const root = mkdtempSync(join(tmpdir(), 'quality-incidents-test-'));
  directories.push(root);
  return join(root, 'test.sqlite');
}
afterEach(() => {
  stores.splice(0).forEach(value => value.close());
  directories.splice(0).forEach(root => { rmSync(join(root, 'test.sqlite'), { force: true }); rmdirSync(root); });
});
async function pending(incidents: IncidentStore, vehicleId = 'DEMO-00427') {
  const app = createApp({ latency: 0, incidentStore: incidents });
  const agent = request.agent(app);
  await agent.post('/api/session').send({}).expect(200);
  const result = await agent.post('/api/detections/investigate').send({ vehicleId, syntheticReplay: true }).expect(200);
  const state: InvestigationState = result.body;
  expect(state.phase).toBe('WAITING_FOR_APPROVAL');
  return { agent, app, state };
}
describe('proactive fleet and durable approved incidents', () => {
  it('offers the next vehicle without an incident, retaining saved-record access when all 18 have incidents', async () => {
    const db = store(), vehicles = db.detection().vehicleIds;
    for (const vehicleId of vehicles) {
      expect(db.overview().detections[0].vehicle.id).toBe(vehicleId);
      const { agent, state } = await pending(db, vehicleId);
      const approval = await agent.post('/api/approval').send({ requestId: state.approval!.id, decision: 'approve' }).expect(200);
      await agent.post('/api/action').send({ approvalToken: approval.body.token }).expect(200);
    }
    const overview = db.overview();
    expect(overview.incidents).toHaveLength(18);
    expect(overview.flagged).toBe(18);
    expect(overview.detections[0].vehicle.id).toBe(vehicles[0]);
    expect(overview.incidents.some(incident => incident.vehicleId === overview.detections[0].vehicle.id)).toBe(true);
  });
  it('checks exactly 1,000 records, isolates 18 threshold exceptions and paginates/searches actual vehicle IDs', () => {
    const db = store();
    const overview = db.overview();
    expect(overview.total).toBe(1000);
    expect(overview.flagged).toBe(18);
    expect(overview.vehicles).toHaveLength(20);
    expect(overview.pages).toBe(50);
    const detected = db.detection();
    expect(detected.vehicleIds).toHaveLength(18);
    expect(detected.vehicle.id).toBe('DEMO-00427');
    expect(detected.vehicle.measurement).toBe(62);
    expect(detected.imageNote).toContain('No pixels');
    expect(db.overview('DEMO-00427').vehicles).toEqual([detected.vehicle]);
    expect(db.overview('unknown').matching).toBe(0);
    expect(() => db.detection('DEMO-00001')).toThrow('no matching');
    expect(outsideSpecification({ ...detected.vehicle, measurement: 50 })).toBe(false);
    expect(outsideSpecification({ ...detected.vehicle, measurement: 50.01 })).toBe(true);
    const lower = fleetVehicleSchema.parse({ ...detected.vehicle, limitDirection: 'lower', limit: 90, measurement: 90 });
    expect(outsideSpecification(lower)).toBe(false);
    expect(outsideSpecification({ ...lower, measurement: 89.99 })).toBe(true);
  });
  it('requires a session, explicit synthetic replay and a known flagged vehicle; never overwrites an active case', async () => {
    const app = createApp({ latency: 0, incidentStore: store() });
    await request(app).get('/api/fleet').expect(401);
    await request(app).get('/api/incidents').expect(401);
    await request(app).get('/api/station-alerts?station=Station%2042').expect(401);
    const agent = request.agent(app);
    await agent.post('/api/session').send({});
    await agent.post('/api/detections/investigate').send({ vehicleId: 'DEMO-00427' }).expect(400);
    await agent.post('/api/detections/investigate').send({ vehicleId: 'DEMO-00001', syntheticReplay: true }).expect(404);
    await agent.get('/api/fleet?page=0').expect(400);
    await agent.get('/api/station-alerts?station=Station%2099').expect(400);
    await agent.post('/api/start').send({});
    await agent.post('/api/detections/investigate').send({ vehicleId: 'DEMO-00427', syntheticReplay: true }).expect(409);
    expect((await agent.get('/api/state')).body.phase).toBe('INTAKE');
  });
  it('asks permission and writes neither incident nor alert before explicit approval; a rejection remains write-free', async () => {
    const db = store();
    const { agent, state } = await pending(db);
    expect(state.messages.at(-1)?.text).toContain('Would you like me to create an incident');
    expect(state.fields.vehicle).toContain('DEMO-00427');
    expect(state.vision).toBeUndefined();
    expect(state.workers.find(worker => worker.id === 'vision')?.detail).toContain('no pixel analysis');
    expect(db.list()).toEqual([]);
    expect(db.alerts('Station 42')).toEqual([]);
    await agent.post('/api/action').send({}).expect(403);
    await agent.post('/api/approval').send({ requestId: state.approval!.id, decision: 'reject' }).expect(200);
    await agent.post('/api/action').send({ approvalToken: 'forged' }).expect(403);
    expect(db.list()).toEqual([]);
    expect(db.alerts('Station 42')).toEqual([]);
  });
  it('creates one incident and one linked station alert after approval; prevents token replay and cross-session writes', async () => {
    const db = store();
    const { agent, app, state } = await pending(db);
    const other = request.agent(app);
    await other.post('/api/session').send({});
    await other.post('/api/approval').send({ requestId: state.approval!.id, decision: 'approve' }).expect(409);
    const approval = await agent.post('/api/approval').send({ requestId: state.approval!.id, decision: 'approve' }).expect(200);
    expect(db.list()).toHaveLength(0);
    await agent.post('/api/action').send({ approvalToken: 'forged' }).expect(403);
    await other.post('/api/action').send({ approvalToken: approval.body.token }).expect(403);
    const responses = await Promise.all([
      agent.post('/api/action').send({ approvalToken: approval.body.token }),
      agent.post('/api/action').send({ approvalToken: approval.body.token }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 403]);
    const created = responses.find(response => response.status === 200)!;
    const saved = incidentSchema.parse((await agent.get(`/api/incidents/${created.body.state.incident.id}`).expect(200)).body);
    expect(saved.detection.vehicleIds).toHaveLength(18);
    expect(saved.skill.version).toBe(state.skillVersion);
    expect(saved.productionReleaseAuthorized).toBe(false);
    expect(saved.approval.approvedAt).toBe(approval.body.state.approval.approvedAt);
    expect(saved.audit.some(event => event.tool === 'approval.decide')).toBe(true);
    expect(saved.findings.probableCause).toContain('Potential');
    expect(saved.findings.visual).toContain('not vehicle-specific');
    expect(JSON.stringify(saved)).not.toContain(approval.body.token);
    const alerts = await agent.get('/api/station-alerts?station=Station%2042').expect(200);
    expect(alerts.body).toHaveLength(1);
    expect(alerts.body[0].incidentId).toBe(saved.id);
    expect(alerts.body[0].channel).toBe('local-mock-dashboard');
    expect(saved.id).toBe('INC-1001');
    expect(created.body.state.messages.at(-1).text).toContain('Sent alert to Station 42 dashboard');
    expect(created.body.state.messages.at(-1).spokenText).toContain(`Incident ${saved.id} created`);
    expect(created.body.state.messages.at(-1).spokenText).not.toMatch(/mock/i);
    expect(created.body.state.incident.href).toContain(encodeURIComponent(saved.id));
    await agent.post('/api/action').send({ approvalToken: approval.body.token }).expect(403);
    expect(db.list()).toHaveLength(1);
    expect(db.overview().detections[0].vehicle.id).toBe('DEMO-00428');
    await agent.post('/api/reset').send({ scenarioId: 'Q-2048' }).expect(200);
    await agent.post('/api/detections/investigate').send({ vehicleId: 'DEMO-00427', syntheticReplay: true }).expect(409);
  });
  it('retrieves the same immutable evidence, vehicle IDs, approval and alert after closing/reopening the database', async () => {
    const path = databasePath();
    const first = store(path);
    const { agent, state } = await pending(first);
    const approval = await agent.post('/api/approval').send({ requestId: state.approval!.id, decision: 'approve' });
    const result = await agent.post('/api/action').send({ approvalToken: approval.body.token }).expect(200);
    const original = first.get(result.body.state.incident.id);
    first.close();
    const reopened = store(path);
    const restarted = request.agent(createApp({ latency: 0, incidentStore: reopened }));
    await restarted.post('/api/session').send({});
    expect((await restarted.get(`/api/incidents/${original.id}`).expect(200)).body).toEqual(original);
    expect(reopened.alerts('Station 42')).toEqual([original.alert]);
    expect(reopened.overview().total).toBe(1000);
    await restarted.get('/api/incidents/not-found').expect(404);
  });
  it('rolls back both records on alert-storage failure and permits an explicit retry with the same approval', async () => {
    const path = databasePath();
    const db = store(path);
    const { agent, state } = await pending(db);
    const approval = await agent.post('/api/approval').send({ requestId: state.approval!.id, decision: 'approve' });
    const connection = new DatabaseSync(path);
    try {
      connection.exec("CREATE TRIGGER fail_alert BEFORE INSERT ON station_alerts BEGIN SELECT RAISE(ABORT, 'Synthetic alert storage failure'); END");
      await agent.post('/api/action').send({ approvalToken: approval.body.token }).expect(500);
      expect(db.list()).toEqual([]);
      expect(db.alerts('Station 42')).toEqual([]);
      expect(connection.prepare('SELECT COUNT(*) AS count FROM incident_numbers').get()?.count).toBe(0);
      const failed = (await agent.get('/api/state')).body;
      expect(failed.phase).toBe('WAITING_FOR_APPROVAL');
      expect(failed.approval.status).toBe('approved');
      expect(failed.incident).toBeUndefined();
      connection.exec('DROP TRIGGER fail_alert');
      await agent.post('/api/action').send({ approvalToken: approval.body.token }).expect(200);
      expect(db.list()).toHaveLength(1);
      expect(db.list()[0].id).toBe('INC-1001');
      expect(db.alerts('Station 42')).toHaveLength(1);
    } finally { connection.close(); }
  });
  it('preserves archived illustration metadata and continues the readable ID sequence after restart', async () => {
    const path = databasePath(), first = store(path);
    const { agent, state } = await pending(first);
    const approval = await agent.post('/api/approval').send({ requestId: state.approval!.id, decision: 'approve' });
    const created = await agent.post('/api/action').send({ approvalToken: approval.body.token }).expect(200);
    const archived = first.get(created.body.state.incident.id);
    archived.detection.imagePath = '/samples/door-hinge.png';
    archived.detection.imageNote = 'Shared synthetic illustration; not vehicle-specific camera footage. No pixels were analyzed by the fleet monitor.';
    archived.findings.visual = archived.detection.imageNote;
    const connection = new DatabaseSync(path);
    try {
      connection.prepare('UPDATE incidents SET data = ? WHERE id = ?').run(JSON.stringify(archived), archived.id);
    } finally { connection.close(); }
    first.close();
    const reopened = store(path);
    expect(reopened.get(archived.id)).toEqual(archived);
    const next = await pending(reopened, 'DEMO-00428');
    const nextApproval = await next.agent.post('/api/approval').send({ requestId: next.state.approval!.id, decision: 'approve' });
    const nextCreated = await next.agent.post('/api/action').send({ approvalToken: nextApproval.body.token }).expect(200);
    expect(nextCreated.body.state.incident.id).toBe('INC-1002');
    expect(reopened.get('INC-1002').detection.imagePath).toBe('/reference-images/door-hinge.png');
    expect(reopened.get(archived.id)).toEqual(archived);
  });
});
