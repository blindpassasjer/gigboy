# GIGBOY

A web-based songbook and gig-prep tool for musicians and bands, built on **ChordPro**. Runs as an installable PWA with optional Firebase authentication, Cloudflare Pages hosting, and Stripe billing for paid plans.

## Features

- **ChordPro rendering** — chords displayed inline above lyrics using `[G]Amazing [C]grace` notation
- **Transpose** — shift all chords up or down by semitone in real time
- **Bands** — shared song libraries, songlists, and setlists with per-member roles and invites
- **Setlists & songlists** — ordered setlists for gigs, plus freeform songlists for organizing your library
- **Press kits, technical riders, stage plots** — shareable via public links, generated per band
- **In-app rehearsal tools** — browser-based audio recorder, visual metronome, visual tuner, and hand-drawn notes overlaid on the song sheet
- **Multi-language** — songs in English, Norwegian, Spanish, Portuguese, French, Italian, German, and more
- **Add & edit songs** — live ChordPro preview while writing
- **Search & filter** — full-text search by title/artist/tag, filter by language
- **Data export** — download your whole songbook (personal + every band you belong to) as plain ChordPro files from account settings, no lock-in
- **Dark mode** — automatic system preference detection with manual toggle
- **Offline-capable PWA** — installable, works offline via a service worker; see [chunkRecovery.ts](src/lib/chunkRecovery.ts) for how it recovers from stale-deploy cache issues
- **Auth-optional locally** — Firebase auth can be enabled via environment variables; omitting them gives a fully local, login-free experience for local development
- **Free / Pro / Crew plans** — see [/pricing](src/pages/PricingPage.tsx); Stripe handles billing and the customer portal handles cancellation

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

## Testing

Use the release checklist in [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) before deploying.

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
  components/     UI components (Layout, Sidebar, SongList, SongView, ChordDisplay, PressKitView, …)
  context/        SongsContext, SongListsContext, SetlistsContext, BandsContext, AuthContext
  hooks/          usePlan, useBandPlan, useAudioRecorder, useStorageUsage, …
  pages/          SongPage, AddSongPage, BandDetailPage, PricingPage, ProfilePage, TermsPage, PrivacyPage, …
  lib/            planLimits (plan gating), songbookExport (ChordPro export), billingApi, chunkRecovery, …
  types/          Song, Setlist, SongList, Band, User types
  utils/          chordParser, languages
functions/        Cloudflare Pages Functions (auth, bands, Stripe webhooks, PDF/press-kit generation)
```

## Legal pages

Draft Terms of Service and Privacy Policy live at [src/pages/TermsPage.tsx](src/pages/TermsPage.tsx) and [src/pages/PrivacyPage.tsx](src/pages/PrivacyPage.tsx) (routes `/terms` and `/privacy`). They're templates with bracketed placeholders — fill those in and get them reviewed before relying on them, especially the copyright section (users store song lyrics/chords, which are often copyrighted material) and GDPR compliance if you have EU/EEA users.

## Before going public

- [ ] Fill in and legally review `/terms` and `/privacy`
- [ ] Set `VITE_SENTRY_DSN` (see `.env.example`) to enable production error monitoring via [Sentry](https://sentry.io) — unset by default, so no-op until you add a DSN
- [ ] Rotate any credentials embedded in local git remotes/config before adding collaborators or CI
- [ ] Test the offline/PWA experience end-to-end (load, go offline, reopen) before promoting it to gigging musicians

## Plan limits

Free/Pro/Crew feature gating and song/setlist/storage caps live in [src/lib/planLimits.ts](src/lib/planLimits.ts) — check there before assuming a feature is (or isn't) behind a paywall.

## License

MIT
