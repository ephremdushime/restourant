# Dedicated Boss Approvals Room, Strict Identity Uniqueness, & Multi-Tenant Hybrid Cloud Architecture

Transform RestoPass into an enterprise multi-tenant cafeteria management platform featuring a dedicated top-level **"Boss Approval Room"** (the killer selling point for cafeteria directors), **strict duplicate prevention** (ensuring no customer has multiple accounts per restaurant across phone or student ID), and **direct restaurant slug routing** for multi-restaurant hybrid cafeteria deployments.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed based on your clarifying answers and business requirements:

- **Dedicated Boss Approval Room**: Elevated to a first-class top-level navigation room (`#/boss-approvals`) with a live pending badge counter, grace plate alerts, and 1-tap WhatsApp digital pass dispatch.
- **Strict Identity Uniqueness**: Registration strictly prohibits duplicate phone numbers or student IDs within the same restaurant. When a cashier inputs an existing patron's phone or student ID, the system blocks the duplicate and renders a 1-click **"Open Existing Member & Top Up Plates"** button.
- **Multi-Tenant Hybrid Cloud Architecture**: Your central hosted cloud server supports multiple independent restaurants with distinct customer bases. Patrons access their personal passes via direct restaurant slug URLs (e.g. `#/customer?resto=RW01` or `#/portal/RW01`), automatically loading that cafeteria's branding, theme, and logo.

---

## 1. Overview & Core Concept

RestoPass operates across two interconnected tiers:
1. **On-Premises Local Edge Appliances (Cafeteria LAN)**: Laptops or mini-PCs in each restaurant's kitchen/office that serve dining stand scanners and reception desks over local Wi-Fi with sub-25ms tap latency, completely immune to internet outages.
2. **Central Multi-Tenant Cloud Server**: A master hosted cloud server serving many restaurants and thousands of students. Handles multi-branch routing, boss remote approvals, and customer web pass access.

### The 3 Core Pillars of This Update

1. **The "Boss Approval Room" (Killer Selling Point)**:
   - Separate, dedicated command room for the restaurant boss/executive director.
   - Cashiers provisionally register students and take Mobile Money payments at the stand; the student can immediately eat up to 3 grace plates while the deposit waits in the Boss Approval Room.
   - The boss reviews the MTN MoMo/Airtel SMS reference code, clicks **"Verify & Confirm"**, and instantly dispatches the tamper-evident WhatsApp 1-tap pass link to the student's phone.
2. **Strict Per-Restaurant Identity Protection**:
   - Zero duplicate accounts: A normalized phone number or student registration ID can only exist once per restaurant.
   - Prevents student fraud, confusion at the buffet line, and fragmented meal balances.
   - If an existing student is scanned or registered again, the UI immediately identifies the match and offers a 1-click top-up redirect.
3. **Multi-Tenant Restaurant Routing & Dynamic Branding**:
   - URL-driven restaurant context: Customers access their dining pass via `#/customer?resto=<code|slug>`.
   - Dynamic branding engine: Automatically injects the cafeteria's custom logo, name, welcome greeting, primary color, and plate pricing rules.
   - Hybrid Edge Synchronization Drawer & Console: Real-time visibility into local edge-to-cloud sync status across multiple restaurant partitions.

---

## 2. User Experience & Visual Design

### A. Navigation Structure & The "Boss Approval Room"

The top navigation is updated to provide 5 clear executive rooms:
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  [RestoPass Wordmark]   ·   Activities   ·   Boss Approvals [3]   ·   Users   ·   Appearance   ·   Pricing  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **"Boss Approvals" Room**:
  - Highlights in amber whenever cashier actions or Mobile Money deposits require executive verification.
  - Features high-density stat cards: **Total Pending RwF**, **Pending Patrons**, and **Grace Plates Currently Consumed at Stands**.
  - Interactive Mobile Money verification checklist with 1-click copy for reference codes (`*182#` or SMS verification).
  - Instant WhatsApp Dispatch modal with pre-filled Kinyarwanda/English greeting, member ID, and auto-login pass URL.

### B. Duplicate Prevention Flow in Registration
- Cashier enters student phone number (`+250 788 123 456`) or student ID (`2220050101`).
- Real-time client-side validator inspects the active restaurant's customer roster.
- If a match is detected:
  - Form border shifts to warm amber with an inline alert:
    `Patron already registered: Jean-Paul Habimana (#28491) with 34 plates.`
  - A prominent button appears: **"Top Up #28491 Instead"**, opening the top-up drawer directly with that customer pre-selected.
  - The submit button is disabled to guarantee zero duplicate accounts in the database.

### C. Multi-Tenant Restaurant Access & Dynamic Customer Pass
- When a customer opens their link (e.g., `#/customer?resto=RW01&auth=<token>` or `#/portal/RW01`):
  - The portal identifies the restaurant code `RW01`.
  - The page immediately applies `Kigali Campus Resto` branding: custom emerald theme, campus logo badge, tailored welcome banner, and active dining operating hours.
  - If a student visits multiple restaurants (e.g. university campus dining hall vs. evening downtown bistro), the customer portal includes a quick **"Switch Cafeteria"** selector showing their distinct passes.

---

## 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Rationale & Trade-Off |
| :--- | :--- | :--- |
| **Boss Approvals Room Placement** | Dedicated top-level navigation room (`#/boss-approvals`) | Maximizes visibility for cafeteria owners and highlights the delegation/control workflow as the product's primary selling proposition. |
| **Duplicate Identity Enforcement** | Strict block + 1-click Top-Up redirect | Completely eliminates duplicate student ledger entries and balance fragmentation while saving the cashier time with an instant redirect. |
| **Multi-Tenancy Partitioning** | Restaurant-scoped data partition with central cloud sync | Allows on-premises cafeteria laptops to operate offline with local data, while the cloud server aggregates all restaurants for centralized management and global student access. |
| **Customer Slug Routing** | URL hash parameter `?resto=<code>` & path aliases | Ensures students can bookmark their direct cafeteria link without needing a complex multi-step search or discovery step. |

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              CENTRAL HOSTED CLOUD SERVER                             │
│                  (Serves multiple restaurants, admin portals, & web passes)          │
│                                                                                      │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌──────────────────────────┐   │
│   │  Restaurant A (RW01) │   │  Restaurant B (RW02) │   │   Restaurant C (RW03)    │   │
│   │  - Customers & Cards│   │  - Customers & Cards│   │   - Customers & Cards    │   │
│   │  - Pricing & Rules  │   │  - Pricing & Rules  │   │   - Pricing & Rules      │   │
│   │  - Pending Approvals│   │  - Pending Approvals│   │   - Pending Approvals    │   │
│   └──────────▲──────────┘   └──────────▲──────────┘   └────────────▲─────────────┘   │
└──────────────┼─────────────────────────┼───────────────────────────┼─────────────────┘
               │ 2-Way Sync Heartbeat    │ 2-Way Sync Heartbeat      │ 2-Way Sync
               │ (Outbox Pattern)        │ (Outbox Pattern)          │
┌──────────────▼──────────┐   ┌──────────▼──────────┐   ┌────────────▼─────────────┐
│  RESTAURANT A EDGE NODE │   │  RESTAURANT B EDGE  │   │   RESTAURANT C EDGE      │
│  (Cafeteria LAN Server) │   │  (Cafeteria LAN)    │   │   (Cafeteria LAN)        │
│                         │   │                     │   │                          │
│  - Stand 1 Scanner      │   │  - Buffet Stand 1   │   │   - Stand 1 Scanner      │
│  - Stand 2 Scanner      │   │  - Cashier Desk     │   │   - Cashier Desk         │
│  - Local Database Cache │   │  - Local DB Cache   │   │   - Local DB Cache       │
└─────────────────────────┘   └─────────────────────┘   └──────────────────────────┘
```

### Data Model & Validation Rules

1. **Uniqueness Validation Method (`restoStore.ts`)**:
   ```typescript
   checkDuplicateIdentity(
     restaurantCode: string,
     phone: string,
     studentRegNumber?: string,
     excludeCustomerId?: string
   ): { isDuplicate: boolean; duplicateCustomer?: Customer; field?: 'phone' | 'student_id' }
   ```
   - Normalizes Rwandan phone numbers (`+250`, `078`, `073`, `072`, spaces, dashes).
   - Normalizes student registration numbers (case-insensitive trimming).
   - Scoped strictly per `restaurantCode` so a student can belong to multiple distinct restaurants without conflict.

2. **Boss Approval Room View (`src/components/restaurant/BossApprovalsRoomView.tsx`)**:
   - Elevated as a standalone dedicated view containing the full queue, grace meals counter, MoMo reference auditor, reject reason modal, and instant WhatsApp dispatch modal.

3. **Multi-Tenant URL Routing (`src/App.tsx`)**:
   - Parses `resto` parameter from URL hash (e.g., `#/customer?resto=RW02&auth=...`).
   - Dynamically initializes the target restaurant in `restoStore`, ensuring that the customer portal renders the correct cafeteria's branding and passes.

4. **Multi-Tenant Hybrid Edge Sync Console**:
   - Enhances the `SyncSimulationDrawer` to display multi-restaurant partitions, edge server connection status, and direct customer pass slug URLs.

---

## 5. Verification Plan

### Automated Verification
- Run `lint_applet` (`tsc --noEmit`) to verify zero TypeScript errors.
- Run `compile_applet` (`npm run build`) to ensure clean production compilation.

### Manual Feature Walkthrough
1. **Boss Approvals Room**:
   - Switch between top navbar rooms: verify "Boss Approvals" has its own dedicated room with real-time pending badges.
   - Verify Mobile Money deposit, check that grace plates are tracked, and confirm that the WhatsApp dispatch modal appears with pre-filled URL.
2. **Identity Uniqueness Test**:
   - Attempt to register a customer with an existing phone number (`+250 788 445 771`) or registration number (`2220028491`) in `RW01`.
   - Verify the registration form immediately blocks submission and renders the **"Open Existing Member & Top Up Plates"** button.
3. **Multi-Tenant Hybrid Routing Test**:
   - Navigate to `#/customer?resto=RW02` and observe that Mount Kigali University / Nyarugenge Bistro branding, theme colors, and customer passes load automatically.
   - Open the Hybrid Server drawer to verify multi-restaurant edge sync telemetry.
