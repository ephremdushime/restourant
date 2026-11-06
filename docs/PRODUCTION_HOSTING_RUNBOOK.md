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
- Persistent SSD storage with enough capacity for the database, uploads and retained backups.
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

The PostgreSQL backup script streams a custom-format dump through AES-256-CBC encryption (PBKDF2, 600,000 iterations) before writing it to disk. It writes a SHA-256 transfer checksum and a separate HMAC-SHA256 authentication tag, restricts local file permissions and applies a default 14-day local retention period. The encryption key must be stored separately from the backup files:

    bash deploy/backup-postgres.sh

Verify a backup by restoring it into a temporary database. This does not modify the live production database:

    bash deploy/verify-postgres-backup.sh backups/postgres/restopass_YYYYMMDDTHHMMSSZ.dump.enc

Schedule the backup script at least daily using the host's scheduler. **The script creates a local backup only.** Copy the encrypted dump, `.sha256` checksum and `.hmac` tag to a separate, access-controlled off-server location. Store `RESTOPASS_BACKUP_ENCRYPTION_KEY` in a separate password manager or secret manager; losing that key makes the backup unrecoverable. A backup on the same VPS is not disaster recovery. Perform and record a restore verification at least weekly and after schema migrations.

Also protect the persistent Docker volumes for PostgreSQL and customer uploads. Do not treat container images or the app's local JSON snapshot as a backup strategy.

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
- [ ] Backup created and restore drill completed successfully.
- [ ] Off-server backup copy confirmed.
- [ ] Customer registration, approval, PIN activation, login and recovery smoke-tested.
- [ ] Scanner success, replay rejection, offline queue and reconnection tested on the actual devices.
- [ ] Concurrent balance deductions and transfers tested against the hosted database.
- [ ] Tenant isolation and role permissions reviewed using separate test accounts.
- [ ] Monitoring, disk alerts, log retention and incident contacts configured.
- [ ] MTN checkout remains disabled until the separate payment release gate is passed.

A green CI run proves the checks that CI actually executes; it does not prove the host, reverse proxy, DNS, external backups, real scanner hardware, regulatory approvals or MTN settlement flow.
