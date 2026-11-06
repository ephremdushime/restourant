#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.prod.yml"
BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Usage: bash deploy/verify-postgres-backup.sh /path/to/restopass_YYYYMMDDTHHMMSSZ.dump.enc" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi
if [[ ! -f "$BACKUP_FILE.sha256" ]]; then
  echo "Backup checksum file is missing: $BACKUP_FILE.sha256" >&2
  exit 1
fi

BACKUP_ENCRYPTION_KEY="${RESTOPASS_BACKUP_ENCRYPTION_KEY:-}"
if [[ -z "$BACKUP_ENCRYPTION_KEY" ]]; then
  BACKUP_ENCRYPTION_KEY="$(sed -n 's/^RESTOPASS_BACKUP_ENCRYPTION_KEY=//p' "$ENV_FILE" | head -n 1 | tr -d '"\r')"
fi
if ! [[ "$BACKUP_ENCRYPTION_KEY" =~ ^[A-Fa-f0-9]{64}$ ]]; then
  echo "RESTOPASS_BACKUP_ENCRYPTION_KEY must be a 64-character random hex key (generate with: openssl rand -hex 32)." >&2
  exit 1
fi
export RESTOPASS_BACKUP_ENCRYPTION_KEY="$BACKUP_ENCRYPTION_KEY"

(cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE").sha256")

compose=(docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
restore_db="restopass_restore_check_$$"
RESTORE_DUMP="$(mktemp "${TMPDIR:-/tmp}/restopass-restore.XXXXXX")"
chmod 600 "$RESTORE_DUMP"
cleanup() {
  "${compose[@]}" exec -T postgres sh -ec \
    'PGPASSWORD="$POSTGRES_PASSWORD" dropdb --if-exists -h 127.0.0.1 -U "$POSTGRES_USER" "$1"' sh "$restore_db" >/dev/null 2>&1 || true
  rm -f "$RESTORE_DUMP"
}
trap cleanup EXIT

echo "Decrypting backup into a private temporary file..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY \
  -in "$BACKUP_FILE" -out "$RESTORE_DUMP"

echo "Creating isolated temporary restore database..."
"${compose[@]}" exec -T postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" createdb -h 127.0.0.1 -U "$POSTGRES_USER" "$1"' sh "$restore_db"

echo "Restoring backup into $restore_db (production database is not modified)..."
"${compose[@]}" exec -T postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --exit-on-error --no-owner --no-privileges -h 127.0.0.1 -U "$POSTGRES_USER" -d "$1"' sh "$restore_db" \
  < "$RESTORE_DUMP"

table_count="$("${compose[@]}" exec -T postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$1" -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '''public''' AND table_type = '''BASE TABLE''';"' sh "$restore_db" | tr -d '[:space:]')"

if ! [[ "$table_count" =~ ^[0-9]+$ ]] || (( table_count < 10 )); then
  echo "Restore verification failed: expected at least 10 public tables, found $table_count." >&2
  exit 1
fi

echo "Restore verification PASSED: $table_count public tables restored."
echo "The temporary database will now be dropped. Production data was not changed."
