import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

const FEEDBACK_COLLECTION = 'feedback';

export async function submitFeedback(
  db: Firestore,
  input: { userId: string; email: string | null; message: string; page: string },
) {
  const message = input.message.trim();
  if (!message) return;

  await addDoc(collection(db, FEEDBACK_COLLECTION), {
    userId: input.userId,
    email: input.email ?? null,
    message,
    page: input.page,
    userAgent: navigator.userAgent,
    createdAt: serverTimestamp(),
  });
}
