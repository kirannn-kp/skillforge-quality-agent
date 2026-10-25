import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import type { Skill } from '../shared/domain.js';
import { bindSkillSchema, maxSkillBytes, publishedSkillSchema, publishSkillSchema, skillAgents, skillAgentSchema,
  type SkillDraft, type SkillLibrary } from '../shared/skills.js';
import { WorkflowError } from './engine.js';
import { LocalSkillRegistry } from './services.js';

const hash = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex');
const documentSchema = z.object({
  publications: z.array(publishedSkillSchema).max(100),
  bindings: z.partialRecord(skillAgentSchema, z.string().uuid()),
}).strict();
const metadataSchema = z.object({
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  description: z.string().trim().min(1).max(1024),
  'allowed-tools': z.union([z.string().max(2000), z.array(z.string().max(200)).max(50)]).optional(),
}).passthrough();

function parseSkillContent(content: string) {
  if (Buffer.byteLength(content, 'utf8') > maxSkillBytes || content.includes('\0')) {
    throw new WorkflowError('Choose a UTF-8 Markdown skill of at most 24 KB, without NUL bytes.', 400);
  }
  const match = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/);
  if (!match || match[1].length > 8192) throw new WorkflowError('A skill requires bounded YAML frontmatter and a non-empty Markdown body.', 400);
  const parsed = parseDocument(match[1], { uniqueKeys: true, schema: 'core' });
  if (parsed.errors.length || parsed.warnings.length) throw new WorkflowError('Invalid or unsupported YAML frontmatter. Correct the export before importing.', 400);
  let value: unknown;
  try { value = parsed.toJS({ maxAliasCount: 20 }); }
  catch { throw new WorkflowError('YAML aliases exceed the import limit. Use plain frontmatter.', 400); }
  const metadata = metadataSchema.parse(value);
  const guidance = match[2].trim();
  if (!guidance) throw new WorkflowError('Skill guidance cannot be empty.', 400);
  const tools = metadata['allowed-tools'];
  const allowedTools = typeof tools === 'string' ? [tools] : tools ?? [];
  return { name: metadata.name, description: metadata.description, guidance, allowedTools };
}

export class FileSkillLibrary {
  private data: SkillLibrary;
  private drafts = new Map<string, { owner: string; created: number; draft: SkillDraft }>();
  private file: string;
  constructor(private directory: string) {
    this.file = join(directory, 'library.json');
    this.data = existsSync(this.file) ? documentSchema.parse(JSON.parse(readFileSync(this.file, 'utf8'))) :
      { publications: [], bindings: {} };
    for (const publication of this.data.publications) {
      const parsed = parseSkillContent(publication.content);
      if (hash(publication.content) !== publication.sha256 || parsed.guidance !== publication.guidance ||
        parsed.name !== publication.name || parsed.description !== publication.description ||
        JSON.stringify(parsed.allowedTools) !== JSON.stringify(publication.allowedTools)) {
        throw new Error('Stored skill integrity check failed. Repair the library before starting.');
      }
    }
    for (const id of Object.values(this.data.bindings)) {
      if (!this.data.publications.some(item => item.id === id)) throw new Error('Stored skill binding references a missing publication.');
    }
  }
  snapshot(): SkillLibrary { return structuredClone(this.data); }
  private save(next: SkillLibrary) {
    mkdirSync(this.directory, { recursive: true });
    const temporary = join(this.directory, `library-${randomUUID()}.tmp`);
    writeFileSync(temporary, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    renameSync(temporary, this.file);
    this.data = next;
  }
  stage(owner: string, sourceFile: string, content: string): SkillDraft {
    const parsed = parseSkillContent(content);
    for (const [id, item] of this.drafts) if (item.owner === owner || Date.now() - item.created > 30 * 60 * 1000) this.drafts.delete(id);
    if (this.drafts.size >= 50) throw new WorkflowError('Draft capacity reached. Finish reviews or retry after drafts expire.', 429);
    const draft: SkillDraft = { id: randomUUID(), ...parsed, sha256: hash(content), content, sourceFile };
    this.drafts.set(draft.id, { owner, created: Date.now(), draft });
    return structuredClone(draft);
  }
  publish(owner: string, input: z.infer<typeof publishSkillSchema>) {
    const review = publishSkillSchema.parse(input);
    const staged = this.drafts.get(review.draftId);
    if (!staged || staged.owner !== owner || Date.now() - staged.created > 30 * 60 * 1000) {
      throw new WorkflowError('This draft is unavailable or expired. Import it again for a fresh review.', 409);
    }
    if (review.sha256 !== staged.draft.sha256) throw new WorkflowError('The reviewed content hash does not match this draft.', 409);
    if (this.data.publications.length >= 100) throw new WorkflowError('Local publication capacity reached.', 409);
    if (this.data.publications.some(item => item.name === staged.draft.name && item.version === review.version)) {
      throw new WorkflowError('That skill name/version is already published. Choose a new version; publications are immutable.', 409);
    }
    const publication = publishedSkillSchema.parse({ ...staged.draft, id: randomUUID(), version: review.version,
      reviewedBy: review.reviewedBy, reviewedAt: new Date().toISOString(), source: review.source,
      recordingReference: review.recordingReference });
    this.save({ ...this.data, publications: [...this.data.publications, publication] });
    this.drafts.delete(review.draftId);
    return structuredClone(publication);
  }
  bind(input: z.infer<typeof bindSkillSchema>) {
    const binding = bindSkillSchema.parse(input);
    const publication = this.data.publications.find(item => item.id === binding.publicationId);
    if (!publication || publication.sha256 !== binding.sha256) throw new WorkflowError('Published skill/version/hash not found. Refresh the library.', 409);
    this.save({ ...this.data, bindings: { ...this.data.bindings, [binding.agent]: publication.id } });
  }
  unbind(agent: typeof skillAgents[number]) {
    const bindings = { ...this.data.bindings };
    delete bindings[agent];
    this.save({ ...this.data, bindings });
  }
  forAgent(agent: string) {
    const validated = skillAgentSchema.parse(agent);
    const id = this.data.bindings[validated];
    return id ? structuredClone(this.data.publications.find(item => item.id === id)) : undefined;
  }
}

export class ReviewedSkillRegistry extends LocalSkillRegistry {
  constructor(private library: FileSkillLibrary) { super(); }
  override load(name: string, agent?: string): Skill {
    const base = super.load(name);
    const publication = agent ? this.library.forAgent(agent) : undefined;
    if (!publication) return base;
    return { ...base, name: publication.name, description: publication.description, version: publication.version,
      content: publication.content, guidance: publication.guidance,
      source: publication.source === 'recorder-export' ? 'Operator-declared Recorder export; reviewed local guidance' : 'Manually supplied, reviewed local guidance',
      provenance: { publicationId: publication.id, sha256: publication.sha256, reviewedBy: publication.reviewedBy,
        reviewedAt: publication.reviewedAt, source: publication.source, recordingReference: publication.recordingReference } };
  }
  override attach(name: string, agent: string, pinned?: Skill): Skill {
    if (!pinned) return super.attach(name, agent);
    return structuredClone({ ...pinned, attachedAgents: [...new Set([...pinned.attachedAgents, agent])] });
  }
}
