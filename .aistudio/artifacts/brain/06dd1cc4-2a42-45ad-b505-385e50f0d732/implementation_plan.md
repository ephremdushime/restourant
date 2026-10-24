# Restaurant Admin Security Center & Cashier Session Management

A comprehensive implementation plan to add a dedicated **Security & Sessions** sub-tab to the Restaurant Admin portal. This feature provides real-time monitoring of all active cashier and scanner terminals on the local cafeteria network, an instant **"Revoke & Logout"** remote kill switch to terminate unauthorized or lost device sessions, and an administrative manager to create cashier/scanner accounts protected by an **8-digit numeric PIN** or password while upholding the 1:1 scan point subscription quota.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following specifications were confirmed based on your preferences:

- **Cashier Authentication Credentials**:
  - Cashier and scanner accounts can be protected by **either an 8-digit numeric PIN (e.g. `83920194`) or an alphanumeric password** (or both).
  - The creation modal allows the boss to toggle between "8-Digit Security PIN" and "Password" mode with real-time numeric validation (strictly 8 digits when PIN mode is selected).
- **Remote Revoke & Instant Terminal Lockout**:
  - When the boss clicks **"Revoke & Logout"** for an active session, the cashier device on the cafeteria floor is **immediately locked out**.
  - Local pairing tokens and session certificates in the terminal's browser storage are purged, rendering the `UnauthorizedTerminalShield` with an alert: *"Session Terminated by Restaurant Admin"*.
- **Active Session Visibility**:
  - Each active session row displays **Device Type** (Phone, Tablet, Laptop with USB Scanner), **Station Name**, **Assigned Cashier**, **Local Network IP Address** (e.g. `192.168.1.142`), and **Last Heartbeat** with a live pulsing indicator.

---

## 1. Overview & Core Concept

In a fast-paced campus cafeteria or dining hall, cashiers operate on tablets, phones, or counter laptops with handheld USB barcode scanners. If a cashier misplaces a tablet, leaves their shift without signing off, or an unauthorized terminal accesses the local Wi-Fi, the restaurant manager needs an immediate security overview and remote kill switch.

The **Security Center** equips the Restaurant Boss with:
1. **Live Cashier Session Registry**: Instant visibility into every active device connected to the restaurant's local server.
2. **One-Tap Remote Revocation ("Revoke & Logout")**: Remotely invalidates device tokens and forcibly logs out the terminal in real-time.
3. **Cashier Account Provisioning with 8-Digit PIN**: Seamless creation of staff accounts with 8-digit PINs, integrated with the 1:1 subscription quota check.

---

## 2. User Experience & Visual Design

### A. Navigation & Top-Level Tab
- A new top-level tab in **Restaurant Admin**: **"Security & Sessions"** (`activeSubTab === 'security'`), featuring a `ShieldAlert` icon and a live count badge showing currently active terminals (e.g. `2 Live`).

### B. Security Center Layout & Components
1. **Executive Security KPI Strip**:
   - **Active Cashier Terminals**: Number of devices actively connected (e.g., `2 Active`).
   - **Licensed Seats Used**: Quota meter showing used vs allowed scan points (e.g., `2 / 2 Licensed · Standard Plan`).
   - **Emergency Lockdown Button**: *"Revoke All Terminal Sessions"* (requires 2-step confirmation) in case of cafeteria network compromise.
2. **Active Cashier Sessions Table**:
   - **Device & Terminal**: Icon depicting device type (Smartphone, Tablet, Laptop with USB/BT scanner) + Station name (`Stand 1 - Main Buffet`).
   - **Cashier Operator**: Staff avatar, full name, username (`@keza_cashier`), and credential type (8-Digit PIN or Password).
   - **Network & IP**: Cafeteria local IP (`192.168.1.108`) + device user-agent summary.
   - **Session Uptime & Heartbeat**: Login timestamp + live relative heartbeat (`Active just now`, pulsing emerald indicator).
   - **Actions Column**: High-contrast, red-accented **"Revoke & Logout"** button.
3. **Create Cashier / Scanner Account Modal**:
   - Fields: Full Name, Staff Username, Branch Assignment, Assigned Scanning Station.
   - **Credential Protection Selector**:
     - Mode A: **8-Digit Security PIN** (numeric keypad input with 8 digit slots, auto-formatting, and mask/reveal toggle).
     - Mode B: **Alphanumeric Password** (traditional secure password with strength indicator).
   - Real-time Quota Validator: Warns if all licensed scan points are currently allocated.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual 8-Digit PIN & Password Support**:
  - *Approach*: Allow the restaurant boss to configure either an 8-digit PIN or a password when setting up cashier accounts.
  - *Why*: In busy cafeteria buffet lines, 8-digit numeric PINs are drastically faster to type on touchscreens and numeric keypads than complex alphanumeric passwords, while providing $10^8$ combination security (far superior to standard 4-digit PINs).
- **Decision 2: Immediate Local Storage Eviction on Revocation**:
  - *Approach*: Store the active `sessionToken` in memory/state and browser `localStorage`. When the boss revokes a session, `restoStore` flags the station session as `revoked`. On the scanner terminal, the next heartbeat check or scan event detects revocation, purges local certificates, and triggers the `UnauthorizedTerminalShield`.
  - *Why*: Eliminates stale zombie sessions without requiring a complete server restart.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram
```
┌────────────────────────────────────────────────────────────────────────┐
│                   RESTAURANT ADMIN SECURITY CONSOLE                    │
│   • Active Sessions Grid  • Remote Revoke Button  • 8-Digit PIN Setup  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         State / Event Dispatch
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CENTRAL RESTOSTORE STATE LAYER                       │
│                                                                        │
│  • cashierSessions: CashierSession[]                                   │
│  • stationUsers: StationUser[] (pin: 8 digits, passwordHash)          │
│  • getActiveCashierSessions(restaurantCode)                           │
│  • revokeCashierSession(sessionId, reason, actor)                     │
│  • addCashierAccount(data) [Enforces 1:1 Plan Quota]                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                     Live Heartbeat & Lockout Check
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CASHIER TERMINAL FLOOR INTERFACE                     │
│                                                                        │
│  [ Active Session ]                    [ Revoked Session ]             │
│  • Normal high-speed scanner           • Tokens wiped from storage     │
│  • Authenticated via 8-Digit PIN       • Renders Unauthorized Shield   │
│  • Sub-50ms offline plate deductions   • "Session Revoked by Boss"     │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model Additions (`src/types/index.ts`)
```typescript
export interface CashierSession {
  id: string; // sess_xxx
  restaurantCode: string;
  stationId: string;
  stationName: string;
  branchId?: string;
  branchName?: string;
  staffUserId: string;
  staffName: string;
  staffUsername: string;
  deviceType: 'phone' | 'tablet' | 'laptop_scanner' | 'pos_terminal';
  deviceModel: string;
  deviceFingerprint: string;
  ipAddress: string;
  sessionToken: string;
  startedAt: string;
  lastHeartbeat: string;
  status: 'active' | 'revoked' | 'closed';
  revokedAt?: string;
  revokedReason?: string;
}
```

### Store Method Implementations (`src/store/restoStore.ts`)
- `getActiveCashierSessions(restaurantCode?: string): CashierSession[]`
- `revokeCashierSession(sessionId: string, reason?: string, actorName?: string): boolean`
- `revokeAllCashierSessions(restaurantCode: string, reason?: string, actorName?: string): number`
- `createCashierAccount(data: { name: string; username: string; phone: string; stationId: string; branchId: string; authType: 'pin8' | 'password'; pin?: string; password?: string }): StationUser`

### UI Components to Build
1. **`src/components/restaurant/RestaurantSecurityCenter.tsx`**:
   - Executive session overview, live terminal table with device types, IPs, and "Revoke & Logout" buttons.
   - Quick "Create Cashier Account" modal with 8-digit PIN or password setup.
2. **`RestaurantAdminView.tsx` Navigation Integration**:
   - Mount new `Security & Sessions` sub-tab in primary navigation.
3. **`ScannerView.tsx` Live Revocation Listener**:
   - Detects remote revocation and instantly transitions to `UnauthorizedTerminalShield`.
