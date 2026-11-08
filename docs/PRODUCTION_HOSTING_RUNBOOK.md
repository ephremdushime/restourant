# RestoPass Production Hosting Runbook

## 1. Supported launch topology

The current release is designed for **one cloud application instance** backed by PostgreSQL and Redis. Do not deploy multiple app replicas or enable autoscaling yet: several workflows still maintain an in-process application-state snapshot, and those workflows are not a multi-writer database architecture.

The included Compose limits are a starting point for a small controlled pilot:

| Container | CPU limit | Memory limit |
|---|---:|---:|
| RestoPass app | 1.0 CPU | 1,024 MB |
| PostgreSQL | 1.0 CPU | 1,024 MB |
| Redis | 0.5 CPU | 256 MB |

A 4 GB VPS can accommodate this **single-instance pilot configuration** if the host has sufficient remaining memory and disk. It is not a validated 50,000-DAU capacity claim. Monitor memory, CPU, database connections, disk use and latency before increasing traffic.

## 2. Host prerequisites

- Ubuntu LTS or another supported Linux distribution.
- Docker Engine and Docker Compose plugin.
- A static public IP and DNS record for the production hostname.
- At least 4 GB RAM for the pilot profile; 2 vCPU is a practical starting point.
- Persistent SSD storage with enough capacity for the database, private patron photos under the app data volume, and retained backups.
- A reverse proxy (Nginx or Caddy) terminating HTTPS in front of the app.

The app is published only on host loopback at 127.0.0.1:3000. PostgreSQL and Redis are not published on host ports; they are reachable only over the private Compose data network. The host firewall should expose only SSH (restricted to administrator IPs where possible), HTTP and HTTPS. Never expose ports 3000, 5432 or 6379 publicly.

## 3. Configure production secrets

From the repository root:

    cp .env.example .env
    chmod 600 .env

Generate independent random secrets. Do not reuse the examples in .env.example:

    openssl rand -hex 32   # SESSION_SECRET
    openssl rand -hex 32   # RESTOPASS_MASTER_SECRET
    openssl rand -hex 32   # POSTGRES_PASSWORD
    openssl rand -hex 32   # REDIS_PASSWORD
    openssl rand -hex 24   # RESTOPASS_SUPERADMIN_PASSWORD
    openssl rand -hex 24   # unique password for each restaurant administrator
    openssl rand -hex 32   # RESTOPASS_BACKUP_ENCRYPTION_KEY

Set these values in the root .env file:

- NODE_ENV=production
- RESTOPASS_DEPLOYMENT_MODE=cloud
- SESSION_SECRET, RESTOPASS_MASTER_SECRET
- RESTOPASS_SUPERADMIN_PASSWORD
- RESTOPASS_RESTAURANT_ADMIN_ACCOUNTS: JSON keyed by restaurant code, with a unique username and password (16+ characters; 32+ recommended) for each tenant, for example `{"RW01":{"username":"manager@restaurant.rw","password":"<unique-secret>"}}`.
- RESTOPASS_BACKUP_ENCRYPTION_KEY: 64-character random hex key; store a recovery copy separately from the VPS and backup files.
- POSTGRES_PASSWORD, REDIS_PASSWORD
- TRUST_PROXY=loopback only when a host-local reverse proxy is the sole trusted proxy. Otherwise configure the exact trusted proxy topology; do not blindly trust all forwarded headers.
- Keep MTN_COLLECTIONS_ENABLED=false until the MTN Collections adapter and reconciliation tests are implemented.

The Compose stack uses PostgreSQL on a private Docker network and explicitly sets PGSSLMODE=disable with ALLOW_INSECURE_DB_TLS=true for that internal connection. Do not reuse that exception for a database reached over a public or untrusted network. For a managed/external database, use TLS certificate verification (verify-full) and remove the insecure-TLS exception.

Production restaurant-admin credentials are configured per tenant. The login username is fixed to the configured tenant account, and changing its username or password invalidates existing administrator sessions. This is one administrator account per tenant; multiple named administrators within one restaurant still require a dedicated account-management workflow.

## 4. Validate and start

Run all commands from the repository root:

    docker compose --project-directory . --env-file .env -f deploy/docker-compose.prod.yml config --quiet
    docker compose --project-directory . --env-file .env -f deploy/docker-compose.prod.yml up -d --build
    docker compose --project-directory . --env-file .env -f deploy/docker-compose.prod.yml ps
    curl --fail http://127.0.0.1:3000/api/health
    curl --fail http://127.0.0.1:3000/api/ready

/api/health is a liveness check. /api/ready verifies application state and any configured PostgreSQL/Redis dependencies. The app container health check uses readiness, so a dependency failure should make the container unhealthy rather than silently appear ready.

Configure the reverse proxy to forward HTTPS requests to http://127.0.0.1:3000. Enable automatic certificate renewal and verify redirects, TLS configuration and security headers from an external network before sharing the domain.

## 5. Backups and restore drills

RestoPass production uses **paired encrypted PostgreSQL + private-photo backups at 00:00 and 18:00 Africa/Kigali time**, uploaded to a dedicated Google Drive account. These are fixed daily windows selected around restaurant operating periods. The gap is six hours from midnight to 18:00 on the same day only when interpreted across the clock boundary? The actual schedule alternates 6 and 18 hours; plan for a maximum nominal RPO exposure of 18 hours. This is not a 12-hour maximum. Missed or failed jobs increase the exposure until a successful backup completes.

### Google Drive configuration

Install `rclone` and `cron` on the VPS. Configure an OAuth-backed Google Drive remote while logged in as the dedicated Linux deployment user:

    rclone config

Create a remote named `restopass-drive` using the Google Drive provider and authorize a dedicated Bestie/RestoPass Google account. Do not use a service-account JSON file as a substitute for Drive OAuth unless the Drive storage and sharing model has been explicitly validated. Protect the rclone configuration (it contains refresh credentials):

    chmod 700 ~/.config/rclone
    chmod 600 ~/.config/rclone/rclone.conf
    rclone lsd restopass-drive:

Set these production `.env` values:

- `RESTOPASS_GOOGLE_DRIVE_REMOTE=restopass-drive:restopass-backups`
- `RCLONE_CONFIG=/home/<deployment-user>/.config/rclone/rclone.conf` (optional; defaults to the current user's rclone config)
- `RESTOPASS_BACKUP_ENCRYPTION_KEY`: 64-character random hex key, stored separately in a password manager/secret manager.
- `RESTOPASS_BACKUP_RETENTION_DAYS=30`

The OAuth configuration and encryption key must never be committed to Git, stored inside the repository, or included in backup archives. Restrict the Google account with MFA and limit access to authorized operators. Google Drive is a separate off-site copy, not a substitute for storing the decryption key independently.

### Schedule and execution

Run as the same Linux user that owns the deployment, can access Docker Compose, and owns the rclone OAuth configuration:

    bash deploy/install-backup-schedule.sh
    bash deploy/backup-all.sh

The installer creates an idempotent user crontab using `CRON_TZ=Africa/Kigali`:

- Every day at **00:00**.
- Every day at **18:00**.
- Weekly off-site recovery verification Sunday at 04:00.

Confirm that the host cron implementation supports `CRON_TZ`; otherwise set the host timezone to Africa/Kigali or configure the equivalent UTC schedule. Verify the installed crontab and inspect `backups/logs/backup.log` and `backups/logs/verify.log`.

Each scheduled run creates PostgreSQL and private-photo archives with the same UTC timestamp. PostgreSQL custom-format dumps and photo archives are encrypted before upload. SHA-256 checksums and HMAC-SHA256 authentication tags are retained as sidecars. The coordinator validates the local artifacts, uploads each artifact to the date/timestamp folder in Google Drive, downloads each uploaded object again and compares it byte-for-byte, then uploads the paired manifest **last**. A manifest is the completion marker; a folder without its manifest is incomplete and must not be treated as a valid recovery point. A process lock prevents overlapping backup and verification jobs.

The scripts retain local encrypted database, photo and manifest artifacts for 30 days by default. Remote Google Drive retention must be managed through the dedicated backup account's storage policy and reviewed periodically; do not configure automatic remote deletion until the retention policy and recovery requirements have been confirmed. The provider-managed monthly backup is an additional independent recovery layer.

### Recovery verification and restore

The weekly verifier downloads the latest completed paired backup from Google Drive, validates the manifest, and invokes the existing PostgreSQL and photo verification routines. PostgreSQL verification decrypts the dump and restores it into a temporary database in the production PostgreSQL service, then drops that temporary database; it does not overwrite the live application database. Photo verification decrypts and extracts into isolated temporary storage. A full disaster-recovery drill should additionally restore to a separate disposable staging host/database and run application smoke tests. Record restore duration, recovered timestamp, schema/table checks and application test results.

Manual commands:

    bash deploy/verify-latest-paired-backup.sh
    bash deploy/verify-postgres-backup.sh backups/postgres/restopass_YYYYMMDDTHHMMSSZ.dump.enc
    bash deploy/verify-patron-photo-backup.sh backups/patron-photos/restopass_photos_YYYYMMDDTHHMMSSZ.tar.gz.enc

Never point a restore drill at the production database. Keep encryption keys outside the server and Google Drive; a backup without its key is unrecoverable. Alert on any non-zero backup/verification exit and retry failures promptly. A successful upload or checksum alone is not proof of recoverability; require the weekly isolated verification and monthly full recovery exercise.

Private patron portraits are stored outside the web root under the persistent app data volume. PostgreSQL dumps alone are insufficient: restore the paired photo archive from the same timestamp to preserve the relationship between photo keys and records. The photo restore command replaces the live local photo directory, so pause uploads and preserve any newer files before a production recovery. Never enable public bucket access, public-read ACLs, CDN URL prefixes, or static `/uploads` serving.

## 6. Payment and feature gates

- Customer Mobile Money checkout currently returns HTTP 503 intentionally.
- The payment callback endpoint is disabled intentionally.
- No client-supplied payment status or screenshot is proof of payment.
- Do not set MTN_COLLECTIONS_ENABLED=true or advertise online subscription checkout until MTN RequestToPay, provider transaction-status reconciliation, product-specific subscription activation, idempotency and sandbox UAT are complete.
- Restaurant subscription billing and customer dashboard subscription billing must remain distinct products. Meal/food payments remain directly between customers and restaurants.

## 7. Release checklist

Before calling the hosted instance production-ready, record evidence for each item:

- [ ] Production secrets configured and stored securely; .env permissions verified.
- [ ] DNS, HTTPS, reverse proxy and firewall verified externally.
- [ ] PostgreSQL and Redis remain private; only HTTPS is publicly exposed.
- [ ] /api/ready returns HTTP 200 after startup and becomes unhealthy if a dependency is stopped.
- [ ] PostgreSQL and Redis integration CI passes.
- [ ] Daily paired backup cron installed and a manual run completed successfully.
- [ ] Off-site bucket is private, versioned where supported, and has an appropriate lifecycle retention policy.
- [ ] Off-site completion manifest and all six encrypted artifacts confirmed.
- [ ] Weekly off-site recovery-verification log shows successful temporary PostgreSQL restore and isolated photo extraction.
- [ ] Full host rebuild/restore drill completed and documented.
- [ ] Customer registration, approval, PIN activation, login and recovery smoke-tested.
- [ ] Scanner success, replay rejection, offline queue and reconnection tested on the actual devices.
- [ ] Concurrent balance deductions and transfers tested against the hosted database.
- [ ] Tenant isolation and role permissions reviewed using separate test accounts.
- [ ] Monitoring, disk alerts, log retention and incident contacts configured.
- [ ] MTN checkout remains disabled until the separate payment release gate is passed.

A green CI run proves the checks that CI actually executes; it does not prove the host, reverse proxy, DNS, external backups, real scanner hardware, regulatory approvals or MTN settlement flow.
