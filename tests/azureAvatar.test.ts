// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureSpeechOutput } from '../src/azureSpeech';
import { maiVoice } from '../shared/speech';

const mock = vi.hoisted(() => ({
  character: '', style: '', baseModel: '', voice: '', ssml: '', playing: undefined as (() => void) | undefined,
  fail: false, photo: true, close: vi.fn(),
}));
vi.mock('../src/api', () => ({
  api: async () => ({ authorizationToken: 'synthetic-only', expiresAt: Date.now() + 60000,
    region: 'swedencentral', voice: maiVoice, character: mock.photo ? 'layla' : 'lisa',
    style: mock.photo ? '' : 'casual-sitting', ...(mock.photo ? { photoAvatarBaseModel: 'vasa-1' } : {}), iceServers: [] }),
}));
vi.mock('microsoft-cognitiveservices-speech-sdk', () => ({
  SpeechConfig: { fromAuthorizationToken: () => ({
    set speechSynthesisVoiceName(value: string) { mock.voice = value; },
  }) },
  AvatarVideoFormat: class {},
  AvatarConfig: class {
    constructor(character: string, style: string) { mock.character = character; mock.style = style; }
    set photoAvatarBaseModel(value: string) { mock.baseModel = value; }
  },
  AvatarSynthesizer: class {
    async startAvatarAsync() { mock.playing?.(); return { reason: mock.fail ? 1 : 0 }; }
    async speakSsmlAsync(ssml: string) { mock.ssml = ssml; return { reason: 0 }; }
    close = mock.close;
  },
  ResultReason: { Canceled: 1 },
}));
describe('Azure avatar character configuration without paid services', () => {
  let output: AzureSpeechOutput;
  const error = vi.fn(), avatarStatus = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    mock.photo = true; mock.fail = false; mock.baseModel = ''; mock.ssml = '';
    vi.stubGlobal('RTCPeerConnection', class {
      connectionState = 'connected';
      addTransceiver() {}
      close() {}
    });
    output = new AzureSpeechOutput(vi.fn(), error, avatarStatus);
    mock.close.mockResolvedValue(undefined);
  });
  afterEach(() => { output.disconnect(); vi.unstubAllGlobals(); });
  async function connect() {
    const video = document.createElement('video');
    mock.playing = () => video.dispatchEvent(new Event('playing'));
    await output.connect(video, document.createElement('audio'));
  }
  it('starts Layla with vasa-1 and speaks using the exact MAI Flash voice', async () => {
    await connect();
    expect(mock.character).toBe('layla');
    expect(mock.style).toBe('');
    expect(mock.baseModel).toBe('vasa-1');
    expect(mock.voice).toBe(maiVoice);
    expect(avatarStatus).toHaveBeenLastCalledWith('Live');
    output.setMuted(false);
    await output.speak({ text: 'What have you observed?', avatar: true });
    expect(mock.ssml).toContain(maiVoice);
    expect(mock.ssml).toContain('What have you observed?');
    expect(error).not.toHaveBeenCalled();
  });
  it('preserves the explicitly configured Lisa video-avatar option', async () => {
    mock.photo = false;
    await connect();
    expect(mock.character).toBe('lisa');
    expect(mock.style).toBe('casual-sitting');
    expect(mock.baseModel).toBe('');
  });
  it('surfaces rejected Layla startup instead of substituting a video avatar', async () => {
    mock.fail = true;
    await connect();
    expect(avatarStatus).toHaveBeenLastCalledWith('Failed');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Azure rejected avatar startup'));
    expect(mock.character).toBe('layla');
  });
});
