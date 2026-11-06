import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoStore } from '../src/store/restoStore';
import { generateCardToken } from '../src/services/cryptoService';

test('offline scanner outbox remains pending until the server acknowledges reconnection sync', async () => {
  const state = restoStore.getState();
  const previousOutbox = state.syncOutbox;
  const previousToken = restoStore.getAuthToken();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousFetch = globalThis.fetch;

  const itemId = `offline_scan_test_${Date.now()}`;
  state.syncOutbox = [
    ...previousOutbox,
    {
      id: itemId,
      restaurantCode: state.currentRestaurantCode || 'RW01',
      sequenceNo: 1,
      entityType: 'scan_event',
      entityId: `scan_${Date.now()}`,
      payload: { outcome: 'approved', source: 'offline_scanner_test' },
      createdAt: new Date().toISOString(),
      syncedToCloud: false,
    } as any,
  ];

  try {
    restoStore.setAuthToken('offline-sync-test-session');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });

    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response;
    }) as typeof fetch;

    await restoStore.pushStateToServer();
    const pendingWhileOffline = state.syncOutbox.find((item) => item.id === itemId);
    assert.equal(fetchCalls, 0, 'offline scanner must not attempt a network write');
    assert.equal(pendingWhileOffline?.syncedToCloud, false, 'offline event must remain queued');

    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    await restoStore.pushStateToServer();

    const acknowledgedAfterReconnect = state.syncOutbox.find((item) => item.id === itemId);
    assert.equal(fetchCalls, 1, 'reconnection should submit the queued state once');
    assert.equal(acknowledgedAfterReconnect?.syncedToCloud, true, 'only a positive server acknowledgement may clear the pending state');
  } finally {
    globalThis.fetch = previousFetch;
    restoStore.setAuthToken(previousToken || null);
    state.syncOutbox = previousOutbox;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as any).window;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete (globalThis as any).navigator;
  }
});


test('physical scanner accepts an eligible card offline and synchronizes its meal deduction after reconnection', async () => {
  const state = restoStore.getState();
  const previousOutbox = state.syncOutbox;
  const previousNetworkStatus = state.networkStatus;
  const previousToken = restoStore.getAuthToken();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousFetch = globalThis.fetch;

  try {
    restoStore.setRestaurantCode('RW01');
    restoStore.setStation('sp_1');
    const phone = `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`;
    const registration = restoStore.registerProvisionalCustomer({
      restaurantCode: 'RW01',
      name: 'Offline Scanner Test Patron',
      phone,
      idType: 'national_id',
      idNumber: `OFFLINE-SCAN-${Date.now()}`,
      isStudent: false,
      platesRequested: 2,
      amountRwf: 2000,
      paymentMethod: 'cash',
      paymentReference: `OFFLINE-SCAN-REF-${Date.now()}`,
      registeredByStaffId: 'staff_offline_test',
      registeredByStaffName: 'Offline Test Cashier',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });
    const approval = restoStore.approvePendingRequest(registration.approval.id, 'Offline Test Boss');
    assert.equal(approval.success, true);
    restoStore.grantComplimentarySubscription({
      customerId: registration.customer.id,
      reason: 'Automated offline scanner test fixture',
      durationDays: 30,
      grantedBy: 'Automated Test',
    });

    state.networkStatus = 'offline';
    const customer = registration.customer;
    const token = generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion);
    const before = restoStore.getCustomerBalance(customer.id);
    const scan = restoStore.processScan(token);

    assert.equal(scan.outcome, 'ACCEPTED', 'eligible physical card scans must work from local authority while offline');
    assert.equal(restoStore.getCustomerBalance(customer.id), before - 1);

    const scanLedger = state.ledgerEntries.find(
      (entry) => entry.customerId === customer.id && entry.type === 'scan' && entry.scanPointId === 'sp_1'
    );
    assert.ok(scanLedger, 'offline scan must create the local meal ledger entry');
    const pendingOutbox = state.syncOutbox.find((item) => item.entityId === scanLedger.id);
    assert.ok(pendingOutbox, 'offline scan deduction must be represented in the synchronization outbox');
    assert.equal(pendingOutbox.syncedToCloud, false);

    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    restoStore.setAuthToken('offline-physical-scanner-session');
    let submittedSnapshot: any;
    globalThis.fetch = (async (_input, init) => {
      submittedSnapshot = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response;
    }) as typeof fetch;

    await restoStore.pushStateToServer();
    assert.ok(
      submittedSnapshot?.fullState?.ledgerEntries?.some((entry: any) => entry.id === scanLedger.id),
      'reconnection must submit the offline meal ledger entry to the server'
    );
    assert.equal(pendingOutbox.syncedToCloud, true, 'outbox clears only after server acknowledgement');
  } finally {
    state.syncOutbox = previousOutbox;
    state.networkStatus = previousNetworkStatus;
    restoStore.setAuthToken(previousToken || null);
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as any).window;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete (globalThis as any).navigator;
  }
});
