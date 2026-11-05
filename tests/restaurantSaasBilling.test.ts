import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRenewalPeriod,
  getRestaurantSaasStatus,
  normalizeMsisdn,
  validateSaasPaymentMatch,
} from '../src/services/restaurantSaasBilling';

test('initial restaurant subscription remains pending until a paid period exists', () => {
  assert.equal(getRestaurantSaasStatus(null, Date.parse('2026-11-05T00:00:00Z')).status, 'pending_payment');
});

test('subscription is active before the 30-day paid-through timestamp', () => {
  assert.equal(getRestaurantSaasStatus('2026-12-05T00:00:00.000Z', Date.parse('2026-12-04T23:59:59Z')).status, 'active');
});

test('subscription enters exactly 72 hours of grace after paid-through time', () => {
  const end = '2026-12-05T00:00:00.000Z';
  assert.equal(getRestaurantSaasStatus(end, Date.parse('2026-12-05T00:00:00Z')).status, 'grace_period');
  assert.equal(getRestaurantSaasStatus(end, Date.parse('2026-12-07T23:59:59Z')).status, 'grace_period');
  assert.equal(getRestaurantSaasStatus(end, Date.parse('2026-12-08T00:00:00Z')).status, 'restricted');
});

test('early renewal preserves the remaining paid time and appends 30 days', () => {
  const result = calculateRenewalPeriod('2026-12-15T00:00:00.000Z', '2026-12-01T00:00:00.000Z');
  assert.equal(result.periodStart, '2026-12-15T00:00:00.000Z');
  assert.equal(result.periodEnd, '2027-01-14T00:00:00.000Z');
  assert.equal(result.gracePeriodEnd, '2027-01-17T00:00:00.000Z');
});

test('renewal after paid time starts at verified payment time', () => {
  const result = calculateRenewalPeriod('2026-12-01T00:00:00.000Z', '2026-12-06T12:00:00.000Z');
  assert.equal(result.periodStart, '2026-12-06T12:00:00.000Z');
  assert.equal(result.periodEnd, '2027-01-05T12:00:00.000Z');
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
