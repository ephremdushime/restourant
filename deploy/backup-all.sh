#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
LOCK_FILE="$ROOT_DIR/backups/.backup.lock"
POSTGRES_DIR="${RESTOPASS_BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
PHOTOS_DIR="${RESTOPASS_PHOTO_BACKUP_DIR:-$ROOT_DIR/backups/patron-photos}"
REMOTE_PREFIX="${RESTOPASS_BACKUP_S3_PREFIX:-restopass}"
TIMESTAMP="${RESTOPASS_BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE"
[[ "$TIMESTAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || fail "Invalid backup timestamp."
command -v aws >/dev/null 2>&1 || fail "AWS CLI v2 is required for off-site S3-compatible backup uploads."
command -v flock >/dev/null 2>&1 || fail "flock is required to prevent overlapping backup/verification jobs."

# Read simple KEY=value entries without sourcing the .env file as shell code.
env_value() {
  local name="$1" line value
  line="$(grep -E "^(${name})=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" ]]; then value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

export RESTOPASS_BACKUP_ENCRYPTION_KEY="${RESTOPASS_BACKUP_ENCRYPTION_KEY:-$(env_value RESTOPASS_BACKUP_ENCRYPTION_KEY)}"
export RESTOPASS_BACKUP_S3_BUCKET="${RESTOPASS_BACKUP_S3_BUCKET:-$(env_value RESTOPASS_BACKUP_S3_BUCKET)}"
export RESTOPASS_BACKUP_S3_REGION="${RESTOPASS_BACKUP_S3_REGION:-$(env_value RESTOPASS_BACKUP_S3_REGION)}"
export RESTOPASS_BACKUP_S3_ENDPOINT="${RESTOPASS_BACKUP_S3_ENDPOINT:-$(env_value RESTOPASS_BACKUP_S3_ENDPOINT)}"
export RESTOPASS_BACKUP_S3_ACCESS_KEY_ID="${RESTOPASS_BACKUP_S3_ACCESS_KEY_ID:-$(env_value RESTOPASS_BACKUP_S3_ACCESS_KEY_ID)}"
export RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY="${RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY:-$(env_value RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY)}"
[[ "$RESTOPASS_BACKUP_ENCRYPTION_KEY" =~ ^[A-Fa-f0-9]{64}$ ]] || fail "Set RESTOPASS_BACKUP_ENCRYPTION_KEY to a 64-character random hex key."
[[ -n "$RESTOPASS_BACKUP_S3_BUCKET" ]] || fail "Set RESTOPASS_BACKUP_S3_BUCKET to a private S3-compatible bucket."
[[ -n "$RESTOPASS_BACKUP_S3_ACCESS_KEY_ID" && -n "$RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY" ]] || fail "Set dedicated RESTOPASS_BACKUP_S3_ACCESS_KEY_ID and RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY credentials."
export AWS_ACCESS_KEY_ID="$RESTOPASS_BACKUP_S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${RESTOPASS_BACKUP_S3_REGION:-us-east-1}"
export AWS_EC2_METADATA_DISABLED=true

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "Another backup or restore verification job is already running."
export RESTOPASS_BACKUP_TIMESTAMP="$TIMESTAMP"

echo "Creating paired PostgreSQL and private-photo backups for $TIMESTAMP..."
bash "$ROOT_DIR/deploy/backup-postgres.sh"
bash "$ROOT_DIR/deploy/backup-patron-photos.sh"

pg="$POSTGRES_DIR/restopass_$TIMESTAMP.dump.enc"
photos="$PHOTOS_DIR/restopass_photos_$TIMESTAMP.tar.gz.enc"
for file in "$pg" "$pg.sha256" "$pg.hmac" "$photos" "$photos.sha256" "$photos.hmac"; do
  [[ -s "$file" ]] || fail "Expected paired backup artifact is missing: $file"
done

manifest="$ROOT_DIR/backups/restopass_$TIMESTAMP.manifest"
cat > "$manifest" <<EOF
format=restopass-paired-backup-v1
timestamp=$TIMESTAMP
postgres=postgres/restopass_$TIMESTAMP.dump.enc
photos=patron-photos/restopass_photos_$TIMESTAMP.tar.gz.enc
EOF
chmod 600 "$manifest"

remote="s3://$RESTOPASS_BACKUP_S3_BUCKET/$REMOTE_PREFIX"
aws_args=(--only-show-errors)
if [[ -n "$RESTOPASS_BACKUP_S3_ENDPOINT" ]]; then aws_args+=(--endpoint-url "$RESTOPASS_BACKUP_S3_ENDPOINT"); fi

upload() {
  local source="$1" destination="$2"
  aws s3 cp "$source" "$destination" "${aws_args[@]}" || fail "Off-site upload failed for $source"
}
date_path="${TIMESTAMP:0:4}/${TIMESTAMP:4:2}/${TIMESTAMP:6:2}/$TIMESTAMP"
for file in "$pg" "$pg.sha256" "$pg.hmac"; do upload "$file" "$remote/$date_path/postgres/$(basename "$file")"; done
for file in "$photos" "$photos.sha256" "$photos.hmac"; do upload "$file" "$remote/$date_path/patron-photos/$(basename "$file")"; done
# Upload manifest last: its presence denotes a complete paired off-site backup.
upload "$manifest" "$remote/$date_path/restopass_$TIMESTAMP.manifest"

echo "Paired backup and off-site upload completed."
echo "Timestamp: $TIMESTAMP"
echo "Remote: $remote/$date_path/"
echo "Completion manifest: $remote/$date_path/restopass_$TIMESTAMP.manifest"
