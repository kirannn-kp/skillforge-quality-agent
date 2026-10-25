// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvestigationEngine } from '../server/engine';
import type { VoiceStatus } from '../src/voice';
import App from '../src/App';
import type { ConversationTurn, IncidentConfirmationInput } from '../shared/conversation';
import { IncidentStore } from '../server/incidentStore';

const speech = vi.hoisted(() => ({
  inputStart: vi.fn(),
  inputStop: vi.fn(),
  inputStatus: undefined as ((status: VoiceStatus) => void) | undefined,
  final: undefined as ((text: string) => void) | undefined,
  error: undefined as ((message: string) => void) | undefined,
  paused: undefined as ((message: string) => void) | undefined,
  conversationConfigured: false,
  visionConfigured: false,
  turn: undefined as ConversationTurn | undefined,
  completeReply: undefined as (() => void) | undefined,
  speak: vi.fn(),
  engine: undefined as InvestigationEngine | undefined,
  events: undefined as { onmessage?: (event: { data: string }) => void } | undefined,
}));
vi.mock('../src/api', () => ({
  bootstrap: async () => ({
    state: speech.engine!.snapshot(),
    skill: speech.engine!.currentSkill(),
    health: { mode: 'mock', maxImageBytes: 8388608, connected: { available: false, reason: 'Synthetic test', integrations: [] },
      conversation: { configured: speech.conversationConfigured, model: 'synthetic-model' },
      vision: { configured: speech.visionConfigured, model: 'synthetic-vision' },
      speech: { configured: true, verified: true, reason: 'Synthetic test', voice: 'en-US-Harper:MAI-Voice-2.1-Flash',
        character: 'lisa', style: 'casual-sitting', avatarRelayAvailable: true } },
  }),
  api: async (path: string, body: { text?: string; scenarioId?: 'Q-2048' | 'Q-3012'; confirmation?: IncidentConfirmationInput }) => {
    if (path === 'skill') return speech.engine!.currentSkill();
    if (path === 'start') speech.engine!.start();
    else if (path === 'input') speech.engine!.input(body.text!);
    else if (path === 'conversation') await speech.engine!.converse(body.text!, {
      status: () => ({ configured: true, model: 'synthetic-model' }), prepare: async () => {},
      respond: async () => speech.turn!,
    }, body.confirmation);
    else if (path === 'reset') speech.engine!.reset(body.scenarioId);
    else if (path === 'cancel') speech.engine!.cancel();
    else if (path === 'photo/analyze') await speech.engine!.collectPhoto({
      name: 'synthetic.jpg', size: 3, type: 'image/jpeg', sample: false,
    }, { service: { analyze: async () => ({
      relevance: 'relevant', source: 'azure-model', model: 'synthetic-vision',
      summary: 'A door hinge is visible; no defect is confirmed.',
      observations: [{ region: 'Hinge', observation: 'Attachment points are visible.',
        classification: 'requires_validation', limitations: 'Measurements are required.' }],
      recommendedNextChecks: ['Have an engineer inspect hinge alignment.'],
    }) }, image: { consent: true, dataUrl: 'data:image/jpeg;base64,/9j//9k=' } });
    else throw new Error(`Unexpected test API route: ${path}`);
    return speech.engine!.snapshot();
  },
}));
vi.mock('../src/photo', () => ({ prepareVisionImage: async () => 'data:image/jpeg;base64,/9j//9k=' }));
vi.mock('../src/azureSpeechInput', () => ({
  AzureSpeechInput: class {
    constructor(final: (text: string) => void, _partial: (text: string) => void,
      status: (value: VoiceStatus) => void, error: (message: string) => void, paused: (message: string) => void) {
      speech.final = final; speech.inputStatus = status; speech.error = error; speech.paused = paused;
    }
    async startListening() { speech.inputStart(); speech.inputStatus?.('Listening'); }
    stopListening() { speech.inputStop(); speech.inputStatus?.('Ready'); }
    dispose() { this.stopListening(); }
  },
}));
vi.mock('../src/azureSpeech', () => ({
  AzureSpeechOutput: class {
    constructor(private status: (value: VoiceStatus) => void) {}
    setMuted(muted: boolean) { if (muted) this.status('Ready'); }
    stop() { this.status('Ready'); }
    async interrupt() { speech.completeReply?.(); }
    disconnect() { this.stop(); }
    async speak(input: { text: string }) {
      speech.speak(input.text); this.status('Speaking');
      await new Promise<void>(resolve => {
        speech.completeReply = () => { this.status('Ready'); resolve(); };
      });
    }
  },
}));
class TestEvents {
  constructor() { speech.events = this; queueMicrotask(() => this.onopen?.()); }
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  close() {}
}
async function setup(handsFree = true) {
  render(<App />);
  await screen.findByRole('button', { name: 'Demo controls' });
  fireEvent.click(screen.getByRole('button', { name: 'Demo controls' }));
  fireEvent.change(screen.getByLabelText('Speech output provider'), { target: { value: 'mai' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Allow Azure Speech-to-Text (microphone audio sent to Azure)' }));
  if (speech.visionConfigured) fireEvent.click(screen.getByRole('checkbox', { name: 'Allow Azure image analysis (demo image sent to Azure)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
  if (!handsFree) return;
  fireEvent.click(screen.getByRole('button', { name: 'Start hands-free conversation' }));
  await waitFor(() => expect(speech.speak).toHaveBeenCalledOnce());
}
async function finishReply() {
  await act(async () => { speech.completeReply?.(); });
}
async function answer(text: string) {
  await act(async () => { speech.inputStatus?.('Ready'); speech.final?.(text); });
}
describe('hands-free turn taking without paid services', () => {
  beforeEach(() => {
    vi.clearAllMocks(); speech.completeReply = undefined; speech.conversationConfigured = false;
    speech.visionConfigured = false;
    speech.engine = new InvestigationEngine('Q-2048', undefined, 0);
    vi.stubGlobal('EventSource', TestEvents);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('listens after each reply, fills all intake fields, and pauses for photo evidence', async () => {
    await setup();
    expect(speech.inputStart).not.toHaveBeenCalled();
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(1));
    await answer('Several vehicles need high force to close the front-left door.');
    expect(speech.engine!.state.fields.component).toContain('door');
    expect(speech.inputStart).toHaveBeenCalledTimes(1);
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(2));
    await answer('Station forty-two.');
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(3));
    await answer('Eighteen vehicles.');
    await finishReply();
    expect(speech.engine!.state.fields.reportedCount).toBe(18);
    expect(speech.engine!.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
    expect(screen.getByText('Hands-free paused: upload evidence or review the investigation')).toBeDefined();
    expect(speech.inputStart).toHaveBeenCalledTimes(3);
    expect(speech.engine!.state.approval).toBeUndefined();
  });
  it('does not start listening after Stop conversation, even when a reply finishes later', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Stop hands-free conversation' }));
    await finishReply();
    await new Promise(resolve => setTimeout(resolve, 650));
    expect(speech.inputStart).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start hands-free conversation' })).toBeDefined();
  });
  it('stops automatic listening on recognition failure instead of retrying paid sessions', async () => {
    await setup();
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledOnce());
    await act(async () => { speech.error?.('Synthetic recognition failure.'); });
    expect(screen.getByRole('alert').textContent).toContain('Synthetic recognition failure');
    expect(screen.getByRole('button', { name: 'Start hands-free conversation' })).toBeDefined();
    await new Promise(resolve => setTimeout(resolve, 650));
    expect(speech.inputStart).toHaveBeenCalledOnce();
  });
  it('stops hands-free mode when resetting and never listens after a stale reply completes', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'New investigation' }));
    await finishReply();
    await new Promise(resolve => setTimeout(resolve, 650));
    expect(speech.inputStart).not.toHaveBeenCalled();
    expect(speech.engine!.state.phase).toBe('IDLE');
  });
  it('pauses while controls are open and stops when spoken responses are muted', async () => {
    await setup();
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Demo controls' }));
    expect(speech.inputStatus).toBeDefined();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable spoken responses (Azure MAI Flash)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await new Promise(resolve => setTimeout(resolve, 650));
    expect(speech.inputStart).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Start hands-free conversation' })).toBeDefined();
  });
  it('keeps a real conversation going through clarification and photo collection without another Start click', async () => {
    speech.conversationConfigured = true;
    await setup();
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledOnce());
    speech.turn = { reply: 'Yes, your message came through. What have you observed?', fields: {
      issue: null, station: null, component: null, reportedCount: null, vehicle: null, plant: null, line: null,
    } };
    await answer('Can you hear me?');
    expect(speech.engine!.state.fields.issue).toBeUndefined();
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(2));
    speech.turn = { reply: 'Could you upload a photo?', fields: {
      ...speech.turn.fields, issue: 'High door closing force', component: 'Front-left door', station: 'Station 42', reportedCount: 18,
    } };
    await answer('The front-left door is stiff. Station 42, eighteen vehicles.');
    expect(speech.engine!.state.phase).toBe('COLLECTING_VISUAL_EVIDENCE');
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('pauses on inactivity without displaying an error or automatically reconnecting', async () => {
    await setup();
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledOnce());
    await act(async () => { speech.paused?.('Microphone paused after 60 seconds.'); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Microphone paused after 60 seconds.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Start hands-free conversation' })).toBeDefined();
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(speech.inputStart).toHaveBeenCalledOnce();
  });
  it('allows explicit interruption of a reply and resumes listening', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt & speak' }));
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Stop hands-free conversation' })).toBeDefined();
  });
  it('hands off the idle microphone on upload and speaks findings then recommendations even in one snapshot', async () => {
    speech.conversationConfigured = true; speech.visionConfigured = true;
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => 'blob:synthetic');
      static revokeObjectURL = vi.fn();
    });
    await setup();
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledOnce());
    speech.turn = { reply: 'Could you upload a photo?', fields: {
      issue: 'High closing force', component: 'Front-left door', station: 'Station 42', reportedCount: 18,
      vehicle: null, plant: null, line: null,
    } };
    await answer('Front-left door closing force. Station forty-two, eighteen vehicles.');
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(2));
    const stoppedBefore = speech.inputStop.mock.calls.length;
    const file = new File([new Uint8Array([255, 216, 255])], 'synthetic.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'slice', { value: () => ({
      arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer,
    }) });
    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [file] } });
    await waitFor(() => expect(speech.speak).toHaveBeenCalledTimes(3));
    expect(speech.inputStop.mock.calls.length).toBeGreaterThan(stoppedBefore);
    expect(speech.speak.mock.calls[2][0]).toContain('A door hinge is visible');
    expect(speech.engine!.state.phase).toBe('WAITING_FOR_APPROVAL');
    expect(speech.inputStart).toHaveBeenCalledTimes(2);
    await finishReply();
    await waitFor(() => expect(speech.speak).toHaveBeenCalledTimes(4));
    const recommendation = speech.speak.mock.calls[3][0];
    expect(recommendation).toContain('hinge-tool calibration');
    expect(recommendation).toContain('Recommended checks');
    expect(recommendation).toContain('Approve request creation only');
    expect(recommendation).not.toContain('Please review the board');
    expect(speech.inputStart).toHaveBeenCalledTimes(2);
    await finishReply();
    await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(3));
    expect(speech.engine!.state.action).toBeUndefined();
  });
  it('uses recognized yes for the presented incident and resumes listening after creation and follow-up', async () => {
    const store = new IncidentStore();
    speech.engine = new InvestigationEngine('Q-2048', undefined, 0, store);
    speech.conversationConfigured = true;
    try {
      await setup(); await finishReply();
      await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(1));
      await answer('Can you tell me your investigation?');
      await waitFor(() => expect(speech.speak).toHaveBeenCalledTimes(2));
      expect(speech.speak.mock.calls[1][0]).toContain('Say yes');
      await finishReply();
      await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(2));
      await answer('Yes, please.');
      await waitFor(() => expect(speech.speak).toHaveBeenCalledTimes(3));
      expect(store.list()).toHaveLength(1);
      expect(speech.speak.mock.calls[2][0]).toContain('What else would you like me to investigate?');
      await finishReply();
      await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(3));
      expect(screen.getByRole('button', { name: 'Stop hands-free conversation' })).toBeDefined();
      await answer('Tell me your findings.');
      await waitFor(() => expect(speech.speak).toHaveBeenCalledTimes(4));
      expect(speech.speak.mock.calls[3][0]).toContain('already saved');
      await finishReply();
      await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(4));
      expect(store.list()).toHaveLength(1);
      expect(speech.engine.state.phase).toBe('COMPLETE');
    } finally { store.close(); }
  });
  it.each([true, false])('confirms an incident request without replaying findings, hands-free=%s', async handsFree => {
    const store = new IncidentStore();
    speech.engine = new InvestigationEngine('Q-2048', undefined, 0, store);
    speech.conversationConfigured = true;
    try {
      await setup(false);
      fireEvent.click(screen.getByRole('button', { name: 'Enable spoken responses' }));
      await act(async () => {
        await speech.engine!.investigateDetection(store.detection('DEMO-00427'));
        speech.events?.onmessage?.({ data: JSON.stringify(speech.engine!.snapshot()) });
      });
      await waitFor(() => expect(speech.speak).toHaveBeenCalledOnce());
      if (handsFree) fireEvent.click(screen.getByRole('button', { name: 'Start hands-free conversation' }));
      await finishReply();
      if (!handsFree) fireEvent.click(screen.getByRole('button', { name: 'Start microphone' }));
      await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(1));
      await answer('Can you create an incident, alert Station 42 and save these findings?');
      await waitFor(() => expect(speech.speak).toHaveBeenCalledTimes(2));
      expect(speech.speak.mock.calls[1][0]).toContain('Shall I go ahead?');
      expect(speech.speak.mock.calls[1][0]).not.toContain('62 N');
      expect(screen.getByRole('tab', { name: /^Incident$/ }).getAttribute('aria-selected')).toBe('true');
      expect(store.list()).toHaveLength(0);
      await finishReply();
      if (!handsFree) fireEvent.click(screen.getByRole('button', { name: 'Start microphone' }));
      await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(2));
      await answer('Yes, please create the incident and send the alert.');
      await waitFor(() => expect(speech.speak).toHaveBeenCalledTimes(3));
      expect(speech.speak.mock.calls[2][0]).toContain('What else would you like me to investigate?');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(speech.engine.state.phase).toBe('COMPLETE');
      expect(store.list()).toHaveLength(1);
      expect(store.alerts('Station 42')).toHaveLength(1);
    } finally { store.close(); }
  });
  it('does not rebind speech already being captured to a newer proposal received through the activity stream', async () => {
    const store = new IncidentStore();
    speech.engine = new InvestigationEngine('Q-2048', undefined, 0, store);
    speech.conversationConfigured = true;
    try {
      await setup(); await finishReply();
      await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(1));
      await answer('Tell me your investigation.');
      await waitFor(() => expect(speech.speak).toHaveBeenCalledTimes(2));
      await finishReply();
      await waitFor(() => expect(speech.inputStart).toHaveBeenCalledTimes(2));
      const oldPrompt = speech.engine.state.incidentConfirmation!.promptId;
      await act(async () => {
        await speech.engine!.converse('Tell me your findings.', {
          status: () => ({ configured: true }), prepare: async () => {},
          respond: async () => { throw new Error('This authoritative summary must not invoke a model.'); },
        });
        speech.events?.onmessage?.({ data: JSON.stringify(speech.engine!.snapshot()) });
      });
      expect(speech.engine.state.incidentConfirmation!.promptId).not.toBe(oldPrompt);
      await answer('Yes');
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not bound'));
      expect(store.list()).toEqual([]);
      expect(speech.engine.state.approval?.status).toBe('pending');
      expect(screen.getByRole('button', { name: 'Start hands-free conversation' })).toBeDefined();
    } finally { store.close(); }
  });
});
