#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.prod.yml"
BACKUP_DIR="${RESTOPASS_BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
RETENTION_DAYS="${RESTOPASS_BACKUP_RETENTION_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Configure production secrets before backing up." >&2
  exit 1
fi
if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 )); then
  echo "RESTOPASS_BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/restopass_$timestamp.dump"
temporary_file="$backup_file.partial"

compose=(docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

cleanup() {
  rm -f "$temporary_file"
}
trap cleanup EXIT

echo "Creating PostgreSQL custom-format backup..."
"${compose[@]}" exec -T postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$temporary_file"

if [[ ! -s "$temporary_file" ]]; then
  echo "Backup output is empty; refusing to mark backup successful." >&2
  exit 1
fi

mv "$temporary_file" "$backup_file"
chmod 600 "$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"
chmod 600 "$backup_file.sha256"

find "$BACKUP_DIR" -type f \( -name 'restopass_*.dump' -o -name 'restopass_*.dump.sha256' \) \
  -mtime +"$RETENTION_DAYS" -delete

echo "Backup completed: $backup_file"
echo "Checksum: $backup_file.sha256"
echo "Retention: $RETENTION_DAYS days"
echo "IMPORTANT: copy this backup and checksum to encrypted off-server storage."
