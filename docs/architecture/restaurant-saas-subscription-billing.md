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

Payment verification and entitlement extension must commit atomically. Version 1 uses server-to-server MTN transaction-status polling; no client callback or browser redirect can grant entitlement. Pending/uncertain attempts remain pending until a status lookup confirms a final provider result.

## Current release constraints

- MTN merchant onboarding and production credentials are not yet confirmed.
- Live payment initiation remains disabled until MTN approves Bestie Companies Ltd's own-merchant collection arrangement and production credentials are securely configured. Version 1 does not expose a public payment callback endpoint.
- Sandbox tests must cover success, pending, failure, timeout, wrong amount, wrong currency, wrong restaurant, duplicate callback, delayed callback and concurrent renewal.
- Manual Super Admin licence issuance and renewal controls are disabled in the UI; they must not be used as a payment bypass. Any future emergency override needs a separate, reason-coded, audited and access-controlled design.
- Do not merge or deploy this module until CI, database-backed integration tests, staging acceptance and production release gates pass.


## Implemented application surfaces

- New restaurant registration creates a `pending_payment` restaurant and does not issue an initial licence.
- Super Admin configures the restaurant's SaaS price in RWF. The existing monthly base-price field is used as the initial price; later price changes are written through the dedicated SaaS pricing endpoint and audited.
- Restaurant administrators have a dedicated Software Subscription screen. It remains accessible when the subscription is pending or restricted.
- The server exposes:
  - `GET /api/restaurant-saas/subscription`
  - `POST /api/restaurant-saas/subscription/price` (Super Admin only)
  - `POST /api/restaurant-saas/payment/initiate` (restaurant administrator)
  - `POST /api/restaurant-saas/payment/:paymentId/verify`
- RequestToPay is user-authorized for each 30-day cycle. It is not an automatic recurring debit mandate.
- Protected tenant write APIs, including the server-authoritative scanner-consumption endpoint, are fail-closed when no active/grace SaaS entitlement exists or the 72-hour grace period has ended. GET reads and SaaS billing endpoints remain available.
- The MTN adapter is feature-gated. HTTP 202 is stored as pending only. A successful entitlement is applied in one PostgreSQL transaction after checking provider status, exact amount, RWF currency, external reference, payer MSISDN and provider financial transaction ID.
- Renewal starts at the later of the existing paid-through timestamp or verified payment time, then adds 30 days. The 72-hour grace period follows the new paid-through timestamp.

## MTN configuration gates

The collection integration expects server-side secrets only:

- `RESTOPASS_SAAS_MTN_ENABLED=true`
- `MTN_MOMO_TARGET_ENVIRONMENT=sandbox` (or `production`)
- `MTN_MOMO_COLLECTION_API_USER`
- `MTN_MOMO_COLLECTION_API_KEY`
- `MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY`
- `MTN_MOMO_PRODUCTION_TARGET` for production
- `RESTOPASS_SAAS_MTN_PRODUCTION_APPROVED=true` plus `NODE_ENV=production` for production

Do not configure the production gate until MTN has approved the own-merchant collection arrangement, issued production credentials, the customer journey has passed UAT, and regulatory requirements have been clarified. Credentials must never be placed in frontend environment variables or committed to Git.

## Remaining release gates

- Run the full CI build, lint and automated test suite against this branch.
- Run the new PostgreSQL-backed billing integration test and extend it to cover database rollback, concurrent renewals and transaction-status reconciliation races.
- Confirm the MTN RequestToPay response fields and status lookup behavior against the exact Rwanda merchant sandbox credentials and UAT workbook; the current integration test uses a mocked provider and is not an MTN sandbox test.
- Complete security review of manual Super Admin licence overrides and make the override reason mandatory.
- Add automated production monitoring/reconciliation for payment attempts left pending after network timeouts; v1 exposes manual server-side status checks only.
- Validate the full registration-to-payment journey with a real restaurant administrator and MTN sandbox handset before enabling production collection.
