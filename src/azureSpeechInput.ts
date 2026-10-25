import type { AudioConfig, SpeechRecognizer } from 'microsoft-cognitiveservices-speech-sdk';
import type { RecognitionSession } from '../shared/speech';
import { api } from './api';
import type { VoiceStatus } from './voice';

export class AzureSpeechInput {
  private recognizer?: SpeechRecognizer;
  private audio?: AudioConfig;
  private stream?: MediaStream;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private pendingClose: Promise<void> = Promise.resolve();
  private session?: RecognitionSession;
  constructor(private final: (text: string) => void, private partial: (text: string) => void,
    private status: (status: VoiceStatus) => void, private error: (message: string) => void,
    private paused?: (message: string) => void) {}

  private async authorization() {
    if (this.session && this.session.expiresAt > Date.now() + 60000) return this.session;
    const session = await api<RecognitionSession>('speech/recognition-session', { consent: true });
    this.session = session;
    return session;
  }

  async startListening() {
    this.stopListening();
    const generation = this.generation;
    this.status('Connecting');
    this.timer = setTimeout(() => this.fail(generation,
      'Azure Speech-to-Text connection timed out. Start the microphone again to retry. No browser fallback was used.'), 15000);
    try {
      await this.pendingClose;
      if (generation !== this.generation) return;
      const [sdk, session] = await Promise.all([
        import('microsoft-cognitiveservices-speech-sdk'),
        this.authorization(),
      ]);
      if (generation !== this.generation) return;
      if (session.expiresAt <= Date.now()) throw new Error('Azure Speech authorization expired. Start the microphone again.');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture is unavailable. Use a supported browser with microphone access.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const config = sdk.SpeechConfig.fromEndpoint(new URL(session.endpoint), {
        getToken: async () => {
          if (session.expiresAt <= Date.now()) throw new Error('Speech authorization expired.');
          return { token: session.authorizationToken, expiresOnTimestamp: session.expiresAt };
        },
      });
      config.speechRecognitionLanguage = session.language;
      config.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '30000');
      config.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '900');
      this.audio = sdk.AudioConfig.fromStreamInput(stream);
      const recognizer = new sdk.SpeechRecognizer(config, this.audio);
      this.recognizer = recognizer;
      recognizer.sessionStarted = () => {
        if (generation !== this.generation) return;
        clearTimeout(this.timer);
        this.status('Listening');
        this.timer = setTimeout(() => {
          if (generation !== this.generation) return;
          this.stopListening();
          (this.paused ?? this.error)('Microphone paused after 60 seconds without a completed answer. Start conversation or the microphone when ready.');
        }, 60000);
      };
      recognizer.recognizing = (_sender, event) => { if (generation === this.generation) this.partial(event.result.text); };
      recognizer.recognized = (_sender, event) => {
        const result = event.result;
        if (generation !== this.generation) return;
        if (result.reason === sdk.ResultReason.RecognizedSpeech && result.text.trim()) {
          const text = result.text.trim();
          this.stopListening();
          this.final(text);
        } else if (result.reason === sdk.ResultReason.NoMatch) {
          this.partial("I didn't catch that. I'm still listening; please try again.");
        } else {
          this.fail(generation, 'Azure Speech-to-Text was canceled. Check Speech permissions, quota and network access. No browser fallback was used.');
        }
      };
      recognizer.canceled = () => this.fail(generation,
        'Azure Speech-to-Text was canceled. Check Speech permissions, quota and network access. No browser fallback was used.');
      recognizer.startContinuousRecognitionAsync(undefined, () => this.fail(generation,
        'Azure Speech-to-Text connection failed. Check microphone access, Speech permissions and network connectivity. No browser fallback was used.'));
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'NotAllowedError' ?
        'Microphone permission was denied. Allow microphone access in the browser and retry.' :
        error instanceof DOMException && error.name === 'NotFoundError' ? 'No microphone was found. Connect a microphone and retry.' :
        error instanceof Error && !/Bearer|aad#|wss:|https?:/i.test(error.message) ? error.message :
        'Azure Speech-to-Text could not start. Check microphone access and Azure connectivity. No browser fallback was used.';
      this.fail(generation, message);
    }
  }

  private fail(generation: number, message: string) {
    if (generation !== this.generation) return;
    this.session = undefined;
    this.stopListening();
    this.error(message);
  }
  stopListening() {
    this.generation++;
    clearTimeout(this.timer);
    const recognizer = this.recognizer;
    const audio = this.audio;
    this.recognizer = undefined;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    this.audio = undefined;
    if (recognizer) {
      this.pendingClose = this.pendingClose.then(() => new Promise<void>(resolve => {
        recognizer.close(() => { audio?.close(); resolve(); }, () => {
          audio?.close();
          this.error('Azure microphone recognizer could not close cleanly. The microphone tracks were stopped.');
          resolve();
        });
      }));
    } else audio?.close();
    this.partial('');
    this.status('Ready');
  }
  dispose() { this.session = undefined; this.stopListening(); }
}
