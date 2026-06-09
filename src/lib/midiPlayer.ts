/**
 * Tab playback using real acoustic guitar samples via Tone.Sampler.
 * Samples: https://github.com/nbrosowsky/tonejs-instruments (MIT), self-hosted in /guitar-acoustic/
 */
import { parseTabLines } from '../utils/tabParser';

type ToneModule = typeof import('tone');

let toneModulePromise: Promise<ToneModule> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let samplerPromise: Promise<any> | null = null;

const BASE_URL = '/guitar-acoustic/';

// Spread of samples covering the full guitar range (E2–D5)
// Keys use Tone.js note format (# for sharps); filenames use "s" suffix (e.g. As2.mp3)
const SAMPLE_URLS: Record<string, string> = {
  D2: 'D2.mp3', 'D#2': 'Ds2.mp3', E2: 'E2.mp3', F2: 'F2.mp3',
  'F#2': 'Fs2.mp3', G2: 'G2.mp3', 'G#2': 'Gs2.mp3',
  A2: 'A2.mp3', 'A#2': 'As2.mp3', B2: 'B2.mp3',
  C3: 'C3.mp3', 'C#3': 'Cs3.mp3', D3: 'D3.mp3', 'D#3': 'Ds3.mp3',
  E3: 'E3.mp3', F3: 'F3.mp3', 'F#3': 'Fs3.mp3', G3: 'G3.mp3', 'G#3': 'Gs3.mp3',
  A3: 'A3.mp3', 'A#3': 'As3.mp3', B3: 'B3.mp3',
  C4: 'C4.mp3', 'C#4': 'Cs4.mp3', D4: 'D4.mp3', 'D#4': 'Ds4.mp3',
  E4: 'E4.mp3', F4: 'F4.mp3', 'F#4': 'Fs4.mp3', G4: 'G4.mp3', 'G#4': 'Gs4.mp3',
  A4: 'A4.mp3', 'A#4': 'As4.mp3', B4: 'B4.mp3',
  C5: 'C5.mp3', 'C#5': 'Cs5.mp3', D5: 'D5.mp3',
};

function getTone(): Promise<ToneModule> {
  if (!toneModulePromise) {
    toneModulePromise = import('tone');
  }
  return toneModulePromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSampler(Tone: ToneModule): Promise<any> {
  if (!samplerPromise) {
    samplerPromise = new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = new (Tone.Sampler as any)({
        urls: SAMPLE_URLS,
        baseUrl: BASE_URL,
        release: 1.2,
        onload: () => resolve(s),
      }).toDestination();
      s.volume.value = -6;
    });
  }
  return samplerPromise;
}

/** Kick off sampler loading in the background without playing anything. */
export async function preloadSampler(): Promise<void> {
  const Tone = await getTone();
  await getSampler(Tone);
}

/**
 * Play a tab block represented as an array of raw tab lines.
 * Must be called from a user gesture (Web Audio requirement).
 *
 * @param tabLines  Lines from inside {start_of_tab}...{end_of_tab}
 * @param bpm       Playback tempo (default 120)
 * @param transposeSemitones  Semitone shift applied to playback (default 0)
 * @returns         Expected total duration in milliseconds, or 0 if nothing to play.
 */
export async function playTab(
  tabLines: string[],
  bpm = 120,
  transposeSemitones = 0,
): Promise<number> {
  const Tone = await getTone();
  await Tone.start();

  const sampler = await getSampler(Tone);

  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  transport.bpm.value = bpm;

  const events = parseTabLines(tabLines);
  if (events.length === 0) return 0;

  const stepSeconds = (60 / bpm) / 4;

  events.forEach(({ columnIndex, notes }) => {
    const timeOffset = columnIndex * stepSeconds;
    const freqs = notes.map((midi) =>
      Tone.Frequency(midi + transposeSemitones, 'midi').toFrequency(),
    );
    transport.schedule((t) => {
      freqs.forEach((freq) => {
        sampler.triggerAttackRelease(freq, '2n', t);
      });
    }, timeOffset);
  });

  transport.start();

  const lastColumn = events[events.length - 1].columnIndex;
  // Extra time for note release tail (samples decay ~1.2 s after release)
  return (lastColumn + 2) * stepSeconds * 1000 + 2000;
}

/** Stop any currently playing tab and cancel scheduled events. */
export function stopPlayback(): void {
  if (!toneModulePromise) {
    return;
  }

  void toneModulePromise.then((Tone) => {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
  });
}
