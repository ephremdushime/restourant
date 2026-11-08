#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
LOCK_FILE="$ROOT_DIR/backups/.backup.lock"
command -v rclone >/dev/null 2>&1 || { echo "rclone is required for Google Drive recovery verification." >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another backup or verification job is running." >&2; exit 1; }

env_value() {
  local name="$1" line value
  line="$(grep -E "^(${name})=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"; value="${value%$'\r'}"
  if [[ "$value" == \"* ]]; then value="${value:1:${#value}-2}"
  elif [[ "$value" == \'* ]]; then value="${value:1:${#value}-2}"; fi
  printf '%s' "$value"
}
DRIVE_REMOTE="${RESTOPASS_GOOGLE_DRIVE_REMOTE:-$(env_value RESTOPASS_GOOGLE_DRIVE_REMOTE)}"
RCLONE_CONFIG_FILE="${RCLONE_CONFIG:-$(env_value RCLONE_CONFIG)}"
RCLONE_CONFIG_FILE="${RCLONE_CONFIG_FILE:-$HOME/.config/rclone/rclone.conf}"
[[ -n "$DRIVE_REMOTE" && "$DRIVE_REMOTE" == *:* && -s "$RCLONE_CONFIG_FILE" ]] || { echo "Configure RESTOPASS_GOOGLE_DRIVE_REMOTE and rclone OAuth first." >&2; exit 1; }

manifest="$(find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'restopass_*.manifest' -printf '%f\n' | sort -r | head -n 1)"
[[ -n "$manifest" ]] || { echo "No local paired backup manifest found." >&2; exit 1; }
timestamp="${manifest#restopass_}"; timestamp="${timestamp%.manifest}"
date_path="${timestamp:0:4}/${timestamp:4:2}/${timestamp:6:2}/$timestamp"
remote="$DRIVE_REMOTE/$date_path"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/restopass-drive-verify.XXXXXX")"
chmod 700 "$temporary"
trap 'rm -rf "$temporary"' EXIT
mkdir -m 700 "$temporary/postgres" "$temporary/patron-photos"
export RCLONE_CONFIG="$RCLONE_CONFIG_FILE"

echo "Downloading paired Google Drive backup $timestamp for isolated recovery verification..."
rclone copyto "$remote/restopass_$timestamp.manifest" "$temporary/restopass_$timestamp.manifest" --config "$RCLONE_CONFIG_FILE"
cmp -s "$ROOT_DIR/backups/$manifest" "$temporary/restopass_$timestamp.manifest" || { echo "Off-site completion manifest does not match the verified local marker." >&2; exit 1; }
for name in "restopass_$timestamp.dump.enc" "restopass_$timestamp.dump.enc.sha256" "restopass_$timestamp.dump.enc.hmac"; do
  rclone copyto "$remote/postgres/$name" "$temporary/postgres/$name" --config "$RCLONE_CONFIG_FILE"
done
for name in "restopass_photos_$timestamp.tar.gz.enc" "restopass_photos_$timestamp.tar.gz.enc.sha256" "restopass_photos_$timestamp.tar.gz.enc.hmac"; do
  rclone copyto "$remote/patron-photos/$name" "$temporary/patron-photos/$name" --config "$RCLONE_CONFIG_FILE"
done

grep -qx "format=restopass-paired-backup-v1" "$temporary/restopass_$timestamp.manifest"
grep -qx "timestamp=$timestamp" "$temporary/restopass_$timestamp.manifest"
grep -qx "postgres=postgres/restopass_$timestamp.dump.enc" "$temporary/restopass_$timestamp.manifest"
grep -qx "photos=patron-photos/restopass_photos_$timestamp.tar.gz.enc" "$temporary/restopass_$timestamp.manifest"
pg="$temporary/postgres/restopass_$timestamp.dump.enc"
photos="$temporary/patron-photos/restopass_photos_$timestamp.tar.gz.enc"
echo "Verifying downloaded PostgreSQL archive with an isolated temporary database..."
bash "$ROOT_DIR/deploy/verify-postgres-backup.sh" "$pg"
echo "Verifying downloaded private-photo archive in isolated temporary storage..."
bash "$ROOT_DIR/deploy/verify-patron-photo-backup.sh" "$photos"
echo "GOOGLE DRIVE paired backup recovery verification PASSED: $remote/"
