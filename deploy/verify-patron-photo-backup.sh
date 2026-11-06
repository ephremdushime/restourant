#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/deploy/lib/photo-backup.sh"
BACKUP_FILE="${1:-}"
[[ -n "$BACKUP_FILE" ]] || { echo "Usage: bash deploy/verify-patron-photo-backup.sh <encrypted-photo-archive>" >&2; exit 1; }
[[ -f "$ROOT_DIR/.env" ]] || { echo "Missing $ROOT_DIR/.env" >&2; exit 1; }
key="${RESTOPASS_BACKUP_ENCRYPTION_KEY:-}"
if [[ -z "$key" ]]; then key="$(sed -n 's/^RESTOPASS_BACKUP_ENCRYPTION_KEY=//p' "$ROOT_DIR/.env" | head -n 1 | tr -d '"\r')"; fi
[[ "$key" =~ ^[A-Fa-f0-9]{64}$ ]] || { echo "Invalid RESTOPASS_BACKUP_ENCRYPTION_KEY." >&2; exit 1; }
verify_photo_backup "$BACKUP_FILE" "$key"
temporary="$(mktemp "${TMPDIR:-/tmp}/restopass-photo-verify.XXXXXX.tar.gz")"
staging="$(mktemp -d "${TMPDIR:-/tmp}/restopass-photo-stage.XXXXXX")"
chmod 600 "$temporary"; chmod 700 "$staging"
cleanup() { rm -f "$temporary"; rm -rf "$staging"; }
trap cleanup EXIT
export RESTOPASS_BACKUP_ENCRYPTION_KEY="$key"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY -in "$BACKUP_FILE" -out "$temporary"
validate_photo_archive "$temporary"
tar -xzf "$temporary" --no-same-owner --no-same-permissions -C "$staging"
[[ -d "$staging/patron-photos" ]] || { echo "Restored archive has no patron-photos directory." >&2; exit 1; }
file_count="$(find "$staging/patron-photos" -type f | wc -l | tr -d '[:space:]')"
echo "Isolated photo recovery verification PASSED: $file_count files extracted into temporary staging."
