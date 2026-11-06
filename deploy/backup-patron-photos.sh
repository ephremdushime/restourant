#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.prod.yml"
BACKUP_DIR="${RESTOPASS_PHOTO_BACKUP_DIR:-$ROOT_DIR/backups/patron-photos}"
RETENTION_DAYS="${RESTOPASS_BACKUP_RETENTION_DAYS:-14}"
source "$ROOT_DIR/deploy/lib/photo-backup.sh"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Configure production secrets before backing up." >&2
  exit 1
fi
if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 )); then
  echo "RESTOPASS_BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 1
fi
BACKUP_ENCRYPTION_KEY="$(photo_backup_key "$ROOT_DIR")"
export RESTOPASS_BACKUP_ENCRYPTION_KEY="$BACKUP_ENCRYPTION_KEY"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
timestamp="${RESTOPASS_BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
if ! [[ "$timestamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then echo "Invalid RESTOPASS_BACKUP_TIMESTAMP." >&2; exit 1; fi
backup_file="$BACKUP_DIR/restopass_photos_$timestamp.tar.gz.enc"
temporary_file="$backup_file.partial"
compose=(docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
cleanup() { rm -f "$temporary_file"; }
trap cleanup EXIT

echo "Archiving private patron photos from the persistent app_data volume..."
"${compose[@]}" exec -T app sh -ec \
  'test -d /app/data/private/patron-photos && tar -czf - -C /app/data/private patron-photos' \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY > "$temporary_file"

if [[ ! -s "$temporary_file" ]]; then
  echo "Photo backup output is empty; refusing to mark backup successful." >&2
  exit 1
fi
mv "$temporary_file" "$backup_file"
chmod 600 "$backup_file"
write_photo_backup_metadata "$backup_file" "$BACKUP_ENCRYPTION_KEY"

find "$BACKUP_DIR" -type f \\( -name 'restopass_photos_*.tar.gz.enc' -o -name 'restopass_photos_*.tar.gz.enc.sha256' -o -name 'restopass_photos_*.tar.gz.enc.hmac' \\) -mtime +"$RETENTION_DAYS" -delete

echo "Private photo backup completed: $backup_file"
echo "Checksum: $backup_file.sha256"
echo "Authentication tag: $backup_file.hmac"
echo "Retention: $RETENTION_DAYS days"
echo "Copy all three files off-server; keep the encryption key separately."
