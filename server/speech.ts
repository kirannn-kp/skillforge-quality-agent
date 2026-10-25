import { DefaultAzureCredential } from '@azure/identity';
import { z } from 'zod';
import { maiVoice, speechSsml, type AvatarSession, type RecognitionSession, type SpeechCapabilities } from '../shared/speech.js';
import { WorkflowError } from './engine.js';
import type { SpeechOutputService } from './adapters.js';

export interface ConnectedSpeech extends SpeechOutputService {
  status(): SpeechCapabilities;
  verify(): Promise<SpeechCapabilities>;
  avatarSession(): Promise<AvatarSession>;
  recognitionSession(): Promise<RecognitionSession>;
}
export interface SpeechSettings {
  endpoint: string; resourceId: string; region: string; character: string; style: string;
  photoAvatarBaseModel?: 'vasa-1';
}
type TokenCredential = Pick<DefaultAzureCredential, 'getToken'>;
const relaySchema = z.object({ Urls: z.array(z.string()).min(1), Username: z.string().min(1), Password: z.string().min(1) });
const voicesSchema = z.array(z.object({ ShortName: z.string() }));

export class AzureSpeechService implements ConnectedSpeech {
  private verified = false;
  private reason = 'Configured; check Azure access before using connected speech.';
  private relayAvailable = false;
  private cachedToken?: Awaited<ReturnType<TokenCredential['getToken']>>;
  private tokenRequest?: ReturnType<TokenCredential['getToken']>;
  constructor(private settings: SpeechSettings, private credential: TokenCredential = new DefaultAzureCredential(),
    private fetcher: typeof fetch = fetch) {}
  status(): SpeechCapabilities {
    return { configured: true, verified: this.verified, reason: this.reason, voice: maiVoice,
      character: this.settings.character, style: this.settings.style, region: this.settings.region,
      ...(this.settings.photoAvatarBaseModel ? { photoAvatarBaseModel: this.settings.photoAvatarBaseModel } : {}),
      avatarRelayAvailable: this.relayAvailable };
  }
  private async token() {
    if (this.cachedToken && Math.min(this.cachedToken.expiresOnTimestamp,
      this.cachedToken.refreshAfterTimestamp ?? this.cachedToken.expiresOnTimestamp) > Date.now() + 120000) return this.cachedToken;
    this.tokenRequest ??= this.credential.getToken('https://cognitiveservices.azure.com/.default');
    try {
      const token = await this.tokenRequest;
      if (!token) throw new WorkflowError('Azure Speech authentication returned no token. Sign in with Azure CLI or configure managed identity.', 503);
      this.cachedToken = token;
      return token;
    } finally { this.tokenRequest = undefined; }
  }
  private async send(path: string, token: string, options: RequestInit = {}) {
    const response = await this.fetcher(`${this.settings.endpoint}${path}`, {
      ...options, signal: AbortSignal.timeout(45000),
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      // Do not forward Azure bodies or SDK errors that may contain credential-bearing URLs.
      throw new WorkflowError(`Azure Speech returned HTTP ${response.status}. Check Speech RBAC, region, voice availability, and resource access. No browser/mock fallback was used.`, 502);
    }
    return response;
  }
  async verify() {
    this.verified = false; this.relayAvailable = false;
    try {
      const token = await this.token();
      const voices = voicesSchema.parse(await (await this.send('/tts/cognitiveservices/voices/list', token.token)).json());
      if (!voices.some(voice => voice.ShortName === maiVoice)) throw new WorkflowError('The requested MAI-Voice-2.1-Flash voice is not offered by this resource. No alternative voice was selected.', 503);
      this.verified = true;
      this.reason = 'MAI Flash voice listed. Avatar video and voice compatibility require an explicit live connection.';
      relaySchema.parse(await (await this.send('/tts/cognitiveservices/avatar/relay/token/v1', token.token)).json());
      this.relayAvailable = true;
      return this.status();
    } catch (error) {
      this.reason = error instanceof WorkflowError ? error.message : 'Azure Speech verification failed. Check developer identity, permissions and connectivity.';
      console.error(JSON.stringify({ event: 'speech.verify.failed', error: this.reason }));
      throw new WorkflowError(this.reason, 503);
    }
  }
  async synthesize(text: string) {
    if (!this.verified) await this.verify();
    const token = await this.token();
    const response = await this.send('/tts/cognitiveservices/v1', token.token, {
      method: 'POST', headers: { 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3' },
      body: speechSsml(text),
    });
    if (!response.headers.get('content-type')?.startsWith('audio/')) throw new WorkflowError('Azure Speech returned a non-audio response.', 502);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) throw new WorkflowError('Azure Speech returned empty audio.', 502);
    return bytes;
  }
  async avatarSession(): Promise<AvatarSession> {
    if (!this.verified || !this.relayAvailable) await this.verify();
    const token = await this.token();
    const relay = relaySchema.parse(await (await this.send('/tts/cognitiveservices/avatar/relay/token/v1', token.token)).json());
    const urls = relay.Urls.filter(url => /^turns?:/.test(url));
    if (!urls.length) throw new WorkflowError('Avatar relay did not return a supported TURN URL.', 502);
    return {
      authorizationToken: `aad#${this.settings.resourceId}#${token.token}`, region: this.settings.region,
      expiresAt: Math.min(token.expiresOnTimestamp - 60000, Date.now() + 25 * 60 * 1000),
      voice: maiVoice, character: this.settings.character, style: this.settings.style,
      ...(this.settings.photoAvatarBaseModel ? { photoAvatarBaseModel: this.settings.photoAvatarBaseModel } : {}),
      iceServers: [{ urls, username: relay.Username, credential: relay.Password }],
    };
  }
  async recognitionSession(): Promise<RecognitionSession> {
    try {
      const token = await this.token();
      const expiresAt = Math.min(token.expiresOnTimestamp - 60000, Date.now() + 5 * 60 * 1000);
      if (expiresAt <= Date.now()) throw new WorkflowError('Azure Speech authorization is too close to expiry. Refresh developer authentication.', 503);
      const endpoint = new URL(this.settings.endpoint);
      return { endpoint: endpoint.href, authorizationToken: token.token, expiresAt, language: 'en-US' };
    } catch (error) {
      const message = error instanceof WorkflowError ? error.message :
        'Azure Speech-to-Text authorization failed. Check developer identity and Speech permissions. No browser fallback was used.';
      console.error(JSON.stringify({ event: 'speech.recognition.authorization.failed', error: message }));
      throw new WorkflowError(message, 503);
    }
  }
}
export class DisabledSpeechService implements ConnectedSpeech {
  status(): SpeechCapabilities { return { configured: false, verified: false, reason: 'Azure Speech is disabled. Set ENABLE_AZURE_SPEECH=true and the Speech resource settings to opt in.',
    voice: maiVoice, character: 'lisa', style: 'casual-sitting', avatarRelayAvailable: false }; }
  async verify(): Promise<SpeechCapabilities> { throw new WorkflowError(this.status().reason, 503); }
  async synthesize(_text: string): Promise<Uint8Array> { throw new WorkflowError(this.status().reason, 503); }
  async avatarSession(): Promise<AvatarSession> { throw new WorkflowError(this.status().reason, 503); }
  async recognitionSession(): Promise<RecognitionSession> { throw new WorkflowError(this.status().reason, 503); }
}
export function speechFromEnvironment(env: NodeJS.ProcessEnv = process.env): ConnectedSpeech {
  if (env.ENABLE_AZURE_SPEECH !== 'true') return new DisabledSpeechService();
  const settings = z.object({
    endpoint: z.url().refine(value => /^https:\/\/[a-z0-9-]+\.cognitiveservices\.azure\.com\/?$/i.test(value), 'Use the HTTPS Speech custom-domain endpoint.'),
    resourceId: z.string().regex(/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.CognitiveServices\/accounts\/[^/]+$/i),
    region: z.string().regex(/^[a-z]+$/),
    character: z.enum(['lisa', 'layla']), style: z.string(),
  }).parse({ endpoint: env.AZURE_SPEECH_ENDPOINT, resourceId: env.AZURE_SPEECH_RESOURCE_ID,
    region: env.AZURE_SPEECH_REGION, character: env.AZURE_AVATAR_CHARACTER ?? 'lisa',
    style: env.AZURE_AVATAR_STYLE ?? (env.AZURE_AVATAR_CHARACTER === 'layla' ? '' : 'casual-sitting') });
  if (settings.style !== (settings.character === 'layla' ? '' : 'casual-sitting')) {
    throw new WorkflowError('Use an empty AZURE_AVATAR_STYLE for Layla or casual-sitting for Lisa. No alternative avatar was selected.', 503);
  }
  return new AzureSpeechService({ ...settings, endpoint: settings.endpoint.replace(/\/$/, ''),
    ...(settings.character === 'layla' ? { photoAvatarBaseModel: 'vasa-1' } : {}) });
}
