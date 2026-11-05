# RestoPass Independent Security Assessment & Threat Model Report
**Document ID**: RP-SEC-PHASE6-REPORT  
**Target Application**: RestoPass Operating System (Campus & Cafeteria Multi-Tenant Cloud Platform)  
**Assessed Branch**: `security/production-hardening`  
**Classification**: Confidential — Pre-Deployment Security Gate  
**Compliance Standards**: OWASP Top 10 (2021), OWASP ASVS Level 2, NIST SP 800-115  

---

## 1. Executive Summary & Assessment Scope

This report documents the security posture, threat model, vulnerability remediations, and external penetration testing specification for the **RestoPass Operating System**.

### 1.1 Fundamental Security Policy: Internal CI != Independent Assessment

> [!CRITICAL]
> Passing automated tests and internal code reviews verifies that our security controls and build steps function as implemented. **It does not substitute for independent, third-party penetration testing.**  
> Before proceeding to full commercial multi-campus rollout, an external security firm that did not write this software must execute black-box and grey-box penetration testing against the staged environment.

### 1.2 Scoped Threat Actors & Attack Profiles

The assessment evaluates RestoPass defenses against five distinct threat actor tiers:

```
[ Tier 1: Anonymous Public Internet Attacker ]
                      │ (Unauthenticated probes, DoS, brute force)
                      ▼
[ Tier 2: Malicious Registered Student / Patron ]
                      │ (QR replay, balance manipulation, cross-student IDOR)
                      ▼
[ Tier 3: Compromised Buffet Stand Cashier / Scanner Staff ]
                      │ (Station unpairing bypass, unrecorded meals, cash skimming)
                      ▼
[ Tier 4: Rogue Restaurant Administrator (Tenant Admin) ]
                      │ (Cross-tenant data access, self-approved financial reversals)
                      ▼
[ Tier 5: Privileged Platform Super-Admin ]
                      │ (Audit log tampering, master key exposure, bulk data exfiltration)
```

---

## 2. Threat Vector Evaluation Across 10 Core Security Domains

### Domain 1: Authentication & Session Management
- **Architecture**: Sessions use cryptographically signed tokens (`rp_sess_<b64>.<hmac>`) signed with SHA-256 HMAC using a minimum 32-character `SESSION_SECRET`. Passwords and PINs are salted with individual cryptographically random salts and derived using scrypt (N=16384, r=8, p=1).
- **Session Revocation**: Production deployments evaluate session revocation via distributed Redis (`sessionRevocationKey(token)`). Revoking an administrative or staff credential terminates all active sessions in real time.
- **Timing Attacks**: Token signatures, PINs, and passwords are compared exclusively using constant-time string comparison (`crypto.timingSafeEqual`) to eliminate timing side-channel leaks.

### Domain 2: Multi-Tenant Isolation & IDOR Defenses
- **Architecture**: Every restaurant tenant is partitioned by a unique, uppercase alphanumeric code (e.g. `RW01`, `RW02`).
- **Database Partitioning**: PostgreSQL queries strictly mandate `restaurant_code = $1` in `WHERE` clauses.
- **IDOR Protections**:
  - `POST /api/customer/activation/request`: Rejects cross-tenant customer activation with HTTP 403.
  - `POST /api/customer/recovery/approve`: Rejects cross-tenant PIN recovery with HTTP 403.
  - `GET /api/customer/photo`: Restricts photo retrieval to authorized restaurant tenants and super-admins.
  - `GET /api/state`: Automatically scopes state via `scopeStateForUser`, preventing tenant A from ever viewing tenant B records.

### Domain 3: Vertical & Horizontal Privilege Escalation
- **Role Hierarchy**: `customer` (read-only self balance) < `stand_staff` (redemption only at assigned station) < `restaurant_admin` (single-tenant management) < `super_admin` (multi-tenant platform operator).
- **Station Binding**: `stand_staff` accounts cannot perform scans across unassigned stations; the server validates `user.stationId === requestedStationId` and confirms the scan point is active and paired.
- **Enforcement**: Role gates are enforced server-side via `requireAuth(['allowed_roles'])`. Tokens tampering with role payloads are rejected immediately because HMAC validation fails.

### Domain 4: Credential Redaction & Anti-Data Leakage
- **Redaction Protocol**: `scopeStateForUser` programmatically sanitizes in-memory state before JSON serialization across all roles:
  - `customers`: Strips `pinHash`, `idHash`.
  - `stationUsers`: Strips `passwordHash`, `pin`.
  - `activationRequests`: Strips `activationCode`, `codeHash`.
  - `pinRecoveryRequests`: Strips `recoveryCode`, `recoveryCodeHash`.
- **Browser Protection**: No raw password hashes, customer PINs, or activation secret codes are persisted in client `localStorage`.

### Domain 5: Cryptographic Token Replay & Transaction Forgery
- **Physical Cards (`c1`)**: Uses hierarchical HMAC key derivation:
  $$\text{RestaurantKey} = \text{HMAC}(\text{MasterSecret}, \text{"RESTAURANT:"} + \text{RestoCode})$$
  $$\text{CardSignature} = \text{HMAC}(\text{RestaurantKey}, \text{"CARD:"} + \text{MemberNo} + \text{":V"} + \text{CardVersion})[0..16]$$
- **Digital Dynamic Tokens (`v1`)**: Encodes a rolling 30-second time step.
- **Replay Protection**: Production redemptions atomically insert tokens into PostgreSQL `used_tokens` (`ON CONFLICT DO NOTHING`). If a digital token was consumed within 15 minutes, the transaction rolls back and returns HTTP 409 Conflict.
- **Consecutive Tap Guard**: Scanners reject successive taps by the same customer within 5 seconds to prevent cashier double-charging.

### Domain 6: Authoritative Ledger Immutability & Financial Integrity
- **Append-Only Architecture**: Patron plate balances are derived mathematically from authoritative checkpoints + sum of immutable ledger entries (`ledger_entries`).
- **Sync Resistance**: `POST /api/sync` deliberately ignores client-submitted ledger entries and scan events. Only server-side transactions (`POST /api/scans/consume`, `POST /api/topups/commit`) can write financial mutations.
- **Concurrency Locks**: PostgreSQL advisory transaction locks (`pg_advisory_xact_lock`) and row locks (`FOR UPDATE`) ensure concurrent scans on the same balance cannot overspend.

### Domain 7: Distributed Rate Limiting & Denial of Service
- **Rate Limiters**: Shared Redis-backed sliding window rate limiters protect critical endpoints:
  - Authentication (`/api/auth/login`): 10 requests / minute per IP with brute-force lockouts.
  - Scans (`/api/scans/consume`): 1200 requests / minute per IP.
  - Public API (`/api/public/*`): 120 requests / minute.
- **Payload Limits**: Reverse proxy enforces `request_body { max_size 10MB }` to prevent payload memory exhaustion.

### Domain 8: Object Storage & Path Traversal Prevention
- **Whitelisting Regex**: Photo requests validate keys strictly against `/^patron-photos\/[A-Za-z0-9._-]{1,180}$/`.
- **Path Traversal Defense**: All attempts to pass directory traversal payloads (`../../`, `..%2f`, null bytes `%00`, absolute paths) are rejected with HTTP 400 Bad Request before disk access.
- **MIME Signature Verification**: Uploads are validated by reading magic bytes (`image/jpeg`, `image/png`, `image/webp`).

### Domain 9: SQL Parameterization & Injection Resistance
- **Parameterized SQL**: All relational queries use standard parameterization (`$1, $2, ...`).
- **No Concatenation**: Zero raw user strings are concatenated into SQL statements.
- **Schema Constraints**: Strict foreign keys, check constraints (`currency = 'RWF'`, `plates_delta != 0`), and unique indexes prevent database corruption.

### Domain 10: Cryptographic Backup Integrity & Key Escrow
- **Encryption**: Daily backups stream through OpenSSL AES-256-CBC PBKDF2 (200,000 iterations, SHA-256, 16-byte random salt).
- **Integrity Sidecar**: Every backup bundle includes an HMAC-SHA256 sidecar file generated with an independent secret key.
- **Restoration Drill**: Restore utilities verify HMAC authenticity before attempting decryption. Corrupted or tampered archives are immediately aborted.
- **Secret Hygiene**: `validateProductionSecrets` aborts server startup if placeholder or dev secrets are detected in production.

---

## 3. Remediation Matrix for Pre-Deployment Findings

| Finding ID | Vulnerability / Deficiency | Historical Risk | Implemented Remediation | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Missing PostgreSQL concurrency integration tests for transfers & overrides | **HIGH** | Converted pattern tests in `customerTransfersAndSupervisorOverrides.test.ts` to real database integration tests covering concurrent overspend, cross-restaurant rejection, and duplicate idempotency. | **VERIFIED** (Pass) |
| **SEC-02** | Cross-tenant data leakage in customer activation & PIN recovery | **HIGH** | Added explicit tenant checks in `POST /api/customer/activation/request` and `POST /api/customer/recovery/approve` returning HTTP 403 on tenant mismatches. | **VERIFIED** (Pass) |
| **SEC-03** | Sensitive credential hash leakage in user-scoped state | **MEDIUM** | Hardened `scopeStateForUser` to strip `passwordHash`, `pinHash`, `activationCode`, and `recoveryCode` across all roles including super admin. | **VERIFIED** (Pass) |
| **SEC-04** | Disaster recovery untested on isolated instance | **HIGH** | Created automated disaster recovery restoration utility `deploy/restore-drill.sh` and drill test suite validating HMAC sidecars, RTO/RPO metrics, and balance reconciliation. | **VERIFIED** (Pass) |
| **SEC-05** | Production Compose memory sizing constraints on AOS | **HIGH** | Established 8 GB RAM VM baseline (Option 6), added memory limits across all 5 containers, and configured container log rotation (50MB x 5). | **VERIFIED** (Pass) |
| **SEC-06** | Reverse proxy lacking HSTS and payload body ceilings | **MEDIUM** | Hardened `deploy/Caddyfile` with HSTS (`max-age=31536000; includeSubDomains; preload`), 10MB body limits, and rotated JSON logging. | **VERIFIED** (Pass) |
| **SEC-07** | Restaurant operational acceptance not formalized | **HIGH** | Authored `docs/RESTAURANT_ACCEPTANCE_TESTING.md` (11 operational scenarios) and created comprehensive automated acceptance suite `restaurantAcceptancePhase5.test.ts`. | **VERIFIED** (Pass) |

---

## 4. Independent Penetration Testing Specification (RFP Scope)

To engage an accredited third-party security firm prior to production go-live:

### 4.1 Target URLs & Scoped Environments
- **Staging URL**: `https://staging.restopass.rw`
- **Provided Credentials**:
  - 1 x `super_admin` test account
  - 2 x `restaurant_admin` test accounts (Tenants `RW01` and `RW02` to test cross-tenant isolation)
  - 2 x `stand_staff` accounts (assigned to distinct stations)
  - 4 x `customer` test accounts with pre-allocated test plate balances
- **Out of Scope**: Physical break-ins, DDoS volumetric flooding, social engineering of cafeteria staff.

### 4.2 Test Deliverables Required from Tester
1. Formal executive summary and methodology document.
2. Technical findings categorized by CVSS v3.1 severity (Critical, High, Medium, Low, Informational).
3. Step-by-step reproduction steps and proof-of-concept (PoC) payloads.
4. Remediation retest verification confirming all discovered findings are successfully closed.
