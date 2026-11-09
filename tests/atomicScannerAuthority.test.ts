import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const readRepoFile = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('Cloud-authoritative scanner regression guards', () => {
  const server = readRepoFile('server.ts');
  const schema = readRepoFile('src/services/db/schema.sql');
  const scanner = readRepoFile('src/components/scanner/ScannerView.tsx');
  const store = readRepoFile('src/store/restoStore.ts');

  test('production meal redemption is a role-protected server endpoint', () => {
    assert.match(server, /app\.post\(\s*'\/api\/scans\/consume'/);
    assert.match(server, /requireAuth\(\['stand_staff', 'restaurant_admin'\]\)/);
    assert.match(server, /createDistributedRateLimiter\('scan', 1200, 60 \* 1000\)/);
    assert.match(server, /redis\.eval\(/);
    assert.match(server, /ensureRedisReady\(10000\)/);
    assert.match(server, /SELECT id, restaurant_code, member_no, card_status, card_version, key_version, data FROM customers[^\n]*FOR UPDATE/);
  });

  test('ledger deduction, scan event and idempotency response share one transaction', () => {
    assert.match(server, /await client\.query\('BEGIN'\)/);
    assert.match(server, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
    assert.match(server, /INSERT INTO ledger_entries/);
    assert.match(server, /INSERT INTO scan_events/);
    assert.match(server, /INSERT INTO scan_requests/);
    assert.match(server, /await client\.query\('COMMIT'\)/);
    assert.match(server, /await client\.query\('ROLLBACK'\)/);
    assert.match(schema, /CREATE TABLE IF NOT EXISTS scan_requests/);
    assert.match(schema, /idempotency_key VARCHAR\(128\) PRIMARY KEY/);
    assert.match(schema, /request_hash VARCHAR\(64\)/);
    assert.match(server, /requestFingerprint/);
    assert.match(server, /prior\.rows\[0\]\.request_hash !== requestFingerprint/);
    assert.match(server, /user\.role === 'stand_staff' && \(!user\.stationId \|\| user\.stationId !== requestedStationId\)/);
  });

  test('dynamic QR replay protection is database-unique and physical cards remain reusable', () => {
    assert.match(server, /Verification is deliberately read-only/);
    assert.match(server, /INSERT INTO used_tokens/);
    assert.match(server, /ON CONFLICT \(token_key\) DO NOTHING RETURNING token_key/);
    assert.match(server, /version === 'c1'/);
    assert.match(server, /version === 'v1'/);
  });

  test('client sync cannot replace state or inject financial history and scan events', () => {
    assert.match(server, /Full-state replacement is disabled/);
    assert.match(server, /const incomingLedgers: any\[\] = \[\]/);
    assert.match(server, /Scan events are written only by server-side transactional scan endpoints/);
    assert.match(server, /\/api\/topups\/commit/);
    assert.match(server, /INSERT INTO payments/);
    assert.match(server, /ledgerEntry: priorData,[\s\S]*?payment: paymentResult\.rows\[0\]\?\.data/);
    assert.doesNotMatch(server, /mergeScopedCollection\('payments'/);
    assert.match(server, /Financial ledger entries are written only by server-authoritative transactions/);
    assert.match(store, /topUpCustomerAuthoritative/);
    assert.match(store, /fetch\('\/api\/topups\/commit'/);
    assert.doesNotMatch(server, /mergeScopedCollection\('transfers'/);
    assert.doesNotMatch(server, /mergeScopedCollection\('auditLogs'/);
    assert.match(server, /AUTHORITATIVE_WORKFLOW_REQUIRED/);
    assert.match(server, /attemptedCustomerMutation/);
    assert.match(server, /attemptedApprovalMutation/);
    assert.match(server, /Client-side bootstrap is disabled/);
    assert.doesNotMatch(server, /mergeScopedCollection\('pendingApprovals'/);
    assert.match(store, /Customer registration requires the server-authoritative registration endpoint/);
    assert.match(store, /Provisional registration is disabled until the server-authoritative approval endpoint/);
    assert.match(store, /Approval requires the server-authoritative PostgreSQL approval workflow/);
    assert.match(store, /Dual authorization requires the server-authoritative PostgreSQL co-sign endpoint/);
    assert.match(store, /Rejection requires the server-authoritative PostgreSQL approval workflow/);
    assert.match(store, /Plate transfers are disabled until the server-authoritative transfer endpoint/);
    assert.match(store, /if \(this\.authToken && !this\.isDemoModeActive\(\)\) return false/);
  });

  test('provisional registration is server-authoritative and transactionally creates customer plus approval', () => {
    assert.match(server, /app\.post\('\/api\/approvals\/registration'/);
    assert.match(server, /requireAuth\(\['stand_staff', 'restaurant_admin'\]\)/);
    assert.match(server, /INSERT INTO customers[\s\S]*?INSERT INTO pending_approvals/);
    assert.match(server, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
    assert.match(server, /PROVISIONAL_CUSTOMER_REGISTERED/);
    assert.match(store, /registerProvisionalCustomerAuthoritative/);
    assert.match(readRepoFile('src/components/restaurant/RestaurantAdminView.tsx'), /registerProvisionalCustomerAuthoritative/);
  });

  test('existing-customer provisional top-ups use a server transaction and preserve grace counters', () => {
    assert.match(server, /app\.post\('\/api\/approvals\/topup'/);
    assert.match(server, /SELECT data,card_status FROM customers WHERE id=\$1 AND restaurant_code=\$2 FOR UPDATE/);
    assert.match(server, /SELECT data FROM pending_approvals WHERE customer_id=\$1 AND status='pending'[\s\S]*?FOR UPDATE/);
    assert.match(server, /customer\.gracePlatesConsumed = Math\.max\(Number\(customer\.gracePlatesConsumed \|\| 0\), pendingGrace\)/);
    assert.match(store, /createPendingTopupAuthoritative/);
    assert.match(readRepoFile('src/components/restaurant/RestaurantAdminView.tsx'), /createPendingTopupAuthoritative/);
  });

  test('boss approval, high-value independent co-sign and rejection are transactional', () => {
    assert.match(server, /app\.post\('\/api\/approvals\/:approvalId\/approve'/);
    assert.match(server, /app\.post\('\/api\/approvals\/:approvalId\/cosign'/);
    assert.match(server, /app\.post\('\/api\/approvals\/:approvalId\/reject'/);
    assert.match(server, /requireAuth\(\['restaurant_admin'\]\)/);
    assert.match(server, /requireAuth\(\['super_admin'\]\)/);
    assert.match(server, /bossApprovedByUserId === user\.userId/);
    assert.match(server, /Number\(approval\.platesRequested\) > 120/);
    assert.match(server, /commitPendingApproval/);
    assert.match(server, /'approval:' \+ approval\.id \+ ':purchase'/);
    assert.match(server, /'approval:' \+ approval\.id \+ ':grace'/);
    assert.match(server, /INSERT INTO payments/);
    assert.match(server, /APPROVAL_ENTITLEMENT_COMMITTED/);
    assert.match(store, /approvePendingRequestAuthoritative/);
    assert.match(store, /coSignPendingRequestAuthoritative/);
    assert.match(store, /rejectPendingRequestAuthoritative/);
    assert.match(readRepoFile('src/components/restaurant/BossApprovalsManager.tsx'), /approvePendingRequestAuthoritative/);
    assert.match(readRepoFile('src/components/superadmin/SuperAdminView.tsx'), /coSignPendingRequestAuthoritative/);
  });

  test('customer subscription payments remain disabled until provider onboarding is complete', () => {
    assert.match(server, /PAYMENT_PROVIDER_NOT_CONFIGURED/);
    assert.match(server, /Mobile Money checkout is not available yet/);
    assert.match(server, /app\.post\('\/api\/payments\/mobile-money\/callback',[\s\S]*?status\(503\)/);
    assert.doesNotMatch(server, /USSD payment push sent via/);
    assert.match(store, /Mobile Money checkout is not connected yet/);
    assert.match(store, /Client-side payment simulation is disabled/);
    assert.match(readRepoFile('src/components/customer/CustomerView.tsx'), /Mobile Money Payments Coming Soon/);
    assert.match(readRepoFile('docs/architecture/mobile-money-subscription-integration.md'), /Provider registration and API onboarding runbook/);
    assert.match(readRepoFile('docs/architecture/mobile-money-subscription-integration.md'), /independently queries the provider/);
  });

  test('pending-payment grace meals are committed with the scan transaction', () => {
    assert.match(server, /gracePlatesConsumed/);
    assert.match(server, /gracePlatesRemaining/);
    assert.match(server, /UPDATE pending_approvals SET data/);
    assert.match(server, /UPDATE customers SET data/);
    assert.match(server, /isGracePlate: isGraceMeal/);
  });

  test('production scanner waits for cloud authority and local-only adjustments are demo-gated', () => {
    assert.match(scanner, /await restoStore\.processScanAuthoritative\(cleanPayload\)/);
    assert.match(scanner, /if \(isDemoMode\)\s*\{\s*const result = restoStore\.processScan\(cleanPayload\)/);
    assert.match(scanner, /isDemoMode && activeScan\.event\.platesDeducted/);
    assert.match(scanner, /isDemoMode && <button[\s\S]*?onClick=\{handleUndo\}/);
    assert.match(store, /fetch\('\/api\/scans\/consume'/);
    assert.match(store, /Keep the same idempotency key so a retry after a lost response cannot double-charge/);
    assert.match(store, /restopass_pending_scan_/);
    assert.match(store, /crypto\.subtle\.digest\('SHA-256'/);
  });
});
