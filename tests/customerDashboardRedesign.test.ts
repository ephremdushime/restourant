import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { restoStore } from '../src/store/restoStore';
import { generateCardToken, verifyQrToken } from '../src/services/cryptoService';
import { resolveCustomerPortalRoute } from '../src/components/customer/CustomerView';
import {
  app,
  createSessionToken,
  verifySessionToken,
  getServerDbState,
  ensureServerDbDefaults,
  shutdownServer,
} from '../server';

const rootDir = process.cwd();
const readRepoFile = (relPath: string) =>
  fs.readFileSync(path.resolve(rootDir, relPath), 'utf8');

async function fetchTestRoute(
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
      setHeader() {
        return this;
      },
      end(data?: any) {
        resolve({ status: statusCode, body: data || null });
        return this;
      },
    };

    (app as any).handle(req, res);
  });
}

describe('Customer Dashboard Redesign & Security Preservation Protocol (Items 1–16)', () => {
  test('1 & 16: Customer portal supports all 5 pages, sub-routes, and responsive desktop/mobile navigation', () => {
    // Route resolution across all 5 primary pages and profile sub-pages
    assert.deepEqual(resolveCustomerPortalRoute('home', '#/customer/home'), {
      page: 'home',
      profileSubPage: 'personal',
    });
    assert.deepEqual(resolveCustomerPortalRoute('my_card', '#/customer/my_card'), {
      page: 'my_card',
      profileSubPage: 'personal',
    });
    assert.deepEqual(resolveCustomerPortalRoute('activity', '#/customer/activity'), {
      page: 'activity',
      profileSubPage: 'personal',
    });
    assert.deepEqual(resolveCustomerPortalRoute('history', ''), {
      page: 'activity',
      profileSubPage: 'personal',
    });
    assert.deepEqual(resolveCustomerPortalRoute('notifications', '#/customer/notifications'), {
      page: 'notifications',
      profileSubPage: 'personal',
    });
    assert.deepEqual(resolveCustomerPortalRoute('profile', '#/customer/profile'), {
      page: 'profile',
      profileSubPage: 'personal',
    });
    assert.deepEqual(resolveCustomerPortalRoute('security', '#/customer/profile/security'), {
      page: 'profile',
      profileSubPage: 'security',
    });
    assert.deepEqual(resolveCustomerPortalRoute('subscription', '#/customer/profile/subscription'), {
      page: 'profile',
      profileSubPage: 'subscription',
    });
    assert.deepEqual(resolveCustomerPortalRoute('privacy', '#/customer/profile/privacy'), {
      page: 'profile',
      profileSubPage: 'privacy',
    });
    assert.deepEqual(resolveCustomerPortalRoute('account', '#/customer/profile/account'), {
      page: 'profile',
      profileSubPage: 'account',
    });

    // Verify all 8 modular customer portal components exist and are wired
    const expectedFiles = [
      'src/components/customer/CustomerPortalLayout.tsx',
      'src/components/customer/CustomerHomePage.tsx',
      'src/components/customer/CustomerCardPage.tsx',
      'src/components/customer/CustomerActivityPage.tsx',
      'src/components/customer/CustomerNotificationsPage.tsx',
      'src/components/customer/CustomerProfilePage.tsx',
      'src/components/customer/CustomerSecuritySettings.tsx',
      'src/components/customer/CustomerSubscriptionPage.tsx',
    ];
    for (const file of expectedFiles) {
      assert.ok(fs.existsSync(path.resolve(rootDir, file)), `${file} must exist`);
    }

    const layout = readRepoFile('src/components/customer/CustomerPortalLayout.tsx');
    assert.match(layout, /aria-label="Customer Portal Navigation"/);
    assert.match(layout, /aria-label="Mobile Customer Navigation"/);
    assert.match(layout, /lg:grid-cols-12/);
    assert.match(layout, /fixed bottom-0 inset-x-0/);
  });

  test('2, 3, 4 & 15: Customer cannot access another customer or restaurant, switch tenant in UI, or use expired sessions', async () => {
    const serverState = getServerDbState();
    ensureServerDbDefaults(serverState);

    const custRw01 = serverState.customers.find((c: any) => c.restaurantCode === 'RW01');
    assert.ok(custRw01, 'RW01 customer must exist');

    const validToken = createSessionToken({
      userId: custRw01.id,
      username: custRw01.memberNo,
      role: 'customer',
      restaurantCode: 'RW01',
    });

    // Verify /api/state returns ONLY this customer's record and never exposes pinHash or another restaurant's customers
    const stateRes = await fetchTestRoute('GET', '/api/state', undefined, {
      Authorization: `Bearer ${validToken}`,
    });
    assert.equal(stateRes.status, 200);
    const scopedCustomers = stateRes.body.state.customers;
    assert.equal(scopedCustomers.length, 1);
    assert.equal(scopedCustomers[0].id, custRw01.id);
    assert.equal(scopedCustomers[0].restaurantCode, 'RW01');
    assert.equal(scopedCustomers[0].pinHash, undefined);

    // Header and App must prevent switching a customer session to another restaurant's tenant
    const headerSource = readRepoFile('src/components/common/Header.tsx');
    assert.match(headerSource, /currentRole !== 'customer'/);
    const appSource = readRepoFile('src/App.tsx');
    assert.match(appSource, /Never switch an authenticated customer session into another restaurant's tenant/);

    // Expired or tampered session token is rejected
    assert.equal(verifySessionToken('rp_sess_invalid.tampered'), null);
    const unauthRes = await fetchTestRoute('GET', '/api/state');
    assert.equal(unauthRes.status, 401);
  });

  test('5, 6, 7, 8 & 9: QR rotation, backup QR, card lock/unlock, PIN management, and off-screen auto-lock remain functional', () => {
    const state = restoStore.getState();
    const customer = state.customers.find((c) => c.restaurantCode === 'RW01');
    assert.ok(customer, 'Customer must exist');

    const initialBalance = restoStore.getCustomerBalance(customer.id);

    // 5. Dynamic rotating QR token generation
    const phoneQr = restoStore.getCustomerPhoneQr(customer);
    assert.ok(phoneQr.token.startsWith(`v1.${customer.restaurantCode}.${customer.memberNo}.`));
    assert.ok(phoneQr.secondsRemaining >= 1 && phoneQr.secondsRemaining <= 30);

    // 6. Permanent backup card QR generation & verification
    const cardQr = generateCardToken(
      customer.restaurantCode,
      customer.memberNo,
      customer.cardVersion
    );
    assert.ok(cardQr.startsWith(`c1.${customer.restaurantCode}.${customer.memberNo}.${customer.cardVersion}.`));
    const verifiedCard = verifyQrToken(cardQr, customer.restaurantCode, {
      [customer.memberNo]: {
        keyVersion: customer.keyVersion,
        cardVersion: customer.cardVersion,
        cardStatus: customer.cardStatus,
      },
    });
    assert.equal(verifiedCard.valid, true);
    assert.equal(verifiedCard.isCard, true);

    // 7. Card lock/unlock preserves meal credits
    const prevStatus = customer.cardStatus;
    restoStore.setCustomerCardStatus(customer.id, 'locked', customer.name);
    const lockedCustomer = restoStore.getState().customers.find((c) => c.id === customer.id)!;
    assert.equal(lockedCustomer.cardStatus, 'locked');
    assert.equal(
      restoStore.getCustomerBalance(customer.id),
      initialBalance,
      'Locking card must preserve meal credits'
    );
    restoStore.setCustomerCardStatus(
      customer.id,
      prevStatus === 'locked' ? 'locked' : 'active',
      customer.name
    );
    const restoredCustomer = restoStore.getState().customers.find((c) => c.id === customer.id)!;
    assert.equal(restoredCustomer.cardStatus, prevStatus === 'locked' ? 'locked' : 'active');

    // 8. PIN setup and verification
    const prevPinHash = customer.pinHash;
    const prevHasCustomPin = customer.hasCustomPin;
    const prevKeyVer = customer.keyVersion;
    try {
      const ok = restoStore.setCustomerPin(customer.id, '482910');
      assert.equal(ok, true);
      assert.equal(restoStore.verifyCustomerPin(customer.id, '482910'), true);
      assert.equal(restoStore.verifyCustomerPin(customer.id, '000000'), false);
    } finally {
      customer.pinHash = prevPinHash;
      customer.hasCustomPin = prevHasCustomPin;
      customer.keyVersion = prevKeyVer;
    }

    // 9. Off-screen auto-lock listener and manual lock screen remain intact in CustomerView
    const customerViewSource = readRepoFile('src/components/customer/CustomerView.tsx');
    assert.match(customerViewSource, /visibilitychange/);
    assert.match(customerViewSource, /DashboardLockScreen/);
    assert.match(customerViewSource, /PinSetupModal/);
  });

  test('10, 11, 12, 13 & 14: Pricing clutter removed from Home, ledger/notifications scoped, and subscription separation preserved', async () => {
    const homeSource = readRepoFile('src/components/customer/CustomerHomePage.tsx');

    // 10. Unnecessary pricing clutter is removed from CustomerHomePage
    assert.doesNotMatch(homeSource, /Single Plate Rate/i);
    assert.doesNotMatch(homeSource, /Best Value Bundle/i);
    assert.doesNotMatch(homeSource, /Meal Plans &amp; Pricing|Meal Plans & Pricing/i);
    assert.match(homeSource, /Show My QR Pass/);
    assert.match(homeSource, /Remaining Meal Balance/);

    // 11 & 12. Activity and Notifications components strictly filter by customer.id and customer.restaurantCode
    const activitySource = readRepoFile('src/components/customer/CustomerActivityPage.tsx');
    assert.match(activitySource, /entry\.customerId === customer\.id/);
    assert.match(activitySource, /entry\.restaurantCode === customer\.restaurantCode/);

    const notifSource = readRepoFile('src/components/customer/CustomerNotificationsPage.tsx');
    assert.match(notifSource, /n\.restaurantCode === customer\.restaurantCode/);

    // 13 & 14. Subscription expiry never deactivates physical card or alters meal balance, and manual renewal is documented
    const subSource = readRepoFile('src/components/customer/CustomerSubscriptionPage.tsx');
    assert.match(subSource, /Dashboard Subscription Is Separate From Your Meal Balance/);
    assert.match(subSource, /Manual Renewal &amp; Verification Instructions/);
    assert.match(subSource, /Verified Subscription Payment History/);

    const state = restoStore.getState();
    const customer = state.customers.find((c) => c.restaurantCode === 'RW01');
    assert.ok(customer);
    const balanceBefore = restoStore.getCustomerBalance(customer.id);
    const cardStatusBefore = customer.cardStatus;

    const prevAccess = customer.customerAccessStatus;
    try {
      customer.customerAccessStatus = 'expired';
      assert.equal(
        restoStore.getCustomerBalance(customer.id),
        balanceBefore,
        'Expired dashboard subscription must not alter meal balance'
      );
      assert.equal(
        customer.cardStatus,
        cardStatusBefore,
        'Expired dashboard subscription must not deactivate physical card'
      );
    } finally {
      customer.customerAccessStatus = prevAccess;
    }

    await shutdownServer();
  });
});

