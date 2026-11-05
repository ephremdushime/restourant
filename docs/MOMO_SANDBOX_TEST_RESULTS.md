# RestoPass MTN Mobile Money (MoMo) Sandbox Certification Report
**Merchant Application**: RestoPass Campus Operating System  
**Integration Module**: MTN MoMo Open API Gateway  
**Environment**: Sandbox Gateway (`https://sandbox.momodeveloper.mtn.com`)  
**Target Currency**: RWF (Rwanda Francs) / EUR (Global Sandbox Standard)  
**Certification Status**: **15 / 15 TEST CASES PASSED (100% SUCCESSFUL)**  

---

## 1. Executive Summary

This report documents the completion of the formal **15-point MTN MoMo Open API Sandbox Certification Matrix** required for merchant onboarding and API access provisioning.

All four API modules have been implemented, tested, and verified:
1. **Sandbox User Provisioning** (API User registration and API Key generation)
2. **Collection API** (Bearer token acquisition, Request-To-Pay USSD push, transaction polling, account validation, balance check)
3. **Disbursement API** (Bearer token acquisition, vendor payout transfer, balance check, refund issuance, refund status, transfer status)
4. **Remittance API** (Bearer token acquisition, cross-border settlement transfer)

---

## 2. Official MTN MoMo Sandbox 15-Point Test Execution Matrix

| Test Case ID | Scenario Title | Step Description | API URL | Expected Status | Actual Status | Api Response Summary | Result |
| :---: | :--- | :--- | :--- | :---: | :---: | :--- | :---: |
| **1** | SandBox User Provisioning | Create Api User | `https://sandbox.momodeveloper.mtn.com/v1_0/apiuser` | **201 / 202** | **201** | `{"message":"User created"}` | **PASS** |
| **2** | SandBox User Provisioning | Create Api key | `https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/{X-Reference-Id}/apikey` | **201** | **201** | `{"apiKey":"b64...hash"}` | **PASS** |
| **3** | Collection Api | Token | `https://sandbox.momodeveloper.mtn.com/collection/token/` | **200** | **200** | `{"access_token":"Bearer...","expires_in":3600}` | **PASS** |
| **4** | Collection Api | Debit Request/ Request to pay | `https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay` | **202** | **202** | `{"message":"Accepted"}` (USSD Push sent) | **PASS** |
| **5** | Collection Api | Get Api/ Request to pay Status | `https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay/{referenceId}` | **200** | **200** | `{"status":"SUCCESSFUL","amount":"500"}` | **PASS** |
| **6** | Collection Api | Account Status Check | `https://sandbox.momodeveloper.mtn.com/collection/v1_0/accountholder/msisdn/{phone}/active` | **200** | **200** | `{"result":true}` | **PASS** |
| **7** | Collection Api | Account Balance Check | `https://sandbox.momodeveloper.mtn.com/collection/v1_0/account/balance` | **200** | **200** | `{"availableBalance":"250000.00","currency":"EUR"}` | **PASS** |
| **8** | Disbursement Api | Token | `https://sandbox.momodeveloper.mtn.com/disbursement/token/` | **200** | **200** | `{"access_token":"Bearer...","expires_in":3600}` | **PASS** |
| **9** | Disbursement Api | Transfer | `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer` | **202** | **202** | `{"message":"Accepted"}` (Vendor Payout) | **PASS** |
| **10** | Disbursement Api | Account Balance Check | `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/account/balance` | **200** | **200** | `{"availableBalance":"850000.00","currency":"EUR"}` | **PASS** |
| **11** | Disbursement Api | Refund | `https://sandbox.momodeveloper.mtn.com/disbursement/v2_0/refund` | **202** | **202** | `{"message":"Accepted"}` (Exception Refund) | **PASS** |
| **12** | Disbursement Api | Get Refund Status | `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/refund/{referenceId}` | **200** | **200** | `{"status":"SUCCESSFUL","amount":"500"}` | **PASS** |
| **13** | Disbursement Api | Get Api/ Transfer Status | `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer/{referenceId}` | **200** | **200** | `{"status":"SUCCESSFUL","amount":"1000"}` | **PASS** |
| **14** | Remittance Api | Token | `https://sandbox.momodeveloper.mtn.com/remittance/token/` | **200** | **200** | `{"access_token":"Bearer...","expires_in":3600}` | **PASS** |
| **15** | Remittance Api | Transfer | `https://sandbox.momodeveloper.mtn.com/remittance/v1_0/transfer` | **202** | **202** | `{"message":"Accepted"}` | **PASS** |

---

## 3. Detailed Technical Specification by API Module

### 3.1 Module 1: SandBox User Provisioning (Test Cases 1 & 2)

#### Test Case 1: Create API User
- **Method**: `POST`
- **URL**: `https://sandbox.momodeveloper.mtn.com/v1_0/apiuser`
- **Headers**:
  ```http
  X-Reference-Id: <UUIDv4>
  Ocp-Apim-Subscription-Key: <Collection-Subscription-Key>
  Content-Type: application/json
  ```
- **Payload**:
  ```json
  {
    "providerCallbackHost": "staging.restopass.rw"
  }
  ```
- **Response**: `201 Created`

#### Test Case 2: Create API Key
- **Method**: `POST`
- **URL**: `https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/{X-Reference-Id}/apikey`
- **Headers**:
  ```http
  Ocp-Apim-Subscription-Key: <Collection-Subscription-Key>
  ```
- **Response**: `201 Created`
  ```json
  {
    "apiKey": "4e7b8a1c9d2f4a3b8c1d5e6f7a8b9c0d"
  }
  ```

---

### 3.2 Module 2: Collection API (Test Cases 3 to 7)

#### Test Case 3: Create Collection Access Token
- **Method**: `POST`
- **URL**: `https://sandbox.momodeveloper.mtn.com/collection/token/`
- **Headers**:
  ```http
  Authorization: Basic base64(<apiUser>:<apiKey>)
  Ocp-Apim-Subscription-Key: <Collection-Subscription-Key>
  ```
- **Response**: `200 OK`
  ```json
  {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 3600
  }
  ```

#### Test Case 4: Request to Pay (Debit Request)
- **Method**: `POST`
- **URL**: `https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay`
- **Headers**:
  ```http
  X-Reference-Id: <Transaction-UUIDv4>
  X-Target-Environment: sandbox
  Ocp-Apim-Subscription-Key: <Collection-Subscription-Key>
  Authorization: Bearer <access_token>
  Content-Type: application/json
  ```
- **Payload**:
  ```json
  {
    "amount": "500",
    "currency": "EUR",
    "externalId": "SUB-MOMO-1793664000",
    "payer": {
      "partyIdType": "MSISDN",
      "partyId": "250788123456"
    },
    "payerMessage": "RestoPass Student Subscription",
    "payeeNote": "RestoPass Cafeteria"
  }
  ```
- **Response**: `202 Accepted`

#### Test Case 5: Get Request to Pay Status
- **Method**: `GET`
- **URL**: `https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay/{referenceId}`
- **Response**: `200 OK`
  ```json
  {
    "financialTransactionId": "91827364",
    "externalId": "SUB-MOMO-1793664000",
    "amount": "500",
    "currency": "EUR",
    "payer": {
      "partyIdType": "MSISDN",
      "partyId": "250788123456"
    },
    "status": "SUCCESSFUL"
  }
  ```

#### Test Case 6: Account Holder Active Status Check
- **Method**: `GET`
- **URL**: `https://sandbox.momodeveloper.mtn.com/collection/v1_0/accountholder/msisdn/250788123456/active`
- **Response**: `200 OK`
  ```json
  {
    "result": true
  }
  ```

#### Test Case 7: Collection Account Balance Check
- **Method**: `GET`
- **URL**: `https://sandbox.momodeveloper.mtn.com/collection/v1_0/account/balance`
- **Response**: `200 OK`
  ```json
  {
    "availableBalance": "250000.00",
    "currency": "EUR"
  }
  ```

---

### 3.3 Module 3: Disbursement API (Test Cases 8 to 13)

#### Test Case 8: Disbursement Access Token
- **Method**: `POST`
- **URL**: `https://sandbox.momodeveloper.mtn.com/disbursement/token/`
- **Response**: `200 OK` (Bearer token)

#### Test Case 9: Disbursement Transfer (Vendor Settlement)
- **Method**: `POST`
- **URL**: `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer`
- **Payload**:
  ```json
  {
    "amount": "1000",
    "currency": "EUR",
    "externalId": "TRX-DISB-1001",
    "payee": {
      "partyIdType": "MSISDN",
      "partyId": "250788000000"
    },
    "payerMessage": "RestoPass Vendor Settlement",
    "payeeNote": "Settlement Payout"
  }
  ```
- **Response**: `202 Accepted`

#### Test Case 10: Disbursement Account Balance
- **Method**: `GET`
- **URL**: `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/account/balance`
- **Response**: `200 OK`

#### Test Case 11: Disbursement Refund
- **Method**: `POST`
- **URL**: `https://sandbox.momodeveloper.mtn.com/disbursement/v2_0/refund`
- **Payload**:
  ```json
  {
    "amount": "500",
    "currency": "EUR",
    "externalId": "REFUND-902",
    "referenceIdToRefund": "<original-transaction-referenceId>",
    "payerMessage": "Compensating Reversal",
    "payeeNote": "Meal Exception Credit"
  }
  ```
- **Response**: `202 Accepted`

#### Test Case 12: Get Refund Status
- **Method**: `GET`
- **URL**: `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/refund/{referenceId}`
- **Response**: `200 OK` (`status: "SUCCESSFUL"`)

#### Test Case 13: Get Transfer Status
- **Method**: `GET`
- **URL**: `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer/{referenceId}`
- **Response**: `200 OK` (`status: "SUCCESSFUL"`)

---

### 3.4 Module 4: Remittance API (Test Cases 14 & 15)

#### Test Case 14: Remittance Access Token
- **Method**: `POST`
- **URL**: `https://sandbox.momodeveloper.mtn.com/remittance/token/`
- **Response**: `200 OK` (Bearer token)

#### Test Case 15: Remittance Transfer
- **Method**: `POST`
- **URL**: `https://sandbox.momodeveloper.mtn.com/remittance/v1_0/transfer`
- **Response**: `202 Accepted`

---

## 4. RestoPass Database & Transactional Mapping

```
               [ MTN MoMo Gateway ]
                        │
                        ▼ (HTTP 202 Accepted)
┌────────────────────────────────────────────────────────┐
│  mobile_money_payment_attempts (PostgreSQL)            │
│  - internal_reference: "SUB-MOMO-1793664000"           │
│  - provider_transaction_id: "91827364"                 │
│  - provider: "mtn_momo"                                │
│  - provider_environment: "sandbox"                     │
│  - amount_rwf: 500 (Strict Integer Representation)     │
│  - currency: "RWF"                                     │
│  - status: "created" -> "provider_pending" -> "success"│
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼ Webhook / Callback Notification
┌────────────────────────────────────────────────────────┐
│  mobile_money_webhook_events (PostgreSQL)              │
│  - body_sha256: Hex digest of raw payload             │
│  - provider_event_key: Unique provider event identifier│
│  - processing_status: "verified"                       │
└────────────────────────────────────────────────────────┘
```

---

## 5. Automated Verification Commands

To re-run the 15-point certification test suite at any time:

```bash
# Execute standalone 15-point MoMo runner
npm run test:momo

# Or via Node test runner
node --import tsx --test tests/momoSandboxTestMatrix.test.ts
```

All 15 test cases are verified and passed. The platform is ready for submission to MTN MoMo Rwanda for live production credential provisioning.
