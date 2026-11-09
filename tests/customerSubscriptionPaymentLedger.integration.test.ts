import { test } from 'node:test';
import assert from 'node:assert/strict';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('customer subscription payments persist in the dedicated PostgreSQL ledger', { skip: !databaseUrl }, async () => {
  process.env.DATABASE_URL = databaseUrl!;
  const adapter = await import('../src/services/db/postgresAdapter.ts');
  assert.equal(await adapter.initPostgres(), true);
  const pool = adapter.getPostgresPool();
  assert.ok(pool);

  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  const restaurantCode = 'CP' + suffix;
  const customerId = 'customer_' + suffix;
  const paymentId = 'csp_' + suffix;
  const internalReference = 'PATRON-' + suffix;
  const payment = {
    id: paymentId,
    customerId,
    memberNo: suffix,
    restaurantCode,
    provider: 'mtn_momo',
    providerEnvironment: 'sandbox',
    internalReference,
    providerTransactionId: undefined,
    payerMsisdn: '250788123456',
    phoneNumber: '250788123456',
    amountRwf: 2500,
    monthlyPriceRwf: 1250,
    monthsPurchased: 2,
    currency: 'RWF',
    status: 'provider_pending',
    idempotencyKey: 'patron-ledger-' + suffix,
    requestFingerprint: 'a'.repeat(64),
    initiatedAt: new Date().toISOString(),
  };

  try {
    const saved = await adapter.saveStateToPostgres({
      restaurants: [{
        code: restaurantCode, name: 'Customer Payment Ledger Test',
        status: 'active', currency: 'RWF',
      }],
      customers: [{
        id: customerId, restaurantCode, memberNo: suffix,
        name: 'Ledger Test Customer', phone: '250788123456',
        cardStatus: 'active', cardVersion: 1, keyVersion: 1,
      }],
      customerSubscriptions: [],
      studentSubscriptionPayments: [payment],
      licenses: [], ledgerEntries: [], payments: [], scanEvents: [],
      pendingApprovals: [], branches: [], stationUsers: [], notifications: [],
      expenses: [], transfers: [], auditLogs: [],
    });
    assert.equal(saved, true, 'state and customer payment ledger must commit');

    const persisted = await pool!.query(
      'SELECT customer_id,restaurant_code,provider,provider_environment,internal_reference,amount_rwf,months_purchased,status,data FROM customer_subscription_payments WHERE id=$1',
      [paymentId]
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(persisted.rows[0].customer_id, customerId);
    assert.equal(persisted.rows[0].restaurant_code, restaurantCode);
    assert.equal(persisted.rows[0].provider, 'mtn_momo');
    assert.equal(persisted.rows[0].provider_environment, 'sandbox');
    assert.equal(persisted.rows[0].internal_reference, internalReference);
    assert.equal(Number(persisted.rows[0].amount_rwf), 2500);
    assert.equal(Number(persisted.rows[0].months_purchased), 2);
    assert.equal(persisted.rows[0].status, 'provider_pending');

    const duplicateProviderAttempt = {
      ...payment,
      id: paymentId + '_duplicate',
      internalReference: internalReference + '-DUP',
      idempotencyKey: payment.idempotencyKey + '-DUP',
      status: 'verified',
      providerTransactionId: 'MTN-LEDGER-DUPLICATE',
    };
    const duplicateRejected = await adapter.saveStateToPostgres({
      restaurants: [{ code: restaurantCode, name: 'Customer Payment Ledger Test', status: 'active', currency: 'RWF' }],
      customers: [{ id: customerId, restaurantCode, memberNo: suffix, name: 'Ledger Test Customer', phone: '250788123456', cardStatus: 'active', cardVersion: 1, keyVersion: 1 }],
      customerSubscriptions: [],
      studentSubscriptionPayments: [
        { ...payment, status: 'verified', providerTransactionId: 'MTN-LEDGER-DUPLICATE' },
        duplicateProviderAttempt,
      ],
      licenses: [], ledgerEntries: [], payments: [], scanEvents: [],
      pendingApprovals: [], branches: [], stationUsers: [], notifications: [],
      expenses: [], transfers: [], auditLogs: [],
    });
    assert.equal(duplicateRejected, false, 'duplicate MTN transaction ID must roll back the entire ledger transaction');
    const afterDuplicate = await pool!.query(
      'SELECT status,provider_transaction_id FROM customer_subscription_payments WHERE id=$1',
      [paymentId]
    );
    assert.equal(afterDuplicate.rows[0].status, 'provider_pending');
    assert.equal(afterDuplicate.rows[0].provider_transaction_id, null);

    const legacySnapshot = await pool!.query(
      "SELECT value FROM system_settings WHERE key='studentSubscriptionPayments'"
    );
    assert.equal(legacySnapshot.rowCount, 0, 'payment history must not be stored in generic settings');

    const hydrated = await adapter.loadStateFromPostgres();
    assert.ok(hydrated);
    const restored = hydrated.studentSubscriptionPayments.find((item: any) => item.id === paymentId);
    assert.ok(restored, 'payment must hydrate from its normalized table');
    assert.equal(restored.internalReference, internalReference);
    assert.equal(restored.amountRwf, 2500);
  } finally {
    await pool!.query('DELETE FROM customer_subscription_payments WHERE id=$1', [paymentId]);
    await pool!.query('DELETE FROM customers WHERE id=$1', [customerId]);
    await pool!.query('DELETE FROM restaurants WHERE code=$1', [restaurantCode]);
  }
});
