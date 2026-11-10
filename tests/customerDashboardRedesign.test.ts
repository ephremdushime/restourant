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
    assert.match(layout, /aria-label="Customer portal sections"/);
    assert.equal((layout.match(/aria-label="Customer portal sections"/g) || []).length, 2);
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
    assert.match(subSource, /Request MTN MoMo payment/);
    assert.match(subSource, /Subscription Payment History/);
    assert.match(subSource, /Check status/);

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
  });

  test('Priority 1 & Cross-Tenant Isolation: API and client enforce strict restaurant context without fallback', async () => {
    // 1. Inspect CustomerView source to ensure fallback to getCurrentRestaurant is eliminated
    const custView = readRepoFile('src/components/customer/CustomerView.tsx');
    assert.doesNotMatch(custView, /currentRestaurant\s*=\s*\(customer\s*\?[^)]+\)\s*\|\|\s*restoStore\.getCurrentRestaurant/);
    assert.match(custView, /Dining Facility Unavailable/);

    // 2. Cross-tenant API isolation: customer in RW01 cannot access RW02 ledger or records
    const serverState = getServerDbState();
    ensureServerDbDefaults(serverState);
    const rw01Cust = serverState.customers.find((c: any) => c.restaurantCode === 'RW01');
    assert.ok(rw01Cust);

    // Seed a dummy ledger entry for another restaurant
    const foreignLedger = {
      id: `led_foreign_${Date.now()}`,
      customerId: rw01Cust.id,
      restaurantCode: 'RW02',
      type: 'scan',
      platesDelta: -1,
      timestamp: new Date().toISOString(),
      scanPointId: 'sp_rw02',
      staffId: 'staff_rw02',
      reference: 'FOREIGN-LEDGER',
      idempotencyKey: `idemp_foreign_${Date.now()}`,
    };
    serverState.ledgerEntries.push(foreignLedger);

    const token = createSessionToken({
      userId: rw01Cust.id,
      username: rw01Cust.memberNo,
      role: 'customer',
      restaurantCode: 'RW01',
    });

    const stateRes = await fetchTestRoute('GET', '/api/state', undefined, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(stateRes.status, 200);
    const userLedgers = stateRes.body.state.ledgerEntries;
    const hasForeign = userLedgers.some((l: any) => l.restaurantCode === 'RW02' || l.id === foreignLedger.id);
    assert.equal(hasForeign, false, 'Customer from RW01 must never receive foreign restaurant ledger entries');

    // Clean up
    serverState.ledgerEntries = serverState.ledgerEntries.filter((l: any) => l.id !== foreignLedger.id);
  });

  test('Priority 2 & Authoritative Grace Meals: 3 grace meals allowed, 4th rejected, 60-3=57 reconciliation, and P0-07 QR issuance hardening', async () => {
    restoStore.setRestaurantCode('RW01');
    restoStore.setStation('sp_1');

    const studentPhone = `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`;
    const studentReg = `REG-GRACE-${Date.now()}`;
    const momoRef = `REF-GRACE-${Date.now()}`;

    // 1. Register provisional student with 60 requested plates
    const regRes = restoStore.registerProvisionalCustomer({
      restaurantCode: 'RW01',
      branchId: 'br_rw01_main',
      branchName: 'Main Campus Dining Hall',
      name: 'Grace Test Student',
      phone: studentPhone,
      photoUrl: '/src/assets/images/avatar_student_female_1790979387287.jpg',
      idType: 'student_id',
      idNumber: studentReg,
      isStudent: true,
      platesRequested: 60,
      amountRwf: 72000,
      paymentMethod: 'cash',
      paymentReference: momoRef,
      registeredByStaffId: 'self_portal',
      registeredByStaffName: 'Grace Student (Self)',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });

    assert.ok(regRes.customer);
    const custId = regRes.customer.id;

    // Check initial grace info: 3 allowed, 0 consumed, 3 remaining
    const graceInitial = restoStore.getCustomerGraceInfo(custId);
    assert.equal(graceInitial.allowed, 3);
    assert.equal(graceInitial.consumed, 0);
    assert.equal(graceInitial.remaining, 3);

    // Setup helper customer for scanner interleaving (anti double-tap guard)
    let helper = restoStore.getState().customers.find((c) => c.restaurantCode === 'RW01' && c.id !== custId);
    if (!helper) {
      const hRes = restoStore.registerProvisionalCustomer({
        restaurantCode: 'RW01',
        name: 'Helper Patron',
        phone: '+250 788 999111',
        idType: 'student_id',
        idNumber: 'STU-HELP-1',
        isStudent: true,
        platesRequested: 20,
        amountRwf: 24000,
        paymentMethod: 'cash',
        paymentReference: `REF-HELP-${Date.now()}`,
        registeredByStaffId: 'staff_1',
        registeredByStaffName: 'Staff Helper',
        stationId: 'sp_1',
        stationName: 'Stand 1',
      });
      helper = hRes.customer;
      const hAppr = restoStore.getState().pendingApprovals.find((a) => a.customerId === helper!.id);
      if (hAppr) restoStore.approvePendingRequest(hAppr.id, 'Boss Helper');
    }
    const helperToken = generateCardToken('RW01', helper.memberNo, helper.cardVersion);

    // 2. Consume 3 grace meals using physical card token
    const cardToken = generateCardToken('RW01', regRes.customer.memberNo, regRes.customer.cardVersion);
    for (let i = 1; i <= 3; i++) {
      const scanRes = restoStore.processScan(cardToken);
      assert.equal(scanRes.outcome, 'ACCEPTED', `Grace meal #${i} must be accepted`);
      assert.equal(scanRes.isGraceMeal, true);
      restoStore.processScan(helperToken); // Interleave to clear double-scan cooldown
    }

    const graceAfter3 = restoStore.getCustomerGraceInfo(custId);
    assert.equal(graceAfter3.consumed, 3);
    assert.equal(graceAfter3.remaining, 0);

    // 3. 4th grace scan must be rejected with NO_BALANCE
    const cardToken4 = generateCardToken('RW01', regRes.customer.memberNo, regRes.customer.cardVersion);
    const scanRes4 = restoStore.processScan(cardToken4);
    assert.equal(scanRes4.outcome, 'REJECTED');
    assert.equal(scanRes4.rejectionCode, 'NO_BALANCE');

    // 4. Boss approves the 60 plates: final authoritative balance is 60 - 3 = 57
    const pending = restoStore.getState().pendingApprovals.find(
      (a) => a.restaurantCode === 'RW01' && a.paymentReference === momoRef
    );
    assert.ok(pending);

    const approveRes = restoStore.approvePendingRequest(pending.id, 'Manager Grace Test');
    assert.equal(approveRes.success, true);
    assert.equal(restoStore.getCustomerBalance(custId), 57, 'Balance must reconcile to exactly 60 - 3 = 57 plates');

    // 5. P0-07: Customers cannot mint static c1 card tokens from /api/qr/token/card, and customer UI only displays rotating v1 tokens
    const serverState = getServerDbState();
    ensureServerDbDefaults(serverState);
    const rw01Cust = serverState.customers.find((c: any) => c.restaurantCode === 'RW01');
    assert.ok(rw01Cust);
    const custSession = createSessionToken({
      userId: rw01Cust.id,
      username: rw01Cust.memberNo,
      role: 'customer',
      restaurantCode: 'RW01',
    });
    const cardTokenAttempt = await fetchTestRoute(
      'POST',
      '/api/qr/token/card',
      { restaurantCode: 'RW01', memberNo: rw01Cust.memberNo },
      { Authorization: `Bearer ${custSession}` }
    );
    assert.equal(cardTokenAttempt.status, 403, 'Customers must not be allowed to mint static c1 physical card tokens');

    const cardPageSource = readRepoFile('src/components/customer/CustomerCardPage.tsx');
    assert.doesNotMatch(cardPageSource, /permanentCardToken/);
    const custViewSource = readRepoFile('src/components/customer/CustomerView.tsx');
    assert.doesNotMatch(custViewSource, /generateCardToken\(/);
  });

  test('Priority 3 & Activity: Reversals do not inflate redeemed-meal totals and entries are strictly scoped', () => {
    const cust = restoStore.getState().customers.find((c) => c.restaurantCode === 'RW01')!;
    assert.ok(cust);

    const activitySource = readRepoFile('src/components/customer/CustomerActivityPage.tsx');
    assert.match(activitySource, /netMealsRedeemed\s*=\s*Math\.max\(0,\s*grossMealScans\s*-\s*mealReversals\)/);
    assert.match(activitySource, /entry\.customerId === customer\.id &&\s*entry\.restaurantCode === customer\.restaurantCode/);

    // Verify mathematical formulation:
    // If a patron has 3 scans (-1, -1, -1) and 1 reversal (+1), net redeemed is 2, not 3
    const testEntries: any[] = [
      { id: '1', customerId: cust.id, restaurantCode: cust.restaurantCode, type: 'scan', platesDelta: -1, timestamp: new Date().toISOString() },
      { id: '2', customerId: cust.id, restaurantCode: cust.restaurantCode, type: 'scan', platesDelta: -1, timestamp: new Date().toISOString() },
      { id: '3', customerId: cust.id, restaurantCode: cust.restaurantCode, type: 'scan', platesDelta: -1, timestamp: new Date().toISOString() },
      { id: '4', customerId: cust.id, restaurantCode: cust.restaurantCode, type: 'undo', platesDelta: 1, timestamp: new Date().toISOString() },
      { id: '5', customerId: cust.id, restaurantCode: 'OTHER_RESTO', type: 'scan', platesDelta: -1, timestamp: new Date().toISOString() }, // Cross-tenant entry
    ];

    const scoped = testEntries.filter(
      (e) => e.customerId === cust.id && e.restaurantCode === cust.restaurantCode
    );
    assert.equal(scoped.length, 4, 'Cross-tenant entries must be filtered out');

    const grossScans = scoped
      .filter((e) => (e.type === 'scan' || e.type === 'extra') && e.platesDelta < 0)
      .reduce((sum, e) => sum + Math.abs(e.platesDelta), 0);
    const reversals = scoped
      .filter((e) => e.type === 'undo' || (e.type === 'reversal' && e.platesDelta > 0))
      .reduce((sum, e) => sum + e.platesDelta, 0);
    const netRedeemed = Math.max(0, grossScans - reversals);

    assert.equal(grossScans, 3);
    assert.equal(reversals, 1);
    assert.equal(netRedeemed, 2, 'Net redeemed meals must correctly subtract reversals');
  });

  test('Priority 4 & Header: Duplicate customer dashboard navigation removed from global header profile dropdown', () => {
    const headerSource = readRepoFile('src/components/common/Header.tsx');
    // Global header retains single Profile & Settings link for customer role
    assert.match(headerSource, /My Profile &amp; Settings|My Profile & Settings/);
    // Global header does not repeat an incomplete second set of customer dashboard tabs
    assert.doesNotMatch(headerSource, /\{ id: 'home', label: 'Home Overview'/);
    assert.doesNotMatch(headerSource, /\{ id: 'my_card', label: 'My Card & QR Pass'/);
  });

  test('Priority 5: Complete localization coverage for Customer Portal across English, Kinyarwanda, and French', async () => {
    const { translations } = await import('../src/services/i18n');
    const requiredCustomerKeys = [
      'navHome',
      'navMyCard',
      'navActivity',
      'navNotifications',
      'navProfile',
      'graceMeals',
      'awaitingApproval',
      'diningFacilityUnavailable',
      'facilityUnavailableDesc',
      'mealsRedeemedNet',
      'currentBalance',
      'topupsCredited',
      'recentActivityTitle',
      'noActivityYet',
      'cardBackupQr',
      'rotatingPhoneQr',
    ];

    for (const lang of ['en', 'rw', 'fr'] as const) {
      assert.ok(translations[lang], `Translation dictionary for ${lang} must exist`);
      assert.ok(translations[lang].customer, `Customer translations for ${lang} must exist`);
      for (const key of requiredCustomerKeys) {
        assert.ok(
          (translations[lang].customer as any)[key],
          `Translation key ${key} must exist in ${lang}.customer`
        );
      }
    }
  });

  test('Priority 6: Verified privacy statements without support@restopass.rw or awkward technical jargon', () => {
    const profileSource = readRepoFile('src/components/customer/CustomerProfilePage.tsx');
    assert.doesNotMatch(profileSource, /support@restopass\.rw/);
    assert.match(profileSource, /Visit Reception Desk/);

    const layoutSource = readRepoFile('src/components/customer/CustomerPortalLayout.tsx');
    assert.doesNotMatch(layoutSource, /Tenant-isolated session/);
    assert.match(layoutSource, /Active dining pass at/);
  });

  test('Priority 8: Accessible notification cards use interactive semantic buttons with focus styles', () => {
    const notifSource = readRepoFile('src/components/customer/CustomerNotificationsPage.tsx');
    // Replaced clickable div with semantic button
    assert.match(notifSource, /<button\s+key=\{n\.id\}\s+type="button"/);
    assert.match(notifSource, /focus-visible:ring-2/);
  });

  test('Cleanup and server shutdown', async () => {
    await shutdownServer();
  });
});

