#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/deploy/lib/photo-backup.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
key="$(openssl rand -hex 32)"
export RESTOPASS_BACKUP_ENCRYPTION_KEY="$key"

mkdir -p -m 700 "$TMP/source/patron-photos"
printf 'test image bytes' > "$TMP/source/patron-photos/sample.jpg"
tar -czf "$TMP/photos.tar.gz" -C "$TMP/source" patron-photos
validate_photo_archive "$TMP/photos.tar.gz"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY -in "$TMP/photos.tar.gz" -out "$TMP/photos.tar.gz.enc"
write_photo_backup_metadata "$TMP/photos.tar.gz.enc" "$key"
verify_photo_backup "$TMP/photos.tar.gz.enc" "$key"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY -in "$TMP/photos.tar.gz.enc" -out "$TMP/restored.tar.gz"
validate_photo_archive "$TMP/restored.tar.gz"
mkdir "$TMP/restored"
tar -xzf "$TMP/restored.tar.gz" -C "$TMP/restored"
cmp "$TMP/source/patron-photos/sample.jpg" "$TMP/restored/patron-photos/sample.jpg"

# Reject tampered ciphertext before decryption.
printf X | dd of="$TMP/photos.tar.gz.enc" bs=1 seek=20 conv=notrunc status=none
if verify_photo_backup "$TMP/photos.tar.gz.enc" "$key" >/dev/null 2>&1; then
  echo "Tampered archive unexpectedly passed authentication." >&2
  exit 1
fi

# Reject archive entries outside the dedicated photo root.
mkdir -p "$TMP/unsafe"
printf 'no' > "$TMP/unsafe/marker"
tar -czf "$TMP/unsafe.tar.gz" -C "$TMP/unsafe" --transform='s|marker|../escape|' marker
if validate_photo_archive "$TMP/unsafe.tar.gz" >/dev/null 2>&1; then
  echo "Unsafe archive path unexpectedly passed validation." >&2
  exit 1
fi

echo "Private photo backup crypto, integrity, round-trip and path validation passed."
