#!/bin/sh
set -eu

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${RESTOPASS_BACKUP_ENCRYPTION_KEY:?RESTOPASS_BACKUP_ENCRYPTION_KEY is required}"

BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
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
  mv "$output.tmp" "$output"
  rm -rf "$workdir"

  echo "[backup] published encrypted backup: $output"
  find /backups -type f -name 'restopass-*.tar.gz.enc' -mtime +"$BACKUP_RETENTION_DAYS" -delete
  sleep "$BACKUP_INTERVAL_SECONDS"
done
