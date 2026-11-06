import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { restoStore } from '../src/store/restoStore';
import { queueDbSave, atomicSaveDb, timingSafeCompare } from '../server';
import {
  generatePhoneToken,
  generateCardToken,
  verifyQrToken,
  markTokenStepUsed,
  isTokenStepUsed,
  deriveRestaurantKey,
  deriveCustomerKey,
} from '../src/services/cryptoService';

describe('Production Readiness Remediation & Hardening', () => {
  test('eliminates station pairing bypass codes and strictly enforces valid pairing keys', () => {
    // Attempting to pair an unconfigured station with a bypass key must fail
    const resultInvalid = restoStore.pairTerminalDevice({
      restaurantCode: 'RW01',
      pairingKeyOrCode: 'INVALID-CODE-999',
    });

    assert.equal(resultInvalid.success, false);
    assert.match(resultInvalid.error || '', /Invalid station pairing key/i);

    // Attempting to pair using an unassigned or non-existent code must fail
    const resultBypassAttempt = restoStore.pairTerminalDevice({
      restaurantCode: 'RW01',
      pairingKeyOrCode: 'NON_EXISTENT_KEY',
    });
    assert.equal(resultBypassAttempt.success, false);

    // Pairing with the genuine configured key for station sp_kgl_01 ('PAIR-8841') succeeds
    const resultGenuine = restoStore.pairTerminalDevice({
      restaurantCode: 'RW01',
      pairingKeyOrCode: 'PAIR-8841',
    });
    assert.equal(resultGenuine.success, true);
    assert.ok(resultGenuine.station);
    assert.equal(resultGenuine.station.isPaired, true);
  });

  test('pairing brute-force attempt lockout triggers after repeated failed attempts', () => {
    // 5 consecutive failed pairing attempts should trigger lockout
    for (let i = 0; i < 5; i++) {
      restoStore.pairTerminalDevice({
        restaurantCode: 'RW01',
        pairingKeyOrCode: `BRUTE_FORCE_${i}`,
      });
    }

    // 6th attempt must be locked out
    const lockedAttempt = restoStore.pairTerminalDevice({
      restaurantCode: 'RW01',
      pairingKeyOrCode: 'ANY_CODE',
    });

    assert.equal(lockedAttempt.success, false);
    assert.match(lockedAttempt.error || '', /locked due to repeated/i);
  });

  test('idempotency guard prevents duplicate ledger entries with identical idempotencyKey', () => {
    const state = restoStore.getState();
    const customer = state.customers[0];
    const initialLedgerCount = state.ledgerEntries.length;

    const uniqueIdempKey = `test_idemp_${Date.now()}`;
    const entry1 = {
      id: `led_test_${Date.now()}_1`,
      customerId: customer.id,
      restaurantCode: customer.restaurantCode,
      type: 'purchase' as const,
      platesDelta: 2,
      timestamp: new Date().toISOString(),
      idempotencyKey: uniqueIdempKey,
    };

    const addedFirst = restoStore.appendLedgerEntry(entry1);
    assert.equal(addedFirst, true);
    assert.equal(restoStore.getState().ledgerEntries.length, initialLedgerCount + 1);

    // Attempting to append the exact same transaction again (e.g. network retry or double-click)
    const entryDuplicate = {
      id: `led_test_${Date.now()}_2`, // different id, same idempotency key
      customerId: customer.id,
      restaurantCode: customer.restaurantCode,
      type: 'purchase' as const,
      platesDelta: 2,
      timestamp: new Date().toISOString(),
      idempotencyKey: uniqueIdempKey,
    };

    const addedSecond = restoStore.appendLedgerEntry(entryDuplicate);
    assert.equal(addedSecond, false, 'Duplicate idempotency key must be rejected');
    assert.equal(restoStore.getState().ledgerEntries.length, initialLedgerCount + 1, 'Ledger count must not increase');
  });

  test('timingSafeCompare checks strings safely without early exit leaks', () => {
    assert.equal(timingSafeCompare('secret_token_123', 'secret_token_123'), true);
    assert.equal(timingSafeCompare('secret_token_123', 'secret_token_999'), false);
    assert.equal(timingSafeCompare('short', 'longer_string'), false);
    assert.equal(timingSafeCompare('', ''), true);
  });

  test('queueDbSave executes serialized disk updates reliably under concurrency', async () => {
    const baseState = restoStore.getState();
    const promises: Promise<boolean>[] = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        queueDbSave({
          ...baseState,
          batchId: `batch_${i}`,
          updatedAt: new Date().toISOString(),
        })
      );
    }

    const results = await Promise.all(promises);
    assert.ok(results.every((res) => res === true), 'All queued saves must complete successfully');
  });


  test('offline outbox is acknowledged only after a successful server response and only for submitted entries', async () => {
    const state = restoStore.getState();
    const originalOutbox = state.syncOutbox;
    const originalNetworkStatus = state.networkStatus;
    const originalToken = restoStore.getAuthToken();
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

    try {
      state.syncOutbox = [];
      state.networkStatus = 'online';
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
      restoStore.setAuthToken('test-session-token');

      // A full-state reconnect push is still required when the explicit outbox
      // is empty, because grace counters and scan events also live in the snapshot.
      let emptyQueuePushCalled = false;
      globalThis.fetch = (async () => {
        emptyQueuePushCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, serverState: null }),
        } as Response;
      }) as typeof fetch;
      assert.equal(restoStore.syncPendingOutbox(), 0);
      assert.equal(emptyQueuePushCalled, true, 'Reconnect must push full state even when there are no outbox entries');

      globalThis.fetch = (async () => ({
        ok: false,
        status: 503,
        json: async () => ({ success: false }),
      } as Response)) as typeof fetch;

      restoStore.queueOutboxItem('customer', 'offline-customer-1', { id: 'offline-customer-1' });
      const first = state.syncOutbox[0];
      assert.equal(first.syncedToCloud, false, 'Online status alone must never mark a queued item synced');

      await restoStore.pushStateToServer();
      assert.equal(first.syncedToCloud, false, 'A failed server response must leave the item pending');

      let createdDuringRequest: any;
      globalThis.fetch = (async () => {
        // This item is created after the request snapshot and must not be
        // acknowledged by the response to the earlier request.
        restoStore.queueOutboxItem('customer', 'offline-customer-2', { id: 'offline-customer-2' });
        createdDuringRequest = state.syncOutbox[state.syncOutbox.length - 1];
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, serverState: null }),
        } as Response;
      }) as typeof fetch;

      await restoStore.pushStateToServer();
      assert.equal(first.syncedToCloud, true, 'The server-acknowledged item should be marked synced');
      assert.ok(createdDuringRequest);
      assert.equal(createdDuringRequest.syncedToCloud, false, 'Items created in-flight must remain pending');
    } finally {
      state.syncOutbox = originalOutbox;
      state.networkStatus = originalNetworkStatus;
      restoStore.setAuthToken(originalToken);
      globalThis.fetch = originalFetch;
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else delete (globalThis as any).window;
      if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
      else delete (globalThis as any).navigator;
    }
  });

  test('QR replay protection reliably rejects duplicate scans of dynamic phone passes', () => {
    const { token, step } = generatePhoneToken('RW01', '28491', 1);
    const customerMap = {
      '28491': { keyVersion: 1, cardVersion: 1, cardStatus: 'active' },
    };

    // First scan must be accepted
    const initialVerify = verifyQrToken(token, 'RW01', customerMap);
    assert.equal(initialVerify.valid, true);

    // Mark step as used
    const rKey = deriveRestaurantKey('RW01');
    const cKey = deriveCustomerKey(rKey, '28491', 1);
    markTokenStepUsed(cKey, step);
    assert.equal(isTokenStepUsed(cKey, step), true);

    // Second scan with the same token must be rejected (screenshot replay prevention)
    const replayVerify = verifyQrToken(token, 'RW01', customerMap);
    assert.equal(replayVerify.valid, false);
    assert.match(replayVerify.error || '', /already used|replay/i);
  });
});
