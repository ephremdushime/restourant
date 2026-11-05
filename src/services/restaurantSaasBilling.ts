/**
 * Restaurant SaaS subscription billing domain rules.
 * This module contains no provider or persistence side effects.
 */
export const RESTAURANT_SAAS_TERM_DAYS = 30;
export const RESTAURANT_SAAS_GRACE_HOURS = 72;

export type RestaurantSaasStatus =
  | 'pending_payment'
  | 'active'
  | 'grace_period'
  | 'restricted'
  | 'cancelled';

export function getRestaurantSaasStatus(
  periodEnd: string | null | undefined,
  nowMs = Date.now(),
  cancelled = false
): { status: RestaurantSaasStatus; graceEndsAt: string | null; graceHoursRemaining: number } {
  if (cancelled) return { status: 'cancelled', graceEndsAt: null, graceHoursRemaining: 0 };
  if (!periodEnd) return { status: 'pending_payment', graceEndsAt: null, graceHoursRemaining: 0 };

  const endMs = Date.parse(periodEnd);
  if (!Number.isFinite(endMs)) return { status: 'restricted', graceEndsAt: null, graceHoursRemaining: 0 };
  const graceEndMs = endMs + RESTAURANT_SAAS_GRACE_HOURS * 60 * 60 * 1000;
  if (nowMs < endMs) return { status: 'active', graceEndsAt: new Date(graceEndMs).toISOString(), graceHoursRemaining: RESTAURANT_SAAS_GRACE_HOURS };
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
 * Early renewals append 30 days to the existing paid-through date.
 * A renewal after paid time (including grace) begins at the payment's verified time.
 */
export function calculateRenewalPeriod(
  currentPeriodEnd: string | null | undefined,
  verifiedAt: string
): { periodStart: string; periodEnd: string; gracePeriodEnd: string } {
  const paidThroughMs = currentPeriodEnd ? Date.parse(currentPeriodEnd) : Number.NaN;
  const verifiedMs = Date.parse(verifiedAt);
  if (!Number.isFinite(verifiedMs)) throw new Error('Invalid verified payment timestamp');
  const startMs = Number.isFinite(paidThroughMs) && paidThroughMs > verifiedMs ? paidThroughMs : verifiedMs;
  const endMs = startMs + RESTAURANT_SAAS_TERM_DAYS * 24 * 60 * 60 * 1000;
  return {
    periodStart: new Date(startMs).toISOString(),
    periodEnd: new Date(endMs).toISOString(),
    gracePeriodEnd: new Date(endMs + RESTAURANT_SAAS_GRACE_HOURS * 60 * 60 * 1000).toISOString(),
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
    && amount === input.expectedAmountRwf
    && input.providerCurrency === input.expectedCurrency
    && input.providerExternalId === input.expectedExternalId
    && normalizeMsisdn(input.providerPayerMsisdn) === normalizeMsisdn(input.expectedPayerMsisdn);
}

export function normalizeMsisdn(value: string): string {
  return String(value || '').replace(/[+\s-]/g, '');
}
