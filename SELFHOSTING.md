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

5. (Optional, recommended before sharing the instance widely) Set `OPERATOR_NAME`,
   `OPERATOR_CONTACT_EMAIL`, and `OPERATOR_JURISDICTION` in `.env`. These fill in the
   operator name, contact address, and governing-law jurisdiction on the built-in
   `/terms` and `/privacy` pages; unset values fall back to generic wording.

6. Bring the stack up:

   ```sh
   docker compose pull
   docker compose up -d
   ```

   This pulls the prebuilt `app` image from GHCR instead of compiling it on your device. On a
   NAS or other low-power hardware, building the image in place (`--build`) runs a full
   Node/Vite/TypeScript build inside the container and can spike CPU/RAM enough to make the
   Docker engine or container manager UI become unresponsive — pulling the prebuilt image
   avoids that entirely. Only use `--build` if you're developing locally on a machine with
   plenty of RAM, or have modified the source and want to build your own image.

   The GHCR package (`ghcr.io/blindpassasjer/gigboy`) is public, so `docker compose pull`
   works with no login on the NAS.

   Docker Compose auto-loads `.env` from the project directory — no `--env-file` flag needed,
   whether you're using the CLI or a GUI container tool (Synology/QNAP/UGREEN-style Docker
   apps, Portainer, etc.).

   The `app` container waits for Postgres to report healthy, then runs pending database
   migrations and bootstraps the admin account (if configured) automatically on every start
   (via `docker-entrypoint.sh`) before starting the server — so `docker compose up` is always
   enough, including on first run and after upgrades that add new migrations.

7. Open `http://localhost:6168` (or whatever `PORT` you set) and log in as the admin account
   you configured in step 4. There is no open self-registration — every other account is
   created by an admin generating an invite link (see below).

   **Accessing over plain HTTP (no reverse proxy / no TLS)** — the default and common case for
   a home NAS or LAN deployment (e.g. `http://192.168.1.50:6168`) — session cookies are set
   *without* the `Secure` flag by default (`COOKIE_SECURE=false`), since a `Secure` cookie is
   silently dropped by the browser over plain HTTP: login would appear to succeed but every
   API call afterward would 401 with "Authentication required." Only set `COOKIE_SECURE=true`
   in `.env` once you've put a reverse proxy in front of the container that terminates
   real HTTPS.

   **When you do put a reverse proxy in front**, also set two more variables in `.env`:
   - `PUBLIC_ORIGIN` — the canonical public URL of the instance, e.g.
     `https://gigboy.example.com` (scheme + host, no trailing slash). This is used to build
     invite links, press-kit share URLs and social-preview tags. Without it those URLs are
     derived from the incoming `Host` header, which a client can forge.
   - `TRUST_PROXY` — set to `1` for a single proxy hop (or a subnet/list per Express's
     "trust proxy" docs). The auth rate limiter keys on the client IP; behind a proxy with
     this left at its default (`false`) every request looks like it comes from the proxy, so
     one abuser trips the limit for everyone. Leave it `false` when the container is exposed
     directly — setting `1` without a real proxy lets clients spoof their IP.

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
then create the link. Every invite creates a regular member — there's no admin choice at
invite time, since band ownership is unconditional (whoever creates a band owns it) and has
nothing to do with site-wide admin access. Copy the link (it's copied to your clipboard
automatically) and share it with the person you're inviting — they open it at
`/invite/<token>` to set a username and password and create their account. Links expire after
7 days and can be revoked from the same page before they're used.

**Promoting/demoting admins** — on the Users tab (`/admin/users`), each user (other than
yourself) has a "Make admin" / "Remove admin" button to grant or revoke site-wide admin access
(inviting users, managing storage quotas, deleting accounts). You can't change your own role
this way, and the last remaining admin can't be demoted — ask another admin, or promote someone
else first.

**Managing storage quotas** — the "Users" tab next to Invites (`/admin/users`) lists every
account with the storage used across bands they own, and lets an admin set (or reset to the
5GB default) each user's storage quota. Uploads (attachments, recordings, press kit images,
band logos) that would push a band's total usage past the uploading user's quota are rejected
server-side.

## Data persistence

Postgres data lives in `./data/postgres`, and uploaded song attachments live in
`./data/attachments` (mounted at `/data/attachments` in the `app` container) — both are
bind-mounted host folders next to your `docker-compose.yml`, not named Docker volumes. Both
survive `docker compose down` and container restarts/rebuilds; they're only removed if you
delete the `data/` folder yourself.

Note: Postgres runs as the `PUID`/`PGID` set in `.env` (defaults to `999:999`, the built-in
`postgres` user), and `./data/postgres` needs to be owned by that same UID/GID on the host —
Compose creates the folder on first run, but as `root`, so Postgres will fail to start with a
permissions error unless you fix ownership first:

```sh
mkdir -p data/postgres data/attachments
chown -R 999:999 data/postgres   # or your custom PUID:PGID if you changed it in .env
```

If you'd rather Postgres's files be owned by your own host user (so you can browse/back them up
without `sudo`), set `PUID`/`PGID` in `.env` to your `id -u`/`id -g` and `chown` accordingly
before the first `docker compose up`.

## Backing up

Back up both folders — the database and the attachment files are separate stores:

```sh
docker compose exec postgres pg_dump -U gigboy gigboy > backup.sql
tar czf attachments-backup.tar.gz -C data/attachments .
```

To restore:

```sh
cat backup.sql | docker compose exec -T postgres psql -U gigboy gigboy
tar xzf attachments-backup.tar.gz -C data/attachments
```

If you put a reverse proxy in front of the container (not part of the default Compose setup,
which exposes `PORT` directly), make sure its own request body size limit allows uploads up
to 20MB — Express itself already accepts them.

The setlist "now playing" sync uses Server-Sent Events on
`/api/bands/*/setlists/*/session/stream`. If your proxy buffers responses (nginx does by
default), followers' screens will lag or not update — disable buffering for that path, e.g.
nginx `proxy_buffering off;` (Gigboy already sends `X-Accel-Buffering: no`, which nginx
honours) and make sure the proxy read timeout is longer than the 25s keepalive.

## Updating

```sh
git pull
docker compose pull
docker compose up -d
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
