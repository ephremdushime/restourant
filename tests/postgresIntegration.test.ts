import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  initPostgres,
  loadStateFromPostgres,
  saveStateToPostgres,
  commitPlateTransferPostgres,
  upsertCustomerRecordPostgres,
  computeCustomerBalanceSql,
  closePostgres,
  checkPostgresReady,
  getPostgresPool,
} from '../src/services/db/postgresAdapter';
import {
  app,
  createSessionToken,
  getServerCustomerBalance,
  getServerDbState,
  ensureServerDbDefaults,
} from '../server';
import { checkRedisReady, recordTokenScan, closeRedis, revokeSessionToken, isSessionTokenRevoked } from '../src/services/cache/redisClient';

test('P0-01: schema.sql indexes balance_checkpoints.cutoff_timestamp and never references cutoff_date', () => {
  const schemaPath = path.join(process.cwd(), 'src', 'services', 'db', 'schema.sql');
  const ddl = fs.readFileSync(schemaPath, 'utf8');
  assert.doesNotMatch(ddl, /\bcutoff_date\b/, 'schema.sql must not reference non-existent cutoff_date column');
  assert.match(
    ddl,
    /CREATE INDEX IF NOT EXISTS idx_checkpoints_customer_cutoff\s+ON balance_checkpoints\s*\(\s*customer_id\s*,\s*cutoff_timestamp\s+DESC\s*\)/i
  );
});

test('P0-02, P0-03, P0-10: monotonic snapshot SQL guards, checkpoint-aware balances, and gated transfer routes', async () => {
  const adapterSource = fs.readFileSync(path.join(process.cwd(), 'src', 'services', 'db', 'postgresAdapter.ts'), 'utf8');
  // P0-02 monotonic guards in saveStateToPostgres
  assert.match(adapterSource, /WHERE COALESCE\(payments\.data->>'refundStatus', ''\) <> 'refunded'/);
  assert.match(adapterSource, /WHERE COALESCE\(scan_events\.status, ''\) <> 'undone'/);
  assert.match(adapterSource, /WHERE COALESCE\(transfers\.data->>'status', ''\) <> 'reversed'/);
  assert.match(adapterSource, /WHERE pending_approvals\.status = 'pending'/);
  assert.equal(typeof upsertCustomerRecordPostgres, 'function');
  assert.equal(typeof computeCustomerBalanceSql, 'function');

  // P0-03: getServerCustomerBalance honors both balanceCheckpoints and checkpoints
  const cutoff = '2026-06-01T12:00:00.000Z';
  const beforeCutoff = '2026-06-01T10:00:00.000Z';
  const afterCutoff = '2026-06-01T14:00:00.000Z';
  const mockStateWithCheckpoints = {
    checkpoints: [{ id: 'cp_1', customerId: 'cust_cp_test', balance: 25, cutoffTimestamp: cutoff }],
    ledgerEntries: [
      { id: 'led_old', customerId: 'cust_cp_test', platesDelta: 100, timestamp: beforeCutoff },
      { id: 'led_new', customerId: 'cust_cp_test', platesDelta: -3, timestamp: afterCutoff },
    ],
  };
  assert.equal(getServerCustomerBalance(mockStateWithCheckpoints, 'cust_cp_test'), 22);

  // P0-03: Both /api/customer/transfers and /api/customer/transfer fail closed with 503 when RESTOPASS_CUSTOMER_TRANSFERS_ENABLED !== 'true'
  const prevTransferFlag = process.env.RESTOPASS_CUSTOMER_TRANSFERS_ENABLED;
  delete process.env.RESTOPASS_CUSTOMER_TRANSFERS_ENABLED;
  const state = getServerDbState();
  ensureServerDbDefaults(state);
  const custToken = createSessionToken({
    userId: 'cust_28491',
    username: '28491',
    role: 'customer',
    restaurantCode: 'RW01',
  });

  const invokeRoute = (method: string, urlPath: string, body: any, token: string) =>
    new Promise<{ status: number; body: any }>((resolve) => {
      let statusCode = 200;
      const req: any = {
        method,
        url: urlPath,
        path: urlPath,
        query: {},
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body,
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      };
      const res: any = {
        statusCode: 200,
        status(code: number) { statusCode = code; this.statusCode = code; return this; },
        json(data: any) { resolve({ status: statusCode, body: data }); return this; },
        send(data: any) { resolve({ status: statusCode, body: data }); return this; },
        setHeader() { return this; },
        end(data?: any) { resolve({ status: statusCode, body: data || null }); return this; },
      };
      (app as any).handle(req, res);
    });

  try {
    for (const endpoint of ['/api/customer/transfers', '/api/customer/transfer']) {
      const resp = await invokeRoute('POST', endpoint, {
        recipientMemberNo: '28492',
        recipientIdentifier: '28492',
        plates: 1,
        pin: '123456',
        idempotencyKey: 'idem_transfer_disabled_check_0001',
      }, custToken);
      assert.equal(resp.status, 503, `${endpoint} must return 503 when RESTOPASS_CUSTOMER_TRANSFERS_ENABLED is not 'true'`);
      assert.equal(resp.body?.code, 'CUSTOMER_TRANSFERS_DISABLED');
    }
  } finally {
    if (prevTransferFlag === undefined) delete process.env.RESTOPASS_CUSTOMER_TRANSFERS_ENABLED;
    else process.env.RESTOPASS_CUSTOMER_TRANSFERS_ENABLED = prevTransferFlag;
  }
});

test('P0-05: activation, registration status, and recovery routes enforce tenant isolation and block codeless memberNo takeover', async () => {
  const state = getServerDbState();
  ensureServerDbDefaults(state);

  const invokeRoute = (method: string, urlPath: string, body: any, token?: string) =>
    new Promise<{ status: number; body: any }>((resolve) => {
      let statusCode = 200;
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token) headers.authorization = `Bearer ${token}`;
      const req: any = {
        method,
        url: urlPath,
        path: urlPath,
        query: {},
        headers,
        body,
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      };
      const res: any = {
        statusCode: 200,
        status(code: number) { statusCode = code; this.statusCode = code; return this; },
        json(data: any) { resolve({ status: statusCode, body: data }); return this; },
        send(data: any) { resolve({ status: statusCode, body: data }); return this; },
        setHeader() { return this; },
        end(data?: any) { resolve({ status: statusCode, body: data || null }); return this; },
      };
      (app as any).handle(req, res);
    });

  const sharedMemberNo = '99401';
  const sharedPhone = '+250 788 994 001';
  const rw01Cust = {
    id: 'cust_p005_rw01',
    memberNo: sharedMemberNo,
    restaurantCode: 'RW01',
    name: 'Tenant One Customer',
    phone: sharedPhone,
    cardVersion: 1,
    keyVersion: 1,
    cardStatus: 'active',
    hasCustomPin: false,
    pinHash: '',
    registrationStatus: 'pending_boss_approval',
    receptionPaymentStatus: 'confirmed',
    provisionalStatus: 'pending_approval',
    activationStatus: 'partial_active',
    onboardingToken: 'OB-RW01-99401-SECRET',
    createdAt: new Date().toISOString(),
    consentSigned: true,
  };
  const rw02Cust = {
    id: 'cust_p005_rw02',
    memberNo: sharedMemberNo,
    restaurantCode: 'RW02',
    name: 'Tenant Two Customer',
    phone: sharedPhone,
    cardVersion: 1,
    keyVersion: 1,
    cardStatus: 'active',
    hasCustomPin: false,
    pinHash: '',
    registrationStatus: 'approved',
    receptionPaymentStatus: 'confirmed',
    provisionalStatus: 'approved',
    activationStatus: 'ready_for_activation',
    onboardingToken: 'OB-RW02-99401-SECRET',
    createdAt: new Date().toISOString(),
    consentSigned: true,
  };
  state.customers = state.customers.filter((c: any) => c.id !== rw01Cust.id && c.id !== rw02Cust.id);
  state.customers.push(rw01Cust, rw02Cust);

  // 1. /api/customer/registration/status must NOT leak memberNo on phone-only lookup
  const statusNoProof = await invokeRoute('POST', '/api/customer/registration/status', {
    phone: sharedPhone,
    restaurantCode: 'RW01',
  });
  assert.equal(statusNoProof.status, 200);
  assert.equal(statusNoProof.body.status, 'needs_pin_setup');
  assert.equal(statusNoProof.body.memberNo, undefined, 'Must not leak memberNo on unauthenticated phone-only lookup');

  const statusWithToken = await invokeRoute('POST', '/api/customer/registration/status', {
    phone: sharedPhone,
    restaurantCode: 'RW01',
    onboardingToken: 'OB-RW01-99401-SECRET',
  });
  assert.equal(statusWithToken.status, 200);
  assert.equal(statusWithToken.body.memberNo, sharedMemberNo);

  // 2. Codeless PIN takeover attempt using sequential memberNo on pending_boss_approval account must be rejected
  const takeoverAttempt = await invokeRoute('POST', '/api/customer/activation/complete', {
    phoneOrMember: sharedMemberNo,
    newPin: '654321',
    restaurantCode: 'RW01',
  });
  assert.equal(takeoverAttempt.status, 400);
  assert.equal(rw01Cust.hasCustomPin, false, 'Codeless activation attempt must not set customer PIN');

  // 3. Staff in RW02 requesting activation by shared memberNo must resolve RW02 customer, never RW01
  const rw02AdminToken = createSessionToken({
    userId: 'staff_rw02_boss',
    username: 'rw02_boss',
    role: 'restaurant_admin',
    restaurantCode: 'RW02',
  });
  const actReqResp = await invokeRoute('POST', '/api/customer/activation/request', {
    memberNo: sharedMemberNo,
  }, rw02AdminToken);
  assert.equal(actReqResp.status, 200);
  assert.equal(actReqResp.body.customerName, 'Tenant Two Customer');

  // Cross-tenant activation completion using RW02's code against RW01 must fail
  const crossTenantComplete = await invokeRoute('POST', '/api/customer/activation/complete', {
    phoneOrMember: sharedPhone,
    activationCode: actReqResp.body.activationCode,
    newPin: '765432',
    restaurantCode: 'RW01',
  });
  assert.equal(crossTenantComplete.status, 400);
  assert.equal(rw01Cust.hasCustomPin, false);

  // Valid tenant activation completion for RW02 succeeds
  const validComplete = await invokeRoute('POST', '/api/customer/activation/complete', {
    phoneOrMember: sharedPhone,
    activationCode: actReqResp.body.activationCode,
    newPin: '765432',
    restaurantCode: 'RW02',
  });
  assert.equal(validComplete.status, 200);
  assert.equal(validComplete.body.customer.restaurantCode, 'RW02');
  assert.equal(rw02Cust.hasCustomPin, true);

  // 4. Recovery request by phone requires restaurantCode and scopes to the requested tenant
  const recMissingTenant = await invokeRoute('POST', '/api/customer/recovery/request', {
    phone: sharedPhone,
    reason: 'Forgot PIN',
  });
  assert.equal(recMissingTenant.status, 400);

  const recRw02 = await invokeRoute('POST', '/api/customer/recovery/request', {
    phone: sharedPhone,
    restaurantCode: 'RW02',
    reason: 'Forgot PIN',
  });
  assert.equal(recRw02.status, 200);
  const createdRec = (state.pinRecoveryRequests || []).find((r: any) => r.id === recRw02.body.requestId);
  assert.ok(createdRec);
  assert.equal(createdRec.customerId, rw02Cust.id);
  assert.equal(createdRec.restaurantCode, 'RW02');
});

test('PostgreSQL persistence round-trip and concurrent transfer invariants', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousSslMode = process.env.PGSSLMODE;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.PGSSLMODE = 'disable';

  const suffix = `it_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const restaurantCode = `T${suffix.slice(-12)}`.slice(0, 32);
  const senderId = `sender_${suffix}`;
  const recipientId = `recipient_${suffix}`;
  const now = new Date().toISOString();

  try {
    assert.equal(await initPostgres(), true);
    // Repeat initialization must be safe and idempotent (P0-01).
    assert.equal(await initPostgres(), true);
    assert.equal(await checkPostgresReady(), true);

    const pool = getPostgresPool();
    assert.ok(pool);
    const idxCheck = await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'balance_checkpoints' AND indexname = 'idx_checkpoints_customer_cutoff'`
    );
    assert.equal(idxCheck.rowCount, 1);
    assert.match(String(idxCheck.rows[0]?.indexdef || ''), /cutoff_timestamp/i);

    const state = {
      restaurants: [{ code: restaurantCode, name: 'Integration Test Restaurant', status: 'active' }],
      licenses: [{ id: `license_${suffix}`, restaurantCode, planId: 'pilot', validUntil: new Date(Date.now() + 86400000).toISOString() }],
      customers: [
        { id: senderId, restaurantCode, memberNo: `S${suffix}`, name: 'Sender', cardStatus: 'active' },
        { id: recipientId, restaurantCode, memberNo: `R${suffix}`, name: 'Recipient', cardStatus: 'active' },
      ],
      ledgerEntries: [{
        id: `opening_${suffix}`, idempotencyKey: `opening_${suffix}`,
        customerId: senderId, restaurantCode, type: 'purchase', platesDelta: 10,
        amountRwf: 10000, timestamp: now,
      }],
      balanceCheckpoints: [{ id: `checkpoint_${suffix}`, customerId: senderId, balance: 10, cutoffTimestamp: now }],
      payments: [{ id: `payment_${suffix}`, restaurantCode, customerId: senderId, amountRwf: 10000 }],
      scanEvents: [{ id: `scan_${suffix}`, restaurantCode, customerId: senderId, stationId: 'station_1', status: 'accepted' }],
      pendingApprovals: [{ id: `approval_${suffix}`, restaurantCode, customerId: senderId, type: 'topup', status: 'approved' }],
      branches: [{ id: `branch_${suffix}`, restaurantCode, code: `B${suffix}`, name: 'Main' }],
      stationUsers: [{ id: `station_user_${suffix}`, restaurantCode, username: `operator_${suffix}`, role: 'stand_staff' }],
      notifications: [{ id: `notification_${suffix}`, restaurantCode, target: senderId, title: 'Test notification' }],
      expenses: [{ id: `expense_${suffix}`, restaurantCode, amountRwf: 500 }],
      transfers: [],
      auditLogs: [{ id: `audit_${suffix}`, restaurantCode, userId: senderId, action: 'INTEGRATION_TEST' }],
      studentSubscriptionSettings: { enabled: true, priceRwf: 500, currency: 'RWF', graceDays: 3 },
      studentSubscriptionPayments: [{ id: `student_payment_${suffix}`, customerId: senderId, restaurantCode, amountRwf: 500, status: 'pending' }],
      restaurantSubscriptions: [{ id: `restaurant_sub_${suffix}`, restaurantCode, status: 'active' }],
      restaurantSubscriptionPayments: [{ id: `restaurant_payment_${suffix}`, restaurantCode, amountRwf: 65000, status: 'pending' }],
      subscriptionPayments: [{ id: `subscription_payment_${suffix}`, restaurantCode, product: 'restaurant_subscription', status: 'pending' }],
      activationCodes: [{ id: `activation_${suffix}`, restaurantCode, status: 'unused' }],
      plans: [], scanPoints: [], packages: [],
      menuItems: [{ id: `menu_deleted_${suffix}`, restaurantCode, name: 'Retired menu item', priceRwf: 1000 }],
      cashierSessions: [], shifts: [],
      activationRequests: [], pinRecoveryRequests: [], customTranslations: {},
      deletionTombstones: [{
        id: `tombstone_menu_${suffix}`,
        collection: 'menuItems',
        recordId: `menu_deleted_${suffix}`,
        restaurantCode,
        deletedAt: new Date().toISOString(),
        deletedBy: 'integration-test',
      }],
    };

    assert.equal(await saveStateToPostgres(state), true);
    // Replaying the same snapshot must not duplicate append-only ledger rows.
    assert.equal(await saveStateToPostgres(state), true);
    const loaded = await loadStateFromPostgres();
    assert.ok(loaded);
    assert.ok(loaded.restaurants.some((item: any) => item.code === restaurantCode));
    assert.ok(loaded.customers.some((item: any) => item.id === senderId));
    assert.ok(loaded.ledgerEntries.some((item: any) => item.id === `opening_${suffix}`));
    assert.ok(loaded.payments.some((item: any) => item.id === `payment_${suffix}`));
    assert.ok(loaded.scanEvents.some((item: any) => item.id === `scan_${suffix}`));
    assert.ok(loaded.pendingApprovals.some((item: any) => item.id === `approval_${suffix}`));
    assert.ok(loaded.branches.some((item: any) => item.id === `branch_${suffix}`));
    assert.ok(loaded.stationUsers.some((item: any) => item.id === `station_user_${suffix}`));
    assert.ok(loaded.notifications.some((item: any) => item.id === `notification_${suffix}`));
    assert.ok(loaded.expenses.some((item: any) => item.id === `expense_${suffix}`));
    assert.ok(loaded.auditLogs.some((item: any) => item.id === `audit_${suffix}`));
    assert.ok(loaded.studentSubscriptionPayments.some((item: any) => item.id === `student_payment_${suffix}`));
    assert.ok(loaded.restaurantSubscriptions.some((item: any) => item.id === `restaurant_sub_${suffix}`));
    assert.ok(loaded.restaurantSubscriptionPayments.some((item: any) => item.id === `restaurant_payment_${suffix}`));
    assert.ok(loaded.subscriptionPayments.some((item: any) => item.id === `subscription_payment_${suffix}`));
    assert.ok(loaded.activationCodes.some((item: any) => item.id === `activation_${suffix}`));
    assert.ok(loaded.deletionTombstones.some((item: any) => item.id === `tombstone_menu_${suffix}`));
    assert.equal(loaded.menuItems.some((item: any) => item.id === `menu_deleted_${suffix}`), false);

    const buildTransfer = (label: string, idempotencyKey: string) => {
      const transferId = `transfer_${suffix}_${label}`;
      const transfer = {
        id: transferId, idempotencyKey, restaurantCode, senderCustomerId: senderId,
        recipientCustomerId: recipientId, senderMemberNo: `S${suffix}`,
        recipientMemberNo: `R${suffix}`, plates: 7, timestamp: new Date().toISOString(), status: 'completed',
      };
      return {
        transfer,
        ledgerOut: {
          id: `ledger_out_${suffix}_${label}`, idempotencyKey: `transfer:${transferId}:out`,
          customerId: senderId, restaurantCode, type: 'transfer_out', platesDelta: -7,
          timestamp: transfer.timestamp, reference: transferId,
        },
        ledgerIn: {
          id: `ledger_in_${suffix}_${label}`, idempotencyKey: `transfer:${transferId}:in`,
          customerId: recipientId, restaurantCode, type: 'transfer_in', platesDelta: 7,
          timestamp: transfer.timestamp, reference: transferId,
        },
        auditLog: {
          id: `audit_transfer_${suffix}_${label}`, restaurantCode, userId: senderId,
          action: 'PLATES_TRANSFERRED', timestamp: transfer.timestamp,
        },
        notifications: [],
      };
    };

    const [first, second] = await Promise.all([
      commitPlateTransferPostgres(buildTransfer('a', `idem_${suffix}_a`)),
      commitPlateTransferPostgres(buildTransfer('b', `idem_${suffix}_b`)),
    ]);
    assert.equal([first, second].filter((result) => result.ok).length, 1);
    assert.equal([first, second].filter((result) => !result.ok && result.code === 'INSUFFICIENT_BALANCE').length, 1);

    const winningLabel = first.ok ? 'a' : 'b';
    const winningKey = `idem_${suffix}_${winningLabel}`;
    const exactRetry = await commitPlateTransferPostgres(buildTransfer(winningLabel, winningKey));
    assert.equal(exactRetry.ok, true);
    if (exactRetry.ok) assert.equal(exactRetry.idempotent, true);

    const alteredRetry = buildTransfer(winningLabel, winningKey);
    alteredRetry.transfer.plates = 6;
    const conflict = await commitPlateTransferPostgres(alteredRetry);
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, 'IDEMPOTENCY_CONFLICT');

    const after = await loadStateFromPostgres();
    assert.equal(after.ledgerEntries.filter((item: any) => item.customerId === senderId).reduce((sum: number, item: any) => sum + item.platesDelta, 0), 3);
    assert.equal(after.ledgerEntries.filter((item: any) => item.customerId === recipientId).reduce((sum: number, item: any) => sum + item.platesDelta, 0), 7);
    assert.equal(after.transfers.filter((item: any) => item.restaurantCode === restaurantCode).length, 1);
  } finally {
    await closePostgres();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousSslMode === undefined) delete process.env.PGSSLMODE;
    else process.env.PGSSLMODE = previousSslMode;
  }
});


test('Redis readiness and atomic QR replay prevention', {
  skip: !process.env.TEST_REDIS_URL,
}, async () => {
  const previousRedisUrl = process.env.REDIS_URL;
  process.env.REDIS_URL = process.env.TEST_REDIS_URL!;
  const tokenKey = `ci_replay_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try {
    assert.equal(await checkRedisReady(), true);
    assert.deepEqual(await recordTokenScan(tokenKey, 60), { allowed: true });
    assert.deepEqual(await recordTokenScan(tokenKey, 60), { allowed: false, reason: 'REPLAY_DETECTED' });

    const revokedDigest = `ci_session_revocation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    assert.equal(await revokeSessionToken(revokedDigest, 60), true);
    assert.deepEqual(await isSessionTokenRevoked(revokedDigest), { revoked: true, available: true });
    // Reconnect to Redis to prove revocation survives an application-side client restart.
    await closeRedis();
    assert.equal(await checkRedisReady(), true);
    assert.deepEqual(await isSessionTokenRevoked(revokedDigest), { revoked: true, available: true });
  } finally {
    await closeRedis();
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  }
});
