# RestoPass Production Readiness

**Release decision: NOT YET APPROVED FOR PRODUCTION.** This branch closes several code-level security gaps, but external provider onboarding, off-site recovery, operational validation and any deferred financial workflows must be completed before a live rollout.

## Implemented in this hardening branch

- CI runs once per pull request/branch update, cancels stale runs, and retains PostgreSQL integration, lint, build, audit and Docker verification.
- PostgreSQL remains authoritative for registration, approval, top-up and scan transactions. Integration coverage includes duplicate identity/payment references, high-value approval co-signing, staff provisioning, duplicate scanner idempotency and forged subscription sync.
- Restaurant administrators are individual tenant-scoped PostgreSQL accounts. The shared tenant boss password is no longer accepted in production. A platform super-admin provisions and blocks/resets tenant administrators through the protected administrator API.
- POS staff accounts are individual, restaurant-scoped, assigned to one active paired station, and use server-side scrypt password/PIN hashes. Account status, station assignment and credential-version changes invalidate old staff sessions.
- Staff credential hashes, customer PIN hashes and identity hashes are redacted from state and direct customer responses. Staff secrets are also excluded from browser storage.
- Patron photos are stored as private objects, validated by MIME signature and size, and served through authenticated tenant-scoped access.
- Production rate limits and session revocation use shared Redis. Protected requests fail closed when shared session security is unavailable.
- Browser sync cannot create subscription entitlements or payment records. Client-side balance, transfer, scan reversal, second-plate, photo override and manual adjustment mutations are blocked in authenticated production mode unless a server-authoritative workflow exists.
- Liveness and dependency-aware readiness endpoints are available. The production proxy waits for PostgreSQL/Redis readiness.
- A backup worker creates encrypted PostgreSQL and local-upload archives every 24 hours by default, retains 14 days, and reports unhealthy when a recent backup is missing.

## Release gates still requiring external setup or an explicit product decision

### 1. Payment-provider onboarding

MTN MoMo and Airtel Money production credentials, callback secrets, provider allow-listing and settlement/reconciliation access must be supplied by the business. Subscription checkout and mobile-money subscription callbacks remain disabled and return a service-unavailable response until verified provider integration and sandbox-to-production tests are complete. Do not manually mark provider payments as settled based only on a browser request.

### 2. Off-site backup and restore drill

The backup worker writes encrypted archives to `RESTOPASS_BACKUP_DIR`. Configure that directory on protected storage and replicate it to an independent off-site location. Keep the encryption key separately controlled. Perform and document a restore into an isolated staging database and upload volume before launch, then repeat on a schedule. A backup stored only on the application host is not disaster recovery.

### 3. Deferred financial and exception workflows

Transfers, refunds, scan reversals, second-plate authorization and supervisor/photo overrides are not enabled for production. Their legacy client-side mutations are blocked; they must not be re-enabled by changing UI flags. If the launch scope requires any of them, implement a PostgreSQL transaction, unique idempotency key, tenant/role authorization, audit record, reversal/compensation logic and concurrent integration tests for each workflow first.

### 4. Cloud availability and network behavior

Scanning is cloud-authoritative. The reception laptop is not the transaction server, but a scanner requires connectivity to the cloud API and its PostgreSQL/Redis dependencies. Offline redemption is intentionally not enabled: the client must not approve a meal locally when it cannot reach the server. Deploy on reliable managed infrastructure with health monitoring, automatic restart and tested recovery. The current Compose topology is a single application service; do not horizontally scale it until server-side operational state is made coherent across replicas.

### 5. Security and operational verification

- Configure production TLS, DNS, firewall rules, secret rotation and least-privilege database/object-storage credentials.
- Complete an external penetration test and remediate findings.
- Load-test simultaneous scanner requests and approval/top-up bursts using realistic traffic.
- Run a supervised live pilot with actual paired devices, staff accounts, receipts, card issuance and end-of-day reconciliation.
- Configure alerting for readiness failures, failed jobs, database capacity, Redis availability and backup freshness.

## Production administrator provisioning

After the platform super-admin has signed in, provision a tenant administrator with:

```bash
curl -X POST https://YOUR_DOMAIN/api/admin/restaurant-admins \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"restaurantCode":"RW01","username":"owner.rw01","displayName":"Restaurant Owner","password":"A-unique-16-character-or-longer-password"}'
```

Use a unique password for each tenant administrator. POS operators are created from the Station Operators screen and must be assigned to an active paired station.

## Health endpoints

- `GET /api/health`: process liveness.
- `GET /api/health/ready`: production PostgreSQL and Redis readiness; HTTP 503 means the service must not receive scanner traffic.

## Release rule

Keep the hardening pull request in draft until CI is green. Keep it unmerged and do not point production traffic at this branch until the release gates above are either completed or explicitly removed from the launch scope by the product owner.
