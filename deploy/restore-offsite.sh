#!/bin/sh
set -eu
umask 077

filename="${1:?Usage: restopass-restore-offsite <backup-filename> <empty-output-directory>}"
output_dir="${2:?Usage: restopass-restore-offsite <backup-filename> <empty-output-directory>}"
: "${RESTOPASS_BACKUP_S3_BUCKET:?RESTOPASS_BACKUP_S3_BUCKET is required}"
: "${RESTOPASS_BACKUP_S3_ACCESS_KEY_ID:?RESTOPASS_BACKUP_S3_ACCESS_KEY_ID is required}"
: "${RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY:?RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY is required}"
: "${RESTOPASS_BACKUP_ENCRYPTION_KEY:?RESTOPASS_BACKUP_ENCRYPTION_KEY is required}"
: "${RESTOPASS_BACKUP_HMAC_KEY:?RESTOPASS_BACKUP_HMAC_KEY is required}"

case "$filename" in
  restopass-*.tar.gz.enc) ;;
  *) echo "[restore-offsite] invalid backup filename" >&2; exit 1 ;;
esac
case "$filename" in */*|*..*) echo "[restore-offsite] path components are not allowed" >&2; exit 1 ;; esac
[ -d "$output_dir" ] || { echo "[restore-offsite] output directory must already exist" >&2; exit 1; }
[ -z "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit)" ] || {
  echo "[restore-offsite] output directory must be empty" >&2; exit 1;
}

prefix="${RESTOPASS_BACKUP_S3_PREFIX:-restopass}"
[ -n "$prefix" ] || { echo "[restore-offsite] S3 prefix cannot be empty" >&2; exit 1; }
object_key="${prefix%/}/$filename"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT HUP INT TERM
export AWS_ACCESS_KEY_ID="$RESTOPASS_BACKUP_S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${RESTOPASS_BACKUP_S3_REGION:-us-east-1}"

if [ -n "${RESTOPASS_BACKUP_S3_ENDPOINT:-}" ]; then
  case "$RESTOPASS_BACKUP_S3_ENDPOINT" in https://*) ;; *) echo "[restore-offsite] endpoint must use HTTPS" >&2; exit 1 ;; esac
  export AWS_S3_ADDRESSING_STYLE=path
  aws --endpoint-url "$RESTOPASS_BACKUP_S3_ENDPOINT" s3 cp "s3://$RESTOPASS_BACKUP_S3_BUCKET/$object_key" "$workdir/backup.enc" --only-show-errors
  aws --endpoint-url "$RESTOPASS_BACKUP_S3_ENDPOINT" s3 cp "s3://$RESTOPASS_BACKUP_S3_BUCKET/$object_key.hmac" "$workdir/backup.enc.hmac" --only-show-errors
else
  aws s3 cp "s3://$RESTOPASS_BACKUP_S3_BUCKET/$object_key" "$workdir/backup.enc" --only-show-errors
  aws s3 cp "s3://$RESTOPASS_BACKUP_S3_BUCKET/$object_key.hmac" "$workdir/backup.enc.hmac" --only-show-errors
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
sh "$SCRIPT_DIR/backup-verify.sh" "$workdir/backup.enc"
sh "$SCRIPT_DIR/restore.sh" "$workdir/backup.enc" "$output_dir"
