import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoStore } from '../src/store/restoStore';

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
    },
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
    assert.equal(fetchCalls, 0, 'offline scanner must not attempt a network write');
    assert.equal(state.syncOutbox.find((item) => item.id === itemId)?.syncedToCloud, false);

    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    await restoStore.pushStateToServer();

    assert.equal(fetchCalls, 1, 'reconnection should submit the queued state once');
    assert.equal(state.syncOutbox.find((item) => item.id === itemId)?.syncedToCloud, true);
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
