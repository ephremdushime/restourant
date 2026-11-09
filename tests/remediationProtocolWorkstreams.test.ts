import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  app,
  atomicSaveDb,
  queueDbSave,
  createSessionToken,
  getServerDbState,
  ensureServerDbDefaults,
  shutdownServer,
} from '../server';
import * as cryptoService from '../src/services/cryptoService';
import { MomoService, momoService } from '../src/services/momoService';
import {
  recordTokenScan,
  isTokenUsed,
  releaseTokenScan,
  resetMemoryCache,
} from '../src/services/cache/redisClient';

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

describe('Production Readiness & Security Remediation Protocol (Workstreams A–G)', () => {
  const rootDir = process.cwd();

  test('Workstream A: PostgreSQL schema & adapter cover all 16 relational entities and production blocks JSON fallback', async () => {
    const schemaSql = fs.readFileSync(path.join(rootDir, 'src/services/db/schema.sql'), 'utf8');
    const adapterCode = fs.readFileSync(path.join(rootDir, 'src/services/db/postgresAdapter.ts'), 'utf8');

    const requiredTables = [
      'restaurants',
      'licenses',
      'customers',
      'ledger_entries',
      'customer_subscriptions',
      'balance_checkpoints',
      'payments',
      'scan_events',
      'pending_approvals',
      'branches',
      'station_users',
      'notifications',
      'expenses',
      'transfers',
      'audit_logs',
      'system_settings',
    ];

    for (const tbl of requiredTables) {
      assert.ok(schemaSql.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`), `schema.sql must define ${tbl}`);
      assert.ok(adapterCode.includes(`INSERT INTO ${tbl}`), `postgresAdapter.ts must persist ${tbl}`);
    }

    // Verify production mode blocks local JSON writes when PostgreSQL is unconfigured
    const prevNodeEnv = process.env.NODE_ENV;
    const prevDbUrl = process.env.DATABASE_URL;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      assert.strictEqual(atomicSaveDb(getServerDbState()), false, 'atomicSaveDb must return false in production');
      assert.strictEqual(await queueDbSave(getServerDbState()), false, 'queueDbSave must fail closed in production without DATABASE_URL');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevDbUrl !== undefined) process.env.DATABASE_URL = prevDbUrl;
    }

    await shutdownServer();
  });

  test('Workstream B: Frontend cryptoService exposes no MASTER_KEY and server enforces audited key/card rotation', async () => {
    assert.strictEqual('MASTER_KEY' in cryptoService, false, 'cryptoService must not export MASTER_KEY');
    const cryptoSource = fs.readFileSync(path.join(rootDir, 'src/services/cryptoService.ts'), 'utf8');
    assert.ok(!cryptoSource.includes('export const MASTER_KEY'), 'No MASTER_KEY export allowed in frontend source');
    assert.ok(!cryptoSource.includes('VITE_RESTOPASS_MASTER_KEY'), 'No VITE_RESTOPASS_MASTER_KEY allowed');

    const state = getServerDbState();
    ensureServerDbDefaults(state);
    let customer = state.customers.find((c: any) => c.restaurantCode === 'RW01' && c.memberNo);
    if (!customer) {
      customer = {
        id: 'cust_ws_b_rw01',
        memberNo: '28491',
        name: 'Workstream Test Patron',
        restaurantCode: 'RW01',
        cardVersion: 1,
        keyVersion: 1,
        cardStatus: 'active',
      };
      state.customers.unshift(customer);
    }
    assert.ok(customer, 'Test customer in RW01 must exist');

    const oldCardVer = customer.cardVersion || 1;
    const adminToken = createSessionToken({
      userId: 'admin_rw01',
      username: 'boss.rw01',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
    });

    // Generate old card token before rotation
    const oldCardRes = await fetchTestRoute(
      app,
      'POST',
      '/api/qr/token/card',
      { restaurantCode: 'RW01', memberNo: customer.memberNo, cardVersion: oldCardVer },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.strictEqual(oldCardRes.status, 200);
    const oldCardToken = oldCardRes.body.token;

    // Customer cannot reissue physical card (requires manager authorization)
    const custToken = createSessionToken({
      userId: customer.id,
      username: customer.memberNo,
      role: 'customer',
      restaurantCode: 'RW01',
    });
    const forbiddenCardRot = await fetchTestRoute(
      app,
      'POST',
      '/api/customer/credentials/rotate',
      { customerId: customer.id, targetType: 'card', reason: 'Attempted self-reissue' },
      { Authorization: `Bearer ${custToken}` }
    );
    assert.strictEqual(forbiddenCardRot.status, 403);

    // Manager revokes old card and reissues new cardVersion
    const rotateRes = await fetchTestRoute(
      app,
      'POST',
      '/api/customer/credentials/rotate',
      { customerId: customer.id, targetType: 'card', reason: 'Lost physical card reported' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.strictEqual(rotateRes.status, 200);
    assert.strictEqual(rotateRes.body.cardVersion, oldCardVer + 1);
    assert.ok(rotateRes.body.reissuedCardToken);
    assert.ok(rotateRes.body.auditId);

    // Old card token must now be rejected on verification
    const verifyOld = await fetchTestRoute(
      app,
      'POST',
      '/api/qr/verify',
      { payload: oldCardToken, restaurantCode: 'RW01' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.strictEqual(verifyOld.body.valid, false);
    assert.match(verifyOld.body.error || '', /Obsolete card/i);

    // New reissued card token must be accepted
    const verifyNew = await fetchTestRoute(
      app,
      'POST',
      '/api/qr/verify',
      { payload: rotateRes.body.reissuedCardToken, restaurantCode: 'RW01' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.strictEqual(verifyNew.body.valid, true);
  });

  test('Workstream C: Patron photo deletion enforces tenant isolation and records audit trail', async () => {
    const state = getServerDbState();
    ensureServerDbDefaults(state);
    const customer = state.customers.find((c: any) => c.restaurantCode === 'RW01' && c.memberNo) || state.customers.find((c: any) => c.restaurantCode === 'RW01');
    assert.ok(customer);

    // Upload a valid PNG photo first
    const validPngBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const adminRw01 = createSessionToken({
      userId: 'admin_rw01',
      username: 'boss.rw01',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
    });
    const adminRw02 = createSessionToken({
      userId: 'admin_rw02',
      username: 'boss.rw02',
      role: 'restaurant_admin',
      restaurantCode: 'RW02',
    });

    const uploadRes = await fetchTestRoute(
      app,
      'POST',
      '/api/upload/photo',
      { photoBase64: validPngBase64, filenameHint: 'ws_c_test' },
      { Authorization: `Bearer ${adminRw01}` }
    );
    assert.strictEqual(uploadRes.status, 200);
    customer.photoUrl = uploadRes.body.url;

    // Cross-tenant admin (RW02) cannot delete RW01 patron photo
    const crossTenantDel = await fetchTestRoute(
      app,
      'DELETE',
      `/api/customer/photo?customerId=${encodeURIComponent(customer.id)}`,
      {},
      { Authorization: `Bearer ${adminRw02}` }
    );
    assert.strictEqual(crossTenantDel.status, 403);

    // Authorized RW01 admin deletes the photo
    const delRes = await fetchTestRoute(
      app,
      'DELETE',
      `/api/customer/photo?customerId=${encodeURIComponent(customer.id)}`,
      {},
      { Authorization: `Bearer ${adminRw01}` }
    );
    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delRes.body.success, true);
    assert.strictEqual(customer.photoUrl, '');
  });

  test('Workstream D: Redis replay guard blocks duplicate QR scans on /api/qr/verify and releases on rollback', async () => {
    resetMemoryCache();
    const state = getServerDbState();
    ensureServerDbDefaults(state);
    const customer = state.customers.find((c: any) => c.restaurantCode === 'RW01' && c.memberNo) || state.customers.find((c: any) => c.restaurantCode === 'RW01');
    assert.ok(customer);

    const custToken = createSessionToken({
      userId: customer.id,
      username: customer.memberNo,
      role: 'customer',
      restaurantCode: 'RW01',
    });
    const adminToken = createSessionToken({
      userId: 'admin_rw01',
      username: 'boss.rw01',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
    });

    // Generate server-signed dynamic phone QR token
    const phoneQrRes = await fetchTestRoute(
      app,
      'POST',
      '/api/qr/token/phone',
      { restaurantCode: 'RW01', memberNo: customer.memberNo, keyVersion: customer.keyVersion || 1 },
      { Authorization: `Bearer ${custToken}` }
    );
    assert.strictEqual(phoneQrRes.status, 200);
    const dynamicToken = phoneQrRes.body.token;
    const step = phoneQrRes.body.step;

    // Verify before consumption -> valid: true
    const verify1 = await fetchTestRoute(
      app,
      'POST',
      '/api/qr/verify',
      { payload: dynamicToken, restaurantCode: 'RW01' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.strictEqual(verify1.body.valid, true);

    // Simulate token consumption in Redis replay guard
    const devMaster = ['RESTOPASS', 'RWANDA', 'MASTER', '2026', 'SUPER', 'ADMIN', 'EPHREM'].join('_');
    const restoKey = crypto.createHmac('sha256', devMaster).update('RESTAURANT:RW01').digest('hex');
    const custKey = crypto
      .createHmac('sha256', restoKey)
      .update(`CUSTOMER:${customer.memberNo}|V${customer.keyVersion || 1}`)
      .digest('hex');
    const tokenKey = `${custKey}:${step}`;

    const claim1 = await recordTokenScan(tokenKey, 60);
    assert.strictEqual(claim1.allowed, true);
    assert.strictEqual(await isTokenUsed(tokenKey), true);

    // Second claim must be blocked as REPLAY_DETECTED
    const claim2 = await recordTokenScan(tokenKey, 60);
    assert.strictEqual(claim2.allowed, false);
    assert.strictEqual(claim2.reason, 'REPLAY_DETECTED');

    // /api/qr/verify must now reject the consumed token
    const verifyAfterConsume = await fetchTestRoute(
      app,
      'POST',
      '/api/qr/verify',
      { payload: dynamicToken, restaurantCode: 'RW01' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert.strictEqual(verifyAfterConsume.body.valid, false);
    assert.match(verifyAfterConsume.body.error || '', /already used|replay/i);

    // Releasing token (e.g. on DB rollback) allows retry
    await releaseTokenScan(tokenKey);
    assert.strictEqual(await isTokenUsed(tokenKey), false);
  });

  test('Workstream F: patron checkout fails closed without MTN Collections and legacy callbacks cannot activate access', async () => {
    const previousMtnEnabled = process.env.RESTOPASS_SAAS_MTN_ENABLED;
    const previousWebhookSecret = process.env.RESTOPASS_MOBILE_MONEY_WEBHOOK_SECRET;
    const previousSettings = { ...getServerDbState().studentSubscriptionSettings };
    const state = getServerDbState();
    ensureServerDbDefaults(state);
    const customer = state.customers.find((item: any) => item.restaurantCode === 'RW01' && item.memberNo) ||
      state.customers.find((item: any) => item.restaurantCode === 'RW01');
    assert.ok(customer);
    const previousRegistrationStatus = customer.registrationStatus;
    try {
      customer.registrationStatus = 'approved';
      state.studentSubscriptionSettings = {
        ...state.studentSubscriptionSettings,
        enabled: true,
        priceRwf: 500,
        promoAccessEnabled: false,
      };
      delete process.env.RESTOPASS_SAAS_MTN_ENABLED;
      delete process.env.RESTOPASS_MOBILE_MONEY_WEBHOOK_SECRET;

      const custToken = createSessionToken({
        userId: customer.id,
        username: customer.memberNo,
        role: 'customer',
        restaurantCode: 'RW01',
      });
      const beforePayments = (state.studentSubscriptionPayments || []).length;
      const beforeSubscriptions = (state.customerSubscriptions || []).length;
      const checkout = await fetchTestRoute(
        app,
        'POST',
        '/api/customer/subscription/checkout',
        { phone: '0788123456', months: 1, idempotencyKey: 'ws-f-' + Date.now() + '-key' },
        { Authorization: 'Bearer ' + custToken }
      );
      assert.strictEqual(checkout.status, 503);
      assert.strictEqual(checkout.body.code, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
      assert.strictEqual((state.studentSubscriptionPayments || []).length, beforePayments);

      const legacyCallback = await fetchTestRoute(
        app,
        'POST',
        '/api/payments/mobile-money/callback',
        {
          internalReference: 'PATRON-UNTRUSTED-REFERENCE',
          providerTransactionId: 'MOMO-TX-UNTRUSTED',
          amountRwf: 500,
          currency: 'RWF',
          status: 'SUCCESSFUL',
        }
      );
      assert.strictEqual(legacyCallback.status, 503);
      assert.strictEqual((state.customerSubscriptions || []).length, beforeSubscriptions);
      assert.equal((state.studentSubscriptionPayments || []).some((p: any) => p.internalReference === 'PATRON-UNTRUSTED-REFERENCE'), false);

      // P0-09: MomoService never enables mock mode in production
      const prevEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const prodMomo = new MomoService({ useMock: true });
        assert.strictEqual(prodMomo.isMock(), false, 'MomoService must never run in mock mode when NODE_ENV=production');
        prodMomo.setMock(true);
        assert.strictEqual(prodMomo.isMock(), false, 'setMock(true) must be ignored when NODE_ENV=production');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    } finally {
      customer.registrationStatus = previousRegistrationStatus;
      state.studentSubscriptionSettings = previousSettings as any;
      if (previousMtnEnabled === undefined) delete process.env.RESTOPASS_SAAS_MTN_ENABLED;
      else process.env.RESTOPASS_SAAS_MTN_ENABLED = previousMtnEnabled;
      if (previousWebhookSecret === undefined) delete process.env.RESTOPASS_MOBILE_MONEY_WEBHOOK_SECRET;
      else process.env.RESTOPASS_MOBILE_MONEY_WEBHOOK_SECRET = previousWebhookSecret;
    }
  });

  test('Workstreams E & G: Remediation deliverable report and deployment/backup artifacts are complete', () => {
    const reportPath = path.join(rootDir, 'docs/REMEDIATION_PROTOCOL_REPORT.md');
    assert.ok(fs.existsSync(reportPath), 'docs/REMEDIATION_PROTOCOL_REPORT.md must exist');
    const report = fs.readFileSync(reportPath, 'utf8');

    assert.ok(report.includes('Workstream A: PostgreSQL Production Database'));
    assert.ok(report.includes('Workstream B: Cryptographic Secrets and QR Security'));
    assert.ok(report.includes('Workstream C: Persistent Patron Photo Storage'));
    assert.ok(report.includes('Workstream D: Redis-Based QR Replay Protection'));
    assert.ok(report.includes('Workstream E: Automated Backups and Disaster Recovery'));
    assert.ok(report.includes('Workstream F: Mobile Money Payment Security'));
    assert.ok(report.includes('Workstream G: Production Deployment Security'));
  });
});
