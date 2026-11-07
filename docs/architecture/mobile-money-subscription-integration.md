# RestoPass Mobile Money Integration Plan

**Status:** Planned — no live provider integration or payment collection is enabled.

**Scope:** Customer subscription payments that unlock the RestoPass digital customer dashboard and subscription-gated digital features. This is separate from cafeteria meal/plate top-ups and restaurant-to-platform licensing.

## 1. Product and billing rules

- Initial subscription price remains the configured platform price (currently 500 RWF) for 30 days, denominated in integer RWF.
- A successful, independently verified payment grants 30 days of access, followed by the configured 3-day (72-hour) grace period.
- Physical PVC card redemption remains independent of the dashboard subscription.
- The customer explicitly initiates each payment. Do not implement automatic recurring debits unless the selected provider supports an approved mandate flow and the customer separately opts in.
- A pending, failed, cancelled, timed-out, or unverified payment never grants access.
- A payment for a dashboard subscription must never credit the customer's meal balance or write a meal ledger entry.
- Complimentary subscriptions remain a separate audited super-admin action.

## 2. Provider abstraction

Build a provider-neutral service boundary; business logic must not contain MTN- or Airtel-specific HTTP calls.

Proposed contract (names illustrative until implementation):

```ts
type MobileMoneyProvider = 'mtn_momo' | 'airtel_money';

interface MobileMoneyAdapter {
  createCollectionRequest(input: {
    amountRwf: number;
    payerMsisdn: string;
    currency: 'RWF';
    externalReference: string;
    callbackUrl: string;
    description: string;
  }): Promise<{
    providerTransactionId: string;
    providerRequestId?: string;
    status: 'accepted' | 'pending' | 'rejected';
  }>;

  verifyTransaction(input: {
    providerTransactionId: string;
    externalReference: string;
  }): Promise<{
    status: 'successful' | 'pending' | 'failed' | 'cancelled';
    amountRwf: number;
    currency: string;
    payerMsisdn?: string;
    completedAt?: string;
  }>;
}
```

Implement separate MTN MoMo and Airtel Money adapters behind this contract. A provider adapter is not considered production-ready until its authentication, request signing, response parsing, timeout behavior, callback verification, and status-query behavior are covered by contract tests against the provider's current documentation and sandbox.

## 3. Customer payment lifecycle

1. Customer opens **Dashboard Subscription** and sees the price, duration, expiry, grace policy, provider availability, and a clear statement that this is dashboard access—not meal credit.
2. Customer chooses MTN MoMo or Airtel Money and enters/confirms the payer phone number.
3. Backend derives customer identity from the authenticated session. It ignores any client-supplied customer ID, amount, currency, plan price, or subscription status.
4. Backend creates a unique internal payment reference and persists a `created` payment attempt before calling the provider. Store only the phone data needed for reconciliation and apply retention/access controls.
5. Adapter requests a collection/payment prompt from the provider. The UI says **payment request sent** only if the provider actually accepted the request. It displays a pending state while awaiting settlement.
6. Provider sends a callback to the registered HTTPS webhook. The callback handler validates provider-specific authentication/signature and binds the event to the stored internal reference and provider transaction ID.
7. Backend independently queries the provider's transaction-status API. A callback alone is not sufficient evidence of payment.
8. In one PostgreSQL transaction, lock the payment attempt and subscription, verify exact amount/currency/provider/reference/customer, mark the payment successful once, and extend the subscription period once. Use unique constraints and idempotency to prevent duplicate activation.
9. Customer dashboard polls or receives a notification of the authoritative payment state. It unlocks only after the server reports an active entitlement.
10. Failed, rejected, cancelled, and expired attempts remain visible in payment history with a safe retry action. They do not extend access.

## 4. Payment state machine

```text
created -> provider_pending -> successful
                         |-> failed
                         |-> cancelled
                         |-> expired

successful is terminal for the payment attempt.
A refund, reversal, or chargeback is a separate compensating event and must not rewrite history.
```

A delayed callback must not downgrade a successful payment. Duplicate callbacks must return an idempotent success response without extending the subscription twice. Out-of-order callbacks must be reconciled against the provider's status API.

## 5. Provider registration and API onboarding runbook

Complete this separately for each provider we decide to launch:

1. **Business readiness:** confirm the legal merchant entity, registered business details, authorized signatory, settlement bank account, tax/contact details, and the provider's merchant eligibility requirements.
2. **Merchant registration:** apply for the provider's collection/merchant product (not merely a consumer wallet). Confirm whether the merchant product supports RWF collections, push/STK/USSD requests, callbacks, transaction queries, refunds, and production settlement.
3. **Commercial approval:** obtain the fee schedule, settlement timing, limits, dispute/chargeback process, support escalation contacts, and any minimum balance or reserve requirements.
4. **Developer access:** request sandbox access and API documentation. Obtain test credentials, API user/subscription keys or OAuth client credentials, callback requirements, signing certificates/secrets, IP allowlists, and any required public callback URL registration.
5. **Sandbox configuration:** configure credentials in a secrets manager/environment—not source code, frontend bundles, database seed data, or logs. Add separate sandbox and production configurations.
6. **Callback registration:** register a dedicated HTTPS endpoint per provider/environment. Confirm certificate/TLS requirements, callback authentication, retry behavior, source IP guidance, and provider event identifiers.
7. **Sandbox certification:** test successful, pending, rejected, cancelled, insufficient-funds, timeout, duplicate callback, forged callback, wrong amount, wrong currency, unknown reference, delayed callback, and status-query outage cases.
8. **Security review:** review secret storage/rotation, replay prevention, rate limits, request validation, privacy/retention, audit events, reconciliation, and incident response.
9. **Production approval:** request live credentials and merchant activation only after sandbox acceptance. Store credentials in the production secret manager, deploy behind a feature flag, and initially enable for a small controlled cohort.
10. **Operational handover:** document settlement reconciliation, daily exception reports, provider outage procedures, customer support scripts, refund handling, credential rotation, and named operational owners.

Do not assume that MTN and Airtel have identical API flows, credentials, callback signatures, sandbox behavior, or onboarding requirements. Confirm all details against the selected Rwandan merchant products and their current official documentation during onboarding.

## 6. Configuration and secret management

Use server-side configuration only. Proposed names (not active credentials):

- `MOMO_MTN_ENABLED`
- `MOMO_MTN_BASE_URL`
- `MOMO_MTN_API_USER`
- `MOMO_MTN_API_KEY`
- `MOMO_MTN_SUBSCRIPTION_KEY`
- `MOMO_MTN_CALLBACK_SECRET`
- `MOMO_AIRTEL_ENABLED`
- `MOMO_AIRTEL_BASE_URL`
- `MOMO_AIRTEL_CLIENT_ID`
- `MOMO_AIRTEL_CLIENT_SECRET`
- `MOMO_AIRTEL_CALLBACK_SECRET`
- `MOMO_CALLBACK_BASE_URL`

These are proposed placeholders only. The actual variable names and credential set must follow each provider's approved API product. Never commit values. Keep sandbox and production secrets separate, rotate them, and redact them from logs.

## 7. PostgreSQL persistence changes required before activation

The schema now includes `mobile_money_payment_attempts` and `mobile_money_webhook_events`. They separate provider transactions from meal-credit payments, constrain provider/environment/status, enforce unique internal references and provider transaction identities, and retain webhook digests rather than raw payloads. Before activation, the adapters and transaction reconciler must use these tables for:

- Customer and subscription relationship validation in the service transaction
- Provider request/correlation ID and masked payer metadata in the JSON data column
- Verified provider status, verification timestamp, and minimal verification evidence
- Failure code/category and safe diagnostic metadata
- Daily settlement reconciliation against provider statements

Add indexes/unique constraints for internal reference, provider transaction identity, and idempotency. Keep raw provider payloads out of ordinary application logs; if retention is required for disputes, encrypt and restrict access with a documented retention period.

Subscription activation and successful payment recording must commit in the same PostgreSQL transaction. The transaction must lock the subscription row and the payment-attempt row. Never activate a subscription from browser sync, a client button, an unverified callback, or a manually supplied transaction reference.

## 8. API shape when implemented

- `POST /api/customer/subscription/checkout`: authenticated customer; server selects plan/price; accepts provider and payer phone; returns internal reference and provider request state.
- `GET /api/customer/subscription/payments/:reference`: authenticated owner only; returns a safe payment status.
- `POST /api/webhooks/mobile-money/mtn`: provider-specific authenticated MTN callback.
- `POST /api/webhooks/mobile-money/airtel`: provider-specific authenticated Airtel callback.
- Internal provider verification worker/service: performs status queries and reconciles uncertain attempts.
- Admin reconciliation endpoints: role-scoped and audited; cannot manually mark a payment successful without verified provider evidence.

The current generic callback route is deliberately disabled. Prefer provider-specific routes once the provider specifications are known.

## 9. Reconciliation, support, and observability

- Reconcile provider settlements against successful internal payment attempts daily.
- Alert on pending attempts exceeding the provider's expected completion window, callback verification failures, mismatched amount/currency, duplicate provider transaction IDs, settlement discrepancies, and elevated failure rates.
- Use correlation IDs across checkout, provider request, callback, verification, and subscription activation.
- Provide customer-facing states: awaiting approval, successful, failed, cancelled, timed out, and support required.
- Provide support with internal reference and provider transaction ID; never ask customers for PINs or OTPs.
- Refunds and chargebacks require separate append-only records and explicit policy. Do not delete successful payment history.

## 10. Acceptance criteria before enabling the feature

- Provider merchant account and production API product approved.
- Sandbox and production credentials stored securely and separated.
- Provider adapter contract tests pass for each enabled provider.
- Callback authentication and independent server-to-server transaction verification are proven.
- PostgreSQL concurrency/idempotency tests prove one payment can activate a subscription only once.
- Exact amount/currency/customer/reference matching is enforced.
- No browser/client route can activate a subscription.
- Failure, timeout, retry, duplicate, reversal, refund, and reconciliation paths are tested.
- Dashboard entitlement is derived only from server-authoritative subscription state.
- Feature flag remains off until operations, support, and security review sign-off.

## 11. Current implementation status

- Student dashboard subscription policy and entitlement checks already exist; the launch feature flag defaults to disabled.
- The generic Mobile Money callback currently returns HTTP 503 and does not activate subscriptions.
- The checkout endpoint now returns HTTP 503 with `PAYMENT_PROVIDER_NOT_CONFIGURED`; it does not create a fake pending payment or claim a USSD prompt was sent.
- The customer UI identifies Mobile Money as coming soon; payment simulation is limited to demo mode.
- Client-side subscription verification is blocked in authenticated production sessions.
- Normalized provider-neutral payment-attempt and webhook-event tables are now present in PostgreSQL. No provider adapter is enabled and no customer is charged by this feature.

**Next implementation phase:** add normalized payment-attempt persistence, provider adapter interfaces and mock contract tests without activating a live provider. Complete provider-specific adapters only after merchant onboarding and sandbox credentials are available.


---

## RestoPass subscription purposes — 8 November 2026

RestoPass uses MTN MoMo Collections for two separate subscription purposes, subject to the same BESTIE COMPANIES LTD merchant configuration and MTN approval:

- Restaurant software subscription: internal reference prefix `RESTO-`.
- Customer dashboard access subscription: internal reference prefix `PATRON-`.

These references are separate from restaurant meal purchases. Meal and drink payments are made directly to each restaurant and are not collected or settled by RestoPass.

Both subscription purposes use RWF and calendar-month billing. The requested amount is:

`configured_monthly_price_rwf × months_purchased`

The supported checkout interface offers 1–6 months. The server validates a 1–24 month API range, snapshots the monthly price and term, and verifies the provider's amount, currency, payer MSISDN, external reference, and financial transaction ID before activating access.

### Customer dashboard collection

Customer checkout uses the same server-side MTN Collections configuration as restaurant SaaS checkout. It must not use the legacy mock-capable generic mobile-money service for production activation.

The customer payment flow is:

1. Check global customer payment policy and active promotional window.
2. Validate customer tenant and registration approval.
3. Persist a unique payment attempt and idempotency fingerprint before requesting payment.
4. Send MTN Request to Pay with a unique provider reference UUID.
5. Poll MTN Request to Pay status server-to-server.
6. Keep pending transactions unresolved; never activate on HTTP 202 alone.
7. On provider success, compare amount, currency, payer, external reference and provider transaction ID.
8. Reject duplicate provider transaction IDs and duplicate activation.
9. Calculate the purchased calendar-month period and update the customer subscription only after verification.

The legacy custom-HMAC customer callback is not an MTN-authenticated webhook and cannot activate a successful subscription. Direct MTN status verification is authoritative.

### Environment and production safeguards

Restaurant and customer subscriptions share the `RESTOPASS_SAAS_MTN_ENABLED` gate and MTN Collections credentials/environment. Keep the feature disabled until sandbox credentials and the correct Rwanda target environment are configured.

Sandbox UAT must be executed with actual provider requests and responses. Mock or local simulation results do not count as MTN UAT passes. Keep secrets in environment variables or the deployment secret manager; never paste API keys into source control, issue comments, or chat.

Production enablement requires MTN merchant approval, verified production credentials, reconciliation procedures, refund handling, monitoring, incident response, and the required legal/compliance approvals.
