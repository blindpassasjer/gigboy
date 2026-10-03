import { Router } from 'express';
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { setlistSessions, setlists, users } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { requireBandMember } from '../middleware/bandAccess.js';

interface Subscriber {
  res: Response;
  userId: string;
}

interface Room {
  subs: Set<Subscriber>;
  hostUserId: string | null;
  host: SessionHost | null;
}

/** In-process per-setlist rooms. Fine for a single self-host container; not shared across replicas. */
const rooms = new Map<string, Room>();

function getRoom(setlistId: string): Room {
  let room = rooms.get(setlistId);
  if (!room) {
    room = { subs: new Set(), hostUserId: null, host: null };
    rooms.set(setlistId, room);
  }
  return room;
}

interface SessionState {
  songIndex: number;
  pageIndex: number;
  transpose: number;
  hostUserId: string | null;
  host: SessionHost | null;
}

interface SessionHost {
  id: string;
  name: string;
  avatar: string | null;
}

async function loadHost(userId: string | null): Promise<SessionHost | null> {
  if (!userId) return null;
  const [row] = await db
    .select({ username: users.username, fullName: users.fullName, avatar: users.avatar })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return { id: userId, name: row.fullName?.trim() || row.username, avatar: row.avatar ?? null };
}

function routeParams(req: Request): { bandId: string; setlistId: string } {
  return req.params as unknown as { bandId: string; setlistId: string };
}

async function loadState(setlistId: string, hostUserId: string | null): Promise<SessionState> {
  const [row] = await db.select().from(setlistSessions).where(eq(setlistSessions.setlistId, setlistId)).limit(1);
  return {
    songIndex: row?.songIndex ?? 0,
    pageIndex: row?.pageIndex ?? 0,
    transpose: row?.transpose ?? 0,
    hostUserId,
    host: await loadHost(hostUserId),
  };
}

function send(sub: Subscriber, state: SessionState): void {
  sub.res.write(`data: ${JSON.stringify(state)}\n\n`);
}

function broadcast(setlistId: string, state: SessionState): void {
  const room = rooms.get(setlistId);
  if (!room) return;
  for (const sub of room.subs) send(sub, state);
}

async function verifySetlist(req: Request, res: Response): Promise<boolean> {
  const { bandId, setlistId } = routeParams(req);
  const [scoped] = await db
    .select({ bandId: setlists.bandId })
    .from(setlists)
    .where(eq(setlists.id, setlistId))
    .limit(1);
  if (!scoped || scoped.bandId !== bandId) {
    res.status(404).json({ error: 'Setlist not found.' });
    return false;
  }
  return true;
}

export const bandSetlistSessionRouter = Router({ mergeParams: true });
bandSetlistSessionRouter.use(requireAuth, requireBandMember);

bandSetlistSessionRouter.get('/', async (req, res) => {
  if (!(await verifySetlist(req, res))) return;
  const { setlistId } = routeParams(req);
  const room = getRoom(setlistId);
  res.json(await loadState(setlistId, room.hostUserId));
});

bandSetlistSessionRouter.get('/stream', async (req, res) => {
  if (!(await verifySetlist(req, res))) return;
  const { setlistId } = routeParams(req);

  const room = getRoom(setlistId);

  // Cap concurrent streams per user per room so a single account can't exhaust memory/sockets.
  const MAX_STREAMS_PER_USER = 5;
  const existingForUser = [...room.subs].filter((s) => s.userId === req.userId).length;
  if (existingForUser >= MAX_STREAMS_PER_USER) {
    res.status(429).json({ error: 'Too many open sessions for this setlist.' });
    return;
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const sub: Subscriber = { res, userId: req.userId! };
  room.subs.add(sub);

  send(sub, await loadState(setlistId, room.hostUserId));

  const keepAlive = setInterval(() => res.write(': keepalive\n\n'), 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    room.subs.delete(sub);
    if (room.hostUserId === sub.userId && ![...room.subs].some((s) => s.userId === sub.userId)) {
      room.hostUserId = null;
      room.host = null;
      void loadState(setlistId, null).then((state) => broadcast(setlistId, state));
    }
    if (room.subs.size === 0) rooms.delete(setlistId);
  });
});

bandSetlistSessionRouter.post('/claim', async (req, res) => {
  if (!(await verifySetlist(req, res))) return;
  const { setlistId } = routeParams(req);
  const room = getRoom(setlistId);
  if (room.hostUserId && room.hostUserId !== req.userId) {
    const host = await loadHost(room.hostUserId);
    res.status(409).json({
      error: host ? `${host.name} is already leading this setlist.` : 'Someone else is already leading this setlist.',
    });
    return;
  }
  room.hostUserId = req.userId!;
  room.host = await loadHost(room.hostUserId);
  const state = await loadState(setlistId, room.hostUserId);
  broadcast(setlistId, state);
  res.json(state);
});

bandSetlistSessionRouter.post('/release', async (req, res) => {
  if (!(await verifySetlist(req, res))) return;
  const { setlistId } = routeParams(req);
  const room = getRoom(setlistId);
  if (room.hostUserId === req.userId) {
    room.hostUserId = null;
    room.host = null;
    broadcast(setlistId, await loadState(setlistId, null));
  }
  res.json({});
});

bandSetlistSessionRouter.post('/', async (req, res) => {
  if (!(await verifySetlist(req, res))) return;
  const { bandId, setlistId } = routeParams(req);
  const room = getRoom(setlistId);
  if (room.hostUserId !== req.userId) {
    res.status(403).json({ error: 'Only the setlist leader can update the position.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  };

  const current = await loadState(setlistId, room.hostUserId);
  const next = {
    songIndex: 'songIndex' in body ? clampInt(body.songIndex, 0, 9999, current.songIndex) : current.songIndex,
    pageIndex: 'pageIndex' in body ? clampInt(body.pageIndex, 0, 9999, current.pageIndex) : current.pageIndex,
    transpose: 'transpose' in body ? clampInt(body.transpose, -11, 11, current.transpose) : current.transpose,
  };

  await db
    .insert(setlistSessions)
    .values({ setlistId, bandId, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: setlistSessions.setlistId, set: { ...next, updatedAt: new Date() } });

  const state: SessionState = { ...next, hostUserId: room.hostUserId, host: room.host };
  broadcast(setlistId, state);
  res.json(state);
});
