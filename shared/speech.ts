import type { InvestigationState } from './domain.js';

export const maiVoice = 'en-US-Harper:MAI-Voice-2.1-Flash';
export const speechTestText = 'Quality investigation ready. Synthetic demonstration only.';
export type SpeechProvider = 'browser' | 'mai' | 'avatar';
export type SpeechInputProvider = 'browser' | 'azure';
export interface RecognitionSession {
  endpoint: string; authorizationToken: string; expiresAt: number; language: 'en-US';
}
export interface SpeechCapabilities {
  configured: boolean; verified: boolean; reason: string; voice: string;
  character: string; style: string; region?: string; avatarRelayAvailable: boolean;
  photoAvatarBaseModel?: 'vasa-1';
}
export interface AvatarSession {
  authorizationToken: string; region: string; expiresAt: number;
  voice: string; character: string; style: string;
  photoAvatarBaseModel?: 'vasa-1';
  iceServers: { urls: string[]; username: string; credential: string }[];
}
export function assistantSpeech(state: InvestigationState, messageId: string): string {
  const message = state.messages.find(item => item.id === messageId && item.role === 'assistant');
  if (!message) throw new Error('Assistant message not found in this session.');
  if (message.spokenText) return message.spokenText;
  return state.phase === 'COMPLETE' || message.text.length <= 250 ? message.text :
    'I have updated the investigation with new evidence. Please review the board and transcript for details.';
}
export function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
}
export function speechSsml(text: string, voice = maiVoice): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`;
}
