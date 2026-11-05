#!/bin/sh
# RestoPass disaster-recovery drill.
# A real drill requires an isolated disposable PostgreSQL target. CI may use
# --archive-only to validate encryption, integrity and archive structure, but
# that mode must never be reported as a successful database restore.
set -eu
umask 077

mode="restore"
if [ "${1:-}" = "--archive-only" ]; then
  mode="archive-only"
  shift
fi
backup_file="${1:?Usage: restopass-restore-drill [--archive-only] <backup-archive-file> [isolated-target-database-url]}"
target_db="${2:-${TARGET_DATABASE_URL:-}}"
: "${RESTOPASS_BACKUP_ENCRYPTION_KEY:?RESTOPASS_BACKUP_ENCRYPTION_KEY is required}"
: "${RESTOPASS_BACKUP_HMAC_KEY:?RESTOPASS_BACKUP_HMAC_KEY is required}"

[ -f "$backup_file" ] || { echo "[dr-drill] ERROR: Backup file not found" >&2; exit 1; }
[ -f "$backup_file.hmac" ] || { echo "[dr-drill] ERROR: Integrity sidecar is missing" >&2; exit 1; }
if [ "$mode" = "restore" ] && [ -z "$target_db" ]; then
  echo "[dr-drill] ERROR: a disposable isolated target database is required; use --archive-only only for structural CI validation" >&2
  exit 2
fi
if [ "$mode" = "restore" ] && [ "${RESTOPASS_DR_RESTORE_TARGET_ISOLATED:-false}" != "true" ]; then
  echo "[dr-drill] ERROR: set RESTOPASS_DR_RESTORE_TARGET_ISOLATED=true only after confirming the target is disposable and isolated" >&2
  exit 2
fi
if [ "$mode" = "restore" ] && [ "$target_db" = "${DATABASE_URL:-}" ]; then
  echo "[dr-drill] ERROR: refusing to restore into DATABASE_URL; provide a separate disposable TARGET_DATABASE_URL" >&2
  exit 2
fi

echo "=============================================================================="
echo "RestoPass Disaster Recovery Verification Drill"
echo "=============================================================================="
start_time="$(date +%s)"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
if command -v restopass-backup-verify >/dev/null 2>&1; then
  restopass-backup-verify "$backup_file"
else
  sh "$SCRIPT_DIR/backup-verify.sh" "$backup_file"
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT HUP INT TERM
extract_dir="$workdir/extracted"
mkdir -p "$extract_dir"
if command -v restopass-restore >/dev/null 2>&1; then
  restopass-restore "$backup_file" "$extract_dir"
else
  sh "$SCRIPT_DIR/restore.sh" "$backup_file" "$extract_dir"
fi
[ -s "$extract_dir/database.dump" ] || { echo "[dr-drill] ERROR: database dump is missing" >&2; exit 1; }
[ -s "$extract_dir/uploads.tar.gz" ] || { echo "[dr-drill] ERROR: uploads archive is missing" >&2; exit 1; }

# Listing the nested archive verifies its gzip/tar structure without extracting
# potentially hostile paths or symlinks into the drill container.
tar -tzf "$extract_dir/uploads.tar.gz" > "$workdir/uploads-members.txt" || {
  echo "[dr-drill] ERROR: uploads archive is corrupt" >&2; exit 1;
}
photo_count="$(grep -c . "$workdir/uploads-members.txt" || true)"

if [ "$mode" = "archive-only" ]; then
  echo "ARCHIVE VALIDATION ONLY — NOT A DATABASE RESTORE"
  echo "Integrity: verified; decryption: verified; database dump: present; uploads archive: valid ($photo_count files)"
  echo "No PostgreSQL restore was performed. Do not use this result as production DR sign-off."
  exit 0
fi

command -v pg_restore >/dev/null 2>&1 || { echo "[dr-drill] ERROR: pg_restore is required" >&2; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "[dr-drill] ERROR: psql is required for post-restore validation" >&2; exit 1; }

target_database_name="$(psql "$target_db" -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')"
case "$target_database_name" in
  *drill*) ;;
  *) echo "[dr-drill] ERROR: target database name must contain 'drill' (for example restopass_drill_20261105)" >&2; exit 2 ;;
esac
existing_tables="$(psql "$target_db" -v ON_ERROR_STOP=1 -Atqc "SELECT COUNT(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")"
case "$existing_tables" in
  0) ;;
  *) echo "[dr-drill] ERROR: target database is not empty; refusing to overwrite existing tables" >&2; exit 2 ;;
esac

echo "[dr-drill] Restoring into the explicitly supplied empty isolated target database..."
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$target_db" "$extract_dir/database.dump"

# Require core tables and execute actual reads; pg_restore exit status alone is
# not sufficient evidence that the expected RestoPass schema is present.
psql "$target_db" -v ON_ERROR_STOP=1 -Atqc "
  SELECT CASE WHEN
    to_regclass('public.restaurants') IS NOT NULL AND
    to_regclass('public.customers') IS NOT NULL AND
    to_regclass('public.ledger_entries') IS NOT NULL AND
    to_regclass('public.scan_events') IS NOT NULL AND
    to_regclass('public.pending_approvals') IS NOT NULL
  THEN 'schema-ok' ELSE 'schema-missing' END;
" | grep -qx 'schema-ok' || { echo "[dr-drill] ERROR: required RestoPass tables are missing after restore" >&2; exit 1; }

counts="$(psql "$target_db" -v ON_ERROR_STOP=1 -Atqc "
  SELECT 'restaurants=' || COUNT(*) FROM restaurants
  UNION ALL SELECT 'customers=' || COUNT(*) FROM customers
  UNION ALL SELECT 'ledger_entries=' || COUNT(*) FROM ledger_entries
  UNION ALL SELECT 'scan_events=' || COUNT(*) FROM scan_events
  UNION ALL SELECT 'pending_approvals=' || COUNT(*) FROM pending_approvals;
")"
[ -n "$counts" ] || { echo "[dr-drill] ERROR: post-restore validation returned no counts" >&2; exit 1; }

end_time="$(date +%s)"
rto_seconds=$((end_time - start_time))
archive_name="$(basename "$backup_file")"
rpo_info="not calculated"
case "$archive_name" in
  restopass-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z.tar.gz.enc)
    rpo_info="${archive_name#restopass-}"
    rpo_info="${rpo_info%.tar.gz.enc}"
    ;;
esac

echo "=============================================================================="
echo "DISASTER RECOVERY RESTORE DRILL — SUCCESS"
echo "Target: isolated database supplied by operator"
echo "Archive: $backup_file"
echo "Uploads archive members listed: $photo_count"
echo "Restored row counts:"
printf '%s\n' "$counts"
echo "Measured RTO: ${rto_seconds}s"
echo "Backup timestamp (RPO reference): $rpo_info"
echo "Integrity: HMAC-SHA256 verified; AES-256-CBC decrypted"
echo "=============================================================================="
