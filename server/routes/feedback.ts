import { Router } from 'express';
import { db } from '../db/client.js';
import { feedback } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';

// Layout.tsx's handleSubmitFeedback already requires `user?.id` before calling submitFeedback,
// so the Firestore version was effectively signed-in-only — mirror that with requireAuth.
export const feedbackRouter = Router();
feedbackRouter.use(requireAuth);

feedbackRouter.post('/', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      res.json({});
      return;
    }

    await db.insert(feedback).values({
      id: crypto.randomUUID(),
      userId: req.userId ?? null,
      email: typeof body.email === 'string' ? body.email : null,
      message,
      page: typeof body.page === 'string' ? body.page : null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.json({});
  } catch (err) {
    console.error('Failed to submit feedback:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
