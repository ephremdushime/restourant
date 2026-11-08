#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
LOCK_FILE="$ROOT_DIR/backups/.backup.lock"
POSTGRES_DIR="${RESTOPASS_BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
PHOTOS_DIR="${RESTOPASS_PHOTO_BACKUP_DIR:-$ROOT_DIR/backups/patron-photos}"
TIMESTAMP="${RESTOPASS_BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE"
[[ "$TIMESTAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || fail "Invalid backup timestamp."
command -v rclone >/dev/null 2>&1 || fail "rclone is required for Google Drive off-site backups."
command -v flock >/dev/null 2>&1 || fail "flock is required to prevent overlapping backup/verification jobs."

env_value() {
  local name="$1" line value
  line="$(grep -E "^(${name})=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"; value="${value%$'\r'}"
  if [[ "$value" == \"* ]]; then value="${value:1:${#value}-2}"
  elif [[ "$value" == \'* ]]; then value="${value:1:${#value}-2}"; fi
  printf '%s' "$value"
}

POSTGRES_DIR="${RESTOPASS_BACKUP_DIR:-$(env_value RESTOPASS_BACKUP_DIR)}"
POSTGRES_DIR="${POSTGRES_DIR:-$ROOT_DIR/backups/postgres}"
PHOTOS_DIR="${RESTOPASS_PHOTO_BACKUP_DIR:-$(env_value RESTOPASS_PHOTO_BACKUP_DIR)}"
PHOTOS_DIR="${PHOTOS_DIR:-$ROOT_DIR/backups/patron-photos}"

export RESTOPASS_BACKUP_ENCRYPTION_KEY="${RESTOPASS_BACKUP_ENCRYPTION_KEY:-$(env_value RESTOPASS_BACKUP_ENCRYPTION_KEY)}"
DRIVE_REMOTE="${RESTOPASS_GOOGLE_DRIVE_REMOTE:-$(env_value RESTOPASS_GOOGLE_DRIVE_REMOTE)}"
RCLONE_CONFIG_FILE="${RCLONE_CONFIG:-$(env_value RCLONE_CONFIG)}"
RCLONE_CONFIG_FILE="${RCLONE_CONFIG_FILE:-$HOME/.config/rclone/rclone.conf}"
[[ "$RESTOPASS_BACKUP_ENCRYPTION_KEY" =~ ^[A-Fa-f0-9]{64}$ ]] || fail "Set RESTOPASS_BACKUP_ENCRYPTION_KEY to a 64-character random hex key."
[[ -n "$DRIVE_REMOTE" && "$DRIVE_REMOTE" == *:* ]] || fail "Set RESTOPASS_GOOGLE_DRIVE_REMOTE to a configured rclone Drive remote, e.g. restopass-drive:restopass-backups."
[[ -s "$RCLONE_CONFIG_FILE" ]] || fail "rclone config not found at $RCLONE_CONFIG_FILE; configure OAuth for the dedicated Google account."
export RCLONE_CONFIG="$RCLONE_CONFIG_FILE"

mkdir -p "$(dirname "$LOCK_FILE")"
chmod 700 "$ROOT_DIR/backups" "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "Another backup or restore verification job is already running."
export RESTOPASS_BACKUP_TIMESTAMP="$TIMESTAMP"

echo "Creating paired PostgreSQL and private-photo backups for $TIMESTAMP..."
bash "$ROOT_DIR/deploy/backup-postgres.sh"
bash "$ROOT_DIR/deploy/backup-patron-photos.sh"

pg="$POSTGRES_DIR/restopass_$TIMESTAMP.dump.enc"
photos="$PHOTOS_DIR/restopass_photos_$TIMESTAMP.tar.gz.enc"
for file in "$pg" "$pg.sha256" "$pg.hmac" "$photos" "$photos.sha256" "$photos.hmac"; do
  [[ -s "$file" ]] || fail "Expected paired backup artifact is missing: $file"
done
(cd "$(dirname "$pg")" && sha256sum -c "$(basename "$pg").sha256") || fail "PostgreSQL checksum failed."
pg_hmac_key="$(printf 'RESTOPASS_BACKUP_HMAC:%s' "$RESTOPASS_BACKUP_ENCRYPTION_KEY" | sha256sum | awk '{print $1}')"
pg_expected="$(tr -d '[:space:]' < "$pg.hmac")"
pg_actual="$(openssl dgst -sha256 -hmac "$pg_hmac_key" "$pg" | awk '{print $NF}')"
[[ "$pg_expected" == "$pg_actual" ]] || fail "PostgreSQL HMAC verification failed."
source "$ROOT_DIR/deploy/lib/photo-backup.sh"
verify_photo_backup "$photos" "$RESTOPASS_BACKUP_ENCRYPTION_KEY" || fail "Private-photo integrity verification failed."

manifest="$ROOT_DIR/backups/restopass_$TIMESTAMP.manifest"
cat > "$manifest" <<EOF
format=restopass-paired-backup-v1
timestamp=$TIMESTAMP
postgres=postgres/restopass_$TIMESTAMP.dump.enc
photos=patron-photos/restopass_photos_$TIMESTAMP.tar.gz.enc
EOF
chmod 600 "$manifest"

date_path="${TIMESTAMP:0:4}/${TIMESTAMP:4:2}/${TIMESTAMP:6:2}/$TIMESTAMP"
remote="$DRIVE_REMOTE/${date_path%/}"
upload() {
  local source="$1" destination="$2" downloaded="$3"
  rclone copyto "$source" "$destination" --config "$RCLONE_CONFIG_FILE" --drive-use-trash=false || fail "Google Drive upload failed: $source"
  rclone copyto "$destination" "$downloaded" --config "$RCLONE_CONFIG_FILE" || fail "Google Drive read-back failed: $destination"
  cmp -s "$source" "$downloaded" || fail "Google Drive read-back differs from source: $source"
}
verify_dir="$(mktemp -d "${TMPDIR:-/tmp}/restopass-drive-upload.XXXXXX")"
chmod 700 "$verify_dir"
trap 'rm -rf "$verify_dir"' EXIT
for file in "$pg" "$pg.sha256" "$pg.hmac"; do upload "$file" "$remote/postgres/$(basename "$file")" "$verify_dir/$(basename "$file")"; done
for file in "$photos" "$photos.sha256" "$photos.hmac"; do upload "$file" "$remote/patron-photos/$(basename "$file")" "$verify_dir/$(basename "$file")"; done
# Completion manifest is uploaded last; its presence marks a complete paired backup.
upload "$manifest" "$remote/restopass_$TIMESTAMP.manifest" "$verify_dir/restopass_$TIMESTAMP.manifest"

retention_days="${RESTOPASS_BACKUP_RETENTION_DAYS:-$(env_value RESTOPASS_BACKUP_RETENTION_DAYS)}"
retention_days="${retention_days:-30}"
[[ "$retention_days" =~ ^[0-9]+$ ]] && (( retention_days >= 1 )) || fail "RESTOPASS_BACKUP_RETENTION_DAYS must be positive."
find "$POSTGRES_DIR" -type f \( -name 'restopass_*.dump.enc' -o -name 'restopass_*.dump.enc.sha256' -o -name 'restopass_*.dump.enc.hmac' \) -mtime +"$retention_days" -delete
find "$PHOTOS_DIR" -type f \( -name 'restopass_photos_*.tar.gz.enc' -o -name 'restopass_photos_*.tar.gz.enc.sha256' -o -name 'restopass_photos_*.tar.gz.enc.hmac' \) -mtime +"$retention_days" -delete
find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'restopass_*.manifest' -mtime +"$retention_days" -delete

# Apply the same retention window to the dedicated RestoPass Google Drive backup root.
# The completion manifest is retained with its paired artifacts until the age cutoff.
rclone delete "$DRIVE_REMOTE" --min-age "${retention_days}d" --drive-use-trash=false --config "$RCLONE_CONFIG_FILE" || fail "Google Drive retention cleanup failed."
rclone rmdirs "$DRIVE_REMOTE" --leave-root --config "$RCLONE_CONFIG_FILE" || fail "Google Drive empty-directory cleanup failed."

echo "Paired encrypted backup uploaded, read-back verified, and remote retention enforced in Google Drive."
echo "Timestamp: $TIMESTAMP"
echo "Remote: $remote/"
echo "Completion manifest: $remote/restopass_$TIMESTAMP.manifest"
