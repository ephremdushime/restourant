# RestoPass — Production Readiness & Security Remediation Report (Workstreams A–G)

**Project:** RestoPass — Multi-Tenant Meal Pass Management Platform  
**Repository:** `https://github.com/ephremdushime/restourant`  
**Branch:** `security/production-hardening` (Target: `main`)  

---

## Workstream A: PostgreSQL Production Database (P0)

### 1. Root Cause Analysis
- `server.ts` unconditionally read `data/db.json` at module load even when `DATABASE_URL` or `NODE_ENV=production` was active.
- `saveStateToPostgres()` in [`src/services/db/postgresAdapter.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/db/postgresAdapter.ts) persisted 7 of the 16 entities loaded by `loadStateFromPostgres()`, omitting `licenses`, `payments`, `scan_events`, `branches`, `notifications`, `expenses`, `transfers`, `audit_logs`, and `studentSubscriptionPayments` during full-state persistence.
- `server.ts` lacked `SIGTERM`/`SIGINT` graceful shutdown handlers to drain in-flight HTTP requests and close PostgreSQL/Redis pools.

### 2. Implementation Changes
- Guarded startup JSON loading in [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts) so `data/db.json` is never read or written when `isPostgresConfigured()` is true or `NODE_ENV === 'production'`.
- Hardened `atomicSaveDb()` and `queueDbSave()` to fail closed in production if PostgreSQL is not configured, preventing any silent fallback to local JSON files.
- Expanded `saveStateToPostgres()` and `loadStateFromPostgres()` in [`src/services/db/postgresAdapter.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/db/postgresAdapter.ts) to persist and hydrate all 16 relational entities inside a single atomic `BEGIN ... COMMIT` transaction.
- Added tenant and lookup indexes in [`src/services/db/schema.sql`](file:///c:/Users/ephre/Restourant/restourant/src/services/db/schema.sql) for `licenses`, `balance_checkpoints`, `payments`, `customer_subscriptions`, `branches`, `expenses`, `notifications`, `audit_logs`, and `transfers`.
- Implemented `shutdownServer()` and `SIGTERM`/`SIGINT` handlers in [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts) to drain the write queue and close PostgreSQL (`closePostgres()`) and Redis (`closeRedis()`).

### 3. Files Changed
- [`src/services/db/schema.sql`](file:///c:/Users/ephre/Restourant/restourant/src/services/db/schema.sql)
- [`src/services/db/postgresAdapter.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/db/postgresAdapter.ts)
- [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts)

---

## Workstream B: Cryptographic Secrets and QR Security (P0)

### 1. Root Cause Analysis
- [`src/services/cryptoService.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/cryptoService.ts) exported a constant named `MASTER_KEY` into the frontend bundle, and [`.env.example`](file:///c:/Users/ephre/Restourant/restourant/.env.example) contained a comment implying `RESTOPASS_MASTER_SECRET` was shared with `cryptoService.ts`.
- Key rotation (`keyVersion`) and physical card revocation/reissuance (`cardVersion`) lacked a dedicated, audited server endpoint.

### 2. Implementation Changes
- Removed `export const MASTER_KEY` from [`src/services/cryptoService.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/cryptoService.ts). The root `RESTOPASS_MASTER_SECRET` is held exclusively on the backend in [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts).
- Updated [`.env.example`](file:///c:/Users/ephre/Restourant/restourant/.env.example) to clarify that `RESTOPASS_MASTER_SECRET` is server-only and never exposed to `VITE_*` or frontend bundles.
- Implemented `POST /api/customer/credentials/rotate` in [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts) supporting audited customer phone-key rotation (`keyVersion + 1`) and manager-authorized physical card revocation/reissuance (`cardVersion + 1`) with immediate invalidation of prior versions and immutable `audit_logs` recording.

### 3. Files Changed
- [`src/services/cryptoService.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/cryptoService.ts)
- [`.env.example`](file:///c:/Users/ephre/Restourant/restourant/.env.example)
- [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts)

---

## Workstream C: Persistent Patron Photo Storage (P1)

### 1. Root Cause Analysis
- While [`src/services/storage/objectStorage.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/storage/objectStorage.ts) enforced S3/R2 in production and validated magic bytes (JPEG/PNG/WebP) and size (<= 5MB), it lacked an object deletion lifecycle method and audited deletion endpoint for patron photo retention policies.

### 2. Implementation Changes
- Added `deletePatronPhoto(key)` using `DeleteObjectCommand` in [`src/services/storage/objectStorage.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/storage/objectStorage.ts) with strict namespace (`patron-photos/`) and path-traversal validation.
- Implemented `DELETE /api/customer/photo` in [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts) restricted to `restaurant_admin` (tenant-scoped) and `super_admin`, clearing the customer's `photoUrl` and recording a `PATRON_PHOTO_DELETED` audit log entry.

### 3. Files Changed
- [`src/services/storage/objectStorage.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/storage/objectStorage.ts)
- [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts)

---

## Workstream D: Redis-Based QR Replay Protection (P0)

### 1. Root Cause Analysis
- [`src/services/cache/redisClient.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/cache/redisClient.ts) implemented atomic `SET NX` (`recordTokenScan` and `isTokenUsed`), but [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts) was not invoking those functions inside `POST /api/qr/verify` or `POST /api/scans/consume`.

### 2. Implementation Changes
- Wired `isTokenUsed()` into `POST /api/qr/verify` in [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts), returning `503 REPLAY_GUARD_UNAVAILABLE` if Redis is unreachable in production and rejecting replayed tokens immediately.
- Wired `recordTokenScan(redisTokenKey, 330)` into `POST /api/scans/consume` in [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts) alongside the PostgreSQL `used_tokens` constraint, with automatic `releaseTokenScan()` in `finally` if the database transaction rolls back prior to commit.

### 3. Files Changed
- [`src/services/cache/redisClient.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/cache/redisClient.ts)
- [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts)

---

## Workstream E: Automated Backups and Disaster Recovery (P0)

### 1. Implementation & Verification Summary
- Automated daily encrypted PostgreSQL + upload archives (`deploy/backup-loop.sh`) with AES-256-CBC encryption (`PBKDF2` 200,000 iterations) and independent `HMAC-SHA256` sidecars.
- Mandatory off-site S3 replication (`RESTOPASS_BACKUP_REQUIRE_OFFSITE=true`) verified by round-trip download and digest comparison before updating health markers.
- Guarded restoration (`deploy/restore-drill.sh` & [`tests/disasterRecoveryDrill.test.ts`](file:///c:/Users/ephre/Restourant/restourant/tests/disasterRecoveryDrill.test.ts)) requiring an isolated target database and verifying restored schema, customer balances, and ledger entries.

---

## Workstream F: Mobile Money Payment Security (P0)

### 1. Root Cause Analysis
- Mobile Money checkout and webhook callback endpoints needed full HMAC authenticity verification, idempotency, state transitions, and reconciliation logic when enabled (`RESTOPASS_MOBILE_MONEY_ENABLED=true`), while remaining fail-closed (`503`) by default until live merchant credentials are provisioned.

### 2. Implementation Changes
- Implemented server-side checkout initiation in `POST /api/customer/subscription/checkout` (when `RESTOPASS_MOBILE_MONEY_ENABLED=true`) with `idempotencyKey` deduplication, strict 500 RWF integer pricing, and `pending` state recording.
- Implemented `POST /api/payments/mobile-money/callback` with constant-time `X-Callback-Signature` HMAC verification, amount/currency validation (`500 RWF`), idempotent duplicate callback handling, cross-payment `providerTransactionId` uniqueness, failure state transitions, and atomic subscription activation + audit logging on `SUCCESSFUL`.
- Implemented `GET /api/admin/payments/mobile-money/reconcile` for tenant and platform administrators to reconcile payment attempts against active subscriptions.

### 3. Files Changed
- [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts)
- [`src/services/momoService.ts`](file:///c:/Users/ephre/Restourant/restourant/src/services/momoService.ts)

---

## Workstream G: Production Deployment Security (P1)

### 1. Implementation Summary
- Hardened TLS, HSTS, CSP, `X-Frame-Options: DENY`, and 10MB body limits in [`deploy/Caddyfile`](file:///c:/Users/ephre/Restourant/restourant/deploy/Caddyfile).
- Non-root container execution, internal-only PostgreSQL/Redis bridge networking (no host port exposure), resource limits, and JSON log rotation in [`deploy/docker-compose.prod.yml`](file:///c:/Users/ephre/Restourant/restourant/deploy/docker-compose.prod.yml).
- Startup secret entropy enforcement (`validateProductionSecrets`) and dependency-aware `/api/health` and `/api/health/ready` checks in [`server.ts`](file:///c:/Users/ephre/Restourant/restourant/server.ts).

---

## Deployment & Rollback Instructions

### Deployment
```bash
npm ci
npm run lint
npm test
npm run build
docker compose -f deploy/docker-compose.prod.yml up -d --build
bash deploy/verify-staging.sh https://YOUR_DOMAIN
```

### Rollback
```bash
git checkout HEAD~1
docker compose -f deploy/docker-compose.prod.yml up -d --build app
bash deploy/verify-staging.sh http://localhost:3000
```

