#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
export RESTOPASS_BACKUP_ENCRYPTION_KEY="test-encryption-key-0123456789abcdef"
export RESTOPASS_BACKUP_HMAC_KEY="test-hmac-key-0123456789abcdef"

mkdir -p "$TMP/source" "$TMP/restore"
printf 'database fixture\n' > "$TMP/source/database.dump"
mkdir -p "$TMP/uploads-fixture"
printf 'uploads fixture\n' > "$TMP/uploads-fixture/patron-photo.fixture"
tar -czf "$TMP/source/uploads.tar.gz" -C "$TMP/uploads-fixture" .
tar -czf "$TMP/archive.tar.gz" -C "$TMP/source" database.dump uploads.tar.gz
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 \
  -pass env:RESTOPASS_BACKUP_ENCRYPTION_KEY -in "$TMP/archive.tar.gz" -out "$TMP/backup.enc"
openssl dgst -sha256 -hmac "$RESTOPASS_BACKUP_HMAC_KEY" "$TMP/backup.enc" | awk '{print $NF}' > "$TMP/backup.enc.hmac"

sh "$ROOT/deploy/backup-verify.sh" "$TMP/backup.enc"
sh "$ROOT/deploy/restore.sh" "$TMP/backup.enc" "$TMP/restore"
cmp "$TMP/source/database.dump" "$TMP/restore/database.dump"
cmp "$TMP/source/uploads.tar.gz" "$TMP/restore/uploads.tar.gz"

cp "$TMP/backup.enc" "$TMP/valid-backup.enc"
cp "$TMP/backup.enc.hmac" "$TMP/valid-backup.enc.hmac"
printf 'tamper' >> "$TMP/backup.enc"
if sh "$ROOT/deploy/backup-verify.sh" "$TMP/backup.enc" >/dev/null 2>&1; then
  echo "Tampered backup unexpectedly passed integrity verification" >&2
  exit 1
fi
# Exercise the production healthcheck with a recent, authenticated local + remote copy.
mkdir -p "$TMP/bin" "$TMP/backups"
cp "$TMP/valid-backup.enc" "$TMP/backups/restopass-test.tar.gz.enc"
cp "$TMP/valid-backup.enc.hmac" "$TMP/backups/restopass-test.tar.gz.enc.hmac"
cat > "$TMP/bin/restopass-backup-verify" <<EOF
#!/bin/sh
sh "$ROOT/deploy/backup-verify.sh" "\$1"
EOF
chmod 0755 "$TMP/bin/restopass-backup-verify"
printf '%s' "$(date +%s)" > "$TMP/backups/.offsite-last-success"
RESTOPASS_BACKUP_DIR="$TMP/backups" RESTOPASS_BACKUP_REQUIRE_OFFSITE=true PATH="$TMP/bin:$PATH" \
  sh "$ROOT/deploy/backup-healthcheck.sh"
printf '1' > "$TMP/backups/.offsite-last-success"
if RESTOPASS_BACKUP_DIR="$TMP/backups" RESTOPASS_BACKUP_REQUIRE_OFFSITE=true PATH="$TMP/bin:$PATH" \
  sh "$ROOT/deploy/backup-healthcheck.sh" >/dev/null 2>&1; then
  echo "Stale off-site marker unexpectedly passed healthcheck" >&2
  exit 1
fi
# Simulate a private S3 bucket and verify that off-site restore downloads then validates both objects.
mkdir -p "$TMP/remote/restopass" "$TMP/restore-offsite"
cp "$TMP/valid-backup.enc" "$TMP/remote/restopass/restopass-test.tar.gz.enc"
cp "$TMP/valid-backup.enc.hmac" "$TMP/remote/restopass/restopass-test.tar.gz.enc.hmac"
cat > "$TMP/bin/aws" <<'EOF'
#!/bin/sh
set -eu
[ "$1" = "s3" ] && [ "$2" = "cp" ] || exit 2
src="$3"
dest="$4"
case "$src" in
  s3://test-bucket/*)
    key="${src#s3://test-bucket/}"
    cp "$RESTOPASS_TEST_REMOTE_ROOT/$key" "$dest"
    ;;
  *) echo "Unexpected mocked S3 source" >&2; exit 2 ;;
esac
EOF
chmod 0755 "$TMP/bin/aws"
RESTOPASS_TEST_REMOTE_ROOT="$TMP/remote" RESTOPASS_BACKUP_S3_BUCKET=test-bucket \
RESTOPASS_BACKUP_S3_PREFIX=restopass RESTOPASS_BACKUP_S3_ACCESS_KEY_ID=test-access \
RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY=test-secret RESTOPASS_BACKUP_ENCRYPTION_KEY="$RESTOPASS_BACKUP_ENCRYPTION_KEY" \
RESTOPASS_BACKUP_HMAC_KEY="$RESTOPASS_BACKUP_HMAC_KEY" PATH="$TMP/bin:$PATH" \
  sh "$ROOT/deploy/restore-offsite.sh" restopass-test.tar.gz.enc "$TMP/restore-offsite"
cmp "$TMP/source/database.dump" "$TMP/restore-offsite/database.dump"
cmp "$TMP/source/uploads.tar.gz" "$TMP/restore-offsite/uploads.tar.gz"

# Reproduce the production backup image layout: helper scripts are installed
# under restopass-* executable names, not their source filenames.
mkdir -p "$TMP/image-bin" "$TMP/image-restore"
cp "$ROOT/deploy/backup-verify.sh" "$TMP/image-bin/restopass-backup-verify"
cp "$ROOT/deploy/restore.sh" "$TMP/image-bin/restopass-restore"
cp "$ROOT/deploy/restore-offsite.sh" "$TMP/image-bin/restopass-restore-offsite"
cp "$ROOT/deploy/restore-drill.sh" "$TMP/image-bin/restopass-restore-drill"
chmod 0755 "$TMP/image-bin/"*
RESTOPASS_TEST_REMOTE_ROOT="$TMP/remote" RESTOPASS_BACKUP_S3_BUCKET=test-bucket \
RESTOPASS_BACKUP_S3_PREFIX=restopass RESTOPASS_BACKUP_S3_ACCESS_KEY_ID=test-access \
RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY=test-secret RESTOPASS_BACKUP_ENCRYPTION_KEY="$RESTOPASS_BACKUP_ENCRYPTION_KEY" \
RESTOPASS_BACKUP_HMAC_KEY="$RESTOPASS_BACKUP_HMAC_KEY" PATH="$TMP/bin:$TMP/image-bin:$PATH" \
  restopass-restore-offsite restopass-test.tar.gz.enc "$TMP/image-restore"
cmp "$TMP/source/database.dump" "$TMP/image-restore/database.dump"
cmp "$TMP/source/uploads.tar.gz" "$TMP/image-restore/uploads.tar.gz"

# Exercise the automated disaster recovery drill verification report
# A restore drill without an isolated database must fail rather than claim success.
if RESTOPASS_BACKUP_ENCRYPTION_KEY="$RESTOPASS_BACKUP_ENCRYPTION_KEY" \
RESTOPASS_BACKUP_HMAC_KEY="$RESTOPASS_BACKUP_HMAC_KEY" PATH="$TMP/bin:$TMP/image-bin:$PATH" \
  restopass-restore-drill "$TMP/valid-backup.enc" >/dev/null 2>&1; then
  echo "DR drill without an isolated target unexpectedly passed" >&2
  exit 1
fi

# Supplying a database URL alone is insufficient: the operator must explicitly
# attest that the target is disposable and isolated.
if RESTOPASS_BACKUP_ENCRYPTION_KEY="$RESTOPASS_BACKUP_ENCRYPTION_KEY" \
RESTOPASS_BACKUP_HMAC_KEY="$RESTOPASS_BACKUP_HMAC_KEY" PATH="$TMP/bin:$TMP/image-bin:$PATH" \
  restopass-restore-drill "$TMP/valid-backup.enc" "postgres://test:test@127.0.0.1/restopass_drill_test" >/dev/null 2>&1; then
  echo "DR drill without explicit isolation confirmation unexpectedly passed" >&2
  exit 1
fi

# Even explicit confirmation cannot target the configured application database.
if RESTOPASS_BACKUP_ENCRYPTION_KEY="$RESTOPASS_BACKUP_ENCRYPTION_KEY" \
RESTOPASS_BACKUP_HMAC_KEY="$RESTOPASS_BACKUP_HMAC_KEY" \
RESTOPASS_DR_RESTORE_TARGET_ISOLATED=true \
DATABASE_URL="postgres://test:test@127.0.0.1/restopass" \
PATH="$TMP/bin:$TMP/image-bin:$PATH" \
  restopass-restore-drill "$TMP/valid-backup.enc" "postgres://test:test@127.0.0.1/restopass" >/dev/null 2>&1; then
  echo "DR drill targeting DATABASE_URL unexpectedly passed" >&2
  exit 1
fi

# CI may validate archive integrity/structure, but the report must clearly state
# that this is not a database restore or production DR sign-off.
archive_report="$(RESTOPASS_BACKUP_ENCRYPTION_KEY="$RESTOPASS_BACKUP_ENCRYPTION_KEY" \
RESTOPASS_BACKUP_HMAC_KEY="$RESTOPASS_BACKUP_HMAC_KEY" PATH="$TMP/bin:$TMP/image-bin:$PATH" \
  restopass-restore-drill --archive-only "$TMP/valid-backup.enc")"
printf '%s\n' "$archive_report" | grep -q 'ARCHIVE VALIDATION ONLY'
printf '%s\n' "$archive_report" | grep -q 'NOT A DATABASE RESTORE'
if printf '%s\n' "$archive_report" | grep -q 'DISASTER RECOVERY RESTORE DRILL — SUCCESS'; then
  echo "Archive-only validation incorrectly claimed a successful restore" >&2
  exit 1
fi

# Exercise the successful DR-drill control path with mocked PostgreSQL clients.
# This validates script orchestration only; it is not evidence of a real DB restore.
cat > "$TMP/bin/pg_restore" <<'EOF'
#!/bin/sh
set -eu
case "$*" in *--dbname=postgres://isolated-target/*) ;; *) exit 3 ;; esac
EOF
cat > "$TMP/bin/psql" <<'EOF'
#!/bin/sh
set -eu
case "$*" in
  *to_regclass*) printf 'schema-ok\n' ;;
  *COUNT*) printf 'restaurants=1\ncustomers=2\nledger_entries=3\nscan_events=4\npending_approvals=5\n' ;;
  *) exit 4 ;;
esac
EOF
chmod 0755 "$TMP/bin/pg_restore" "$TMP/bin/psql"
restore_report="$(DATABASE_URL=postgres://production/live RESTOPASS_DR_RESTORE_TARGET_ISOLATED=true \
RESTOPASS_BACKUP_ENCRYPTION_KEY="$RESTOPASS_BACKUP_ENCRYPTION_KEY" \
RESTOPASS_BACKUP_HMAC_KEY="$RESTOPASS_BACKUP_HMAC_KEY" PATH="$TMP/bin:$TMP/image-bin:$PATH" \
  restopass-restore-drill "$TMP/valid-backup.enc" postgres://isolated-target/drill)"
printf '%s\n' "$restore_report" | grep -q 'DISASTER RECOVERY RESTORE DRILL — SUCCESS'
printf '%s\n' "$restore_report" | grep -q 'restaurants=1'
if DATABASE_URL=postgres://same/live TARGET_DATABASE_URL=postgres://same/live \
RESTOPASS_DR_RESTORE_TARGET_ISOLATED=true RESTOPASS_BACKUP_ENCRYPTION_KEY="$RESTOPASS_BACKUP_ENCRYPTION_KEY" \
RESTOPASS_BACKUP_HMAC_KEY="$RESTOPASS_BACKUP_HMAC_KEY" PATH="$TMP/bin:$TMP/image-bin:$PATH" \
  restopass-restore-drill "$TMP/valid-backup.enc" >/dev/null 2>&1; then
  echo "DR drill unexpectedly allowed restore into DATABASE_URL" >&2
  exit 1
fi

echo "Backup integrity, guarded restore, tamper rejection, off-site healthcheck, archive-only validation, mocked DR orchestration and source/container-layout restore tests passed."
