import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

/** Requires an authenticated user (see `requireAuth`) whose `role` is `'admin'`. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const rows = await db.select({ role: users.role }).from(users).where(eq(users.id, req.userId)).limit(1);
    if (rows[0]?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    next();
  } catch (err) {
    console.error('Admin check failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
