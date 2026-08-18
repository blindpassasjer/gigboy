import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { attachSession } from './middleware/session.js';
import { authRateLimit } from './middleware/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { songsRouter } from './routes/songs.js';
import { songListsRouter } from './routes/songLists.js';
import { setlistsRouter } from './routes/setlists.js';
import { bandsRouter } from './routes/bands.js';
import { bandSongsRouter } from './routes/bandSongs.js';
import { bandSongListsRouter } from './routes/bandSongLists.js';
import { bandSetlistsRouter } from './routes/bandSetlists.js';
import { bandRidersRouter } from './routes/bandRiders.js';
import { publicRidersRouter } from './routes/publicRiders.js';
import { attachmentsRouter } from './routes/attachments.js';
import { bandAttachmentsRouter } from './routes/bandAttachments.js';
import { trashRouter } from './routes/trash.js';
import { bandTrashRouter } from './routes/bandTrash.js';
import { bandPressKitsRouter } from './routes/bandPressKits.js';
import { bandPressKitImagesRouter } from './routes/bandPressKitImages.js';
import { bandPressKitSharesRouter } from './routes/bandPressKitShares.js';
import { publicPressKitsRouter } from './routes/publicPressKits.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required.');
}
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required.');
}
if (!process.env.ATTACHMENTS_DIR) {
  throw new Error('ATTACHMENTS_DIR environment variable is required.');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.resolve(__dirname, '../dist');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(attachSession);

app.use('/api/auth', authRateLimit, authRouter);
app.use('/api/trash', trashRouter);
app.use('/api/songs/:songId/attachments', attachmentsRouter);
app.use('/api/songs', songsRouter);
app.use('/api/song-lists', songListsRouter);
app.use('/api/setlists', setlistsRouter);
app.use('/api/bands/:bandId/songs/:songId/attachments', bandAttachmentsRouter);
app.use('/api/bands/:bandId/songs', bandSongsRouter);
app.use('/api/bands/:bandId/song-lists', bandSongListsRouter);
app.use('/api/bands/:bandId/setlists', bandSetlistsRouter);
app.use('/api/bands/:bandId/riders', bandRidersRouter);
app.use('/api/bands/:bandId/press-kit-images', bandPressKitImagesRouter);
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
