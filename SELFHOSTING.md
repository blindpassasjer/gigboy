# Self-hosting Gigboy

Run your own copy of Gigboy on your own infrastructure with Docker — no Firebase, Stripe,
or Cloudflare account required.

> This build covers: email/password auth; personal and band-owned songs, songlists, and
> setlists; bands with invite-link membership; band technical riders/stage plots with public
> share links; and song PDF attachments (20MB cap) — all with full feature access (no plan
> gating). Not yet included: press kits, recordings, hand notes, trash/soft-delete (deletes
> are permanent), account deletion, and ad-hoc per-resource sharing outside of bands.

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

   The `app` container waits for Postgres to report healthy, then runs pending database
   migrations automatically on every start (via `docker-entrypoint.sh`) before starting the
   server — so `docker compose up` is always enough, including on first run and after
   upgrades that add new migrations.

5. Open `http://localhost:3000` (or whatever `PORT` you set) and register an account.

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
