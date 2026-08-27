import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandChordVoicings } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandMember, requireBandEditor } from '../middleware/bandAccess.js';

const INSTRUMENTS = ['guitar', 'ukulele'] as const;
type Instrument = (typeof INSTRUMENTS)[number];
const STRING_COUNT: Record<Instrument, number> = { guitar: 6, ukulele: 4 };

function isInstrument(value: string): value is Instrument {
  return (INSTRUMENTS as readonly string[]).includes(value);
}

function validateFrets(frets: unknown, instrument: Instrument): number[] | null {
  if (!Array.isArray(frets) || frets.length !== STRING_COUNT[instrument]) return null;
  const out: number[] = [];
  for (const value of frets) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(n) || n < -1 || n > 24) return null;
    out.push(n);
  }
  return out;
}

export const bandChordVoicingsRouter = Router({ mergeParams: true });
bandChordVoicingsRouter.use(requireAuth);

bandChordVoicingsRouter.get('/', requireBandMember, async (req, res) => {
  try {
    const rows = await db
      .select({
        instrument: bandChordVoicings.instrument,
        chordName: bandChordVoicings.chordName,
        frets: bandChordVoicings.frets,
      })
      .from(bandChordVoicings)
      .where(eq(bandChordVoicings.bandId, (req.params as { bandId: string }).bandId));
    res.json({ voicings: rows });
  } catch (err) {
    console.error('Failed to list band chord voicings:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandChordVoicingsRouter.put('/:instrument/:chordName', requireBandEditor, async (req, res) => {
  try {
    const bandId = (req.params as { bandId: string }).bandId;
    const instrument = req.params.instrument;
    const chordName = req.params.chordName.trim();
    if (!isInstrument(instrument)) {
      res.status(400).json({ error: 'Unsupported instrument.' });
      return;
    }
    if (!chordName || chordName.length > 20) {
      res.status(400).json({ error: 'Invalid chord name.' });
      return;
    }
    const frets = validateFrets((req.body ?? {}).frets, instrument);
    if (!frets) {
      res.status(400).json({ error: `frets must be an array of ${STRING_COUNT[instrument]} integers (-1 to 24).` });
      return;
    }

    await db
      .insert(bandChordVoicings)
      .values({
        id: crypto.randomUUID(),
        bandId,
        instrument,
        chordName,
        frets,
        createdBy: req.userId!,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [bandChordVoicings.bandId, bandChordVoicings.instrument, bandChordVoicings.chordName],
        set: { frets, createdBy: req.userId!, updatedAt: new Date() },
      });

    res.json({ voicing: { instrument, chordName, frets } });
  } catch (err) {
    console.error('Failed to save band chord voicing:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

bandChordVoicingsRouter.delete('/:instrument/:chordName', requireBandEditor, async (req, res) => {
  try {
    const bandId = (req.params as { bandId: string }).bandId;
    await db
      .delete(bandChordVoicings)
      .where(and(
        eq(bandChordVoicings.bandId, bandId),
        eq(bandChordVoicings.instrument, req.params.instrument),
        eq(bandChordVoicings.chordName, req.params.chordName.trim()),
      ));
    res.json({});
  } catch (err) {
    console.error('Failed to delete band chord voicing:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
