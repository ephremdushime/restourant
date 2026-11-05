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

## 2. Dedicated Off-Site Backup Bucket Architecture

### A. Separation of Concerns
- **Patron Photo Storage (`S3_*`)**: Stores customer avatars and photo IDs. Managed by the application layer.
- **Off-Site Backups (`RESTOPASS_BACKUP_S3_*`)**: Stores encrypted PostgreSQL dumps and upload archives. Managed exclusively by the backup worker.
- **Mandatory Rule**: The backup bucket credentials must be dedicated and separate from the photo storage credentials.

### B. Supported Providers
- **AWS S3**: Standard S3 bucket with Object Lock or lifecycle rules.
- **Cloudflare R2**: Zero-egress S3-compatible bucket (set `RESTOPASS_BACKUP_S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"`).
- **DigitalOcean Spaces**: Set `RESTOPASS_BACKUP_S3_ENDPOINT="https://<region>.digitaloceanspaces.com"`.
- **MinIO**: Self-hosted private S3 server on an independent network.

### C. Least-Privilege IAM Policy
Configure the backup service user with permissions strictly limited to the backup prefix. Deny `s3:DeleteObject` to prevent an attacker on a compromised host from purging remote backups:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RestoPassBackupAppendOnly",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::restopass-backups-private",
        "arn:aws:s3:::restopass-backups-private/restopass/*"
      ]
    }
  ]
}
```

### D. Immutability & Retention
- **Enable Bucket Versioning**: Ensures overwriting an object preserves prior versions.
- **Enable Object Lock (WORM)**: Configure Compliance or Governance mode with a 30-day retention period.
- **Lifecycle Expiration**: Configure non-current versions to expire automatically after 30 days.

---

## 3. Cryptographic Architecture

Each backup package consists of two files:
1. `restopass-YYYYMMDDTHHMMSSZ.tar.gz.enc`: AES-256-CBC encrypted archive containing:
   - `database.dump`: Authoritative PostgreSQL 16 custom-format dump (`pg_dump -Fc`).
   - `uploads.tar.gz`: Gzipped archive of patron photo uploads.
2. `restopass-YYYYMMDDTHHMMSSZ.tar.gz.enc.hmac`: 64-hex-character HMAC-SHA256 sidecar.

### Secret Isolation
- `RESTOPASS_BACKUP_ENCRYPTION_KEY`: Minimum 32-character passphrase used with PBKDF2 (200,000 iterations, random salt, SHA-256).
- `RESTOPASS_BACKUP_HMAC_KEY`: Minimum 32-character key used for HMAC-SHA256 calculation.
- **Rule**: Both keys must be completely distinct from each other and stored in an off-host secrets vault (e.g. 1Password, Bitwarden, AWS Secrets Manager).

---

## 4. Automated Verification & Health Monitoring

The backup container (`deploy/backup.Dockerfile`) runs continuous background operations:
1. Every 24 hours (`BACKUP_INTERVAL_SECONDS=86400`), it dumps PostgreSQL, archives uploads, encrypts, and signs.
2. Uploads the encrypted archive and `.hmac` sidecar to S3.
3. Immediately downloads the uploaded remote object and verifies:
   - HMAC integrity signature matches.
   - Byte-for-byte equality (`cmp -s`) between local and remote copies.
4. Writes a timestamp to `/backups/.offsite-last-success`.
5. Prunes local archives older than `BACKUP_RETENTION_DAYS=14`.

### Healthcheck Gate
The healthcheck script (`deploy/backup-healthcheck.sh`):
- Verifies a local backup exists within the last 48 hours.
- Verifies HMAC sidecar integrity.
- Verifies off-site replication occurred within 48 hours.
- **If the healthcheck fails**: Container status becomes `unhealthy`. Caddy reverse proxy fails closed, preventing unbacked production operations.

---

## 5. Step-by-Step Restoration Drill Procedure

Perform this drill in an isolated staging environment prior to commercial launch, and repeat quarterly.

### Step 1: Download Off-Site Backup
On the staging or recovery host:

```bash
export RESTOPASS_BACKUP_S3_BUCKET="restopass-backups-private"
export RESTOPASS_BACKUP_S3_ACCESS_KEY_ID="YOUR_ACCESS_KEY"
export RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY="YOUR_SECRET_KEY"
export RESTOPASS_BACKUP_S3_REGION="us-east-1"
export RESTOPASS_BACKUP_ENCRYPTION_KEY="YOUR_32_CHAR_ENCRYPTION_KEY"
export RESTOPASS_BACKUP_HMAC_KEY="YOUR_32_CHAR_HMAC_KEY"

# Download the specific backup file and its HMAC sidecar into an empty directory
mkdir -p /tmp/dr-recovery
aws s3 cp s3://restopass-backups-private/restopass/restopass-YYYYMMDDTHHMMSSZ.tar.gz.enc /tmp/dr-recovery/backup.enc
aws s3 cp s3://restopass-backups-private/restopass/restopass-YYYYMMDDTHHMMSSZ.tar.gz.enc.hmac /tmp/dr-recovery/backup.enc.hmac

# Use the exact same timestamped object name for both files. For an S3-compatible
# provider, add --endpoint-url https://YOUR-S3-ENDPOINT to each aws command.
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
