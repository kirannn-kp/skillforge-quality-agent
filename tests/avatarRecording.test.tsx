// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordingConsentKey, recordingDurationMs, useAvatarRecording } from '../src/useAvatarRecording';
import type { AvatarStatus } from '../src/azureSpeech';

describe('explicit, bounded avatar recording consent', () => {
  const activate = vi.fn(), connect = vi.fn(async () => {}), disconnect = vi.fn(), reportError = vi.fn();
  function setup(status: AvatarStatus = 'Disconnected', ready = true) {
    return renderHook((props: { status: AvatarStatus; ready: boolean }) => useAvatarRecording({
      ...props, activate, connect, disconnect, reportError,
    }), { initialProps: { status, ready } });
  }
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); sessionStorage.clear(); });
  afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); });

  it('never activates or connects without explicit consent', async () => {
    const hook = setup();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(hook.result.current.active).toBe(false);
    expect(activate).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
  it('waits for ready controls, reconnects a lost stream and stops explicitly', async () => {
    const hook = setup('Disconnected', false);
    act(() => hook.result.current.start());
    expect(activate).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(connect).not.toHaveBeenCalled();
    hook.rerender({ status: 'Disconnected', ready: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(connect).toHaveBeenCalledOnce();
    hook.rerender({ status: 'Live', ready: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(connect).toHaveBeenCalledOnce();
    hook.rerender({ status: 'Failed', ready: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(connect).toHaveBeenCalledTimes(2);
    act(() => hook.result.current.stop());
    expect(sessionStorage.getItem(recordingConsentKey)).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it('ends at the original 45-minute deadline, including while live', async () => {
    const hook = setup('Live');
    act(() => hook.result.current.start());
    await act(async () => { await vi.advanceTimersByTimeAsync(recordingDurationMs); });
    expect(hook.result.current.active).toBe(false);
    expect(hook.result.current.notice).toContain('45-minute');
    expect(disconnect).toHaveBeenCalledOnce();
    expect(connect).not.toHaveBeenCalled();
  });
  it('stops after three failed attempts without a retry loop', async () => {
    const hook = setup();
    act(() => hook.result.current.start());
    for (let i = 0; i < 6; i++) await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(connect).toHaveBeenCalledTimes(3);
    expect(hook.result.current.active).toBe(false);
    expect(reportError).toHaveBeenCalledWith(expect.stringContaining('retry limit'));
  });
  it('resumes tab-scoped consent after reload without extending its deadline or connection budget', async () => {
    const expiresAt = Date.now() + 10000;
    sessionStorage.setItem(recordingConsentKey, JSON.stringify({ expiresAt, connections: 11 }));
    const hook = setup();
    expect(hook.result.current.until).toBe(expiresAt);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(connect).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(hook.result.current.active).toBe(false);
    expect(connect).toHaveBeenCalledOnce();
  });
  it('rejects invalid or expired consent and never resumes it', async () => {
    sessionStorage.setItem(recordingConsentKey, JSON.stringify({ expiresAt: Date.now() + recordingDurationMs * 10, connections: 0 }));
    const invalid = setup();
    expect(invalid.result.current.active).toBe(false);
    expect(reportError).toHaveBeenCalledWith(expect.stringContaining('invalid or unavailable'));
    invalid.unmount();
    sessionStorage.setItem(recordingConsentKey, JSON.stringify({ expiresAt: Date.now() - 1, connections: 0 }));
    const expired = setup();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(expired.result.current.active).toBe(false);
    expect(sessionStorage.getItem(recordingConsentKey)).toBeNull();
    expect(connect).not.toHaveBeenCalled();
  });
});
