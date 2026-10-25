import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, AudioLines, Camera, Check, ChevronRight, FileText, Gauge, Layers3,
  LoaderCircle, Mic, MicOff, Play, RotateCcw, ShieldCheck, Square, Upload, Volume2, VolumeX, X,
} from 'lucide-react';
import { busyPhases, checklist, nextQuestion, scenarioIds, type InvestigationState, type Skill } from '../shared/domain';
import { scenarios } from '../shared/scenarios';
import { api, bootstrap, type Health } from './api';
import { prepareVisionImage } from './photo';
import { BrowserVoiceService, type VoiceStatus } from './voice';
import { AzureSpeechOutput, type AvatarStatus } from './azureSpeech';
import { AzureSpeechInput } from './azureSpeechInput';
import { useAvatarRecording } from './useAvatarRecording';
import { assistantSpeech, speechTestText, type SpeechCapabilities, type SpeechInputProvider, type SpeechProvider } from '../shared/speech';
import { Badge, Checklist, Drawer, MeasurementChart, PlaceholderAvatarRenderer, Transcript } from './components';

import type { IncidentConfirmationInput } from '../shared/conversation';
type Panel = 'skill' | 'architecture' | 'audit' | 'demo' | 'photo' | 'review' | 'camera' | 'conversation';
const boardTabs = [
  { id: 'investigation', label: 'Investigation' },
  { id: 'evidence', label: 'Evidence & correlation' },
  { id: 'incident', label: 'Incident' },
] as const;
type BoardTab = typeof boardTabs[number]['id'];
export default function App() {
  const [state, setState] = useState<InvestigationState>();
  const [skill, setSkill] = useState<Skill>();
  const [health, setHealth] = useState<Health>();
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [imageConsent, setImageConsent] = useState(false);
  const [panel, setPanel] = useState<Panel>();
  const [boardTab, setBoardTab] = useState<BoardTab>('investigation');
  const [mode, setMode] = useState<'guided' | 'interactive'>('guided');
  const [auto, setAuto] = useState(false);
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [voiceNotice, setVoiceNotice] = useState('');
  const [preview, setPreview] = useState('');
  const [photoHidden, setPhotoHidden] = useState(false);
  const [muted, setMuted] = useState(true);
  const [inputStatus, setInputStatus] = useState<VoiceStatus>('Ready');
  const [outputStatus, setOutputStatus] = useState<VoiceStatus>('Ready');
  const [handsFree, setHandsFree] = useState(false);
  const [speechInFlight, setSpeechInFlight] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [inputProvider, setInputProvider] = useState<SpeechInputProvider>('browser');
  const [speechProvider, setSpeechProvider] = useState<SpeechProvider>('browser');
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus>('Disconnected');
  const [speechChecking, setSpeechChecking] = useState(false);
  const [notes, setNotes] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream>();
  const video = useRef<HTMLVideoElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const boardBody = useRef<HTMLDivElement>(null);
  const latestAssistant = state?.messages.filter(message => message.role === 'assistant').at(-1);
  useEffect(() => { setBoardTab('investigation'); }, [state?.correlationId]);
  useEffect(() => {
    if (state?.phase === 'CREATING_ACTION' || state?.phase === 'COMPLETE') setBoardTab('incident');
    else if (state?.phase === 'WAITING_FOR_APPROVAL') setBoardTab('investigation');
  }, [state?.phase]);
  useEffect(() => {
    if (latestAssistant?.kind === 'incident-confirmation') setBoardTab('incident');
    else if (latestAssistant?.kind === 'recommendation') setBoardTab('investigation');
  }, [latestAssistant?.id, latestAssistant?.kind]);
  useEffect(() => { if (boardBody.current) boardBody.current.scrollTop = 0; }, [boardTab]);
  const previewRef = useRef('');
  const voice = useRef<BrowserVoiceService | undefined>(undefined);
  const azureVoice = useRef<AzureSpeechOutput | undefined>(undefined);
  const azureInput = useRef<AzureSpeechInput | undefined>(undefined);
  const avatarVideo = useRef<HTMLVideoElement>(null);
  const avatarAudio = useRef<HTMLAudioElement>(null);
  const spoken = useRef<string | undefined>(undefined);
  const handledSpeech = useRef(new Set<string>());
  const initial = useRef(false);
  const conversational = useRef(false);
  const pendingRequests = useRef(0);
  const approvalToken = useRef<string | undefined>(undefined);
  const currentConfirmation = useRef<IncidentConfirmationInput | undefined>(undefined);
  const listeningConfirmation = useRef<IncidentConfirmationInput | undefined>(undefined);
  const previousInputStatus = useRef<VoiceStatus>('Ready');
  const incidentFollowUp = state?.phase === 'COMPLETE' && !!state.incident && mode === 'interactive' && !!health?.conversation?.configured;
  const voiceStatus = inputStatus !== 'Ready' ? inputStatus : outputStatus;
  const latestAssistantId = state?.messages.filter(message => message.role === 'assistant').at(-1)?.id;
  useEffect(() => {
    const confirmation = state?.incidentConfirmation;
    currentConfirmation.current = confirmation ? { requestId: confirmation.requestId, promptId: confirmation.promptId } : undefined;
  }, [state?.incidentConfirmation]);
  const onInputStatus = useCallback((status: VoiceStatus) => {
    if (status === 'Connecting' || (status === 'Listening' && !['Connecting', 'Listening'].includes(previousInputStatus.current))) {
      listeningConfirmation.current = currentConfirmation.current;
    }
    previousInputStatus.current = status;
    setInputStatus(status);
  }, []);

  const stopHandsFree = useCallback(() => {
    setHandsFree(false);
    listeningConfirmation.current = undefined;
    azureInput.current?.stopListening();
  }, []);
  const speechError = useCallback((message: string) => {
    stopHandsFree(); setSpeechInFlight(false); setError(message);
  }, [stopHandsFree]);
  const activateRecording = useCallback(() => {
    stopHandsFree();
    voice.current?.stopListening();
    voice.current?.setMuted(true);
    setSpeechProvider('avatar');
    setMuted(false);
    setError('');
  }, [stopHandsFree]);
  const connectRecording = useCallback(async () => {
    if (!avatarVideo.current || !avatarAudio.current || !azureVoice.current) throw new Error('Avatar controls are not ready. No connection was started.');
    setError('');
    await azureVoice.current.connect(avatarVideo.current, avatarAudio.current);
  }, []);
  const disconnectRecording = useCallback(() => {
    stopHandsFree();
    voice.current?.stopListening();
    azureVoice.current?.disconnect();
  }, [stopHandsFree]);
  const recording = useAvatarRecording({
    ready: !!health?.speech.configured && connected && speechProvider === 'avatar',
    status: avatarStatus, activate: activateRecording, connect: connectRecording,
    disconnect: disconnectRecording, reportError: speechError,
  });

  const request = useCallback(async (path: string, body: unknown = {}) => {
    pendingRequests.current++; setPending(true); setError('');
    if (path === 'input') setReplyPending(true);
    try { const result = await api<InvestigationState>(path === 'input' && conversational.current ? 'conversation' : path, body); setState(result); }
    catch (err) { stopHandsFree(); setError(err instanceof Error ? err.message : 'Operation failed.'); setAuto(false); }
    finally {
      pendingRequests.current--; setPending(pendingRequests.current > 0);
      if (path === 'input') setReplyPending(false);
    }
  }, [stopHandsFree]);

  useEffect(() => {
    if (initial.current) return;
    initial.current = true;
    let events: EventSource | undefined;
    let active = true;
    bootstrap().then(result => {
      if (!active) return;
      setState(result.state); setHealth(result.health); setSkill(result.skill);
      if (result.health.conversation?.configured) { conversational.current = true; setMode('interactive'); }
      if (result.health.speech.configured) setInputProvider('azure');
      events = new EventSource('/api/events');
      events.onopen = () => setConnected(true);
      events.onmessage = event => {
        try { const next: InvestigationState = JSON.parse(event.data); setState(next); }
        catch (err) { setError(`Invalid activity stream: ${err instanceof Error ? err.message : 'parse failed'}`); }
      };
      events.onerror = () => { setConnected(false); setError('Live activity stream disconnected. Reconnecting automatically; reload if the session expired.'); };
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not start the local session.'); });
    return () => { active = false; events?.close(); };
  }, []);

  useEffect(() => {
    voice.current = new BrowserVoiceService(
      message => { void request('input', { text: message, confirmation: listeningConfirmation.current }); }, setPartial, status => {
        setOutputStatus(status); if (status === 'Ready') setSpeechInFlight(false);
      }, speechError, onInputStatus);
    azureVoice.current = new AzureSpeechOutput(setOutputStatus, speechError, setAvatarStatus);
    azureInput.current = new AzureSpeechInput(
      message => { setVoiceNotice(''); void request('input', { text: message, confirmation: listeningConfirmation.current }); }, setPartial, onInputStatus, speechError,
      message => { stopHandsFree(); setVoiceNotice(message); });
    return () => { voice.current?.dispose(); azureInput.current?.dispose(); azureVoice.current?.disconnect(); };
  }, [request, speechError, stopHandsFree, onInputStatus]);
  useEffect(() => {
    if (speechProvider === 'browser') voice.current?.setMuted(muted);
    else azureVoice.current?.setMuted(muted);
  }, [muted, speechProvider]);
  useEffect(() => {
    const assistants = state?.messages.filter(message => message.role === 'assistant') ?? [];
    const latest = assistants.at(-1);
    if (muted) {
      assistants.forEach(message => handledSpeech.current.add(message.id));
      spoken.current = latest?.id;
      return;
    }
    assistants.filter(message => !message.kind && message.id !== latest?.id)
      .forEach(message => handledSpeech.current.add(message.id));
    const next = assistants.find(message => !handledSpeech.current.has(message.id));
    if (!next || replyPending || speechInFlight || outputStatus === 'Speaking' || error ||
      (speechProvider === 'avatar' && avatarStatus !== 'Live')) return;
    if (handsFree && inputStatus === 'Listening') return;
    handledSpeech.current.add(next.id);
    spoken.current = next.id;
    const spokenText = assistantSpeech(state!, next.id);
    azureInput.current?.stopListening();
    voice.current?.stopListening();
    setSpeechInFlight(true);
    if (speechProvider === 'browser') voice.current?.speak(spokenText);
    else {
      void azureVoice.current?.speak({ text: spokenText, messageId: next.id, avatar: speechProvider === 'avatar' })
        .finally(() => { if (spoken.current === next.id) setSpeechInFlight(false); });
    }
  }, [state, speechProvider, avatarStatus, handsFree, inputStatus, replyPending, speechInFlight, outputStatus, muted, error]);
  useEffect(() => {
    if (!handsFree) return;
    if (!voiceConsent || inputProvider !== 'azure' || muted || speechProvider === 'browser' ||
      (speechProvider === 'avatar' && avatarStatus !== 'Live') || !connected || error ||
      (state && !incidentFollowUp && ['CANCELLED', 'REJECTED', 'COMPLETE', 'FAILED'].includes(state.phase))) {
      stopHandsFree(); return;
    }
    if (panel) { azureInput.current?.stopListening(); return; }
    const canListen = incidentFollowUp || state?.phase === 'INTAKE' || (conversational.current &&
      state && ['COLLECTING_VISUAL_EVIDENCE', 'ANALYZING_VISUAL_EVIDENCE', 'LOADING_SKILL',
        'RETRIEVING_EVIDENCE', 'CORRELATING_EVIDENCE', 'WAITING_FOR_APPROVAL'].includes(state.phase));
    if (!canListen || photoPending || replyPending || (!conversational.current && pending) || speechInFlight || outputStatus !== 'Ready' ||
      inputStatus !== 'Ready' || spoken.current !== latestAssistantId) return;
    const timer = setTimeout(() => { void azureInput.current?.startListening(); }, 120);
    return () => clearTimeout(timer);
  }, [handsFree, voiceConsent, inputProvider, muted, speechProvider, avatarStatus, connected, error,
    state?.phase, incidentFollowUp, pending, photoPending, replyPending, speechInFlight, outputStatus, inputStatus, latestAssistantId, panel, stopHandsFree]);
  useEffect(() => {
    if (!auto || !state || pending || busyPhases.includes(state.phase)) return;
    if (!['IDLE', 'INTAKE', 'COLLECTING_VISUAL_EVIDENCE'].includes(state.phase)) { setAuto(false); return; }
    const timer = setTimeout(() => { void request('advance'); }, 1700 / state.speed);
    return () => clearTimeout(timer);
  }, [auto, state, pending, request]);
  useEffect(() => {
    if (state?.phase === 'CANCELLED') {
      voice.current?.stopListening(); azureInput.current?.stopListening(); azureVoice.current?.stop();
      window.speechSynthesis?.cancel();
    }
  }, [state?.phase]);
  useEffect(() => {
    if (!video.current || !cameraStream) return;
    video.current.srcObject = cameraStream;
    void video.current.play().catch(err => setError(`Camera preview failed: ${err instanceof Error ? err.message : 'Playback denied'}`));
  }, [cameraStream, panel]);
  useEffect(() => {
    const selector = state?.phase === 'WAITING_FOR_APPROVAL' ? '.approval-card' :
      state?.phase === 'COMPLETE' ? '.action-result' : state?.phase === 'FAILED' ? '.failure-card' : undefined;
    if (selector) boardBody.current?.querySelector(selector)?.scrollIntoView({
      block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
    if (state?.phase === 'IDLE' && boardBody.current) boardBody.current.scrollTop = 0;
  }, [state?.phase]);
  useEffect(() => () => {
    cameraStream?.getTracks().forEach(track => track.stop());
  }, [cameraStream]);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const clearPhoto = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = ''; setPreview('');
  }, []);
  useEffect(() => {
    if (!state?.skillReference) return;
    let active = true;
    void api<Skill>('skill').then(result => { if (active) setSkill(result); })
      .catch(err => { if (active) setError(`Skill details unavailable: ${err instanceof Error ? err.message : 'Request failed'}`); });
    return () => { active = false; };
  }, [state?.skillReference?.name, state?.skillReference?.version, state?.skillReference?.provenance?.sha256]);
  useEffect(() => {
    if (!state?.photo && !photoPending) { clearPhoto(); setPhotoHidden(false); }
  }, [state?.photo, photoPending, clearPhoto]);
  const reset = useCallback((scenarioId = state?.scenarioId ?? 'Q-2048') => {
    stopHandsFree(); setAuto(false); clearPhoto(); setPhotoHidden(false); approvalToken.current = undefined;
    voice.current?.stopListening(); azureInput.current?.stopListening(); azureVoice.current?.stop(); setPanel(undefined);
    void request('reset', { scenarioId });
  }, [state?.scenarioId, request, clearPhoto, stopHandsFree]);
  const approve = useCallback(async () => {
    if (!state?.approval || state.phase !== 'WAITING_FOR_APPROVAL' || pending) return;
    setPending(true); setError('');
    try {
      if (!approvalToken.current) {
        const result = await api<{ token: string; state: InvestigationState }>('approval', { requestId: state.approval.id, decision: 'approve' });
        approvalToken.current = result.token;
        setState(result.state);
      }
      const result = await api<{ state: InvestigationState }>('action', { approvalToken: approvalToken.current });
      setState(result.state); approvalToken.current = undefined;
    } catch (err) { setError(err instanceof Error ? err.message : 'Action creation failed. Approval was not silently discarded.'); }
    finally { setPending(false); }
  }, [state, pending]);
  const reject = async () => {
    if (!state?.approval) return;
    setPending(true); setError('');
    try {
      const result = await api<{ state: InvestigationState }>('approval', { requestId: state.approval.id, decision: 'reject' });
      setState(result.state); approvalToken.current = undefined;
    } catch (err) { setError(err instanceof Error ? err.message : 'Rejection failed.'); }
    finally { setPending(false); }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLElement) || event.target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      if (event.key === 'Escape') { setPanel(undefined); return; }
      if (panel || pending) return;
      if (event.code === 'Space' && mode === 'guided' && state && ['IDLE', 'INTAKE', 'COLLECTING_VISUAL_EVIDENCE', 'REJECTED'].includes(state.phase)) {
        event.preventDefault(); void request('advance');
      } else if (event.key.toLowerCase() === 'r' && state?.phase !== 'CREATING_ACTION') reset();
      else if (event.key.toLowerCase() === 'a') void approve();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [panel, pending, mode, state, request, reset, approve]);

  const uploadPhoto = async (file?: File) => {
    if (!file || !health) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG, or WebP image.'); return; }
    if (file.size === 0 || file.size > health.maxImageBytes) { setError(`Photo must be between 1 byte and ${health.maxImageBytes / 1024 / 1024} MB.`); return; }
    if (health.vision?.configured && !imageConsent) {
      setError('Allow Azure image analysis before uploading. Only use illustrative or synthetic demo images.');
      setPanel('demo'); return;
    }
    setPhotoPending(true);
    azureInput.current?.stopListening(); voice.current?.stopListening();
    try {
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const matches = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
        file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) :
        new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
      if (!matches) { setError('The image contents do not match its declared file type. Choose a valid image.'); return; }
      const dataUrl = health.vision?.configured ? await prepareVisionImage(file) : undefined;
      clearPhoto();
      setPhotoHidden(false);
      previewRef.current = URL.createObjectURL(file); setPreview(previewRef.current);
      setPanel(undefined);
      cameraStream?.getTracks().forEach(track => track.stop()); setCameraStream(undefined);
      await request(dataUrl ? 'photo/analyze' : 'photo', {
        name: file.name.slice(0, 200), size: file.size, type: file.type, sample: false,
        ...(dataUrl ? { consent: true, dataUrl } : {}),
      });
    } catch (err) {
      stopHandsFree(); setError(`Photo preparation failed: ${err instanceof Error ? err.message : 'Unable to read the image.'}`);
    } finally { setPhotoPending(false); }
  };
  const openCamera = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('Camera access requires a supported browser on localhost or HTTPS. Upload a photo instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setCameraStream(stream); setPanel('camera');
    } catch (err) { setError(`Camera unavailable: ${err instanceof Error ? err.message : 'Permission denied'}. Upload a photo instead.`); }
  };
  const closePanel = () => {
    cameraStream?.getTracks().forEach(track => track.stop()); setCameraStream(undefined); setPanel(undefined);
  };
  const startConversation = async () => {
    if (!voiceConsent || inputProvider !== 'azure') {
      setError('Select Azure Speech-to-Text and allow microphone audio in Demo controls before starting hands-free conversation.');
      setPanel('demo'); return;
    }
    if (speechProvider === 'browser' || (speechProvider === 'avatar' && avatarStatus !== 'Live')) {
      setError('Select Azure MAI Flash output and connect the avatar, if selected, before starting hands-free conversation.');
      setPanel('demo'); return;
    }
    voice.current?.stopListening(); azureInput.current?.stopListening();
    setError(''); setVoiceNotice(''); setAuto(false); setMode('interactive');
    conversational.current = !!health?.conversation?.configured;
    setMuted(false); azureVoice.current?.setMuted(false);
    setHandsFree(true);
    if (state?.phase === 'IDLE') await request('start');
  };
  const capture = () => {
    if (!video.current?.videoWidth) { setError('Camera is not ready.'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) { setError('Could not capture camera frame.'); return; }
    context.drawImage(video.current, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) { setError('Camera capture failed.'); return; }
      closePanel(); void uploadPhoto(new File([blob], 'camera-evidence.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  if (!state || !health || !skill) return <main className="startup"><Gauge size={48} /><h1>Quality Live Agent</h1>
    {error ? <><p role="alert">{error}</p><button onClick={() => location.reload()}>Retry local connection</button></> : <p>Starting your synthetic investigation workspace...</p>}</main>;

  const scenario = scenarios[state.scenarioId];
  const busy = pending || photoPending || busyPhases.includes(state.phase);
  const needsPhoto = state.phase === 'COLLECTING_VISUAL_EVIDENCE';
  const canAdvance = ['IDLE', 'INTAKE', 'COLLECTING_VISUAL_EVIDENCE', 'REJECTED'].includes(state.phase);
  const assistantStatus = state.phase === 'WAITING_FOR_APPROVAL' ? 'Waiting for approval' :
    busyPhases.includes(state.phase) || pending ? 'Thinking' : voiceStatus;
  const completed = checklist(state).filter(item => item.complete).length;
  const advanceLabel = state.phase === 'IDLE' ? 'Start investigation' : needsPhoto ? 'Use reference image' :
    state.phase === 'REJECTED' ? 'Reopen proposal' : 'Next conversation step';
  const sourceImage = photoHidden ? '' : preview || (state.photo?.sample ? state.detection?.imagePath ?? scenario.sample : '');
  const speechLabel = speechProvider === 'browser' ? 'Browser speech · placeholder avatar' :
    speechProvider === 'mai' ? 'MAI Flash · audio only' : `Azure avatar · ${avatarStatus}`;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark"><Gauge size={25} /></div>
      <div className="brand"><h1>Quality Live Agent <span>/ SKILLFORGE</span></h1><p>From Know-How to Scale: Engineering the Future of AI Skills</p></div>
      <div className="header-actions"><Badge tone="subtle">Synthetic demo · local station alerts</Badge><Badge tone={connected ? 'success' : 'warning'}>{connected ? health.conversation?.configured ? 'LIVE AI / SYNTHETIC TOOLS' : 'GUIDED DEMO' : 'STREAM OFFLINE'}</Badge>
        <a className="quiet skill-studio-launch" href={`/?workspace=quality&scoutTheme=${document.documentElement.getAttribute('data-theme') ?? 'dark'}`} target="_blank" rel="noopener"><Activity size={16} />Control tower</a>
        <a className="quiet skill-studio-launch" href={`/?workspace=skills&scoutTheme=${document.documentElement.getAttribute('data-theme') ?? 'dark'}`} target="_blank" rel="noopener"><Layers3 size={16} />Skill studio</a>
        <button className="quiet" onClick={() => setPanel('architecture')}><Layers3 size={16} />Architecture</button>
        <button className="quiet" onClick={() => setPanel('demo')}><Play size={16} />Demo controls</button>
      </div>
    </header>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
    <nav className="workspace-bar" aria-label="Demo mode">
      <div className="mode-switch"><button className={mode === 'guided' ? 'selected' : ''} onClick={() => { stopHandsFree(); conversational.current = false; setMode('guided'); }}>Guided demo</button>
        <button className={mode === 'interactive' ? 'selected' : ''} onClick={() => { stopHandsFree(); conversational.current = !!health.conversation?.configured; setMode('interactive'); setAuto(false); }}>{health.conversation?.configured ? 'Live conversation' : 'Interactive demo'}</button>
        <button disabled title={health.connected.reason}>{health.conversation?.configured ? 'Enterprise tools · not connected' : 'Connected · not configured'}</button></div>
      <label className="dataset-picker">New synthetic case<select aria-label="Synthetic investigation dataset" value={state.scenarioId}
        disabled={busy || replyPending} onChange={event => {
          const id = scenarioIds.find(id => id === event.target.value);
          if (id) reset(id);
        }}>{scenarioIds.map(id => <option key={id} value={id}>{scenarios[id].station} / {scenarios[id].component}</option>)}</select></label>
      <div className="workflow-path"><span>01 Intake</span><ChevronRight size={13} /><span className={state.skillActive ? 'active' : ''}>02 Evidence</span><ChevronRight size={13} />
        <span className={state.approval ? 'active' : ''}>03 Governed action</span></div>
    </nav>
    <main className="workspace">
        <section className="panel assistant-panel" aria-label="Assistant station">
          <div className="assistant-media">
          {speechProvider === 'avatar' ? <div className="connected-avatar">
            <video ref={avatarVideo} autoPlay muted playsInline aria-label={`Azure Speech avatar. ${avatarStatus}.`} />
            <audio ref={avatarAudio} autoPlay />
            <div className="connected-avatar-caption"><strong>Azure avatar · {avatarStatus}</strong><small>
              {health.speech.character} / {health.speech.photoAvatarBaseModel ? 'Talking head / ' : ''}MAI-Voice-2.1-Flash</small></div>
          </div> : <PlaceholderAvatarRenderer status={assistantStatus} />}
          </div>
          <div className="assistant-brief">
            <div className="section-heading"><h2>Live quality assistant</h2><Badge tone={assistantStatus === 'Waiting for approval' ? 'warning' : 'success'}>{assistantStatus}</Badge></div>
            <p className="assistant-response" aria-live="polite">{latestAssistant?.text ?? 'Tell me what changed on the production line. We will build the investigation together, one evidence source at a time.'}</p>
            {state.scopeNote && <p className="callout" role="status">{state.scopeNote}</p>}
            {health.conversation?.configured && <small className="muted">{mode === 'interactive' ?
              `Foundry ${health.conversation.model} · synthetic records` : 'Scripted guided demo · model not used'}
              {state.conversation && ` · last model reply ${(state.conversation.durationMs / 1000).toFixed(1)}s`}</small>}
            <div className="assistant-next"><span className="eyebrow">NEXT CHECK</span><span>{nextQuestion(state)}</span></div>
            <button className="quiet conversation-trigger" onClick={() => setPanel('conversation')}><AudioLines size={16} />Open conversation & checklist<Badge>{completed}/13 checks</Badge></button>
          </div>
          <div className="assistant-interaction">
          <div className="connection-summary" role="status"><strong>{speechLabel}</strong>
            <span>{speechProvider === 'avatar' && avatarStatus !== 'Live' ? 'Not connected. Start explicitly; Azure usage is billable.' :
              speechProvider === 'browser' ? 'Azure avatar and MAI voice are opt-in, not automatic.' :
              `Speech ${muted ? 'muted' : 'enabled'} · investigation tools remain synthetic.`}</span></div>
          <div className="connection-actions">
            {speechProvider === 'avatar' ? <>
              <button disabled={avatarStatus === 'Connecting' || avatarStatus === 'Live'} onClick={() => {
                if (avatarVideo.current && avatarAudio.current) void azureVoice.current?.connect(avatarVideo.current, avatarAudio.current);
              }}>Connect avatar (billable)</button>
              <button disabled={avatarStatus === 'Disconnected' && !recording.active} onClick={() => recording.stop()}>Disconnect live avatar</button>
            </> : <button onClick={() => setPanel('demo')}>Configure avatar & MAI voice</button>}
          </div>
          {health.speech.configured && <div className="recording-controls">
            {recording.active ? <><p role="status">Recording mode until {new Date(recording.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {recording.connections}/12 connections</p>
              <button onClick={() => recording.stop()}>Stop recording mode</button></> :
              <button onClick={recording.start}>Keep avatar on for 45 minutes (billable)</button>}
            <small>{recording.notice || 'Opt-in automatic reconnect, including reloads in this tab. Three consecutive failures stop retries. Microphone starts only when you choose.'}</small>
          </div>}
          <div className={`waveform ${['Listening', 'Speaking'].includes(voiceStatus) ? 'playing' : ''}`} aria-hidden="true">
            {Array.from({ length: 27 }, (_, i) => <span key={i} style={{ height: `${8 + ((i * 17) % 25)}px`, animationDelay: `${i * 0.04}s` }} />)}
          </div>
          <div className="voice-caption" aria-live="polite">{partial || voiceNotice || (replyPending ? 'Thinking about your answer...' :
            voiceStatus === 'Connecting' ? 'Connecting to Azure Speech-to-Text...' :
            voiceStatus === 'Listening' ? `Listening through ${inputProvider === 'azure' ? 'Azure Speech-to-Text' : 'browser speech'}...` :
              handsFree ? (voiceStatus === 'Speaking' ? 'Hands-free: avatar speaking — microphone paused' :
                incidentFollowUp || state.phase === 'INTAKE' || (conversational.current && ['COLLECTING_VISUAL_EVIDENCE', 'WAITING_FOR_APPROVAL'].includes(state.phase)) ?
                  'Hands-free: preparing to listen...' : 'Hands-free paused: upload evidence or review the investigation') :
              `Microphone: ${inputProvider === 'azure' ? 'Azure Speech-to-Text' : 'browser recognition'} · click for each answer`)}</div>
          <button className={`wide conversation-start ${handsFree ? 'quiet' : 'primary'}`}
            aria-label={handsFree ? 'Stop hands-free conversation' : 'Start hands-free conversation'}
            disabled={!handsFree && (busy || (!incidentFollowUp && !(health.conversation?.configured ?
              ['IDLE', 'INTAKE', 'COLLECTING_VISUAL_EVIDENCE', 'WAITING_FOR_APPROVAL'] : ['IDLE', 'INTAKE']).includes(state.phase)))}
            onClick={() => {
              if (handsFree) { stopHandsFree(); setMuted(true); azureVoice.current?.setMuted(true); }
              else void startConversation();
            }}>{handsFree ? <Square size={16} /> : <Mic size={16} />}{handsFree ? 'Stop conversation' : 'Start conversation'}</button>
          {handsFree && outputStatus === 'Speaking' && <button className="wide quiet" onClick={() => {
            state.messages.filter(message => message.role === 'assistant').forEach(message => handledSpeech.current.add(message.id));
            spoken.current = latestAssistantId;
            void azureVoice.current?.interrupt().then(() => setSpeechInFlight(false));
          }}><Mic size={16} />Interrupt & speak</button>}
          <div className="assistant-controls">
            <button disabled={handsFree} onClick={() => {
              if (!voiceConsent) { setError(`Enable ${inputProvider === 'azure' ? 'Azure Speech-to-Text' : 'browser speech recognition'} consent in Demo controls first.`); setPanel('demo'); return; }
              const listening = voiceStatus === 'Listening' || voiceStatus === 'Connecting';
              voice.current?.stopListening(); azureInput.current?.stopListening();
              if (!listening) {
                setError(''); setVoiceNotice(''); setAuto(false); azureVoice.current?.stop(); window.speechSynthesis?.cancel();
                if (inputProvider === 'azure') void azureInput.current?.startListening();
                else voice.current?.startListening();
              }
            }} aria-label={voiceStatus === 'Listening' || voiceStatus === 'Connecting' ? 'Stop listening' : 'Start microphone'} title={inputProvider === 'azure' ? 'Azure Speech-to-Text' : 'Browser speech recognition'}>
              {voiceStatus === 'Listening' || voiceStatus === 'Connecting' ? <MicOff size={20} /> : <Mic size={20} />}<span>{voiceStatus === 'Listening' || voiceStatus === 'Connecting' ? 'Stop mic' : 'Microphone'}</span></button>
            <button disabled={!needsPhoto || busy} onClick={() => void openCamera()}><Camera size={20} /><span>Camera</span></button>
            <button disabled={!needsPhoto || busy} className={needsPhoto ? 'highlight-control' : ''} onClick={() => upload.current?.click()}><Upload size={20} /><span>Upload</span></button>
            <button onClick={() => setMuted(!muted)} aria-label={muted ? 'Enable spoken responses' : 'Mute spoken responses'}>
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}<span>{muted ? 'Voice off' : 'Voice on'}</span></button>
          </div>
          <input ref={upload} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload component photo"
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void uploadPhoto(file).catch(err => setError(`Image read failed: ${err instanceof Error ? err.message : 'unknown error'}`)); }} />
          <button className="wide quiet new-investigation" disabled={state.phase === 'CREATING_ACTION'} onClick={() => reset()}><RotateCcw size={15} />New investigation</button>
          </div>
        </section>
        <section className="panel team-panel" aria-label="Investigation activity ribbon"><div className="section-heading"><h2>Investigation team</h2><span className="eyebrow">PARALLEL TOOL ACTIVITY / SYNTHETIC SERVICES</span></div>
          <ul className="workers">{state.workers.map(worker => <li key={worker.id} className={`worker ${worker.status.toLowerCase().replaceAll(' ', '-')}`}>
            <span className="status-dot" /><div><div className="worker-title"><strong>{worker.name}</strong><span>{worker.status}</span></div>
              <p title={worker.detail}>{worker.detail}</p>{worker.durationMs !== undefined && <small>{(worker.durationMs / 1000).toFixed(1)}s · {worker.id === 'vision' && state.vision?.source === 'azure-model' ? 'Azure image analysis' : 'synthetic service'}</small>}</div>
          </li>)}</ul>
        </section>

      <section className="investigation-board" aria-label="Live investigation board">
        <div className="board-topline"><span>ENGINEERING FIELD NOTES / {state.agent.toUpperCase()}</span><button onClick={() => setPanel('audit')}><FileText size={14} />Audit trail <span>{state.audit.length}</span></button></div>
        <div className="board-heading"><div><p className="eyebrow">LIVE INVESTIGATION</p><h2>Quality Investigation <span>{state.scenarioId}</span></h2>
          </div><div className="document-number">Q / {state.scenarioId.slice(2)}<small>SYNTHETIC RECORD</small></div></div>
        <div className="board-meta"><Badge tone={state.skillActive ? 'success' : ''} ><button onClick={() => setPanel('skill')}><Layers3 size={13} />{state.skillActive ? `${state.skillReference?.name ?? 'Vehicle Quality Investigation'} · v${state.skillVersion}` : `Pinned guidance · v${state.skillVersion}`}</button></Badge>
          <span>{completed}/13 checks</span><time>{new Date().toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</time></div>
        <div className="board-tabs" role="tablist" aria-label="Investigation sections">
          {boardTabs.map((tab, index) => <button key={tab.id} id={`board-tab-${tab.id}`} role="tab"
            aria-label={tab.label} aria-selected={boardTab === tab.id} aria-controls={`board-panel-${tab.id}`} tabIndex={boardTab === tab.id ? 0 : -1}
            onClick={() => setBoardTab(tab.id)} onKeyDown={event => {
              const next = event.key === 'ArrowRight' ? (index + 1) % boardTabs.length :
                event.key === 'ArrowLeft' ? (index + boardTabs.length - 1) % boardTabs.length :
                  event.key === 'Home' ? 0 : event.key === 'End' ? boardTabs.length - 1 : undefined;
              if (next === undefined) return;
              event.preventDefault();
              setBoardTab(boardTabs[next].id);
              document.getElementById(`board-tab-${boardTabs[next].id}`)?.focus();
            }}>
            {tab.label}{tab.id === 'evidence' && state.evidence.length > 0 && <span className="tab-count">{state.evidence.length}</span>}
            {tab.id === 'incident' && state.phase === 'WAITING_FOR_APPROVAL' && <span className="tab-indicator" aria-label="Approval pending" />}
            {tab.id === 'incident' && state.action && <Check size={14} aria-label="Created" />}
          </button>)}
        </div>
        <div className="board-body" ref={boardBody}>
          <div id="board-panel-investigation" role="tabpanel" aria-labelledby="board-tab-investigation" tabIndex={0} hidden={boardTab !== 'investigation'}>
          <div className="case-context">
          <div className="field-grid">{[
            ['VEHICLE / MODEL', state.fields.vehicle],
            ['STATION', state.fields.station], ['COMPONENT', state.fields.component],
            ['SCOPE', state.fields.count ? `${state.fields.count} vehicles ${state.detection ? 'flagged for inspection' : 'affected'}` : undefined],
          ].map(([label, value]) => <div className={`field ${value ? 'filled' : ''}`} key={label}><span>{label}</span><strong>{value ?? 'Awaiting input'}</strong>{value && <Check size={13} />}</div>)}</div>
          <div className="issue-block"><span className="eyebrow">REPORTED OBSERVATION</span><p>{state.fields.issue ?? 'Describe what happened on the production line. Your investigation will take shape here.'}</p>
            {state.fields.severity && <div className="issue-flags"><Badge tone="warning">{state.fields.severity}</Badge>{state.fields.firstObserved && <span>First observed {state.fields.firstObserved}</span>}</div>}</div>
          <div className="investigation-overview">
          {state.photo && <div className="visual-evidence"><div className="photo-frame">
            {sourceImage ? <img src={sourceImage} alt={state.photo.sample ? `Provided reference image: ${scenario.component}` : 'Operator-provided component evidence; advisory observations require validation'} /> :
              <div className="photo-removed">Photo preview removed.<br />Advisory evidence record retained.</div>}
            <div><small>{state.photo.sample ? 'Provided reference image · not vehicle-specific evidence. Visible gauge readings are illustrative, not this case’s measurements.' : `${state.photo.name} · ${(state.photo.size / 1024).toFixed(1)} KB · local preview`}</small></div>
          </div><div className="visual-copy"><Badge tone="warning">Requires validation</Badge><h3>Visual observation</h3><p>{state.fields.visual ?? 'Recording visual evidence...'}</p>
            <details><summary>Image limitations & suggested checks</summary><small>{state.vision?.observations[0].limitations}</small>
            {state.vision?.source === 'azure-model' && <p className="muted">Azure {state.vision.model} · {state.vision.relevance} · {((state.vision.durationMs ?? 0) / 1000).toFixed(1)}s<br />{state.vision.summary}</p>}
            {state.vision && <><h4>Suggested photo checks</h4><ul>{state.vision.recommendedNextChecks.map(check => <li key={check}>{check}</li>)}</ul></>}
            </details>
            {needsPhoto && state.error && <p role="alert">{state.error} Upload again to retry explicitly.</p>}
            {sourceImage && <button className="quiet" onClick={() => { clearPhoto(); setPhotoHidden(true); }}>Remove local preview</button>}
            {!needsPhoto && <button className="quiet" disabled={busy} onClick={() => reset()}>Replace image: start new investigation</button>}
          </div></div>}
          {state.fields.probableCause && <section className="hypothesis"><Badge tone="warning">Hypothesis · not confirmed</Badge><h3>Probable cause</h3>
            <p>{state.fields.probableCause}</p><small>Correlation is not causation. An engineer must validate the cause.</small>
            <h4>Recommended next step</h4><p>{state.noHistorical ? 'Engineer-led inspection and measurement; no approved procedure was found.' : scenario.historical.procedure[0]}</p>
            <details><summary>All engineer-led checks</summary><ol>{(state.noHistorical ?
              ['Engineer-led inspection and measurement only; no approved corrective procedure was found.'] :
              scenario.historical.procedure).map(check => <li key={check}>{check}</li>)}</ol></details></section>}
          </div>
          {state.phase === 'WAITING_FOR_APPROVAL' && <div className="investigation-next"><div><h3>Human approval required</h3><p>{state.detection ? 'Incident, station alert and saved evidence are ready for your review.' : 'The engineer-review request is ready.'}</p></div>
            <button className="primary" onClick={() => setBoardTab('incident')}>Review {state.detection ? 'incident' : 'request'} <ArrowRight size={16} /></button></div>}
          </div>
          </div>
          <div id="board-panel-evidence" role="tabpanel" aria-labelledby="board-tab-evidence" tabIndex={0} hidden={boardTab !== 'evidence'}>
          <p className="dataset-context">Synthetic dataset: {state.scenarioId} / {scenario.station}. {state.skillActive ? 'Evidence locked to this case.' : 'Awaiting evidence collection.'}
            {' '}{state.detection ? `Detection ${state.detection.id}; vehicle IDs and scope come from the measurement database.` : 'Vehicle, plant and line are dataset context unless reported by the operator.'}
            {' '}Plant: {state.fields.plant ?? 'Awaiting input'} · Line: {state.fields.line ?? 'Awaiting input'}.</p>
          <div className="evidence-section"><div className="section-heading"><h3>Evidence & correlation</h3><span className="eyebrow">{state.evidence.length} SOURCES</span></div>
            {state.evidence.length === 0 ? <div className="empty-evidence"><Activity size={21} /><span>Production, maintenance, and historical evidence will appear as tools return results.</span></div> :
              <ol className="evidence-timeline">{state.evidence.map(e => <li key={e.id}>
                <div className="evidence-header"><strong>{e.source === 'Evidence correlation' ? 'CORRELATION' : e.source.toUpperCase()}</strong><Badge tone={e.type === 'Retrieved' ? 'success' : 'warning'}>{e.type}</Badge></div>
                <p>{e.observation}</p><div className="source-ref">{e.reference} · {new Date(e.at).toLocaleTimeString()}</div>
              </li>)}</ol>}
            {state.measurements && <MeasurementChart data={state.measurements} />}
          </div>
          </div>
          {state.phase === 'FAILED' && <div className="failure-card" role="alert"><h3>Evidence incomplete</h3><p>{state.error}</p>
            <button disabled={busy} onClick={async () => { await request('settings', { failProduction: false }); await request('advance'); }}>Restore production tool & retry</button></div>}
          <div id="board-panel-incident" role="tabpanel" aria-labelledby="board-tab-incident" tabIndex={0} hidden={boardTab !== 'incident'}>
          {!state.action && state.phase !== 'WAITING_FOR_APPROVAL' && <div className="empty-evidence"><ShieldCheck size={24} /><div><h3>{state.phase === 'CREATING_ACTION' ? 'Creating approved incident...' : state.phase === 'REJECTED' ? 'Proposal declined' : 'Nothing has been created'}</h3><p>{state.phase === 'CREATING_ACTION' ? 'Saving the incident and publishing its station alert together.' : 'The agent prepares a proposal after investigating. An incident and station alert require your approval.'}</p></div></div>}
          {state.phase === 'WAITING_FOR_APPROVAL' && <section className="approval-card"><div className="section-heading"><h3><ShieldCheck size={20} />Human approval required</h3><Badge tone="warning">GOVERNED ACTION</Badge></div>
            <p>{state.detection ? `Create an incident for ${state.detection.vehicle.id}, alert ${state.detection.station}, and save the evidence for future evaluation.` : state.fields.recommendedAction}</p>
            {state.detection && <details><summary>Review the full proposal</summary><p>{state.fields.recommendedAction}</p></details>}
            <small>{state.detection ? 'Say yes after the agent asks, or approve below. Verbal confirmation expires after two minutes. ' : 'Approve request creation and routing only. '}Calibration changes, holds, and production release need separate engineer approval.</small>
            <div className="approval-buttons"><button className="primary" disabled={busy} onClick={() => void approve()}><ShieldCheck size={16} />{state.approval?.status === 'approved' ? 'Retry approved action creation' : state.detection ? 'Approve incident, alert & save' : 'Approve and create action'}</button>
              <button disabled={busy} onClick={() => setPanel('review')}>Review details</button><button disabled={busy || state.approval?.status === 'approved'} onClick={() => void reject()}>Reject</button></div></section>}
          {state.action && <section className="action-result"><div className="section-heading"><h3><ShieldCheck size={21} />{state.action.id} created</h3><Badge tone="success">{state.incident ? 'INCIDENT CREATED' : 'REQUEST ROUTED'}</Badge></div>
            <p>{state.incident ? `Incident created. Sent alert to ${state.incident.station} dashboard. Details and evidence saved in the database for further evaluation.` :
              'Prepared and routed to an authorized Quality Engineer for approval.'}</p>
            {state.incident && <div className="incident-links">
              <a href={`${state.incident.href}&scoutTheme=${document.documentElement.getAttribute('data-theme') ?? 'dark'}`} target="_blank" rel="noopener">Open {state.incident.id} details <ArrowRight size={16} /></a>
              <a href={`${state.incident.stationHref}&scoutTheme=${document.documentElement.getAttribute('data-theme') ?? 'dark'}`} target="_blank" rel="noopener">View Station 42 alert dashboard <ArrowRight size={16} /></a>
            </div>}
            <details><summary>View recommended checks ({state.action.tasks.length})</summary><ul>{state.action.tasks.map(task => <li key={task}><Check size={14} />{task}</li>)}</ul></details>
            <strong>No production release has been authorized automatically.</strong>
            {state.scenarioId === 'Q-2048' ? <button className="primary" onClick={() => reset('Q-3012')}><Layers3 size={16} />Demonstrate skill reuse<ArrowRight size={16} /></button> :
              <div className="closing"><span>One expert. One demonstrated workflow.</span><h3>Teach once. Scale everywhere.</h3></div>}</section>}
          </div>
        </div>
        <footer className="board-footer"><ShieldCheck size={14} /><span>Image analysis is advisory · Skill version pinned · No autonomous production release</span><span>{state.phase.replaceAll('_', ' ')}</span></footer>
      </section>

    </main>
    <footer className="presenter-bar"><div><button className="skill-tile" aria-label="Explore the reusable skill" onClick={() => setPanel('skill')}><Layers3 size={20} /><span><strong>Know-how, not just tools.</strong><small>Explore the reusable skill</small></span><ArrowRight size={18} /></button>
      <Badge tone={state.skillActive ? 'success' : ''}>{state.skillActive ? `SKILL ACTIVE · ${state.skillStep}/14` : 'READY TO INVESTIGATE'}</Badge></div>
      <div className="presenter-actions">{auto && <button onClick={() => setAuto(false)}><Square size={14} />Pause guided demo</button>}
        {mode === 'guided' && !auto && state.phase === 'IDLE' && <button onClick={() => setAuto(true)} disabled={busy}><Play size={15} />Run guided demo</button>}
        {canAdvance && !(mode === 'interactive' && health.conversation?.configured && state.phase === 'INTAKE') &&
          <button className="primary" disabled={busy || auto} onClick={() => void request('advance')}>{busy ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}{advanceLabel}{mode === 'guided' && <kbd aria-hidden="true">SPACE</kbd>}</button>}
        {!canAdvance && busy && <span className="running-label"><LoaderCircle size={16} className="spin" />Investigating...</span>}
      </div>
    </footer>
    {notes && <div className="presenter-note"><strong>Presenter cue</strong><p>{state.phase === 'COMPLETE' ? 'Now reveal Skill Recorder: record, reconstruct, review, approve, publish. Then reuse the same skill with the second agent.' :
      state.phase === 'WAITING_FOR_APPROVAL' ? 'Pause here. Explain that creating a request is not authorizing a calibration change or production release.' :
      'Watch the board fill while the conversation continues. Distinguish visual observations from measured facts.'}</p></div>}
    {panel && <Drawer title={{ skill: 'Vehicle Quality Investigation', architecture: 'The architecture behind the experience', audit: 'Audit & governance', demo: 'Presenter controls', photo: 'Photo evidence', review: 'Review corrective-action request', camera: 'Camera evidence', conversation: 'Conversation & investigation checks' }[panel]} close={closePanel}>
      {panel === 'conversation' && <>
        <section className="conversation-panel"><div className="section-heading"><h2>Live transcript</h2><AudioLines size={17} /></div><Transcript state={state} />
          <form className="text-input" onSubmit={event => { event.preventDefault(); if (text.trim()) { void request('input', { text, confirmation: currentConfirmation.current }); setText(''); } }}>
            <label className="sr-only" htmlFor="operator-message">Operator message</label>
            <input id="operator-message" value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Type what the operator says..." disabled={!incidentFollowUp && ['CANCELLED', 'REJECTED', 'COMPLETE'].includes(state.phase)} />
            <button type="submit" aria-label="Send message" disabled={pending || !text.trim() || (!incidentFollowUp && ['CANCELLED', 'REJECTED', 'COMPLETE'].includes(state.phase))}><ArrowRight size={18} /></button>
          </form><small className="mock-disclaimer">{mode === 'interactive' && health.conversation?.configured ?
            `Live Foundry ${health.conversation.model} · synthetic tools · explicit approval required` : 'Scripted demonstration · not a conversational model'}</small>
        </section>
        <section className="checklist-panel"><Checklist items={checklist(state)} /><div className="next-question"><span className="eyebrow">NEXT / STILL NEEDED</span><p>{nextQuestion(state)}</p></div></section>
      </>}
      {panel === 'skill' && <><Badge tone="success">v{skill.version} · {skill.provenance ? 'reviewed imported guidance' : 'reviewed synthetic example'}</Badge><h3>{skill.name}</h3><p>{skill.description}</p>
        <p className="callout">Tools define what an agent can do. Skills define how it should perform the process.</p>
        <h3>How this agent learned the procedure</h3>{skill.provenance ? <><p>{skill.source}</p>
          <p>Reviewer declaration: {skill.provenance.reviewedBy} · {new Date(skill.provenance.reviewedAt).toLocaleString()}</p>
          <p>Recording/export reference: {skill.provenance.recordingReference || 'Not supplied; manual guidance'}</p>
          <p className="skill-content-hash">SHA-256: {skill.provenance.sha256}</p>
          <p className="muted">The exact imported body is pinned for this investigation and supplied to conversational reasoning. Source/reviewer labels are operator declarations, not verified identity or recording attestation. No scripts or new tool permissions execute.</p>
          <details open><summary>Attached expert guidance</summary><pre>{skill.guidance}</pre></details></> :
          <><ol className="learning-steps">{['Expert demonstrated workflow', 'Skill Recorder reconstructed intent and steps', 'Expert reviewed SKILL.md', 'Quality owner approved the procedure', 'Skill v1.0.0 published', 'Skill attached to authorized agent'].map(step => <li key={step}>{step}</li>)}</ol>
            <p className="muted">Illustrated provenance, not a real captured session or one-click Foundry import. This app loads its reviewed local SKILL.md.</p></>}
        <h3>Fixed server procedure / {state.skillActive ? state.agent : 'not active yet'}</h3><ol className="skill-steps">{skill.steps.map((step, i) => <li className={state.skillStep === i + 1 ? 'current-step' : ''} key={step}>{step}</li>)}</ol>
        <h3>Required human approvals</h3><ul>{skill.approvals.map(item => <li key={item}>{item}</li>)}</ul><details><summary>Inspect SKILL.md</summary><pre>{skill.content}</pre></details></>}
      {panel === 'architecture' && <><p className="callout">Models give intelligence. Knowledge gives context. Tools give capabilities. Skills give know-how.</p>
        <div className="architecture-stack">{['Operator / text, optional browser speech and camera', 'Quality Live Agent / typed server workflow', 'Reviewed SKILL.md / pinned v1.0.0', 'Mock tools / quality, production, maintenance, knowledge', 'Approval service / session-bound, single-use authorization', 'Corrective-action request / engineer review, never auto-release'].map((layer, i) => <div key={layer}><span>0{i + 1}</span>{layer}</div>)}</div>
        <h3>Microsoft integration seams</h3><p>{health.connected.reason}</p><ul>{health.connected.integrations.map(item => <li key={item}>{item} · explicit adapter stub</li>)}</ul>
        <p>The background workers are parallel local tool tasks, not separate deployed LLM agents. {health.conversation?.configured ?
          `Conversational intake uses Foundry ${health.conversation.model} with validated field updates. ` : 'Conversational reasoning is not configured. '}
          Image inference, hosted Foundry agents and Voice Live remain disconnected. Azure Speech MAI Flash output and a standard real-time avatar are separately opt-in.</p>
        <p>Skill Recorder is used separately: record → analyze → review draft → process approval → version/import → agent attachment. No integration is fabricated.</p></>}
      {panel === 'audit' && <><div className="policy-grid">{['Synthetic data only', 'Version-pinned skill', 'Human approval enforced', 'Advisory image analysis', 'Actions logged', 'No autonomous release'].map(policy => <div key={policy}><ShieldCheck size={17} />{policy}</div>)}</div>
        <p className="muted">Session-local audit. Correlation ID: {state.correlationId}. Reset clears this synthetic session; production requires durable, tamper-evident storage.</p>
        <button disabled={!state.audit.length} onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(state.audit, null, 2)], { type: 'application/json' }));
          const link = document.createElement('a'); link.href = url; link.download = `audit-${state.scenarioId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Download audit JSON</button>
        {state.audit.map(event => <article className="audit-event" key={event.id}><div className="section-heading"><strong>{event.tool}</strong><Badge tone={event.result === 'success' ? 'success' : 'warning'}>{event.result}</Badge></div>
          <time>{new Date(event.at).toLocaleTimeString()}</time><p>{event.outputSummary}</p><small>{event.agent} · {event.skill} v{event.version} · {event.category} · approval: {event.approval}</small></article>)}</>}
      {panel === 'demo' && <><p>Guided playback stops at the approval boundary. No timer or keyboard “advance” can create an action.</p>
        <div className="control-grid"><button disabled={busy || !canAdvance} onClick={() => { closePanel(); void request('advance'); }}><Play size={16} />Advance scripted step</button>
          <button disabled={busy || !canAdvance} onClick={() => { closePanel(); setAuto(true); }}><Play size={16} />Run guided demo</button>
          <button disabled={state.phase === 'CREATING_ACTION'} onClick={() => reset()}><RotateCcw size={16} />Reset demo</button>
          <button disabled={!needsPhoto || busy} onClick={() => { closePanel(); void request('advance'); }}><Upload size={16} />Simulate photo upload</button>
          <button disabled={state.phase === 'IDLE' || state.phase === 'COMPLETE' || state.phase === 'CANCELLED' || state.phase === 'CREATING_ACTION'} onClick={() => { setAuto(false); closePanel(); void request('cancel'); }}><Square size={16} />Cancel investigation</button>
          <button disabled={busy || state.phase !== 'WAITING_FOR_APPROVAL'} onClick={() => { closePanel(); void approve(); }}><ShieldCheck size={16} />Approve corrective request</button>
          <button disabled={busy || state.phase !== 'WAITING_FOR_APPROVAL' || state.approval?.status === 'approved'} onClick={() => { closePanel(); void reject(); }}>Reject request</button></div>
        <h3>Controlled failures</h3><label className="toggle"><input type="checkbox" checked={state.failProduction} disabled={busy} onChange={e => void request('settings', { failProduction: e.target.checked })} />Production API unavailable</label>
        <label className="toggle"><input type="checkbox" checked={state.noHistorical} disabled={busy || state.skillActive} onChange={e => void request('settings', { noHistorical: e.target.checked })} />No similar historical case</label>
        {state.phase === 'FAILED' && <button disabled={busy} onClick={async () => { closePanel(); await request('settings', { failProduction: false }); await request('advance'); }}>Restore tool & resume</button>}
        <h3>Connected avatar & MAI voice</h3>
        <p className="muted">{health.speech.reason} Azure speech/video usage is billable. Speech output sends synthetic assistant text; Azure input sends microphone audio when enabled. It does not connect the investigation to a Foundry agent.</p>
        <button disabled={!health.speech.configured || speechChecking} onClick={async () => {
          setSpeechChecking(true); setError('');
          try { const capability = await api<SpeechCapabilities>('speech/verify', {}); setHealth(current => current ? { ...current, speech: capability } : current); }
          catch (err) { setError(err instanceof Error ? err.message : 'Azure Speech verification failed.'); }
          finally { setSpeechChecking(false); }
        }}>{speechChecking ? 'Checking Azure access...' : 'Check Azure Speech access'}</button>
        <label className="setting">Speech output<select aria-label="Speech output provider" value={speechProvider} onChange={e => {
          if (recording.active) recording.stop();
          stopHandsFree(); azureVoice.current?.disconnect(); voice.current?.setMuted(true); setMuted(true);
          setSpeechProvider(e.target.value as SpeechProvider);
        }}><option value="browser">Browser speech (local fallback, selected explicitly)</option>
          <option value="mai" disabled={!health.speech.verified}>Azure MAI-Voice-2.1-Flash</option>
          <option value="avatar" disabled={!health.speech.avatarRelayAvailable}>Azure avatar + MAI Flash</option></select></label>
        {speechProvider === 'avatar' && <div className="control-grid">
          <button disabled={avatarStatus === 'Connecting' || avatarStatus === 'Live'} onClick={() => {
            if (avatarVideo.current && avatarAudio.current) void azureVoice.current?.connect(avatarVideo.current, avatarAudio.current);
          }}>Connect Azure avatar (billable)</button>
          <button onClick={() => recording.stop()}>Disconnect avatar</button>
        </div>}
        {speechProvider !== 'browser' && <button disabled={speechProvider === 'avatar' && avatarStatus !== 'Live'} onClick={() => {
          voice.current?.setMuted(true); azureVoice.current?.setMuted(false); setMuted(false);
          void azureVoice.current?.speak({ text: speechTestText, audition: true, avatar: speechProvider === 'avatar' });
        }}>Test MAI Flash voice (billable)</button>}
        <h3>Speech input & presentation</h3>
        <h3>Photo analysis</h3>
        <p className="muted">{health.vision?.configured ? `Azure ${health.vision.model} inspects the actual image after consent. Images are resized to 1280 pixels, re-encoded as JPEG without original metadata and bounded to 1 MB. Image bytes are sent to Azure, not stored by this app. Provider retention policies still apply. Use synthetic or illustrative demo images only.` :
          'Guided image observations are scripted. Uploaded pixels stay in the browser and are not inspected by a model.'}</p>
        {health.vision?.configured && <label className="toggle"><input type="checkbox" checked={imageConsent} onChange={e => setImageConsent(e.target.checked)} />
          Allow Azure image analysis (demo image sent to Azure)</label>}
        <label className="setting">Microphone input<select aria-label="Speech input provider" value={inputProvider} onChange={e => {
          stopHandsFree(); voice.current?.stopListening(); azureInput.current?.stopListening(); setVoiceConsent(false); setError('');
          setInputProvider(e.target.value as SpeechInputProvider);
        }}><option value="azure" disabled={!health.speech.configured}>Azure Speech-to-Text (billable)</option>
          <option value="browser">Browser recognition (explicit opt-in)</option></select></label>
        <label className="toggle"><input type="checkbox" checked={voiceConsent} onChange={e => {
          setVoiceConsent(e.target.checked);
          if (!e.target.checked) { stopHandsFree(); voice.current?.stopListening(); azureInput.current?.stopListening(); }
        }} />{inputProvider === 'azure' ? 'Allow Azure Speech-to-Text (microphone audio sent to Azure)' : 'Allow browser speech recognition'}</label>
        <p className="muted">{inputProvider === 'azure' ?
          'Start conversation listens between MAI replies after one explicit start. The microphone pauses for replies, open drawers and submitted photo briefings. It resumes for follow-up questions and approval discussion. Stop conversation ends automatic listening. Errors stop hands-free mode; there is no browser fallback.' :
          'Browser recognition may send audio to your browser vendor and can fail in VS Code. Select Azure Speech-to-Text explicitly to use Azure instead.'} Audio is not stored by this app. {health.conversation?.configured ? 'Final transcript text goes to the configured Foundry model; enterprise records remain synthetic.' : 'Final text goes to the scripted synthetic investigation.'} This is turn-taking, not Voice Live.</p>
        <label className="toggle"><input type="checkbox" checked={!muted} onChange={e => setMuted(!e.target.checked)} />Enable spoken responses ({speechProvider === 'browser' ? 'browser' : 'Azure MAI Flash'})</label>
        <button onClick={() => { voice.current?.dispose(); azureInput.current?.dispose(); azureVoice.current?.disconnect(); setError('Simulated voice disconnection. Use text input or explicitly reconnect speech.'); closePanel(); }}>Simulate voice disconnection</button>
        <label className="toggle"><input type="checkbox" checked={notes} onChange={e => setNotes(e.target.checked)} />Show presenter cues</label>
        <label className="setting">Animation / tool speed<select aria-label="Demo speed" value={state.speed} disabled={busy} onChange={e => void request('settings', { speed: Number(e.target.value) })}><option value={0.5}>0.5× deliberate</option><option value={1}>1× normal</option><option value={2}>2× fast</option><option value={4}>4× rehearsal</option></select></label>
        <p className="muted">Space: next · R: reset · A: approve pending request · Escape: close. Shortcuts are disabled while typing or using controls.</p></>}
      {panel === 'review' && <><Badge tone="warning">Request creation only</Badge><h3>{state.scenarioId} / {scenario.station}</h3><p>{state.fields.recommendedAction}</p>
        <h3>Proposed tasks</h3><ol>{(state.noHistorical ? ['Engineer-led inspection only; no approved corrective procedure found.'] : scenario.historical.procedure).map(task => <li key={task}>{task}</li>)}</ol>
        <p className="callout">This approval cannot release vehicles, change calibration, place/remove a hold, or close the issue.</p>
        <button className="primary" disabled={busy || state.phase !== 'WAITING_FOR_APPROVAL'} onClick={() => { closePanel(); void approve(); }}>Approve and create action</button></>}
      {panel === 'camera' && <><video className="camera-preview" ref={video} autoPlay muted playsInline aria-label="Live local camera preview" />
        <p>Local preview only. Capture one component photo; avoid people or confidential material.</p><button className="primary" onClick={capture}>Capture component photo</button></>}
      {panel === 'photo' && <p>Use the upload control when the agent requests visual evidence.</p>}
    </Drawer>}
  </div>;
}
