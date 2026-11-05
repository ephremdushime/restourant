import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('RestoPass SaaS billing verifies MTN payment atomically and enforces tenant entitlement', { skip: !databaseUrl }, async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl!;
  process.env.RESTOPASS_SAAS_MTN_ENABLED = 'true';
  process.env.MTN_MOMO_TARGET_ENVIRONMENT = 'sandbox';
  process.env.MTN_MOMO_COLLECTION_API_USER = 'integration-api-user';
  process.env.MTN_MOMO_COLLECTION_API_KEY = 'integration-api-key';
  process.env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY = 'integration-subscription-key';

  const serverModule = await import('../server.ts');
  const adapter = await import('../src/services/db/postgresAdapter.ts');
  assert.equal(await adapter.initPostgres(), true);
  const pool = adapter.getPostgresPool();
  assert.ok(pool);

  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const restaurantCode = 'SA' + suffix;
  const otherRestaurantCode = 'SB' + suffix;
  const payer = '250788123456';
  const restaurant = {
    code: restaurantCode,
    name: 'SaaS Billing Integration Restaurant',
    planId: 'plan_integration',
    status: 'pending_payment',
    saasSubscriptionPriceRwf: 65000,
  };
  const otherRestaurant = {
    code: otherRestaurantCode,
    name: 'Other SaaS Billing Tenant',
    planId: 'plan_integration',
    status: 'pending_payment',
    saasSubscriptionPriceRwf: 65000,
  };

  await pool!.query(
    'INSERT INTO restaurants (code,name,status,data) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',
    [restaurantCode, restaurant.name, 'pending_payment', JSON.stringify(restaurant),
      otherRestaurantCode, otherRestaurant.name, 'pending_payment', JSON.stringify(otherRestaurant)]
  );
  serverModule.setServerDbState({
    restaurants: [restaurant, otherRestaurant],
    plans: [{ id: 'plan_integration', terms: { maxScanPointsIncluded: 3 } }],
    licenses: [],
    customers: [], scanPoints: [], packages: [], pendingApprovals: [],
    ledgerEntries: [], payments: [], auditLogs: [], stationUsers: [],
  });

  const adminToken = serverModule.createSessionToken({
    userId: 'admin_' + restaurantCode, username: 'tenant.admin',
    role: 'restaurant_admin', restaurantCode,
  });
  const otherAdminToken = serverModule.createSessionToken({
    userId: 'admin_' + otherRestaurantCode, username: 'other.admin',
    role: 'restaurant_admin', restaurantCode: otherRestaurantCode,
  });

  const originalFetch = globalThis.fetch;
  let requestToPayCount = 0;
  let requestBody: any = null;
  let providerAmount = '64999';
  let providerStatus = 'PENDING';
  (globalThis as any).fetch = async (input: any, init?: any) => {
    const url = String(input);
    if (url.endsWith('/collection/token/')) {
      return new Response(JSON.stringify({ access_token: 'mock-mtn-access-token' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/collection/v1_0/requesttopay')) {
      requestToPayCount += 1;
      requestBody = JSON.parse(String(init?.body || '{}'));
      return new Response(null, { status: 202 });
    }
    if (url.includes('/collection/v1_0/requesttopay/')) {
      return new Response(JSON.stringify({
        status: providerStatus,
        amount: providerAmount,
        currency: 'RWF',
        externalId: requestBody.externalId,
        payer: { partyIdType: 'MSISDN', partyId: payer },
        financialTransactionId: 'MTN-IT-' + suffix,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('Unexpected external fetch in SaaS billing integration test: ' + url);
  };

  const httpServer = createServer(serverModule.app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = 'http://127.0.0.1:' + address.port;
  const request = async (method: string, path: string, token: string, body?: unknown) => {
    const response = await originalFetch(baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as any };
  };

  try {
    const initial = await request('GET', '/api/restaurant-saas/subscription', adminToken);
    assert.equal(initial.status, 200);
    assert.equal(initial.body.subscription.status, 'pending_payment');
    assert.equal(Number(initial.body.subscription.price_rwf), 65000);

    const idempotencyKey = 'saas-init-' + restaurantCode + '-001';
    const initiated = await request('POST', '/api/restaurant-saas/payment/initiate', adminToken, {
      payerMsisdn: '+250 788 123 456', idempotencyKey,
    });
    assert.equal(initiated.status, 202);
    const paymentId = initiated.body.paymentId;
    assert.ok(paymentId);

    const duplicateAttempt = await request('POST', '/api/restaurant-saas/payment/initiate', adminToken, {
      payerMsisdn: '+250 788 123 456', idempotencyKey: 'saas-init-' + restaurantCode + '-002',
    });
    assert.equal(duplicateAttempt.status, 202);
    assert.equal(duplicateAttempt.body.payment.id, paymentId);
    assert.equal(requestToPayCount, 1);

    const crossTenantVerify = await request(
      'POST', '/api/restaurant-saas/payment/' + encodeURIComponent(paymentId) + '/verify',
      otherAdminToken, {}
    );
    assert.equal(crossTenantVerify.status, 403);

    const mismatch = await request(
      'POST', '/api/restaurant-saas/payment/' + encodeURIComponent(paymentId) + '/verify',
      adminToken, {}
    );
    assert.equal(mismatch.status, 200);
    assert.equal(mismatch.body.status, 'provider_pending');
    const notActivated = await pool!.query(
      'SELECT status,current_period_end FROM restaurant_subscriptions WHERE restaurant_code=$1',
      [restaurantCode]
    );
    assert.equal(notActivated.rows[0].status, 'pending_payment');
    assert.equal(notActivated.rows[0].current_period_end, null);
    const noLicense = await pool!.query('SELECT id FROM licenses WHERE restaurant_code=$1', [restaurantCode]);
    assert.equal(noLicense.rowCount, 0);

    providerStatus = 'SUCCESSFUL';
    providerAmount = '65000';
    const verified = await request(
      'POST', '/api/restaurant-saas/payment/' + encodeURIComponent(paymentId) + '/verify',
      adminToken, {}
    );
    assert.equal(verified.status, 200);
    assert.equal(verified.body.status, 'successful');

    const persisted = await pool!.query(
      `SELECT s.status,s.current_period_start,s.current_period_end,p.status AS payment_status,
              p.entitlement_applied_at,l.id AS license_id,l.valid_until
       FROM restaurant_subscriptions s
       JOIN restaurant_subscription_payments p ON p.id=s.last_payment_id
       JOIN licenses l ON l.restaurant_code=s.restaurant_code AND l.id=(SELECT data->>'currentLicenseId' FROM restaurants WHERE code=s.restaurant_code)
       WHERE s.restaurant_code=$1`,
      [restaurantCode]
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(persisted.rows[0].status, 'active');
    assert.equal(persisted.rows[0].payment_status, 'successful');
    assert.ok(persisted.rows[0].entitlement_applied_at);
    assert.ok(persisted.rows[0].current_period_end);

    const repeatedVerify = await request(
      'POST', '/api/restaurant-saas/payment/' + encodeURIComponent(paymentId) + '/verify',
      adminToken, {}
    );
    assert.equal(repeatedVerify.status, 200);
    assert.equal(repeatedVerify.body.alreadyApplied, true);

    const otherInitial = await request('GET', '/api/restaurant-saas/subscription', otherAdminToken);
    assert.equal(otherInitial.status, 200);
    const otherInitiated = await request('POST', '/api/restaurant-saas/payment/initiate', otherAdminToken, {
      payerMsisdn: '+250 788 123 456', idempotencyKey: 'saas-init-' + otherRestaurantCode + '-001',
    });
    assert.equal(otherInitiated.status, 202);
    providerAmount = '64000';
    const mismatchedSuccess = await request(
      'POST', '/api/restaurant-saas/payment/' + encodeURIComponent(otherInitiated.body.paymentId) + '/verify',
      otherAdminToken, {}
    );
    assert.equal(mismatchedSuccess.status, 200);
    assert.equal(mismatchedSuccess.body.status, 'review_required');
    const quarantined = await pool!.query(
      'SELECT status,entitlement_applied_at FROM restaurant_subscription_payments WHERE id=$1',
      [otherInitiated.body.paymentId]
    );
    assert.equal(quarantined.rows[0].status, 'review_required');
    assert.equal(quarantined.rows[0].entitlement_applied_at, null);
    assert.equal(quarantined.rows[0].provider_transaction_id, 'MTN-IT-' + suffix);

    // A provider-successful mismatch may represent money already collected.
    // Block a second charge until the first payment is reconciled by an operator.
    const blockedDuplicateCharge = await request('POST', '/api/restaurant-saas/payment/initiate', otherAdminToken, {
      payerMsisdn: '+250 788 123 456', idempotencyKey: 'saas-init-' + otherRestaurantCode + '-003',
    });
    assert.equal(blockedDuplicateCharge.status, 202);
    assert.equal(blockedDuplicateCharge.body.payment.id, otherInitiated.body.paymentId);
    assert.equal(requestToPayCount, 2);

    const otherSubscription = await pool!.query(
      'SELECT status,current_period_end FROM restaurant_subscriptions WHERE restaurant_code=$1',
      [otherRestaurantCode]
    );
    assert.equal(otherSubscription.rows[0].status, 'pending_payment');
    assert.equal(otherSubscription.rows[0].current_period_end, null);
    const repeatedMismatch = await request(
      'POST', '/api/restaurant-saas/payment/' + encodeURIComponent(otherInitiated.body.paymentId) + '/verify',
      otherAdminToken, {}
    );
    assert.equal(repeatedMismatch.body.status, 'review_required');

    await pool!.query(
      "UPDATE restaurant_subscriptions SET status='restricted',current_period_end=NOW()-INTERVAL '73 hours' WHERE restaurant_code=$1",
      [restaurantCode]
    );
    const blockedScan = await request('POST', '/api/scans/consume', adminToken, {});
    assert.equal(blockedScan.status, 402);
    assert.equal(blockedScan.body.code, 'RESTAURANT_SUBSCRIPTION_RESTRICTED');

    const readStillAvailable = await request('GET', '/api/restaurant-saas/subscription', adminToken);
    assert.equal(readStillAvailable.status, 200);
    assert.equal(readStillAvailable.body.subscription.status, 'restricted');
  } finally {
    (globalThis as any).fetch = originalFetch;
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await pool!.query('DELETE FROM restaurant_subscription_audit_logs WHERE restaurant_code = ANY($1::varchar[])', [[restaurantCode, otherRestaurantCode]]);
    await pool!.query('DELETE FROM restaurant_subscription_payments WHERE restaurant_code = ANY($1::varchar[])', [[restaurantCode, otherRestaurantCode]]);
    await pool!.query('DELETE FROM restaurant_subscriptions WHERE restaurant_code = ANY($1::varchar[])', [[restaurantCode, otherRestaurantCode]]);
    await pool!.query('DELETE FROM licenses WHERE restaurant_code = ANY($1::varchar[])', [[restaurantCode, otherRestaurantCode]]);
    await pool!.query('DELETE FROM restaurants WHERE code = ANY($1::varchar[])', [[restaurantCode, otherRestaurantCode]]);
  }
});
