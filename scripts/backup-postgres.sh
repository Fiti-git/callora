#!/usr/bin/env bash
# Daily Postgres backup for Callora.
#
# Usage (cron, on the Docker host):
#   0 2 * * * /opt/callora/scripts/backup-postgres.sh >> /var/log/callora-backup.log 2>&1
#
# Requires the `db` service to be defined in docker-compose.yml (Callora default).
# Backups are gzipped pg_dump files placed under $BACKUP_DIR.
# Files older than $RETENTION_DAYS are deleted.
#
# Required env (export from cron or /etc/environment):
#   POSTGRES_USER     — DB username (default: postgres)
#   POSTGRES_DB       — DB name (default: callora)
#   BACKUP_DIR        — destination directory (default: /opt/callora/backups)
#   RETENTION_DAYS    — how many days of backups to keep (default: 14)
#
# Optional:
#   S3_BUCKET         — if set, also pushes the dump to s3://$S3_BUCKET/postgres/
#                       (requires aws CLI configured on the host)

set -euo pipefail

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-callora}"
BACKUP_DIR="${BACKUP_DIR:-/opt/callora/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/callora/docker-compose.yml}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/callora-${POSTGRES_DB}-${TIMESTAMP}.sql.gz"

echo "[$(date -u -Iseconds)] starting backup -> $OUT"

docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
    | gzip -9 > "$OUT"

# Verify the file is non-empty and at least looks like a gzip stream
if [[ ! -s "$OUT" ]]; then
    echo "[$(date -u -Iseconds)] ERROR: backup file is empty"
    exit 1
fi
gzip -t "$OUT"

SIZE=$(du -h "$OUT" | awk '{print $1}')
echo "[$(date -u -Iseconds)] backup OK ($SIZE)"

if [[ -n "${S3_BUCKET:-}" ]]; then
    echo "[$(date -u -Iseconds)] uploading to s3://$S3_BUCKET/postgres/"
    aws s3 cp "$OUT" "s3://$S3_BUCKET/postgres/$(basename "$OUT")" --only-show-errors
fi

# Cleanup old local backups
find "$BACKUP_DIR" -name 'callora-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date -u -Iseconds)] cleanup complete (retention: ${RETENTION_DAYS}d)"
