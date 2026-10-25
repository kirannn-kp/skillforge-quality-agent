import { z } from 'zod';
import { referenceImageNote } from './scenarios.js';

export const fleetVehicleSchema = z.object({
  id: z.string(), model: z.string(), station: z.string(), recordedAt: z.string(),
  measurement: z.number(), limit: z.number(), limitDirection: z.enum(['upper', 'lower']), unit: z.string(),
});
export type FleetVehicle = z.infer<typeof fleetVehicleSchema>;
export const detectionSchema = z.object({
  id: z.literal('DET-Q-2048'), scenarioId: z.literal('Q-2048'), station: z.literal('Station 42'),
  component: z.string(), vehicle: fleetVehicleSchema, vehicleIds: z.array(z.string()).min(1),
  imagePath: z.enum(['/samples/door-hinge.png', '/reference-images/door-hinge.png']),
  imageNote: z.enum(['Shared synthetic illustration; not vehicle-specific camera footage. No pixels were analyzed by the fleet monitor.', referenceImageNote]),
  source: z.literal('synthetic-measurement-rule'),
});
export type FleetDetection = z.infer<typeof detectionSchema>;
export const stationAlertSchema = z.object({
  id: z.string(), incidentId: z.string(), station: z.string(), createdAt: z.string(),
  message: z.string(), channel: z.literal('local-mock-dashboard'), status: z.literal('published'),
});
export type StationAlert = z.infer<typeof stationAlertSchema>;
export const incidentSchema = z.object({
  id: z.string(), createdAt: z.string(), correlationId: z.uuid(),
  mode: z.literal('synthetic-mock'), status: z.literal('Open - engineering review'),
  detection: detectionSchema, summary: z.string(),
  findings: z.object({ production: z.string(), maintenance: z.string(), historical: z.string(),
    probableCause: z.string(), visual: z.string() }),
  recommendations: z.array(z.string()).min(1),
  evidence: z.array(z.object({ source: z.string(), reference: z.string(), observation: z.string(), type: z.string() })),
  audit: z.array(z.object({ at: z.string(), tool: z.string(), outputSummary: z.string(), result: z.string() })),
  skill: z.object({ name: z.string(), version: z.string(), source: z.string(), sha256: z.string().optional() }),
  approval: z.object({ requestId: z.uuid(), approvedAt: z.string(), method: z.enum(['button', 'conversation']).default('button') }),
  alert: stationAlertSchema,
  productionReleaseAuthorized: z.literal(false),
});
export type IncidentRecord = z.infer<typeof incidentSchema>;
export type IncidentSummary = Pick<IncidentRecord, 'id' | 'createdAt' | 'summary' | 'status'> & { vehicleId: string; station: string };
export interface FleetOverview {
  total: number; flagged: number; page: number; pages: number; matching: number;
  vehicles: FleetVehicle[]; detections: FleetDetection[]; incidents: IncidentSummary[];
}
export interface IncidentReceipt {
  id: string; href: string; stationHref: string; alertId: string; station: string;
}
export function outsideSpecification(vehicle: FleetVehicle) {
  return vehicle.limitDirection === 'upper' ? vehicle.measurement > vehicle.limit : vehicle.measurement < vehicle.limit;
}
export function incidentHref(id: string) { return `/?workspace=quality&incident=${encodeURIComponent(id)}`; }
export function stationHref(station: string) { return `/?workspace=quality&station=${encodeURIComponent(station)}`; }
