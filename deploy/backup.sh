#!/bin/sh
set -eu
umask 077

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${RESTOPASS_BACKUP_ENCRYPTION_KEY:?RESTOPASS_BACKUP_ENCRYPTION_KEY is required}"
: "${RESTOPASS_BACKUP_HMAC_KEY:?RESTOPASS_BACKUP_HMAC_KEY is required}"

BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
if [ "${#RESTOPASS_BACKUP_ENCRYPTION_KEY}" -lt 32 ] || [ "${#RESTOPASS_BACKUP_HMAC_KEY}" -lt 32 ]; then
  echo "[backup] encryption and independent HMAC keys must each contain at least 32 characters" >&2
  exit 1
fi
case "$BACKUP_INTERVAL_SECONDS:$BACKUP_RETENTION_DAYS" in
  *[!0-9:]*|:*|*:) echo "[backup] interval and retention must be positive integers" >&2; exit 1 ;;
esac
if [ "$BACKUP_INTERVAL_SECONDS" -lt 3600 ] || [ "$BACKUP_RETENTION_DAYS" -lt 1 ]; then
  echo "[backup] interval must be at least 3600 seconds and retention at least 1 day" >&2
  exit 1
fi
mkdir -p /backups /uploads

echo "[backup] encrypted PostgreSQL and upload-volume backup worker started"
while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  workdir="$(mktemp -d)"
  output="/backups/restopass-${stamp}.tar.gz.enc"

  if ! pg_dump -Fc -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f "$workdir/database.dump"; then
    echo "[backup] pg_dump failed; no backup was published" >&2
    rm -rf "$workdir"
    exit 1
  fi

  tar -czf "$workdir/uploads.tar.gz" -C /uploads .
  tar -czf "$workdir/archive.tar.gz" -C "$workdir" database.dump uploads.tar.gz
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 \
    -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY \
    -in "$workdir/archive.tar.gz" -out "$output.tmp"
  openssl dgst -sha256 -hmac "$RESTOPASS_BACKUP_HMAC_KEY" "$output.tmp" | awk '{print $NF}' > "$output.hmac.tmp"
  mv "$output.tmp" "$output"
  mv "$output.hmac.tmp" "$output.hmac"
  rm -rf "$workdir"

  echo "[backup] published encrypted backup: $output"
  find /backups -type f -name 'restopass-*.tar.gz.enc' -mtime +"$BACKUP_RETENTION_DAYS" -exec sh -c 'for f do rm -f "$f" "$f.hmac"; done' sh {} +
  sleep "$BACKUP_INTERVAL_SECONDS"
done
