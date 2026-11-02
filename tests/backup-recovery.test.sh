#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
export RESTOPASS_BACKUP_ENCRYPTION_KEY="test-encryption-key-0123456789abcdef"
export RESTOPASS_BACKUP_HMAC_KEY="test-hmac-key-0123456789abcdef"

mkdir -p "$TMP/source" "$TMP/restore"
printf 'database fixture\n' > "$TMP/source/database.dump"
printf 'uploads fixture\n' > "$TMP/source/uploads.tar.gz"
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
echo "Backup integrity, guarded restore, tamper rejection and off-site healthcheck tests passed."
