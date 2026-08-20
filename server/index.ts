import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { attachSession } from './middleware/session.js';
import { getPublicPressKitData } from './routes/publicPressKits.js';
import { renderPressKitOgHtml } from './lib/pressKitOg.js';
import { authRateLimit } from './middleware/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { adminInvitesRouter, publicInvitesRouter } from './routes/invites.js';
import { bandsRouter } from './routes/bands.js';
import { bandSongsRouter } from './routes/bandSongs.js';
import { bandSongListsRouter } from './routes/bandSongLists.js';
import { bandSetlistsRouter } from './routes/bandSetlists.js';
import { bandRidersRouter } from './routes/bandRiders.js';
import { publicRidersRouter } from './routes/publicRiders.js';
import { bandAttachmentsRouter } from './routes/bandAttachments.js';
import { bandTrashRouter } from './routes/bandTrash.js';
import { bandPressKitsRouter } from './routes/bandPressKits.js';
import { bandPressKitImagesRouter } from './routes/bandPressKitImages.js';
import { bandPressKitSharesRouter } from './routes/bandPressKitShares.js';
import { publicPressKitsRouter } from './routes/publicPressKits.js';
import { bandSongHandNotesRouter } from './routes/songHandNotes.js';
import { bandSongRecordingsRouter } from './routes/songRecordings.js';
import { bandLogosRouter } from './routes/bandLogos.js';
import { feedbackRouter } from './routes/feedback.js';
import { storageUsageRouter } from './routes/storageUsage.js';
import { songBadgesRouter } from './routes/songBadges.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required.');
}
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required.');
}
if (!process.env.ATTACHMENTS_DIR) {
  throw new Error('ATTACHMENTS_DIR environment variable is required.');
}
if (Boolean(process.env.ADMIN_EMAIL) !== Boolean(process.env.ADMIN_PASSWORD)) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must both be set, or both left unset.');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 6168;
const DIST_DIR = path.resolve(__dirname, '../dist');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(attachSession);

app.use('/api/auth', authRateLimit, authRouter);
app.use('/api/admin/invites', adminInvitesRouter);
app.use('/api/invites', authRateLimit, publicInvitesRouter);
app.use('/api/storage-usage', storageUsageRouter);
app.use('/api/song-badges', songBadgesRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/bands/:bandId/songs/:songId/attachments', bandAttachmentsRouter);
app.use('/api/bands/:bandId/songs/:songId/hand-notes', bandSongHandNotesRouter);
app.use('/api/bands/:bandId/songs/:songId/recordings', bandSongRecordingsRouter);
app.use('/api/bands/:bandId/songs', bandSongsRouter);
app.use('/api/bands/:bandId/song-lists', bandSongListsRouter);
app.use('/api/bands/:bandId/setlists', bandSetlistsRouter);
app.use('/api/bands/:bandId/riders', bandRidersRouter);
app.use('/api/bands/:bandId/press-kit-images', bandPressKitImagesRouter);
app.use('/api/bands/:bandId/logos', bandLogosRouter);
// Mounted before bandPressKitsRouter so its more specific /:id/share(/disable) routes are tried first.
app.use('/api/bands/:bandId/press-kits', bandPressKitSharesRouter);
app.use('/api/bands/:bandId/press-kits', bandPressKitsRouter);
app.use('/api/bands/:bandId/trash', bandTrashRouter);
app.use('/api/public', publicRidersRouter);
app.use('/api/public', publicPressKitsRouter);
app.use('/api/bands', bandsRouter);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  next();
});

// Cached once at startup (not re-read per request) — index.html doesn't change while the server runs.
const INDEX_HTML_PATH = path.join(DIST_DIR, 'index.html');
let cachedIndexHtml: string | null = null;
try {
  cachedIndexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
} catch (err) {
  console.warn('Could not read dist/index.html at startup; press kit OG-tag SSR is disabled.', err);
}

/**
 * Ports functions/public/press-kit/[token].ts's Cloudflare HTMLRewriter-based OG-tag injection to
 * Express: intercepts `GET /press-kit/:token`, looks up the press kit in-process, and rewrites
 * index.html's meta tags before falling through to the normal SPA response. Must be mounted before
 * express.static/the SPA fallback below. Falls through (does not 404) if no press kit is found.
 */
app.get('/press-kit/:token', async (req, res, next) => {
  if (!cachedIndexHtml) {
    next();
    return;
  }
  try {
    const data = await getPublicPressKitData(req.params.token);
    if (!data) {
      next();
      return;
    }
    const origin = `${req.protocol}://${req.get('host')}`;
    const html = renderPressKitOgHtml(cachedIndexHtml, data, req.originalUrl ? `${origin}${req.originalUrl}` : origin, origin);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Failed to render press kit OG tags:', err);
    next();
  }
});

app.use(express.static(DIST_DIR));
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Gigboy self-host server listening on port ${PORT}`);
});
