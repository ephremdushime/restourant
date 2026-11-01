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
    assert.match(server, /if \(user\.role === 'stand_staff' \|\| user\.role === 'customer'\) return false/);
    assert.match(server, /Scan events are written only by server-side transactional scan endpoints/);
    assert.match(server, /\/api\/topups\/commit/);
    assert.match(server, /INSERT INTO payments/);
    assert.match(server, /Financial ledger entries are written only by transactional server endpoints/);
    assert.match(store, /topUpCustomerAuthoritative/);
    assert.match(store, /fetch\('\/api\/topups\/commit'/);
    assert.doesNotMatch(server, /mergeScopedCollection\('transfers'/);
    assert.doesNotMatch(server, /mergeScopedCollection\('auditLogs'/);
    assert.match(server, /mergeScopedCollection\('pendingApprovals', user\.role !== 'stand_staff'\)/);
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
  });
});
