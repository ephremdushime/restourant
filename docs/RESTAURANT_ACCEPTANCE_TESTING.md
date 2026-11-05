# RestoPass Operational Acceptance Testing (OAT) Protocol
**Phase 5 Pre-Deployment Acceptance Manual & Field Verification Runbook**  
**Target Roles**: Restaurant General Manager, Cashiers, Buffet Stand Scanners, Dining Hall Director  
**Environment**: Staging Host (`https://staging.restopass.rw`) or Air-Gapped Dedicated Pilot  
**Authoritative Backend**: PostgreSQL 16 Relational Engine + Redis 7  

---

## 1. Scope, Purpose & Release Gate Rules

This document outlines the mandatory operational test procedures to be performed by restaurant personnel on physical scanning hardware, cash registers, PVC/thermal card printers, and mobile devices before commercial sign-off.

> [!CRITICAL]
> **Production Launch Policy**:
> 1. **Automated CI Passing != Production Approval**. CI verifies code builds; this protocol verifies physical human and hardware operations.
> 2. **Cloud Authority Rule**: Scanner devices must **never** deduct plate balances or report successful redemption without explicit real-time confirmation from the cloud backend.
> 3. **Disabled Launch Flags**: Mobile Money checkout, customer-to-customer plate transfers, and supervisor overrides must remain disabled (`false`) during the pilot unless explicitly authorized for staging drill testing.
> 4. **Scanner Undo Strictly Prohibited**: Cashiers and scanners cannot arbitrarily reverse scans. All erroneous meal transactions must be processed via the audited, two-person **Financial Exception Workflow**.

---

## 2. Equipment, Hardware & Environment Checklist

Before beginning the acceptance tests, confirm the following hardware is staged at the pilot dining facility:

| Item | Hardware Specification | Purpose | Staged Status |
| :--- | :--- | :--- | :--- |
| **Manager Station** | Laptop / PC running Chrome/Edge (v120+) | Approvals, top-up recording, exception approvals, daily reconciliation | [ ] Ready |
| **Cashier Terminal** | Tablet / Laptop + Receipt Printer | Student registration, card printing, manual top-up issuance | [ ] Ready |
| **Scanner Station 1** | Android Tablet / Smartphone (Chrome v120+) with camera | Buffet line meal redemption point 1 | [ ] Ready |
| **Scanner Station 2** | Android Tablet / Smartphone (Chrome v120+) with camera | Buffet line meal redemption point 2 (for concurrency testing) | [ ] Ready |
| **Test Cards** | Printed PVC / Thermal cards with test student QR codes | Physical credential verification | [ ] Ready |
| **Network Controls** | Wi-Fi router with togglable WAN connection | Offline and network degradation drills | [ ] Ready |

---

## 3. Operational Acceptance Test Scenarios

### Scenario 1: Student Self-Registration, Photo Submission & Manager Approval Gate

**Objective**: Verify that students can register from their phones, but cannot redeem meals or access balances until physically verified and approved by the restaurant manager.

1. **Student Self-Registration**:
   - Student navigates to `https://staging.restopass.rw/#register`.
   - Student enters Full Name, National ID / Student ID, Phone Number (`+250 788 111 222`), requested plates (e.g., 30 plates), and uploads a clear headshot photo.
   - Submits registration.
   - **Expected Result**: System confirms: *"Registration submitted. Pending manager approval."* Account status is `pending_approval`. No balance is active.
2. **Manager Approval Verification**:
   - Manager logs into the Manager Portal at `https://staging.restopass.rw/#boss`.
   - Navigates to **Pending Approvals**.
   - Inspects student photo, ID number, and requested plate count.
   - Manager clicks **Approve Registration**.
   - **Expected Result**:
     - Status updates to `approved`.
     - Initial balance reflects approved plates in PostgreSQL ledger.
     - Card ready for print indicator lights up.
     - Student is now eligible for first-time PIN setup.

---

### Scenario 2: Cashier Top-Up Recording & Financial Cash Reconciliation

**Objective**: Verify manual top-up recording with immutable ledger entries, ensuring payment method records match physical cash without automated MoMo execution.

1. **Top-Up Submission**:
   - Cashier accesses **Top-Up Desk** at `https://staging.restopass.rw/#cashier`.
   - Searches approved student by Member No. or Phone.
   - Enters 60 plates (66,000 RWF).
   - Selects Payment Method: `Cash` (or `Bank Transfer Voucher`).
   - Enters Physical Receipt / Voucher Reference: `CASH-REC-2026-001`.
   - Submits top-up request.
2. **Manager Verification**:
   - Manager reviews top-up queue and confirms cash receipt matches.
   - Approves top-up in **Pending Approvals**.
   - **Expected Result**:
     - Student balance increases by 60 plates in real time.
     - An immutable positive delta (`plates_delta = +60`) is committed to `ledger_entries`.
     - Student SMS/Dashboard reflects updated balance.
3. **MoMo Gating Check**:
   - Student opens Customer Portal and selects "Pay with MTN Mobile Money".
   - **Expected Result**: Portal displays *"Mobile Money checkout is currently undergoing provider certification. Please pay at the cashier counter."* No unverified balance credits occur.

---

### Scenario 3: Physical Card Issuance & Card Printing Studio

**Objective**: Verify that printed QR cards encode tamper-proof cryptographic signatures and display correct student credentials.

1. **Print Queue Inspection**:
   - Cashier opens **Card Print Studio** on the reception terminal.
   - Newly approved student appears in **Ready to Print** queue with headshot photo, Member No., and name.
2. **Card Layout & Preview**:
   - Cashier clicks **Preview Card**.
   - Verify Front: Student photo, Full Name, Member ID, Restaurant branding logo, dynamic QR code (`c1.RW01.<memberNo>.1.<mac>`).
   - Verify Back: Dining hall rules, hotline number, expiry indicator.
3. **Print Execution & Queue State**:
   - Cashier clicks **Print Card / Mark Printed**.
   - Card is sent to printer; student is marked as `printed`.
   - Student disappears from "Ready to Print" list to prevent duplicate card printing.

---

### Scenario 4: Scanner Hardware Pairing & Staff Authentication

**Objective**: Enforce strict hardware identity binding so unauthorized devices cannot scan cards, and staff accounts are bound to individual stations.

1. **Station Pairing**:
   - Manager opens **Scan Points & Hardware** in Manager Portal.
   - Selects **Buffet Stand 1** and clicks **Generate Pairing Token**.
   - System displays 6-digit one-time pairing key (valid for 10 minutes).
   - Scanner device opens `https://staging.restopass.rw/#scanner`.
   - Inputs pairing token and station identifier.
   - **Expected Result**: Scanner tablet binds to Stand 1 with stored device fingerprint; green badge: *"Station Paired: Stand 1"*.
2. **Staff Login & Station Assignment**:
   - Staff member inputs individual staff username (`staff_jean`) and PIN (`1234`).
   - System verifies staff is assigned to Stand 1.
   - **Expected Result**: Session authenticated; scanner camera activates.
3. **Unpaired Device Rejection**:
   - An unauthenticated device attempts to call `POST /api/scans/consume`.
   - **Expected Result**: Immediate HTTP 403: *"Scanner station is not paired or active for this restaurant."*

---

### Scenario 5: Multi-Station Concurrency & Race Condition Validation

**Objective**: Verify that when two stations scan the same customer at the exact same fraction of a second, double-spending is strictly prevented by PostgreSQL row locks.

1. **Setup**:
   - Student has an exact remaining balance of **1 plate**.
   - Scanner 1 is positioned at Stand 1. Scanner 2 is positioned at Stand 2.
2. **Simultaneous Scan Execution**:
   - At the signal "GO", both scanners simultaneously scan the customer's physical card.
3. **Expected Outcomes**:
   - **Scanner 1**:
     - Screen turns **GREEN**.
     - Plays **Sound 1 (Success chime)**.
     - Displays: *"Meal Accepted: 1 plate deducted. Remaining balance: 0 plates."*
   - **Scanner 2**:
     - Screen turns **RED**.
     - Plays **Sound 2 (Rejection buzzer)**.
     - Displays: *"Rejected: Insufficient balance (0 plates remaining)."*
   - **PostgreSQL Ledger Audit**:
     - Querying `ledger_entries` confirms exactly **one** deduction row (`plates_delta = -1`).
     - Customer ending balance is **0**, never negative (-1).

---

### Scenario 6: Dynamic QR Replay Protection & Card Counterfeit Defense

**Objective**: Verify single-use replay protection for digital app QR codes and counterfeit rejection for forged physical cards.

1. **Digital QR Replay Test**:
   - Student opens student dashboard on phone and displays the dynamic QR code (`v1...`).
   - Scanner scans the dynamic QR.
   - **Result**: **ACCEPTED** (Sound 1 chime).
   - Scanner immediately scans the same phone screen again (or a screenshot taken 5 seconds earlier).
   - **Expected Result**: **REJECTED** (Sound 2 buzzer). Message: *"This digital QR has already been used (Single-use violation)."* No balance deducted.
2. **Counterfeit / Manipulated Card Signature Test**:
   - Present a QR code with an altered member number or invalid MAC: `c1.RW01.99999.1.invalid_signature`.
   - **Expected Result**: **REJECTED** (Sound 2 buzzer). Message: *"Invalid card signature or counterfeit token."*

---

### Scenario 7: Serving Window Limits, Consecutive Scan Guards & Zero Balance

**Objective**: Verify operational dining rules that prevent card sharing and multiple meal collection within a single serving window.

1. **Consecutive Double-Tap Guard**:
   - Customer A scans physical card -> **ACCEPTED** (Balance: 9 plates).
   - Customer A immediately taps card a second time within 5 seconds.
   - **Expected Result**: **REJECTED** with Sound 2 buzzer: *"Too many successive taps — scan another customer first."* Prevents cashier double-tapping error.
2. **Serving Window Plate Cap (3 Meals in 2 Hours)**:
   - Customer A collects Meal 1, then Customer B scans.
   - Customer A collects Meal 2, then Customer B scans.
   - Customer A collects Meal 3, then Customer B scans.
   - Customer A attempts to collect Meal 4 within the same 120-minute window.
   - **Expected Result**: **REJECTED** with Sound 2 buzzer: *"Meal limit reached — maximum 3 meals in 2 hours."*
3. **Zero Balance With No Grace Meals**:
   - Customer with 0 plates and 0 pending payments scans card.
   - **Expected Result**: **REJECTED** with Sound 2 buzzer: *"No approved meal balance. Please top up."* Screen turns bright RED.

---

### Scenario 8: Scanner Display Patron Photo Match Verification

**Objective**: Verify that upon scanning a card, the scanner displays the student's authoritative photo for 5 seconds to prevent card passing between students.

1. **Scan Execution**:
   - Student presents card to scanner.
2. **Scanner Visual Display**:
   - Scanner UI flashes green and displays full-screen verification card:
     - Clear photo of the registered student.
     - Student Full Name and Member No.
     - Meal plate deduction (-1) and new balance.
     - Two buttons: `[Match]` and `[Mismatch]`.
3. **Staff Action**:
   - Staff confirms the student standing in line matches the displayed photo.
   - Clicks `Match` (or allows 5s auto-dismiss). Tray passes.
   - If photo does not match, staff clicks `Mismatch` -> Scan is flagged in audit logs and student is directed to reception desk.

---

### Scenario 9: Audited Two-Person Financial Exception Workflow (Replacing Scanner Undo)

**Objective**: Verify that erroneous deductions cannot be undone at the scanner station, but must follow an audited two-person reversal workflow.

1. **Scanner Station Constraint**:
   - Confirm that the scanner station UI has **NO active "Undo" button** in production mode.
2. **Filing Exception Request**:
   - Restaurant Administrator opens **Financial Exceptions** at `https://staging.restopass.rw/#exceptions`.
   - Selects **Request Scan Reversal**.
   - Enters Scan Event ID, Customer Member No., and detailed reason: *"Student scanned at Stand 1 but tray dropped and student left without food."*
   - Submits request.
   - **Status**: `pending_approval`. Balance is **not** altered yet.
3. **Independent Super-Admin Co-Sign**:
   - Super Administrator logs in with separate credentials.
   - Reviews exception request and audit trail.
   - Enters approval justification and approves.
   - **Expected Result**:
     - Compensating ledger entry created (`plates_delta = +1`, type `correction_credit`).
     - Customer plate balance restored by 1.
     - Immutable audit record stored with both requester and approver IDs.

---

### Scenario 10: Network Outage & Backend Interruption Drills

**Objective**: Prove that the application strictly adheres to the **Cloud Authority Rule** during network cuts, PostgreSQL stops, and Redis outages.

#### Drill 10A: Scanner Wi-Fi / Cellular Network Cut
1. On Scanner Tablet 1, turn OFF Wi-Fi and Cellular data (Airplane Mode).
2. Present a valid customer card to the scanner.
3. **Expected Result**:
   - Scanner UI displays yellow/red offline banner: *"Network Disconnected. Cloud authority unreachable."*
   - Scanner **REFUSES** redemption.
   - **NO** sound 1 chime plays.
   - **NO** meal is deducted.
   - Turn Wi-Fi back ON. Scanner reconnects. Verify balance on backend is completely untouched.

#### Drill 10B: PostgreSQL Service Interruption
1. On staging server, temporarily stop PostgreSQL container: `docker compose -f deploy/docker-compose.prod.yml stop postgres`.
2. Scanner attempts meal scan.
3. **Expected Result**:
   - Server returns HTTP 503: *"Authoritative scanning requires the production database."*
   - Scanner shows red error screen: *"Service temporarily unavailable."*
   - No data corruption occurs.
4. Restart PostgreSQL: `docker compose -f deploy/docker-compose.prod.yml start postgres`.
5. Verify `/api/health/ready` returns HTTP 200 and scanning resumes normally.

#### Drill 10C: Redis Cache Interruption
1. On staging server, temporarily stop Redis: `docker compose -f deploy/docker-compose.prod.yml stop redis`.
2. Scanner attempts digital QR scan.
3. **Expected Result**:
   - Server returns HTTP 503: *"Session security and replay guards temporarily unavailable."*
   - Scanner blocks redemption to prevent replay fraud.
4. Restart Redis: `docker compose -f deploy/docker-compose.prod.yml start redis`.

---

### Scenario 11: End-of-Day Shift Reconciliation & Sign-Off Sheet

**Objective**: Ensure that at the close of meal service, physical plates served, cashier cash collected, and cloud database records reconcile to the single plate.

1. **Reconciliation Steps**:
   - Cashier exports **Shift Summary**: Total cash collected, manual vouchers issued.
   - Scanner exports **Station Scan Log**: Total meals scanned at Stand 1 and Stand 2.
   - Restaurant Manager opens **Daily Financial Report**: Total plates deducted, total top-ups approved.
2. **Reconciliation Formula**:
   $$\text{Starting Balances} + \text{Approved Top-ups} - \text{Total Scans} \pm \text{Audited Exceptions} = \text{Ending Balances}$$
3. **Sign-Off Protocol**:
   - Discrepancy threshold: **0 plates**. If any discrepancy exists, the audit log must isolate the exact transaction ID.

---

## 4. Restaurant Acceptance Sign-Off Rubric

| Acceptance Criterion | Verification Method | Result | Tested By | Date |
| :--- | :--- | :--- | :--- | :--- |
| **1. Registration & Approval** | Self-registration -> Manager approval unlocks card print | [ ] PASS / [ ] FAIL | | |
| **2. Cashier Top-Up** | Cash top-up recorded; MoMo gated until provider onboarding | [ ] PASS / [ ] FAIL | | |
| **3. Card Print Studio** | Headshot, member ID, QR signature rendered cleanly | [ ] PASS / [ ] FAIL | | |
| **4. Hardware Pairing** | Station token binding; unassigned staff rejected with 403 | [ ] PASS / [ ] FAIL | | |
| **5. Concurrency Race** | 2 stations scan 1 balance simultaneously; exactly 1 succeeds | [ ] PASS / [ ] FAIL | | |
| **6. Replay & Counterfeit** | Replayed digital QR and forged signatures rejected | [ ] PASS / [ ] FAIL | | |
| **7. Dining Window Limits** | Consecutive tap guard and 3 meal / 2 hr cap enforced | [ ] PASS / [ ] FAIL | | |
| **8. Photo Verification** | Student photo displayed on scanner for visual match | [ ] PASS / [ ] FAIL | | |
| **9. Audited Exceptions** | No scanner undo; two-person audited compensating reversal | [ ] PASS / [ ] FAIL | | |
| **10. Network Failure Drill** | Scanners refuse redemption when offline; no silent deductions | [ ] PASS / [ ] FAIL | | |
| **11. Shift Reconciliation** | Cash, plate deductions, and PostgreSQL ledger balance to 0 | [ ] PASS / [ ] FAIL | | |

---

## 5. Formal Operational Certification

I hereby certify that the RestoPass Operating System has been operated on physical dining hall hardware and successfully satisfied all operational acceptance criteria above.

**Restaurant General Manager**: ___________________________  Date: ______________  
**Campus Dining Hall Supervisor**: ________________________  Date: ______________  
**Lead Systems Engineer**: ________________________________  Date: ______________  

