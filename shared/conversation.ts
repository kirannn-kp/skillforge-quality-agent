import { z } from 'zod';

export const conversationTurnSchema = z.object({
  reply: z.string().trim().min(1).max(420),
  fields: z.object({
    issue: z.string().trim().min(1).max(500).nullable(),
    component: z.string().trim().min(1).max(120).nullable(),
    station: z.string().trim().min(1).max(120).nullable(),
    reportedCount: z.number().int().min(1).max(10000).nullable(),
    vehicle: z.string().trim().min(1).max(120).nullable(),
    plant: z.string().trim().min(1).max(120).nullable(),
    line: z.string().trim().min(1).max(120).nullable(),
  }).strict(),
}).strict();
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;
export interface ConversationStatus { configured: boolean; model?: string }
export interface ConversationTiming { model: string; durationMs: number }
export const incidentConfirmationSchema = z.object({ requestId: z.uuid(), promptId: z.uuid() }).strict();
export type IncidentConfirmationInput = z.infer<typeof incidentConfirmationSchema>;
