export type VoiceStatus = 'Ready' | 'Connecting' | 'Listening' | 'Speaking';
interface RecognitionEvent { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } } }
interface Recognition {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
declare global {
  interface Window { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
}
export interface VoiceService {
  startListening(): void; stopListening(): void; speak(text: string): void;
  setMuted(muted: boolean): void; dispose(): void;
}
export class BrowserVoiceService implements VoiceService {
  private recognition?: Recognition;
  private muted = true;
  constructor(private final: (text: string) => void, private partial: (text: string) => void,
    private status: (status: VoiceStatus) => void, private error: (message: string) => void,
    private inputStatus: (status: VoiceStatus) => void = status) {}
  startListening() {
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) { this.error('Speech recognition is unavailable in this browser. Use transcript text input or the guided demo.'); return; }
    this.stopListening();
    window.speechSynthesis?.cancel();
    const recognition = new Constructor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) { this.partial(''); this.final(result[0].transcript); }
        else this.partial(result[0].transcript);
      }
    };
    recognition.onerror = event => { this.error(`Browser speech error: ${event.error}. Text input is still available.`); this.inputStatus('Ready'); };
    recognition.onend = () => { this.partial(''); this.inputStatus('Ready'); };
    this.recognition = recognition;
    try { recognition.start(); this.inputStatus('Listening'); }
    catch (error) { this.error(error instanceof Error ? error.message : 'Microphone could not start.'); }
  }
  stopListening() { this.recognition?.abort(); this.recognition = undefined; this.partial(''); this.inputStatus('Ready'); }
  speak(text: string) {
    if (this.muted) return;
    if (!window.speechSynthesis) { this.error('Browser text-to-speech is unavailable. Read the live transcript.'); return; }
    this.stopListening();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onstart = () => this.status('Speaking');
    utterance.onend = () => this.status('Ready');
    utterance.onerror = event => { if (event.error !== 'canceled' && event.error !== 'interrupted') this.error(`Speech playback failed: ${event.error}`); this.status('Ready'); };
    window.speechSynthesis.speak(utterance);
  }
  setMuted(muted: boolean) { this.muted = muted; if (muted) { window.speechSynthesis?.cancel(); this.status('Ready'); } }
  dispose() { this.stopListening(); window.speechSynthesis?.cancel(); }
}
export class MockVoiceService implements VoiceService {
  constructor(private status: (status: VoiceStatus) => void) {}
  startListening() { this.status('Listening'); }
  stopListening() { this.status('Ready'); }
  speak(_text: string) { this.status('Ready'); }
  setMuted(_muted: boolean) {}
  dispose() { this.status('Ready'); }
}
