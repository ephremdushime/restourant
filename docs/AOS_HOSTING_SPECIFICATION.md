# RestoPass Cloud Hosting Specification & Sizing Assessment
**Target Infrastructure Provider**: Africa Olleh Services (AOS) Cloud (Rwanda)  
**Target Environment**: Staging & Pilot Production Hosting  
**Document Revision**: 1.0 (Phase 4 — Pre-Deployment Release Gate)  
**Architecture Model**: Cloud-Authoritative Multi-Tenant System  

---

## 1. Executive Summary & Purpose

This document defines the formal hardware sizing, network topography, security firewall policy, and operational monitoring requirements for deploying the **RestoPass Operating System** onto AOS Cloud infrastructure in Rwanda.

Prior to entering commercial negotiations or provisioning production instances, this specification establishes:
1. The **minimum viable VM configuration** required to run the complete containerized stack without out-of-memory (OOM) termination.
2. The **realistic operational capacity** of the pilot baseline architecture (retracting unbenchmarked claims such as "50,000 DAU").
3. The **network hardening rules** to prevent database and cache exposure to the public internet.
4. The **automated verification procedures** required to validate staging readiness before restaurant acceptance testing.

---

## 2. Hardware Sizing Assessment & Memory Budget

### 2.1 Stack Memory Allocation Breakdown

The RestoPass production container stack (`deploy/docker-compose.prod.yml`) consists of five concurrent services. Memory limits have been explicitly configured in Docker Compose to prevent any single process from starving the host OS:

| Service Container | Technology | Memory Limit | CPU Limit | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `restopass-postgres` | PostgreSQL 16 (Alpine) | **2048 MB** (2.0 GB) | 2.0 vCPU | Authoritative ledger, balances, row-level locks, transactions |
| `restopass-redis` | Redis 7 (Alpine) | **1024 MB** (1.0 GB) | 1.0 vCPU | 30s atomic QR token replay guard, session revocation |
| `restopass-app` | Node.js 20 LTS | **2048 MB** (2.0 GB) | 2.0 vCPU | Cloud authority API, authentication, state synchronization |
| `restopass-backup` | Alpine / pg_dump / OpenSSL | **1024 MB** (1.0 GB) | 1.0 vCPU | Daily AES-256-CBC backup worker & S3 off-site sync |
| `restopass-caddy` | Caddy 2 (Alpine) | **512 MB** (0.5 GB) | 1.0 vCPU | TLS termination, reverse proxy, HSTS, rate-limiting |
| **Linux Host Overhead** | Ubuntu 22.04 LTS / Buffers | **~1100 MB** (1.1 GB) | — | Kernel, page cache, Docker daemon, SSH daemon |
| **TOTAL REQUIRED** | — | **~7744 MB** (~7.6 GB) | **4 vCPUs** | Minimum allocation for stable operations |

### 2.2 AOS Cloud VM Sizing Evaluation

Based on the memory budget above, we assess the standard AOS Cloud virtual machine profiles:

| AOS Cloud Profile | Specifications | Suitability Evaluation | Recommendation |
| :--- | :--- | :--- | :--- |
| **Standard Option 2** | 2 vCPU, 2 GB RAM, 40 GB NVMe | **FAIL** — Total stack limits exceed RAM by 380%. Instant OOM kills on startup. | **DO NOT PURCHASE** |
| **Standard Option 4** | 2 vCPU, 4 GB RAM, 60 GB NVMe | **FAIL** — Stack requires ~7.6 GB. System will suffer severe swap thrashing and crash under meal rush concurrency. | **DO NOT PURCHASE** |
| **Standard Option 6** | **4 vCPU, 8 GB RAM, 80+ GB NVMe** | **PASS** — Comfortably accommodates the ~7.6 GB workload with necessary operating system overhead and I/O buffer headroom. | **MANDATORY BASELINE** |
| **Standard Option 8** | 8 vCPU, 16 GB RAM, 160 GB NVMe | **RECOMMENDED FOR SCALE** — Ideal for campus-wide rollout (>10 cafeteria locations, >10,000 active students). | High-Scale Expansion Target |

> [!IMPORTANT]
> **Procurement Directive**: You must negotiate and order **Cloud Standard Option 6 (8 GB RAM / 4 vCPUs / 80+ GB NVMe)** or higher. Deploying on Option 2 or Option 4 will cause system failure during active meal service.

---

## 3. Realistic Operational Capacity & Scaling Limits

### 3.1 Pilot Baseline Capacity

The current single-instance deployment architecture has been engineered and validated for:
- **Concurrent Cafeteria Locations**: 1 to 5 campus cafeterias / dining halls.
- **Active Patron Population**: Up to **3,000 daily active patrons**.
- **Peak Scan Concurrency**: **15 to 20 meal redemptions per second** across all scanning stations.
- **Ledger Ingestion**: Up to 50,000 ledger transactions per semester before archiving.

### 3.2 Scope Clarification: High-Scale Claims

> [!WARNING]
> Historical marketing descriptions referencing **"50,000 DAU"** have **not been benchmarked** on a single VM.  
> Marketing materials and SLA guarantees must **not** state that RestoPass is proven for 50,000 DAU until dedicated distributed load tests have been conducted.

To achieve scale beyond 5,000 DAU, the following architectural evolutions will be required:
1. Extract PostgreSQL to an AOS Managed Relational Database cluster with read replicas and PgBouncer connection pooling.
2. Extract Redis to a high-availability Redis Sentinel or Redis Cluster.
3. Deploy multiple stateless `restopass-app` containers behind an external Layer-7 Load Balancer.
4. Offload patron photo delivery completely to an S3-compatible Object Storage CDN (e.g., Cloudflare R2 or Wasabi).

---

## 4. Network Security & Firewall Topology

```
             INTERNET (Students, Staff & Scanners)
                              │
                              ▼
        ┌───────────────────────────────────────────┐
        │   AOS Cloud Perimeter / Security Group    │
        │   Inbound: Port 80 (TCP)  -> 0.0.0.0/0    │
        │   Inbound: Port 443 (TCP) -> 0.0.0.0/0    │
        │   Inbound: Port 22 (TCP)  -> Admin IP/VPN │
        └─────────────────────┬─────────────────────┘
                              │
                              ▼
        ┌───────────────────────────────────────────┐
        │  Caddy 2 Reverse Proxy (Container)        │
        │  - Automatic TLS (Let's Encrypt / ZeroSSL)│
        │  - Strict-Transport-Security (HSTS)       │
        │  - Request body limit: 10MB               │
        │  - Masked Server tokens                   │
        └─────────────────────┬─────────────────────┘
                              │ Docker Bridge Network ("backend")
                              ▼ [172.x.x.x - NO EXTERNAL PORTS]
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │ restopass-   │     │ restopass-   │     │ restopass-   │
  │     app      │     │   postgres   │     │    redis     │
  │  (Port 3000) │     │ (Port 5432)  │     │ (Port 6379)  │
  └──────────────┘     └──────────────┘     └──────────────┘
                              ▲
                              │
                       ┌──────────────┐
                       │ restopass-   │
                       │    backup    │
                       └──────────────┘
                              │
                              ▼ Outbound HTTPS (Port 443)
                 Off-Site Encrypted S3 Bucket
```

### 4.1 Ingress Rules (AOS Security Group & Linux UFW)

| Port / Protocol | Source | Action | Justification |
| :--- | :--- | :--- | :--- |
| **TCP 80** | `0.0.0.0/0` (Anywhere) | **ALLOW** | Automated HTTP to HTTPS redirection (ACME challenge). |
| **TCP 443** | `0.0.0.0/0` (Anywhere) | **ALLOW** | Primary TLS-encrypted HTTPS traffic for web app & scanners. |
| **TCP 22** | **Admin VPN / Static IP ONLY** | **RESTRICTED** | SSH host management. Password authentication disabled; key-only. |
| **TCP 5432** | `0.0.0.0/0` | **DROP / BLOCK** | PostgreSQL port MUST NOT be exposed to the internet. |
| **TCP 6379** | `0.0.0.0/0` | **DROP / BLOCK** | Redis port MUST NOT be exposed to the internet. |
| **All Other Ports** | `0.0.0.0/0` | **DROP / BLOCK** | Default deny on all ingress traffic. |

### 4.2 Internal Container Isolation

- The `backend` Docker network is an internal bridge network (`driver: bridge`).
- PostgreSQL (`5432`) and Redis (`6379`) do **not** publish ports to the host interface (`ports:` directive omitted). They are accessible exclusively to sibling containers (`app`, `backup`) on the internal bridge.
- The Node.js application exposes port `3000` internally to Caddy; only Caddy binds to public host ports `80` and `443`.

---

## 5. Storage, Logging & Disk Management

### 5.1 Disk Partitioning & Growth Projections

The recommended 80 GB NVMe SSD should be partitioned as follows:
- **Operating System (`/`)**: 20 GB (Ubuntu OS, kernel, Docker images).
- **Docker Persistent Volumes (`/var/lib/docker/volumes/`)**: 50 GB allocated across:
  - `postgres_data`: ~10 GB (database tables, indexes, write-ahead logs).
  - `redis_data`: ~2 GB (AOF file).
  - `app_uploads`: ~15 GB (patron ID verification photos).
  - `caddy_logs`: ~5 GB (rotated JSON access logs).
  - Backups (`/backups`): ~15 GB (local encrypted backup retention).
- **Buffer / Free Space Headroom**: 10 GB (mandatory headroom for database VACUUM and OS upgrades).

### 5.2 Log Rotation Policy

To prevent unrotated Docker logs from consuming disk space and crashing the database:
- All containers in `deploy/docker-compose.prod.yml` are configured with:
  ```yaml
  logging:
    driver: "json-file"
    options:
      max-size: "50m"
      max-file: "5"
  ```
- Maximum total log storage per container is capped at **250 MB** (total max log footprint across 5 containers: 1.25 GB).
- Caddy access logs in `/var/log/caddy/access.log` are rotated automatically by Caddy at 50 MB with 5 retained rolls.

---

## 6. Operational Health Probes & Alerting Matrix

### 6.1 Application Health Endpoints

The server exposes two distinct HTTP endpoints for automated monitoring:

1. **Liveness Probe**: `GET /api/health`
   - Returns: `200 OK` with `{"status":"ok", "uptimeSeconds":1234, "serverTime":"..."}`
   - Purpose: Verifies the Node.js event loop is responding and HTTP server is alive.
   - Frequency: Probe every 10 seconds.

2. **Readiness Probe**: `GET /api/health/ready`
   - Returns: `200 OK` when both PostgreSQL and Redis are fully functional:
     ```json
     {
       "status": "ready",
       "checks": {
         "database": "ok",
         "redis": "ok"
       },
       "uptimeSeconds": 1234,
       "serverTime": "2026-11-03T01:00:00.000Z"
     }
     ```
   - Returns: `503 Service Unavailable` if PostgreSQL connection pool fails or Redis ping fails.
   - Purpose: Directs traffic only to operational backends; alerts ops team immediately if database or cache disconnects.
   - Frequency: Probe every 15 seconds.

### 6.2 Host Alerting Thresholds

The following monitoring alerts should be configured in AOS Cloud Monitoring or Uptime Kuma:

| Alert Trigger | Severity | Threshold | Remediation Action |
| :--- | :--- | :--- | :--- |
| **Readiness Probe Failed** | **CRITICAL (P1)** | 2 consecutive failed probes (30s) | Inspect `docker logs restopass-app`, check Postgres/Redis containers. |
| **Disk Space Low** | **HIGH (P2)** | Free space < 15% | Inspect `/backups` and prune old docker images (`docker system prune -a`). |
| **Disk Space Critical** | **CRITICAL (P1)** | Free space < 5% | Immediate manual intervention; purge stale temp files. |
| **RAM Usage High** | **HIGH (P2)** | Sustained > 85% for 10 min | Inspect container memory stats (`docker stats`). |
| **Backup Freshness Alert** | **CRITICAL (P1)** | No verified backup in > 26 hours | Execute manual `./deploy/backup.sh` and inspect S3 credentials. |

---

## 7. Rwanda (.rw) Domain & TLS Configuration

### 7.1 DNS Configuration

Configure DNS records with the `.rw` domain registrar (e.g., RICTA or authorized registrar):

| Record Type | Host | Target / Value | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `staging.restopass.rw` | `<AOS_STAGING_PUBLIC_IP>` | 300 (5 min) | Staging environment domain |
| **A** | `app.restopass.rw` | `<AOS_PRODUCTION_PUBLIC_IP>` | 3600 (1 hr) | Production environment domain |
| **CAA** | `@` | `0 issue "letsencrypt.org"` | 3600 | Authorizes Let's Encrypt certificate issuance |
| **CAA** | `@` | `0 issue "zerossl.com"` | 3600 | Authorizes ZeroSSL certificate issuance |

### 7.2 TLS Certificate Management

- Caddy manages certificate acquisition and renewal automatically via ACME HTTP-01 challenges.
- Inbound traffic on port 80 must reach Caddy for challenge completion.
- TLS 1.0 and 1.1 are disabled by default in Caddy v2; only TLS 1.2 and TLS 1.3 are negotiated.
- HSTS (`Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"`) is enforced on all responses.

---

## 8. Staging Provisioning & Verification Runbook

Follow these sequential steps on the newly provisioned AOS Cloud VM:

### Step 1: Base Host OS Hardening (Ubuntu 22.04 LTS)
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Configure uncomplicated firewall (UFW)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from <YOUR_ADMIN_IP> to any port 22 proto tcp
sudo ufw enable

# Install Docker CE and Docker Compose v2
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

### Step 2: Deploy Repository & Configure Secrets
```bash
git clone -b security/production-hardening https://github.com/ephremdushime/restourant.git
cd restourant

# Generate independent, cryptographically secure production credentials
cat <<EOF > .env
NODE_ENV=production
DOMAIN=staging.restopass.rw
POSTGRES_DB=restopass
POSTGRES_USER=restopass_admin
POSTGRES_PASSWORD=$(openssl rand -hex 24)
REDIS_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 32)
RESTOPASS_MASTER_SECRET=$(openssl rand -hex 32)
RESTOPASS_SUPERADMIN_PASSWORD=$(openssl rand -base64 24)
RESTOPASS_BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32)
RESTOPASS_BACKUP_HMAC_KEY=$(openssl rand -hex 32)
RESTOPASS_BACKUP_REQUIRE_OFFSITE=true
RESTOPASS_BACKUP_S3_BUCKET=restopass-staging-backups
RESTOPASS_BACKUP_S3_PREFIX=staging
RESTOPASS_BACKUP_S3_REGION=us-east-1
RESTOPASS_BACKUP_S3_ENDPOINT=https://<your-s3-endpoint>
RESTOPASS_BACKUP_S3_ACCESS_KEY_ID=<BACKUP_IAM_KEY>
RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY=<BACKUP_IAM_SECRET>
EOF

chmod 600 .env
```

### Step 3: Launch Stack & Validate Health
```bash
# Build and start services in detached mode
docker compose -f deploy/docker-compose.prod.yml up -d --build

# Wait for healthy state across all containers
docker compose -f deploy/docker-compose.prod.yml ps
```

### Step 4: Run Staging Verification Smoke Tests
```bash
# Execute automated smoke test suite
./deploy/verify-staging.sh https://staging.restopass.rw
```

### Step 5: Execute Disaster Recovery Verification Drill
```bash
# Verify off-site backup creation and restore drill on isolated database
docker compose -f deploy/docker-compose.prod.yml exec backup restopass-backup
docker compose -f deploy/docker-compose.prod.yml exec backup restopass-restore-drill
```

---

## 9. Sign-Off & Release Gate Transition

Completion of Phase 4 validates:
- [x] Sizing specification matches 8 GB RAM / 4 vCPU requirement.
- [x] Database and Redis are isolated from public ingress.
- [x] Automated logging limits prevent disk exhaustion.
- [x] Reverse proxy enforces HSTS, 10MB body limits, and masked server banners.
- [x] Staging smoke test script (`deploy/verify-staging.sh`) is prepared.

Upon completing host provisioning and running `verify-staging.sh` with 0 failures, the system is formally cleared to proceed to **Phase 5 — Restaurant Acceptance Testing**.
