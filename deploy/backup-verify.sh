#!/bin/sh
set -eu

backup_file="${1:?Usage: restopass-backup-verify <backup-file>}"
: "${RESTOPASS_BACKUP_HMAC_KEY:?RESTOPASS_BACKUP_HMAC_KEY is required}"

[ -f "$backup_file" ] || { echo "[backup] backup file not found" >&2; exit 1; }
[ -f "$backup_file.hmac" ] || { echo "[backup] integrity sidecar is missing" >&2; exit 1; }

expected="$(cat "$backup_file.hmac")"
case "$expected" in
  *[!0-9a-f]*|'') echo "[backup] invalid integrity sidecar" >&2; exit 1 ;;
esac
[ "${#expected}" -eq 64 ] || { echo "[backup] invalid integrity digest length" >&2; exit 1; }

actual="$(openssl dgst -sha256 -hmac "$RESTOPASS_BACKUP_HMAC_KEY" "$backup_file" | awk '{print $NF}')"
[ "$actual" = "$expected" ] || { echo "[backup] integrity verification failed" >&2; exit 1; }
echo "[backup] integrity verified"
