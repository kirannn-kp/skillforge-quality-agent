import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Check, FileText, Layers3, ShieldCheck, Upload } from 'lucide-react';
import { scenarioIds, type Scenario } from '../shared/domain';
import { maxSkillBytes, skillAgents, type PublishedSkill, type SkillDraft, type SkillLibrary } from '../shared/skills';
import { scenarios } from '../shared/scenarios';
import { api, bootstrap } from './api';
import { Badge, MeasurementChart } from './components';
import { SkillComparison } from './SkillComparison';
import './skillStudio.css';

const acknowledgements = {
  reviewed: 'I reviewed the complete file and approve this exact content for publication.',
  syntheticOnly: 'The file contains synthetic demonstration guidance only, without credentials or real factory data.',
  understandLimits: 'This is guidance for the fixed server workflow, not executable code or new tool permissions.',
  allowModelContext: 'I allow this reviewed guidance to be sent to the configured Azure conversation model when used.',
};
const emptyChecks = { reviewed: false, syntheticOnly: false, understandLimits: false, allowModelContext: false };

export default function SkillStudio() {
  const [library, setLibrary] = useState<SkillLibrary>();
  const [draft, setDraft] = useState<SkillDraft>();
  const [version, setVersion] = useState('1.1.0-demo');
  const [reviewer, setReviewer] = useState('');
  const [source, setSource] = useState<'recorder-export' | 'manual-guidance'>('recorder-export');
  const [recordingReference, setRecordingReference] = useState('');
  const [checks, setChecks] = useState(emptyChecks);
  const [publicationId, setPublicationId] = useState('');
  const [agent, setAgent] = useState<typeof skillAgents[number]>(skillAgents[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expertId, setExpertId] = useState<Scenario['id']>('Q-2048');
  const [recordView, setRecordView] = useState<'issue' | 'production' | 'maintenance' | 'knowledge'>('issue');
  const [hypothesis, setHypothesis] = useState('');
  const [nextChecks, setNextChecks] = useState('');
  const expert = new URLSearchParams(location.search).get('view') === 'expert';
  const comparison = new URLSearchParams(location.search).get('view') === 'comparison';
  const theme = document.documentElement.getAttribute('data-theme') ?? 'dark';
  const studioUrl = `/?workspace=skills&scoutTheme=${encodeURIComponent(theme)}`;
  const publication = library?.publications.find(item => item.id === publicationId);
  const scenario = scenarios[expertId];

  useEffect(() => {
    let active = true;
    void bootstrap().then(() => api<SkillLibrary>('skills')).then(result => {
      if (active) setLibrary(result);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Skill workspace could not load.'); });
    return () => { active = false; };
  }, []);

  async function perform(operation: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Skill operation failed.'); }
    finally { setBusy(false); }
  }
  async function importFile(file: File) {
    setDraft(undefined); setChecks(emptyChecks);
    if (!/\.md$/i.test(file.name) || file.name.length > 200 || file.size < 1 || file.size > maxSkillBytes) {
      throw new Error('Choose a UTF-8 .md export of 1 byte to 24 KB. ZIPs, scripts and resource bundles are not imported.');
    }
    const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    const result = await api<SkillDraft>('skills/import', { sourceFile: file.name, content });
    setDraft(result);
    setNotice('Draft imported for review only. It is not published or attached.');
  }
  async function publish() {
    if (!draft) throw new Error('Import a draft before publishing.');
    const result = await api<PublishedSkill>('skills/publish', {
      draftId: draft.id, sha256: draft.sha256, version, reviewedBy: reviewer, source, recordingReference, ...checks,
    });
    setLibrary(await api<SkillLibrary>('skills'));
    setPublicationId(result.id); setDraft(undefined); setChecks(emptyChecks);
    setNotice(`Published ${result.name} v${result.version}. Review receipt and exact content are saved locally; attach it below.`);
  }
  async function attach() {
    if (!publication) throw new Error('Choose a published version first.');
    const result = await api<{ library: SkillLibrary; appliesTo: string }>('skills/attach', {
      agent, publicationId: publication.id, sha256: publication.sha256, confirm: true,
    });
    setLibrary(result.library);
    setNotice(`Attached ${publication.name} v${publication.version} to ${agent}. ${result.appliesTo}`);
  }

  return <div className="skill-studio app-shell">
    <header className="topbar">
      <div className="brand-mark"><Layers3 size={25} /></div>
      <div className="brand"><h1>Skill Studio <span>/ QUALITY LIVE AGENT</span></h1><p>Expert demonstration → reviewed guidance → version-pinned agent</p></div>
      <div className="header-actions"><Badge>SYNTHETIC / LOCAL</Badge><a className="studio-link" href={`/?scoutTheme=${encodeURIComponent(theme)}`} target="_blank" rel="noopener">Open Quality Agent <ArrowRight size={15} /></a></div>
    </header>
    <nav className="workspace-bar" aria-label="Skill workspace">
      <div className="mode-switch"><a className={`studio-link ${!expert && !comparison ? 'selected' : ''}`} href={studioUrl}>Review & attach</a>
        <a className={`studio-link ${expert ? 'selected' : ''}`} href={`${studioUrl}&view=expert`}>Expert source records</a>
        <a className={`studio-link ${comparison ? 'selected' : ''}`} href={`${studioUrl}&view=comparison`}>Compare briefings</a></div>
      <span className="muted">Microsoft Skill Recorder runs in its own desktop window.</span>
    </nav>
    {error && <div role="alert" className="error-banner">{error}</div>}
    {notice && <div role="status" className="studio-notice"><Check size={18} /><span>{notice}</span></div>}
    {!library ? <main className="startup">Loading the shared local session…</main> : expert ?
      <main className="expert-workspace">
        <section className="panel studio-intro"><Badge>MANUAL EXPERT DEMONSTRATION</Badge><h2>Investigate the synthetic records yourself</h2>
          <p>No AI investigation runs here. Open each source, compare evidence and narrate your reasoning while the real Recorder captures your explicit demonstration.</p>
          <label className="studio-field">Synthetic training case<select aria-label="Expert training dataset" value={expertId} onChange={event => {
            const id = scenarioIds.find(id => id === event.target.value);
            if (id) { setExpertId(id); setRecordView('issue'); setHypothesis(''); setNextChecks(''); }
          }}>{scenarioIds.map(id => <option key={id} value={id}>{id} / {scenarios[id].station}</option>)}</select></label>
          <p className="muted">Start recording in the desktop Recorder only after closing unrelated windows. Narration is optional; analysis uses GitHub Copilot, not this app's Azure model.</p>
        </section>
        <section className="panel">
          <div className="source-tabs" role="tablist" aria-label="Synthetic source systems">{([
            ['issue', 'Quality issue'], ['production', 'Production measurements'], ['maintenance', 'Maintenance history'], ['knowledge', 'Engineering knowledge'],
          ] as const).map(([id, title]) => <button key={id} role="tab" id={`source-${id}`} aria-controls="source-record" aria-selected={recordView === id}
            onClick={() => setRecordView(id)}>{title}</button>)}</div>
          <div id="source-record" role="tabpanel" aria-labelledby={`source-${recordView}`} className="source-record">
            {recordView === 'issue' && <><Badge>QUALITY / {scenario.id}</Badge><h2>{scenario.symptom}</h2>
              <dl className="source-facts">{[['Vehicle', scenario.vehicle], ['Plant', scenario.plant], ['Line', scenario.line],
                ['Station', scenario.station], ['Component', scenario.component], ['Affected vehicles', scenario.count]].map(([key, value]) =>
                <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
              <img className="expert-illustration" src={scenario.sample} alt={`Provided reference image: ${scenario.component}`} />
              <p className="callout">Reference image only: not vehicle-specific defect evidence, a recorded measurement or a confirmed cause. Identify what needs physical verification.</p></>}
            {recordView === 'production' && <><Badge>PRODUCTION / PROD-{scenario.id}</Badge><h2>Measurements before and after the reported deviation</h2>
              <MeasurementChart data={scenario.measurements} /><p>{scenario.measurements.observation}</p>
              <table><caption>Synthetic station measurements; baseline {scenario.measurements.baseline} {scenario.measurements.unit}</caption>
                <thead><tr><th>Time</th><th>Measurement ({scenario.measurements.unit})</th><th>Against {scenario.measurements.limit} {scenario.measurements.unit} {scenario.measurements.limitDirection} limit</th></tr></thead>
                <tbody>{scenario.measurements.values.map((value, index) => <tr key={index}><td>{scenario.measurements.times[index]}</td><td>{value}</td>
                  <td>{(scenario.measurements.limitDirection === 'upper' ? value > scenario.measurements.limit : value < scenario.measurements.limit) ? 'Outside synthetic limit' : 'Within synthetic limit'}</td></tr>)}</tbody></table></>}
            {recordView === 'maintenance' && <><Badge>MAINTENANCE / {scenario.event.id}</Badge><h2>{scenario.event.description}</h2>
              <dl className="source-facts"><div><dt>Station</dt><dd>{scenario.station}</dd></div><div><dt>Event time</dt><dd>{scenario.event.at}</dd></div>
                <div><dt>First measurement deviation</dt><dd>{scenario.measurements.firstObserved}</dd></div></dl>
              <p className="callout">Compare chronology yourself. Temporal association is not proof of cause. No fixture, calibration or production change can be executed here.</p></>}
            {recordView === 'knowledge' && <><Badge>ENGINEERING / {scenario.historical.id}</Badge><h2>{scenario.historical.description}</h2>
              <p>Fictional historical procedure for this synthetic dataset; not a production-approved Mercedes procedure.</p>
              <ol>{scenario.historical.procedure.map(step => <li key={step}>{step}</li>)}</ol>
              <p className="callout">Explain which checks apply and why. Missing or conflicting evidence must be disclosed; authorization must never be inferred from a similar case.</p></>}
          </div>
        </section>
        <section className="panel expert-notes"><h2>Expert worksheet / your reasoning, not an AI conclusion</h2>
          <label className="studio-field">Preliminary hypothesis<textarea value={hypothesis} onChange={event => setHypothesis(event.target.value)} maxLength={1500} placeholder="Cite the observations and records; keep uncertainty explicit." /></label>
          <label className="studio-field">Next verification checks<textarea value={nextChecks} onChange={event => setNextChecks(event.target.value)} maxLength={1500} placeholder="What should an engineer verify before authorizing any change?" /></label>
          <p className="muted">Notes are temporary, stay in this tab and clear when changing dataset. This worksheet does not approve or create an action.</p>
        </section>
      </main> : comparison ? <main className="expert-workspace"><SkillComparison library={library} refresh={async () => { setLibrary(await api<SkillLibrary>('skills')); }} /></main> :
      <main className="studio-workspace">
        <section className="panel studio-intro"><span className="eyebrow">REAL RECORDER → LOCAL AGENT GUIDANCE</span><h2>Bring the expert's exported skill into the agent</h2>
          <div className="studio-flow">{['Record in the desktop app', 'Analyze & export SKILL.md', 'Review & publish here', 'Attach & start a new case'].map((step, index) =>
            <div key={step}><span>0{index + 1}</span><strong>{step}</strong></div>)}</div>
          <p>This is an actual file import and durable local binding, not a hosted Foundry skill deployment. The imported body is supplied to the conversation model as reviewed guidance.
            The existing 14-stage evidence/action workflow stays server-controlled; scripts, linked resources and declared tool permissions are not executed or granted.</p>
          <a className="studio-link" href={`${studioUrl}&view=expert`} target="_blank" rel="noopener"><BookOpen size={16} />Open synthetic expert records for recording</a>
        </section>
        <section className="panel studio-review"><div className="section-heading"><h2><Upload size={18} />1 / Import & review</h2><Badge>NO AUTOMATIC ATTACHMENT</Badge></div>
          <label className="studio-field">Exported Markdown skill<input aria-label="Exported Markdown skill" type="file" accept=".md,text/markdown,text/plain" disabled={busy}
            onChange={event => { const file = event.target.files?.[0]; if (file) void perform(() => importFile(file)); event.target.value = ''; }} /></label>
          <p className="muted">UTF-8 .md only, up to 24 KB. Export the file from the real Recorder; do not upload a recording, ZIP, credentials or actual factory data.</p>
          {draft && <><div className="section-heading"><h3>{draft.name}</h3><Badge>UNPUBLISHED DRAFT</Badge></div><p>{draft.description}</p>
            <p className="studio-hash">Content SHA-256: {draft.sha256}</p><pre aria-label="Imported skill preview">{draft.content}</pre>
            <p className="callout">Declared tools: {draft.allowedTools.join(', ') || 'none'}. These permissions are not granted. Review the complete original text; this preview is not a security certification.</p>
            <div className="studio-fields"><label className="studio-field">Publication version<input aria-label="Publication version" value={version} maxLength={50} onChange={event => setVersion(event.target.value)} /></label>
              <label className="studio-field">Reviewer label<input aria-label="Reviewer label" placeholder="Use a synthetic demo reviewer label" value={reviewer} maxLength={80} onChange={event => setReviewer(event.target.value)} /></label>
              <label className="studio-field">Declared source<select aria-label="Declared skill source" value={source} onChange={event => {
                if (event.target.value === 'recorder-export' || event.target.value === 'manual-guidance') setSource(event.target.value);
              }}><option value="recorder-export">Export from my Recorder session</option><option value="manual-guidance">Manually supplied guidance / test fixture</option></select></label>
              <label className="studio-field">Actual session/export reference<input aria-label="Recorder session reference" placeholder={source === 'recorder-export' ? 'Required: your actual session/export reference' : 'Optional for manual guidance'} value={recordingReference} maxLength={200} onChange={event => setRecordingReference(event.target.value)} /></label></div>
            <p className="muted">Source and reviewer labels are operator declarations, not verified identity or proof of a Recorder session. The version is library metadata; the original file is unchanged.</p>
            <div className="studio-checks">{(Object.keys(acknowledgements) as (keyof typeof acknowledgements)[]).map(key =>
              <label className="toggle" key={key}><input type="checkbox" checked={checks[key]} onChange={event => setChecks(current => ({ ...current, [key]: event.target.checked }))} />{acknowledgements[key]}</label>)}</div>
            <button className="primary" disabled={busy || !Object.values(checks).every(Boolean) || reviewer.trim().length < 3 ||
              (source === 'recorder-export' && !recordingReference.trim())} onClick={() => void perform(publish)}><ShieldCheck size={17} />Approve & publish reviewed version</button></>}
        </section>
        <section className="panel studio-attach"><div className="section-heading"><h2><Layers3 size={18} />2 / Attach a published version</h2><button disabled={busy} onClick={() => void perform(async () => { setLibrary(await api<SkillLibrary>('skills')); })}>Refresh library</button></div>
          <label className="studio-field">Target agent<select aria-label="Target agent" value={agent} disabled={busy} onChange={event => {
            const selected = skillAgents.find(item => item === event.target.value); if (selected) setAgent(selected);
          }}>{skillAgents.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="studio-field">Published skill<select aria-label="Published skill version" value={publicationId} disabled={busy} onChange={event => setPublicationId(event.target.value)}>
            <option value="">Choose a reviewed publication</option>{library.publications.map(item => <option key={item.id} value={item.id}>{item.name} / v{item.version}</option>)}</select></label>
          {publication && <div className="publication-summary"><h3>{publication.name} / v{publication.version}</h3><p>{publication.description}</p>
            <small>Reviewed by {publication.reviewedBy} · {new Date(publication.reviewedAt).toLocaleString()}</small>
            <p>{publication.source === 'recorder-export' ? `Operator-declared Recorder reference: ${publication.recordingReference}` : 'Manually supplied guidance; not Recorder provenance.'}</p>
            <p className="studio-hash">SHA-256: {publication.sha256}</p><details><summary><FileText size={15} />Inspect immutable published file</summary><pre>{publication.content}</pre></details></div>}
          <button className="primary wide" disabled={busy || !publication} onClick={() => void perform(attach)}>Attach reviewed version to agent <ArrowRight size={17} /></button>
          <p className="callout">Attachment applies to new investigations. An idle agent updates immediately; an investigation already started keeps its pinned content/version, including while waiting for approval.</p>
          <h3>Current local agent bindings</h3><div className="binding-list">{skillAgents.map(name => {
            const bound = library.publications.find(item => item.id === library.bindings[name]);
            return <article key={name}><strong>{name}</strong><p>{bound ? `${bound.name} / v${bound.version}` : 'Bundled synthetic example / v1.0.0'}</p>
              {bound && <small className="studio-hash">{bound.sha256}</small>}</article>;
          })}</div>
          <button disabled={busy || !library.bindings[agent]} onClick={() => void perform(async () => {
            setLibrary(await api<SkillLibrary>('skills/detach', { agent, confirm: true }));
            setNotice(`${agent} will use the bundled synthetic example for new investigations. Existing cases remain pinned.`);
          })}>Restore bundled synthetic guidance for selected agent</button>
          {!library.publications.length && <p className="muted">No reviewed exports have been published yet. No genuine recording or attachment is being fabricated.</p>}
        </section>
      </main>}
  </div>;
}
