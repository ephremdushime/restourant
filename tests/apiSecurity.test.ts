import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  createSessionToken,
  verifySessionToken,
  scopeStateForUser,
  atomicSaveDb,
  validateProductionSecrets,
  sanitizeSensitiveState,
  normalizeStationUserCredentials,
  verifyServerCustomerPin,
  verifyStationUserCredentials,
  isActiveStationSession,
  applySyncDeletionTombstones,
  UserSession,
} from '../server';
import { restoStore } from '../src/store/restoStore';
import { revokeSessionToken, isSessionTokenRevoked, resetMemoryCache } from '../src/services/cache/redisClient';

describe('Server API Security, Session Engine & Role Scoping', () => {
  test('creates and verifies cryptographically signed session tokens', () => {
    const sessionInput: Omit<UserSession, 'iat' | 'exp'> = {
      userId: 'boss_01',
      username: 'boss@example.local',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
    };

    const token = createSessionToken(sessionInput);
    assert.ok(token.startsWith('rp_sess_'));

    const verified = verifySessionToken(token);
    assert.ok(verified);
    assert.equal(verified.userId, 'boss_01');
    assert.equal(verified.role, 'restaurant_admin');
    assert.equal(verified.restaurantCode, 'RW01');
    assert.ok(verified.exp > Date.now());
  });

  test('rejects tampered session tokens', () => {
    const token = createSessionToken({
      userId: 'staff_01',
      username: 'eric.n',
      role: 'stand_staff',
      restaurantCode: 'RW01',
    });

    // Tamper with payload (elevate role to super_admin)
    const [prefixAndB64, sig] = token.split('.');
    const b64 = prefixAndB64.slice('rp_sess_'.length);
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
    payload.role = 'super_admin';
    const tamperedB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const forgedToken = `rp_sess_${tamperedB64}.${sig}`;

    assert.equal(verifySessionToken(forgedToken), null);
  });

  test('rejects expired session tokens', () => {
    // Expired token (expires in -5 seconds)
    const token = createSessionToken(
      {
        userId: 'cust_01',
        username: '28491',
        role: 'customer',
        restaurantCode: 'RW01',
      },
      -5000
    );

    assert.equal(verifySessionToken(token), null);
  });

  test('persists session revocation in the local single-process fallback', async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    resetMemoryCache();
    try {
      const digest = 'unit_test_session_digest_0123456789abcdef';
      assert.equal(await revokeSessionToken(digest, 60), true);
      assert.deepEqual(await isSessionTokenRevoked(digest), { revoked: true, available: true });
      assert.deepEqual(await isSessionTokenRevoked('another_session_digest'), { revoked: false, available: true });
    } finally {
      resetMemoryCache();
      if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousRedisUrl;
    }
  });

  test('role-based data scoping isolates restaurants and customers (Finding 1)', () => {
    const fullMockDbState = {
      restaurants: [
        { code: 'RW01', name: 'Campus Resto' },
        { code: 'RW02', name: 'Downtown Cafe' },
      ],
      customers: [
        { id: 'c1', memberNo: '28491', restaurantCode: 'RW01', pinHash: 'secret_hash_1' },
        { id: 'c2', memberNo: '28492', restaurantCode: 'RW01', pinHash: 'secret_hash_2' },
        { id: 'c3', memberNo: '55555', restaurantCode: 'RW02', pinHash: 'secret_hash_3' },
      ],
      ledgerEntries: [
        { id: 'l1', customerId: 'c1', restaurantCode: 'RW01', amountRwf: 20000 },
        { id: 'l2', customerId: 'c2', restaurantCode: 'RW01', amountRwf: 15000 },
        { id: 'l3', customerId: 'c3', restaurantCode: 'RW02', amountRwf: 50000 },
      ],
      auditLogs: [
        { id: 'a1', restaurantCode: 'RW01', details: 'Secret log RW01' },
        { id: 'a2', restaurantCode: 'RW02', details: 'Secret log RW02' },
      ],
    };

    // 1. Customer scope: receives only their own customer record and ledger, pinHash redacted
    const customerSession: UserSession = {
      userId: 'c1',
      username: '28491',
      role: 'customer',
      restaurantCode: 'RW01',
      iat: Date.now(),
      exp: Date.now() + 10000,
    };
    const scopedCustomer = scopeStateForUser(fullMockDbState, customerSession);
    assert.equal(scopedCustomer.customers.length, 1);
    assert.equal(scopedCustomer.customers[0].id, 'c1');
    assert.equal(scopedCustomer.customers[0].pinHash, undefined); // Redacted
    assert.equal(scopedCustomer.ledgerEntries.length, 1);
    assert.equal(scopedCustomer.ledgerEntries[0].id, 'l1');
    assert.equal(scopedCustomer.auditLogs, undefined); // No audit logs for customer

    // 2. Restaurant Admin scope: receives RW01 data only, RW02 data is excluded
    const adminSession: UserSession = {
      userId: 'boss_rw01',
      username: 'claire@campus.rw',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
      iat: Date.now(),
      exp: Date.now() + 10000,
    };
    const scopedAdmin = scopeStateForUser(fullMockDbState, adminSession);
    assert.equal(scopedAdmin.restaurants.length, 1);
    assert.equal(scopedAdmin.restaurants[0].code, 'RW01');
    assert.equal(scopedAdmin.customers.length, 2);
    assert.ok(scopedAdmin.customers.every((c: any) => c.restaurantCode === 'RW01'));
    assert.equal(scopedAdmin.ledgerEntries.length, 2);
    assert.equal(scopedAdmin.auditLogs.length, 1);

    // 3. Super Admin scope: receives full global multi-tenant state
    const superSession: UserSession = {
      userId: 'ephrem',
      username: 'admin@example.local',
      role: 'super_admin',
      restaurantCode: 'ALL',
      iat: Date.now(),
      exp: Date.now() + 10000,
    };
    const scopedSuper = scopeStateForUser(fullMockDbState, superSession);
    assert.equal(scopedSuper.restaurants.length, 2);
    assert.equal(scopedSuper.customers.length, 3);
  });

  test('migrates legacy station passwords and PINs to scrypt before persistence', () => {
    const stationUser: any = {
      id: 'station_1',
      username: 'cashier_1',
      pin: '654321',
      passwordHash: 'legacy-password-value',
    };
    const state = { stationUsers: [stationUser] };
    assert.equal(normalizeStationUserCredentials(state), true);
    assert.equal(stationUser.pin, undefined);
    assert.match(stationUser.pinHash, /^scrypt\$16384\$8\$1\$/);
    assert.match(stationUser.passwordHash, /^scrypt\$16384\$8\$1\$/);
    assert.equal(verifyServerCustomerPin('654321', {
      id: stationUser.id,
      memberNo: stationUser.username,
      pinHash: stationUser.pinHash,
    }), true);
    assert.equal(verifyServerCustomerPin('wrong-pin', {
      id: stationUser.id,
      memberNo: stationUser.username,
      pinHash: stationUser.pinHash,
    }), false);
  });

  test('authenticates migrated station users with scrypt hashes and rejects blocked users', () => {
    const stationUser: any = {
      id: 'station_auth_1',
      username: 'cashier_auth',
      status: 'active',
      authType: 'both',
      pin: '654321',
      passwordHash: 'LegacyStaffPassword#2026',
    };
    normalizeStationUserCredentials({ stationUsers: [stationUser] });

    assert.equal(stationUser.pin, undefined);
    assert.ok(stationUser.pinHash.startsWith('scrypt$16384$8$1$'));
    assert.ok(stationUser.passwordHash.startsWith('scrypt$16384$8$1$'));
    assert.equal(verifyStationUserCredentials('654321', stationUser), true);
    assert.equal(verifyStationUserCredentials('LegacyStaffPassword#2026', stationUser), true);
    assert.equal(verifyStationUserCredentials('incorrect', stationUser), false);

    // A credential reset arriving as a new plaintext PIN must replace the
    // previous hash before the state is persisted.
    stationUser.pin = '987654';
    normalizeStationUserCredentials({ stationUsers: [stationUser] });
    assert.equal(verifyStationUserCredentials('987654', stationUser), true);
    assert.equal(verifyStationUserCredentials('654321', stationUser), false);

    stationUser.status = 'blocked';
    assert.equal(verifyStationUserCredentials('987654', stationUser), false);

    stationUser.status = 'active';
    stationUser.authType = 'pin8';
    assert.equal(verifyStationUserCredentials('LegacyStaffPassword#2026', stationUser), false);
    assert.equal(verifyStationUserCredentials('987654', stationUser), true);
  });

  test('invalidates production staff sessions when the station account is blocked or deleted', () => {
    const session: UserSession = {
      userId: 'staff_cashier_RW01',
      username: 'cashier_auth',
      role: 'stand_staff',
      restaurantCode: 'RW01',
      iat: Date.now(),
      exp: Date.now() + 60000,
    };
    assert.equal(isActiveStationSession(session, {
      stationUsers: [{ id: 's1', username: 'cashier_auth', restaurantCode: 'RW01', status: 'active' }],
    }), true);
    assert.equal(isActiveStationSession(session, {
      stationUsers: [{ id: 's1', username: 'cashier_auth', restaurantCode: 'RW01', status: 'blocked' }],
    }), false);
    assert.equal(isActiveStationSession(session, { stationUsers: [] }), false);
    assert.equal(isActiveStationSession({ ...session, role: 'customer' }, { stationUsers: [] }), true);
  });

  test('applies tenant-scoped soft-deletion tombstones without deleting financial history', () => {
    const state: any = {
      customers: [
        { id: 'customer_delete_1', restaurantCode: 'RW01' },
        { id: 'customer_keep_2', restaurantCode: 'RW01' },
        { id: 'customer_other_tenant', restaurantCode: 'RW02' },
      ],
      stationUsers: [{ id: 'station_delete_1', restaurantCode: 'RW01', username: 'cashier' }],
      ledgerEntries: [{ id: 'ledger_keep_1', restaurantCode: 'RW01', customerId: 'customer_delete_1', platesDelta: -1 }],
      payments: [{ id: 'payment_keep_1', restaurantCode: 'RW01', amountRwf: 1000 }],
      auditLogs: [],
      deletionTombstones: [],
    };
    const admin: UserSession = {
      userId: 'admin_rw01',
      username: 'admin@rw01.test',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
      iat: Date.now(),
      exp: Date.now() + 60000,
    };
    const applied = applySyncDeletionTombstones(state, [
      { collection: 'customers', recordId: 'customer_delete_1', restaurantCode: 'RW01' },
      { collection: 'stationUsers', recordId: 'station_delete_1', restaurantCode: 'RW01' },
      { collection: 'customers', recordId: 'customer_other_tenant', restaurantCode: 'RW02' },
      { collection: 'ledgerEntries', recordId: 'ledger_keep_1', restaurantCode: 'RW01' },
    ], admin);

    assert.equal(applied, 2);
    assert.deepEqual(state.customers.map((item: any) => item.id), ['customer_keep_2', 'customer_other_tenant']);
    assert.equal(state.stationUsers.length, 0);
    assert.equal(state.ledgerEntries.length, 1);
    assert.equal(state.payments.length, 1);
    assert.equal(state.deletionTombstones.length, 2);
    assert.equal(state.auditLogs.length, 2);

    // Replaying the same deletion request is idempotent.
    assert.equal(applySyncDeletionTombstones(state, [
      { collection: 'customers', recordId: 'customer_delete_1', restaurantCode: 'RW01' },
    ], admin), 0);
    assert.equal(state.deletionTombstones.length, 2);

    // More than 200 previously-applied markers must not starve a new deletion
    // appended after them in an offline client's durable tombstone queue.
    const manyState: any = {
      customers: [{ id: 'customer_after_queue', restaurantCode: 'RW01' }],
      deletionTombstones: Array.from({ length: 205 }, (_, index) => ({
        id: `old_${index}`,
        collection: 'customers',
        recordId: `already_deleted_${index}`,
        restaurantCode: 'RW01',
      })),
      auditLogs: [],
    };
    const queuedRequests = [
      ...manyState.deletionTombstones,
      { collection: 'customers', recordId: 'customer_after_queue', restaurantCode: 'RW01' },
    ];
    assert.equal(applySyncDeletionTombstones(manyState, queuedRequests, admin), 1);
    assert.equal(manyState.customers.length, 0);

    // A customer session cannot submit administrative deletions.
    const customer: UserSession = { ...admin, userId: 'customer_keep_2', username: 'student', role: 'customer' };
    assert.equal(applySyncDeletionTombstones(state, [
      { collection: 'customers', recordId: 'customer_keep_2', restaurantCode: 'RW01' },
    ], customer), 0);
    assert.equal(state.customers.length, 2);
  });

  test('redacts PINs, password hashes, recovery codes and replay state from every client payload', () => {
    const payload = sanitizeSensitiveState({
      customers: [{ id: 'c1', name: 'Test', pinHash: 'hash', pinSalt: 'salt', idHash: 'identity-hash', onboardingToken: 'secret' }],
      stationUsers: [{ id: 's1', username: 'cashier', pin: '123456', passwordHash: 'hash' }],
      pinRecoveryRequests: [{ id: 'r1', status: 'pending', recoveryCode: '123456' }],
      activationCodes: [{ id: 'a1', activationCode: 'ABCDEF' }],
      usedTokens: [{ token: 'replay-secret' }],
      safeValue: 'retained',
    });
    assert.equal(payload.customers[0].id, 'c1');
    assert.equal(payload.customers[0].pinHash, undefined);
    assert.equal(payload.customers[0].pinSalt, undefined);
    assert.equal(payload.customers[0].idHash, undefined);
    assert.equal(payload.customers[0].onboardingToken, undefined);
    assert.equal(payload.stationUsers[0].pin, undefined);
    assert.equal(payload.stationUsers[0].passwordHash, undefined);
    assert.equal(payload.pinRecoveryRequests[0].recoveryCode, undefined);
    assert.equal(payload.activationCodes[0].activationCode, undefined);
    assert.equal(payload.usedTokens, undefined);
    assert.equal(payload.safeValue, 'retained');
  });

  test('atomicSaveDb writes atomically and maintains backup (Finding 5)', () => {
    const testState = {
      ...restoStore.getState(),
      testId: 'atomic_test_01',
      timestamp: new Date().toISOString(),
    };

    const saved = atomicSaveDb(testState);
    assert.equal(saved, true);

    const dataDir = path.resolve(process.cwd(), 'data');
    const dbFile = path.join(dataDir, 'db.json');
    assert.equal(fs.existsSync(dbFile), true);

    const readBack = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
    assert.equal(readBack.testId, 'atomic_test_01');
  });

  test('customer identity isolation: getCurrentCustomer never falls back to first customer when missing or invalid', () => {
    const state = restoStore.getState();
    const originalResto = state.currentRestaurantCode;
    const originalCustomer = state.currentCustomerId;

    try {
      restoStore.setRestaurantCode('RW01');
      // 1. Valid customer ID resolves to that exact customer
      restoStore.setCustomer('cust_28491');
      const cust1 = restoStore.getCurrentCustomer();
      assert.ok(cust1);
      assert.equal(cust1.id, 'cust_28491');

      // 2. Second distinct customer resolves only to their own identity
      restoStore.setCustomer('cust_28492');
      const cust2 = restoStore.getCurrentCustomer();
      assert.ok(cust2);
      assert.equal(cust2.id, 'cust_28492');
      assert.notEqual(cust1.id, cust2.id);

      // 3. Invalid or missing customer ID returns undefined (NEVER silently selects cust_28491)
      restoStore.setCustomer('cust_non_existent_99999');
      assert.equal(restoStore.getCurrentCustomer(), undefined);

      restoStore.setCustomer('');
      assert.equal(restoStore.getCurrentCustomer(), undefined);

      // 4. Switching restaurant clears currentCustomerId if customer does not belong to target restaurant
      restoStore.setCustomer('cust_28491'); // belongs to RW01
      restoStore.setRestaurantCode('RW02');
      assert.equal(restoStore.getCurrentCustomer(), undefined);
    } finally {
      restoStore.setRestaurantCode(originalResto);
      restoStore.setCustomer(originalCustomer);
    }
  });

  test('validateProductionSecrets throws fatal error in production when secrets are missing or weak', () => {
    // Missing secrets in production must throw
    assert.throws(
      () =>
        validateProductionSecrets({
          NODE_ENV: 'production',
        } as unknown as NodeJS.ProcessEnv),
      /FATAL SECURITY ERROR/
    );

    // Short secrets (<32 chars) in production must throw
    assert.throws(
      () =>
        validateProductionSecrets({
          NODE_ENV: 'production',
          SESSION_SECRET: 'too_short_secret',
          RESTOPASS_MASTER_SECRET: 'also_too_short',
        } as unknown as NodeJS.ProcessEnv),
      /FATAL SECURITY ERROR/
    );

    // Placeholder secrets in production must throw
    assert.throws(
      () =>
        validateProductionSecrets({
          NODE_ENV: 'production',
          SESSION_SECRET: 'REPLACE_WITH_32_PLUS_CHAR_RANDOM_PRODUCTION_SESSION_SECRET',
          RESTOPASS_MASTER_SECRET: 'REPLACE_WITH_32_PLUS_CHAR_RANDOM_PRODUCTION_MASTER_SECRET',
        } as unknown as NodeJS.ProcessEnv),
      /placeholder/i
    );

    // Administrator credentials are mandatory and cannot be left at known placeholders.
    assert.throws(
      () =>
        validateProductionSecrets({
          NODE_ENV: 'production',
          SESSION_SECRET: 'prod_session_secret_with_at_least_32_characters_random_2026',
          RESTOPASS_MASTER_SECRET: 'prod_master_secret_with_at_least_32_characters_random_2026!',
        } as unknown as NodeJS.ProcessEnv),
      /RESTOPASS_SUPERADMIN_PASSWORD/
    );

    assert.throws(
      () =>
        validateProductionSecrets({
          NODE_ENV: 'production',
          SESSION_SECRET: 'prod_session_secret_with_at_least_32_characters_random_2026',
          RESTOPASS_MASTER_SECRET: 'prod_master_secret_with_at_least_32_characters_random_2026!',
          RESTOPASS_SUPERADMIN_PASSWORD: 'a_long_unique_superadmin_password_2026',
          RESTOPASS_BOSS_PASSWORD: 'a_long_unique_restaurant_boss_password_2026',
          RESTOPASS_STAFF_DEFAULT_PIN: '1234',
        } as unknown as NodeJS.ProcessEnv),
      /6-8 digits/
    );

    // Strong 32+ char secrets in production succeed
    const strongSession = 'prod_session_secret_with_at_least_32_characters_random_2026';
    const strongMaster = 'prod_master_secret_with_at_least_32_characters_random_2026!';
    const valid = validateProductionSecrets({
      NODE_ENV: 'production',
      SESSION_SECRET: strongSession,
      RESTOPASS_MASTER_SECRET: strongMaster,
      RESTOPASS_SUPERADMIN_PASSWORD: 'a_long_unique_superadmin_password_2026',
      RESTOPASS_BOSS_PASSWORD: 'a_long_unique_restaurant_boss_password_2026',
    } as unknown as NodeJS.ProcessEnv);
    assert.equal(valid.sessionSecret, strongSession);
    assert.equal(valid.masterSecret, strongMaster);
  });
});
