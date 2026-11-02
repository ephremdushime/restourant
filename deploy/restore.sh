#!/bin/sh
set -eu
umask 077

backup_file="${1:?Usage: restopass-restore <backup-file> <empty-output-directory>}"
output_dir="${2:?Usage: restopass-restore <backup-file> <empty-output-directory>}"
: "${RESTOPASS_BACKUP_ENCRYPTION_KEY:?RESTOPASS_BACKUP_ENCRYPTION_KEY is required}"
: "${RESTOPASS_BACKUP_HMAC_KEY:?RESTOPASS_BACKUP_HMAC_KEY is required}"

[ -d "$output_dir" ] || { echo "[restore] output directory must already exist" >&2; exit 1; }
[ -z "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit)" ] || {
  echo "[restore] output directory must be empty" >&2; exit 1;
}

restopass-backup-verify "$backup_file"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT HUP INT TERM

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 \
  -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY \
  -in "$backup_file" -out "$workdir/archive.tar.gz"

# Extract only the two expected top-level regular archive members.
members="$(tar -tzf "$workdir/archive.tar.gz")"
printf '%s\n' "$members" | grep -qx 'database.dump'
printf '%s\n' "$members" | grep -qx 'uploads.tar.gz'
[ "$(printf '%s\n' "$members" | wc -l | tr -d ' ')" -eq 2 ] || {
  echo "[restore] unexpected archive members; refusing extraction" >&2; exit 1;
}
tar -xzf "$workdir/archive.tar.gz" -C "$output_dir" database.dump uploads.tar.gz
[ -s "$output_dir/database.dump" ] && [ -s "$output_dir/uploads.tar.gz" ] || {
  echo "[restore] extracted recovery artifacts are incomplete" >&2; exit 1;
}
echo "[restore] recovery artifacts extracted to $output_dir"
echo "[restore] restore database.dump with pg_restore into an isolated PostgreSQL instance; restore uploads.tar.gz into the private uploads volume after reviewing it."
