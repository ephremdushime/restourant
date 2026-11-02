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
- Browser sync cannot create subscription entitlements or payment records. Production meal redemption, second-plate deduction and photo-check outcomes use PostgreSQL transactions. Customer-to-customer plate transfers now have a PostgreSQL-authoritative endpoint with deterministic customer row locks, balance checks, paired ledger entries, idempotency and audit logging; the endpoint is disabled unless RESTOPASS_CUSTOMER_TRANSFERS_ENABLED=true. Supervisor overrides now use separate requester and super-admin approver identities, a 30-minute expiry, customer/station binding, one-time consumption inside the scan transaction and audit logging; disabled unless RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED=true.
- Provider-neutral PostgreSQL tables now persist mobile-money attempts and webhook event digests with unique internal references, idempotency keys, provider/environment-scoped transaction IDs, RWF-only currency constraints and replay protection. They do not enable payment collection by themselves; checkout remains disabled until provider adapters and sandbox verification are complete.
- Financial exception requests now support cash/bank refund, paid scan reversal and completed plate-transfer reversal. A restaurant administrator submits a reasoned request; a different platform super-admin approves or rejects it. Approval locks affected rows, revalidates source eligibility, appends compensating ledger entries, updates the source record and writes an audit event in one PostgreSQL transaction. Duplicate source exceptions and idempotency keys are constrained in PostgreSQL. Refunds are limited to cash/bank top-ups with no subsequent ledger activity; mobile-money refunds remain disabled until a provider refund API is configured.
- Liveness and dependency-aware readiness endpoints are available. The production proxy waits for PostgreSQL/Redis readiness.
- A backup worker creates encrypted PostgreSQL and local-upload archives every 24 hours by default, retains 14 days locally, and verifies an independent HMAC-SHA256 integrity sidecar. Production Compose now requires an S3-compatible off-site bucket, uploads both encrypted archive and HMAC sidecar, downloads the remote copy and verifies it before marking replication healthy.
- Guarded local and off-site restore utilities verify the HMAC before decryption, refuse non-empty destinations, and extract only the expected database dump and upload archive. CI exercises valid restore, tamper rejection, off-site download and stale-replication healthcheck rejection.

## Release gates still requiring external setup or an explicit product decision

### 1. Payment-provider onboarding

MTN MoMo and Airtel Money production credentials, callback secrets, provider allow-listing and settlement/reconciliation access must be supplied by the business. Subscription checkout and mobile-money subscription callbacks remain disabled and return a service-unavailable response until verified provider integration and sandbox-to-production tests are complete. Do not manually mark provider payments as settled based only on a browser request.

### 2. Off-site backup and restore drill

Production Compose requires `RESTOPASS_BACKUP_REQUIRE_OFFSITE=true` and an independent S3-compatible backup bucket. Configure `RESTOPASS_BACKUP_S3_BUCKET`, dedicated least-privilege access keys, region, and optional HTTPS endpoint (for R2/Spaces). The worker uploads the encrypted archive and HMAC sidecar, downloads the archive again, verifies its HMAC and byte-for-byte equality, then records a freshness marker. The backup healthcheck fails if no recent local backup or successful off-site replication exists within 48 hours. The public Caddy reverse proxy waits for both the app and backup worker to become healthy before accepting public traffic. Apply a bucket lifecycle policy and versioning/object-lock policy appropriate to your retention and ransomware threat model. Keep the encryption and HMAC keys separately controlled outside the application host. Perform and document an isolated restore drill before launch and repeat it on a schedule. The exact bucket, credentials, replication and restore evidence are external deployment tasks and have not been completed by CI.

### 3. Financial exceptions, transfers and supervisor overrides

The audited exception API covers manual cash/bank refunds, paid scan reversals and completed transfer reversals. Mobile-money refunds remain disabled pending a verified provider refund API. Second-plate authorization and photo-check outcomes use PostgreSQL transactions and idempotency. Customer-to-customer transfers are implemented at the server layer but remain disabled by default; enable only in isolated staging using RESTOPASS_CUSTOMER_TRANSFERS_ENABLED=true after the hosted acceptance checklist is complete. The transfer endpoint locks both customer rows in deterministic order, verifies tenant/account status and balance, posts debit/credit ledger entries atomically, and records an audit event. Supervisor overrides are implemented as a separate requester/super-admin approval workflow, bound to a customer and station, expiring after 30 minutes and consumable once in the scan transaction. They remain disabled unless RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED=true. Scanner undo remains disabled; use the audited financial-exception scan-reversal workflow instead.

### 4. Cloud availability and network behavior

Scanning is cloud-authoritative. The reception laptop is not the transaction server, but a scanner requires connectivity to the cloud API and its PostgreSQL/Redis dependencies. Offline redemption is intentionally not enabled: the client must not approve a meal locally when it cannot reach the server. Deploy on reliable managed infrastructure with health monitoring, automatic restart and tested recovery. The current Compose topology is a single application service; do not horizontally scale it until server-side operational state is made coherent across replicas.

### 5. Security and operational verification

- Configure production TLS, DNS, firewall rules, secret rotation and least-privilege database/object-storage credentials.
- Complete an external penetration test and remediate findings.
- Load-test simultaneous scanner requests and approval/top-up bursts using realistic traffic.
- Run a supervised hosted staging pilot with actual paired devices, staff accounts, receipts, card issuance and end-of-day reconciliation. This requires restaurant staff and physical devices and is not simulated by CI.
- Complete an independent third-party penetration test and obtain retest evidence.
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

See docs/HOSTED_STAGING_ACCEPTANCE.md for the exact external acceptance procedures. Keep the hardening pull request in draft until CI is green. Keep it unmerged and do not point production traffic at this branch until the release gates above are either completed or explicitly removed from the launch scope by the product owner.
