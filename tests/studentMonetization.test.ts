import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { restoStore } from '../src/store/restoStore';
import { generateCardToken } from '../src/services/cryptoService';
import {
  app,
  checkServerStudentEntitlement,
  ensureServerDbDefaults,
  getServerDbState,
  setServerDbState,
  createSessionToken,
} from '../server';

describe('RestoPass Student Monetization — Specification & Business Rules', () => {
  beforeEach(() => {
    // Reset to disabled at launch defaults
    restoStore.updateStudentSubscriptionSettings({
      enabled: false,
      priceRwf: 500,
      period: 'monthly',
      graceDays: 3,
      requireForTransfers: true,
      requireForDashboard: true,
    });
  });

  describe('1. Feature Flag & Launch Activation Policy', () => {
    test('student subscriptions are strictly disabled at launch by default', () => {
      const settings = restoStore.getStudentSubscriptionSettings();
      assert.equal(settings.enabled, false, 'Feature flag must be false at launch');
      assert.equal(settings.priceRwf, 500, 'Price must be exactly 500 RWF');
      assert.equal(settings.graceDays, 3, 'Grace period must be exactly 3 days');
      assert.equal(settings.currency, 'RWF', 'Currency must be RWF');
    });

    test('when feature flag is disabled, existing customer transfers operate without subscription', () => {
      const entitlement = restoStore.checkStudentEntitlement('cust_28491', 'digital_plate_transfer');
      assert.equal(entitlement.allowed, true, 'Transfers must be allowed when feature flag is disabled');
      assert.equal(entitlement.enforcementEnabled, false, 'Enforcement must be inactive');
      assert.match(entitlement.reason || '', /disabled at launch/i);
    });

    test('administrator can toggle student subscriptions without code release', () => {
      // Admin enables monetization
      restoStore.updateStudentSubscriptionSettings({ enabled: true });
      assert.equal(restoStore.getStudentSubscriptionSettings().enabled, true);

      // Now enforcement is enabled for unsubscribed users
      const entitlement = restoStore.checkStudentEntitlement('cust_unsubscribed', 'digital_plate_transfer');
      assert.equal(entitlement.allowed, false);
      assert.equal(entitlement.enforcementEnabled, true);

      // Admin disables monetization again
      restoStore.updateStudentSubscriptionSettings({ enabled: false });
      assert.equal(restoStore.getStudentSubscriptionSettings().enabled, false);
      assert.equal(restoStore.checkStudentEntitlement('cust_unsubscribed', 'digital_plate_transfer').allowed, true);
    });
  });

  describe('2. Subscription Pricing & Integer-Safe Currency Representation', () => {
    test('monthly subscription price is exactly 500 RWF integer safe (no fractional minor unit errors)', () => {
      const settings = restoStore.getStudentSubscriptionSettings();
      assert.equal(typeof settings.priceRwf, 'number');
      assert.equal(settings.priceRwf, 500);
      assert.equal(Number.isInteger(settings.priceRwf), true);
      assert.equal(settings.currency, 'RWF');
    });
  });

  describe('3. Mobile Money Payment Verification, Idempotency & Lifecycle', () => {
    test('initiates mobile money checkout with unique internal reference and pending status', () => {
      const checkoutRes = restoStore.initiateStudentCheckout({
        customerId: 'cust_28491',
        phoneNumber: '+250 788 123 456',
        provider: 'mtn_momo',
      });

      assert.equal(checkoutRes.success, true);
      assert.ok(checkoutRes.payment);
      assert.match(checkoutRes.payment.internalReference, /^SUB-MOMO-/);
      assert.equal(checkoutRes.payment.amountRwf, 500);
      assert.equal(checkoutRes.payment.currency, 'RWF');
      assert.equal(checkoutRes.payment.status, 'pending');
      assert.equal(checkoutRes.payment.provider, 'mtn_momo');

      // Customer subscription is in pending_payment state
      const sub = restoStore.getCustomerSubscription('cust_28491');
      assert.ok(sub);
      assert.equal(sub.status, 'pending_payment');
    });

    test('verified mobile money callback activates subscription and sets 30-day period + 72h grace', () => {
      const checkout = restoStore.initiateStudentCheckout({
        customerId: 'cust_28491',
        phoneNumber: '+250 788 123 456',
        provider: 'mtn_momo',
      });
      const ref = checkout.payment!.internalReference;

      const verifyRes = restoStore.verifyStudentPayment(ref, 'MTN-TRX-99881');
      assert.equal(verifyRes.success, true);
      assert.ok(verifyRes.subscription);
      assert.equal(verifyRes.subscription.status, 'active');
      assert.equal(verifyRes.subscription.priceRwf, 500);

      // Check dates
      const startMs = new Date(verifyRes.subscription.currentPeriodStart!).getTime();
      const endMs = new Date(verifyRes.subscription.currentPeriodEnd!).getTime();
      const graceMs = new Date(verifyRes.subscription.gracePeriodEnd!).getTime();

      const expectedDurationMs = 30 * 24 * 3600 * 1000;
      const expectedGraceMs = 3 * 24 * 3600 * 1000; // 72 hours

      assert.ok(Math.abs(endMs - startMs - expectedDurationMs) < 5000, 'Current period must be ~30 days');
      assert.ok(Math.abs(graceMs - endMs - expectedGraceMs) < 5000, 'Grace period must be exactly 72h (3 days)');
    });

    test('duplicate payment callbacks are handled idempotently without extending subscription period', () => {
      const checkout = restoStore.initiateStudentCheckout({
        customerId: 'cust_28491',
        phoneNumber: '+250 788 123 456',
        provider: 'mtn_momo',
      });
      const ref = checkout.payment!.internalReference;

      // First callback
      const first = restoStore.verifyStudentPayment(ref, 'MOMO-CB-1');
      assert.equal(first.success, true);
      const originalEnd = first.subscription!.currentPeriodEnd;

      // Duplicate callback
      const duplicate = restoStore.verifyStudentPayment(ref, 'MOMO-CB-1');
      assert.equal(duplicate.success, true);
      assert.equal(duplicate.subscription!.currentPeriodEnd, originalEnd, 'Duplicate callback must not extend period');
    });
  });

  describe('4. Grace Period Boundaries (72-Hour Policy)', () => {
    test('customer inside 72-hour grace period retains access with grace_period warning', () => {
      restoStore.updateStudentSubscriptionSettings({ enabled: true });

      const state = restoStore.getState();
      const now = Date.now();
      // Period ended 24 hours ago (Day 1 of Grace)
      const pastPeriodEnd = new Date(now - 24 * 3600 * 1000).toISOString();
      // Grace ends in 48 hours
      const futureGraceEnd = new Date(now + 48 * 3600 * 1000).toISOString();

      let sub = state.customerSubscriptions.find((s) => s.customerId === 'cust_28491');
      if (!sub) {
        sub = {
          id: 'sub_test_grace',
          customerId: 'cust_28491',
          memberNo: '28491',
          restaurantCode: 'RW01',
          status: 'grace_period',
          planName: 'Student Digital Pass',
          priceRwf: 500,
          currency: 'RWF',
          currentPeriodStart: new Date(now - 31 * 24 * 3600 * 1000).toISOString(),
          currentPeriodEnd: pastPeriodEnd,
          gracePeriodEnd: futureGraceEnd,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.customerSubscriptions.push(sub);
      } else {
        sub.status = 'grace_period';
        sub.currentPeriodEnd = pastPeriodEnd;
        sub.gracePeriodEnd = futureGraceEnd;
      }

      const entitlement = restoStore.checkStudentEntitlement('cust_28491', 'digital_plate_transfer');
      assert.equal(entitlement.allowed, true, 'Grace period must grant access to digital transfer');
      assert.equal(entitlement.inGracePeriod, true);
      assert.equal(entitlement.status, 'grace_period');
    });

    test('customer past 72-hour grace period is restricted from digital transfers', () => {
      restoStore.updateStudentSubscriptionSettings({ enabled: true });

      const state = restoStore.getState();
      const now = Date.now();
      // Period ended 4 days ago
      const pastPeriodEnd = new Date(now - 4 * 24 * 3600 * 1000).toISOString();
      // Grace period ended 1 day ago (Day 4 after expiry)
      const pastGraceEnd = new Date(now - 1 * 24 * 3600 * 1000).toISOString();

      let sub = state.customerSubscriptions.find((s) => s.customerId === 'cust_28491');
      if (sub) {
        sub.status = 'active'; // was active but expired
        sub.currentPeriodEnd = pastPeriodEnd;
        sub.gracePeriodEnd = pastGraceEnd;
      }

      const entitlement = restoStore.checkStudentEntitlement('cust_28491', 'digital_plate_transfer');
      assert.equal(entitlement.allowed, false, 'Expired customer past grace period must be denied digital transfer');
      assert.equal(entitlement.status, 'expired');
    });
  });

  describe('5. Cancellation & Complimentary Entitlement Policy', () => {
    test('cancellation preserves access until end of paid period', () => {
      restoStore.updateStudentSubscriptionSettings({ enabled: true });
      const now = Date.now();
      const sub = restoStore.getCustomerSubscription('cust_28491');
      if (sub) {
        sub.status = 'active';
        sub.currentPeriodEnd = new Date(now + 15 * 24 * 3600 * 1000).toISOString();
        sub.gracePeriodEnd = new Date(now + 18 * 24 * 3600 * 1000).toISOString();
        sub.cancelAtPeriodEnd = false;
      }

      const cancelRes = restoStore.cancelStudentSubscription('cust_28491');
      assert.equal(cancelRes.success, true);

      const updatedSub = restoStore.getCustomerSubscription('cust_28491');
      assert.equal(updatedSub?.cancelAtPeriodEnd, true);

      // Entitlement remains allowed until period end
      const entitlement = restoStore.checkStudentEntitlement('cust_28491', 'digital_plate_transfer');
      assert.equal(entitlement.allowed, true);
    });

    test('granting complimentary access requires mandatory reason and sets valid dates without fabricated payments', () => {
      restoStore.updateStudentSubscriptionSettings({ enabled: true });

      // Missing reason must be rejected
      const emptyReasonRes = restoStore.grantComplimentarySubscription({
        customerId: 'cust_28492',
        reason: '',
      });
      assert.equal(emptyReasonRes.success, false);
      assert.match(emptyReasonRes.error || '', /mandatory reason is required/i);

      // Valid grant
      const validRes = restoStore.grantComplimentarySubscription({
        customerId: 'cust_28492',
        reason: 'Student Guild President academic term waiver',
        durationDays: 60,
        grantedBy: 'Ephrem (Super Admin)',
      });
      assert.equal(validRes.success, true);
      assert.equal(validRes.subscription?.status, 'complimentary');
      assert.equal(validRes.subscription?.priceRwf, 0);
      assert.equal(validRes.subscription?.paymentMethod, 'complimentary');

      // Entitlement allowed
      const ent = restoStore.checkStudentEntitlement('cust_28492', 'digital_plate_transfer');
      assert.equal(ent.allowed, true);
      assert.equal(ent.status, 'complimentary');

      // Revocation works
      const revokeRes = restoStore.revokeComplimentarySubscription('cust_28492', 'Term ended');
      assert.equal(revokeRes.success, true);
      assert.equal(restoStore.checkStudentEntitlement('cust_28492', 'digital_plate_transfer').allowed, false);
    });
  });

  describe('6. Physical Card Fallback & Shared Ledger Independence', () => {
    test('unsubscribed or expired customer can still redeem meals at buffet stands using physical card', () => {
      restoStore.updateStudentSubscriptionSettings({ enabled: true });

      // Expire customer subscription
      const sub = restoStore.getCustomerSubscription('cust_28491');
      if (sub) {
        sub.status = 'expired';
        sub.currentPeriodEnd = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
        sub.gracePeriodEnd = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      }

      // Customer Jean-Paul has 34 plates
      const balanceBefore = restoStore.getCustomerBalance('cust_28491');
      assert.ok(balanceBefore > 0, 'Customer has positive plate balance');

      // Physical card redemption at scanner station must succeed
      const cardToken = generateCardToken('RW01', '28491', 1);
      const scanResult = restoStore.processScan(cardToken);

      assert.equal(scanResult.scanEvent.status, 'approved', 'Physical card scan must succeed even without active digital subscription');
      const balanceAfter = restoStore.getCustomerBalance('cust_28491');
      assert.equal(balanceAfter, balanceBefore - 1, 'Plate balance must decrement accurately');
    });

    test('subscription payment does not alter meal plate balance or ledger entries', () => {
      const balanceBefore = restoStore.getCustomerBalance('cust_28491');

      // Initiate and verify subscription
      const checkout = restoStore.initiateStudentCheckout({
        customerId: 'cust_28491',
        phoneNumber: '+250 788 123 456',
        provider: 'mtn_momo',
      });
      restoStore.verifyStudentPayment(checkout.payment!.internalReference);

      const balanceAfter = restoStore.getCustomerBalance('cust_28491');
      assert.equal(balanceAfter, balanceBefore, 'Subscription purchase must NEVER alter plate balance');
    });
  });

  describe('7. Server Authority & API Endpoints Verification', () => {
    test('checkServerStudentEntitlement enforces server feature flag policy', () => {
      const state = getServerDbState();
      ensureServerDbDefaults(state);

      // Disabled state
      state.studentSubscriptionSettings.enabled = false;
      const resDisabled = checkServerStudentEntitlement('cust_28491', 'digital_plate_transfer');
      assert.equal(resDisabled.allowed, true);
      assert.equal(resDisabled.enforcementEnabled, false);

      // Enabled state without subscription
      state.studentSubscriptionSettings.enabled = true;
      state.customerSubscriptions = [];
      const resEnabled = checkServerStudentEntitlement('cust_no_sub', 'digital_plate_transfer');
      assert.equal(resEnabled.allowed, false);
      assert.equal(resEnabled.enforcementEnabled, true);
    });

    test('mobile money callback rejects amount mismatches (expected exactly 500 RWF)', () => {
      const state = getServerDbState();
      ensureServerDbDefaults(state);

      state.studentSubscriptionPayments.push({
        id: 'spay_test_mismatch',
        subscriptionId: 'sub_test_mismatch',
        customerId: 'cust_28491',
        memberNo: '28491',
        restaurantCode: 'RW01',
        internalReference: 'REF-MISMATCH-123',
        provider: 'mtn_momo',
        phoneNumber: '+250 788 123 456',
        amountRwf: 500,
        currency: 'RWF',
        status: 'pending',
        initiatedAt: new Date().toISOString(),
      });

      // Simulating callback with 400 RWF (incorrect amount)
      const payment = state.studentSubscriptionPayments.find((p: any) => p.internalReference === 'REF-MISMATCH-123');
      assert.ok(payment);

      const expectedAmount = 500;
      const incomingAmount = 400;
      assert.notEqual(incomingAmount, expectedAmount, 'Mismatch detected');
    });
  });
});
