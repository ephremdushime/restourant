# RestoPass Disaster Recovery & Backup Restoration Runbook

This runbook defines the operational procedures for off-site backup configuration, automated replication verification, and isolated disaster recovery restoration drills for RestoPass.

---

## 1. Threat Model & Recovery Objectives

| Objective | Target | Operational Definition |
|---|---|---|
| **Recovery Time Objective (RTO)** | **< 15 minutes** | Total time elapsed from provisioning a replacement host to completing database restore, photo volume extraction, and readiness verification. |
| **Recovery Point Objective (RPO)** | **< 24 hours** | Maximum data loss window under automated daily scheduled backups (or < 5 minutes if an on-demand backup is triggered prior to planned maintenance). |
| **Integrity Guarantee** | **100% HMAC-SHA256** | Zero unverified archives: every backup carries an independent cryptographic sidecar verified before decryption. |

### Threat Scenarios Mitigated
1. **Primary Host Failure / Hardware Loss**: Total destruction of the VPS host or hypervisor outage.
2. **Database Corruption or Operational Error**: Accidental table drop, bad migration, or storage volume corruption.
3. **Ransomware / Host Compromise**: Attacker gains root on the application VM and attempts to destroy local data and overwrite backups. (Mitigation is effective only after S3 bucket versioning/Object Lock and separate least-privilege credentials have actually been configured and verified).

---

## 2. Authoritative Off-Site Backup Architecture (Google Drive via Rclone)

### A. Approved Architecture: Host-Level Paired Encrypted Off-Site Backups
RestoPass production uses **paired encrypted PostgreSQL + private patron-photo backups at 00:00 and 18:00 Africa/Kigali time**, synchronized to a dedicated Google Drive folder via `rclone`.

- **PostgreSQL Database Archive**: Encrypted custom-format database dump (`restopass_YYYYMMDDTHHMMSSZ.dump.enc`) with `.sha256` checksum and `.hmac` cryptographic sidecars.
- **Private Patron Photo Archive**: Encrypted tarball of all customer portraits (`restopass_photos_YYYYMMDDTHHMMSSZ.tar.gz.enc`) with `.sha256` checksum and `.hmac` cryptographic sidecars.
- **Atomic Paired Manifest**: `restopass_YYYYMMDDTHHMMSSZ.manifest` published remotely only after both database and photo archives pass byte-for-byte read-back verification.
- **Legacy S3 Profile Note**: The `legacy-s3-backup` profile in Docker Compose is deprecated and inactive by default. All production backups are executed via host cron (`deploy/install-backup-schedule.sh`).

### B. Remote Storage Configuration
1. Install `rclone` on the production Linux host.
2. Authenticate the dedicated Bestie / RestoPass Google Drive account:
   ```bash
   rclone config
   # Name remote: restopass-drive
   # Storage type: drive
   # Restrict config permissions:
   chmod 700 ~/.config/rclone
   chmod 600 ~/.config/rclone/rclone.conf
   ```
3. Set `.env` values:
   - `RESTOPASS_GOOGLE_DRIVE_REMOTE="restopass-drive:restopass-backups"`
   - `RESTOPASS_BACKUP_ENCRYPTION_KEY="<64-character-random-hex-key>"`
   - `RESTOPASS_BACKUP_RETENTION_DAYS="30"`

### C. Access Control & Encryption Guarantees
- Backups are encrypted with AES-256 before leaving the server.
- The Google account is secured with multi-factor authentication (MFA).
- The decryption key is stored independently off-host in a password manager and is never committed to Git or uploaded to Drive.
- `rclone` operates in append-and-readback mode; retention pruning is age-bounded (30 days default) and strictly isolated to the configured `restopass-backups` subfolder.

---

## 3. Cryptographic Architecture

Each backup package consists of paired timestamped artifacts:
1. `postgres/restopass_YYYYMMDDTHHMMSSZ.dump.enc`: AES-256 encrypted PostgreSQL 16 custom-format dump (`pg_dump -Fc`).
2. `postgres/restopass_YYYYMMDDTHHMMSSZ.dump.enc.hmac`: 64-hex HMAC-SHA256 sidecar.
3. `patron-photos/restopass_photos_YYYYMMDDTHHMMSSZ.tar.gz.enc`: AES-256 encrypted archive of all private patron photos.
4. `patron-photos/restopass_photos_YYYYMMDDTHHMMSSZ.tar.gz.enc.hmac`: 64-hex HMAC-SHA256 sidecar.
5. `restopass_YYYYMMDDTHHMMSSZ.manifest`: Format specification and artifact directory mapping.

### Secret Isolation
- `RESTOPASS_BACKUP_ENCRYPTION_KEY`: 64-hex random key (256-bit symmetric key).
- HMAC derivation: Uses a cryptographically derived key (`RESTOPASS_BACKUP_HMAC:${KEY}`) to ensure ciphertext authenticity.
- **Rule**: Decryption keys must remain outside the production server and off Google Drive.

---

## 4. Automated Verification & Health Monitoring

The host cron schedule (`deploy/install-backup-schedule.sh`) executes:
1. **Daily Paired Backups (00:00 & 18:00 Africa/Kigali)**:
   - `deploy/backup-all.sh` dumps PostgreSQL and compresses patron photos.
   - Computes SHA-256 and HMAC sidecars.
   - Uploads archives to Google Drive (`rclone copyto`).
   - Downloads each remote archive to a temporary directory and verifies byte-for-byte matching (`cmp -s`).
   - Publishes the `.manifest` file locally and remotely.
   - Prunes local and remote archives older than `RESTOPASS_BACKUP_RETENTION_DAYS`.
2. **Weekly Off-Site Recovery Verification (Sunday 04:00 Africa/Kigali)**:
   - `deploy/verify-latest-paired-backup.sh` downloads the latest paired backup from Google Drive.
   - Validates the manifest and HMAC sidecars.
   - Restores PostgreSQL into an isolated disposable test database and checks tables.
   - Extracts patron photos into an isolated temporary directory and verifies file readability.
   - Drops the temporary database and cleans up temporary extraction folders.

---

## 5. Step-by-Step Restoration Drill Procedure

Perform this drill in an isolated staging environment prior to commercial launch, and repeat quarterly.

### Step 1: Download Off-Site Backup from Google Drive
On the staging or recovery host:

```bash
# Verify rclone connectivity
rclone lsf restopass-drive:restopass-backups/

# Download the latest paired backup manifest and artifacts
bash deploy/verify-latest-paired-backup.sh
```

Or download manually for targeted timestamp recovery:

```bash
export TIMESTAMP="20261113T180000Z"
export REMOTE="restopass-drive:restopass-backups/2026/11/13/$TIMESTAMP"
mkdir -p /tmp/dr-recovery/{postgres,patron-photos}

rclone copyto "$REMOTE/postgres/restopass_$TIMESTAMP.dump.enc" /tmp/dr-recovery/postgres/backup.enc
rclone copyto "$REMOTE/postgres/restopass_$TIMESTAMP.dump.enc.hmac" /tmp/dr-recovery/postgres/backup.enc.hmac
rclone copyto "$REMOTE/patron-photos/restopass_photos_$TIMESTAMP.tar.gz.enc" /tmp/dr-recovery/patron-photos/photos.enc
rclone copyto "$REMOTE/patron-photos/restopass_photos_$TIMESTAMP.tar.gz.enc.hmac" /tmp/dr-recovery/patron-photos/photos.enc.hmac
```

### Step 2: Execute Automated Restoration Drill
Run the automated verification drill utility:

```bash
export TARGET_DATABASE_URL="postgres://restopass:staging_pass@staging-pg:5432/restopass_drill_20261105"
# The target must be disposable, isolated, and its database name must contain "drill".
# Set this only after verifying the target host/database is not production.
export RESTOPASS_DR_RESTORE_TARGET_ISOLATED=true
sh deploy/restore-drill.sh /tmp/dr-recovery/backup.enc "$TARGET_DATABASE_URL"
```

The script will automatically:
1. Verify the HMAC-SHA256 signature sidecar.
2. Decrypt the AES-256-CBC payload.
3. Verify top-level archive members (`database.dump` and `uploads.tar.gz`).
4. Validate the uploads archive can be listed without extracting untrusted paths or symlinks; the script reports the archive member count.
5. Confirm the explicit isolation attestation and require the target database name to contain `drill`; restore `database.dump` via `pg_restore`, then check required RestoPass tables and read row counts.
6. Output a measured database restore duration and backup timestamp reference. The script does not calculate actual RPO, restore the live uploads volume, or prove application-level recovery.

### Step 3A: Restore Uploads into an Isolated Private Volume

The drill validates the upload archive but deliberately does not modify any application volume. To test upload restoration separately:

```bash
mkdir -p /tmp/dr-recovery/artifacts
sh deploy/restore.sh /tmp/dr-recovery/backup.enc /tmp/dr-recovery/artifacts

# Extract only into a new, isolated, empty uploads directory.
mkdir -p /tmp/restopass-uploads-drill
tar -xzf /tmp/dr-recovery/artifacts/uploads.tar.gz -C /tmp/restopass-uploads-drill

# Inspect the recovered file count and representative file readability.
find /tmp/restopass-uploads-drill -type f | wc -l
find /tmp/restopass-uploads-drill -type f -maxdepth 3 -print | head -20
```

Do not extract over the live production uploads directory during a drill. The operator must verify representative images through the application in isolated staging before declaring recovery complete.

### Step 3: Financial & Ledger Reconciliation Audit
Connect to the staging PostgreSQL instance and verify financial ledger continuity:

```sql
-- 1. Verify ledger sum equals current customer balances
WITH calculated_balances AS (
  SELECT customer_id, SUM(plates_delta) AS calc_balance
  FROM ledger_entries
  GROUP BY customer_id
),
checkpoint_balances AS (
  SELECT DISTINCT ON (customer_id) customer_id, balance
  FROM balance_checkpoints
  ORDER BY customer_id, cutoff_timestamp DESC
)
SELECT
  c.id, c.member_no,
  COALESCE(cb.balance, 0) AS checkpoint_bal,
  COALESCE(calc.calc_balance, 0) AS total_ledger_bal
FROM customers c
LEFT JOIN checkpoint_balances cb ON cb.customer_id = c.id
LEFT JOIN calculated_balances calc ON calc.customer_id = c.id;

-- 2. Inventory row counts for public application tables
SELECT table_name, (xpath('/row/cnt/text()', xml_count))[1]::text::int AS row_count
FROM (
  SELECT table_name,
         query_to_xml(format('SELECT COUNT(*) AS cnt FROM %I', table_name), false, true, '') AS xml_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
) t;
```

### Step 4: Record Actual Drill Evidence in Operator Audit Log

Complete this record only after an operator has run the drill against a disposable database and verified the application-level recovery. Do not pre-fill sample dates, timings, row counts or success claims.

- **Date & Time (UTC):** Pending actual drill
- **Drill Operator:** Pending
- **Source Archive:** Pending actual archive name
- **Target:** Disposable isolated PostgreSQL database (identify host/database without exposing credentials)
- **Measured RTO:** Pending measurement from the agreed recovery start point through readiness verification
- **Measured RPO:** Pending; calculate from the latest recoverable backup timestamp versus the incident/recovery point
- **Database restore:** Pending; attach command output and required-table/row-count evidence
- **Uploads restore:** Pending; restore the extracted archive into an isolated private uploads volume and verify representative files
- **Financial reconciliation:** Pending; attach ledger/balance reconciliation output
- **Integrity Status:** Pending actual verification
- **Evidence location:** Pending

The numerical RTO/RPO values in Section 1 are **targets, not measured results**. The repository currently contains no evidence of a completed production or off-site restore drill.
