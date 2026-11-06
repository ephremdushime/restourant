import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import {
  app,
  createSessionToken,
  getServerDbState,
  setServerDbState,
} from '../server';

test('authenticated state API scopes boss, scanner and customer accounts to their own tenant', async () => {
  const previousState = getServerDbState();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const fixture = {
    restaurants: [
      { code: 'RW01', name: 'Tenant One' },
      { code: 'RW02', name: 'Tenant Two' },
    ],
    customers: [
      { id: 'customer_a', memberNo: '10001', restaurantCode: 'RW01', name: 'Customer A', pinHash: 'private-a' },
      { id: 'customer_b', memberNo: '20001', restaurantCode: 'RW02', name: 'Customer B', pinHash: 'private-b' },
    ],
    ledgerEntries: [
      { id: 'ledger_a', customerId: 'customer_a', restaurantCode: 'RW01', platesDelta: 10 },
      { id: 'ledger_b', customerId: 'customer_b', restaurantCode: 'RW02', platesDelta: 20 },
    ],
    auditLogs: [
      { id: 'audit_a', restaurantCode: 'RW01', details: 'Tenant one private event' },
      { id: 'audit_b', restaurantCode: 'RW02', details: 'Tenant two private event' },
    ],
  };

  const tokens = {
    boss: createSessionToken({
      userId: 'boss_a',
      username: 'boss-a',
      role: 'restaurant_admin',
      restaurantCode: 'RW01',
    }),
    scanner: createSessionToken({
      userId: 'scanner_a',
      username: 'scanner-a',
      role: 'stand_staff',
      restaurantCode: 'RW01',
    }),
    customer: createSessionToken({
      userId: 'customer_a',
      username: '10001',
      role: 'customer',
      restaurantCode: 'RW01',
    }),
  };

  try {
    setServerDbState(fixture);

    for (const [role, token] of Object.entries(tokens)) {
      const response = await fetch(`${baseUrl}/api/state`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 200, `${role} should be able to read its authorized state`);
      const payload = await response.json() as any;
      assert.equal(payload.success, true);
      const scoped = payload.state;
      assert.ok(scoped.restaurants.every((restaurant: any) => restaurant.code === 'RW01'));
      assert.ok(scoped.customers.every((customer: any) => customer.restaurantCode === 'RW01'));
      assert.ok(scoped.ledgerEntries.every((entry: any) => entry.restaurantCode === 'RW01' || role === 'customer' && entry.customerId === 'customer_a'));
      assert.ok(!JSON.stringify(scoped).includes('Tenant two private event'));
      assert.ok(!JSON.stringify(scoped).includes('customer_b'));
      assert.ok(!JSON.stringify(scoped).includes('private-b'));
    }

    const customerResponse = await fetch(`${baseUrl}/api/state`, {
      headers: { Authorization: `Bearer ${tokens.customer}` },
    });
    const customerPayload = await customerResponse.json() as any;
    assert.deepEqual(customerPayload.state.customers.map((customer: any) => customer.id), ['customer_a']);
    assert.ok(customerPayload.state.customers.every((customer: any) => customer.pinHash === undefined));

    const forbiddenReplacement = await fetch(`${baseUrl}/api/state`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.boss}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customers: [] }),
    });
    assert.equal(forbiddenReplacement.status, 403, 'restaurant bosses must not use platform-wide state replacement');

    const forbiddenCustomerLedger = await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.customer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullState: {
          ledgerEntries: [{
            id: 'forged_customer_credit',
            customerId: 'customer_a',
            restaurantCode: 'RW01',
            type: 'purchase',
            platesDelta: 500,
            idempotencyKey: 'forged-customer-credit-0001',
          }],
        },
      }),
    });
    assert.equal(forbiddenCustomerLedger.status, 403, 'customers must not write meal credits through generic sync');
    assert.equal(getServerDbState().ledgerEntries.some((entry: any) => entry.id === 'forged_customer_credit'), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousState) setServerDbState(previousState);
    else setServerDbState({ restaurants: [], customers: [] });
  }
});
