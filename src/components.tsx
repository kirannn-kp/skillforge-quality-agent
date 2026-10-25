import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Circle, ShieldCheck, X } from 'lucide-react';
import type { ChecklistItem, InvestigationState, Measurements } from '../shared/domain';

export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Checklist({ items }: { items: ChecklistItem[] }) {
  const completed = items.filter(item => item.complete).length;
  return <><div className="section-heading"><h2>Investigation checklist</h2><Badge>{completed}/{items.length}</Badge></div>
    <div className="progress" role="progressbar" aria-label="Investigation completeness" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={items.length}>
      <span style={{ width: `${completed / items.length * 100}%` }} />
    </div>
    <ul className="checklist">{items.map(item => <li key={item.label} className={item.complete ? 'checked' : ''}>
      {item.complete ? <Check size={14} aria-hidden /> : <Circle size={13} aria-hidden />}<span>{item.label}</span>
    </li>)}</ul></>;
}
export function Transcript({ state }: { state: InvestigationState }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [state.messages.length]);
  return <div className="transcript" role="log" aria-label="Live transcript" aria-live="polite" aria-relevant="additions">
    {state.messages.length === 0 && <div className="empty-transcript"><ShieldCheck size={30} /><h3>A conversation that becomes an investigation.</h3><p>Start with what you observed. The board will fill as evidence arrives.</p></div>}
    {state.messages.map(message => <article key={message.id} className={`message ${message.role}`}>
      <div className="message-meta"><span>{message.role === 'operator' ? 'OPERATOR' : message.role === 'assistant' ? 'QUALITY AGENT' : 'SYSTEM'}</span>
        <time>{new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div>
      <p>{message.text}</p>
    </article>)}<div ref={end} />
  </div>;
}
export function MeasurementChart({ data }: { data: Measurements }) {
  const max = Math.max(...data.values, data.limit) * 1.2;
  const x = (i: number) => 35 + i * 48;
  const y = (v: number) => 125 - v / max * 95;
  return <figure className="chart"><figcaption>Production measurements <span>{data.unit} · synthetic specification</span></figcaption>
    <svg viewBox="0 0 410 152" role="img" aria-label={`${data.observation} Values: ${data.values.join(', ')} ${data.unit}.`}>
      <line x1="30" y1={y(data.limit)} x2="385" y2={y(data.limit)} className="limit-line" />
      <text x="30" y={y(data.limit) - 6}>{data.limit} {data.unit} {data.limitDirection} limit</text>
      <polyline points={data.values.map((value, i) => `${x(i)},${y(value)}`).join(' ')} className="measurement-line" />
      {data.values.map((value, i) => <g key={i}><circle cx={x(i)} cy={y(value)} r="3" className={(data.limitDirection === 'upper' ? value > data.limit : value < data.limit) ? 'anomaly-dot' : 'normal-dot'} />
        {i % 2 === 0 && <text x={x(i)} y="145" textAnchor="middle">{data.times[i]}</text>}</g>)}
    </svg>
  </figure>;
}
export function Drawer({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="drawer" aria-labelledby="drawer-title" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="drawer-inner"><div className="section-heading"><h2 id="drawer-title">{title}</h2>
      <button className="icon-button" onClick={close} aria-label="Close drawer"><X size={20} /></button></div>{children}</div>
  </dialog>;
}
export interface AvatarRendererProps { status: string }
export function PlaceholderAvatarRenderer({ status }: AvatarRendererProps) {
  return <div className={`avatar ${status.toLowerCase().replaceAll(' ', '-')}`} role="img" aria-label={`Abstract placeholder assistant. ${status}. Not a live avatar.`}>
    <div className="avatar-grid" /><div className="avatar-label">QUALITY / LIVE</div>
    <svg viewBox="0 0 200 180" className="avatar-mark" aria-hidden="true">
      <circle cx="100" cy="75" r="47" className="avatar-ring" />
      <circle cx="100" cy="75" r="37" className="avatar-ring inner" />
      <path d="M76 72 L91 87 L125 53" className="avatar-check" />
      <path d="M42 147 Q100 110 158 147 M58 159 Q100 132 142 159" className="avatar-ring" />
    </svg>
    <div className="avatar-caption"><strong>AI Quality Assistant</strong><span>Placeholder avatar · browser speech optional</span></div>
  </div>;
}
export function VideoAvatarRenderer({ source, status }: AvatarRendererProps & { source: string }) {
  return <video src={source} aria-label={`Consented local avatar asset. ${status}`} autoPlay muted loop playsInline />;
}
