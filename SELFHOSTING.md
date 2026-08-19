# Self-hosting Gigboy

Gigboy is self-hosted only: run your own copy on your own infrastructure with Docker Compose.
There is no hosted SaaS version, and no third-party account (Firebase, Stripe, Cloudflare) is
involved anywhere in the stack — it's just this app, a Postgres database, and a volume for
uploaded files.

> This build covers: email/password auth with full profile management (email/username/avatar/
> full name/password changes, account deletion); personal and band-owned songs, songlists, and
> setlists; bands with invite-link membership; band technical riders/stage plots with public
> share links; song PDF attachments (20MB cap); song hand notes and recordings; band logo
> upload; OG-tag social previews; per-resource collaboration invites; trash/soft-delete with
> 30-day retention; and band press kits (rich text, images, video/presave links, public share
> links) — all with full feature access (no plan gating).

## Prerequisites

- Docker and Docker Compose
- No other dependencies — Postgres runs as a container

## Setup

1. Copy the example env file:

   ```sh
   cp .env.example .env
   ```

2. Generate a session secret and set it in `.env`:

   ```sh
   openssl rand -hex 32
   ```

3. Pick a Postgres password and set it as `POSTGRES_PASSWORD` in `.env`, then make
   sure `DATABASE_URL` uses the same password (the example file's `DATABASE_URL` already
   points at the `postgres` service host used by Compose — just swap in your password).

4. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` — see [Admin account and invites](#admin-account-and-invites)
   below. Set both, or leave both unset if an admin already exists from a previous run.

5. Bring the stack up:

   ```sh
   docker compose up -d --build
   ```

   Docker Compose auto-loads `.env` from the project directory — no `--env-file` flag needed,
   whether you're using the CLI or a GUI container tool (Synology/QNAP/UGREEN-style Docker
   apps, Portainer, etc.).

   The `app` container waits for Postgres to report healthy, then runs pending database
   migrations and bootstraps the admin account (if configured) automatically on every start
   (via `docker-entrypoint.sh`) before starting the server — so `docker compose up` is always
   enough, including on first run and after upgrades that add new migrations.

6. Open `http://localhost:6168` (or whatever `PORT` you set) and log in as the admin account
   you configured in step 4. There is no open self-registration — every other account is
   created by an admin generating an invite link (see below).

   **Accessing over plain HTTP (no reverse proxy / no TLS)** — the default and common case for
   a home NAS or LAN deployment (e.g. `http://192.168.1.50:6168`) — session cookies are set
   *without* the `Secure` flag by default (`COOKIE_SECURE=false`), since a `Secure` cookie is
   silently dropped by the browser over plain HTTP: login would appear to succeed but every
   API call afterward would 401 with "Authentication required." Only set `COOKIE_SECURE=true`
   in `.env` once you've put a reverse proxy in front of the container that terminates
   real HTTPS.

## Admin account and invites

Gigboy has no open self-registration. The first account is bootstrapped from environment
variables, and every account after that is created by an admin generating an invite link.

**Bootstrapping the first admin** — set both `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`
before running `docker compose up` for the first time. On startup, `docker-entrypoint.sh` runs
pending migrations and then a bootstrap step that creates the admin account if it doesn't
already exist (matched by email) and leaves it untouched if it does — safe to leave the
variables set across restarts. Setting only one of the two is a startup error. Leave both
unset once the admin account exists from a previous run.

**Inviting new users** — log in as an admin and open the shield icon in the top bar
(`/admin/invites`) to generate invite links: optionally pin an invite to one email address,
choose whether the new account should be an admin or a regular member, and create the link.
Copy it (it's copied to your clipboard automatically) and share it with the person you're
inviting — they open it at `/invite/<token>` to set a username and password and create their
account. Links expire after 7 days and can be revoked from the same page before they're used.

## Data persistence

Postgres data lives in the named Docker volume `gigboy-postgres-data`, and uploaded song
attachments live in `gigboy-attachments-data` (mounted at `/data/attachments` in the `app`
container). Both survive `docker compose down` and container restarts/rebuilds. They're only
removed if you explicitly run `docker compose down -v` or `docker volume rm <name>`.

## Backing up

Back up both volumes — the database and the attachment files are separate stores:

```sh
docker compose exec postgres pg_dump -U gigboy gigboy > backup.sql
docker run --rm -v gigboy_gigboy-attachments-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/attachments-backup.tar.gz -C /data .
```

(The volume name may be prefixed differently depending on your Compose project name — run
`docker volume ls` to confirm the exact name if the command above doesn't find it.)

To restore into fresh volumes:

```sh
cat backup.sql | docker compose exec -T postgres psql -U gigboy gigboy
docker run --rm -v gigboy_gigboy-attachments-data:/data -v "$PWD":/backup alpine \
  tar xzf /backup/attachments-backup.tar.gz -C /data
```

If you put a reverse proxy in front of the container (not part of the default Compose setup,
which exposes `PORT` directly), make sure its own request body size limit allows uploads up
to 20MB — Express itself already accepts them.

## Updating

```sh
git pull
docker compose up -d --build
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

This starts the API only, listening on `PORT` (default 6168). Run `npm run dev` (Vite) separately
for the frontend during development — it serves on its own port (5173 by default) and calls the
API via relative `/api/...` requests, so use a reverse proxy (or open the Vite dev server through
one) if you need both running against a single origin; otherwise `npm run build` + `npm run
server:dev` serves the built frontend and API together from the same origin/port.
