import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  app,
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  scopeStateForUser,
  validateProductionSecrets,
  isPlaceholderSecret,
  setServerDbState,
  getServerDbState,
  UserSession,
} from '../server';

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
      setHeader() { return this; },
      end(data?: any) {
        resolve({ status: statusCode, body: data || null });
      },
    };

    expressApp.handle(req, res);
  });
}

describe('Phase 2: Security Hardening, Session Security & Tenant Isolation', () => {
  let originalDbState: any;

  before(() => {
    originalDbState = getServerDbState();
  });

  after(() => {
    setServerDbState(originalDbState);
  });

  describe('1. Production Secrets Validation & Placeholder Detection', () => {
    test('isPlaceholderSecret identifies unsafe patterns and repeated characters', () => {
      assert.equal(isPlaceholderSecret(''), true);
      assert.equal(isPlaceholderSecret('change_me_in_production_1234567890'), true);
      assert.equal(isPlaceholderSecret('my_placeholder_secret_key_value_32'), true);
      assert.equal(isPlaceholderSecret('your_secret_should_be_placed_here_32'), true);
      assert.equal(isPlaceholderSecret('generate_a_unique_backup_encryption_passphrase'), true);
      assert.equal(isPlaceholderSecret('example_secret_for_deployment_32chars'), true);
      assert.equal(isPlaceholderSecret('00000000000000000000000000000000'), true);
      assert.equal(isPlaceholderSecret('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), true);

      // Strong random secret passes
      assert.equal(isPlaceholderSecret('c8f12a3d7e9b04561f2e3d4c5b6a708192837465'), false);
    });

    test('validateProductionSecrets throws on missing, short, dev default, or placeholder secrets in production', () => {
      // Missing
      assert.throws(
        () => validateProductionSecrets({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
        /FATAL SECURITY ERROR/
      );

      // Short (< 32 chars)
      assert.throws(
        () =>
          validateProductionSecrets({
            NODE_ENV: 'production',
            SESSION_SECRET: 'short_secret',
            RESTOPASS_MASTER_SECRET: 'short_master',
          } as NodeJS.ProcessEnv),
        /FATAL SECURITY ERROR/
      );

      // Placeholder keywords in production
      assert.throws(
        () =>
          validateProductionSecrets({
            NODE_ENV: 'production',
            SESSION_SECRET: 'change_me_in_production_session_secret_32chars!',
            RESTOPASS_MASTER_SECRET: 'random_master_secret_with_32_chars_ok_12345678',
          } as NodeJS.ProcessEnv),
        /non-placeholder/
      );

      // Weak super admin password
      assert.throws(
        () =>
          validateProductionSecrets({
            NODE_ENV: 'production',
            SESSION_SECRET: 'strong_session_secret_with_32_characters_12345678',
            RESTOPASS_MASTER_SECRET: 'strong_master_secret_with_32_characters_12345678',
            RESTOPASS_SUPERADMIN_PASSWORD: 'short',
          } as NodeJS.ProcessEnv),
        /RESTOPASS_SUPERADMIN_PASSWORD/
      );

      // Valid production secrets succeed
      const valid = validateProductionSecrets({
        NODE_ENV: 'production',
        SESSION_SECRET: 'strong_prod_session_secret_key_at_least_32_chars_2026',
        RESTOPASS_MASTER_SECRET: 'strong_prod_master_secret_key_at_least_32_chars_2026!',
        RESTOPASS_SUPERADMIN_PASSWORD: 'StrongSuperAdminPass2026!Secure',
      } as NodeJS.ProcessEnv);

      assert.equal(valid.sessionSecret, 'strong_prod_session_secret_key_at_least_32_chars_2026');
      assert.equal(valid.masterSecret, 'strong_prod_master_secret_key_at_least_32_chars_2026!');
    });
  });

  describe('2. Session Token Lifecycle & Revocation', () => {
    test('revoked session tokens fail authentication with explicit revocation error', async () => {
      const token = createSessionToken({
        userId: 'super_admin_principal',
        username: 'superadmin',
        role: 'super_admin',
        restaurantCode: 'ALL',
      });

      // Token is valid initially
      const resInitial = await fetchTestRoute(app, 'GET', '/api/auth/session', null, {
        Authorization: `Bearer ${token}`,
      });
      assert.equal(resInitial.status, 200);

      // Revoke the token
      const revoked = await revokeSessionToken(token);
      assert.equal(revoked, true);

      // Immediate subsequent call must be rejected
      const resRevoked = await fetchTestRoute(app, 'GET', '/api/auth/session', null, {
        Authorization: `Bearer ${token}`,
      });
      assert.equal(resRevoked.status, 401);
      assert.match(resRevoked.body.error, /Session has been revoked/i);
    });
  });

  describe('3. Cross-Tenant Isolation in Customer Activation & PIN Recovery', () => {
    before(() => {
      setServerDbState({
        restaurants: [
          { code: 'RW01', name: 'Restaurant 1', status: 'active' },
          { code: 'RW02', name: 'Restaurant 2', status: 'active' },
        ],
        customers: [
          {
            id: 'cust_rw01',
            memberNo: '10001',
            restaurantCode: 'RW01',
            name: 'Alice RW01',
            phone: '+250788000001',
            provisionalStatus: 'approved',
            activationStatus: 'ready_for_activation',
            cardStatus: 'active',
            pinHash: 'scrypt$dummy$1',
          },
          {
            id: 'cust_rw02',
            memberNo: '20001',
            restaurantCode: 'RW02',
            name: 'Bob RW02',
            phone: '+250788000002',
            provisionalStatus: 'approved',
            activationStatus: 'ready_for_activation',
            cardStatus: 'active',
            pinHash: 'scrypt$dummy$2',
          },
        ],
        activationRequests: [],
        pinRecoveryRequests: [
          {
            id: 'rec_rw02_pending',
            customerId: 'cust_rw02',
            memberNo: '20001',
            phone: '+250788000002',
            restaurantCode: 'RW02',
            reason: 'Forgot PIN',
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        ],
        scanPoints: [
          { id: 'station_rw01', restaurantCode: 'RW01', status: 'active', isPaired: true },
        ],
        stationUsers: [
          { id: 'staff_rw01_1', username: 'staff.rw01', restaurantCode: 'RW01', stationId: 'station_rw01', status: 'active', sessionVersion: 1 },
        ],
        ledgerEntries: [],
      });
    });

    test('stand_staff cannot request activation code for customer belonging to another restaurant', async () => {
      const tokenStaffRW01 = createSessionToken({
        userId: 'staff_rw01_1',
        username: 'staff.rw01',
        role: 'stand_staff',
        restaurantCode: 'RW01',
        stationId: 'station_rw01',
        sessionVersion: 1,
      });

      // Staff from RW01 attempts to generate activation code for customer in RW02
      const resCrossTenant = await fetchTestRoute(
        app,
        'POST',
        '/api/customer/activation/request',
        { customerId: 'cust_rw02' },
        { Authorization: `Bearer ${tokenStaffRW01}` }
      );

      assert.equal(resCrossTenant.status, 403);
      assert.match(resCrossTenant.body.error, /Customer belongs to another restaurant/i);

      // Staff from RW01 requesting for customer in RW01 succeeds
      const resSameTenant = await fetchTestRoute(
        app,
        'POST',
        '/api/customer/activation/request',
        { customerId: 'cust_rw01' },
        { Authorization: `Bearer ${tokenStaffRW01}` }
      );

      assert.equal(resSameTenant.status, 200);
      assert.equal(resSameTenant.body.success, true);
      assert.ok(resSameTenant.body.activationCode);
    });

    test('restaurant_admin cannot approve PIN recovery request for another restaurant', async () => {
      const tokenAdminRW01 = createSessionToken({
        userId: 'admin_rw01_1',
        username: 'admin.rw01',
        role: 'restaurant_admin',
        restaurantCode: 'RW01',
      });

      // Admin from RW01 attempts to approve recovery request in RW02
      const resCrossTenant = await fetchTestRoute(
        app,
        'POST',
        '/api/customer/recovery/approve',
        { requestId: 'rec_rw02_pending' },
        { Authorization: `Bearer ${tokenAdminRW01}` }
      );

      assert.equal(resCrossTenant.status, 403);
      assert.match(resCrossTenant.body.error, /belongs to another restaurant/i);
    });
  });

  describe('4. Private Patron Photo Access Control', () => {
    before(() => {
      setServerDbState({
        restaurants: [
          { code: 'RW01', name: 'Restaurant 1', status: 'active' },
          { code: 'RW02', name: 'Restaurant 2', status: 'active' },
        ],
        customers: [
          {
            id: 'cust_photo_rw01',
            memberNo: '30001',
            restaurantCode: 'RW01',
            photoUrl: '/api/customer/photo?key=patron-photos%2Fstudent1-12345.jpg',
          },
          {
            id: 'cust_photo_rw02',
            memberNo: '30002',
            restaurantCode: 'RW02',
            photoUrl: '/api/customer/photo?key=patron-photos%2Fstudent2-67890.jpg',
          },
        ],
        scanPoints: [],
        stationUsers: [],
        ledgerEntries: [],
      });
    });

    test('rejects unauthenticated requests to view patron photos', async () => {
      const res = await fetchTestRoute(app, 'GET', '/api/customer/photo?key=patron-photos%2Fstudent1-12345.jpg');
      assert.equal(res.status, 401);
    });

    test('rejects path traversal attempts in photo reference keys', async () => {
      const tokenSuper = createSessionToken({
        userId: 'super_admin_principal',
        username: 'superadmin',
        role: 'super_admin',
        restaurantCode: 'ALL',
      });

      const traversalKeys = [
        '../../etc/passwd',
        'patron-photos/../../secret.txt',
        'patron-photos/..%2F..%2Fetc/shadow',
        'invalid/prefix/photo.jpg',
      ];

      for (const key of traversalKeys) {
        const res = await fetchTestRoute(
          app,
          'GET',
          `/api/customer/photo?key=${encodeURIComponent(key)}`,
          null,
          { Authorization: `Bearer ${tokenSuper}` }
        );
        assert.equal(res.status, 400);
        assert.match(res.body.error, /Invalid photo reference/i);
      }
    });

    test('prevents customer from accessing another customer photo', async () => {
      const tokenCust1 = createSessionToken({
        userId: 'cust_photo_rw01',
        username: '30001',
        role: 'customer',
        restaurantCode: 'RW01',
      });

      // Customer 1 tries to access Customer 2's photo
      const res = await fetchTestRoute(
        app,
        'GET',
        '/api/customer/photo?key=patron-photos%2Fstudent2-67890.jpg',
        null,
        { Authorization: `Bearer ${tokenCust1}` }
      );

      assert.equal(res.status, 403);
      assert.match(res.body.error, /not authorized to view this photo/i);
    });

    test('prevents restaurant_admin from accessing customer photo from another tenant', async () => {
      const tokenAdminRW01 = createSessionToken({
        userId: 'boss_rw01',
        username: 'boss.rw01',
        role: 'restaurant_admin',
        restaurantCode: 'RW01',
      });

      // Admin from RW01 tries to access Customer in RW02
      const res = await fetchTestRoute(
        app,
        'GET',
        '/api/customer/photo?key=patron-photos%2Fstudent2-67890.jpg',
        null,
        { Authorization: `Bearer ${tokenAdminRW01}` }
      );

      assert.equal(res.status, 403);
      assert.match(res.body.error, /Photo belongs to another restaurant/i);
    });
  });

  describe('5. State Redaction & Credential Leakage Prevention', () => {
    const fullMockState = {
      restaurants: [
        { code: 'RW01', name: 'Campus Resto' },
        { code: 'RW02', name: 'Downtown Cafe' },
      ],
      customers: [
        {
          id: 'c1',
          memberNo: '1001',
          restaurantCode: 'RW01',
          name: 'Alice',
          pinHash: 'scrypt$16384$8$1$salt$hash1',
          idHash: 'secret_national_id_hash_1',
        },
        {
          id: 'c2',
          memberNo: '2001',
          restaurantCode: 'RW02',
          name: 'Bob',
          pinHash: 'scrypt$16384$8$1$salt$hash2',
          idHash: 'secret_national_id_hash_2',
        },
      ],
      stationUsers: [
        {
          id: 'u1',
          username: 'cashier1',
          restaurantCode: 'RW01',
          passwordHash: 'scrypt$16384$8$1$salt$pw1',
          pin: 'scrypt$16384$8$1$salt$pin1',
        },
      ],
      activationRequests: [
        {
          id: 'act_1',
          customerId: 'c1',
          restaurantCode: 'RW01',
          activationCode: '849201',
          codeHash: 'hash_of_849201',
          used: false,
        },
        {
          id: 'act_2',
          customerId: 'c2',
          restaurantCode: 'RW02',
          activationCode: '112233',
          codeHash: 'hash_of_112233',
          used: false,
        },
      ],
      pinRecoveryRequests: [
        {
          id: 'rec_1',
          customerId: 'c1',
          restaurantCode: 'RW01',
          recoveryCode: '998877',
          recoveryCodeHash: 'hash_of_998877',
          status: 'approved',
        },
      ],
      ledgerEntries: [
        { id: 'l1', customerId: 'c1', restaurantCode: 'RW01', platesDelta: 5 },
        { id: 'l2', customerId: 'c2', restaurantCode: 'RW02', platesDelta: 10 },
      ],
    };

    test('super_admin receives full multi-tenant state but with sensitive credentials redacted', () => {
      const superSession: UserSession = {
        userId: 'super_admin_principal',
        username: 'superadmin',
        role: 'super_admin',
        restaurantCode: 'ALL',
        iat: Date.now(),
        exp: Date.now() + 10000,
      };

      const scoped = scopeStateForUser(fullMockState, superSession);
      assert.equal(scoped.restaurants.length, 2);
      assert.equal(scoped.customers.length, 2);

      // Customer hashes redacted
      assert.equal(scoped.customers[0].pinHash, undefined);
      assert.equal(scoped.customers[0].idHash, undefined);

      // Staff password/pin redacted
      assert.equal(scoped.stationUsers[0].passwordHash, undefined);
      assert.equal(scoped.stationUsers[0].pin, undefined);

      // Activation codes and hashes redacted
      assert.equal(scoped.activationRequests.length, 2);
      assert.equal(scoped.activationRequests[0].activationCode, undefined);
      assert.equal(scoped.activationRequests[0].codeHash, undefined);

      // Recovery codes and hashes redacted
      assert.equal(scoped.pinRecoveryRequests.length, 1);
      assert.equal(scoped.pinRecoveryRequests[0].recoveryCode, undefined);
      assert.equal(scoped.pinRecoveryRequests[0].recoveryCodeHash, undefined);
    });

    test('restaurant_admin receives tenant-isolated state with credentials redacted', () => {
      const adminSession: UserSession = {
        userId: 'admin_rw01',
        username: 'admin.rw01',
        role: 'restaurant_admin',
        restaurantCode: 'RW01',
        iat: Date.now(),
        exp: Date.now() + 10000,
      };

      const scoped = scopeStateForUser(fullMockState, adminSession);
      assert.equal(scoped.restaurants.length, 1);
      assert.equal(scoped.restaurants[0].code, 'RW01');

      // Tenant isolation: RW02 customers excluded
      assert.equal(scoped.customers.length, 1);
      assert.equal(scoped.customers[0].id, 'c1');
      assert.equal(scoped.customers[0].pinHash, undefined);
      assert.equal(scoped.customers[0].idHash, undefined);

      // Activation requests: RW02 excluded, codes redacted
      assert.equal(scoped.activationRequests.length, 1);
      assert.equal(scoped.activationRequests[0].id, 'act_1');
      assert.equal(scoped.activationRequests[0].activationCode, undefined);
      assert.equal(scoped.activationRequests[0].codeHash, undefined);

      // Recovery requests: RW01 only, codes redacted
      assert.equal(scoped.pinRecoveryRequests.length, 1);
      assert.equal(scoped.pinRecoveryRequests[0].recoveryCode, undefined);
      assert.equal(scoped.pinRecoveryRequests[0].recoveryCodeHash, undefined);
    });
  });
});
