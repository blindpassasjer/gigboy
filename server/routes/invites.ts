import { Router } from 'express';
import bcrypt from 'bcrypt';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, sessions, userInvites } from '../db/schema.js';
import {
  generateSessionToken,
  sessionExpiry,
  setSessionCookie,
  requireAuth,
} from '../middleware/session.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { toPublicUser } from '../lib/user.js';
import { resolveOrigin } from '../lib/http.js';

const BCRYPT_ROUNDS = 12;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches band invites

const UNIQUE_VIOLATION = '23505';
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

/** Admin-only invite management, mounted at /api/admin/invites. */
export const adminInvitesRouter = Router();
adminInvitesRouter.use(requireAuth, requireAdmin);

adminInvitesRouter.post('/', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;
    const role = body.role === 'admin' ? 'admin' : 'member';

    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await db.insert(userInvites).values({
      id,
      inviterId: req.userId!,
      email,
      role,
      status: 'pending',
      expiresAt,
    });

    const origin = resolveOrigin(req);
    res.json({
      inviteId: id,
      inviteUrl: `${origin}/invite/${id}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('Failed to create invite:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

adminInvitesRouter.get('/', async (_req, res) => {
  try {
    const rows = await db.select().from(userInvites).where(eq(userInvites.status, 'pending'));
    res.json({
      invites: rows.map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('Failed to list invites:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

adminInvitesRouter.delete('/:id', async (req, res) => {
  try {
    const [row] = await db
      .update(userInvites)
      .set({ status: 'revoked' })
      .where(eq(userInvites.id, req.params.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: 'Invite not found.' });
      return;
    }
    res.json({});
  } catch (err) {
    console.error('Failed to revoke invite:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/** Public invite lookup + acceptance, mounted at /api/invites. */
export const publicInvitesRouter = Router();

publicInvitesRouter.get('/:token', async (req, res) => {
  try {
    const rows = await db.select().from(userInvites).where(eq(userInvites.id, req.params.token)).limit(1);
    const invite = rows[0];
    if (!invite) {
      res.status(404).json({ error: 'Invite not found.' });
      return;
    }
    if (invite.status === 'accepted') {
      res.status(410).json({ error: 'This invite has already been used.' });
      return;
    }
    if (invite.status === 'revoked') {
      res.status(410).json({ error: 'This invite has been revoked.' });
      return;
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ error: 'This invite has expired.' });
      return;
    }
    res.json({
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
      valid: true,
    });
  } catch (err) {
    console.error('Failed to look up invite:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

publicInvitesRouter.post('/:token/accept', async (req, res) => {
  try {
    const rows = await db.select().from(userInvites).where(eq(userInvites.id, req.params.token)).limit(1);
    const invite = rows[0];
    if (!invite) {
      res.status(404).json({ error: 'Invite not found.' });
      return;
    }
    if (invite.status !== 'pending') {
      res.status(410).json({ error: 'This invite is no longer valid.' });
      return;
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ error: 'This invite has expired.' });
      return;
    }

    const { username, password, fullName, email: bodyEmail } = (req.body ?? {}) as Record<string, unknown>;

    if (typeof password !== 'string' || password.length < 8) {
      res.json({ user: null, error: 'Password must be at least 8 characters.' });
      return;
    }
    if (typeof username !== 'string' || username.trim().length < 2) {
      res.json({ user: null, error: 'Username must be at least 2 characters.' });
      return;
    }

    // The invite may or may not have an email pinned to it. When it does, that value wins and
    // any email in the request body is ignored. When it doesn't, the caller must supply one,
    // validated the same way the old public /register route validated it.
    let email: string;
    if (invite.email) {
      email = invite.email;
    } else {
      if (typeof bodyEmail !== 'string' || !bodyEmail.includes('@')) {
        res.json({ user: null, error: 'A valid email is required.' });
        return;
      }
      email = bodyEmail;
    }

    const emailLower = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const id = crypto.randomUUID();

    // Atomically claim the invite: only one concurrent request can flip it from pending.
    const [claimed] = await db
      .update(userInvites)
      .set({ status: 'accepted', acceptedUserId: id })
      .where(and(eq(userInvites.id, invite.id), eq(userInvites.status, 'pending')))
      .returning();
    if (!claimed) {
      res.status(410).json({ error: 'This invite is no longer valid.' });
      return;
    }

    let row;
    try {
      [row] = await db
        .insert(users)
        .values({
          id,
          email: email.trim(),
          emailLower,
          username: username.trim(),
          passwordHash,
          fullName: typeof fullName === 'string' && fullName.trim() ? fullName.trim() : null,
          role: invite.role === 'admin' ? 'admin' : 'member',
        })
        .returning();
    } catch (insertErr) {
      // Release the invite so the user can retry with a different email/username.
      await db
        .update(userInvites)
        .set({ status: 'pending', acceptedUserId: null })
        .where(eq(userInvites.id, invite.id));
      if (isUniqueViolation(insertErr)) {
        res.json({ user: null, error: 'An account with this email or username already exists.' });
        return;
      }
      throw insertErr;
    }

    const token = generateSessionToken();
    const expiresAt = sessionExpiry();
    await db.insert(sessions).values({ token, userId: id, expiresAt });
    setSessionCookie(res, token, expiresAt);

    res.json({ user: toPublicUser(row), error: null });
  } catch (err) {
    console.error('Failed to accept invite:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
