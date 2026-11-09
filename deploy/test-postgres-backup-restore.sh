#!/usr/bin/env sh
set -eu
umask 077

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:?Set PGPASSWORD for the disposable PostgreSQL test service}"

source_db="restopass_backup_source_$$"
restore_db="restopass_backup_restore_$$"
tmp_dir="$(mktemp -d)"
backup_file="$tmp_dir/restopass.dump.enc"
dump_file="$tmp_dir/restopass.dump"
export RESTOPASS_BACKUP_ENCRYPTION_KEY="$(openssl rand -hex 32)"
hmac_key="$(printf 'RESTOPASS_BACKUP_HMAC:%s' "$RESTOPASS_BACKUP_ENCRYPTION_KEY" | sha256sum | awk '{print $1}')"

cleanup() {
  dropdb --if-exists -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$restore_db" >/dev/null 2>&1 || true
  dropdb --if-exists -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$source_db" >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$source_db"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$source_db" -v ON_ERROR_STOP=1 \
  -c 'CREATE TABLE backup_restore_fixture (fixture_id TEXT PRIMARY KEY, payload TEXT NOT NULL)' \
  -c "INSERT INTO backup_restore_fixture VALUES ('restopass-restore-proof', 'encrypted backup round trip')"

pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$source_db" \
  --format=custom --no-owner --no-acl \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 \
      -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY > "$backup_file"

test -s "$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"
openssl dgst -sha256 -hmac "$hmac_key" "$backup_file" | awk '{print $NF}' > "$backup_file.hmac"
(cd "$tmp_dir" && sha256sum -c "$(basename "$backup_file").sha256")
actual_hmac="$(openssl dgst -sha256 -hmac "$hmac_key" "$backup_file" | awk '{print $NF}')"
expected_hmac="$(tr -d '[:space:]' < "$backup_file.hmac")"
test "$actual_hmac" = "$expected_hmac"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY -in "$backup_file" -out "$dump_file"
test -s "$dump_file"

createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$restore_db"
pg_restore --exit-on-error --no-owner --no-privileges \
  -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$restore_db" "$dump_file"

restored_value="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$restore_db" -At \
  -c "SELECT payload FROM backup_restore_fixture WHERE fixture_id = 'restopass-restore-proof'")"
test "$restored_value" = 'encrypted backup round trip'

echo "PASS: PostgreSQL dump encrypted, checksum/HMAC verified, decrypted and restored into an isolated database."
