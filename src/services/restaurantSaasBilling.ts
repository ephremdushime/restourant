/**
 * Shared subscription calendar and billing domain rules.
 * Pure functions only: no provider, clock, persistence or UI side effects.
 *
 * Subscription terms are calendar months, not fixed 30-day durations.
 * Month-end dates are clamped (31 January + 1 month => 28/29 February).
 */
export const RESTAURANT_SAAS_TERM_MONTHS = 1;
export const RESTAURANT_SAAS_GRACE_DAYS = 3;
/** @deprecated Use calendar-month periods and configurable grace days. */
/** @deprecated Use configurable calendar-day grace periods. */

export type SubscriptionDurationUnit = 'days' | 'months' | 'years';

export type RestaurantSaasStatus =
  | 'pending_payment'
  | 'active'
  | 'grace_period'
  | 'restricted'
  | 'cancelled';

function assertValidDate(value: string, label: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ${label} timestamp`);
  return date;
}

function assertDuration(value: number, label: string, max = 120): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${label} must be a whole number between 0 and ${max}`);
  }
  return value;
}

/** Adds calendar months using a stable original billing-day anchor. */
export function addCalendarMonthsWithAnchor(value: string | Date, months: number, anchorDay?: number): Date {
  assertDuration(months, 'Months', 120);
  const source = value instanceof Date ? new Date(value.getTime()) : assertValidDate(value, 'source');
  const day = anchorDay ?? source.getUTCDate();
  if (!Number.isSafeInteger(day) || day < 1 || day > 31) throw new Error('Billing anchor day must be between 1 and 31');
  const targetMonthIndex = source.getUTCMonth() + months;
  const targetYear = source.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const result = new Date(source.getTime());
  result.setUTCDate(1);
  result.setUTCFullYear(targetYear, targetMonth, Math.min(day, lastDay));
  return result;
}

/** Adds calendar months, preserving the source day (or month-end when source is month-end). */
export function addCalendarMonths(value: string | Date, months: number): Date {
  const source = value instanceof Date ? new Date(value.getTime()) : assertValidDate(value, 'source');
  const sourceLastDay = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate();
  return addCalendarMonthsWithAnchor(source, months, source.getUTCDate() === sourceLastDay ? 31 : source.getUTCDate());
}

export function addCalendarDays(value: string | Date, days: number): Date {
  assertDuration(days, 'Days', 3650);
  const source = value instanceof Date ? new Date(value.getTime()) : assertValidDate(value, 'source');
  source.setUTCDate(source.getUTCDate() + days);
  return source;
}

export function calculateComplimentaryEnd(
  startsAt: string,
  duration: number,
  unit: SubscriptionDurationUnit
): string {
  if (!Number.isSafeInteger(duration) || duration < 0 || duration > 120) {
    throw new Error('Complimentary duration must be a whole number between 0 and 120');
  }
  const start = assertValidDate(startsAt, 'complimentary start');
  if (unit === 'days') return addCalendarDays(start, duration).toISOString();
  if (unit === 'months') return addCalendarMonths(start, duration).toISOString();
  if (unit === 'years') return addCalendarMonths(start, duration * 12).toISOString();
  throw new Error('Unsupported complimentary duration unit');
}

export function calculateSubscriptionAmount(monthlyPriceRwf: number, months: number): number {
  if (!Number.isSafeInteger(monthlyPriceRwf) || monthlyPriceRwf <= 0) {
    throw new Error('Monthly subscription price must be a positive whole RWF amount');
  }
  if (!Number.isSafeInteger(months) || months < 1 || months > 24) {
    throw new Error('Subscription duration must be between 1 and 24 calendar months');
  }
  const amount = monthlyPriceRwf * months;
  if (!Number.isSafeInteger(amount) || amount > 100000000) {
    throw new Error('Subscription amount exceeds the supported limit');
  }
  return amount;
}

export function getRestaurantSaasStatus(
  periodEnd: string | null | undefined,
  nowMs = Date.now(),
  cancelled = false,
  graceDays = RESTAURANT_SAAS_GRACE_DAYS
): { status: RestaurantSaasStatus; graceEndsAt: string | null; graceHoursRemaining: number } {
  if (cancelled) return { status: 'cancelled', graceEndsAt: null, graceHoursRemaining: 0 };
  if (!periodEnd) return { status: 'pending_payment', graceEndsAt: null, graceHoursRemaining: 0 };

  const endMs = Date.parse(periodEnd);
  if (!Number.isFinite(endMs) || !Number.isSafeInteger(graceDays) || graceDays < 0 || graceDays > 365) {
    return { status: 'restricted', graceEndsAt: null, graceHoursRemaining: 0 };
  }
  const graceEndMs = addCalendarDays(new Date(endMs), graceDays).getTime();
  if (nowMs < endMs) return { status: 'active', graceEndsAt: new Date(graceEndMs).toISOString(), graceHoursRemaining: Math.ceil((graceEndMs - endMs) / 3600000) };
  if (nowMs < graceEndMs) {
    return {
      status: 'grace_period',
      graceEndsAt: new Date(graceEndMs).toISOString(),
      graceHoursRemaining: Math.max(0, Math.ceil((graceEndMs - nowMs) / 3600000)),
    };
  }
  return { status: 'restricted', graceEndsAt: new Date(graceEndMs).toISOString(), graceHoursRemaining: 0 };
}

/**
 * Early renewals append calendar months to the existing paid-through date.
 * First payment after complimentary access starts at the verified payment time.
 * Late renewals start at the verification time; no unearned gap is backdated.
 */
export function calculateRenewalPeriod(
  currentPeriodEnd: string | null | undefined,
  verifiedAt: string,
  months = 1,
  graceDays = RESTAURANT_SAAS_GRACE_DAYS,
  billingAnchorDay?: number | null
): { periodStart: string; periodEnd: string; gracePeriodEnd: string; billingAnchorDay: number } {
  if (!Number.isSafeInteger(months) || months < 1 || months > 24) {
    throw new Error('Subscription duration must be between 1 and 24 calendar months');
  }
  if (!Number.isSafeInteger(graceDays) || graceDays < 0 || graceDays > 365) {
    throw new Error('Grace period must be between 0 and 365 days');
  }
  const verified = assertValidDate(verifiedAt, 'verified payment');
  const paidThrough = currentPeriodEnd ? Date.parse(currentPeriodEnd) : Number.NaN;
  const start = Number.isFinite(paidThrough) && paidThrough > verified.getTime()
    ? new Date(paidThrough)
    : verified;
  const anchorDay = billingAnchorDay ?? start.getUTCDate();
  const end = addCalendarMonthsWithAnchor(start, months, anchorDay);
  const graceEnd = addCalendarDays(end, graceDays);
  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    gracePeriodEnd: graceEnd.toISOString(),
    billingAnchorDay: anchorDay,
  };
}

export function validateSaasPaymentMatch(input: {
  providerStatus: string;
  providerAmount: string | number;
  expectedAmountRwf: number;
  providerCurrency: string;
  expectedCurrency: string;
  providerExternalId: string;
  expectedExternalId: string;
  providerPayerMsisdn: string;
  expectedPayerMsisdn: string;
}): boolean {
  const amount = Number(input.providerAmount);
  return input.providerStatus === 'SUCCESSFUL'
    && Number.isSafeInteger(amount)
    && amount > 0
    && Number.isSafeInteger(input.expectedAmountRwf)
    && input.expectedAmountRwf > 0
    && amount === input.expectedAmountRwf
    && input.providerCurrency === input.expectedCurrency
    && input.providerExternalId === input.expectedExternalId
    && normalizeMsisdn(input.providerPayerMsisdn) === normalizeMsisdn(input.expectedPayerMsisdn);
}

export function normalizeMsisdn(value: string): string {
  return String(value || '').replace(/[+\s-]/g, '');
}
