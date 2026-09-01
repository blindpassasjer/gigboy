import { afterEach, describe, expect, it, vi } from 'vitest';
import { extensionForRecordingMime, pickRecordingMimeType } from './webAudio';

describe('extensionForRecordingMime', () => {
  it('maps mp4/aac recordings (Safari) to m4a', () => {
    expect(extensionForRecordingMime('audio/mp4')).toBe('m4a');
    expect(extensionForRecordingMime('audio/mp4;codecs="mp4a.40.2"')).toBe('m4a');
    expect(extensionForRecordingMime('audio/aac')).toBe('m4a');
  });

  it('maps webm/ogg recordings (Chrome/Firefox) correctly', () => {
    expect(extensionForRecordingMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionForRecordingMime('audio/ogg;codecs=opus')).toBe('ogg');
  });

  it('falls back to webm for an empty or unknown type', () => {
    expect(extensionForRecordingMime('')).toBe('webm');
    expect(extensionForRecordingMime('audio/flac')).toBe('webm');
  });
});

describe('pickRecordingMimeType', () => {
  const original = globalThis.MediaRecorder;
  afterEach(() => {
    globalThis.MediaRecorder = original;
    vi.restoreAllMocks();
  });

  it('prefers MP4 when the browser can record it (portable to Safari/iOS)', () => {
    globalThis.MediaRecorder = {
      isTypeSupported: (t: string) => t === 'audio/mp4' || t.startsWith('audio/webm'),
    } as unknown as typeof MediaRecorder;
    expect(pickRecordingMimeType()).toBe('audio/mp4');
  });

  it('falls back to WebM/Opus where MP4 recording is unavailable (Firefox)', () => {
    globalThis.MediaRecorder = {
      isTypeSupported: (t: string) => t === 'audio/webm;codecs=opus' || t === 'audio/webm',
    } as unknown as typeof MediaRecorder;
    expect(pickRecordingMimeType()).toBe('audio/webm;codecs=opus');
  });

  it('returns undefined when nothing matches, so the caller lets the browser choose', () => {
    globalThis.MediaRecorder = {
      isTypeSupported: () => false,
    } as unknown as typeof MediaRecorder;
    expect(pickRecordingMimeType()).toBeUndefined();
  });

  it('returns undefined when MediaRecorder is absent', () => {
    // @ts-expect-error - simulating an environment without MediaRecorder
    delete globalThis.MediaRecorder;
    expect(pickRecordingMimeType()).toBeUndefined();
  });
});
