import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { calculateComplimentaryEnd } from '../src/services/restaurantSaasBilling';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('RestoPass SaaS billing verifies MTN payment atomically and enforces tenant entitlement', { skip: !databaseUrl }, async () => {
  process.env.NODE_ENV = 'test';
  process.env.RESTOPASS_TEST_ENFORCE_SAAS = 'true';
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
  const freeRestaurantCode = 'SC' + suffix;
  const freeCreatedAt = new Date().toISOString();
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
  const freeRestaurant = {
    code: freeRestaurantCode,
    name: 'Complimentary SaaS Billing Tenant',
    planId: 'plan_integration',
    status: 'pending_payment',
    createdAt: freeCreatedAt,
    saasSubscriptionPriceRwf: 65000,
    saasComplimentaryDurationValue: 3,
    saasComplimentaryDurationUnit: 'months',
    saasRenewalGraceDays: 5,
  };

  await pool!.query(
    'INSERT INTO restaurants (code,name,status,data) VALUES ($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)',
    [restaurantCode, restaurant.name, 'pending_payment', JSON.stringify(restaurant),
      otherRestaurantCode, otherRestaurant.name, 'pending_payment', JSON.stringify(otherRestaurant),
      freeRestaurantCode, freeRestaurant.name, 'pending_payment', JSON.stringify(freeRestaurant)]
  );
  serverModule.setServerDbState({
    restaurants: [restaurant, otherRestaurant, freeRestaurant],
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
  const freeAdminToken = serverModule.createSessionToken({
    userId: 'admin_' + freeRestaurantCode, username: 'free.admin',
    role: 'restaurant_admin', restaurantCode: freeRestaurantCode,
  });
  const superAdminToken = serverModule.createSessionToken({
    userId: 'saas_test_super_admin', username: 'saas.test.superadmin', role: 'super_admin', restaurantCode: 'GLOBAL',
  });

  const originalFetch = globalThis.fetch;
  let requestToPayCount = 0;
  let requestBody: any = null;
  let providerAmount = '194999';
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
        financialTransactionId: 'MTN-IT-' + suffix + '-' + String(requestBody?.externalId || '').slice(-8),
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
    // Complimentary onboarding starts the free term immediately, grants a temporary
    // server-issued licence, and blocks payment until the free term has ended.
    const complimentary = await request(
      'GET', '/api/restaurant-saas/subscription?restaurantCode=' + encodeURIComponent(freeRestaurantCode),
      superAdminToken
    );
    assert.equal(complimentary.status, 200);
    assert.equal(complimentary.body.subscription.status, 'complimentary');
    const expectedComplimentaryEnd = calculateComplimentaryEnd(freeCreatedAt, 3, 'months');
    assert.equal(new Date(complimentary.body.subscription.complimentary_ends_at).getTime(), Date.parse(expectedComplimentaryEnd));
    const freeLicense = await pool!.query('SELECT id,valid_until FROM licenses WHERE restaurant_code=$1', [freeRestaurantCode]);
    assert.equal(freeLicense.rowCount, 1);
    assert.equal(new Date(freeLicense.rows[0].valid_until).getTime(), Date.parse(expectedComplimentaryEnd));
    const blockedDuringFree = await request('POST', '/api/restaurant-saas/payment/initiate', freeAdminToken, {
      payerMsisdn: '+250 788 123 456', idempotencyKey: 'saas-free-' + freeRestaurantCode + '-001', months: 1,
    });
    assert.equal(blockedDuringFree.status, 409);
    assert.equal(blockedDuringFree.body.code, 'COMPLIMENTARY_PERIOD_ACTIVE');

    // Super Admin browser sync must not be able to manufacture a paid licence.
    const syncLicenseBypass = await request('POST', '/api/sync', superAdminToken, {
      fullState: {
        licenses: [{
          id: 'LIC-BYPASS-' + suffix, restaurantCode, planId: 'plan_integration',
          maxScanPoints: 3, validUntil: '2099-01-01T00:00:00.000Z', graceDays: 3,
          featureFlags: {}, signature: 'forged', issuedAt: new Date().toISOString(),
          paidUntil: '2099-01-01T00:00:00.000Z',
        }]
      },
    });
    assert.equal(syncLicenseBypass.status, 200);
    const forgedLicense = await pool!.query('SELECT id FROM licenses WHERE id=$1', ['LIC-BYPASS-' + suffix]);
    assert.equal(forgedLicense.rowCount, 0);

    // Generic Super Admin browser sync must not manufacture customer entitlements
    // or provider-settled payment history. Those writes use dedicated server APIs.
    const forgedCustomerId = 'sync_customer_' + suffix;
    const forgedSubscriptionId = 'sync_sub_' + suffix;
    const forgedPaymentId = 'sync_payment_' + suffix;
    const syncEntitlementBypass = await request('POST', '/api/sync', superAdminToken, {
      fullState: {
        customerSubscriptions: [{
          id: forgedSubscriptionId, customerId: forgedCustomerId, memberNo: suffix,
          restaurantCode, status: 'active', planName: 'Forged Subscription',
          priceRwf: 0, currency: 'RWF', currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: '2099-01-01T00:00:00.000Z', gracePeriodEnd: '2099-01-04T00:00:00.000Z',
        }],
        studentSubscriptionPayments: [{
          id: forgedPaymentId, customerId: forgedCustomerId, memberNo: suffix,
          restaurantCode, internalReference: 'PATRON-SYNC-' + suffix,
          provider: 'mtn_momo', providerEnvironment: 'sandbox',
          providerTransactionId: 'MTN-SYNC-FORGED-' + suffix,
          payerMsisdn: payer, phoneNumber: payer, amountRwf: 1,
          monthlyPriceRwf: 1, monthsPurchased: 1, currency: 'RWF',
          status: 'verified', idempotencyKey: 'sync-forged-' + suffix,
          requestFingerprint: 'b'.repeat(64), initiatedAt: new Date().toISOString(),
          verifiedAt: new Date().toISOString(),
        }],
      },
    });
    assert.equal(syncEntitlementBypass.status, 200);
    const forgedSubscription = await pool!.query('SELECT id FROM customer_subscriptions WHERE id=$1', [forgedSubscriptionId]);
    assert.equal(forgedSubscription.rowCount, 0, 'browser sync must not create a customer entitlement');
    const forgedPayment = await pool!.query('SELECT id FROM customer_subscription_payments WHERE id=$1', [forgedPaymentId]);
    assert.equal(forgedPayment.rowCount, 0, 'browser sync must not create a verified customer payment');

    const initial = await request('GET', '/api/restaurant-saas/subscription', adminToken);
    assert.equal(initial.status, 200);
    assert.equal(initial.body.subscription.status, 'pending_payment');
    assert.equal(Number(initial.body.subscription.price_rwf), 65000);

    const idempotencyKey = 'saas-init-' + restaurantCode + '-001';
    const initiated = await request('POST', '/api/restaurant-saas/payment/initiate', adminToken, {
      payerMsisdn: '+250 788 123 456', idempotencyKey, months: 3,
    });
    assert.equal(initiated.status, 202);
    const paymentId = initiated.body.paymentId;
    assert.ok(paymentId);
    assert.equal(requestBody.amount, '195000');

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
    assert.equal(mismatch.status, 200, JSON.stringify(mismatch.body));
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
    providerAmount = '195000';
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
    const paidStart = new Date(persisted.rows[0].current_period_start);
    const expectedPaidEnd = new Date(paidStart);
    expectedPaidEnd.setUTCMonth(expectedPaidEnd.getUTCMonth() + 3);
    assert.equal(new Date(persisted.rows[0].current_period_end).getTime(), expectedPaidEnd.getTime());
    const monthsRow = await pool!.query('SELECT months_purchased,amount_rwf FROM restaurant_subscription_payments WHERE id=$1', [paymentId]);
    assert.equal(Number(monthsRow.rows[0].months_purchased), 3);
    assert.equal(Number(monthsRow.rows[0].amount_rwf), 195000);

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
      'SELECT status,entitlement_applied_at,provider_transaction_id FROM restaurant_subscription_payments WHERE id=$1',
      [otherInitiated.body.paymentId]
    );
    assert.equal(quarantined.rows[0].status, 'review_required');
    assert.equal(quarantined.rows[0].entitlement_applied_at, null);
    assert.equal(quarantined.rows[0].provider_transaction_id, null);
    const duplicateAudit = await pool!.query(
      "SELECT data FROM restaurant_subscription_audit_logs WHERE payment_id=$1 AND action='SAAS_PAYMENT_REVIEW_REQUIRED'",
      [otherInitiated.body.paymentId]
    );
    assert.equal(duplicateAudit.rowCount, 1);
    assert.equal(duplicateAudit.rows[0].data.providerStatus, 'SUCCESSFUL');

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

    // Once the complimentary end date passes, the restaurant can make its first payment.
    const simulatedComplimentaryExpiry = new Date(Date.now() - 1000).toISOString();
    await pool!.query(
      'UPDATE restaurant_subscriptions SET complimentary_ends_at=$2 WHERE restaurant_code=$1',
      [freeRestaurantCode, simulatedComplimentaryExpiry]
    );
    await pool!.query(
      'UPDATE licenses SET valid_until=$2 WHERE restaurant_code=$1',
      [freeRestaurantCode, simulatedComplimentaryExpiry]
    );
    const complimentaryExpired = await request(
      'GET', '/api/restaurant-saas/subscription?restaurantCode=' + encodeURIComponent(freeRestaurantCode),
      superAdminToken
    );
    assert.equal(complimentaryExpired.status, 200);
    assert.equal(complimentaryExpired.body.subscription.status, 'pending_payment');
    providerStatus = 'SUCCESSFUL';
    providerAmount = '65000';
    const firstPaidMonth = await request('POST', '/api/restaurant-saas/payment/initiate', freeAdminToken, {
      payerMsisdn: '+250 788 123 456', idempotencyKey: 'saas-free-' + freeRestaurantCode + '-002', months: 1,
    });
    assert.equal(firstPaidMonth.status, 202);
    const firstPaidVerified = await request(
      'POST', '/api/restaurant-saas/payment/' + encodeURIComponent(firstPaidMonth.body.paymentId) + '/verify',
      freeAdminToken, {}
    );
    assert.equal(firstPaidVerified.status, 200);
    assert.equal(firstPaidVerified.body.status, 'successful', JSON.stringify(firstPaidVerified.body));
    const firstPaidPeriod = await pool!.query(
      'SELECT current_period_start,current_period_end,status FROM restaurant_subscriptions WHERE restaurant_code=$1',
      [freeRestaurantCode]
    );
    assert.equal(firstPaidPeriod.rows[0].status, 'active');
    assert.ok(Date.parse(firstPaidPeriod.rows[0].current_period_start) >= Date.parse(simulatedComplimentaryExpiry));

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
    await pool!.query('DELETE FROM customer_subscription_payments WHERE id=$1', ['sync_payment_' + suffix]);
    await pool!.query('DELETE FROM customer_subscriptions WHERE id=$1', ['sync_sub_' + suffix]);
    await pool!.query('DELETE FROM restaurant_subscription_audit_logs WHERE restaurant_code = ANY($1::varchar[])', [[restaurantCode, otherRestaurantCode, freeRestaurantCode]]);
    await pool!.query('DELETE FROM restaurant_subscription_payments WHERE restaurant_code = ANY($1::varchar[])', [[restaurantCode, otherRestaurantCode]]);
    await pool!.query('DELETE FROM restaurant_subscriptions WHERE restaurant_code = ANY($1::varchar[])', [[restaurantCode, otherRestaurantCode]]);
    await pool!.query('DELETE FROM licenses WHERE restaurant_code = ANY($1::varchar[])', [[restaurantCode, otherRestaurantCode]]);
    await pool!.query('DELETE FROM restaurants WHERE code = ANY($1::varchar[])', [[restaurantCode, otherRestaurantCode]]);
  }
});
