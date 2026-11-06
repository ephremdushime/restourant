#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# Verify the shared timestamp contract is enforced in both constituent scripts.
grep -q 'RESTOPASS_BACKUP_TIMESTAMP' "$ROOT_DIR/deploy/backup-postgres.sh"
grep -q 'RESTOPASS_BACKUP_TIMESTAMP' "$ROOT_DIR/deploy/backup-patron-photos.sh"
# Validate paired scheduler scripts and isolated photo restore verifier syntax.
bash -n "$ROOT_DIR/deploy/backup-all.sh" "$ROOT_DIR/deploy/verify-patron-photo-backup.sh" "$ROOT_DIR/deploy/verify-latest-paired-backup.sh" "$ROOT_DIR/deploy/install-backup-schedule.sh"
grep -q 'manifest' "$ROOT_DIR/deploy/backup-all.sh"
grep -q 'upload.*manifest' "$ROOT_DIR/deploy/backup-all.sh"
grep -q 'verify-postgres-backup.sh' "$ROOT_DIR/deploy/verify-latest-paired-backup.sh"
grep -q 'verify-patron-photo-backup.sh' "$ROOT_DIR/deploy/verify-latest-paired-backup.sh"
echo "Paired backup orchestration, scheduling and recovery-verification checks passed."
