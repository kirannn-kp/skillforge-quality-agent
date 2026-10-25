import type { Message, PhotoMetadata, Scenario, VisionAnalysis } from '../shared/domain.js';
import type { VisionService } from './services.js';

export interface FoundryAgentService { respond(messages: Message[]): Promise<string> }
export interface VoiceLiveService { connect(): Promise<void>; disconnect(): void }
export interface SpeechOutputService { synthesize(text: string): Promise<Uint8Array> }
export const connectedStatus = {
  available: false,
  reason: 'Investigation tools and approval workflow remain synthetic. Foundry conversation is a separate opt-in connection; hosted agents, image inference and Voice Live are not connected.',
  integrations: ['Hosted Foundry Agent Service', 'Foundry image inference', 'Voice Live'],
};
export class UnconfiguredFoundryAdapter implements FoundryAgentService {
  async respond(_messages: Message[]): Promise<string> { throw new Error(connectedStatus.reason); }
}
export class UnconfiguredVisionAdapter implements VisionService {
  async analyze(_photo: PhotoMetadata, _scenario: Scenario): Promise<VisionAnalysis> { throw new Error(connectedStatus.reason); }
}
export class UnconfiguredVoiceLiveAdapter implements VoiceLiveService {
  async connect(): Promise<void> { throw new Error(connectedStatus.reason); }
  disconnect(): void {}
}
