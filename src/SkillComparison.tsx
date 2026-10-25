import { useState } from 'react';
import { scenarioIds, type Scenario } from '../shared/domain';
import { comparisonQuestion, comparisonResultSchema, skillAgents, type SkillComparisonResult, type SkillLibrary } from '../shared/skills';
import { scenarios } from '../shared/scenarios';
import { api } from './api';
import { Badge } from './components';

export function SkillComparison({ library, refresh }: { library: SkillLibrary; refresh: () => Promise<void> }) {
  const [scenarioId, setScenarioId] = useState<Scenario['id']>('Q-2048');
  const [baseline, setBaseline] = useState<SkillComparisonResult>();
  const [expert, setExpert] = useState<SkillComparisonResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scenario = scenarios[scenarioId];
  const agent = skillAgents.find(name => name === scenario.agent);
  const attached = agent ? library.publications.find(item => item.id === library.bindings[agent]) : undefined;

  async function run(mode: 'baseline' | 'expert') {
    setBusy(true); setError('');
    setExpert(undefined);
    if (mode === 'baseline') setBaseline(undefined);
    try {
      if (mode === 'expert' && (!baseline || !attached)) throw new Error('Generate the baseline and attach a reviewed skill first.');
      const result = comparisonResultSchema.parse(await api<SkillComparisonResult>('skills/briefing', {
        scenarioId, mode, consent: true, ...(mode === 'expert' ? { expectedSkillHash: attached!.sha256 } : {}),
      }));
      if (mode === 'expert' && (result.contextSha256 !== baseline!.contextSha256 ||
        result.question !== baseline!.question || result.model !== baseline!.model)) {
        throw new Error('The evidence, model or question changed. Generate a fresh baseline before comparing.');
      }
      if (mode === 'baseline') setBaseline(result);
      else setExpert(result);
    } catch (err) { setError(err instanceof Error ? err.message : 'Briefing comparison failed. No replacement response was generated.'); }
    finally { setBusy(false); }
  }

  return <section className="panel skill-comparison" aria-label="Read-only skill comparison">
    <Badge>LIVE MODEL / READ-ONLY COMPARISON</Badge>
    <h2>Same model. Same evidence. Different guidance.</h2>
    <p>Compare the actual model briefings, not scripted answers. The baseline omits both bundled and attached expert procedure instructions.
      The expert condition uses the currently attached publication. Both keep identical safety rules; neither runs tools, creates incidents or changes the active case.</p>
    <div className="studio-fields">
      <label className="studio-field">Comparison dataset<select aria-label="Comparison dataset" value={scenarioId} disabled={busy} onChange={event => {
        const selected = scenarioIds.find(id => id === event.target.value);
        if (selected) { setScenarioId(selected); setBaseline(undefined); setExpert(undefined); setError(''); }
      }}>{scenarioIds.map(id => <option key={id} value={id}>{scenarios[id].station} / {scenarios[id].component}</option>)}</select></label>
      <div className="publication-summary"><strong>Attached to {scenario.agent}</strong>
        <p>{attached ? `${attached.name} / v${attached.version}` : 'No reviewed publication attached to this agent.'}</p>
        <button disabled={busy} onClick={async () => {
          setError(''); setBusy(true);
          try { await refresh(); }
          catch (err) { setError(err instanceof Error ? err.message : 'Could not refresh attached guidance.'); }
          finally { setBusy(false); }
        }}>Refresh attached guidance</button>
      </div>
    </div>
    <p><strong>Identical question:</strong> {comparisonQuestion}</p>
    <p className="callout">Each Generate button sends synthetic records to the configured Azure model and is billable.
      Responses can overlap or vary; this is a procedure demonstration, not proof that the baseline model is incapable or that the expert condition is always better.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {busy && <p role="status">Generating or refreshing the comparison…</p>}
    <div className="comparison-grid">
      <article aria-label="Baseline briefing"><h3>Before / no expert skill guidance</h3>
        <button className="primary" disabled={busy} onClick={() => void run('baseline')}>Generate baseline briefing</button>
        {baseline ? <><p className="comparison-briefing">{baseline.briefing}</p><small>{baseline.model} · {(baseline.durationMs / 1000).toFixed(1)}s</small>
          <details><summary>Inspect baseline receipt</summary><p className="studio-hash">Evidence SHA-256: {baseline.contextSha256}</p><p>No expert procedural instructions supplied.</p></details></> :
          <p className="muted">Generate this first. Keep this tab open while reviewing and attaching your skill in another tab.</p>}
      </article>
      <article aria-label="Expert skill briefing"><h3>After / attached expert guidance</h3>
        <button className="primary" disabled={busy || !baseline || !attached} onClick={() => void run('expert')}>Generate expert skill briefing</button>
        {expert ? <><p className="comparison-briefing">{expert.briefing}</p><small>{expert.model} · {(expert.durationMs / 1000).toFixed(1)}s</small>
          <details><summary>Inspect expert receipt</summary><p>{expert.skill?.name} / v{expert.skill?.version}</p>
            <p className="studio-hash">Skill SHA-256: {expert.skill?.sha256}</p><p className="studio-hash">Evidence SHA-256: {expert.contextSha256}</p></details></> :
          <p className="muted">After attachment, refresh attached guidance and generate the second briefing using the same question and records.</p>}
      </article>
    </div>
    {baseline && expert && <p className="callout" role="status">Matched model, question and evidence hash. Only the expert procedural guidance differs. No operational records were changed.</p>}
  </section>;
}
