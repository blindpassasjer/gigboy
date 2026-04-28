import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  setDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type {
  CollaborationInvite,
  CollaborationPermission,
  ShareResourceType,
} from '../types';

const INVITES_COLLECTION = 'collaborationInvites';

function inviteFromDoc(id: string, data: Record<string, unknown>): CollaborationInvite {
  return { id, ...(data as Omit<CollaborationInvite, 'id'>) };
}

export function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getResourceCollection(resourceType: ShareResourceType) {
  if (resourceType === 'song') return 'songs';
  if (resourceType === 'songlist') return 'songLists';
  return 'setlists';
}

export function getSharedResourceRef(
  db: Firestore,
  ownerId: string,
  resourceType: ShareResourceType,
  resourceId: string
) {
  return doc(db, 'users', ownerId, getResourceCollection(resourceType), resourceId);
}

export async function createInvite(params: {
  db: Firestore;
  ownerId: string;
  ownerEmail: string;
  recipientEmail: string;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  permission: CollaborationPermission;
}) {
  const {
    db,
    ownerId,
    ownerEmail,
    recipientEmail,
    resourceType,
    resourceId,
    resourceName,
    permission,
  } = params;

  const inviteId = crypto.randomUUID();
  const now = new Date().toISOString();
  const normalizedRecipient = normalizeInviteEmail(recipientEmail);

  const invite: CollaborationInvite = {
    id: inviteId,
    ownerId,
    ownerEmail,
    recipientEmail: recipientEmail.trim(),
    recipientEmailLower: normalizedRecipient,
    resourceType,
    resourceId,
    resourceName,
    permission,
    status: 'pending',
    createdAt: now,
  };

  const { id, ...payload } = invite;
  await setDoc(doc(db, INVITES_COLLECTION, id), payload);
  return invite;
}

function mergeInvites(invites: CollaborationInvite[]) {
  const seen = new Map<string, CollaborationInvite>();
  invites.forEach((invite) => {
    seen.set(invite.id, invite);
  });
  return [...seen.values()];
}

export async function loadPendingInvites(db: Firestore, userId: string, email: string) {
  const normalizedEmail = normalizeInviteEmail(email);

  const [byUidSnap, byEmailSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, INVITES_COLLECTION),
        where('status', '==', 'pending'),
        where('recipientUid', '==', userId)
      )
    ),
    getDocs(
      query(
        collection(db, INVITES_COLLECTION),
        where('status', '==', 'pending'),
        where('recipientEmailLower', '==', normalizedEmail)
      )
    ),
  ]);

  const combined = mergeInvites([
    ...byUidSnap.docs.map((entry) => inviteFromDoc(entry.id, entry.data() as Record<string, unknown>)),
    ...byEmailSnap.docs.map((entry) => inviteFromDoc(entry.id, entry.data() as Record<string, unknown>)),
  ]);

  return combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function acceptInvite(db: Firestore, invite: CollaborationInvite, userId: string) {
  const inviteRef = doc(db, INVITES_COLLECTION, invite.id);
  const latestInviteSnap = await getDoc(inviteRef);
  if (!latestInviteSnap.exists()) {
    throw new Error('Invite no longer exists.');
  }

  const latestInvite = inviteFromDoc(invite.id, latestInviteSnap.data() as Record<string, unknown>);
  if (latestInvite.status !== 'pending') {
    throw new Error('Invite is no longer pending.');
  }

  const resourceRef = getSharedResourceRef(db, latestInvite.ownerId, latestInvite.resourceType, latestInvite.resourceId);
  const resourceSnap = await getDoc(resourceRef);

  if (!resourceSnap.exists()) {
    throw new Error('Shared resource was not found.');
  }

  const resourceData = resourceSnap.data() as Record<string, unknown>;
  const collaboratorIds = Array.isArray(resourceData.collaboratorIds)
    ? (resourceData.collaboratorIds as string[])
    : [];

  const permissions = (resourceData.collaborationPermissions ?? {}) as Record<string, CollaborationPermission>;
  const nextPermissions = {
    ...permissions,
    [userId]: latestInvite.permission,
  };

  const nextCollaboratorIds = collaboratorIds.includes(userId)
    ? collaboratorIds
    : [...collaboratorIds, userId];

  await Promise.all([
    updateDoc(resourceRef, {
      collaboratorIds: nextCollaboratorIds,
      collaborationPermissions: nextPermissions,
      updatedAt: new Date().toISOString(),
    }),
    updateDoc(inviteRef, {
      recipientUid: userId,
      status: 'accepted',
      respondedAt: new Date().toISOString(),
    }),
  ]);
}

export async function declineInvite(db: Firestore, inviteId: string, userId: string) {
  const inviteRef = doc(db, INVITES_COLLECTION, inviteId);
  await updateDoc(inviteRef, {
    recipientUid: userId,
    status: 'declined',
    respondedAt: new Date().toISOString(),
  });
}
