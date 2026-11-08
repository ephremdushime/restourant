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
RESTOPASS_BACKUP_REQUIRE_OFFSITE="${RESTOPASS_BACKUP_REQUIRE_OFFSITE:-false}"
RESTOPASS_BACKUP_S3_PREFIX="${RESTOPASS_BACKUP_S3_PREFIX:-restopass}"
RESTOPASS_BACKUP_S3_REGION="${RESTOPASS_BACKUP_S3_REGION:-us-east-1}"
if [ "$RESTOPASS_BACKUP_REQUIRE_OFFSITE" = "true" ] && [ -z "${RESTOPASS_BACKUP_S3_BUCKET:-}" ]; then
  echo "[backup] off-site backups are required but RESTOPASS_BACKUP_S3_BUCKET is missing" >&2
  exit 1
fi
if [ -n "${RESTOPASS_BACKUP_S3_BUCKET:-}" ]; then
  [ -n "$RESTOPASS_BACKUP_S3_PREFIX" ] || { echo "[backup] S3 prefix cannot be empty" >&2; exit 1; }
  if [ -n "${RESTOPASS_BACKUP_S3_ENDPOINT:-}" ]; then
    case "$RESTOPASS_BACKUP_S3_ENDPOINT" in https://*) ;; *) echo "[backup] off-site S3 endpoint must use HTTPS" >&2; exit 1 ;; esac
  fi
  : "${RESTOPASS_BACKUP_S3_ACCESS_KEY_ID:?RESTOPASS_BACKUP_S3_ACCESS_KEY_ID is required for off-site backups}"
  : "${RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY:?RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY is required for off-site backups}"
fi
if [ "$RESTOPASS_BACKUP_ENCRYPTION_KEY" = "$RESTOPASS_BACKUP_HMAC_KEY" ]; then
  echo "[backup] encryption key and HMAC integrity key must be distinct" >&2
  exit 1
fi
if [ "$RESTOPASS_BACKUP_ENCRYPTION_KEY" = "generate_a_unique_backup_encryption_passphrase_at_least_32_characters" ] || \
   [ "$RESTOPASS_BACKUP_HMAC_KEY" = "generate_a_separate_random_backup_integrity_key_at_least_32_characters" ] || \
   ( [ "${CI:-false}" != "true" ] && ( [ "$RESTOPASS_BACKUP_ENCRYPTION_KEY" = "ci-backup-encryption-secret-0123456789" ] || [ "$RESTOPASS_BACKUP_HMAC_KEY" = "ci-backup-hmac-secret-0123456789" ] ) ); then
  echo "[backup] default placeholder backup keys detected; configure unique secrets" >&2
  exit 1
fi
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

  mkdir -p "$workdir/uploads-stage"
  if [ -d /uploads ]; then
    cp -a /uploads/. "$workdir/uploads-stage/" 2>/dev/null || true
  fi
  private_photo_dir="${RESTOPASS_PRIVATE_UPLOAD_DIR:-/app/data/private/patron-photos}"
  if [ -d "$private_photo_dir" ]; then
    mkdir -p "$workdir/uploads-stage/patron-photos"
    cp -a "$private_photo_dir"/. "$workdir/uploads-stage/patron-photos/" 2>/dev/null || true
  fi
  tar -czf "$workdir/uploads.tar.gz" -C "$workdir/uploads-stage" .
  tar -czf "$workdir/archive.tar.gz" -C "$workdir" database.dump uploads.tar.gz
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 \
    -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY \
    -in "$workdir/archive.tar.gz" -out "$output.tmp"
  openssl dgst -sha256 -hmac "$RESTOPASS_BACKUP_HMAC_KEY" "$output.tmp" | awk '{print $NF}' > "$output.hmac.tmp"
  mv "$output.tmp" "$output"
  mv "$output.hmac.tmp" "$output.hmac"

  echo "[backup] published encrypted backup: $output"
  if [ -n "${RESTOPASS_BACKUP_S3_BUCKET:-}" ]; then
    object_key="${RESTOPASS_BACKUP_S3_PREFIX%/}/$(basename "$output")"
    sidecar_key="$object_key.hmac"
    export AWS_ACCESS_KEY_ID="$RESTOPASS_BACKUP_S3_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY"
    export AWS_DEFAULT_REGION="$RESTOPASS_BACKUP_S3_REGION"
    if [ -n "${RESTOPASS_BACKUP_S3_ENDPOINT:-}" ]; then
      export AWS_S3_ADDRESSING_STYLE=path
      aws --endpoint-url "$RESTOPASS_BACKUP_S3_ENDPOINT" s3 cp "$output" "s3://$RESTOPASS_BACKUP_S3_BUCKET/$object_key" --only-show-errors
      aws --endpoint-url "$RESTOPASS_BACKUP_S3_ENDPOINT" s3 cp "$output.hmac" "s3://$RESTOPASS_BACKUP_S3_BUCKET/$sidecar_key" --only-show-errors
      aws --endpoint-url "$RESTOPASS_BACKUP_S3_ENDPOINT" s3 cp "s3://$RESTOPASS_BACKUP_S3_BUCKET/$object_key" "$workdir/remote.enc" --only-show-errors
      aws --endpoint-url "$RESTOPASS_BACKUP_S3_ENDPOINT" s3 cp "s3://$RESTOPASS_BACKUP_S3_BUCKET/$sidecar_key" "$workdir/remote.enc.hmac" --only-show-errors
    else
      aws s3 cp "$output" "s3://$RESTOPASS_BACKUP_S3_BUCKET/$object_key" --only-show-errors
      aws s3 cp "$output.hmac" "s3://$RESTOPASS_BACKUP_S3_BUCKET/$sidecar_key" --only-show-errors
      aws s3 cp "s3://$RESTOPASS_BACKUP_S3_BUCKET/$object_key" "$workdir/remote.enc" --only-show-errors
      aws s3 cp "s3://$RESTOPASS_BACKUP_S3_BUCKET/$sidecar_key" "$workdir/remote.enc.hmac" --only-show-errors
    fi
    sh /usr/local/bin/restopass-backup-verify "$workdir/remote.enc"
    cmp -s "$output" "$workdir/remote.enc"
    printf '%s' "$(date +%s)" > /backups/.offsite-last-success.tmp
    mv /backups/.offsite-last-success.tmp /backups/.offsite-last-success
    rm -rf "$workdir"
    echo "[backup] off-site object uploaded and independently downloaded/verified: s3://$RESTOPASS_BACKUP_S3_BUCKET/$object_key"
  elif [ "$RESTOPASS_BACKUP_REQUIRE_OFFSITE" = "true" ]; then
    echo "[backup] off-site replication is mandatory but not configured" >&2
    exit 1
  fi
  rm -rf "$workdir"
  find /backups -type f -name 'restopass-*.tar.gz.enc' -mtime +"$BACKUP_RETENTION_DAYS" -exec sh -c 'for f do rm -f "$f" "$f.hmac"; done' sh {} +
  sleep "$BACKUP_INTERVAL_SECONDS"
done
