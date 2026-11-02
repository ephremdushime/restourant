#!/bin/sh
set -eu
backup_file="$(find /backups -type f -name 'restopass-*.tar.gz.enc' -mmin -2880 | sort | tail -n 1)"
[ -n "$backup_file" ] || { echo "[backup-health] no recent backup" >&2; exit 1; }
restopass-backup-verify "$backup_file"
if [ "${RESTOPASS_BACKUP_REQUIRE_OFFSITE:-false}" = "true" ]; then
  [ -s /backups/.offsite-last-success ] || { echo "[backup-health] no successful off-site replication marker" >&2; exit 1; }
  last="$(cat /backups/.offsite-last-success)"
  case "$last" in *[!0-9]*|'') echo "[backup-health] invalid off-site marker" >&2; exit 1 ;; esac
  now="$(date +%s)"
  [ "$last" -le "$now" ] && [ $((now - last)) -lt 172800 ] || {
    echo "[backup-health] off-site replication is stale" >&2; exit 1;
  }
fi
echo "[backup-health] recent local backup and required off-site copy verified"
