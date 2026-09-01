/**
 * Safari starts every `AudioContext` in the `suspended` state unless it is constructed
 * *during* a user gesture, and it never resumes one on its own. Chrome is lenient and
 * auto-resumes on the first interaction, which is why code that skips `resume()` still
 * works there but produces silence on Safari/iOS (no metronome click, dead tuner,
 * silent recording).
 *
 * Construct contexts through this helper and `await` it from the click/tap handler that
 * starts audio — not after an `await` (which ends the gesture) or inside a timer.
 */
export async function createResumedAudioContext(options?: AudioContextOptions): Promise<AudioContext> {
  const ctx = new AudioContext(options);
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Left suspended — the caller's audio will be silent, but that is better than throwing.
    }
  }
  return ctx;
}

/** Best-effort resume of an existing context, e.g. after returning from the background. */
export function resumeAudioContext(ctx: AudioContext | null | undefined): void {
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
}

/**
 * `MediaRecorder` output formats in preference order. MP4/AAC comes first so recordings
 * play back on Safari and iOS, which cannot decode Opus-in-WebM (the format Chrome and
 * Firefox default to). WebM/Opus is the fallback for Firefox and older Chrome, where it
 * is the only option — those recordings still won't play on Safari before 17.4, which is
 * unavoidable on the recording side.
 */
const RECORDING_MIME_CANDIDATES = [
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/aac',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

/**
 * Picks a `MediaRecorder` mime type this browser can actually produce, or `undefined`
 * to let the browser choose its own default (read it back from `recorder.mimeType`
 * after construction). Never returns a type that would make the constructor throw.
 */
export function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  for (const type of RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/** Filename extension for a recording blob, derived from its (possibly parameterised) mime type. */
export function extensionForRecordingMime(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  switch (base) {
    case 'audio/mp4':
    case 'audio/aac':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/webm':
    default:
      return 'webm';
  }
}
