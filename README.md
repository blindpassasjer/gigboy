# GIGBOY

A personal web-based songbook that stores songs in **ChordPro** format. Supports multiple languages, setlists, transposing, and in-browser audio recording. Runs as a static SPA with optional Firebase authentication and Cloudflare Workers or Pages hosting.

## Features

- **ChordPro rendering** — chords displayed inline above lyrics using `[G]Amazing [C]grace` notation
- **Transpose** — shift all chords up or down by semitone in real time
- **Setlists** — create and manage ordered setlists from your song library
- **Multi-language** — songs in English, Norwegian, Spanish, Portuguese, French, Italian, German, and more
- **Audio recording** — record directly in the browser; recordings are saved to `localStorage`
- **Add & edit songs** — live ChordPro preview while writing; songs persist in `localStorage` when Firebase is not configured
- **Search & filter** — full-text search by title/artist/tag, filter by language
- **Dark mode** — automatic system preference detection with manual toggle
- **Auth-optional** — Firebase auth can be enabled via environment variables; omitting them gives a fully local, login-free experience

## Tech stack

| Tool | Purpose |
|---|---|
| React 18 + TypeScript | UI |
| Vite 4 | Build tooling |
| React Router 7 | Client-side routing |
| Firebase 11 | Auth & (optional) data storage |
| Cloudflare Workers / Pages | Hosting & serverless functions |
| lucide-react | Icons |
| `localStorage` | Local song & recording persistence |
| Web MediaRecorder API | In-browser audio recording |

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Without any environment variables the app runs in local-only mode — no login required and songs are stored in `localStorage`.

## Firebase setup (optional)

To enable authentication and cloud storage, create a Firebase project and add the following variables to a `.env` file at the project root:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Set `VITE_FIREBASE_AUTH_DOMAIN` to your Firebase Auth domain (usually `<project-id>.firebaseapp.com`).

By default, the app will normalize non-Firebase auth domains to `<project-id>.firebaseapp.com` to keep Google/GitHub OAuth popup flows working on non-Firebase hosts.
If you intentionally use a custom auth domain and have hosted the Firebase auth handlers for it, set:

```
VITE_FIREBASE_ALLOW_CUSTOM_AUTH_DOMAIN=true
```

When these are present the app requires login before showing any content.

## ChordPro format

Chords are wrapped in square brackets inline with lyrics:

```
[G]Amazing [C]grace, how [G]sweet the [D]sound
```

Directives use curly braces:

```
{title: Amazing Grace}
{artist: John Newton}
{start_of_verse}
...
{end_of_verse}
{start_of_chorus}
...
{end_of_chorus}
```

Supported directives: `title`, `subtitle`, `artist`, `start_of_verse`, `end_of_verse`, `start_of_chorus`, `end_of_chorus`, `start_of_bridge`, `end_of_bridge`.

## Adding songs

1. Click **Add Song** in the nav bar.
2. Fill in title, artist, language, key, capo, and BPM.
3. Write or paste ChordPro lyrics — toggle **Preview** to see the rendered result.
4. Click **Save Song** — the song is stored and you land directly on the song view.

## Deploying

### Cloudflare Pages (recommended when using `/api/*`)

```bash
npm run deploy
```

This builds the project, writes the `_redirects` file for SPA fallback, then deploys via `wrangler pages deploy`.
Use this if you need `functions/api/*` endpoints (invite, band create, accept, etc.).

### Cloudflare Workers (static-only)

```bash
npm run deploy:workers
```

This deploys static assets only. Cloudflare Pages Functions in `functions/` are not included.

### Other static hosts

```bash
npm run build
# deploy the dist/ folder to Netlify, Vercel, etc.
```

Add the Firebase environment variables to your host's build environment if you want auth and cloud storage enabled in production.

If you are deploying from the Cloudflare Pages dashboard, set build command `npm run build` and output directory `dist`.

## Data migration helpers

If you already have users and bands in Firestore, you can backfill new full-name fields:

```bash
# Dry run (no writes)
npm run migrate:full-names -- --project <firebase-project-id> --credentials <service-account.json>

# Execute writes
npm run migrate:full-names:execute -- --project <firebase-project-id> --credentials <service-account.json>
```

This migration:
- reports users missing `fullName`
- syncs `bands.memberFullNames` from user profiles where `fullName` exists
- optionally backfills missing user full names from usernames with `--also-fill-users-from-username`

## Project structure

```
src/
  components/     UI components (Layout, SongList, SongView, ChordDisplay, …)
  context/        SongsContext — song list state + localStorage sync
  data/           Built-in songs (songs.ts)
  hooks/          useAudioRecorder
  pages/          HomePage, SongPage, AddSongPage
  types/          Song, Recording, ParsedLine types
  utils/          chordParser, storage, languages
```

## Contributing

Songs live in [src/data/songs.ts](src/data/songs.ts). To add a built-in song, append a `Song` object and open a PR. Keep the ChordPro text accurate and include `language`, `tags`, and optionally `key`/`capo`.

## License

MIT
