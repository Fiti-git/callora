#!/usr/bin/env bash
# Restore a Callora Postgres backup created by backup-postgres.sh.
#
# Usage:
#   ./restore-postgres.sh /opt/callora/backups/callora-callora-20260101T020000Z.sql.gz
#
# WARNING: this drops and recreates the target database. Stop the app first:
#   docker compose stop backend frontend admin
#
# After restore:
#   docker compose start backend frontend admin

set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "usage: $0 <backup-file.sql.gz>" >&2
    exit 1
fi

BACKUP="$1"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-callora}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/callora/docker-compose.yml}"

if [[ ! -f "$BACKUP" ]]; then
    echo "ERROR: backup file not found: $BACKUP" >&2
    exit 1
fi

echo "About to RESTORE $BACKUP into database '$POSTGRES_DB'."
read -r -p "Type 'yes' to continue: " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "aborted"; exit 1; }

echo "Dropping and recreating $POSTGRES_DB..."
docker compose -f "$COMPOSE_FILE" exec -T db \
    psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";"
docker compose -f "$COMPOSE_FILE" exec -T db \
    psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\";"

echo "Restoring data..."
gunzip -c "$BACKUP" | docker compose -f "$COMPOSE_FILE" exec -T db \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Restore complete."
