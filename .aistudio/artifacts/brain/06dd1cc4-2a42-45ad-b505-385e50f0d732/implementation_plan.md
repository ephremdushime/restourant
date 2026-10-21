# RestoPass Enterprise Deployment, Multilingual Localization & Password Security Plan

Architectural blueprint for production-readiness: full Kinyarwanda and French localization across all system views, unified multi-portal deployment architecture with role-specific password and PIN authentication, and prominent real-time pending approvals visibility across executive overview and queue dashboards.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The user confirmed the following architectural decisions in Phase 1:
> 1. **Portal Deployment Architecture**: Unified application with distinct routes and role-based login (`/scanner`, `/admin`, `/customer`, `/superadmin`), plus an executive role portal switcher and landing portal.
> 2. **Authentication & Password Protection**: Role-specific password and PIN login screens with secure persistent sessions:
>    - **Super Admin**: Master executive password authentication.
>    - **Restaurant Admin / Boss**: Restaurant-specific manager credentials with strong password protection.
>    - **Station Operators / Cashiers**: Operator username + password, with quick 4-digit numeric PIN for tablet unlocking between meal shifts.
>    - **Customer Web App**: Phone number + 4-digit patron security PIN for personal meal balance and transfer access.
> 3. **Pending Approvals Visibility**: Displayed prominently **both** on the main Restaurant Admin Overview dashboard (via an executive alert banner & quick-action cards) **and** within the dedicated Pending Approvals tab, ensuring the boss never misses unconfirmed Mobile Money deposits or grace meal allowances.

---

## 1. Overview & Core Concept

RestoPass is a mission-critical, offline-first prepaid meal balance operating system built for cafeteria operations, university dining halls, and multi-branch commercial restaurants in Rwanda. 

This phase brings the platform to full commercial deployment readiness:
* **True Multilingual Parity (EN / RW / FR)**: Complete Kinyarwanda (*Ikinyarwanda cyuzuye*) and French localization covering all interface copy, approval dialogues, POS scanner prompts, branch management controls, audit events, and monthly financial metrics.
* **Role-Based Password & PIN Security Walls**: Every side of the system (Super Admin, Restaurant Boss, Stand Scanner, Customer) is guarded by dedicated authentication screens, session state persistence, and logout affordances, preventing unauthorized access on shared cafeteria tablets or office desktops.
* **Prominent Executive Pending Approvals**: The restaurant boss immediately sees pending provisional registrations and top-ups right on the primary Overview dashboard upon login, complete with Mobile Money reference verification, grace plates consumed tracker (up to 3 meals), and one-click confirmation or rejection.
* **Unified Single-Origin Deployment**: Clean route-based portal structure allowing single-domain hosting on cloud containers or on-premise local cafeteria servers with distinct access paths.

---

## 2. User Experience & Visual Design

### A. Key User Flows

1. **Authentication & Session Routing**:
   - Accessing `/admin` prompts the Restaurant Boss login screen (Restaurant Code selection + Manager Password).
   - Accessing `/scanner` prompts the Stand Operator authentication (Operator username + 4-digit Station PIN or shift password).
   - Accessing `/customer` prompts Patron Onboarding / Login (Phone number + 4-digit PIN).
   - Accessing `/superadmin` prompts Authority Super Admin login (Super Admin Password).
   - Authenticated sessions are preserved in session storage with a quick "Lock / Switch Account" button in the navigation bar.

2. **Boss Overview & Pending Approvals Visibility**:
   - When the boss logs into `/admin`, the top of the Overview dashboard displays an **Action Required: Pending Approvals Banner** if any unverified registrations or top-ups exist.
   - Shows patron photo, requested plates, total RWF, Mobile Money transaction reference (with one-click copy), registering station operator, and **Grace Meals Consumed (e.g., "1 of 3 meals eaten")**.
   - Boss can click "Verify & Approve" or "Reject" directly from the Overview card, or click "View All Pending Requests" to jump into the dedicated queue.

3. **Multilingual Language Switching**:
   - The top navigation bar features a clean three-way language segmented control (`EN` · `RW` · `FR`).
   - Toggling language immediately updates all system terminology, buttons, table headers, validation errors, and currency formats without page reload.

### B. Visual Identity & Theme Discipline (Anti-Slop Compliance)

* **60-30-10 Palette**:
  - 60% Canvas: Slate-950 deep canvas (`#020617` / `#0f172a`) in dark mode; crisp slate-50 in light mode.
  - 30% Structural Surfaces: Slate-900 panels with 1px hairline borders (`border-slate-800`), no gratuitous card-in-card nesting.
  - 10% Accents: Purposeful Emerald-500 (`#10b981`) for approved balances and primary actions, Amber-500 (`#f59e0b`) for pending Mobile Money review, and Rose-500 (`#ef4444`) for security alerts and blocked scans.
* **Zero-Pill Discipline**:
  - Metadata (timestamps, member numbers, branch names, meal counts) rendered as unboxed text separated by typographic middots (`·`).
  - Status indicators use clean text labels paired with subtle semantic colors, avoiding candy pill capsules.
* **Typography & Tabular Numerals**:
  - Display and primary body: Plus Jakarta Sans / Outfit for crisp legibility.
  - Financial amounts, timestamps, plate balances, and PINs: Monospace tabular numerals (`font-mono tabular-nums`).

---

## 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Rationale & Trade-Offs |
| :--- | :--- | :--- |
| **Portal Deployment Architecture** | Unified Vite SPA with Hash/Path Routing (`/admin`, `/scanner`, `/customer`, `/superadmin`) | Avoids complex multi-repository or 4-domain DNS setups; a single build artifact can be deployed to Cloud Run, Vercel, or local cafeteria servers while keeping role boundaries cleanly separated. |
| **Authentication Strategy** | Local encrypted credential verification + Session Token storage | Zero-latency login even when cafeteria internet drops; compatible with local offline synchronization and biometric/PIN station unlocking. |
| **i18n Translation Architecture** | Centralized typed dictionary with reactive store subscription | Guarantees instant client-side switching between English, Kinyarwanda, and French without network requests or layout breaks. |
| **Pending Approvals Placement** | Dual display: High-priority card stack on Overview + Full filtered queue tab | Prevents the boss from missing urgent payments while reviewing daily sales, but maintains a full audit history view for bookkeeping. |

---

## 4. Technical Architecture & Data Strategy

### System Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RestoPass Unified Application                   │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │        Top Bar: Language (EN/RW/FR) · Theme · Auth Status      │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                   │                                    │
│                 Route / Role Authentication Gate                       │
│                                   ▼                                    │
│    ┌──────────────┬──────────────┬──────────────┬──────────────┐       │
│    │  /scanner    │    /admin    │  /customer   │ /superadmin  │       │
│    │  (POS Stand) │  (Boss Desk) │ (Patron Web) │ (Platform)   │       │
│    └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘       │
│           │              │              │              │               │
│           ▼              ▼              ▼              ▼               │
│    ┌──────────────┬──────────────┬──────────────┬──────────────┐       │
│    │ Stand Login  │  Boss Login  │ Patron Login │ Master Login │       │
│    │ (PIN/Pass)   │ (Password)   │ (Phone+PIN)  │ (Password)   │       │
│    └──────────────┴──────────────┴──────────────┴──────────────┘       │
│                                   │                                    │
│                                   ▼                                    │
│    ┌───────────────────────────────────────────────────────────┐       │
│    │                  Authenticated Views                      │       │
│    │  - ScannerView (3-limit, anti-passback, provisional modal)│       │
│    │  - RestaurantAdminView:                                   │       │
│    │      ├─ Overview: Monthly Reconciliation + Pending Queue  │       │
│    │      ├─ Approvals: Mobile Money Verification & Grace Calc │       │
│    │      ├─ Branches & Stations: Operator Security & PIN Reset│       │
│    │      ├─ Security & Logs: Forensic Audit Trail with Actors │       │
│    │      └─ Pricing Trends: Recharts Elasticity Dashboard     │       │
│    │  - CustomerView (Rotating QR, Balance, P2P Transfers)     │       │
│    │  - SuperAdminView (License Generation & System Governance)│       │
│    └───────────────────────────────────────────────────────────┘       │
│                                   │                                    │
│                                   ▼                                    │
│    ┌───────────────────────────────────────────────────────────┐       │
│    │       Central RestoStore & Local-First Synchronizer       │       │
│    │  - state.pendingApprovals (Recharges & New Registrations) │       │
│    │  - state.branches & state.stationUsers (Role Security)    │       │
│    │  - state.auditLogs (Immutable Timestamped Event History)  │       │
│    │  - translations: en, rw, fr (Full Multilingual Parity)    │       │
│    └───────────────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Detailed Implementation Work Packages

### Package A: Complete Multilingual Dictionary (EN / RW / FR)
* Expand `src/services/i18n.ts` with complete, culturally natural translations for Kinyarwanda and French across:
  * **Approvals & Mobile Money**: Pending verification, Mobile Money reference, grace plates consumed, approve deposit, reject invalid payment.
  * **Branches & Station Users**: Branch management, operator accounts, credentials reset, block/unblock access.
  * **Security & Audit Logs**: Forensic audit trail, timestamp, actor role attribution, card reissuance.
  * **Scanner 3-Limit Rules**: 2-hour meal window warnings, consecutive tap anti-passback block, provisional grace notices.
  * **Financial Reconciliation**: Monthly prepaid plates and cash, dining consumed, outstanding liabilities.

### Package B: Role-Specific Password & PIN Authentication
* Implement authenticated session state in `src/store/restoStore.ts` (`currentSession`: role, operatorId, timestamp, isAuthenticated).
* Build dedicated login views:
  * **Restaurant Boss Login**: Secure password gate for restaurant admin.
  * **Station Operator Login**: Station selection + username + password/PIN for cafeteria tablets.
  * **Customer Portal Login**: Phone number + 4-digit PIN for patron account.
  * **Super Admin Login**: Master authority password for platform management.
* Add lock/switch portal button in the header for smooth role switching in testing and deployment.

### Package C: Executive Overview Pending Approvals Banner
* In `RestaurantAdminView.tsx` (`activeSubTab === 'dashboard'`), render an immediate high-priority **Pending Approvals Action Card**:
  * Displays active pending registrations/top-ups directly on the Overview.
  * One-click "Confirm & Approve" directly from the overview or quick navigation to the detailed queue.
  * Shows grace plates consumed counter (e.g. `1/3` grace plates used).
  * Direct deep-link to the full approvals management tab.

### Package D: Deployment & Route Configuration
* Configure clean route detection and URL hash/path support so that direct links `/scanner`, `/admin`, `/customer`, and `/superadmin` immediately route and prompt the appropriate portal login.
* Provide production build verification via `compile_applet` and `lint_applet`.
