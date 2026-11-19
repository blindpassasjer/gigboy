#!/usr/bin/env bash
# Gigboy backup/restore for the Docker Compose setup.
#
#   scripts/backup.sh backup [DIR]        write DIR/gigboy-<timestamp>/{db.sql.gz,attachments.tar.gz}
#   scripts/backup.sh restore BACKUP_DIR  restore both from a backup folder (replaces current data!)
#
# DIR defaults to ./backups. Set KEEP=N to prune all but the newest N backups after a backup
# (default: keep everything). Run it from the folder that holds docker-compose.yml, e.g. from cron:
#   0 3 * * *  cd /path/to/gigboy && KEEP=14 scripts/backup.sh backup
set -euo pipefail

compose=${COMPOSE:-docker compose}
attachments_dir=${ATTACHMENTS_HOST_DIR:-data/attachments}

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

backup() {
  local root=${1:-backups} stamp dest n=1
  stamp=$(date +%Y%m%d-%H%M%S)
  mkdir -p "$root"
  # Build in a hidden staging folder and only move it into place once every step has succeeded,
  # so a failed run never leaves (or overwrites) something that looks like a good backup.
  stage=$(mktemp -d "$root/.partial.XXXXXX")
  trap 'rm -rf "${stage:-}"' EXIT

  # --clean --if-exists makes the dump restorable over an existing database.
  $compose exec -T postgres pg_dump -U gigboy --clean --if-exists gigboy | gzip > "$stage/db.sql.gz"
  # An empty or truncated dump means pg_dump failed.
  if [ "$(gzip -dc "$stage/db.sql.gz" | wc -c)" -lt 100 ]; then
    echo "pg_dump produced no data; backup aborted." >&2
    exit 1
  fi

  mkdir -p "$attachments_dir"
  tar czf "$stage/attachments.tar.gz" -C "$attachments_dir" .

  dest="$root/gigboy-$stamp"
  while [ -e "$dest" ]; do n=$((n + 1)); dest="$root/gigboy-$stamp-$n"; done
  mv "$stage" "$dest"
  trap - EXIT

  if [ -n "${KEEP:-}" ]; then
    # Folder names sort chronologically; drop everything older than the newest $KEEP.
    ls -1d "$root"/gigboy-* | sort -rV | tail -n +"$((KEEP + 1))" | xargs -r rm -rf
  fi
  echo "Backup written to $dest"
}

restore() {
  local src=${1:-}
  [ -n "$src" ] || usage
  [ -f "$src/db.sql.gz" ] && [ -f "$src/attachments.tar.gz" ] || { echo "Not a Gigboy backup folder: $src" >&2; exit 1; }
  # Fail on a corrupt archive before touching anything.
  gzip -t "$src/db.sql.gz" && gzip -t "$src/attachments.tar.gz"

  if [ "${YES:-}" != "1" ]; then
    read -r -p "This replaces the current database and attachments with $src. Continue? [y/N] " answer
    [ "$answer" = "y" ] || { echo "Aborted."; exit 1; }
  fi

  gzip -dc "$src/db.sql.gz" | $compose exec -T postgres psql -v ON_ERROR_STOP=1 -U gigboy gigboy
  mkdir -p "$attachments_dir"
  tar xzf "$src/attachments.tar.gz" -C "$attachments_dir"
  echo "Restored from $src. Restart the app if it is running: $compose restart app"
}

case "${1:-}" in
  backup) shift; backup "$@" ;;
  restore) shift; restore "$@" ;;
  -h|--help) usage 0 ;;
  *) usage ;;
esac
