#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_FILE="$ROOT_DIR/deploy/restopass-backups.cron"
command -v crontab >/dev/null 2>&1 || { echo "crontab is required. Install cron first." >&2; exit 1; }
mkdir -p "$ROOT_DIR/backups/logs"
chmod 700 "$ROOT_DIR/backups" "$ROOT_DIR/backups/logs"
cat > "$CRON_FILE" <<EOF
# RestoPass encrypted off-site backup at 02:15 host-local time, daily.
15 2 * * * cd "$ROOT_DIR" && /bin/bash deploy/backup-all.sh >> "$ROOT_DIR/backups/logs/backup.log" 2>&1
# Isolated PostgreSQL + private-photo recovery verification at 04:00 every Sunday.
0 4 * * 0 cd "$ROOT_DIR" && /bin/bash deploy/verify-latest-paired-backup.sh >> "$ROOT_DIR/backups/logs/verify.log" 2>&1
EOF
chmod 600 "$CRON_FILE"
( crontab -l 2>/dev/null | grep -v 'RestoPass encrypted off-site backup' | grep -v 'RestoPass isolated paired-backup verification' || true
  cat "$CRON_FILE" ) | crontab -
echo "Installed RestoPass backup schedule for user $(id -un):"
echo "  Daily 02:15: paired encrypted PostgreSQL + private-photo backup and S3 upload."
echo "  Sunday 04:00: isolated recovery verification of the latest local paired backup."
echo "Logs: $ROOT_DIR/backups/logs/"
echo "Confirm cron is active and run deploy/backup-all.sh manually once after configuring .env."
