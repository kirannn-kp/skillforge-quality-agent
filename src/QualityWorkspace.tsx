import { useEffect, useState } from 'react';
import { Activity, ArrowRight, Bell, Database, Gauge, ShieldCheck } from 'lucide-react';
import type { InvestigationState } from '../shared/domain';
import { referenceImageNote, scenarios } from '../shared/scenarios';
import { incidentHref, outsideSpecification, stationHref, type FleetOverview, type IncidentRecord, type StationAlert } from '../shared/incidents';
import { api, bootstrap } from './api';
import { Badge } from './components';
import './qualityWorkspace.css';

export default function QualityWorkspace() {
  const params = new URLSearchParams(location.search);
  const incidentId = params.get('incident');
  const station = params.get('station');
  const theme = document.documentElement.getAttribute('data-theme') ?? 'dark';
  const themed = (path: string) => `${path}&scoutTheme=${encodeURIComponent(theme)}`;
  const towerHref = themed('/?workspace=quality');
  const agentHref = `/?scoutTheme=${encodeURIComponent(theme)}`;
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<InvestigationState>();
  const [fleet, setFleet] = useState<FleetOverview>();
  const [record, setRecord] = useState<IncidentRecord>();
  const [alerts, setAlerts] = useState<StationAlert[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [streamError, setStreamError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    let active = true;
    let events: EventSource | undefined;
    void bootstrap().then(result => {
      if (!active) return;
      setState(result.state); setReady(true);
      events = new EventSource('/api/events');
      events.onmessage = event => { if (active) setState(JSON.parse(event.data)); };
      events.onopen = () => { if (active) setStreamError(''); };
      events.onerror = () => { if (active) setStreamError('Investigation stream disconnected. Updates may be stale; persisted incidents remain in the database.'); };
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Quality workspace could not connect.'); });
    return () => { active = false; events?.close(); };
  }, []);
  useEffect(() => { if (state?.incident?.id) setRefresh(value => value + 1); }, [state?.incident?.id]);
  useEffect(() => {
    if (!ready) return;
    let active = true, loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        if (incidentId) {
          const result = await api<IncidentRecord>(`incidents/${encodeURIComponent(incidentId)}`);
          if (active) setRecord(result);
        } else if (station) {
          const result = await api<StationAlert[]>(`station-alerts?station=${encodeURIComponent(station)}`);
          if (active) setAlerts(result);
        } else {
          const result = await api<FleetOverview>(`fleet?search=${encodeURIComponent(search)}&page=${page}`);
          if (active) setFleet(result);
        }
        if (active) { setUpdatedAt(new Date().toLocaleTimeString()); setError(''); }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Database read failed. Displayed records may be stale.'); }
      finally { loading = false; }
    }
    void load();
    const timer = station && !incidentId ? window.setInterval(() => { void load(); }, 2000) : undefined;
    return () => { active = false; if (timer !== undefined) clearInterval(timer); };
  }, [ready, incidentId, station, search, page, refresh]);

  async function openInvestigation() {
    const selected = fleet?.detections[0];
    if (!selected || !state) {
      setError('Detection and investigation state must finish loading before opening the agent.');
      return;
    }
    if (state.phase !== 'IDLE') {
      window.location.assign(agentHref);
      return;
    }
    setBusy(true); setError('');
    try {
      const next = await api<InvestigationState>('detections/investigate', {
        vehicleId: selected.vehicle.id, syntheticReplay: true,
      });
      setState(next);
      if (next.phase === 'FAILED') throw new Error(next.error ?? 'Required evidence was not available; no incident or alert was created.');
      window.location.assign(agentHref);
    } catch (err) { setError(err instanceof Error ? err.message : 'Detection investigation failed.'); }
    finally { setBusy(false); }
  }

  const detection = fleet?.detections[0];
  const existing = fleet?.incidents.find(item => item.vehicleId === detection?.vehicle.id);
  return <div className="quality-shell">
    <header className="quality-header">
      <div className="quality-brand"><Gauge size={28} /><div><h1>{incidentId ? 'Incident evidence record' : station ? `${station} / Quality alerts` : 'Quality Early-Warning Control Tower'}</h1>
        <p>Detect a signal. Review the evidence. Approve the response. Preserve the trace.</p></div></div>
      <Badge tone="warning">SYNTHETIC DEMO · LOCAL STATION ALERTS</Badge>
    </header>
    <nav className="quality-nav" aria-label="Quality workspaces">
      <a href={towerHref}><Activity size={16} />Control tower</a>
      <a href={agentHref} target="_blank" rel="noopener">Live quality agent <ArrowRight size={16} /></a>
      <a href={themed(stationHref('Station 42'))} target="_blank" rel="noopener"><Bell size={16} />Station 42 dashboard</a>
      <a href={themed('/?workspace=skills')} target="_blank" rel="noopener">Skill Studio</a>
      <button onClick={() => setRefresh(value => value + 1)}>Refresh records</button>
    </nav>
    <main>
      {error && <div className="quality-error" role="alert"><strong>Operation unavailable</strong><p>{error}</p></div>}
      {streamError && <div className="quality-error" role="alert">{streamError}</div>}
      {!ready && !error && <p>Connecting to the local quality database...</p>}
      {incidentId && record && <>
        <section className="quality-card">
          <div className="quality-heading"><Badge tone="success">INCIDENT SAVED</Badge><span>{record.status}</span></div>
          <h2>{record.id}</h2><p className="quality-lead">{record.summary}</p>
          <dl className="quality-facts"><div><dt>Vehicle ID</dt><dd>{record.detection.vehicle.id}</dd></div>
            <div><dt>Station</dt><dd>{record.detection.station}</dd></div>
            <div><dt>Created</dt><dd>{new Date(record.createdAt).toLocaleString()}</dd></div>
            <div><dt>Explicit approval</dt><dd>{record.approval.requestId}<small>{record.approval.approvedAt}</small><small>Human confirmation: {record.approval.method}</small></dd></div></dl>
          <p><Database size={16} /> Stored in the local SQLite database, not just browser memory. Reloading or restarting the server does not erase this record.</p>
          <p><ShieldCheck size={16} /> Incident and alert creation were approved. No calibration, hold or production-release changes were authorized.</p>
        </section>
        <section className="quality-detail-grid">
          <div className="quality-card"><img className="quality-image" src={scenarios[record.detection.scenarioId].sample} alt="Provided door-hinge reference image; not vehicle-specific inspection evidence" />
            <p className="muted">{referenceImageNote}</p>
            {record.detection.imagePath !== scenarios[record.detection.scenarioId].sample && <details><summary>Archived image provenance</summary><p>{record.detection.imageNote} Original reference: <a href={record.detection.imagePath}>View archived illustration</a>. The saved evidence has not been changed.</p></details>}
            <h3>Findings & uncertainty</h3>
            <dl className="quality-findings">{Object.entries(record.findings).map(([name, finding]) => <div key={name}><dt>{name}</dt><dd>{finding}</dd></div>)}</dl></div>
          <div className="quality-card"><h3>Recommended engineer checks</h3><ol>{record.recommendations.map(task => <li key={task}>{task}</li>)}</ol>
            <h3>Station alert publication</h3><p>{record.alert.message}</p><p className="muted">Published to the local station dashboard—not email, Teams, a factory system or a recipient acknowledgement.</p>
            <a className="quality-link" href={themed(stationHref(record.alert.station))}>Open {record.alert.station} alert dashboard <ArrowRight size={16} /></a>
            <h3>Related measurement exceptions / {record.detection.vehicleIds.length}</h3>
            <p className="quality-vehicle-ids">{record.detection.vehicleIds.join(' · ')}</p>
            <p className="muted">A measurement exception is not a confirmed common root cause.</p>
            <h3>Pinned investigation guidance</h3><p>{record.skill.name} / v{record.skill.version}</p><p className="muted">{record.skill.source}</p>
            {record.skill.sha256 && <code>{record.skill.sha256}</code>}
          </div>
        </section>
        <section className="quality-card"><h3>Evidence references</h3><ul>{record.evidence.map((item, i) => <li key={i}><strong>{item.source} / {item.type}</strong><p>{item.observation}</p><small>{item.reference}</small></li>)}</ul>
          <h3>Approval & operation history</h3><ol>{record.audit.map((event, i) => <li key={i}><strong>{event.tool} / {event.result}</strong><p>{event.outputSummary}</p><small>{event.at}</small></li>)}</ol>
        </section>
      </>}
      {station && !incidentId && <>
        <section className="quality-card"><Badge tone="warning">LOCAL STATION DISPLAY</Badge><h2>{station}: approved incident alerts</h2>
          <p>Updates every two seconds from persisted alert records. Alerts appear only after an engineer approves incident creation and station notification.</p>
          <p className="muted">No actual factory notification integration is connected. Last successful refresh: {updatedAt || 'waiting'}.</p></section>
        {alerts.length === 0 ? <section className="quality-card"><h3>No approved incident alerts</h3><p>A detected measurement exception alone does not publish an alert.</p></section> :
          alerts.map(alert => <article className="quality-card quality-alert" key={alert.id}>
            <div className="quality-heading"><Badge tone="warning">INSPECTION REQUESTED</Badge><time>{new Date(alert.createdAt).toLocaleString()}</time></div>
            <h2>{alert.message}</h2><p>Alert status: {alert.status}. Publication does not mean the station has acknowledged it.</p>
            <a className="quality-link" href={themed(incidentHref(alert.incidentId))}>Open incident details & evidence <ArrowRight size={16} /></a>
          </article>)}
      </>}
      {!station && !incidentId && fleet && <>
        <section className="quality-metrics" aria-label="Fleet monitoring summary">
          {[['Vehicle records checked', fleet.total.toLocaleString()], ['Measurement exceptions', fleet.flagged], ['Stations with exceptions', fleet.detections.length], ['Recent saved incidents', fleet.incidents.length]].map(([label, value]) =>
            <div className="quality-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </section>
        <p className="quality-disclosure">Replayable synthetic dataset / deterministic measurement thresholds. No continuous camera monitoring or fleet-wide AI image analysis is claimed. The live agent still supports consented image analysis in its normal investigation flow.</p>
        {detection && <section className="quality-card quality-detection">
          <div><Badge tone="warning">EARLY WARNING / NOT A CONFIRMED DEFECT</Badge><h2>High door-closing force detected</h2>
            <p className="quality-lead">{detection.vehicle.id} / {detection.station}</p>
            <p><strong>{detection.vehicle.measurement} {detection.vehicle.unit}</strong> measured against a <strong>{detection.vehicle.limit} {detection.vehicle.unit}</strong> upper limit.</p>
            <p>{detection.vehicleIds.length} vehicle records exceed the limit. Possible hinge alignment or tooling deviation needs engineer validation.</p>
            <p className="muted">Synthetic inspection timestamp: {detection.vehicle.recordedAt}</p>
            <button className="primary" disabled={busy || !state || (!!existing && state.phase === 'IDLE')} onClick={() => void openInvestigation()}>
              {busy ? 'Opening investigation...' : state && state.phase !== 'IDLE' ? 'Open current investigation' : 'Open investigation'}<ArrowRight size={16} /></button>
            {existing && <p><a className="quality-link" href={themed(incidentHref(existing.id))}>Open existing approved incident <ArrowRight size={16} /></a></p>}
            {existing && state?.phase === 'IDLE' && <p className="quality-disclosure">All current detected vehicles have incident records. Review the saved incident or history below.</p>}
            {state && state.phase !== 'IDLE' && <p className="quality-disclosure">An existing case is retained. Open the current investigation to continue; explicitly start a new investigation in the agent before selecting another detection.</p>}
            <p className="quality-disclosure">Investigation prepares a proposal only. The engineer must approve before an incident, station alert or incident evidence record is created.</p>
          </div>
          <figure><img className="quality-image" src={detection.imagePath} alt="Provided door-hinge reference image associated with this scenario" /><figcaption>{detection.imageNote}</figcaption></figure>
        </section>}
        <section className="quality-card">
          <div className="quality-heading"><h2>Vehicle traceability</h2><span>{fleet.matching} matching records</span></div>
          <form className="quality-search" onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}>
            <label>Vehicle ID or station<input aria-label="Search vehicle ID or station" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="DEMO-00427 or Station 42" /></label>
            <button type="submit">Search records</button>
          </form>
          <div className="quality-table-scroll"><table><thead><tr><th>Vehicle ID</th><th>Model</th><th>Station</th><th>Measurement</th><th>Assessment</th></tr></thead>
            <tbody>{fleet.vehicles.map(vehicle => <tr key={vehicle.id}><td>{vehicle.id}</td><td>{vehicle.model}</td><td>{vehicle.station}</td>
              <td>{vehicle.measurement} {vehicle.unit} / {vehicle.limitDirection === 'upper' ? 'max' : 'min'} {vehicle.limit}</td><td><Badge tone={outsideSpecification(vehicle) ? 'warning' : 'success'}>{outsideSpecification(vehicle) ? 'Needs inspection' : 'Within demo limit'}</Badge></td></tr>)}</tbody></table></div>
          {fleet.matching === 0 && <p>No matching vehicle records.</p>}
          <div className="quality-pagination"><button disabled={fleet.page <= 1} onClick={() => setPage(fleet.page - 1)}>Previous vehicles</button><span>Page {fleet.page} / {fleet.pages}</span>
            <button disabled={fleet.page >= fleet.pages} onClick={() => setPage(fleet.page + 1)}>Next vehicles</button></div>
        </section>
        <section className="quality-card"><h2>Saved incidents / database history</h2><p>Open these links later to retrieve the approved evidence and recommendations.</p>
          {fleet.incidents.length === 0 ? <p className="muted">No incidents created yet. Engineer approval is required.</p> :
            <ul className="quality-history">{fleet.incidents.map(incident => <li key={incident.id}>
              <a href={themed(incidentHref(incident.id))}>{incident.vehicleId} / {incident.station}<ArrowRight size={16} /></a><p>{incident.summary}</p><small>{incident.id} / {incident.status}</small></li>)}</ul>}
        </section>
      </>}
    </main>
  </div>;
}
