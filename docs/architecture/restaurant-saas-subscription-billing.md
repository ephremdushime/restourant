# RestoPass Restaurant SaaS Subscription Billing

**Status:** Implemented on the production-hardening branch; automated verification and MTN Rwanda sandbox/UAT evidence remain pending.  
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

A payment request accepted by MTN is pending, not paid. Access is granted only after server-side verification confirms the transaction, exact expected amount, RWF currency, unique reference, correct restaurant, payer MSISDN and successful final provider status. A provider-successful payment with mismatched details is quarantined as `review_required`; it never grants access and requires manual reconciliation.

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
- For production-like staging only, `MTN_MOMO_TARGET_ENVIRONMENT=sandbox` also requires `RESTOPASS_SAAS_MTN_SANDBOX_APPROVED=true`; the API base URL remains the MTN sandbox host.
- `MTN_MOMO_TARGET_ENVIRONMENT=production` (production only)
- `MTN_MOMO_COLLECTION_API_USER`
- `MTN_MOMO_COLLECTION_API_KEY`
- `MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY`
- `MTN_MOMO_PRODUCTION_TARGET` for production
- `RESTOPASS_SAAS_MTN_PRODUCTION_APPROVED=true` plus `NODE_ENV=production` for production

Do not configure the production gate until MTN has approved the own-merchant collection arrangement, issued production credentials, the customer journey has passed UAT, and regulatory requirements have been clarified. Credentials must never be placed in frontend environment variables or committed to Git.

## Remaining release gates

- Run the full CI build, lint and automated test suite against the exact current hardening-branch SHA; no passing run is currently recorded for that SHA.
- Execute the PostgreSQL-backed billing integration test. It covers payment verification, tenant isolation, entitlement restriction, idempotent verification, mismatch quarantine and duplicate-charge blocking; database rollback, concurrent renewals and reconciliation races still need dedicated tests.
- Confirm the MTN RequestToPay response fields and status lookup behavior against the exact Rwanda merchant sandbox credentials and UAT workbook; the current integration test uses a mocked provider and is not an MTN sandbox test.
- Complete security review of manual Super Admin licence overrides and make the override reason mandatory.
- Add automated production monitoring/reconciliation for payment attempts left pending after network timeouts; v1 exposes manual server-side status checks only.
- Validate the full registration-to-payment journey with a real restaurant administrator and MTN sandbox handset before enabling production collection.


---

## Subscription policy revision — 8 November 2026

This section supersedes any earlier references in this document to fixed 30-day billing terms or a mandatory 72-hour renewal grace period.

### Calendar-month billing

- One subscription month is one calendar month, not 30 days.
- The billing service clamps month-end dates to the final valid day of the target month and preserves end-of-month renewal anchors.
- The API accepts 1–24 months; customer-facing and restaurant-facing checkout currently offers 1–6 months.
- Amount due is the configured monthly RWF price multiplied by the number of months purchased.
- An early renewal appends purchased calendar months to the current paid-through date.
- A late renewal starts at the MTN-verified payment timestamp; unpaid time is not backdated.
- The payment record stores the monthly price snapshot, total amount, and `months_purchased`.

### Restaurant complimentary onboarding

Super Admin configures these terms when onboarding a restaurant:

- Monthly SaaS price in RWF.
- Complimentary duration value and unit: days, months, or years.
- Post-paid-expiry renewal grace period in calendar days.

The complimentary clock starts at restaurant creation/onboarding time. During the complimentary period, the backend creates a server-issued time-limited complimentary licence and marks the tenant active. Payment initiation is rejected while complimentary access remains active.

When the complimentary period ends, the restaurant enters `pending_payment`. The administrator can still sign in to the billing portal, but tenant write operations are blocked. The first paid period begins only after MTN confirms payment. It starts at the provider-verified timestamp.

Complimentary expiry does not receive a post-expiry renewal grace period. Renewal grace applies only to a paid subscription period.

Existing valid licences issued before this policy are migrated into the SaaS subscription record using their existing validity dates. The migration must not unexpectedly suspend existing active tenants. Legacy restaurants without a configured SaaS price receive a zero-price pending record and cannot initiate payment until Super Admin explicitly sets the agreed monthly amount; the system must never invent a commercial price.

### Customer dashboard access policy

Customer subscription pricing is global and configured by Super Admin. Restaurant-specific customer subscription price overrides are deprecated and ignored by the active price resolver.

Super Admin controls:

- Global monthly customer access price in RWF.
- Customer payment enforcement enabled/disabled.
- Promotional access enabled/disabled.
- Promotional start and end timestamps.
- Customer-facing promotional message.
- Renewal grace period in calendar days.

When payment enforcement is disabled, eligible approved customers receive free dashboard access. When promotional access is active, eligible approved customers receive complimentary dashboard access even if payment enforcement is enabled. After the promotion ends, payment is required only if Super Admin has enabled enforcement.

The customer dashboard must identify promotional access and show the configured end date. No automatic charge is made. The customer must select a term and explicitly approve an MTN MoMo payment request.

Customer subscription expiry must not erase meal balances, disable an otherwise valid physical card, or change restaurant meal-sale records.

### Tenant identity and onboarding access

`restaurantCode` remains the canonical tenant identifier. It scopes restaurant administrators, cashier/scanner accounts, customers, subscriptions, and transactions.

During Super Admin onboarding, the system provisions the initial restaurant administrator account through the Super Admin-only administrator provisioning endpoint. The tenant entry URL uses the existing restaurant-code context, for example:

`https://app.restopass.rw/?resto=RW03`

Customer registration remains linked to the restaurant-specific registration QR code/context. A restaurant administrator receives a separate username and password; staff accounts remain role-restricted.

### Revenue separation

There are two independent RestoPass subscription revenue streams paid to BESTIE COMPANIES LTD:

1. Restaurant SaaS subscriptions.
2. Customer dashboard access subscriptions.

Restaurant customers pay for food and drinks directly to the restaurant using the restaurant's accepted payment methods. RestoPass does not collect, hold, or settle those food-sale payments.

### Deployment caution

The code paths described here are not evidence of successful live MTN sandbox testing. Do not enable production collections until the UAT matrix is executed against MTN sandbox, reconciliation and idempotency tests pass, production credentials are approved, and the production callback/status-verification design is reviewed.
