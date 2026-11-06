#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="$ROOT_DIR/backups/.backup.lock"
POSTGRES_DIR="${RESTOPASS_BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
PHOTOS_DIR="${RESTOPASS_PHOTO_BACKUP_DIR:-$ROOT_DIR/backups/patron-photos}"
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another backup or verification job is running." >&2; exit 1; }

manifest="$(find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'restopass_*.manifest' -printf '%f\n' | sort -r | head -n 1)"
[[ -n "$manifest" ]] || { echo "No paired backup manifest found." >&2; exit 1; }
timestamp="${manifest#restopass_}"; timestamp="${timestamp%.manifest}"
pg="$POSTGRES_DIR/restopass_$timestamp.dump.enc"
photos="$PHOTOS_DIR/restopass_photos_$timestamp.tar.gz.enc"
for file in "$pg" "$pg.sha256" "$pg.hmac" "$photos" "$photos.sha256" "$photos.hmac"; do
  [[ -s "$file" ]] || { echo "Paired backup artifact missing: $file" >&2; exit 1; }
done
echo "Verifying paired backup $timestamp..."
bash "$ROOT_DIR/deploy/verify-postgres-backup.sh" "$pg"
bash "$ROOT_DIR/deploy/verify-patron-photo-backup.sh" "$photos"
echo "Weekly paired backup recovery verification PASSED for $timestamp."
