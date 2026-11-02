# RestoPass Hosted Staging, Backup and Security Acceptance

This is an execution checklist, not evidence that external activities have already occurred.

## Feature flags

Keep these values unset or false in production until the acceptance gates are signed off:
- `RESTOPASS_CUSTOMER_TRANSFERS_ENABLED=false`
- `RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED=false`

Enable only in an isolated staging deployment after database migrations and staff training. Do not enable in production from a browser or customer-facing setting.

## Customer transfers

The staged API is `POST /api/customer/transfers` and requires a customer session. Body: `recipientMemberNo`, integer `plates` (1–20), and unique `idempotencyKey`. It uses a PostgreSQL transaction, locks both customer rows in deterministic order, validates same-restaurant active accounts and sender balance, creates one transfer record and two ledger entries, and records an audit event. Retries with the same key return the committed transfer; key reuse with different parameters is rejected.

## Supervisor override

1. An assigned staff member or restaurant administrator requests an override using `POST /api/scans/supervisor-overrides` with `customerId`, `stationId`, detailed `reason`, and `idempotencyKey`.
2. A different authenticated platform super-admin approves it using `POST /api/scans/supervisor-overrides/:overrideId/approve` with a detailed `approvalReason`.
3. The approval is bound to one customer and one station, expires after 30 minutes, and can be consumed once by `POST /api/scans/consume` with `supervisorOverrideId`. It bypasses only the serving-window plate limit; it does not bypass account status, station pairing, replay protection, balance, or consecutive-scan controls.
4. Both override feature flag and request/approval endpoints remain disabled unless `RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED=true`.

## Off-site backup configuration

Create a dedicated private S3-compatible bucket in the hosting provider account. Configure these as protected server-side deployment secrets (never commit them or paste them into source control):
- `RESTOPASS_BACKUP_S3_BUCKET`
- `RESTOPASS_BACKUP_S3_ACCESS_KEY_ID`
- `RESTOPASS_BACKUP_S3_SECRET_ACCESS_KEY`
- `RESTOPASS_BACKUP_S3_REGION`
- `RESTOPASS_BACKUP_S3_ENDPOINT` (only for an S3-compatible non-AWS endpoint)
- `RESTOPASS_BACKUP_ENCRYPTION_KEY`
- `RESTOPASS_BACKUP_HMAC_KEY`
- `RESTOPASS_BACKUP_REQUIRE_OFFSITE=true`

Use a dedicated least-privilege identity restricted to the backup bucket/prefix. Enable bucket versioning and a retention/lifecycle policy. Keep encryption and HMAC keys separately escrowed. Start the backup worker, wait for a verified replication marker, then run `deploy/restore-offsite.sh` into a new isolated empty directory/host. Restore database and uploads, verify checksums and application-level record counts, and record RPO/RTO, timestamp, operator and evidence. Never restore over production during a drill.

## Hosted restaurant pilot

Run this with the restaurant manager and named staff on the actual reception laptop, scanner devices, printer and network:
- Pair every production-intended scanner and confirm staff-to-station assignments.
- Test registration, manager approval, top-up recording (payment integration remains disabled), card printing and photo retrieval.
- Run concurrent scans from at least two devices; test duplicate QR replay, dropped network, API restart and Redis/PostgreSQL interruption.
- Verify no offline scan is accepted; reconnect and confirm no duplicate ledger postings.
- Exercise customer transfer in staging: insufficient balance, inactive/foreign-tenant recipient, duplicate retry, idempotency-key conflict and concurrent overspend.
- Exercise supervisor override: self-approval, wrong tenant, wrong station/customer, expiry, replay and successful one-time consumption.
- Reconcile each device's scan receipts against PostgreSQL ledger and manager's end-of-day report.
- Obtain manager sign-off and record device models, browser versions, network conditions, timestamps and test evidence.

## Independent security assessment

Engage a tester who did not implement this code. Provide a staging URL and scoped test accounts only. Require authenticated/unauthenticated tests, tenant isolation, IDOR, role escalation, session revocation, rate-limit bypass, QR replay, concurrency/overspend, transfer replay, override self-approval/replay, photo object access, injection/XSS/CSRF, secrets exposure, dependency/container review and backup restore access. Obtain a written report, severity-ranked findings and retest evidence. Do not call this independent testing complete based on CI or internal review.
