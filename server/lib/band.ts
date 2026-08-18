import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bandMembers, bands, users } from '../db/schema.js';
import { removeNullish } from './serialize.js';

type BandRow = typeof bands.$inferSelect;

interface Band {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  ownerId: string;
  memberIds: string[];
  memberRoles: Record<string, string>;
  memberEmails: Record<string, string>;
  memberUsernames: Record<string, string>;
  memberFullNames: Record<string, string>;
  memberAvatars: Record<string, string>;
  createdAt: string;
  updatedAt?: string;
}

/** Maps a `bands` row plus its joined `band_members`/`users` rows into the frontend `Band` API shape. */
export async function toBandApi(row: BandRow): Promise<Band> {
  const memberRows = await db
    .select({
      userId: bandMembers.userId,
      role: bandMembers.role,
      email: users.email,
      username: users.username,
      fullName: users.fullName,
      avatar: users.avatar,
    })
    .from(bandMembers)
    .innerJoin(users, eq(bandMembers.userId, users.id))
    .where(eq(bandMembers.bandId, row.id));

  const memberIds: string[] = [];
  const memberRoles: Record<string, string> = {};
  const memberEmails: Record<string, string> = {};
  const memberUsernames: Record<string, string> = {};
  const memberFullNames: Record<string, string> = {};
  const memberAvatars: Record<string, string> = {};

  for (const m of memberRows) {
    memberIds.push(m.userId);
    memberRoles[m.userId] = m.role;
    memberEmails[m.userId] = m.email;
    if (m.username) memberUsernames[m.userId] = m.username;
    if (m.fullName) memberFullNames[m.userId] = m.fullName;
    if (m.avatar) memberAvatars[m.userId] = m.avatar;
  }

  return removeNullish({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    icon: row.icon ?? undefined,
    ownerId: row.ownerId,
    memberIds,
    memberRoles,
    memberEmails,
    memberUsernames,
    memberFullNames,
    memberAvatars,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  }) as Band;
}
