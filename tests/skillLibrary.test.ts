import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileSkillLibrary, ReviewedSkillRegistry } from '../server/skillLibrary';
import { InvestigationEngine } from '../server/engine';
import { createApp } from '../server/app';
import { AzureConversationService, type ConversationService } from '../server/conversation';
import type { ConversationTurn } from '../shared/conversation';
import { maxSkillBytes, type SkillDraft } from '../shared/skills';
import { manualGuidanceFixture } from './fixtures/skillGuidance';

const directories: string[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'quality-skill-library-test-'));
  directories.push(path);
  return path;
}
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function review(draft: SkillDraft, version = '1.1.0-test') {
  return { draftId: draft.id, sha256: draft.sha256, version, reviewedBy: 'Synthetic test reviewer',
    source: 'manual-guidance' as const, recordingReference: '', reviewed: true as const,
    syntheticOnly: true as const, understandLimits: true as const, allowModelContext: true as const };
}
function publish(library: FileSkillLibrary, version = '1.1.0-test') {
  const draft = library.stage('owner', 'SKILL.md', manualGuidanceFixture);
  return library.publish('owner', review(draft, version));
}
const empty: ConversationTurn['fields'] = { issue: null, component: null, station: null,
  reportedCount: null, vehicle: null, plant: null, line: null };
const turn = (fields: ConversationTurn['fields'] = empty): ConversationService => ({
  status: () => ({ configured: true, model: 'synthetic-model' }), prepare: async () => {},
  respond: async () => ({ fields, reply: 'What have you observed?' }),
});

describe('bounded genuine Markdown import and reviewed publication', () => {
  it('previews exact content/hash without attaching or publishing, preserving declared permissions as inert text', () => {
    const library = new FileSkillLibrary(directory());
    const draft = library.stage('owner', 'SKILL.md', manualGuidanceFixture);
    expect(draft.sha256).toBe(createHash('sha256').update(manualGuidanceFixture).digest('hex'));
    expect(draft.content).toBe(manualGuidanceFixture);
    expect(draft.allowedTools).toEqual(['Read', 'Bash(example-only *)']);
    expect(library.snapshot()).toEqual({ publications: [], bindings: {} });
    expect(new ReviewedSkillRegistry(library).load('vehicle-quality-investigation', 'Quality Live Agent').guidance).toBeUndefined();
  });
  it.each([
    'not frontmatter',
    '---\nname: missing-description\n---\nBody',
    '---\nname: Invalid Name\ndescription: test\n---\nBody',
    '---\nname: duplicate\nname: duplicate-again\ndescription: test\n---\nBody',
    '---\nname: empty\ndescription: test\n---\n  ',
    manualGuidanceFixture + '\0',
    manualGuidanceFixture + 'x'.repeat(maxSkillBytes),
    manualGuidanceFixture + '界'.repeat(maxSkillBytes / 2),
  ])('rejects malformed, empty, NUL or over-limit input', content => {
    expect(() => new FileSkillLibrary(directory()).stage('owner', 'SKILL.md', content)).toThrow();
  });
  it('accepts CRLF and UTF-8 BOM without changing the original file hash or content', () => {
    const content = '\uFEFF' + manualGuidanceFixture.replace(/\n/g, '\r\n');
    const library = new FileSkillLibrary(directory());
    const draft = library.stage('owner', 'SKILL.md', content);
    expect(draft.content).toBe(content);
    expect(draft.guidance).toContain('measure, correlate, validate');
    expect(library.publish('owner', review(draft)).content).toBe(content);
  });
  it('accepts the exact 24 KB UTF-8 bound and rejects one byte above it', () => {
    const library = new FileSkillLibrary(directory());
    const exact = manualGuidanceFixture + 'x'.repeat(maxSkillBytes - Buffer.byteLength(manualGuidanceFixture));
    expect(Buffer.byteLength(exact)).toBe(maxSkillBytes);
    expect(library.stage('owner', 'SKILL.md', exact).content).toBe(exact);
    expect(() => library.stage('owner', 'SKILL.md', exact + 'x')).toThrow('24 KB');
  });
  it('requires all server-side review consents and a real supplied reference for declared Recorder exports', () => {
    const library = new FileSkillLibrary(directory());
    const draft = library.stage('owner', 'SKILL.md', manualGuidanceFixture);
    for (const key of ['reviewed', 'syntheticOnly', 'understandLimits', 'allowModelContext']) {
      expect(() => library.publish('owner', { ...review(draft), [key]: false })).toThrow();
    }
    expect(() => library.publish('owner', { ...review(draft), source: 'recorder-export' })).toThrow('reference');
    expect(library.snapshot().publications).toHaveLength(0);
    const result = library.publish('owner', { ...review(draft), source: 'recorder-export', recordingReference: 'Operator-supplied test session reference; not verified' });
    expect(result.source).toBe('recorder-export');
    expect(new ReviewedSkillRegistry(library).load('vehicle-quality-investigation', 'Quality Live Agent').source).toContain('Synthetic');
  });
  it('rejects other sessions, content-hash substitutions, superseded drafts and replayed publication', () => {
    const library = new FileSkillLibrary(directory());
    const old = library.stage('owner', 'SKILL.md', manualGuidanceFixture);
    expect(() => library.publish('other-owner', review(old))).toThrow('unavailable');
    expect(() => library.publish('owner', { ...review(old), sha256: '0'.repeat(64) })).toThrow('hash');
    const next = library.stage('owner', 'SKILL.md', manualGuidanceFixture + '\nAdditional reviewed text.');
    expect(() => library.publish('owner', review(old))).toThrow('unavailable');
    library.publish('owner', review(next));
    expect(() => library.publish('owner', review(next))).toThrow('unavailable');
    const duplicate = library.stage('owner', 'SKILL.md', manualGuidanceFixture);
    expect(() => library.publish('owner', review(duplicate))).toThrow('immutable');
  });
  it('expires a draft after 30 minutes rather than accepting an old review', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      const library = new FileSkillLibrary(directory());
      const draft = library.stage('owner', 'SKILL.md', manualGuidanceFixture);
      clock.mockReturnValue(1000 + 30 * 60 * 1000 + 1);
      expect(() => library.publish('owner', review(draft))).toThrow('expired');
    } finally { clock.mockRestore(); }
  });
});

describe('durable bindings and exact per-investigation guidance', () => {
  it('persists immutable reviewed content, source, version and selected agent binding across restart', () => {
    const root = directory(), library = new FileSkillLibrary(root);
    const result = publish(library);
    expect(library.forAgent('Quality Live Agent')).toBeUndefined();
    library.bind({ agent: 'Quality Live Agent', publicationId: result.id, sha256: result.sha256, confirm: true });
    const restored = new FileSkillLibrary(root), registry = new ReviewedSkillRegistry(restored);
    const skill = registry.load('vehicle-quality-investigation', 'Quality Live Agent');
    expect(skill.guidance).toBe(result.guidance);
    expect(skill.steps).toHaveLength(14);
    expect(skill.provenance).toMatchObject({ sha256: result.sha256, source: 'manual-guidance', reviewedBy: result.reviewedBy });
    expect(registry.load('vehicle-quality-investigation', 'Production Support Assistant').version).toBe('1.0.0');
    const copy = restored.snapshot(); copy.publications[0].guidance = 'modified copy';
    expect(restored.forAgent('Quality Live Agent')?.guidance).toBe(result.guidance);
    restored.unbind('Quality Live Agent');
    expect(new FileSkillLibrary(root).forAgent('Quality Live Agent')).toBeUndefined();
  });
  it.each(['content', 'guidance'] as const)('fails explicitly on stored %s tampering without reverting to the bundled example', field => {
    const root = directory(), library = new FileSkillLibrary(root);
    publish(library);
    const file = join(root, 'library.json');
    const document = JSON.parse(readFileSync(file, 'utf8'));
    document.publications[0][field] += 'tampered';
    writeFileSync(file, JSON.stringify(document));
    expect(() => new FileSkillLibrary(root)).toThrow('integrity');
  });
  it('keeps a started case pinned through a later attachment, including pre-evidence station/agent corrections', async () => {
    const library = new FileSkillLibrary(directory()), registry = new ReviewedSkillRegistry(library);
    const engine = new InvestigationEngine('Q-2048', registry, 0);
    engine.start();
    const result = publish(library);
    for (const agent of ['Quality Live Agent', 'Production Support Assistant'] as const) {
      library.bind({ agent, publicationId: result.id, sha256: result.sha256, confirm: true });
    }
    expect(() => engine.refreshSkillBinding()).toThrow('remain pinned');
    await engine.converse('Station 43.', turn({ ...empty, station: 'Station 43' }));
    expect(engine.state.skillVersion).toBe('1.0.0');
    await engine.converse('Correction: Paint Booth 7.', turn({ ...empty, station: 'Paint Booth 7' }));
    expect(engine.state.agent).toBe('Production Support Assistant');
    expect(engine.state.skillVersion).toBe('1.0.0');
    engine.reset('Q-2048');
    expect(engine.state.skillVersion).toBe(result.version);
    expect(engine.currentSkill().guidance).toBe(result.guidance);
    for (let index = 0; index < 5; index++) await engine.advance();
    expect(engine.state.audit.find(item => item.tool === 'skill.load')?.outputSummary).toContain(result.sha256);
    expect(engine.state.approval?.status).toBe('pending');
    expect(engine.state.action).toBeUndefined();
    const second = publish(library, '1.2.0-test');
    library.bind({ agent: 'Quality Live Agent', publicationId: second.id, sha256: second.sha256, confirm: true });
    expect(engine.state.skillVersion).toBe(result.version);
    expect(engine.currentSkill().version).toBe(result.version);
    engine.reset();
    expect(engine.state.approval).toBeUndefined();
    expect(engine.state.skillVersion).toBe(second.version);
  });
  it('passes the actual attached body/name/version/hash into the model request, not just a UI badge', async () => {
    const library = new FileSkillLibrary(directory()), publication = publish(library);
    library.bind({ agent: 'Quality Live Agent', publicationId: publication.id, sha256: publication.sha256, confirm: true });
    const engine = new InvestigationEngine('Q-2048', new ReviewedSkillRegistry(library), 0);
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ fields: empty, reply: 'What have you observed?' }) } }],
    }));
    const adapter = new AzureConversationService({ endpoint: 'https://synthetic.openai.azure.com', deployment: 'synthetic-test', apiVersion: '2025-01-01-preview' },
      { getToken: async () => ({ token: 'synthetic-only-token', expiresOnTimestamp: Date.now() + 3600000 }) }, fetcher);
    await engine.converse('How do you investigate?', adapter);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.messages[0].content).toContain(publication.guidance);
    expect(body.messages[0].content).toContain(publication.sha256);
    expect(body.messages[0].content).toContain(`${publication.name} v${publication.version}`);
    expect(body.messages[0].content).toContain('Fixed server evidence/approval controls take priority');
    expect(engine.state.action).toBeUndefined();
  });
});

describe('authenticated review APIs and tab-safe session reuse', () => {
  it('requires a session, rejects bad requests, enforces review and refreshes only idle case pins', async () => {
    const app = createApp({ skillDirectory: directory(), latency: 0 });
    await request(app).get('/api/skills').expect(401);
    const first = request.agent(app), other = request.agent(app);
    const original = await first.post('/api/session').send({});
    await other.post('/api/session').send({});
    const resumed = await first.post('/api/session').send({ reuse: true }).expect(200);
    expect(resumed.body.correlationId).toBe(original.body.correlationId);
    await first.post('/api/skills/import').send({ sourceFile: 'capture.zip', content: manualGuidanceFixture }).expect(400);
    const imported = await first.post('/api/skills/import').send({ sourceFile: 'SKILL.md', content: manualGuidanceFixture }).expect(200);
    await other.post('/api/skills/publish').send(review(imported.body)).expect(409);
    await first.post('/api/skills/publish').send({ ...review(imported.body), reviewed: false }).expect(400);
    const publication = (await first.post('/api/skills/publish').send(review(imported.body)).expect(200)).body;
    expect((await first.get('/api/skill')).body.version).toBe('1.0.0');
    await first.post('/api/skills/attach').send({ agent: 'Unknown agent', publicationId: publication.id, sha256: publication.sha256, confirm: true }).expect(400);
    await first.post('/api/skills/attach').send({ agent: 'Quality Live Agent', publicationId: publication.id, sha256: '0'.repeat(64), confirm: true }).expect(409);
    await first.post('/api/start').send({}).expect(200);
    await first.post('/api/skills/attach').send({ agent: 'Quality Live Agent', publicationId: publication.id, sha256: publication.sha256, confirm: true }).expect(200);
    expect((await first.get('/api/skill')).body.version).toBe('1.0.0');
    expect((await other.get('/api/skill')).body.version).toBe(publication.version);
    await first.post('/api/reset').send({ scenarioId: 'Q-2049' }).expect(200);
    const current = (await first.get('/api/skill')).body;
    expect(current.provenance.sha256).toBe(publication.sha256);
    expect(current.guidance).toBe(publication.guidance);
    await first.post('/api/action').send({}).expect(403);
    await first.post('/api/skills/detach').send({ agent: 'Quality Live Agent', confirm: false }).expect(400);
    await first.post('/api/skills/detach').send({ agent: 'Quality Live Agent', confirm: true }).expect(200);
    expect((await first.get('/api/skill')).body.version).toBe('1.0.0');
    const denied = await first.post('/api/skills/import').set('Origin', 'https://unrelated.invalid')
      .send({ sourceFile: 'SKILL.md', content: manualGuidanceFixture }).expect(403);
    expect(denied.body.error).toContain('Cross-origin');
  });
});
