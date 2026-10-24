# Customer 4-Digit PIN Security, Instant Off-Screen Auto-Lock, & PWA Home Screen Installation

A customer-first security and progressive web app upgrade for RestoPass. When students and patrons access their personal meal pass via the one-time WhatsApp magic invite link (no password needed), they are immediately prompted to establish their personal 4-digit security PIN. The dashboard automatically locks whenever the user turns off their phone screen, switches apps, or moves away from the tab, requiring instant PIN entry to re-open. In addition, the web portal is fully installable as an app pinned directly to the home screen with an in-app banner for Android and iOS Safari.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed based on your responses in Phase 1:

- **First-Arrival PIN Onboarding**: Immediately upon tapping the one-time WhatsApp magic invite link, customers are greeted with a dedicated modal to set their personal 4-digit security PIN before viewing their meal card balance and digital QR pass.
- **Strict Off-Screen Auto-Lock**: The portal locks immediately whenever the screen is turned off, the phone is locked, the tab loses visibility (`visibilitychange`), or the browser is minimized. When returning, a PIN unlock keypad is presented.
- **PWA Add to Home Screen**: A mobile-optimized top banner is mounted on the Customer Dashboard with a 1-tap "Install App" button for Android/Chromium and step-by-step guidance for iOS Safari ("Tap Share → Add to Home Screen").

---

## 1. Overview & Core Concept

1. **Passwordless Onboarding with Instant PIN Protection**:
   - Patrons join frictionlessly via a 1-tap WhatsApp magic link without remembering passwords or emails.
   - On first arrival (`!customer.hasCustomPin`), a setup modal prompts them to choose a 4-digit PIN with confirmation.
   - This PIN protects plate transfers, card lock/unlock, and balance inspection from peers borrowing their phone.

2. **Instant Off-Screen Auto-Lock Shield**:
   - When a student finishes ordering, locks their phone, or puts it in their pocket, the browser dashboard automatically enters a locked state.
   - When opened again, the dashboard displays a secure, tactile biometric-style PIN pad with masked dot indicators.
   - Entering the correct 4 digits immediately restores dashboard access without requiring a full re-login.

3. **Installable Web App (PWA) Pinned to Home**:
   - Web App Manifest configured with `display: 'standalone'`, brand theme colors, and home screen icons.
   - Dismissible top banner with an "Install App" action that triggers the browser's native installation prompt or iOS Safari guide.
   - Once pinned, RestoPass opens full-screen without browser address bars, looking and feeling like a native Android/iOS meal card app.

---

## 2. User Experience & Visual Design

### A. First-Time PIN Setup Modal
```
┌───────────────────────────────────────────────┐
│              [Shield Icon]                    │
│        Set Your 4-Digit Security PIN          │
│  Protect your meal card and plates on this    │
│  device. No password required.                │
│                                               │
│             [ • ] [ • ] [ • ] [ • ]           │
│                                               │
│             [ 1 ]   [ 2 ]   [ 3 ]             │
│             [ 4 ]   [ 5 ]   [ 6 ]             │
│             [ 7 ]   [ 8 ]   [ 9 ]             │
│                     [ 0 ]   [ ⌫ ]             │
│                                               │
│       [ Confirm PIN: • • • • ]                │
│       [ Save & Activate My Card ]             │
└───────────────────────────────────────────────┘
```
- Large, tactile 48px touch targets for digits.
- Visual feedback with animated pin dot indicators.
- Automatic focus, digit validation, and confirm-PIN matching.

### B. Instant Off-Screen Shield & Lock Screen
- Mounted as an overlay when `isLocked = true` on the Customer View.
- Triggers on:
  - `document.visibilitychange` (`document.visibilityState === 'hidden'`)
  - `window.blur` (user switches app, locks phone, or opens notification tray)
  - Manual "Lock Dashboard" button.
- Displays:
  - Cafeteria logo & name (e.g. *Kigali Campus Resto*).
  - Member name and masked number (`Jean-Paul Habimana · #28491`).
  - Tactile 4-digit numeric keypad with error shake animation on wrong PIN.
  - "Forgot PIN? Ask Cafeteria Boss or Stand Cashier" reassurance link.

### C. Add to Home Screen (PWA) Top Banner
- Located at the very top of the Customer View:
  - Clean card with mobile app icon, "Add RestoPass to Home Screen for 1-tap offline meal access".
  - Android / Chromium: Direct "Install App" button triggering `beforeinstallprompt`.
  - iOS Safari: "Install on iPhone" button opening a bottom modal with visual steps (Tap Share icon $\rightarrow$ "Add to Home Screen").
  - Hides automatically when running inside standalone mode (`display-mode: standalone`).

---

## 3. Key Product Decisions & Trade-Offs

- **Client Session Lock vs Server Session Invalidation**:
  - *Chosen Approach*: Instant local UI lock with 4-digit PIN verification against `customer.pinHash`.
  - *Why*: Allows instantaneous off-screen protection even when the phone has no internet connection in the cafeteria line.
- **Web App Manifest & Browser PWA Hook**:
  - *Chosen Approach*: Standard Web App Manifest (`manifest.json` / `manifest.webmanifest`) paired with a custom React install hook (`usePWAInstall`) and responsive banner.
  - *Why*: Works natively across all mobile browsers without external native app store friction.
- **PIN Recovery Mechanism**:
  - *Chosen Approach*: PIN reset delegation to the Restaurant Admin / Boss Approval Room or Stand Cashier.
  - *Why*: Prevents unauthenticated resets if someone finds a lost phone, ensuring student meal plate balances remain strictly secure.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Customer Portal Runtime                         │
└────────────────────────────────────────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌─────────────────────────────┐           ┌──────────────────────────────┐
│     PWA Installation        │           │    Customer PIN Security     │
│  - Web App Manifest         │           │  - Onboarding Setup Modal    │
│  - beforeinstallprompt hook │           │  - Off-screen auto-lock      │
│  - iOS Safari Action Guide  │           │  - 4-Digit Numeric Keypad    │
└─────────────────────────────┘           └──────────────────────────────┘
           │                                                 │
           ▼                                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    restoStore State & Customer Model                   │
│  - customer.pinHash (4-digit hash)                                     │
│  - customer.hasCustomPin (boolean)                                     │
│  - customer.pinSetAt (timestamp)                                       │
│  - setCustomerPin(customerId, pin)                                     │
│  - verifyCustomerPin(customerId, pin)                                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Component & State Changes:
1. **`src/types/index.ts`**:
   - Add `hasCustomPin?: boolean` and `pinSetAt?: string` to `Customer`.
2. **`src/store/restoStore.ts`**:
   - Add `setCustomerPin(customerId: string, pin: string): void`.
   - Add `verifyCustomerPin(customerId: string, pin: string): boolean`.
   - Update `registerCustomer` to initialize `hasCustomPin: false`.
3. **`src/components/customer/PinSetupModal.tsx`**:
   - Modal for setting 4-digit PIN on first visit, with keypad, confirmation step, and error handling.
4. **`src/components/customer/DashboardLockScreen.tsx`**:
   - Lock screen triggered when app goes off-screen, with 4-dot display, numeric keypad, and instant unlock.
5. **`src/components/customer/PWAInstallBanner.tsx` & `src/hooks/usePWAInstall.ts`**:
   - In-app install banner with iOS Safari sheet and Android prompt integration.
6. **`public/manifest.json` & `index.html`**:
   - Configure manifest icons, standalone display mode, theme colors, and Apple mobile web app tags.
