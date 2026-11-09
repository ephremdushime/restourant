import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarMonths,
  calculateComplimentaryEnd,
  calculateRenewalPeriod,
  calculateSubscriptionAmount,
  getRestaurantSaasStatus,
  normalizeMsisdn,
  validateSaasPaymentMatch,
} from '../src/services/restaurantSaasBilling';

test('initial restaurant subscription remains pending until a paid period exists', () => {
  assert.equal(getRestaurantSaasStatus(null, Date.parse('2026-11-05T00:00:00Z')).status, 'pending_payment');
});

test('calendar-month paid term ends on the same day in the following month', () => {
  const result = calculateRenewalPeriod(null, '2026-11-08T10:15:00.000Z');
  assert.equal(result.periodStart, '2026-11-08T10:15:00.000Z');
  assert.equal(result.periodEnd, '2026-12-08T10:15:00.000Z');
  assert.equal(result.gracePeriodEnd, '2026-12-11T10:15:00.000Z');
});

test('calendar-month arithmetic clamps month-end dates and handles leap years', () => {
  assert.equal(addCalendarMonths('2027-01-31T08:00:00.000Z', 1).toISOString(), '2027-02-28T08:00:00.000Z');
  assert.equal(addCalendarMonths('2028-01-31T08:00:00.000Z', 1).toISOString(), '2028-02-29T08:00:00.000Z');
  assert.equal(addCalendarMonths('2027-01-31T08:00:00.000Z', 2).toISOString(), '2027-03-31T08:00:00.000Z');
  assert.equal(addCalendarMonths(addCalendarMonths('2027-01-31T08:00:00.000Z', 1), 1).toISOString(), '2027-03-31T08:00:00.000Z');
});

test('subscription grace period is configurable in calendar days', () => {
  const end = '2026-12-05T00:00:00.000Z';
  assert.equal(getRestaurantSaasStatus(end, Date.parse('2026-12-05T00:00:00Z'), false, 4).status, 'grace_period');
  assert.equal(getRestaurantSaasStatus(end, Date.parse('2026-12-07T23:59:59Z'), false, 3).status, 'grace_period');
  assert.equal(getRestaurantSaasStatus(end, Date.parse('2026-12-08T00:00:00Z'), false, 3).status, 'restricted');
});

test('early multi-month renewal preserves paid time and appends calendar months', () => {
  const result = calculateRenewalPeriod('2026-12-15T00:00:00.000Z', '2026-12-01T00:00:00.000Z', 3);
  assert.equal(result.periodStart, '2026-12-15T00:00:00.000Z');
  assert.equal(result.periodEnd, '2027-03-15T00:00:00.000Z');
  assert.equal(result.gracePeriodEnd, '2027-03-18T00:00:00.000Z');
});

test('calendar-month renewal preserves the original billing-day anchor across short months', () => {
  const first = calculateRenewalPeriod(null, '2027-01-30T09:00:00.000Z', 1);
  assert.equal(first.periodEnd, '2027-02-28T09:00:00.000Z');
  assert.equal(first.billingAnchorDay, 30);
  const second = calculateRenewalPeriod(first.periodEnd, '2027-02-15T09:00:00.000Z', 1, 3, first.billingAnchorDay);
  assert.equal(second.periodEnd, '2027-03-30T09:00:00.000Z');
  const prepaid = calculateRenewalPeriod(null, '2027-01-30T09:00:00.000Z', 2);
  assert.equal(prepaid.periodEnd, second.periodEnd);
});

test('31st-day subscriptions return to the 31st after February', () => {
  const first = calculateRenewalPeriod(null, '2027-01-31T09:00:00.000Z', 1);
  const second = calculateRenewalPeriod(first.periodEnd, '2027-02-15T09:00:00.000Z', 1, 3, first.billingAnchorDay);
  assert.equal(second.periodEnd, '2027-03-31T09:00:00.000Z');
});

test('late renewal begins at verified payment time and does not backdate', () => {
  const result = calculateRenewalPeriod('2026-12-01T00:00:00.000Z', '2026-12-06T12:00:00.000Z', 2);
  assert.equal(result.periodStart, '2026-12-06T12:00:00.000Z');
  assert.equal(result.periodEnd, '2027-02-06T12:00:00.000Z');
});

test('complimentary period supports days, months and years', () => {
  assert.equal(calculateComplimentaryEnd('2026-11-08T00:00:00.000Z', 4, 'days'), '2026-11-12T00:00:00.000Z');
  assert.equal(calculateComplimentaryEnd('2026-11-08T00:00:00.000Z', 3, 'months'), '2027-02-08T00:00:00.000Z');
  assert.equal(calculateComplimentaryEnd('2026-11-08T00:00:00.000Z', 2, 'years'), '2028-11-08T00:00:00.000Z');
});

test('subscription amount multiplies monthly fee by selected calendar months', () => {
  assert.equal(calculateSubscriptionAmount(50000, 1), 50000);
  assert.equal(calculateSubscriptionAmount(50000, 6), 300000);
  assert.throws(() => calculateSubscriptionAmount(50000, 0));
  assert.throws(() => calculateSubscriptionAmount(50000, 25));
  assert.throws(() => calculateSubscriptionAmount(0, 2));
});

test('provider success is accepted only when amount, currency, reference and payer all match', () => {
  const valid = {
    providerStatus: 'SUCCESSFUL',
    providerAmount: '65000',
    expectedAmountRwf: 65000,
    providerCurrency: 'RWF',
    expectedCurrency: 'RWF',
    providerExternalId: 'RPS-RESTO-123',
    expectedExternalId: 'RPS-RESTO-123',
    providerPayerMsisdn: '250788123456',
    expectedPayerMsisdn: '+250 788 123 456',
  };
  assert.equal(validateSaasPaymentMatch(valid), true);
  assert.equal(validateSaasPaymentMatch({ ...valid, providerStatus: 'PENDING' }), false);
  assert.equal(validateSaasPaymentMatch({ ...valid, providerAmount: '64000' }), false);
  assert.equal(validateSaasPaymentMatch({ ...valid, providerCurrency: 'USD' }), false);
  assert.equal(validateSaasPaymentMatch({ ...valid, providerExternalId: 'OTHER' }), false);
  assert.equal(validateSaasPaymentMatch({ ...valid, providerPayerMsisdn: '250788000000' }), false);
});

test('MSISDN normalization removes formatting but retains country code', () => {
  assert.equal(normalizeMsisdn('+250 788-123 456'), '250788123456');
});

test('cancelled subscription never becomes active because of an unexpired period', () => {
  assert.equal(
    getRestaurantSaasStatus('2027-01-01T00:00:00.000Z', Date.parse('2026-12-01T00:00:00Z'), true).status,
    'cancelled'
  );
});

test('invalid paid-through timestamps fail closed', () => {
  assert.equal(getRestaurantSaasStatus('not-a-date', Date.parse('2026-12-01T00:00:00Z')).status, 'restricted');
});

test('payment matching rejects non-integer, zero, and negative amounts', () => {
  const valid = {
    providerStatus: 'SUCCESSFUL',
    providerAmount: '65000',
    expectedAmountRwf: 65000,
    providerCurrency: 'RWF',
    expectedCurrency: 'RWF',
    providerExternalId: 'RPS-RESTO-123',
    expectedExternalId: 'RPS-RESTO-123',
    providerPayerMsisdn: '250788123456',
    expectedPayerMsisdn: '+250 788 123 456',
  };
  assert.equal(validateSaasPaymentMatch({ ...valid, providerAmount: '65000.5' }), false);
  assert.equal(validateSaasPaymentMatch({ ...valid, providerAmount: '0', expectedAmountRwf: 0 }), false);
  assert.equal(validateSaasPaymentMatch({ ...valid, providerAmount: '-65000', expectedAmountRwf: -65000 }), false);
});
