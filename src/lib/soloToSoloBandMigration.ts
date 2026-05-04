import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

const BANDS_COLLECTION = 'bands';
const BAND_SONGS_COLLECTION = 'songs';
const BAND_SONGLISTS_COLLECTION = 'songLists';
const BAND_SETLISTS_COLLECTION = 'setlists';
const BAND_STAGEPLOTS_COLLECTION = 'stageplots';
const BAND_TECHNICAL_RIDERS_COLLECTION = 'technicalRiders';

/**
 * Migrates solo libraries to a "Solo" band.
 * This function:
 * 1. Checks if a user has any solo items (songs, songlists, setlists, stageplots, technical riders)
 * 2. If yes and no "Solo" band exists, creates a "Solo" band
 * 3. Migrates all solo items to the "Solo" band
 * 4. Optionally keeps or deletes the original solo data
 *
 * @param db - Firestore instance
 * @param userId - User ID
 * @param userEmail - User email
 * @param username - User username
 * @param fullName - User full name
 * @param avatar - User avatar URL
 * @param keepOriginalData - If true, keeps original solo data; if false, deletes it after migration
 * @returns An object with migration status and the Solo band ID if created
 */
export async function migrateSoloToSoloBand(
  db: Firestore,
  userId: string,
  userEmail: string,
  username: string,
  fullName: string,
  avatar: string,
  keepOriginalData: boolean = true
): Promise<{ migrated: boolean; soloBandId: string | null; error: string | null }> {
  try {
    // Check if "Solo" band already exists
    const existingSoloBand = await getDocs(
      query(
        collection(db, BANDS_COLLECTION),
        where('memberIds', 'array-contains', userId),
        where('name', '==', 'Solo')
      )
    );

    if (existingSoloBand.size > 0) {
      return { migrated: false, soloBandId: existingSoloBand.docs[0].id, error: null };
    }

    // Check if user has any solo items
    const [soloSongs, soloSongLists, soloSetlists, soloStageplots, soloRiders] = await Promise.all([
      getDocs(collection(db, 'users', userId, 'songs')),
      getDocs(collection(db, 'users', userId, 'songLists')),
      getDocs(collection(db, 'users', userId, 'setlists')),
      getDocs(collection(db, 'users', userId, 'stageplots')),
      getDocs(collection(db, 'users', userId, 'technicalRiders')),
    ]);

    const hasSoloItems =
      soloSongs.size > 0 ||
      soloSongLists.size > 0 ||
      soloSetlists.size > 0 ||
      soloStageplots.size > 0 ||
      soloRiders.size > 0;

    if (!hasSoloItems) {
      return { migrated: false, soloBandId: null, error: null };
    }

    // Create "Solo" band
    const soloBandId = crypto.randomUUID();
    const now = new Date().toISOString();

    await setDoc(doc(db, BANDS_COLLECTION, soloBandId), {
      name: 'Solo',
      ownerId: userId,
      memberIds: [userId],
      memberRoles: {
        [userId]: 'editor',
      },
      memberEmails: userEmail ? { [userId]: userEmail } : {},
      memberUsernames: username ? { [userId]: username } : {},
      memberFullNames: fullName ? { [userId]: fullName } : {},
      memberAvatars: avatar ? { [userId]: avatar } : {},
      createdAt: now,
      updatedAt: now,
    });

    // Migrate songs
    if (soloSongs.size > 0) {
      const batch = writeBatch(db);
      soloSongs.docs.forEach((songDoc) => {
        batch.set(
          doc(db, BANDS_COLLECTION, soloBandId, BAND_SONGS_COLLECTION, songDoc.id),
          songDoc.data()
        );
      });
      await batch.commit();
    }

    // Migrate song lists
    if (soloSongLists.size > 0) {
      const batch = writeBatch(db);
      soloSongLists.docs.forEach((listDoc) => {
        batch.set(
          doc(db, BANDS_COLLECTION, soloBandId, BAND_SONGLISTS_COLLECTION, listDoc.id),
          listDoc.data()
        );
      });
      await batch.commit();
    }

    // Migrate setlists
    if (soloSetlists.size > 0) {
      const batch = writeBatch(db);
      soloSetlists.docs.forEach((setlistDoc) => {
        batch.set(
          doc(db, BANDS_COLLECTION, soloBandId, BAND_SETLISTS_COLLECTION, setlistDoc.id),
          setlistDoc.data()
        );
      });
      await batch.commit();
    }

    // Migrate stageplots
    if (soloStageplots.size > 0) {
      const batch = writeBatch(db);
      soloStageplots.docs.forEach((stageplotDoc) => {
        batch.set(
          doc(db, BANDS_COLLECTION, soloBandId, BAND_STAGEPLOTS_COLLECTION, stageplotDoc.id),
          stageplotDoc.data()
        );
      });
      await batch.commit();
    }

    // Migrate technical riders
    if (soloRiders.size > 0) {
      const batch = writeBatch(db);
      soloRiders.docs.forEach((riderDoc) => {
        batch.set(
          doc(db, BANDS_COLLECTION, soloBandId, BAND_TECHNICAL_RIDERS_COLLECTION, riderDoc.id),
          riderDoc.data()
        );
      });
      await batch.commit();
    }

    // Optionally delete original solo data
    if (!keepOriginalData) {
      const deleteBatch = writeBatch(db);
      soloSongs.docs.forEach((songDoc) => {
        deleteBatch.delete(doc(db, 'users', userId, 'songs', songDoc.id));
      });
      soloSongLists.docs.forEach((listDoc) => {
        deleteBatch.delete(doc(db, 'users', userId, 'songLists', listDoc.id));
      });
      soloSetlists.docs.forEach((setlistDoc) => {
        deleteBatch.delete(doc(db, 'users', userId, 'setlists', setlistDoc.id));
      });
      soloStageplots.docs.forEach((stageplotDoc) => {
        deleteBatch.delete(doc(db, 'users', userId, 'stageplots', stageplotDoc.id));
      });
      soloRiders.docs.forEach((riderDoc) => {
        deleteBatch.delete(doc(db, 'users', userId, 'technicalRiders', riderDoc.id));
      });
      await deleteBatch.commit();
    }

    return { migrated: true, soloBandId, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return { migrated: false, soloBandId: null, error: errorMessage };
  }
}
