/**
 * MIDI playback service for guitar tab sections.
 * Uses Tone.js for in-browser audio synthesis — no soundfont files required.
 */
import { parseTabLines } from '../utils/tabParser';

type ToneModule = typeof import('tone');

let toneModulePromise: Promise<ToneModule> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let synthInstance: any | null = null;

function getTone(): Promise<ToneModule> {
  if (!toneModulePromise) {
    toneModulePromise = import('tone');
  }
  return toneModulePromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSynth(Tone: ToneModule): any {
  if (!synthInstance) {
    // PluckSynth uses Karplus-Strong algorithm — close to a plucked guitar string.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PluckSynthCtor = Tone.PluckSynth as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pluckOptions: any = { attackNoise: 1, dampening: 3800, resonance: 0.97 };
    synthInstance = new Tone.PolySynth(PluckSynthCtor, pluckOptions).toDestination();
    synthInstance.volume.value = -6;
  }
  return synthInstance;
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

  const events = parseTabLines(tabLines);
  if (events.length === 0) return 0;

  const synth = getSynth(Tone);
  // 16th-note step size in seconds (avoids relying on Tone.Time evaluation order)
  const stepSeconds = (60 / bpm) / 4;

  events.forEach(({ columnIndex, notes }) => {
    const timeOffset = columnIndex * stepSeconds;
    transport.schedule((t) => {
      notes.forEach((midi) => {
        const shiftedMidi = midi + transposeSemitones;
        const freq = Tone.Frequency(shiftedMidi, 'midi').toFrequency();
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
