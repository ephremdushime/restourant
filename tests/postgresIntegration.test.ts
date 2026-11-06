import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initPostgres,
  loadStateFromPostgres,
  saveStateToPostgres,
  commitPlateTransferPostgres,
  closePostgres,
  checkPostgresReady,
} from '../src/services/db/postgresAdapter';
import { checkRedisReady, recordTokenScan, closeRedis, revokeSessionToken, isSessionTokenRevoked } from '../src/services/cache/redisClient';

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
    assert.equal(await checkPostgresReady(), true);

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
