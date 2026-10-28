import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  createSessionToken,
  verifySessionToken,
  scopeStateForUser,
  atomicSaveDb,
  UserSession,
} from '../server';

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

  test('atomicSaveDb writes atomically and maintains backup (Finding 5)', () => {
    const testState = {
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
});
