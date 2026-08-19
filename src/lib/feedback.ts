/**
 * Self-host implementation of in-app feedback submission, posting to `/api/feedback` (see
 * server/routes/feedback.ts) instead of Firestore directly. Keeps the same exported function
 * signature minus the `db` param Layout.tsx's Firestore-backed version used to pass.
 */
export async function submitFeedback(
  input: { userId: string; email: string | null; message: string; page: string },
) {
  const message = input.message.trim();
  if (!message) return;

  const response = await fetch('/api/feedback', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email ?? null,
      message,
      page: input.page,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) errorMessage = body.error;
    } catch {
      // Response wasn't JSON; fall back to the generic message.
    }
    throw new Error(errorMessage);
  }
}
