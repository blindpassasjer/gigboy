import { Router } from 'express';
import { and, desc, eq, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { collaborationInvites, setlists, songLists, songs, users } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { removeNullish } from '../lib/serialize.js';

type CollaborationInviteRow = typeof collaborationInvites.$inferSelect;
type ResourceType = 'song' | 'songlist' | 'setlist';

const RESOURCE_TABLES = {
  song: songs,
  songlist: songLists,
  setlist: setlists,
} as const;

function isResourceType(value: unknown): value is ResourceType {
  return value === 'song' || value === 'songlist' || value === 'setlist';
}

function isPermission(value: unknown): value is 'viewer' | 'editor' {
  return value === 'viewer' || value === 'editor';
}

function inviteToApi(row: CollaborationInviteRow, ownerEmail?: string) {
  return removeNullish({
    id: row.id,
    ownerId: row.ownerId,
    ownerEmail: ownerEmail ?? undefined,
    recipientEmail: row.recipientEmail,
    recipientEmailLower: row.recipientEmailLower,
    recipientUid: row.recipientUserId ?? undefined,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    resourceName: row.resourceName,
    permission: row.permission,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString(),
  });
}

export const collaborationInvitesRouter = Router();
collaborationInvitesRouter.use(requireAuth);

/** Creates an invite: the owner picks one of their own resources, a recipient email, and a permission. */
collaborationInvitesRouter.post('/', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const resourceType = body.resourceType;
    const resourceId = typeof body.resourceId === 'string' ? body.resourceId : '';
    const resourceName = typeof body.resourceName === 'string' ? body.resourceName : '';
    const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : '';
    const permission = body.permission;

    if (!isResourceType(resourceType)) {
      res.status(400).json({ error: 'resourceType must be song, songlist, or setlist.' });
      return;
    }
    if (!resourceId) {
      res.status(400).json({ error: 'resourceId is required.' });
      return;
    }
    if (!isPermission(permission)) {
      res.status(400).json({ error: 'permission must be viewer or editor.' });
      return;
    }
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      res.status(400).json({ error: 'A valid recipient email is required.' });
      return;
    }

    const table = RESOURCE_TABLES[resourceType];
    const resourceRows = await db
      .select()
      .from(table)
      .where(and(eq(table.id, resourceId), eq(table.userId, req.userId!)))
      .limit(1);
    if (!resourceRows[0]) {
      res.status(404).json({ error: 'Resource not found.' });
      return;
    }

    const ownerRows = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    const owner = ownerRows[0];

    const [row] = await db
      .insert(collaborationInvites)
      .values({
        id: crypto.randomUUID(),
        ownerId: req.userId!,
        recipientEmail,
        recipientEmailLower: recipientEmail.toLowerCase(),
        resourceType,
        resourceId,
        resourceName,
        permission,
        status: 'pending',
      })
      .returning();

    res.json({ invite: inviteToApi(row, owner?.email) });
  } catch (err) {
    console.error('Failed to create collaboration invite:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/** Lists pending invites addressed to the current user, matched by email (or already-linked uid). */
collaborationInvitesRouter.get('/pending', async (req, res) => {
  try {
    const userRows = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    const email = userRows[0]?.emailLower;

    const rows = await db
      .select()
      .from(collaborationInvites)
      .where(
        and(
          eq(collaborationInvites.status, 'pending'),
          email
            ? or(eq(collaborationInvites.recipientUserId, req.userId!), eq(collaborationInvites.recipientEmailLower, email))
            : eq(collaborationInvites.recipientUserId, req.userId!),
        ),
      )
      .orderBy(desc(collaborationInvites.createdAt));

    const ownerIds = [...new Set(rows.map((row) => row.ownerId))];
    const ownerRows = ownerIds.length
      ? await db.select().from(users).where(or(...ownerIds.map((id) => eq(users.id, id))))
      : [];
    const ownerEmailById = new Map(ownerRows.map((u) => [u.id, u.email]));

    res.json({ invites: rows.map((row) => inviteToApi(row, ownerEmailById.get(row.ownerId))) });
  } catch (err) {
    console.error('Failed to list pending collaboration invites:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/** Lists invites the current user created (as owner), most recent first. Used to surface "X accepted your invite" notifications. */
collaborationInvitesRouter.get('/sent', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(collaborationInvites)
      .where(eq(collaborationInvites.ownerId, req.userId!))
      .orderBy(desc(collaborationInvites.createdAt));

    res.json({ invites: rows.map((row) => inviteToApi(row)) });
  } catch (err) {
    console.error('Failed to list sent collaboration invites:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/** Accepts an invite: links it to the caller and grants them access via the resource's jsonb collaborator fields. */
collaborationInvitesRouter.post('/:id/accept', async (req, res) => {
  try {
    const inviteRows = await db
      .select()
      .from(collaborationInvites)
      .where(eq(collaborationInvites.id, req.params.id))
      .limit(1);
    const invite = inviteRows[0];
    if (!invite) {
      res.status(404).json({ error: 'Invite not found.' });
      return;
    }
    if (invite.status !== 'pending') {
      res.status(409).json({ error: 'Invite is no longer pending.' });
      return;
    }

    const table = RESOURCE_TABLES[invite.resourceType as ResourceType];
    const resourceRows = await db.select().from(table).where(eq(table.id, invite.resourceId)).limit(1);
    const resource = resourceRows[0] as { collaboratorIds?: string[] | null; collaborationPermissions?: Record<string, string> | null } | undefined;
    if (!resource) {
      res.status(404).json({ error: 'Shared resource was not found.' });
      return;
    }

    const collaboratorIds = Array.isArray(resource.collaboratorIds) ? resource.collaboratorIds : [];
    const nextCollaboratorIds = collaboratorIds.includes(req.userId!)
      ? collaboratorIds
      : [...collaboratorIds, req.userId!];
    const nextPermissions = { ...(resource.collaborationPermissions ?? {}), [req.userId!]: invite.permission };

    await db
      .update(table)
      .set({ collaboratorIds: nextCollaboratorIds, collaborationPermissions: nextPermissions })
      .where(eq(table.id, invite.resourceId));

    const [row] = await db
      .update(collaborationInvites)
      .set({ recipientUserId: req.userId!, status: 'accepted', respondedAt: new Date() })
      .where(eq(collaborationInvites.id, invite.id))
      .returning();

    res.json({ invite: inviteToApi(row) });
  } catch (err) {
    console.error('Failed to accept collaboration invite:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/** Declines an invite. */
collaborationInvitesRouter.post('/:id/decline', async (req, res) => {
  try {
    const inviteRows = await db
      .select()
      .from(collaborationInvites)
      .where(eq(collaborationInvites.id, req.params.id))
      .limit(1);
    if (!inviteRows[0]) {
      res.status(404).json({ error: 'Invite not found.' });
      return;
    }
    const [row] = await db
      .update(collaborationInvites)
      .set({ recipientUserId: req.userId!, status: 'declined', respondedAt: new Date() })
      .where(eq(collaborationInvites.id, req.params.id))
      .returning();
    res.json({ invite: inviteToApi(row) });
  } catch (err) {
    console.error('Failed to decline collaboration invite:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
