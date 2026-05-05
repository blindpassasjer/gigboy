/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, listFirestoreDocuments, setFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
  userEmail?: string;
}

function normalizedStringSetFromRecord(record: unknown): Set<string> {
  if (!record || typeof record !== 'object') return new Set<string>();
  const values = Object.values(record as Record<string, unknown>)
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return new Set(values);
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = typeof ctx.data.userEmail === 'string' ? ctx.data.userEmail : '';
  const body = await ctx.request.json<{ username?: string; claimOwnership?: boolean }>().catch(() => ({}));
  const requestedUsername = body.username?.trim().toLowerCase() ?? '';
  const adminUids = (ctx.env.ADMIN_UIDS ?? '').split(',').map((u) => u.trim()).filter(Boolean);
  const claimOwnership = body.claimOwnership === true && adminUids.includes(userId);

  const profile = await getFirestoreDocument(ctx.env, ['users', userId]);
  const profileUsername = typeof profile?.username === 'string' ? profile.username.trim().toLowerCase() : '';
  const profileFullName = typeof profile?.fullName === 'string' ? profile.fullName : '';
  const profileAvatar = typeof profile?.avatar === 'string' ? profile.avatar : '';
  const usernameCandidates = new Set([profileUsername, requestedUsername].filter((entry) => entry.length > 0));

  const allBands = await listFirestoreDocuments(ctx.env, ['bands']);
  let repairedCount = 0;
  const repairedBandIds: string[] = [];
  let claimedCount = 0;
  const claimedBandIds: string[] = [];

  await Promise.all(allBands.map(async ({ id: bandId, data: band }) => {
    const ownerId = typeof band.ownerId === 'string' ? band.ownerId : '';
    const memberIds = Array.isArray(band.memberIds)
      ? band.memberIds.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const memberEmails = typeof band.memberEmails === 'object' && band.memberEmails !== null
      ? { ...(band.memberEmails as Record<string, unknown>) }
      : {};
    const memberUsernames = typeof band.memberUsernames === 'object' && band.memberUsernames !== null
      ? { ...(band.memberUsernames as Record<string, unknown>) }
      : {};
    const memberRoles = typeof band.memberRoles === 'object' && band.memberRoles !== null
      ? { ...(band.memberRoles as Record<string, unknown>) }
      : {};
    const memberFullNames = typeof band.memberFullNames === 'object' && band.memberFullNames !== null
      ? { ...(band.memberFullNames as Record<string, unknown>) }
      : {};
    const memberAvatars = typeof band.memberAvatars === 'object' && band.memberAvatars !== null
      ? { ...(band.memberAvatars as Record<string, unknown>) }
      : {};

    const bandEmailSet = normalizedStringSetFromRecord(memberEmails);
    const bandUsernameSet = normalizedStringSetFromRecord(memberUsernames);
    const matchesByOwner = ownerId === userId;
    const matchesByEmail = userEmail.length > 0 && bandEmailSet.has(userEmail);
    const matchesByUsername = Array.from(usernameCandidates).some((entry) => bandUsernameSet.has(entry));
    const shouldAssociate = matchesByOwner || matchesByEmail || matchesByUsername;

    if (!shouldAssociate) return;

    const nextMemberIds = memberIds.includes(userId) ? memberIds : [...memberIds, userId];
    const nextMemberRoles = (memberRoles[userId] === 'editor' || memberRoles[userId] === 'viewer')
      ? memberRoles
      : { ...memberRoles, [userId]: 'editor' };
    const nextMemberEmails = userEmail && memberEmails[userId] !== userEmail
      ? { ...memberEmails, [userId]: userEmail }
      : memberEmails;
    const nextMemberUsernames = profileUsername && memberUsernames[userId] !== profileUsername
      ? { ...memberUsernames, [userId]: profileUsername }
      : memberUsernames;
    const nextMemberFullNames = profileFullName && memberFullNames[userId] !== profileFullName
      ? { ...memberFullNames, [userId]: profileFullName }
      : memberFullNames;
    const nextMemberAvatars = profileAvatar && memberAvatars[userId] !== profileAvatar
      ? { ...memberAvatars, [userId]: profileAvatar }
      : memberAvatars;

    const canClaimOwnership = claimOwnership && (ownerId === '' || ownerId === userId);
    const nextOwnerId = canClaimOwnership ? userId : ownerId;

    const changed = (
      nextMemberIds.length !== memberIds.length
      || nextMemberRoles !== memberRoles
      || nextMemberEmails !== memberEmails
      || nextMemberUsernames !== memberUsernames
      || nextMemberFullNames !== memberFullNames
      || nextMemberAvatars !== memberAvatars
      || nextOwnerId !== ownerId
    );

    if (!changed) return;

    await setFirestoreDocument(ctx.env, ['bands', bandId], {
      ownerId: nextOwnerId,
      memberIds: nextMemberIds,
      memberRoles: nextMemberRoles,
      memberEmails: nextMemberEmails,
      memberUsernames: nextMemberUsernames,
      memberFullNames: nextMemberFullNames,
      memberAvatars: nextMemberAvatars,
      updatedAt: new Date().toISOString(),
    });

    repairedCount += 1;
    repairedBandIds.push(bandId);
    if (nextOwnerId !== ownerId) {
      claimedCount += 1;
      claimedBandIds.push(bandId);
    }
  }));

  return Response.json({
    ok: true,
    scanned: allBands.length,
    repairedCount,
    repairedBandIds,
    claimedCount,
    claimedBandIds,
  });
};

export const onRequest: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  if (ctx.request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        Allow: 'POST',
      },
    });
  }

  return onRequestPost(ctx);
};
