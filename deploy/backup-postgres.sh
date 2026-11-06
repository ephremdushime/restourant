#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

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

BACKUP_ENCRYPTION_KEY="${RESTOPASS_BACKUP_ENCRYPTION_KEY:-}"
if [[ -z "$BACKUP_ENCRYPTION_KEY" ]]; then
  BACKUP_ENCRYPTION_KEY="$(sed -n 's/^RESTOPASS_BACKUP_ENCRYPTION_KEY=//p' "$ENV_FILE" | head -n 1 | tr -d '"\r')"
fi
if ! [[ "$BACKUP_ENCRYPTION_KEY" =~ ^[A-Fa-f0-9]{64}$ ]]; then
  echo "RESTOPASS_BACKUP_ENCRYPTION_KEY must be a 64-character random hex key (generate with: openssl rand -hex 32)." >&2
  exit 1
fi
export RESTOPASS_BACKUP_ENCRYPTION_KEY="$BACKUP_ENCRYPTION_KEY"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/restopass_$timestamp.dump.enc"
temporary_file="$backup_file.partial"

compose=(docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

cleanup() {
  rm -f "$temporary_file"
}
trap cleanup EXIT

echo "Creating PostgreSQL custom-format backup..."
"${compose[@]}" exec -T postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY \
  > "$temporary_file"

if [[ ! -s "$temporary_file" ]]; then
  echo "Backup output is empty; refusing to mark backup successful." >&2
  exit 1
fi

mv "$temporary_file" "$backup_file"
chmod 600 "$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"
chmod 600 "$backup_file.sha256"

find "$BACKUP_DIR" -type f \( -name 'restopass_*.dump.enc' -o -name 'restopass_*.dump.enc.sha256' \) \
  -mtime +"$RETENTION_DAYS" -delete

echo "Backup completed: $backup_file"
echo "Checksum: $backup_file.sha256"
echo "Retention: $RETENTION_DAYS days"
echo "Backup is encrypted at rest. Copy it and its checksum to a separate off-server location."
