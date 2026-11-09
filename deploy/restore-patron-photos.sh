#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.prod.yml"
BACKUP_FILE="${1:-}"
source "$ROOT_DIR/deploy/lib/photo-backup.sh"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: bash deploy/restore-patron-photos.sh /path/to/restopass_photos_YYYYMMDDTHHMMSSZ.tar.gz.enc" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi
BACKUP_ENCRYPTION_KEY="$(photo_backup_key "$ROOT_DIR")"
export RESTOPASS_BACKUP_ENCRYPTION_KEY="$BACKUP_ENCRYPTION_KEY"
verify_photo_backup "$BACKUP_FILE" "$BACKUP_ENCRYPTION_KEY"

RESTORE_ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/restopass-photos-restore.XXXXXX.tar.gz")"
chmod 600 "$RESTORE_ARCHIVE"
cleanup() { rm -f "$RESTORE_ARCHIVE"; }
trap cleanup EXIT

echo "Decrypting and validating the private photo archive..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY -in "$BACKUP_FILE" -out "$RESTORE_ARCHIVE"
validate_photo_archive "$RESTORE_ARCHIVE"

compose=(docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
echo "Restoring into the app_data volume using a staged directory swap..."
"${compose[@]}" exec -T app sh -ec '
  base=/app/data/private
  target="$base/patron-photos"
  stage="$base/.patron-photos-restore"
  previous="$base/.patron-photos-previous"
  rm -rf "$stage" "$previous"
  mkdir -m 700 "$stage"
  rollback() {
    if [ -d "$previous" ] && [ ! -d "$target" ]; then mv "$previous" "$target"; fi
    rm -rf "$stage"
  }
  trap rollback EXIT HUP INT TERM
  tar -xzf - --no-same-owner --no-same-permissions -C "$stage"
  test -d "$stage/patron-photos"
  find "$stage/patron-photos" -type d -exec chmod 700 {} +
  find "$stage/patron-photos" -type f -exec chmod 600 {} +
  if [ -e "$target" ]; then mv "$target" "$previous"; fi
  mv "$stage/patron-photos" "$target"
  rm -rf "$previous" "$stage"
  trap - EXIT HUP INT TERM
' < "$RESTORE_ARCHIVE"

echo "Private patron photos restored. Existing photo directory was replaced only after archive validation."
