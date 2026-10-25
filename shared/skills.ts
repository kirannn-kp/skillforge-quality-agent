import { z } from 'zod';
import { scenarioIds } from './domain.js';

export const maxSkillBytes = 24 * 1024;
export const skillAgents = ['Quality Live Agent', 'Production Support Assistant'] as const;
export const skillAgentSchema = z.enum(skillAgents);
export const skillVersionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/, 'Use a version such as 1.1.0-demo').max(50);
export const skillHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const publishedSkillSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(64), description: z.string().min(1).max(1024),
  version: skillVersionSchema, sha256: skillHashSchema, content: z.string().min(1).max(maxSkillBytes),
  guidance: z.string().min(1).max(maxSkillBytes), allowedTools: z.array(z.string().max(2000)).max(50),
  sourceFile: z.string().min(1).max(200), reviewedBy: z.string().trim().min(3).max(80),
  reviewedAt: z.string().datetime(), source: z.enum(['recorder-export', 'manual-guidance']),
  recordingReference: z.string().trim().max(200),
}).strict();
export type PublishedSkill = z.infer<typeof publishedSkillSchema>;
export interface SkillDraft {
  id: string; name: string; description: string; sha256: string; content: string;
  guidance: string; allowedTools: string[]; sourceFile: string;
}
export interface SkillLibrary {
  publications: PublishedSkill[];
  bindings: Partial<Record<typeof skillAgents[number], string>>;
}
export const publishSkillSchema = z.object({
  draftId: z.string().uuid(), sha256: skillHashSchema, version: skillVersionSchema,
  reviewedBy: z.string().trim().min(3).max(80), source: z.enum(['recorder-export', 'manual-guidance']),
  recordingReference: z.string().trim().max(200),
  reviewed: z.literal(true), syntheticOnly: z.literal(true), understandLimits: z.literal(true),
  allowModelContext: z.literal(true),
}).strict().refine(value => value.source !== 'recorder-export' || value.recordingReference.length > 0,
  { message: 'Provide the actual Recorder session/export reference, or choose manual guidance.', path: ['recordingReference'] });
export const bindSkillSchema = z.object({
  agent: skillAgentSchema, publicationId: z.string().uuid(), sha256: skillHashSchema, confirm: z.literal(true),
}).strict();

export const comparisonQuestion = 'Brief the quality engineer on this case and recommend the next verification checks.';
export const comparisonInputSchema = z.object({
  scenarioId: z.enum(scenarioIds),
  mode: z.enum(['baseline', 'expert']),
  consent: z.literal(true),
  expectedSkillHash: skillHashSchema.optional(),
}).strict().refine(value => value.mode === 'expert' ? !!value.expectedSkillHash : !value.expectedSkillHash,
  { message: 'Expert briefings require the expected attached skill hash; baseline briefings must omit it.' });
export const comparisonResultSchema = z.object({
  scenarioId: z.enum(scenarioIds), mode: z.enum(['baseline', 'expert']),
  question: z.literal(comparisonQuestion), contextSha256: skillHashSchema,
  model: z.string().min(1), durationMs: z.number().nonnegative(),
  briefing: z.string().trim().min(1).max(3000),
  skill: z.object({ name: z.string(), version: skillVersionSchema, sha256: skillHashSchema }).strict().optional(),
}).strict();
export type SkillComparisonResult = z.infer<typeof comparisonResultSchema>;
