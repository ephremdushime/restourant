#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
grep -q 'RESTOPASS_BACKUP_TIMESTAMP' "$ROOT_DIR/deploy/backup-postgres.sh"
grep -q 'RESTOPASS_BACKUP_TIMESTAMP' "$ROOT_DIR/deploy/backup-patron-photos.sh"
for script in \
  "$ROOT_DIR/deploy/backup-all.sh" \
  "$ROOT_DIR/deploy/backup-postgres.sh" \
  "$ROOT_DIR/deploy/backup-patron-photos.sh" \
  "$ROOT_DIR/deploy/verify-postgres-backup.sh" \
  "$ROOT_DIR/deploy/verify-patron-photo-backup.sh" \
  "$ROOT_DIR/deploy/verify-latest-paired-backup.sh" \
  "$ROOT_DIR/deploy/install-backup-schedule.sh"; do
  bash -n "$script"
done
grep -q 'manifest' "$ROOT_DIR/deploy/backup-all.sh"
grep -q 'rclone copyto' "$ROOT_DIR/deploy/backup-all.sh"
grep -Fq 'cmp -s "$source" "$downloaded"' "$ROOT_DIR/deploy/backup-all.sh"
grep -Fq 'upload "$manifest" "$remote/restopass_' "$ROOT_DIR/deploy/backup-all.sh"
grep -q 'rclone delete.*--min-age' "$ROOT_DIR/deploy/backup-all.sh"
grep -q 'RESTOPASS_GOOGLE_DRIVE_REMOTE' "$ROOT_DIR/deploy/backup-all.sh"
grep -q 'CRON_TZ=Africa/Kigali' "$ROOT_DIR/deploy/install-backup-schedule.sh"
grep -q '0 0,18' "$ROOT_DIR/deploy/install-backup-schedule.sh"
grep -q 'rclone copyto' "$ROOT_DIR/deploy/verify-latest-paired-backup.sh"
grep -q 'verify-postgres-backup.sh' "$ROOT_DIR/deploy/verify-latest-paired-backup.sh"
grep -q 'verify-patron-photo-backup.sh' "$ROOT_DIR/deploy/verify-latest-paired-backup.sh"
echo "Google Drive paired backup orchestration, Kigali schedule and recovery-verification checks passed."
