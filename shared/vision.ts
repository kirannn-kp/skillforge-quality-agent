import { z } from 'zod';

export interface VisionImage { dataUrl: string; consent: true }
export interface VisionCapabilities { configured: boolean; model?: string }
export const visionResultSchema = z.object({
  relevance: z.enum(['relevant', 'unclear', 'unrelated']),
  summary: z.string().trim().min(1).max(350),
  observations: z.array(z.object({
    region: z.string().trim().min(1).max(100),
    observation: z.string().trim().min(1).max(300),
    classification: z.literal('requires_validation'),
    limitations: z.string().trim().min(1).max(350),
  }).strict()).min(1).max(3),
  recommendedNextChecks: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
}).strict();
