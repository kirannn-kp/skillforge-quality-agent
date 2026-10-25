import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureSpeechInput } from '../src/azureSpeechInput';
import { api } from '../src/api';
import type { RecognitionSession } from '../shared/speech';

interface FakeRecognizer {
  sessionStarted?: () => void;
  recognizing?: (sender: unknown, event: { result: { text: string } }) => void;
  result?: (result: { reason: number; text: string }) => void;
  failure?: (error: string) => void;
  recognized?: (sender: unknown, event: { result: { reason: number; text: string } }) => void;
  close: ReturnType<typeof vi.fn>;
}
const mocks = vi.hoisted(() => ({
  recognizers: [] as FakeRecognizer[],
  audioClose: vi.fn(),
  fromEndpoint: vi.fn(() => ({ speechRecognitionLanguage: '', setProperty: vi.fn() })),
}));
vi.mock('../src/api', () => ({ api: vi.fn() }));
vi.mock('microsoft-cognitiveservices-speech-sdk', () => ({
  SpeechConfig: { fromEndpoint: mocks.fromEndpoint },
  AudioConfig: { fromStreamInput: () => ({ close: mocks.audioClose }) },
  PropertyId: { SpeechServiceConnection_InitialSilenceTimeoutMs: 1, Speech_SegmentationSilenceTimeoutMs: 31 },
  ResultReason: { RecognizedSpeech: 3, NoMatch: 0, Canceled: 1 },
  SpeechRecognizer: class implements FakeRecognizer {
    result?: FakeRecognizer['result'];
    failure?: FakeRecognizer['failure'];
    recognized?: FakeRecognizer['recognized'];
    close = vi.fn((done?: () => void) => done?.());
    constructor() { mocks.recognizers.push(this); }
    startContinuousRecognitionAsync(_done: unknown, failure: FakeRecognizer['failure']) {
      this.result = result => this.recognized?.(undefined, { result }); this.failure = failure;
    }
  },
}));

describe('Azure microphone lifecycle without cloud calls', () => {
  const final = vi.fn(), partial = vi.fn(), status = vi.fn(), error = vi.fn(), trackStop = vi.fn();
  const stream = { getTracks: () => [{ stop: trackStop }] };
  const getUserMedia = vi.fn(async () => stream);
  const session = (): RecognitionSession => ({ endpoint: 'https://synthetic.cognitiveservices.azure.com/',
    authorizationToken: 'synthetic-test-only', expiresAt: Date.now() + 300000, language: 'en-US' });
  let input: AzureSpeechInput;
  beforeEach(() => {
    vi.clearAllMocks(); mocks.recognizers.length = 0;
    vi.mocked(api).mockResolvedValue(session());
    getUserMedia.mockResolvedValue(stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    input = new AzureSpeechInput(final, partial, status, error);
  });
  afterEach(() => { input.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('streams partial text and submits exactly one final utterance, then releases the microphone', async () => {
    await input.startListening();
    const recognizer = mocks.recognizers[0];
    recognizer.sessionStarted?.();
    expect(status).toHaveBeenLastCalledWith('Listening');
    recognizer.recognizing?.(undefined, { result: { text: 'Station' } });
    expect(partial).toHaveBeenLastCalledWith('Station');
    recognizer.result?.({ reason: 3, text: ' Station 42. ' });
    await vi.waitFor(() => expect(mocks.audioClose).toHaveBeenCalledOnce());
    expect(final).toHaveBeenCalledExactlyOnceWith('Station 42.');
    expect(trackStop).toHaveBeenCalledOnce();
    expect(recognizer.close).toHaveBeenCalledOnce();
    expect(mocks.audioClose).toHaveBeenCalledOnce();
    recognizer.result?.({ reason: 3, text: 'stale result' });
    expect(final).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });
  it('does not open the microphone when authorization fails', async () => {
    vi.mocked(api).mockRejectedValue(new Error('Azure Speech is disabled.'));
    await input.startListening();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Azure Speech is disabled.');
    expect(status).toHaveBeenLastCalledWith('Ready');
  });
  it('reports denied microphone permission without forwarding private SDK errors', async () => {
    getUserMedia.mockRejectedValue(new DOMException('private details', 'NotAllowedError'));
    await input.startListening();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('permission was denied'));
    expect(mocks.recognizers).toHaveLength(0);
  });
  it('suppresses authorization completion after stop', async () => {
    let resolve!: (value: RecognitionSession) => void;
    vi.mocked(api).mockReturnValue(new Promise<RecognitionSession>(done => { resolve = done; }));
    const starting = input.startListening();
    await vi.waitFor(() => expect(api).toHaveBeenCalledOnce());
    input.stopListening();
    resolve(session());
    await starting;
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(final).not.toHaveBeenCalled();
  });
  it('stops a microphone permission result arriving after cancellation', async () => {
    let resolve!: (value: typeof stream) => void;
    getUserMedia.mockReturnValue(new Promise(done => { resolve = done; }));
    const starting = input.startListening();
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    input.stopListening();
    resolve(stream);
    await starting;
    expect(trackStop).toHaveBeenCalledOnce();
    expect(mocks.recognizers).toHaveLength(0);
  });
  it('keeps the existing connection on no-match, but fails explicitly on network errors', async () => {
    await input.startListening();
    mocks.recognizers[0].result?.({ reason: 0, text: '' });
    expect(error).not.toHaveBeenCalled();
    expect(partial).toHaveBeenLastCalledWith(expect.stringContaining("I'm still listening"));
    expect(trackStop).not.toHaveBeenCalled();
    await input.startListening();
    mocks.recognizers[1].failure?.('Bearer private-sdk-data wss://private-url');
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining('connection failed'));
    expect(JSON.stringify(error.mock.calls)).not.toContain('private-sdk-data');
    expect(trackStop).toHaveBeenCalledTimes(2);
    expect(final).not.toHaveBeenCalled();
  });
  it('pauses politely after 60 seconds and ignores late callbacks without reconnecting', async () => {
    vi.useFakeTimers();
    const paused = vi.fn();
    input = new AzureSpeechInput(final, partial, status, error, paused);
    await input.startListening();
    mocks.recognizers[0].sessionStarted?.();
    await vi.advanceTimersByTimeAsync(60000);
    expect(paused).toHaveBeenCalledWith(expect.stringContaining('paused after 60 seconds'));
    expect(error).not.toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalledOnce();
    mocks.recognizers[0].result?.({ reason: 3, text: 'late result' });
    expect(final).not.toHaveBeenCalled();
  });
  it('reuses unexpired in-memory authorization and requests fresh authorization near expiry', async () => {
    vi.useFakeTimers();
    await input.startListening();
    input.stopListening();
    await input.startListening();
    expect(api).toHaveBeenCalledOnce();
    input.stopListening();
    await vi.advanceTimersByTimeAsync(240001);
    vi.mocked(api).mockResolvedValue(session());
    await input.startListening();
    expect(api).toHaveBeenCalledTimes(2);
    const config = mocks.fromEndpoint.mock.results.at(-1)!.value;
    expect(config.setProperty).toHaveBeenCalledWith(31, '900');
  });
  it('rejects expired authorization before microphone capture', async () => {
    vi.mocked(api).mockResolvedValue({ ...session(), expiresAt: Date.now() - 1 });
    await input.startListening();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('expired'));
  });
  it('waits for the previous recognizer to close before opening another microphone stream', async () => {
    await input.startListening();
    let closed!: () => void;
    mocks.recognizers[0].close.mockImplementation((done: () => void) => { closed = done; });
    input.stopListening();
    const restarting = input.startListening();
    await vi.waitFor(() => expect(mocks.recognizers[0].close).toHaveBeenCalledOnce());
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    closed();
    await restarting;
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(mocks.audioClose).toHaveBeenCalledTimes(1);
  });
});
