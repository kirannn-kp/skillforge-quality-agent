import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { detectionSchema, fleetVehicleSchema, incidentSchema, outsideSpecification, stationAlertSchema,
  type FleetDetection, type FleetOverview, type IncidentRecord, type IncidentSummary } from '../shared/incidents.js';
import type { InvestigationState, Skill } from '../shared/domain.js';
import { scenarioIds } from '../shared/domain.js';
import { referenceImageNote, scenarios } from '../shared/scenarios.js';

export class IncidentError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
const storedJson = z.object({ data: z.string() });

export class IncidentStore {
  private db: DatabaseSync;
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS vehicles (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL UNIQUE, detection_id TEXT NOT NULL,
        vehicle_id TEXT NOT NULL, station TEXT NOT NULL, data TEXT NOT NULL,
        UNIQUE(detection_id, vehicle_id));
      CREATE TABLE IF NOT EXISTS incident_numbers (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE IF NOT EXISTS station_alerts (
        id TEXT PRIMARY KEY, incident_id TEXT NOT NULL UNIQUE REFERENCES incidents(id),
        station TEXT NOT NULL, data TEXT NOT NULL);`);
    const count = z.object({ count: z.number() }).parse(this.db.prepare('SELECT COUNT(*) AS count FROM vehicles').get()).count;
    if (count === 0) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const insert = this.db.prepare('INSERT INTO vehicles(id, data) VALUES (?, ?)');
        for (let i = 1; i <= 1000; i++) {
          const flagged = i >= 427 && i <= 444;
          const scenario = flagged ? scenarios['Q-2048'] : scenarios[scenarioIds[(i - 1) % scenarioIds.length]];
          const vehicle = fleetVehicleSchema.parse({
            id: `DEMO-${String(i).padStart(5, '0')}`, model: scenario.vehicle, station: scenario.station,
            recordedAt: flagged ? `2026-10-15T14:${String(32 + i - 427).padStart(2, '0')}:00Z` :
              new Date(Date.UTC(2026, 9, 15, 8) + i * 15000).toISOString(),
            measurement: flagged ? [62, 68, 71, 66][(i - 427) % 4] : scenario.measurements.baseline,
            limit: scenario.measurements.limit, limitDirection: scenario.measurements.limitDirection, unit: scenario.measurements.unit,
          });
          insert.run(vehicle.id, JSON.stringify(vehicle));
        }
        this.db.exec('COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    } else if (count !== 1000) throw new IncidentError('Synthetic fleet database is incomplete; expected exactly 1,000 records.', 500);
  }
  close() { if (this.db.isOpen) this.db.close(); }
  private vehicles() {
    return this.db.prepare('SELECT data FROM vehicles ORDER BY id').all()
      .map(row => fleetVehicleSchema.parse(JSON.parse(storedJson.parse(row).data)));
  }
  detection(vehicleId = 'DEMO-00427'): FleetDetection {
    const flagged = this.vehicles().filter(outsideSpecification);
    const vehicle = flagged.find(item => item.id === vehicleId && item.station === 'Station 42');
    if (!vehicle) throw new IncidentError('Vehicle has no matching Station 42 detection.', 404);
    return detectionSchema.parse({
      id: 'DET-Q-2048', scenarioId: 'Q-2048', station: 'Station 42',
      component: scenarios['Q-2048'].component, vehicle, vehicleIds: flagged.filter(item => item.station === vehicle.station).map(item => item.id),
      imagePath: '/reference-images/door-hinge.png', source: 'synthetic-measurement-rule',
      imageNote: referenceImageNote,
    });
  }
  nextDetection(): FleetDetection {
    for (const vehicleId of this.detection().vehicleIds) {
      const detection = this.detection(vehicleId);
      if (!this.existing(detection)) return detection;
    }
    throw new IncidentError('All current synthetic measurement exceptions already have incidents. Open the control tower to review saved history.');
  }
  overview(search = '', page = 1): FleetOverview {
    const vehicles = this.vehicles();
    const incidents = this.list();
    const pendingVehicle = vehicles.find(vehicle => vehicle.station === 'Station 42' && outsideSpecification(vehicle) &&
      !incidents.some(incident => incident.vehicleId === vehicle.id));
    const matching = vehicles.filter(vehicle => `${vehicle.id} ${vehicle.station}`.toLowerCase().includes(search.toLowerCase()));
    const pages = Math.max(1, Math.ceil(matching.length / 20));
    const selectedPage = Math.min(page, pages);
    return { total: vehicles.length, flagged: vehicles.filter(outsideSpecification).length,
      matching: matching.length, page: selectedPage, pages,
      vehicles: matching.slice((selectedPage - 1) * 20, selectedPage * 20),
      detections: [this.detection(pendingVehicle?.id)], incidents };
  }
  list(): IncidentSummary[] {
    return this.db.prepare('SELECT data FROM incidents ORDER BY rowid DESC LIMIT 100').all().map(row => {
      const record = incidentSchema.parse(JSON.parse(storedJson.parse(row).data));
      return { id: record.id, createdAt: record.createdAt, summary: record.summary, status: record.status,
        vehicleId: record.detection.vehicle.id, station: record.detection.station };
    });
  }
  get(id: string): IncidentRecord {
    const row = this.db.prepare('SELECT data FROM incidents WHERE id = ?').get(id);
    if (!row) throw new IncidentError('Incident not found in the local database.', 404);
    return incidentSchema.parse(JSON.parse(storedJson.parse(row).data));
  }
  alerts(station: string) {
    return this.db.prepare('SELECT data FROM station_alerts WHERE station = ? ORDER BY rowid DESC LIMIT 100')
      .all(station).map(row => stationAlertSchema.parse(JSON.parse(storedJson.parse(row).data)));
  }
  existing(detection: FleetDetection) {
    const row = this.db.prepare('SELECT data FROM incidents WHERE detection_id = ? AND vehicle_id = ?')
      .get(detection.id, detection.vehicle.id);
    return row ? incidentSchema.parse(JSON.parse(storedJson.parse(row).data)) : undefined;
  }
  createApproved(state: InvestigationState, skill: Skill, tasks: string[]): IncidentRecord {
    if (state.phase !== 'CREATING_ACTION' || state.approval?.status !== 'approved' || !state.detection) {
      throw new IncidentError('Approved, locked investigation with a fleet detection is required.', 403);
    }
    const detection = this.detection(state.detection.vehicle.id);
    if (JSON.stringify(detection) !== JSON.stringify(state.detection)) throw new IncidentError('Detection evidence changed. Start a new investigation.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.existing(detection);
      if (existing) throw new IncidentError(`An incident already exists for this detection and vehicle: ${existing.id}. Open it from the control tower.`);
      const number = this.db.prepare('INSERT INTO incident_numbers DEFAULT VALUES').run().lastInsertRowid;
      const id = `INC-${BigInt(number) + 1000n}`, createdAt = new Date().toISOString();
      const alert = stationAlertSchema.parse({ id: `ALERT-${randomUUID()}`, incidentId: id, station: detection.station,
        createdAt, channel: 'local-mock-dashboard', status: 'published',
        message: `${detection.vehicle.id}: closing force ${detection.vehicle.measurement} N exceeds ${detection.vehicle.limit} N. Inspect door/hinge alignment; cause requires engineer validation. No hold or release change is authorized.` });
      const record = incidentSchema.parse({
        id, createdAt, correlationId: state.correlationId, mode: 'synthetic-mock', status: 'Open - engineering review',
        detection, summary: `${detection.vehicle.id} / ${detection.station}: high door-closing force; possible hinge-alignment issue.`,
        findings: { production: state.fields.production, maintenance: state.fields.maintenance,
          historical: state.fields.historical, probableCause: state.fields.probableCause,
          visual: state.fields.visual ?? detection.imageNote },
        recommendations: tasks,
        evidence: state.evidence.map(({ source, reference, observation, type }) => ({ source, reference, observation, type })),
        audit: [...state.audit.map(({ at, tool, outputSummary, result }) => ({ at, tool, outputSummary, result })),
          { at: createdAt, tool: 'incident.createAndPublishAlert', outputSummary: `${id}; ${alert.id}; approved local station publication`, result: 'success' }],
        skill: { name: skill.name, version: skill.version, source: skill.source, sha256: skill.provenance?.sha256 },
        approval: { requestId: state.approval.id, approvedAt: state.approval.approvedAt, method: state.approval.method ?? 'button' }, alert, productionReleaseAuthorized: false,
      });
      this.db.prepare('INSERT INTO incidents(id, correlation_id, detection_id, vehicle_id, station, data) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, state.correlationId, detection.id, detection.vehicle.id, detection.station, JSON.stringify(record));
      this.db.prepare('INSERT INTO station_alerts(id, incident_id, station, data) VALUES (?, ?, ?, ?)')
        .run(alert.id, id, alert.station, JSON.stringify(alert));
      this.db.exec('COMMIT');
      return record;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
