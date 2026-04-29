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

function mergeInvites(invites: BandInvite[]) {
  const seen = new Map<string, BandInvite>();
  invites.forEach((invite) => {
    seen.set(invite.id, invite);
  });
  return [...seen.values()];
}

export async function loadPendingBandInvites(db: Firestore, userId: string, email: string) {
  const normalizedEmail = normalizeEmail(email);

  const [byUidSnap, byEmailSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, BAND_INVITES_COLLECTION),
        where('status', '==', 'pending'),
        where('recipientUid', '==', userId)
      )
    ),
    getDocs(
      query(
        collection(db, BAND_INVITES_COLLECTION),
        where('status', '==', 'pending'),
        where('recipientEmailLower', '==', normalizedEmail)
      )
    ),
  ]);

  return mergeInvites([
    ...byUidSnap.docs.map((entry) => inviteFromDoc(entry.id, entry.data() as Record<string, unknown>)),
    ...byEmailSnap.docs.map((entry) => inviteFromDoc(entry.id, entry.data() as Record<string, unknown>)),
  ]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function declineBandInvite(db: Firestore, inviteId: string, userId: string) {
  await updateDoc(doc(db, BAND_INVITES_COLLECTION, inviteId), {
    recipientUid: userId,
    status: 'declined',
    respondedAt: new Date().toISOString(),
  });
}