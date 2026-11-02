import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const schema = fs.readFileSync(path.resolve(process.cwd(), 'src/services/db/schema.sql'), 'utf8');
const server = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

test('mobile-money persistence is provider-neutral, idempotent and separated from meal ledger', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS mobile_money_payment_attempts/);
  assert.match(schema, /provider IN \('mtn_momo', 'airtel_money'\)/);
  assert.match(schema, /provider_environment IN \('sandbox', 'production'\)/);
  assert.match(schema, /currency CHAR\(3\) NOT NULL CHECK \(currency = 'RWF'\)/);
  assert.match(schema, /internal_reference VARCHAR\(64\) NOT NULL UNIQUE/);
  assert.match(schema, /idempotency_key VARCHAR\(128\) NOT NULL UNIQUE/);
  assert.match(schema, /uq_mobile_money_provider_transaction/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS mobile_money_webhook_events/);
  assert.match(schema, /uq_mobile_money_webhook_event UNIQUE \(provider, provider_environment, provider_event_key\)/);
  assert.match(schema, /body_sha256 VARCHAR\(64\) NOT NULL/);
  assert.match(server, /PAYMENT_PROVIDER_NOT_CONFIGURED/);
  assert.match(server, /Payment callback verification is not configured/);
});
