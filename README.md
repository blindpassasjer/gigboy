# GIGBOY

A web-based songbook and gig-prep tool for musicians and bands, built on **ChordPro**. Self-hosted
only: Express + Postgres backend, deployed as a single Docker Compose stack. Runs as an
installable PWA.

## Features

- **ChordPro rendering** — chords displayed inline above lyrics using `[G]Amazing [C]grace` notation
- **Transpose** — shift all chords up or down by semitone in real time
- **Bands** — shared song libraries, songlists, and setlists with per-member roles and invites
- **Setlists & songlists** — ordered setlists for gigs, plus freeform songlists for organizing your library
- **Press kits, technical riders, stage plots** — shareable via public links, generated per band, with OG-tag social previews
- **In-app rehearsal tools** — browser-based audio recorder, visual metronome, visual tuner, and hand-drawn notes overlaid on the song sheet
- **Attachments** — attach PDFs (up to 20 MB) to a song, e.g. scanned sheet music or lyric sheets; see [src/lib/songAttachments.ts](src/lib/songAttachments.ts)
- **Band logo upload** — set a band's logo, used across its press kit and public pages
- **Ad-hoc sharing** — per-resource collaboration invites for songs, songlists, and setlists
- **Multi-language** — songs in English, Norwegian, Spanish, Portuguese, French, Italian, German, and more
- **Add & edit songs** — live ChordPro preview while writing
- **Search & filter** — full-text search by title/artist/tag, filter by language
- **Data export** — download your whole songbook (personal + every band you belong to) as plain ChordPro files from account settings, no lock-in
- **Dark mode** — automatic system preference detection with manual toggle
- **Offline-capable PWA** — installable, works offline via a service worker; see [chunkRecovery.ts](src/lib/chunkRecovery.ts) for how it recovers from stale-deploy cache issues
- **Trash & restore** — soft-deleted songs, songlists, setlists, and press kits recover for 30 days before permanent deletion
- **No plan gating** — every account gets full feature access; there's no paid tier to unlock

## Tech stack

| Tool | Purpose |
|---|---|
| React 18 + TypeScript | UI |
| Vite 7 | Build tooling |
| React Router 7 | Client-side routing |
| Express + Postgres (Drizzle ORM) | API server & data storage |
| Docker Compose | Deployment |
| lucide-react | Icons |
| Web MediaRecorder API | In-browser audio recording |

## Quick start (self-hosting)

Gigboy is meant to be run via Docker Compose — see **[SELFHOSTING.md](SELFHOSTING.md)** for the
full setup guide, including the admin account bootstrap and invite-link flow used to add users
(there's no open self-registration).

```bash
cp .env.example .env
# fill in POSTGRES_PASSWORD, SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d --build
```

## Local development (without Docker)

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) for the frontend. The API server runs
separately — see the "Development (without Docker)" section of [SELFHOSTING.md](SELFHOSTING.md)
for running `server:dev` against a local Postgres instance.

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

Deployment is Docker Compose only — see [SELFHOSTING.md](SELFHOSTING.md) for the full guide,
including backups, updating, and the admin bootstrap/invite flow. There is no separate static
build/hosting path: the `app` container builds the frontend and serves it alongside the API from
the same origin.

## Project structure

```
src/
  components/     UI components (Layout, Sidebar, SongList, SongView, ChordDisplay, PressKitView, …)
  context/        SongsContext, SongListsContext, SetlistsContext, BandsContext, AuthContext
  hooks/          useAudioRecorder, useStorageUsage, useSongRecordings, …
  pages/          SongPage, AddSongPage, BandDetailPage, ProfilePage, AdminInvitesPage, TermsPage, PrivacyPage, …
  lib/            dataClient (REST API client), songbookExport (ChordPro export), chunkRecovery, …
  types/          Song, Setlist, SongList, Band, User types
  utils/          chordParser, languages
server/
  routes/         Express route handlers (auth, songs, bands, invites, press kits, …)
  db/             Drizzle schema, migrations, admin bootstrap
  lib/            Server-side helpers (band logos, hand notes, recordings, press-kit OG tags)
  middleware/     Session auth, admin gating
```

## Legal pages

Draft Terms of Service and Privacy Policy live at [src/pages/TermsPage.tsx](src/pages/TermsPage.tsx) and [src/pages/PrivacyPage.tsx](src/pages/PrivacyPage.tsx) (routes `/terms` and `/privacy`). They're templates with bracketed placeholders — fill those in and get them reviewed before relying on them, especially the copyright section (users store song lyrics/chords, which are often copyrighted material) and GDPR compliance if you have EU/EEA users.

## Before going public

- [ ] Fill in and legally review `/terms` and `/privacy`
- [ ] Set a strong `SESSION_SECRET` and `POSTGRES_PASSWORD` in `.env` (see [SELFHOSTING.md](SELFHOSTING.md))
- [ ] Put a reverse proxy with real HTTPS in front of the container and set `COOKIE_SECURE=true`
- [ ] Rotate any credentials embedded in local git remotes/config before adding collaborators or CI
- [ ] Test the offline/PWA experience end-to-end (load, go offline, reopen) before promoting it to gigging musicians

## Codebase knowledge graph

`graphify-out/graph.json` is a generated knowledge graph of this codebase (symbols/functions/components as nodes, relationships as edges), used by AI coding assistants to navigate the project faster than blind file search. Regenerate it after code changes with:

```bash
graphify update .
```

## License

MIT
