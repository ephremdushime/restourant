#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
LOCK_FILE="$ROOT_DIR/backups/.backup.lock"
command -v aws >/dev/null 2>&1 || { echo "AWS CLI v2 is required for off-site recovery verification." >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another backup or verification job is running." >&2; exit 1; }

env_value() {
  local name="$1" line value
  line="$(grep -E "^(${name})=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"; value="${value%$'\r'}"
  if [[ "$value" == \"*\" ]]; then value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"; fi
  printf '%s' "$value"
}
bucket="${RESTOPASS_BACKUP_S3_BUCKET:-$(env_value RESTOPASS_BACKUP_S3_BUCKET)}"
region="${RESTOPASS_BACKUP_S3_REGION:-$(env_value RESTOPASS_BACKUP_S3_REGION)}"
endpoint="${RESTOPASS_BACKUP_S3_ENDPOINT:-$(env_value RESTOPASS_BACKUP_S3_ENDPOINT)}"
access="${RESTOPASS_BACKUP_S3_ACCESS_KEY_ID:-$(env_value RESTOPASS_BACKUP_S3_ACCESS_KEY_ID)}"
secret="${RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY:-$(env_value RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY)}"
prefix="${RESTOPASS_BACKUP_S3_PREFIX:-$(env_value RESTOPASS_BACKUP_S3_PREFIX)}"
prefix="${prefix:-restopass}"
[[ -n "$bucket" && -n "$access" && -n "$secret" ]] || { echo "Off-site backup bucket and dedicated credentials must be configured." >&2; exit 1; }
export AWS_ACCESS_KEY_ID="$access" AWS_SECRET_ACCESS_KEY="$secret" AWS_DEFAULT_REGION="${region:-us-east-1}" AWS_EC2_METADATA_DISABLED=true
aws_args=(); [[ -z "$endpoint" ]] || aws_args+=(--endpoint-url "$endpoint")

manifest="$(find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'restopass_*.manifest' -printf '%f\n' | sort -r | head -n 1)"
[[ -n "$manifest" ]] || { echo "No paired backup manifest found." >&2; exit 1; }
timestamp="${manifest#restopass_}"; timestamp="${timestamp%.manifest}"
date_path="${timestamp:0:4}/${timestamp:4:2}/${timestamp:6:2}/$timestamp"
remote="s3://$bucket/$prefix/$date_path"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/restopass-offsite-verify.XXXXXX")"
chmod 700 "$temporary"
cleanup() { rm -rf "$temporary"; }
trap cleanup EXIT
mkdir -m 700 "$temporary/postgres" "$temporary/patron-photos"

echo "Downloading paired off-site backup $timestamp for isolated recovery verification..."
aws s3 cp "$remote/restopass_$timestamp.manifest" "$temporary/restopass_$timestamp.manifest" "${aws_args[@]}" --only-show-errors
for name in "restopass_$timestamp.dump.enc" "restopass_$timestamp.dump.enc.sha256" "restopass_$timestamp.dump.enc.hmac"; do
  aws s3 cp "$remote/postgres/$name" "$temporary/postgres/$name" "${aws_args[@]}" --only-show-errors
done
for name in "restopass_photos_$timestamp.tar.gz.enc" "restopass_photos_$timestamp.tar.gz.enc.sha256" "restopass_photos_$timestamp.tar.gz.enc.hmac"; do
  aws s3 cp "$remote/patron-photos/$name" "$temporary/patron-photos/$name" "${aws_args[@]}" --only-show-errors
done

grep -qx "format=restopass-paired-backup-v1" "$temporary/restopass_$timestamp.manifest"
grep -qx "timestamp=$timestamp" "$temporary/restopass_$timestamp.manifest"
pg="$temporary/postgres/restopass_$timestamp.dump.enc"
photos="$temporary/patron-photos/restopass_photos_$timestamp.tar.gz.enc"
echo "Verifying remote PostgreSQL archive with an isolated temporary database..."
bash "$ROOT_DIR/deploy/verify-postgres-backup.sh" "$pg"
echo "Verifying remote private-photo archive in isolated temporary storage..."
bash "$ROOT_DIR/deploy/verify-patron-photo-backup.sh" "$photos"
echo "OFF-SITE paired backup recovery verification PASSED: $remote/"
