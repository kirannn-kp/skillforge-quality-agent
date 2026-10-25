import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvatarStatus } from './azureSpeech';

export const recordingConsentKey = 'quality-avatar-recording';
export const recordingDurationMs = 45 * 60 * 1000;
const maxConnections = 12;

interface Options {
  ready: boolean;
  status: AvatarStatus;
  activate: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  reportError: (message: string) => void;
}

export function useAvatarRecording({ ready, status, activate, connect, disconnect, reportError }: Options) {
  const [until, setUntil] = useState(0);
  const [connections, setConnections] = useState(0);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const deadline = useRef(0);
  const attempts = useRef(0);
  const failures = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const stop = useCallback((message = 'Recording mode stopped.') => {
    deadline.current = 0;
    setUntil(0);
    setNotice(message);
    disconnect();
    try { sessionStorage.removeItem(recordingConsentKey); }
    catch { reportError('Recording stopped, but saved consent could not be cleared. Close this tab before opening it again.'); }
  }, [disconnect, reportError]);

  const start = useCallback(() => {
    const expiresAt = Date.now() + recordingDurationMs;
    try { sessionStorage.setItem(recordingConsentKey, JSON.stringify({ expiresAt, connections: 0 })); }
    catch { reportError('Recording consent could not be saved. Recording mode was not enabled.'); return; }
    deadline.current = expiresAt;
    attempts.current = 0;
    failures.current = 0;
    setConnections(0);
    setUntil(expiresAt);
    setNotice('');
    activate();
  }, [activate, reportError]);

  useEffect(() => {
    mounted.current = true;
    try {
      const saved = sessionStorage.getItem(recordingConsentKey);
      if (saved) {
        const value: unknown = JSON.parse(saved);
        if (!value || typeof value !== 'object' || !('expiresAt' in value) || !('connections' in value) ||
          typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt) ||
          typeof value.connections !== 'number' || !Number.isInteger(value.connections) ||
          value.connections < 0 || value.connections > maxConnections || value.expiresAt > Date.now() + recordingDurationMs) {
          throw new Error('Invalid recording consent.');
        }
        if (value.expiresAt > Date.now() && value.connections < maxConnections) {
          deadline.current = value.expiresAt;
          attempts.current = value.connections;
          setUntil(value.expiresAt);
          setConnections(value.connections);
          activate();
        } else sessionStorage.removeItem(recordingConsentKey);
      }
    } catch {
      reportError('Saved recording consent is invalid or unavailable. Recording mode was not resumed; start it explicitly.');
    }
    return () => { mounted.current = false; };
  }, [activate, reportError]);

  useEffect(() => {
    if (!until) return;
    const timer = setTimeout(() => stop('The 45-minute recording window ended. Start a new window explicitly.'), Math.max(0, until - Date.now()));
    return () => clearTimeout(timer);
  }, [until, stop]);

  useEffect(() => {
    if (!until || !ready || inFlight.current) return;
    if (status === 'Live') { failures.current = 0; return; }
    if (status === 'Connecting') return;
    if (Date.now() >= until) { stop('The recording window ended.'); return; }
    if (failures.current >= 3 || attempts.current >= maxConnections) {
      stop('Recording mode stopped after its connection retry limit. Check Azure access and network connectivity.');
      reportError('Avatar recording retry limit reached. No fallback was used; restart recording mode explicitly after resolving the error.');
      return;
    }
    const timer = setTimeout(() => {
      if (!deadline.current || Date.now() >= deadline.current || inFlight.current) return;
      attempts.current++;
      failures.current++;
      try {
        sessionStorage.setItem(recordingConsentKey, JSON.stringify({ expiresAt: deadline.current, connections: attempts.current }));
      } catch {
        stop('Recording mode stopped because connection consent could not be saved.');
        reportError('Could not save the recording connection budget. No further automatic connection was started.');
        return;
      }
      setConnections(attempts.current);
      inFlight.current = true;
      void connect().catch(error => {
        if (mounted.current && deadline.current) reportError(error instanceof Error ? error.message : 'Avatar recording connection failed.');
      }).finally(() => {
        inFlight.current = false;
        if (mounted.current) setRevision(value => value + 1);
      });
    }, failures.current ? Math.min(2000 * 2 ** (failures.current - 1), 8000) : 0);
    return () => clearTimeout(timer);
  }, [until, ready, status, connections, revision, connect, stop, reportError]);

  return { active: until > 0, until, connections, notice, start, stop };
}
