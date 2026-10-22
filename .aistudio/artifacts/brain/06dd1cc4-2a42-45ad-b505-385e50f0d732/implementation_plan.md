# Implementation Plan: Secure Client-Side PIN Hashing, Comprehensive Translations & Cashier Shift Handover

## Overview
This plan establishes production-ready security, complete trilingual localization, and daily operational audit capabilities for RestoPass:
1. **Cryptographic Security Service**: Client-side Web Crypto API SHA-256 PIN and password hashing with per-entity salt and constant-time comparison (`timingSafeEqual`), integrated into `AuthPortalView` to enforce authentic role sessions.
2. **Complete Trilingual Localization (Kinyarwanda `rw` & French `fr`)**: Comprehensive dictionary coverage in `src/services/i18n.ts` ensuring 100% of text in all portals, modals, station management, and approval queues is translated cleanly.
3. **Cashier Shift Handover & Daily Reconciliation Audit**: Real restaurant operations feature enabling stand operators and cashiers to initiate shift start/end, record drawer cash, reconcile plates redeemed vs. recorded intake, log handover notes, and generate tamper-evident shift receipts.

---

## 1. Architectural Changes & Key Components

### A. Secure Client-Side PIN Hashing & Validation Service (`src/services/cryptoService.ts`)
- Implement `hashPinWithSalt(pin: string, salt: string): Promise<string>` using browser `window.crypto.subtle.digest('SHA-256', ...)`, with fallback to synchronous SHA-256 if running in restricted environments.
- Implement `verifyPinSecure(enteredPin: string, salt: string, expectedHash: string): Promise<boolean>` with constant-time byte/character comparison (`timingSafeEqual`) to prevent timing side-channel attacks.
- Implement `hashPasswordWithSalt(password: string, salt: string): Promise<string>` and `verifyPasswordSecure(...)`.
- Pre-compute default hashes for seed data (Customers PIN `1234`, Station Operators PIN `1234` / Password `EastHub#2026`, Boss `Boss#2026`, Super Admin `SuperAdmin#2026`) while ensuring plain-text fallback compatibility for existing sessions.

### B. Role-Specific Authentication Enforcement (`src/components/common/AuthPortalView.tsx`)
- Integrate asynchronous secure verification on form submission:
  - **Restaurant Boss**: Hashes entered password with restaurant code salt and verifies against stored boss credential hash.
  - **Stand Operator POS**: Hashes 4-digit PIN / password with station ID salt and verifies against operator credentials.
  - **Customer Meal Portal**: Hashes 4-digit PIN with member number salt and validates against `customer.pinHash`.
  - **Super Admin**: Hashes master password with system salt and verifies against super admin authority credential.
- Enforce brute-force rate-limiting (e.g., 5 failed attempts trigger a 30-second cooldown with visual countdown).
- Maintain 1-click Demo Quick Access for evaluation convenience, which uses the same cryptographic pipeline.

### C. Cashier Shift Handover & Daily Reconciliation (`src/components/scanner/ShiftHandoverModal.tsx` & `src/store/restoStore.ts`)
- Add `ShiftRecord` model to `src/types/index.ts`:
  - `id`, `stationId`, `stationName`, `operatorId`, `operatorName`, `startTime`, `endTime`, `openingCashRwf`, `closingCashRwf`, `expectedCashRwf`, `platesServed`, `cashDiscrepancyRwf`, `notes`, `status: 'open' | 'closed'`.
- Add store actions: `openShift()`, `closeShift()`, `getActiveShift()`, `getShiftHistory()`.
- Add **Shift Handover / Day Close** button in `ScannerView` and `RestaurantAdminView`:
  - Prompts closing cashier for counted cash, records variance (overage/shortage), signs off with PIN, and prints/exports shift summary.
  - Logs cryptographic audit entry visible in the Boss Security & Audit Trail.

### D. 100% Kinyarwanda & French Localization (`src/services/i18n.ts`)
- Expand `translations.en`, `translations.rw`, and `translations.fr` to comprehensively cover:
  - AuthPortalView (all validation hints, cooldown warnings, demo buttons, role descriptions).
  - Shift Handover & Daily Reconciliation (shift open/close, cash counted, variance, notes, handover receipts).
  - ManageCustomerModal (Danger zone, PIN reset, profile editing, card lock/reissue).
  - Boss Overview Queue & Approvals Manager (Mobile Money verification, grace plate warnings, rejection reasons).
  - Card Studio, Pricing & Bundles, Security Audit Logs.
- Eliminate hardcoded English strings across all view components, referencing `t.<namespace>.<key>`.

---

## 2. Verification & Testing Plan
1. **Cryptographic Validation**: Test `hashPinWithSalt` and `verifyPinSecure` with identical and mismatching inputs, verifying constant-time comparison passes correctly.
2. **Authentication Enforcement**: Test entering incorrect PIN/password (triggers error and audio alert), correct credentials (grants session), and rate-limiting lockout.
3. **Language Toggle**: Toggle between `EN`, `RW`, and `FR` on every screen (Scanner, Boss Overview, Approvals, Stations, Customer App, Super Admin) verifying all labels update instantly without untranslated remnants.
4. **Shift Handover Flow**: Open a shift, scan plates, record cash, close shift, verify variance calculation, and ensure shift audit record appears in the Boss security trail.
5. **Applet Compilation & Linting**: Run `lint_applet` and `compile_applet` to confirm zero TypeScript errors.
