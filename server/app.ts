import express from 'express';
import type { Request } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { InvestigationEngine, WorkflowError } from './engine.js';
import { connectedStatus } from './adapters.js';
import { DisabledSpeechService, type ConnectedSpeech } from './speech.js';
import { assistantSpeech, speechTestText } from '../shared/speech.js';
import { comparisonEvidence, DisabledConversationService, type ConversationService } from './conversation.js';
import type { VisionService } from './services.js';
import { maxVisionImageBytes, scenarioIds } from '../shared/domain.js';
import type { VisionCapabilities } from '../shared/vision.js';
import { resolve } from 'node:path';
import { FileSkillLibrary, ReviewedSkillRegistry } from './skillLibrary.js';
import { bindSkillSchema, comparisonInputSchema, comparisonQuestion, comparisonResultSchema, maxSkillBytes, publishSkillSchema, skillAgentSchema } from '../shared/skills.js';
import { scenarios } from '../shared/scenarios.js';
import { IncidentError, IncidentStore } from './incidentStore.js';
import { incidentConfirmationSchema } from '../shared/conversation.js';

const scenarioSchema = z.enum(scenarioIds);
export function createApp(options: { latency?: number; maxImageBytes?: number; speech?: ConnectedSpeech; conversation?: ConversationService;
  vision?: VisionService & { status(): VisionCapabilities }; skillDirectory?: string; incidentStore?: IncidentStore } = {}) {
  const app = express();
  const sessions = new Map<string, { engine: InvestigationEngine; lastSeen: number }>();
  const library = new FileSkillLibrary(options.skillDirectory ?? resolve('.local', 'skill-library'));
  const registry = new ReviewedSkillRegistry(library);
  const incidents = options.incidentStore ?? new IncidentStore();
  const maxImageBytes = options.maxImageBytes ?? 8 * 1024 * 1024;
  const speech = options.speech ?? new DisabledSpeechService();
  const conversation: ConversationService = options.conversation ?? new DisabledConversationService();
  const speechRequests = new Map<string, number>();
  const comparisonRequests = new Set<string>();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
    if (req.path.startsWith('/api') && !['GET', 'HEAD'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && new URL(origin).host !== req.get('host')) {
        res.status(403).json({ error: 'Cross-origin control requests are not allowed.' }); return;
      }
      if (!req.is('application/json')) { res.status(415).json({ error: 'JSON content type is required.' }); return; }
    }
    next();
  });
  app.use('/api/photo/analyze', express.json({ limit: '2mb' }));
  app.use('/api/skills/import', express.json({ limit: '64kb' }));
  app.use(express.json({ limit: '32kb' }));
  const cookieId = (req: Request) => req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('quality_session='))?.slice(16);
  const engineFor = (req: Request) => {
    const session = sessions.get(cookieId(req) ?? '');
    if (!session) throw new WorkflowError('Session expired. Reload to start a new local session.', 401);
    session.lastSeen = Date.now();
    return session.engine;
  };
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: 'mock', connected: connectedStatus,
    speech: speech.status(), conversation: conversation.status(), vision: options.vision?.status() ?? { configured: false }, maxImageBytes }));
  app.post('/api/session', (req, res) => {
    const input = z.object({ reuse: z.boolean().default(false) }).strict().parse(req.body ?? {});
    const existing = input.reuse ? sessions.get(cookieId(req) ?? '') : undefined;
    if (existing && Date.now() - existing.lastSeen <= 2 * 60 * 60 * 1000) {
      existing.lastSeen = Date.now();
      res.json(existing.engine.snapshot());
      return;
    }
    for (const [id, session] of sessions) {
      if (Date.now() - session.lastSeen > 2 * 60 * 60 * 1000) { session.engine.reset(); sessions.delete(id); }
    }
    if (sessions.size >= 100) throw new WorkflowError('Local session capacity reached; restart the demo server.', 503);
    const id = randomUUID();
    const engine = new InvestigationEngine('Q-2048', registry, options.latency, incidents);
    sessions.set(id, { engine, lastSeen: Date.now() });
    res.cookie('quality_session', id, { httpOnly: true, sameSite: 'strict', maxAge: 2 * 60 * 60 * 1000 });
    res.json(engine.snapshot());
  });
  app.get('/api/state', (req, res) => res.json(engineFor(req).snapshot()));
  app.get('/api/skill', (req, res) => res.json(engineFor(req).currentSkill()));
  app.get('/api/fleet', (req, res) => {
    engineFor(req);
    const input = z.object({ search: z.string().max(80).default(''), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict().parse(req.query);
    res.json(incidents.overview(input.search, input.page));
  });
  app.get('/api/incidents', (req, res) => { engineFor(req); res.json(incidents.list()); });
  app.get('/api/incidents/:id', (req, res) => { engineFor(req); res.json(incidents.get(z.string().max(60).parse(req.params.id))); });
  app.get('/api/station-alerts', (req, res) => {
    engineFor(req);
    const { station } = z.object({ station: z.literal('Station 42') }).strict().parse(req.query);
    res.json(incidents.alerts(station));
  });
  app.post('/api/detections/investigate', async (req, res) => {
    const engine = engineFor(req);
    const input = z.object({ vehicleId: z.string().regex(/^DEMO-\d{5}$/), syntheticReplay: z.literal(true) }).strict().parse(req.body);
    await engine.investigateDetection(incidents.detection(input.vehicleId));
    res.json(engine.snapshot());
  });
  app.get('/api/skills', (req, res) => { engineFor(req); res.json(library.snapshot()); });
  app.post('/api/skills/briefing', async (req, res) => {
    engineFor(req);
    const input = comparisonInputSchema.parse(req.body);
    const model = conversation.status().model;
    if (!conversation.status().configured || !conversation.brief || !model) {
      throw new WorkflowError('A connected Foundry conversation model is required for comparison. No mock fallback was used.', 503);
    }
    const owner = cookieId(req)!;
    if (comparisonRequests.has(owner)) throw new WorkflowError('A briefing comparison is already running. Wait for it to finish.', 429);
    const publication = input.mode === 'expert' ? library.forAgent(scenarios[input.scenarioId].agent) : undefined;
    if (input.mode === 'expert' && (!publication || publication.sha256 !== input.expectedSkillHash)) {
      throw new WorkflowError('The attached skill changed or is unavailable. Refresh attached guidance before comparing.', 409);
    }
    const evidence = comparisonEvidence(input.scenarioId);
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.once('close', abort);
    comparisonRequests.add(owner);
    const started = Date.now();
    try {
      const briefing = await conversation.brief(evidence, publication?.guidance, AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]));
      res.json(comparisonResultSchema.parse({
        scenarioId: input.scenarioId, mode: input.mode, question: comparisonQuestion,
        contextSha256: createHash('sha256').update(evidence).digest('hex'), model,
        durationMs: Date.now() - started, briefing,
        ...(publication ? { skill: { name: publication.name, version: publication.version, sha256: publication.sha256 } } : {}),
      }));
    } finally {
      comparisonRequests.delete(owner);
      res.off('close', abort);
    }
  });
  app.post('/api/skills/import', (req, res) => {
    engineFor(req);
    const input = z.object({ sourceFile: z.string().trim().min(1).max(200).regex(/\.md$/i),
      content: z.string().min(1).max(maxSkillBytes) }).strict().parse(req.body);
    res.json(library.stage(cookieId(req)!, input.sourceFile, input.content));
  });
  app.post('/api/skills/publish', (req, res) => {
    engineFor(req);
    res.json(library.publish(cookieId(req)!, publishSkillSchema.parse(req.body)));
  });
  const refreshIdleSkills = () => {
    for (const session of sessions.values()) if (session.engine.state.phase === 'IDLE') session.engine.refreshSkillBinding();
  };
  app.post('/api/skills/attach', (req, res) => {
    const engine = engineFor(req);
    const input = bindSkillSchema.parse(req.body);
    library.bind(input);
    refreshIdleSkills();
    res.json({ library: library.snapshot(), appliesTo: 'New investigations only; existing investigations remain version-pinned.',
      current: engine.snapshot() });
  });
  app.post('/api/skills/detach', (req, res) => {
    engineFor(req);
    const input = z.object({ agent: skillAgentSchema, confirm: z.literal(true) }).strict().parse(req.body);
    library.unbind(input.agent);
    refreshIdleSkills();
    res.json(library.snapshot());
  });
  const speechGuard = (req: Request) => {
    const engine = engineFor(req);
    const id = engine.state.correlationId;
    if (Date.now() - (speechRequests.get(id) ?? 0) < 1000) throw new WorkflowError('Wait one second between Azure Speech requests.', 429);
    speechRequests.set(id, Date.now());
    if (speechRequests.size > 200) speechRequests.delete(speechRequests.keys().next().value!);
    return engine;
  };
  app.post('/api/speech/verify', async (req, res) => { speechGuard(req); res.json(await speech.verify()); });
  app.post('/api/speech/avatar-session', async (req, res) => {
    speechGuard(req);
    z.object({ consent: z.literal(true) }).parse(req.body);
    res.json(await speech.avatarSession());
  });
  app.post('/api/speech/recognition-session', async (req, res) => {
    speechGuard(req);
    z.object({ consent: z.literal(true) }).strict().parse(req.body);
    res.json(await speech.recognitionSession());
  });
  app.post('/api/speech/audio', async (req, res) => {
    const engine = speechGuard(req);
    const input = z.object({ consent: z.literal(true), messageId: z.string().optional(), audition: z.boolean().optional() }).parse(req.body);
    if (!input.audition && !input.messageId) throw new WorkflowError('Select an assistant transcript message to synthesize.', 400);
    if (input.messageId && !engine.state.messages.some(message => message.id === input.messageId && message.role === 'assistant')) {
      throw new WorkflowError('Assistant message not found in this session.', 400);
    }
    const text = input.audition ? speechTestText : assistantSpeech(engine.snapshot(), input.messageId!);
    const audio = await speech.synthesize(text);
    console.log(JSON.stringify({ event: 'speech.synthesized', correlationId: engine.state.correlationId,
      voice: speech.status().voice, bytes: audio.length }));
    res.type('audio/mpeg').send(Buffer.from(audio));
  });
  app.get('/api/events', (req, res) => {
    const engine = engineFor(req);
    res.set({ 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive' });
    res.flushHeaders();
    const send = (state: ReturnType<typeof engine.snapshot>) => res.write(`data: ${JSON.stringify(state)}\n\n`);
    send(engine.snapshot());
    const unsubscribe = engine.subscribe(send);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
  });
  app.post('/api/start', (req, res) => { const engine = engineFor(req); engine.start(); res.json(engine.snapshot()); });
  app.post('/api/advance', async (req, res) => { const engine = engineFor(req); await engine.advance(); res.json(engine.snapshot()); });
  app.post('/api/input', (req, res) => {
    const { text } = z.object({ text: z.string().trim().min(1).max(2000) }).parse(req.body);
    const engine = engineFor(req); engine.input(text); res.json(engine.snapshot());
  });
  app.post('/api/conversation', async (req, res) => {
    const { text, confirmation } = z.object({ text: z.string().trim().min(1).max(2000), confirmation: incidentConfirmationSchema.optional() }).strict().parse(req.body);
    const engine = engineFor(req);
    await engine.converse(text, conversation, confirmation);
    res.json(engine.snapshot());
  });
  app.post('/api/photo', async (req, res) => {
    if (options.vision) throw new WorkflowError('Connected image analysis requires explicit consent and image content. Use the consented photo upload.', 400);
    const metadata = z.object({ name: z.string().min(1).max(200), type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      size: z.number().int().positive().max(maxImageBytes), sample: z.literal(false) }).parse(req.body);
    const engine = engineFor(req); await engine.collectPhoto(metadata); res.json(engine.snapshot());
  });
  app.post('/api/photo/analyze', async (req, res) => {
    const engine = engineFor(req);
    if (!options.vision) throw new WorkflowError('Azure image analysis is not configured. No mock fallback was used.', 503);
    const input = z.object({
      name: z.string().min(1).max(200), type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      size: z.number().int().positive().max(maxImageBytes), sample: z.literal(false),
      consent: z.literal(true), dataUrl: z.string().max(Math.ceil(maxVisionImageBytes / 3) * 4 + 30),
    }).strict().parse(req.body);
    const prefix = 'data:image/jpeg;base64,';
    const encoded = input.dataUrl.startsWith(prefix) ? input.dataUrl.slice(prefix.length) : '';
    if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new WorkflowError('Provide a valid, re-encoded JPEG image, not an image URL.', 400);
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length < 5 || bytes.length > maxVisionImageBytes || bytes.toString('base64') !== encoded ||
      bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
      throw new WorkflowError('Invalid JPEG content or image exceeds the 1 MB analysis limit.', 400);
    }
    const { name, size, type, sample } = input;
    await engine.collectPhoto({ name, size, type, sample }, { service: options.vision,
      image: { consent: true, dataUrl: input.dataUrl } });
    res.json(engine.snapshot());
  });
  app.post('/api/approval', (req, res) => {
    const { requestId, decision } = z.object({ requestId: z.uuid(), decision: z.enum(['approve', 'reject']) }).parse(req.body);
    const engine = engineFor(req);
    const token = engine.decide(requestId, decision);
    res.json({ token, state: engine.snapshot() });
  });
  app.post('/api/action', async (req, res) => {
    const engine = engineFor(req);
    // Missing tokens reach the workflow guard too, so denied action attempts are audited.
    const { approvalToken } = z.object({ approvalToken: z.string().max(100).default('') }).parse(req.body);
    const action = await engine.createAction(approvalToken);
    res.json({ action, state: engine.snapshot() });
  });
  app.post('/api/reset', (req, res) => {
    const { scenarioId } = z.object({ scenarioId: scenarioSchema }).parse(req.body);
    const engine = engineFor(req); engine.reset(scenarioId); res.json(engine.snapshot());
  });
  app.post('/api/cancel', (req, res) => { const engine = engineFor(req); engine.cancel(); res.json(engine.snapshot()); });
  app.post('/api/settings', (req, res) => {
    const settings = z.object({ failProduction: z.boolean().optional(), noHistorical: z.boolean().optional(),
      speed: z.number().min(0.5).max(4).optional() }).strict().parse(req.body);
    const engine = engineFor(req); engine.configure(settings); res.json(engine.snapshot());
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));
  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const tooLarge = typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large';
    const status = tooLarge ? 413 : error instanceof WorkflowError || error instanceof IncidentError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500;
    const message = error instanceof z.ZodError ? error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(';') :
      tooLarge ? 'Request exceeds the allowed payload size.' : error instanceof SyntaxError ? 'Malformed JSON request.' :
        error instanceof Error ? error.message : 'Unexpected server error.';
    console.error(JSON.stringify({ at: new Date().toISOString(), path: req.path, status, error: message }));
    res.status(status).json({ error: status === 500 ? 'Server operation failed. See the structured server log.' : message });
  });
  return app;
}
