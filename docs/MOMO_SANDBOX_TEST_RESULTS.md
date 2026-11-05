# MTN MoMo Sandbox Verification — Evidence Status

**Status: NOT CERTIFIED / LIVE SANDBOX EVIDENCE NOT YET RECORDED**

This document is the evidence register for the RestoPass MTN MoMo integration. It intentionally does not claim that MTN has certified RestoPass or that 15 live sandbox scenarios have passed.

## What the repository currently contains

- `src/services/momoService.ts` implements API calls for API-user provisioning, Collection, Disbursement and Remittance.
- `scripts/runMomoSandboxTests.ts` invokes a 15-scenario harness.
- `tests/momoSandboxTestMatrix.test.ts` exercises the harness for automated regression.
- The service defaults to deterministic mock mode when `MOMO_USE_MOCK` is not explicitly false and the generic subscription key is absent; Node test mode also forces mock mode.
- Mock mode returns synthetic HTTP-like statuses and synthetic transaction records from an in-memory store. A passing test in this mode is a software simulation, not a request to MTN.
- The current matrix mainly checks HTTP status codes. For several asynchronous operations, HTTP 202 means accepted/pending, not completed/settled. HTTP 200 on a status lookup does not by itself prove that the transaction status is `SUCCESSFUL`.

## Important currency distinction

The current harness defaults to `EUR` and its sample scenarios use EUR. This may be useful for the generic MTN developer sandbox, but it does **not** prove that the Rwanda merchant profile can collect or settle in RWF. RestoPass production subscription amounts and the payment ledger are RWF-only. Do not change a production RWF payment into EUR to make a sandbox test pass.

## What is required before recording a live sandbox pass

1. Obtain the actual MTN Rwanda sandbox Collection subscription key and API user/API key. Obtain separate Disbursement/Remittance products only if those products are approved and genuinely in scope.
2. Set credentials in the runtime secret manager or a local ignored `.env`; never commit credentials, API keys, access tokens, payer details, or full provider payloads.
3. Explicitly set `MOMO_USE_MOCK=false` and `MOMO_TARGET_ENV=sandbox`. Verify the runner prints **Live MTN Sandbox Gateway** before treating results as live.
4. Confirm the provider's Rwanda sandbox currency and test MSISDN requirements with MTN. Record the exact currency and approved test payer.
5. Execute Collection RequestToPay with a test payer who can authorize the prompt. Record the HTTP 202 response as **PENDING**, then poll until a terminal status. Only `SUCCESSFUL` after matching amount, currency, externalId, payer and provider transaction ID is a successful payment.
6. Test negative paths: declined, expired, invalid MSISDN, insufficient funds (if supported), timeout/unknown outcome, duplicate reference, wrong amount/currency/payer, and repeated status verification.
7. Save a redacted evidence bundle: timestamp, environment, API product, endpoint, HTTP status, latency, reference UUID, terminal status and redacted response. Never include bearer tokens, API keys, full MSISDNs or secret headers.
8. Have MTN confirm whether the merchant profile and settlement account support the intended RWF collection flow. Sandbox success is not production approval.

## Scope: what RestoPass needs for the first launch

The first RestoPass launch needs restaurant subscription collection only if the business has chosen to collect subscription fees in-app. Customer meal top-ups and restaurant SaaS subscriptions are distinct financial flows. Disbursement, remittance and refunds are not launch dependencies unless RestoPass actually enables those features and has the required merchant permissions.

The current production readiness decision keeps customer checkout/callbacks disabled until provider onboarding, server-to-server verification, reconciliation and production credentials are complete. Preserve that fail-closed state. A restaurant can be onboarded and use an explicitly approved manual subscription process without claiming that MoMo checkout is live.

## Current evidence table

| Area | Repository evidence | Verified live with MTN? |
|---|---|---:|
| API-user provisioning | Implemented in service and mock harness | No evidence recorded |
| Collection token | Implemented in service and mock harness | No evidence recorded |
| RequestToPay | Implemented in service and mock harness | No evidence recorded |
| Collection status polling | Implemented in service and mock harness | No evidence recorded |
| Account-holder status / balance | Implemented in service and mock harness | No evidence recorded |
| Disbursement / refund | Implemented in service and mock harness | No evidence recorded |
| Remittance | Implemented in service and mock harness | No evidence recorded |
| RestoPass subscription entitlement | Separate server-side flow; production gate remains disabled | No live payment-to-entitlement evidence |

**Do not describe this report as “15/15 MTN sandbox certification”.** A green mock test or a green GitHub Actions run validates code paths under test, not MTN connectivity, payer authorization, settlement or merchant approval.
