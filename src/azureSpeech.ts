import type { AvatarSynthesizer } from 'microsoft-cognitiveservices-speech-sdk';
import type { AvatarSession } from '../shared/speech';
import { speechSsml } from '../shared/speech';
import { api } from './api';
import type { VoiceStatus } from './voice';

export type AvatarStatus = 'Disconnected' | 'Connecting' | 'Live' | 'Failed';
export class AzureSpeechOutput {
  private audio?: HTMLAudioElement;
  private objectUrl?: string;
  private abort?: AbortController;
  private avatar?: AvatarSynthesizer;
  private peer?: RTCPeerConnection;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private muted = true;
  private avatarSpeaking = false;
  private pendingStop: Promise<void> = Promise.resolve();
  private videoElement?: HTMLVideoElement;
  private avatarAudio?: HTMLAudioElement;
  constructor(private status: (status: VoiceStatus) => void, private error: (message: string) => void,
    private avatarStatus: (status: AvatarStatus) => void) {}
  get avatarConnected() { return !!this.avatar && this.peer?.connectionState === 'connected'; }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.avatarAudio) this.avatarAudio.muted = muted;
    if (muted) this.stop();
  }
  stop() {
    this.generation++;
    this.abort?.abort(); this.abort = undefined;
    this.audio?.pause(); this.audio = undefined;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = undefined;
    if (this.avatarConnected && this.avatar && this.avatarSpeaking) {
      const avatar = this.avatar;
      this.avatarSpeaking = false;
      this.pendingStop = avatar.stopSpeakingAsync().catch(() => {
        if (this.avatar !== avatar) return;
        this.error('Could not interrupt the Azure avatar. The session has been disconnected; reconnect explicitly.');
        this.disconnect();
      });
    }
    this.status('Ready');
  }
  async interrupt() {
    this.stop();
    await this.pendingStop;
  }
  async connect(video: HTMLVideoElement, audio: HTMLAudioElement) {
    this.disconnect();
    this.avatarStatus('Connecting');
    const generation = this.generation;
    this.videoElement = video; this.avatarAudio = audio; audio.muted = this.muted;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const [sdk, session] = await Promise.all([
        import('microsoft-cognitiveservices-speech-sdk'),
        api<AvatarSession>('speech/avatar-session', { consent: true }),
      ]);
      if (generation !== this.generation) return;
      if (session.expiresAt <= Date.now()) throw new Error('Avatar authorization is too close to expiry. Refresh developer authentication.');
      const config = sdk.SpeechConfig.fromAuthorizationToken(session.authorizationToken, session.region);
      config.speechSynthesisVoiceName = session.voice;
      const avatarConfig = new sdk.AvatarConfig(session.character, session.style, new sdk.AvatarVideoFormat());
      if (session.photoAvatarBaseModel) avatarConfig.photoAvatarBaseModel = session.photoAvatarBaseModel;
      const synthesizer = new sdk.AvatarSynthesizer(config, avatarConfig);
      const peer = new RTCPeerConnection({ iceServers: session.iceServers });
      this.avatar = synthesizer; this.peer = peer;
      const playing = new Promise<void>((resolve, reject) => {
        startupTimer = setTimeout(() => reject(new Error('Avatar video did not start within 40 seconds. Check WebRTC/TURN network access.')), 40000);
        video.onplaying = () => { clearTimeout(startupTimer); resolve(); };
        peer.onconnectionstatechange = () => {
          if (['failed', 'disconnected'].includes(peer.connectionState)) {
            reject(new Error('Avatar WebRTC connection failed or disconnected.'));
            if (generation === this.generation) {
              this.error('Azure avatar disconnected. No placeholder or browser voice was substituted. Reconnect explicitly unless recording mode is active.');
              this.disconnect(); this.avatarStatus('Failed');
            }
          }
        };
        peer.ontrack = event => {
          const stream = event.streams[0] ?? new MediaStream([event.track]);
          const element = event.track.kind === 'video' ? video : audio;
          element.srcObject = stream;
          void element.play().catch(() => {
            reject(new Error('Browser blocked avatar media playback. Enable playback and reconnect.'));
          });
        };
      });
      // Attach immediately so an early WebRTC/playback rejection is not unhandled.
      peer.addTransceiver('video', { direction: 'sendrecv' });
      peer.addTransceiver('audio', { direction: 'sendrecv' });
      const started = Promise.all([synthesizer.startAvatarAsync(peer), playing]);
      const [result] = await started;
      if (result.reason === sdk.ResultReason.Canceled) throw new Error('Azure rejected avatar startup. Check Speech permissions, avatar support and quota.');
      if (generation !== this.generation) return;
      this.avatarStatus('Live');
      this.timer = setTimeout(() => {
        this.disconnect();
        this.error('Avatar session ended before authorization expiry. Reconnect explicitly unless recording mode is active.');
      }, session.expiresAt - Date.now());
    } catch (error) {
      clearTimeout(startupTimer);
      if (generation !== this.generation) return;
      this.disconnect(); this.avatarStatus('Failed');
      this.error(error instanceof Error && !/token|authorization|wss:|Bearer/i.test(error.message) ? error.message :
        'Azure avatar could not connect. Check identity, region, quota and WebRTC connectivity. No fallback was used.');
    }
  }
  async speak(input: { text: string; messageId?: string; audition?: boolean; avatar: boolean }) {
    if (this.muted) return;
    this.stop();
    const generation = this.generation;
    try {
      await this.pendingStop;
      if (generation !== this.generation) return;
      this.status('Speaking');
      if (input.avatar) {
        if (!this.avatarConnected || !this.avatar) throw new Error('Connect the Azure avatar first. No browser or audio-only fallback was used.');
        const { ResultReason } = await import('microsoft-cognitiveservices-speech-sdk');
        this.avatarSpeaking = true;
        const result = await this.avatar.speakSsmlAsync(speechSsml(input.text));
        if (generation !== this.generation) return;
        this.avatarSpeaking = false;
        if (result.reason === ResultReason.Canceled) throw new Error('Azure rejected avatar speech with MAI-Voice-2.1-Flash. No different voice was selected.');
      } else {
        this.abort = new AbortController();
        const response = await fetch('/api/speech/audio', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consent: true, messageId: input.messageId, audition: input.audition }), signal: this.abort.signal });
        if (!response.ok) {
          const body: { error: string } = await response.json();
          throw new Error(body.error);
        }
        const blob = await response.blob();
        if (generation !== this.generation) return;
        this.objectUrl = URL.createObjectURL(blob);
        const audio = new Audio(this.objectUrl);
        this.audio = audio;
        audio.onended = () => { if (generation === this.generation) this.stop(); };
        audio.onerror = () => { if (generation === this.generation) { this.stop(); this.error('Azure speech audio could not be played. No browser voice fallback was used.'); } };
        await audio.play();
        return;
      }
      if (generation === this.generation) this.status('Ready');
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.error(error instanceof Error && !/wss:|Bearer|aad#/i.test(error.message) ? error.message : 'Azure speech failed. No alternative voice was selected.');
    }
  }
  disconnect() {
    this.stop();
    this.avatarSpeaking = false;
    clearTimeout(this.timer);
    const avatar = this.avatar; this.avatar = undefined;
    this.peer?.close(); this.peer = undefined;
    if (this.videoElement) { this.videoElement.srcObject = null; this.videoElement.onplaying = null; }
    if (this.avatarAudio) this.avatarAudio.srcObject = null;
    if (avatar) void avatar.close().catch(() => this.error('Azure avatar cleanup failed. Reload to close remaining local connections.'));
    this.avatarStatus('Disconnected');
  }
}
