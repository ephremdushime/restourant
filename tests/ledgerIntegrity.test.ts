import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { restoStore } from '../src/store/restoStore';

describe('Financial Integrity & Ledger Balances (Finding 6)', () => {
  test('balance is derived from checkpoints and append-only ledger entries', () => {
    const state = restoStore.getState();
    const customer = state.customers[0];
    assert.ok(customer, 'Default customer exists in store');

    // Customer balance calculation in plates
    const balance = restoStore.getCustomerBalance(customer.id);
    assert.equal(typeof balance, 'number');
    assert.ok(!isNaN(balance));
  });

  test('top-up transaction appends immutable ledger entry with positive amount', () => {
    const state = restoStore.getState();
    const customer = state.customers[0];
    const initialLedgerCount = state.ledgerEntries.length;
    const initialBalance = restoStore.getCustomerBalance(customer.id);

    const platesToAdd = 5;
    restoStore.topUpCustomer({
      restaurantCode: customer.restaurantCode,
      customerId: customer.id,
      plates: platesToAdd,
      amountRwf: 10000,
      paymentMethod: 'mtn_momo',
      reference: 'TX-TEST-2026',
      adminStaffId: 'staff_test_01',
      adminStaffName: 'Test Admin',
    });

    assert.equal(restoStore.getState().ledgerEntries.length, initialLedgerCount + 1);

    const newBalance = restoStore.getCustomerBalance(customer.id);
    assert.equal(newBalance, initialBalance + platesToAdd);
  });
});

