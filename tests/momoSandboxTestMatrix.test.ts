import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { momoService } from '../src/services/momoService';

describe('MTN Mobile Money (MoMo) Sandbox Integration & 15-Point Certification Matrix', () => {
  test('executes all 15 test scenarios matching the official MTN MoMo test matrix', async () => {
    const results = await momoService.runFullSandboxTestMatrix();
    assert.equal(results.length, 15, 'Must execute exactly 15 test scenarios');

    for (const r of results) {
      assert.equal(
        r.result,
        'PASS',
        `Test Case ${r.testCaseId} (${r.scenarioTitle} - ${r.stepDescription}) failed with status ${r.actualStatus}`
      );
    }

    // Verify individual test case milestones
    const tc1 = results.find((r) => r.testCaseId === 1);
    assert.ok(tc1 && [201, 202].includes(tc1.actualStatus));

    const tc2 = results.find((r) => r.testCaseId === 2);
    assert.ok(tc2 && [200, 201].includes(tc2.actualStatus));

    const tc3 = results.find((r) => r.testCaseId === 3);
    assert.ok(tc3 && tc3.actualStatus === 200);

    const tc4 = results.find((r) => r.testCaseId === 4);
    assert.ok(tc4 && tc4.actualStatus === 202);

    const tc5 = results.find((r) => r.testCaseId === 5);
    assert.ok(tc5 && tc5.actualStatus === 200);

    const tc6 = results.find((r) => r.testCaseId === 6);
    assert.ok(tc6 && tc6.actualStatus === 200);

    const tc7 = results.find((r) => r.testCaseId === 7);
    assert.ok(tc7 && tc7.actualStatus === 200);

    const tc8 = results.find((r) => r.testCaseId === 8);
    assert.ok(tc8 && tc8.actualStatus === 200);

    const tc9 = results.find((r) => r.testCaseId === 9);
    assert.ok(tc9 && tc9.actualStatus === 202);

    const tc10 = results.find((r) => r.testCaseId === 10);
    assert.ok(tc10 && tc10.actualStatus === 200);

    const tc11 = results.find((r) => r.testCaseId === 11);
    assert.ok(tc11 && tc11.actualStatus === 202);

    const tc12 = results.find((r) => r.testCaseId === 12);
    assert.ok(tc12 && tc12.actualStatus === 200);

    const tc13 = results.find((r) => r.testCaseId === 13);
    assert.ok(tc13 && tc13.actualStatus === 200);

    const tc14 = results.find((r) => r.testCaseId === 14);
    assert.ok(tc14 && tc14.actualStatus === 200);

    const tc15 = results.find((r) => r.testCaseId === 15);
    assert.ok(tc15 && tc15.actualStatus === 202);
  });

  test('validates database schema compatibility with MTN MoMo payment lifecycle', () => {
    const schemaPath = path.resolve(process.cwd(), 'src/services/db/schema.sql');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

    // Schema must contain mobile_money_payment_attempts table with proper columns
    assert.match(schemaContent, /CREATE TABLE IF NOT EXISTS mobile_money_payment_attempts/);
    assert.match(schemaContent, /provider VARCHAR\(24\) NOT NULL CHECK \(provider IN \('mtn_momo', 'airtel_money'\)\)/);
    assert.match(schemaContent, /provider_environment VARCHAR\(16\) NOT NULL CHECK \(provider_environment IN \('sandbox', 'production'\)\)/);
    assert.match(schemaContent, /currency CHAR\(3\) NOT NULL CHECK \(currency = 'RWF'\)/);
    assert.match(schemaContent, /internal_reference VARCHAR\(64\) NOT NULL UNIQUE/);
    assert.match(schemaContent, /idempotency_key VARCHAR\(128\) NOT NULL UNIQUE/);

    // Schema must contain mobile_money_webhook_events table
    assert.match(schemaContent, /CREATE TABLE IF NOT EXISTS mobile_money_webhook_events/);
    assert.match(schemaContent, /body_sha256 VARCHAR\(64\) NOT NULL/);
    assert.match(schemaContent, /CONSTRAINT uq_mobile_money_webhook_event UNIQUE \(provider, provider_environment, provider_event_key\)/);
  });
});
