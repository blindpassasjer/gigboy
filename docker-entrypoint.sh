#!/bin/sh
set -e

echo "Running database migrations..."
node dist-server/db/migrate.js

echo "Starting server..."
exec "$@"
