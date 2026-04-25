# Songbook

A web-based music songbook that stores songs in **ChordPro** format, supports lyrics in multiple languages, and lets you record or attach audio to any song.

## Features

- **ChordPro lyrics** — chords displayed above lyrics with `[G]Amazing [C]grace` notation
- **Transpose** — shift all chords up or down by semitone in real time
- **Multi-language** — songs in English, Norwegian, Spanish, Portuguese, French, Italian, German, and more
- **Audio recording** — record directly in the browser using the microphone; recordings are saved in `localStorage`
- **Add songs** — live ChordPro preview while writing; songs are persisted in `localStorage`
- **Search & filter** — full-text search by title/artist/tag, and filter by language
- **GitHub Pages ready** — static build with `vite`, no backend required

## Tech stack

| Tool | Purpose |
|---|---|
| React 18 + TypeScript | UI |
| Vite 4 | Build tooling |
| React Router 6 | Client-side routing |
| lucide-react | Icons |
| `localStorage` | Song & recording persistence |
| Web MediaRecorder API | Audio recording |

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Copy `.env.example` to `.env` and fill in the Firebase values before running locally.

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
3. Write (or paste) ChordPro lyrics in the editor — toggle **Preview** to see the rendered result.
4. Click **Save Song** — the song is stored in `localStorage` and you're taken straight to the song view.

## Deploying

Build the project and deploy the `dist/` folder to any static host (Cloudflare Pages, Netlify, Vercel, etc.):

```bash
npm run build
# then upload / point your host at the dist/ folder
```

For Cloudflare Pages direct deploys, use:

```bash
npm run deploy:pages
```

For Workers static assets deploys, use:

```bash
npm run deploy
```

For Cloudflare deploys, add these variables to your project build environment:

```bash
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

If those variables are missing, the deployed app now falls back to local-only mode and still shows the built-in songs.

If you are deploying from the Cloudflare Pages dashboard, set build command `npm run build` and output directory `dist`.

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
