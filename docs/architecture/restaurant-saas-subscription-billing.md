# RestoPass Restaurant SaaS Subscription Billing

**Status:** Design approved; implementation in progress.  
**Merchant:** Bestie Companies Ltd.  
**Purpose:** Collect RestoPass software-access fees from restaurants only.  
**Provider target:** MTN MoMo Collections.  
**Currency:** RWF.  
**Billing term:** 30 days per successful payment.

## Scope boundary

This module bills restaurants for their RestoPass software access. It does not collect, hold, reconcile, or distribute restaurant customers' meal payments. Meal purchases, meal top-ups, restaurant cash/bank records and meal-balance ledgers remain separate.

The customer-facing RestoPass interfaces offer MTN MoMo only. Airtel Money may remain in existing staff-side/manual restaurant payment records where required for historical reconciliation; it is not offered in customer-facing payment selection.

## Approved subscription rules

- Super-admin configures an individual restaurant's SaaS subscription price during onboarding.
- New restaurant access starts only after successful, independently verified payment.
- Each verified payment grants 30 days.
- Early renewal extends from the existing paid-through timestamp, preserving unused time.
- Renewal after restriction starts a new 30-day term from the successful payment confirmation timestamp.
- A 72-hour grace period follows the paid-through timestamp.
- During grace, normal operation remains available with renewal warnings.
- After grace, scanner redemption and business-changing operations are restricted.
- Restaurant administrators retain login, subscription status, payment history and renewal access.
- A successful verified payment automatically restores full access.

## Payment authorization and verification

The first release uses restaurant-admin-initiated MTN RequestToPay. The restaurant administrator approves each prompt on the payer's phone. Do not represent this as automatic recurring debit. Recurring mandates require separate confirmation and approval from MTN.

A payment request accepted by MTN is pending, not paid. Access is granted only after server-side verification confirms the transaction, exact expected amount, RWF currency, unique reference, correct restaurant and successful final provider status.

The client, browser redirect, screenshot or manually supplied transaction reference must never activate or extend access.

## Persistence and isolation

Restaurant SaaS subscription payments must use dedicated persistence, separate from:
- customerSubscriptions and studentSubscriptionPayments;
- mobile_money_payment_attempts for customer subscription/meal top-up flows;
- payments and ledger_entries for restaurant meal accounting.

The new persistence must record the restaurant, price snapshot, currency, internal reference, MTN transaction ID, payer number (masked where displayed), status, initiation/verification timestamps, and idempotency key. Database uniqueness must prevent duplicate provider transaction IDs and duplicate entitlement application.

Payment verification and entitlement extension must commit atomically. Callback processing must be authenticated and idempotent; uncertain attempts must be reconciled through MTN's transaction-status API.

## Current release constraints

- MTN merchant onboarding and production credentials are not yet confirmed.
- Live payment initiation and callback activation remain disabled until MTN approves Bestie Companies Ltd's own-merchant collection arrangement and credentials are securely configured.
- Sandbox tests must cover success, pending, failure, timeout, wrong amount, wrong currency, wrong restaurant, duplicate callback, delayed callback and concurrent renewal.
- Manual super-admin extension remains an audited fallback during migration.
- Do not merge or deploy this module until CI, database-backed integration tests, staging acceptance and production release gates pass.
