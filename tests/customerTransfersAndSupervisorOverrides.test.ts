import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server.ts', 'utf8');
const schema = fs.readFileSync('src/services/db/schema.sql', 'utf8');

test('customer transfers are disabled by default and require a customer session', () => {
  assert.match(server, /RESTOPASS_CUSTOMER_TRANSFERS_ENABLED !== 'true'/);
  assert.match(server, /app\.post\('\/api\/customer\/transfers'.*?requireAuth\(\['customer'\]\)/s);
  assert.match(server, /customer-transfer:' \+ user\.restaurantCode \+ ':' \+ idempotencyKey/);
  assert.match(server, /SELECT id,member_no,name,card_status FROM customers WHERE restaurant_code=\$1 AND member_no=\$2/);
  assert.match(server, /INSUFFICIENT_BALANCE/);
  assert.match(server, /uq_transfer_idempotency/);
  assert.match(server, /CUSTOMER_PLATE_TRANSFER/);
});

test('transfer implementation locks both customers and commits both ledger sides atomically', () => {
  assert.match(server, /ORDER BY id FOR UPDATE/);
  assert.match(server, /transfer_out/);
  assert.match(server, /transfer_in/);
  assert.match(server, /transfer:' \+ transferId \+ ':debit/);
  assert.match(server, /transfer:' \+ transferId \+ ':credit/);
  assert.match(server, /await client\.query\('COMMIT'\);\s*return res\.status\(201\)/);
  assert.match(schema, /CONSTRAINT chk_transfer_distinct_customers CHECK \(sender_customer_id <> recipient_customer_id\)/);
});

test('supervisor overrides require separate requester and super-admin approval and are disabled by default', () => {
  assert.match(server, /RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED !== 'true'/);
  assert.match(server, /requireAuth\(\['stand_staff','restaurant_admin'\]\)/);
  assert.match(server, /requireAuth\(\['super_admin'\]\)/);
  assert.match(server, /requester cannot approve their own override/i);
  assert.match(server, /status='consumed',consumed_at=NOW\(\),consumed_scan_id=\$2/);
  assert.match(server, /SUPERVISOR_OVERRIDE_CONSUMED/);
  assert.match(schema, /uq_scan_supervisor_override_key/);
  assert.match(schema, /expires_at TIMESTAMPTZ NOT NULL/);
});
