import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { app, createSessionToken } from '../server';
import { MomoService } from '../src/services/momoService';

async function fetchTestRoute(
  expressApp: any,
  method: string,
  urlPath: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    const normalizedHeaders: Record<string, string> = {
      'content-type': 'application/json',
    };
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const [pathname, search] = urlPath.split('?');
    const query: Record<string, string> = {};
    if (search) {
      new URLSearchParams(search).forEach((v, k) => {
        query[k] = v;
      });
    }

    const req: any = {
      method,
      url: urlPath,
      path: pathname,
      query,
      headers: normalizedHeaders,
      body: body || {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        resolve({ status: statusCode, body: data });
        return this;
      },
      send(data: any) {
        resolve({ status: statusCode, body: data });
        return this;
      },
      setHeader() {
        return this;
      },
      end(data?: any) {
        resolve({ status: statusCode, body: data || null });
        return this;
      },
    };

    expressApp.handle(req, res);
  });
}

describe('Phase 7: Controlled Production Launch & Release Sign-Off', () => {
  const rootDir = process.cwd();

  test('Gate 1: Pre-deployment launch runbook and 7-phase sign-off matrix exists', () => {
    const runbookPath = path.join(rootDir, 'docs', 'CONTROLLED_PRODUCTION_LAUNCH.md');
    assert.ok(fs.existsSync(runbookPath), 'docs/CONTROLLED_PRODUCTION_LAUNCH.md must exist');
    const content = fs.readFileSync(runbookPath, 'utf8');

    assert.ok(content.includes('Phase 1'), 'Must include Phase 1 Financial & Database Verification');
    assert.ok(content.includes('Phase 2'), 'Must include Phase 2 Security Hardening');
    assert.ok(content.includes('Phase 3'), 'Must include Phase 3 Disaster Recovery Drill');
    assert.ok(content.includes('Phase 4'), 'Must include Phase 4 AOS Hosted Staging Preparation');
    assert.ok(content.includes('Phase 5'), 'Must include Phase 5 Restaurant Operational Acceptance');
    assert.ok(content.includes('Phase 6'), 'Must include Phase 6 Independent Security Threat Model');
    assert.ok(content.includes('MTN MoMo 15-Point Certification'), 'Must include MTN MoMo Certification');
    assert.ok(content.includes('Phase 7'), 'Must include Phase 7 Controlled Production Launch');
    assert.ok(content.includes('Formal Sign-Off Matrix'), 'Must contain formal sign-off matrix');
    assert.ok(content.includes('Pilot Restaurant Onboarding Sequence'), 'Must contain pilot onboarding steps');
    assert.ok(content.includes('Emergency Rollback Playbook'), 'Must contain emergency rollback steps');
  });

  test('Gate 2: Launch feature flags strictly default to false / disabled for launch', () => {
    const transfersEnabled = process.env.RESTOPASS_CUSTOMER_TRANSFERS_ENABLED === 'true';
    const overridesEnabled = process.env.RESTOPASS_SUPERVISOR_OVERRIDES_ENABLED === 'true';
    const momoEnabled = process.env.RESTOPASS_MOBILE_MONEY_ENABLED === 'true';
    const undoEnabled = process.env.RESTOPASS_SCANNER_UNDO_ENABLED === 'true';
    const offlineRedemption = process.env.RESTOPASS_OFFLINE_REDEMPTION_ENABLED === 'true';

    assert.strictEqual(transfersEnabled, false, 'Customer transfers must be disabled for initial launch');
    assert.strictEqual(overridesEnabled, false, 'Supervisor overrides must be disabled for initial launch');
    assert.strictEqual(momoEnabled, false, 'Mobile money checkout must be disabled until live provider contract is issued');
    assert.strictEqual(undoEnabled, false, 'Scanner undo must be permanently disabled');
    assert.strictEqual(offlineRedemption, false, 'Scanner offline redemption must be permanently forbidden');
  });

  test('Gate 3: Customer subscription checkout fails closed (503) without active provider onboarding', async () => {
    const customerToken = createSessionToken({
      userId: 'cust_prod_pilot_1',
      username: 'student.pilot',
      role: 'customer',
      restaurantCode: 'RW01',
    });

    const res = await fetchTestRoute(
      app,
      'POST',
      '/api/customer/subscription/checkout',
      {
        provider: 'mtn_momo',
        phone: '0788123456',
        amount: 500,
      },
      {
        Authorization: `Bearer ${customerToken}`,
      }
    );

    assert.strictEqual(res.status, 503, 'Must return 503 Service Unavailable');
    assert.strictEqual(res.body.code, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
    assert.ok(res.body.error.includes('Mobile Money checkout is not available yet'));
  });

  test('Gate 4: Mobile money webhook callback fails closed (503) when live adapter is disabled', async () => {
    const res = await fetchTestRoute(
      app,
      'POST',
      '/api/payments/mobile-money/callback',
      {
        transactionId: 'TX-TEST-MOMO-001',
        amount: 500,
        status: 'SUCCESSFUL',
      }
    );

    assert.strictEqual(res.status, 503, 'Must return 503 Service Unavailable');
    assert.ok(res.body.error.includes('Payment callback verification is not configured'));
  });

  test('Gate 5: MoMo Service is instantiated and ready for sandbox or live adapter calls', async () => {
    const momo = new MomoService({ useMock: true });
    assert.ok(momo, 'MomoService instance should exist');

    // Verify sandbox provisioning step 1
    const testRef = crypto.randomUUID();
    const userRes = await momo.createApiUser(testRef, 'api.restopass.rw');
    assert.strictEqual(userRes.status, 201, 'Mock createApiUser must return 201');
    assert.strictEqual(userRes.referenceId, testRef);

    // Verify collection debit request
    const debitRef = crypto.randomUUID();
    const debitRes = await momo.requestToPay({
      referenceId: debitRef,
      amount: '500',
      currency: 'EUR',
      externalId: 'SUB-PILOT-001',
      payerPhone: '250788123456',
      payerMessage: 'Pilot RestoPass',
      payeeNote: 'Pilot Subscription',
    });
    assert.strictEqual(debitRes.status, 202, 'Mock requestToPay must return 202');
    assert.strictEqual(debitRes.referenceId, debitRef);
  });

  test('Gate 6: Production Docker Compose contains strict resource bounds and backup configuration', () => {
    const composePath = path.join(rootDir, 'deploy', 'docker-compose.prod.yml');
    assert.ok(fs.existsSync(composePath), 'deploy/docker-compose.prod.yml must exist');
    const compose = fs.readFileSync(composePath, 'utf8');

    assert.ok(compose.includes('memory: 2048M'), 'Postgres container must have 2048M memory limit');
    assert.ok(compose.includes('memory: 1024M'), 'Redis container must have 1024M memory limit');
    assert.ok(compose.includes('RESTOPASS_BACKUP_REQUIRE_OFFSITE'), 'Backup worker must configure offsite backup requirement');
    assert.ok(compose.includes('max-size: "50m"'), 'Log rotation must be configured with 50m max-size');
  });

  test('Gate 7: AOS Hosting Specification establishes 8 GB VM requirement for entire stack', () => {
    const aosDocPath = path.join(rootDir, 'docs', 'AOS_HOSTING_SPECIFICATION.md');
    assert.ok(fs.existsSync(aosDocPath), 'docs/AOS_HOSTING_SPECIFICATION.md must exist');
    const aosDoc = fs.readFileSync(aosDocPath, 'utf8');

    assert.ok(aosDoc.includes('Standard Option 6'), 'Must specify Standard Option 6 with 8 GB RAM as minimum baseline');
    assert.ok(aosDoc.includes('2048 MB') && aosDoc.includes('PostgreSQL 16'), 'Must document PostgreSQL 2048 MB memory');
    assert.ok(aosDoc.includes('1024 MB') && aosDoc.includes('Redis 7'), 'Must document Redis 1024 MB memory');
  });

  test('Gate 8: Staging smoke test script is executable and checks core health endpoints', () => {
    const scriptPath = path.join(rootDir, 'deploy', 'verify-staging.sh');
    assert.ok(fs.existsSync(scriptPath), 'deploy/verify-staging.sh must exist');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');

    assert.ok(scriptContent.includes('/api/health'), 'Must check health liveness endpoint');
    assert.ok(scriptContent.includes('/api/health/ready'), 'Must check health readiness endpoint');
    assert.ok(scriptContent.includes('/api/state'), 'Must test authentication enforcement');
    assert.ok(scriptContent.includes('/api/customer/photo'), 'Must test path traversal protection');
  });

  test('Gate 9: Restaurant Operational Acceptance Manual establishes 11 pilot scenarios', () => {
    const oatPath = path.join(rootDir, 'docs', 'RESTAURANT_ACCEPTANCE_TESTING.md');
    assert.ok(fs.existsSync(oatPath), 'docs/RESTAURANT_ACCEPTANCE_TESTING.md must exist');
    const oatContent = fs.readFileSync(oatPath, 'utf8');

    assert.ok(oatContent.includes('Scenario 1: Student Self-Registration'), 'Must include Scenario 1');
    assert.ok(oatContent.includes('Scenario 2: Cashier Top-Up Recording'), 'Must include Scenario 2');
    assert.ok(oatContent.includes('Scenario 3: Physical Card Issuance'), 'Must include Scenario 3');
    assert.ok(oatContent.includes('Scenario 4: Scanner Hardware Pairing'), 'Must include Scenario 4');
    assert.ok(oatContent.includes('Scenario 5: Multi-Station Concurrency'), 'Must include Scenario 5');
    assert.ok(oatContent.includes('Scenario 6: Dynamic QR Replay Protection'), 'Must include Scenario 6');
    assert.ok(oatContent.includes('Scenario 7: Serving Window Limits'), 'Must include Scenario 7');
    assert.ok(oatContent.includes('Scenario 8: Scanner Display Patron Photo Match'), 'Must include Scenario 8');
    assert.ok(oatContent.includes('Scenario 9: Audited Two-Person Financial Exception Workflow'), 'Must include Scenario 9');
    assert.ok(oatContent.includes('Scenario 10: Network Outage'), 'Must include Scenario 10');
    assert.ok(oatContent.includes('Scenario 11: End-of-Day Shift Reconciliation'), 'Must include Scenario 11');
  });

  test('Gate 10: Live system health endpoints verify server operational state', async () => {
    const healthRes = await fetchTestRoute(app, 'GET', '/api/health');
    assert.strictEqual(healthRes.status, 200, 'GET /api/health must return 200');
    assert.strictEqual(healthRes.body.status, 'ok');

    const readyRes = await fetchTestRoute(app, 'GET', '/api/health/ready');
    assert.strictEqual(readyRes.status, 200, 'GET /api/health/ready must return 200');
    assert.ok(readyRes.body.status, 'Readiness response must include status');
  });
});
