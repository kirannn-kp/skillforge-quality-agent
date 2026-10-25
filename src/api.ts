import type { InvestigationState, Skill } from '../shared/domain';
import type { SpeechCapabilities } from '../shared/speech';
import type { ConversationStatus } from '../shared/conversation';
import type { VisionCapabilities } from '../shared/vision';
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const result: { error?: string } = await response.json();
    throw new Error(result.error ?? `Request failed (${response.status}).`);
  }
  return response.json();
}
export interface Health { mode: string; maxImageBytes: number; speech: SpeechCapabilities; conversation?: ConversationStatus;
  vision?: VisionCapabilities; connected: { available: boolean; reason: string; integrations: string[] } }
export async function bootstrap() {
  const [state, health] = await Promise.all([api<InvestigationState>('session', { reuse: true }), api<Health>('health')]);
  const skill = await api<Skill>('skill');
  return { state, health, skill };
}
