import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { BandInvite } from '../types';

const BAND_INVITES_COLLECTION = 'bandInvites';

function inviteFromDoc(id: string, data: Record<string, unknown>): BandInvite {
  return { id, ...(data as Omit<BandInvite, 'id'>) };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mergeInvites(invites: BandInvite[]) {
  const seen = new Map<string, BandInvite>();
  invites.forEach((invite) => {
    seen.set(invite.id, invite);
  });
  return [...seen.values()];
}

export async function loadPendingBandInvites(db: Firestore, userId: string, email: string) {
  const normalizedEmail = normalizeEmail(email);

  const byUidPromise = getDocs(
    query(
      collection(db, BAND_INVITES_COLLECTION),
      where('recipientUid', '==', userId)
    )
  );

  const byEmailPromise = isValidEmail(normalizedEmail)
    ? getDocs(
      query(
        collection(db, BAND_INVITES_COLLECTION),
        where('recipientEmailLower', '==', normalizedEmail)
      )
    )
    : Promise.resolve(null);

  const [byUidResult, byEmailResult] = await Promise.allSettled([byUidPromise, byEmailPromise]);
  if (byUidResult.status !== 'fulfilled') {
    throw byUidResult.reason;
  }

  if (byEmailResult.status === 'rejected') {
    console.warn('Failed to load email-based band invites; continuing with UID invites only.', byEmailResult.reason);
  }

  const byUidSnap = byUidResult.value;
  const byEmailDocs = byEmailResult.status === 'fulfilled' && byEmailResult.value
    ? byEmailResult.value.docs
    : [];

  return mergeInvites([
    ...byUidSnap.docs.map((entry) => inviteFromDoc(entry.id, entry.data() as Record<string, unknown>)),
    ...byEmailDocs.map((entry) => inviteFromDoc(entry.id, entry.data() as Record<string, unknown>)),
  ])
    .filter((invite) => invite.status === 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function declineBandInvite(db: Firestore, inviteId: string, userId: string) {
  await updateDoc(doc(db, BAND_INVITES_COLLECTION, inviteId), {
    recipientUid: userId,
    status: 'declined',
    respondedAt: new Date().toISOString(),
  });
}