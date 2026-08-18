# Self-hosting Gigboy

Run your own copy of Gigboy on your own infrastructure with Docker — no Firebase, Stripe,
or Cloudflare account required.

> This build covers: email/password auth with full profile management (email/username/avatar/
> full name/password changes, account deletion); personal and band-owned songs, songlists, and
> setlists; bands with invite-link membership; band technical riders/stage plots with public
> share links; song PDF attachments (20MB cap); trash/soft-delete with 30-day retention; and
> band press kits (rich text, images, video/presave links, public share links) — all with full
> feature access (no plan gating). Not yet included: recordings, hand notes, band logo upload,
> OG-tag social previews, and ad-hoc per-resource sharing outside of bands.

## Prerequisites

- Docker and Docker Compose
- No other dependencies — Postgres runs as a container

## Setup

1. Copy the example env file:

   ```sh
   cp .env.selfhost.example .env.selfhost
   ```

2. Generate a session secret and set it in `.env.selfhost`:

   ```sh
   openssl rand -hex 32
   ```

3. Pick a Postgres password and set it as `POSTGRES_PASSWORD` in `.env.selfhost`, then make
   sure `DATABASE_URL` uses the same password (the example file's `DATABASE_URL` already
   points at the `postgres` service host used by Compose — just swap in your password).

4. Bring the stack up:

   ```sh
   docker compose --env-file .env.selfhost up -d --build
   ```

   **Using a GUI container tool instead of the CLI** (Synology/QNAP/UGREEN-style Docker
   apps, Portainer, etc.)? Docker Compose only auto-loads a file named exactly `.env` — the
   `--env-file .env.selfhost` flag above is how the CLI points at a differently-named file,
   but most GUI "import a compose project" features don't expose that flag and will fail
   with `required variable POSTGRES_PASSWORD is missing a value`. If that happens, copy your
   filled-in `.env.selfhost` to a plain `.env` in the same folder (`cp .env.selfhost .env` —
   `.env` is gitignored too) and deploy again.

   The `app` container waits for Postgres to report healthy, then runs pending database
   migrations automatically on every start (via `docker-entrypoint.sh`) before starting the
   server — so `docker compose up` is always enough, including on first run and after
   upgrades that add new migrations.

5. Open `http://localhost:3000` (or whatever `PORT` you set) and register an account.

   **Accessing over plain HTTP (no reverse proxy / no TLS)** — the default and common case for
   a home NAS or LAN deployment (e.g. `http://192.168.1.50:3000`) — session cookies are set
   *without* the `Secure` flag by default (`COOKIE_SECURE=false`), since a `Secure` cookie is
   silently dropped by the browser over plain HTTP: login would appear to succeed but every
   API call afterward would 401 with "Authentication required." Only set `COOKIE_SECURE=true`
   in `.env.selfhost` once you've put a reverse proxy in front of the container that terminates
   real HTTPS.

## Data persistence

Postgres data lives in the named Docker volume `gigboy-postgres-data`, and uploaded song
attachments live in `gigboy-attachments-data` (mounted at `/data/attachments` in the `app`
container). Both survive `docker compose down` and container restarts/rebuilds. They're only
removed if you explicitly run `docker compose down -v` or `docker volume rm <name>`.

## Backing up

Back up both volumes — the database and the attachment files are separate stores:

```sh
docker compose --env-file .env.selfhost exec postgres pg_dump -U gigboy gigboy > backup.sql
docker run --rm -v gigboy_gigboy-attachments-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/attachments-backup.tar.gz -C /data .
```

(The volume name may be prefixed differently depending on your Compose project name — run
`docker volume ls` to confirm the exact name if the command above doesn't find it.)

To restore into fresh volumes:

```sh
cat backup.sql | docker compose --env-file .env.selfhost exec -T postgres psql -U gigboy gigboy
docker run --rm -v gigboy_gigboy-attachments-data:/data -v "$PWD":/backup alpine \
  tar xzf /backup/attachments-backup.tar.gz -C /data
```

If you put a reverse proxy in front of the container (not part of the default Compose setup,
which exposes `PORT` directly), make sure its own request body size limit allows uploads up
to 20MB — Express itself already accepts them.

## Updating

```sh
git pull
docker compose --env-file .env.selfhost up -d --build
```

Migrations run automatically on startup, so new schema changes are applied before the app
serves traffic.

## Development (without Docker)

Run a local Postgres instance yourself, then:

```sh
export DATABASE_URL=postgres://gigboy:yourpassword@localhost:5432/gigboy
export SESSION_SECRET=$(openssl rand -hex 32)
npm run db:migrate
npm run server:dev
```

The server serves the API only in this mode — run `npm run dev` (Vite) separately for the
frontend during development, pointed at `VITE_BACKEND=selfhost`.
