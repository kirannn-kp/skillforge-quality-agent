import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AzureSpeechService, speechFromEnvironment, type ConnectedSpeech } from '../server/speech';
import { createApp } from '../server/app';
import { maiVoice, speechSsml, speechTestText } from '../shared/speech';

const settings = { endpoint: 'https://synthetic.cognitiveservices.azure.com', resourceId: '/subscriptions/demo/resourceGroups/demo/providers/Microsoft.CognitiveServices/accounts/synthetic',
  region: 'swedencentral', character: 'lisa', style: 'casual-sitting' };
const credential = { getToken: vi.fn(async () => ({ token: 'synthetic-test-token', expiresOnTimestamp: Date.now() + 3600000 })) };
const relay = { Urls: ['turn:relay.example:3478'], Username: 'test-only', Password: 'test-only' };
function fetcher(voice = maiVoice) {
  return vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('voices/list')) return Response.json([{ ShortName: voice }]);
    if (String(url).endsWith('relay/token/v1')) return Response.json(relay);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } });
  });
}
describe('Azure Speech adapter without cloud calls', () => {
  it('reuses transient server authorization instead of spawning developer authentication per turn', async () => {
    const getToken = vi.fn(async () => ({ token: 'synthetic-cached-only', expiresOnTimestamp: Date.now() + 3600000 }));
    const service = new AzureSpeechService(settings, { getToken }, fetcher());
    await service.verify();
    await service.recognitionSession();
    await service.recognitionSession();
    expect(getToken).toHaveBeenCalledOnce();
    expect(JSON.stringify(service.status())).not.toContain('synthetic-cached-only');
  });
  it('is disabled by default and rejects explicit incomplete configuration', async () => {
    expect(speechFromEnvironment({}).status().configured).toBe(false);
    await expect(speechFromEnvironment({}).synthesize('test')).rejects.toThrow('disabled');
    await expect(speechFromEnvironment({}).recognitionSession()).rejects.toThrow('disabled');
    expect(() => speechFromEnvironment({ ENABLE_AZURE_SPEECH: 'true' })).toThrow();
  });
  it('explicitly configures Layla photo-avatar base model without substituting Lisa', async () => {
    const env = { ENABLE_AZURE_SPEECH: 'true', AZURE_SPEECH_ENDPOINT: settings.endpoint,
      AZURE_SPEECH_RESOURCE_ID: settings.resourceId, AZURE_SPEECH_REGION: settings.region,
      AZURE_AVATAR_CHARACTER: 'layla', AZURE_AVATAR_STYLE: '' };
    expect(speechFromEnvironment(env).status()).toMatchObject({ character: 'layla', style: '', photoAvatarBaseModel: 'vasa-1' });
    expect(speechFromEnvironment({ ...env, AZURE_AVATAR_STYLE: undefined }).status().style).toBe('');
    expect(() => speechFromEnvironment({ ...env, AZURE_AVATAR_STYLE: 'casual-sitting' })).toThrow('empty AZURE_AVATAR_STYLE');
    expect(() => speechFromEnvironment({ ...env, AZURE_AVATAR_CHARACTER: 'not-a-supported-character' })).toThrow();
    const layla = new AzureSpeechService({ ...settings, character: 'layla', style: '', photoAvatarBaseModel: 'vasa-1' }, credential, fetcher());
    expect(await layla.avatarSession()).toMatchObject({ character: 'layla', style: '', photoAvatarBaseModel: 'vasa-1', voice: maiVoice });
  });
  it('verifies the exact Flash voice, keeps credentials out of status, and builds Entra avatar authorization', async () => {
    const service = new AzureSpeechService(settings, credential, fetcher());
    const status = await service.verify();
    expect(status.voice).toBe(maiVoice);
    expect(status.avatarRelayAvailable).toBe(true);
    expect(JSON.stringify(status)).not.toContain('synthetic-test-token');
    const session = await service.avatarSession();
    expect(session.authorizationToken).toBe(`aad#${settings.resourceId}#synthetic-test-token`);
    expect(session.expiresAt).toBeLessThanOrEqual(Date.now() + 25 * 60 * 1000);
    expect(session.iceServers[0].urls).toEqual(relay.Urls);
  });
  it('escapes SSML, uses only the requested model, and returns actual audio bytes', async () => {
    const mock = fetcher();
    const service = new AzureSpeechService(settings, credential, mock);
    expect(await service.synthesize('Inspection <only> & "review"')).toEqual(new Uint8Array([1, 2, 3]));
    const [, options] = mock.mock.calls.at(-1)!;
    expect(options?.body).toContain('&lt;only&gt; &amp; &quot;review&quot;');
    expect(options?.body).toContain(maiVoice);
    expect(speechSsml('test')).toContain(maiVoice);
  });
  it('does not select an alternative voice or leak Azure error bodies on failure', async () => {
    const unavailable = new AzureSpeechService(settings, credential, fetcher('en-US-JennyNeural'));
    await expect(unavailable.verify()).rejects.toThrow('No alternative voice');
    expect(unavailable.status().verified).toBe(false);
    const rejected = new AzureSpeechService(settings, credential, vi.fn<typeof fetch>(async () => new Response('private error detail', { status: 403 })));
    await expect(rejected.verify()).rejects.toThrow('HTTP 403');
    expect(rejected.status().reason).not.toContain('private error detail');
  });
  it('authorizes recognition independently of MAI voice and avatar availability', async () => {
    const mock = fetcher();
    const service = new AzureSpeechService(settings, credential, mock);
    const session = await service.recognitionSession();
    expect(session.endpoint).toBe('https://synthetic.cognitiveservices.azure.com/');
    expect(session.authorizationToken).toBe('synthetic-test-token');
    expect(session.language).toBe('en-US');
    expect(session.expiresAt).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
    expect(mock).not.toHaveBeenCalled();
    expect(JSON.stringify(service.status())).not.toContain('synthetic-test-token');
  });
  it('rejects expiring recognition authorization and sanitizes credential errors', async () => {
    const expired = new AzureSpeechService(settings, { getToken: async () => ({ token: 'expired-test-token', expiresOnTimestamp: Date.now() }) }, fetcher());
    await expect(expired.recognitionSession()).rejects.toThrow('too close to expiry');
    const failed = new AzureSpeechService(settings, { getToken: async () => { throw new Error('private credential details'); } }, fetcher());
    await expect(failed.recognitionSession()).rejects.toThrow('authorization failed');
    await expect(failed.recognitionSession()).rejects.not.toThrow('private credential details');
  });
});
describe('Speech REST boundaries', () => {
  const fake: ConnectedSpeech = {
    status: () => ({ configured: true, verified: true, reason: 'test', voice: maiVoice, character: 'lisa', style: 'casual-sitting', avatarRelayAvailable: true }),
    verify: async () => fake.status(),
    synthesize: vi.fn(async () => new Uint8Array([1, 2, 3])),
    avatarSession: vi.fn(async () => ({ authorizationToken: 'test-only', region: 'swedencentral', expiresAt: Date.now() + 60000,
      voice: maiVoice, character: 'lisa', style: 'casual-sitting', iceServers: [{ urls: relay.Urls, username: relay.Username, credential: relay.Password }] })),
    recognitionSession: vi.fn<ConnectedSpeech['recognitionSession']>(async () => ({ authorizationToken: 'test-recognition-only',
      endpoint: 'https://synthetic.cognitiveservices.azure.com/',
      expiresAt: Date.now() + 60000, language: 'en-US' })),
  };
  it('requires a local session and consent before delegating avatar credentials', async () => {
    const app = createApp({ speech: fake, latency: 0 });
    await request(app).post('/api/speech/avatar-session').send({ consent: true }).expect(401);
    const agent = request.agent(app);
    await agent.post('/api/session').send({});
    await agent.post('/api/speech/avatar-session').send({ consent: false }).expect(400);
    await agent.post('/api/reset').send({ scenarioId: 'Q-2048' });
    const result = await agent.post('/api/speech/avatar-session').send({ consent: true }).expect(200);
    expect(result.body.authorizationToken).toBe('test-only');
    const state = await agent.get('/api/state');
    expect(JSON.stringify(state.body)).not.toContain('authorizationToken');
  });
  it('synthesizes only server-owned assistant text or the fixed audition phrase', async () => {
    const agent = request.agent(createApp({ speech: fake, latency: 0 }));
    await agent.post('/api/session').send({});
    await agent.post('/api/speech/audio').send({ consent: true, messageId: 'unknown' }).expect(400);
    await agent.post('/api/reset').send({ scenarioId: 'Q-2048' });
    const audio = await agent.post('/api/speech/audio').send({ consent: true, audition: true }).expect(200);
    expect(audio.headers['content-type']).toContain('audio/mpeg');
    expect(fake.synthesize).toHaveBeenCalledWith(speechTestText);
    await agent.post('/api/speech/audio').send({ consent: true, audition: true }).expect(429);
    await agent.post('/api/reset').send({ scenarioId: 'Q-2048' });
    const start = await agent.post('/api/start').send({});
    await agent.post('/api/speech/audio').send({ consent: true, messageId: start.body.messages[0].id }).expect(200);
    expect(fake.synthesize).toHaveBeenCalledWith(start.body.messages[0].text);
  });
  it('requires session, same origin, consent and rate limits for recognition authorization', async () => {
    const app = createApp({ speech: fake, latency: 0 });
    await request(app).post('/api/speech/recognition-session').send({ consent: true }).expect(401);
    const agent = request.agent(app);
    await agent.post('/api/session').send({});
    await agent.post('/api/speech/recognition-session').set('Origin', 'https://other.example').send({ consent: true }).expect(403);
    await agent.post('/api/speech/recognition-session').send({ consent: false }).expect(400);
    await agent.post('/api/reset').send({ scenarioId: 'Q-2048' });
    const result = await agent.post('/api/speech/recognition-session').send({ consent: true }).expect(200);
    expect(result.body.authorizationToken).toBe('test-recognition-only');
    expect(result.headers['cache-control']).toBe('no-store');
    await agent.post('/api/speech/recognition-session').send({ consent: true }).expect(429);
    expect(JSON.stringify((await agent.get('/api/state')).body)).not.toContain('test-recognition-only');
  });
});
