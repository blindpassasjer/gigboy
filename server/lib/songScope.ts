import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { songs } from '../db/schema.js';

/**
 * Shared "resolve the song + its personal/band scope" helper for song-nested resources that are
 * mounted both under `/api/songs/:songId/...` (personal) and `/api/bands/:bandId/songs/:songId/...`
 * (band) — hand notes and recordings. Mirrors attachments.ts/bandAttachments.ts's loadOwnedSong /
 * loadBandSong, but also returns the scopeType/scopeOwnerId pair those routers don't need.
 */
export interface ResolvedSongScope {
  song: { id: string };
  scopeType: 'user' | 'band';
  scopeOwnerId: string;
  /** Whether the caller may manage (e.g. delete) other users' entries within this scope. */
  canManageOthers: boolean;
}

/** Resolves the personal (owner-only) song for :songId, 404ing if missing or not owned by req.userId. */
export async function loadPersonalSongScope(req: Request, res: Response): Promise<ResolvedSongScope | null> {
  const rows = await db.select().from(songs).where(eq(songs.id, req.params.songId)).limit(1);
  const song = rows[0];
  if (!song || song.userId !== req.userId) {
    res.status(404).json({ error: 'Song not found.' });
    return null;
  }
  return { song: { id: song.id }, scopeType: 'user', scopeOwnerId: req.userId!, canManageOthers: true };
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
    scopeType: 'band',
    scopeOwnerId: req.params.bandId,
    canManageOthers: req.bandRole === 'editor',
  };
}
