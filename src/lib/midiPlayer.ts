/**
 * MIDI playback service for guitar tab sections.
 * Uses Tone.js for in-browser audio synthesis — no soundfont files required.
 */
import { parseTabLines } from '../utils/tabParser';

type ToneModule = typeof import('tone');

let toneModulePromise: Promise<ToneModule> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let synthPool: any[] | null = null;
let synthPoolIndex = 0;

// PluckSynth doesn't extend Monophonic so it can't be used with PolySynth.
// Use a round-robin pool of PluckSynth instances (one per guitar string).
const POOL_SIZE = 6;

function getTone(): Promise<ToneModule> {
  if (!toneModulePromise) {
    toneModulePromise = import('tone');
  }
  return toneModulePromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSynthPool(Tone: ToneModule): any[] {
  if (!synthPool) {
    synthPool = Array.from({ length: POOL_SIZE }, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = new (Tone.PluckSynth as any)({ attackNoise: 1, dampening: 3800, resonance: 0.97 }).toDestination();
      s.volume.value = -6;
      return s;
    });
  }
  return synthPool;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNextSynth(Tone: ToneModule): any {
  const pool = getSynthPool(Tone);
  const synth = pool[synthPoolIndex % POOL_SIZE];
  synthPoolIndex++;
  return synth;
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

  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  transport.bpm.value = bpm;

  synthPoolIndex = 0;
  const events = parseTabLines(tabLines);
  if (events.length === 0) return 0;

  // Pre-assign a synth from the pool to each note so we avoid closure issues
  // with the round-robin index inside the scheduled callback.
  const stepSeconds = (60 / bpm) / 4;

  events.forEach(({ columnIndex, notes }) => {
    const timeOffset = columnIndex * stepSeconds;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignedSynths: { synth: any; freq: number }[] = notes.map((midi) => ({
      synth: getNextSynth(Tone),
      freq: Tone.Frequency(midi + transposeSemitones, 'midi').toFrequency(),
    }));
    transport.schedule((t) => {
      assignedSynths.forEach(({ synth, freq }) => {
        synth.triggerAttackRelease(freq, '16n', t);
      });
    }, timeOffset);
  });

  transport.start();

  const lastColumn = events[events.length - 1].columnIndex;
  // Add extra time for note release tail
  return (lastColumn + 2) * stepSeconds * 1000 + 600;
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
