#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_FILE="$ROOT_DIR/deploy/restopass-backups.cron"
command -v crontab >/dev/null 2>&1 || { echo "crontab is required. Install cron first." >&2; exit 1; }
command -v rclone >/dev/null 2>&1 || { echo "rclone is required for Google Drive backups." >&2; exit 1; }
mkdir -p "$ROOT_DIR/backups/logs"
chmod 700 "$ROOT_DIR/backups" "$ROOT_DIR/backups/logs"
cat > "$CRON_FILE" <<EOF
# RestoPass paired encrypted Google Drive backup at 18:00 and 00:00 Africa/Kigali.
# CRON_TZ is supported by Cronie/Vixie cron; confirm the host cron implementation.
CRON_TZ=Africa/Kigali
0 0,18 * * * cd "$ROOT_DIR" && /bin/bash deploy/backup-all.sh >> "$ROOT_DIR/backups/logs/backup.log" 2>&1 # restopass-managed-backup-job
# Weekly isolated off-site PostgreSQL + private-photo recovery verification, Sunday 04:00 Kigali.
0 4 * * 0 cd "$ROOT_DIR" && /bin/bash deploy/verify-latest-paired-backup.sh >> "$ROOT_DIR/backups/logs/verify.log" 2>&1 # restopass-managed-backup-job
EOF
chmod 600 "$CRON_FILE"
( crontab -l 2>/dev/null | grep -v 'restopass-managed-backup-job' || true
  cat "$CRON_FILE" ) | crontab -
echo "Installed RestoPass backup schedule for user $(id -un):"
echo "  Daily 00:00 and 18:00 Africa/Kigali: paired encrypted backup + Google Drive upload."
echo "  Sunday 04:00 Africa/Kigali: isolated off-site recovery verification."
echo "Logs: $ROOT_DIR/backups/logs/"
echo "Run deploy/backup-all.sh manually once after configuring .env and rclone OAuth."
