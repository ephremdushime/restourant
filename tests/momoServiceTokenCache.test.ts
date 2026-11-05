import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MomoService } from '../src/services/momoService';

test('MTN token cache refreshes expired tokens and clears tokens after credential rotation', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1_800_000_000_000;
  let tokenCalls = 0;
  const paymentAuthorization: string[] = [];

  Date.now = () => now;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/collection/token/')) {
      tokenCalls += 1;
      return new Response(JSON.stringify({
        access_token: `test-token-${tokenCalls}`,
        token_type: 'Bearer',
        expires_in: 3600,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/collection/v1_0/requesttopay')) {
      const headers = new Headers(init?.headers);
      paymentAuthorization.push(headers.get('Authorization') || '');
      return new Response(JSON.stringify({ message: 'Accepted' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected MTN test URL: ${url}`);
  }) as typeof fetch;

  try {
    const service = new MomoService({
      baseUrl: 'https://sandbox.momodeveloper.mtn.com',
      targetEnvironment: 'sandbox',
      collectionSubscriptionKey: 'test-subscription-key',
      apiUser: 'test-api-user',
      apiKey: 'test-api-key',
      defaultCurrency: 'RWF',
      useMock: false,
    });

    const pay = (referenceId: string) => service.requestToPay({
      referenceId,
      amount: '100',
      currency: 'RWF',
      externalId: referenceId,
      payerPhone: '250788123456',
    });

    assert.equal((await pay('first-request')).status, 202);
    assert.equal(tokenCalls, 1);
    assert.deepEqual(paymentAuthorization, ['Bearer test-token-1']);

    // Changing the API user/key must invalidate all cached bearer tokens.
    service.setCredentials('rotated-api-user', 'rotated-api-key');
    assert.equal((await pay('after-rotation')).status, 202);
    assert.equal(tokenCalls, 2);
    assert.deepEqual(paymentAuthorization[1], 'Bearer test-token-2');

    // Expire the refreshed token and ensure the next call obtains a new one.
    now += 60 * 60 * 1000;
    assert.equal((await pay('after-expiry')).status, 202);
    assert.equal(tokenCalls, 3);
    assert.deepEqual(paymentAuthorization[2], 'Bearer test-token-3');
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
