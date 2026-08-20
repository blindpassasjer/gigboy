import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { songs } from '../db/schema.js';

/**
 * Shared "resolve the song + its band scope" helper for song-nested resources mounted under
 * `/api/bands/:bandId/songs/:songId/...` — hand notes and recordings. Mirrors
 * bandAttachments.ts's loadBandSong, but also returns canManageOthers those routers don't need.
 */
export interface ResolvedSongScope {
  song: { id: string };
  bandId: string;
  /** Whether the caller may manage (e.g. delete) other users' entries within this scope. */
  canManageOthers: boolean;
}

/** Resolves :songId, 404ing unless it belongs to the route's :bandId. Requires requireBandMember to have run. */
export async function loadBandSongScope(req: Request, res: Response): Promise<ResolvedSongScope | null> {
  const rows = await db
    .select()
    .from(songs)
    .where(and(eq(songs.id, req.params.songId), eq(songs.bandId, req.params.bandId)))
    .limit(1);
  const song = rows[0];
  if (!song) {
    res.status(404).json({ error: 'Song not found.' });
    return null;
  }
  return {
    song: { id: song.id },
    bandId: req.params.bandId,
    canManageOthers: req.bandRole === 'editor',
  };
}
