# RestoPass Controlled Pilot Launch Runbook

**Status: DRAFT — NOT SIGNED OFF FOR PRODUCTION**

This runbook is an operational checklist, not evidence that infrastructure has been purchased, configured, tested, or approved. Complete each item with dated evidence before accepting live customer balances.

## 1. Current release position

- The hardening branch has an open draft pull request: `#1`, targeting `main`.
- A GitHub Actions run for this PR completed successfully on 2 November 2026 (run 373, commit `b144ea59d0a543ccb253054155c0f43b511ebcb6`). This is a historical green run, not proof that the latest branch head has passed CI.
- The repository's production-readiness document explicitly lists external launch gates: hosted staging, off-site restore drill, production secrets, alerting, load testing and independent security testing.
- MTN MoMo live sandbox evidence is not recorded. The 15-case harness can run in mock mode; see `docs/MOMO_SANDBOX_TEST_RESULTS.md`.
- No AOS VM, production domain, backup bucket, physical scanner/card printer, restaurant sign-off or independent penetration test is asserted by this document.

## 2. Launch scope and financial controls

For the first controlled pilot:

- Use one restaurant tenant only.
- Use the existing manual, restaurant-admin-approved cash/bank top-up workflow only after it passes hosted acceptance tests and daily reconciliation.
- Keep customer Mobile Money checkout and callbacks disabled until provider-specific server verification, reconciliation, RWF merchant onboarding and production credentials are complete.
- Restaurant SaaS subscription payments must remain a separate ledger and process from customer meal top-ups. Do not record a restaurant subscription as customer meal credit.
- Keep customer-to-customer transfers disabled unless separately tested and deliberately enabled.
- Keep supervisor overrides disabled unless the requester/approver/one-time consumption workflow has been verified in staging.
- Keep scanner undo disabled; use the audited financial-exception workflow only after its independent approval path is validated.
- Keep offline redemption disabled. If the cloud API, PostgreSQL or Redis security dependency is unavailable, scanning must fail closed.
- Never activate a payment or entitlement from a screenshot, client-side assertion, HTTP 202, redirect, or unverified callback.

## 3. Mandatory go/no-go checklist

All items below are **pending until evidence is attached**.

### Code and release artifact
- [ ] Confirm the exact feature-branch commit SHA intended for release.
- [ ] Rebase/merge reconciliation with current `main` is reviewed; resolve all conflicts.
- [ ] Latest PR CI passes on that exact SHA: typecheck, automated tests with PostgreSQL, build, dependency audit, backup tests and Docker builds.
- [ ] Review all CI annotations and dependency audit findings; no ignored high/critical vulnerabilities without documented mitigation.
- [ ] Confirm the production image is built from the reviewed commit and pin the image by immutable digest.
- [ ] Verify database migrations against a clean database and a copy of the latest staging schema.

### Infrastructure and secrets
- [ ] Provision the actual host and record its provider, region, size, OS, owner and monthly cost.
- [ ] Configure the real production DNS records and verify TLS issuance/renewal.
- [ ] Firewall only required public ports (80/443); restrict SSH to an administrator IP/VPN; do not publish PostgreSQL or Redis.
- [ ] Create unique production secrets in the host's secret manager or protected environment file. Do not use sample values or commit secrets.
- [ ] Verify the exact environment variable names consumed by `deploy/docker-compose.prod.yml` and `server.ts`; do not copy variables from older runbooks without checking the current code.
- [ ] Create a private off-site backup bucket with least-privilege credentials, versioning and lifecycle policy. Keep backup encryption and HMAC keys separate from the host.
- [ ] Complete an isolated off-site restore into a disposable PostgreSQL instance and restore the upload archive. Record measured RPO/RTO and evidence.
- [ ] Configure monitoring and alerts for API readiness, PostgreSQL, Redis, disk, backup freshness, failed backup jobs and 5xx rate.

### Hosted acceptance with real devices and staff
- [ ] Test administrator login, tenant isolation, staff provisioning, station pairing and station revocation.
- [ ] Test customer registration, approval, card issuance, PIN setup, top-up approval, receipt and balance inquiry.
- [ ] Test duplicate scans, repeated taps, zero balance, invalid/revoked cards, serving-window limits, network loss and recovery.
- [ ] Test all financial exception request/approve/reject paths with distinct users; reconcile ledger and cash at end of day.
- [ ] Test backup restore and application rollback procedure.
- [ ] Run a supervised meal-service simulation with the actual scanners, cashier devices, network and restaurant staff.
- [ ] Obtain written acceptance from the pilot restaurant owner/manager. Do not fabricate or pre-fill signatories.

### Security and capacity
- [ ] Complete external penetration testing or a documented scoped security assessment and remediate critical/high findings.
- [ ] Load-test expected peak scanner concurrency and approval/top-up bursts; record p50/p95/p99 latency, error rate and DB/Redis resource use.
- [ ] Verify session expiry/revocation, rate limits, CORS, CSRF posture where applicable, upload validation, private photo access and audit-log access controls.

## 4. Deployment procedure

1. Deploy to a staging hostname first, using production-equivalent PostgreSQL/Redis topology and separate credentials.
2. Run the readiness endpoint and hosted acceptance checklist. A process liveness response alone is not readiness.
3. Take a backup, verify its integrity, and complete an isolated restore before the first real customer balance is recorded.
4. Pin the reviewed application image by digest. Do not deploy directly from a moving branch name.
5. Enable only the launch features explicitly approved in the checklist above.
6. Start with one restaurant, a small invited cohort and a supervised service window. Reconcile every cash receipt, top-up, ledger change and scan at close.
7. Keep a named operator available to disable scanning and switch to a paper process if API/dependency health or ledger reconciliation fails.

## 5. Rollback and incident response

- Stop new financial writes and meal scans using the documented maintenance procedure; do not delete or manually edit ledger rows.
- Preserve application, proxy, PostgreSQL and Redis logs plus the relevant audit trail.
- Take a forensic database backup before attempting repair.
- Roll back the application image only if the database schema remains backward-compatible. Never blindly roll back a migration or restore over the live database.
- If data repair is required, use a reviewed compensating transaction with an audit record. Restore into an isolated environment first.
- Resume service only after readiness, reconciliation and a controlled test scan succeed.

## 6. Sign-off record

No approvals are implied by this template. Complete only after the named individuals have reviewed the evidence.

| Responsibility | Actual name | Decision | Date | Evidence/reference |
|---|---|---|---|---|
| Product owner | Pending | Pending | Pending | Pending |
| Technical release owner | Pending | Pending | Pending | Pending |
| Infrastructure operator | Pending | Pending | Pending | Pending |
| Pilot restaurant representative | Pending | Pending | Pending | Pending |

**Release rule:** Keep PR #1 in draft and do not direct production traffic to this branch until the mandatory gates are closed or the product owner has explicitly approved a reduced, controlled pilot scope with documented residual risks.
