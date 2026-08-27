import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteBandChordVoicing,
  loadBandChordVoicings,
  saveBandChordVoicing,
  type ChordVoicing,
  type VoicingInstrument,
} from '../lib/bandChordVoicings';
import { normalizeChordForLookup } from '../utils/chordLookup';

function key(instrument: VoicingInstrument, chordName: string): string {
  return `${instrument}:${chordName}`;
}

/**
 * The band's chord voicing overrides, plus mutators. `overrideFor` takes a raw chord
 * (e.g. "C#m7/G") and returns the band's custom fingering for its normalized name, or
 * undefined to fall back to the built-in diagram.
 */
export function useBandChordVoicings(bandId: string | null | undefined, canEdit: boolean) {
  const [byKey, setByKey] = useState<Map<string, number[]>>(new Map());

  useEffect(() => {
    if (!bandId) {
      setByKey(new Map());
      return;
    }
    let cancelled = false;
    loadBandChordVoicings(bandId)
      .then((voicings) => {
        if (cancelled) return;
        setByKey(new Map(voicings.map((v) => [key(v.instrument, v.chordName), v.frets])));
      })
      .catch(() => {
        if (!cancelled) setByKey(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [bandId]);

  const overrideFor = useCallback(
    (instrument: VoicingInstrument, rawChord: string): number[] | undefined => {
      return byKey.get(key(instrument, normalizeChordForLookup(rawChord)));
    },
    [byKey],
  );

  const save = useCallback(
    async (instrument: VoicingInstrument, rawChord: string, frets: number[]): Promise<void> => {
      if (!bandId) return;
      const chordName = normalizeChordForLookup(rawChord);
      const saved: ChordVoicing = await saveBandChordVoicing(bandId, instrument, chordName, frets);
      setByKey((prev) => new Map(prev).set(key(instrument, saved.chordName), saved.frets));
    },
    [bandId],
  );

  const remove = useCallback(
    async (instrument: VoicingInstrument, rawChord: string): Promise<void> => {
      if (!bandId) return;
      const chordName = normalizeChordForLookup(rawChord);
      await deleteBandChordVoicing(bandId, instrument, chordName);
      setByKey((prev) => {
        const next = new Map(prev);
        next.delete(key(instrument, chordName));
        return next;
      });
    },
    [bandId],
  );

  return useMemo(
    () => ({ overrideFor, save, remove, canEdit: canEdit && Boolean(bandId) }),
    [overrideFor, save, remove, canEdit, bandId],
  );
}

export type BandChordVoicings = ReturnType<typeof useBandChordVoicings>;
