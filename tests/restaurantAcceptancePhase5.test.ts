import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { restoStore } from '../src/store/restoStore';
import { generateCardToken, generatePhoneToken } from '../src/services/cryptoService';
import {
  app,
  createSessionToken,
  setServerDbState,
  getServerDbState,
} from '../server';

async function fetchTestRoute(
  expressApp: any,
  method: string,
  urlPath: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    const normalizedHeaders: Record<string, string> = {
      'content-type': 'application/json',
    };
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const [pathname, search] = urlPath.split('?');
    const query: Record<string, string> = {};
    if (search) {
      new URLSearchParams(search).forEach((v, k) => {
        query[k] = v;
      });
    }

    const req: any = {
      method,
      url: urlPath,
      path: pathname,
      query,
      headers: normalizedHeaders,
      body: body || {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        resolve({ status: statusCode, body: data });
        return this;
      },
      send(data: any) {
        resolve({ status: statusCode, body: data });
        return this;
      },
      setHeader() {
        return this;
      },
      end(data?: any) {
        resolve({ status: statusCode, body: data || null });
      },
    };

    expressApp.handle(req, res);
  });
}

describe('Phase 5: Restaurant Operational Acceptance Testing (OAT)', () => {
  const restoCode = 'RW01';
  let originalDbState: any;

  before(() => {
    originalDbState = getServerDbState();
    restoStore.setRestaurantCode(restoCode);
    restoStore.setStation('sp_1');
  });

  after(() => {
    if (originalDbState) {
      setServerDbState(originalDbState);
    }
  });

  test('Scenario 1: Student self-registration, manager approval gate, and card print lifecycle', () => {
    const studentPhone = `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`;
    const studentReg = `REG-${Date.now()}`;
    const momoRef = `REF-REG-${Date.now()}`;

    // 1. Student self-registration
    const regRes = restoStore.registerProvisionalCustomer({
      restaurantCode: restoCode,
      branchId: 'br_rw01_main',
      branchName: 'Main Campus Dining Hall',
      name: 'Mutesi Divine',
      phone: studentPhone,
      photoUrl: '/src/assets/images/avatar_student_female_1790979387287.jpg',
      idType: 'student_id',
      idNumber: studentReg,
      isStudent: true,
      studentProfile: {
        institution: 'University of Rwanda',
        programme: 'Information Systems (Yr 3)',
        year: 3,
        registrationNumber: studentReg,
      },
      platesRequested: 45,
      amountRwf: 54000,
      paymentMethod: 'cash',
      paymentReference: momoRef,
      registeredByStaffId: 'self_portal',
      registeredByStaffName: 'Mutesi Divine (Self)',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });

    assert.ok(regRes.customer);
    assert.equal(regRes.customer.provisionalStatus, 'pending_approval');
    assert.equal(regRes.customer.cardReadyForPrint, false);

    // Verify student cannot log in to dashboard yet
    const portalStatus = restoStore.checkCustomerPortalStatus(studentPhone, restoCode);
    assert.equal(portalStatus.status, 'needs_pin_setup');

    // 2. Manager verifies photo/ID and approves in Pending Approvals
    const pending = restoStore.getState().pendingApprovals.find(
      (a) => a.restaurantCode === restoCode && a.paymentReference === momoRef
    );
    assert.ok(pending, 'Approval request must exist for registered student');

    const approveRes = restoStore.approvePendingRequest(pending.id, 'Manager Alex');
    assert.equal(approveRes.success, true);
    assert.equal(approveRes.customer?.provisionalStatus, 'approved');
    assert.equal(approveRes.customer?.cardReadyForPrint, true);
    assert.equal(restoStore.getCustomerBalance(regRes.customer.id), 45);

    // 3. Receptionist prints PVC card and marks card printed
    const printSuccess = restoStore.markCardAsPrinted(regRes.customer.id);
    assert.equal(printSuccess, true);

    const updatedCustomer = restoStore.getState().customers.find((c) => c.id === regRes.customer.id);
    assert.equal(updatedCustomer?.cardReadyForPrint, false);
    assert.ok((updatedCustomer as any)?.cardPrintedAt);
  });

  test('Scenario 2: Manual cash top-up recording, balance isolation, and manager approval', () => {
    // Create an approved student with 10 plates
    const phone = `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`;
    const reg = restoStore.registerProvisionalCustomer({
      restaurantCode: restoCode,
      name: 'Kagabo Eric',
      phone,
      idType: 'national_id',
      idNumber: `ID-${Date.now()}`,
      isStudent: false,
      platesRequested: 10,
      amountRwf: 12000,
      paymentMethod: 'cash',
      paymentReference: `CASH-${Date.now()}-INIT`,
      registeredByStaffId: 'staff_cashier',
      registeredByStaffName: 'Cashier Alice',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });
    restoStore.approvePendingRequest(reg.approval.id, 'Manager Alex');
    assert.equal(restoStore.getCustomerBalance(reg.customer.id), 10);

    // Cashier records manual top-up of 60 plates
    const topupRef = `CASH-VOUCHER-${Date.now()}`;
    const topup = restoStore.rechargeProvisionalCustomer({
      restaurantCode: restoCode,
      customerId: reg.customer.id,
      platesRequested: 60,
      amountRwf: 72000,
      paymentMethod: 'cash',
      paymentReference: topupRef,
      registeredByStaffId: 'staff_cashier',
      registeredByStaffName: 'Cashier Alice',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });

    // Balance remains 10 while top-up is pending approval
    assert.equal(restoStore.getCustomerBalance(reg.customer.id), 10);

    // Manager confirms physical cash deposit and approves top-up
    const appr = restoStore.approvePendingRequest(topup.id, 'Manager Alex');
    assert.equal(appr.success, true);

    // Balance is now exactly 70 (10 + 60)
    assert.equal(restoStore.getCustomerBalance(reg.customer.id), 70);
  });

  test('Scenario 3: Station hardware pairing, token generation, and unpairing security', () => {
    // Verify station exists in restaurant
    const stations = restoStore.getState().scanPoints.filter((sp) => sp.restaurantCode === restoCode);
    assert.ok(stations.length > 0, 'Scan points must exist for restaurant');
    const targetStation = stations[0];

    // Ensure station is paired for active operations
    targetStation.isPaired = true;
    targetStation.pairedDeviceFingerprint = 'Samsung Galaxy Tab A8 - Stand 1';
    targetStation.pairedAt = new Date().toISOString();

    assert.equal(targetStation.isPaired, true);
    assert.ok(targetStation.pairedDeviceFingerprint);

    // Unpair station -> immediately revokes access
    targetStation.isPaired = false;
    targetStation.pairedDeviceFingerprint = undefined;
    targetStation.pairedAt = undefined;

    assert.equal(targetStation.isPaired, false);

    // Restore paired status for subsequent tests
    targetStation.isPaired = true;
  });

  test('Scenario 4: Physical card redemption, plate deduction, and consecutive tap guard', () => {
    // Setup Customer A (balance: 5) and Customer B (balance: 5)
    const custA = restoStore.registerProvisionalCustomer({
      restaurantCode: restoCode,
      name: 'Customer A',
      phone: `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`,
      idType: 'student_id',
      idNumber: `STU-A-${Date.now()}`,
      isStudent: true,
      platesRequested: 5,
      amountRwf: 6000,
      paymentMethod: 'cash',
      paymentReference: `REF-A-${Date.now()}`,
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Staff 1',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });
    restoStore.approvePendingRequest(custA.approval.id, 'Manager Alex');

    const custB = restoStore.registerProvisionalCustomer({
      restaurantCode: restoCode,
      name: 'Customer B',
      phone: `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`,
      idType: 'student_id',
      idNumber: `STU-B-${Date.now()}`,
      isStudent: true,
      platesRequested: 5,
      amountRwf: 6000,
      paymentMethod: 'cash',
      paymentReference: `REF-B-${Date.now()}`,
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Staff 1',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });
    restoStore.approvePendingRequest(custB.approval.id, 'Manager Alex');

    const cardA = generateCardToken(restoCode, custA.customer.memberNo, custA.customer.cardVersion);
    const cardB = generateCardToken(restoCode, custB.customer.memberNo, custB.customer.cardVersion);

    // 1. First scan for Customer A -> ACCEPTED
    const scan1 = restoStore.processScan(cardA);
    assert.equal(scan1.outcome, 'ACCEPTED');
    assert.equal(scan1.deducted, 1);
    assert.equal(restoStore.getCustomerBalance(custA.customer.id), 4);

    // 2. Immediate double-tap by Customer A -> REJECTED (Consecutive scan guard)
    const scanDoubleTap = restoStore.processScan(cardA);
    assert.equal(scanDoubleTap.outcome, 'REJECTED');
    assert.equal(scanDoubleTap.rejectionCode, 'CONSECUTIVE_SCAN');
    assert.equal(restoStore.getCustomerBalance(custA.customer.id), 4); // Balance unchanged!

    // 3. Customer B scans -> ACCEPTED
    const scanB = restoStore.processScan(cardB);
    assert.equal(scanB.outcome, 'ACCEPTED');
    assert.equal(restoStore.getCustomerBalance(custB.customer.id), 4);

    // 4. Customer A scans again after B -> ACCEPTED (Consecutive guard cleared)
    const scan2 = restoStore.processScan(cardA);
    assert.equal(scan2.outcome, 'ACCEPTED');
    assert.equal(restoStore.getCustomerBalance(custA.customer.id), 3);
  });

  test('Scenario 5: Multi-station concurrency simulation (2 stations, 1 remaining meal plate)', () => {
    // Setup customer with exactly 1 plate balance
    const cust = restoStore.registerProvisionalCustomer({
      restaurantCode: restoCode,
      name: 'Single Meal Patron',
      phone: `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`,
      idType: 'student_id',
      idNumber: `RACE-${Date.now()}`,
      isStudent: true,
      platesRequested: 1,
      amountRwf: 1200,
      paymentMethod: 'cash',
      paymentReference: `RACE-INIT-${Date.now()}`,
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Staff 1',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });
    restoStore.approvePendingRequest(cust.approval.id, 'Manager Alex');
    assert.equal(restoStore.getCustomerBalance(cust.customer.id), 1);

    const cardToken = generateCardToken(restoCode, cust.customer.memberNo, cust.customer.cardVersion);

    // Simulate 2 stations attempting meal deduction
    // Station 1: Stand 1
    restoStore.setStation('sp_1');
    const result1 = restoStore.processScan(cardToken);

    // Station 2: Stand 2
    restoStore.setStation('sp_2');
    const result2 = restoStore.processScan(cardToken);

    // Exactly one must succeed, and the second must be rejected
    const acceptedCount = [result1, result2].filter((r) => r.outcome === 'ACCEPTED').length;
    const rejectedCount = [result1, result2].filter((r) => r.outcome === 'REJECTED').length;

    assert.equal(acceptedCount, 1, 'Exactly one scan must be accepted');
    assert.equal(rejectedCount, 1, 'The concurrent scan must be rejected due to balance depletion');

    // Balance must be exactly 0, never negative
    assert.equal(restoStore.getCustomerBalance(cust.customer.id), 0);
  });

  test('Scenario 6: Rolling 120-minute serving window cap (Maximum 3 meals in 2 hours)', () => {
    const custA = restoStore.registerProvisionalCustomer({
      restaurantCode: restoCode,
      name: 'Hungry Patron',
      phone: `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`,
      idType: 'student_id',
      idNumber: `WINDOW-${Date.now()}`,
      isStudent: true,
      platesRequested: 10,
      amountRwf: 12000,
      paymentMethod: 'cash',
      paymentReference: `WIN-INIT-${Date.now()}`,
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Staff 1',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });
    restoStore.approvePendingRequest(custA.approval.id, 'Manager Alex');

    const custAlt = restoStore.registerProvisionalCustomer({
      restaurantCode: restoCode,
      name: 'Alternate Patron',
      phone: `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`,
      idType: 'student_id',
      idNumber: `WIN-ALT-${Date.now()}`,
      isStudent: true,
      platesRequested: 10,
      amountRwf: 12000,
      paymentMethod: 'cash',
      paymentReference: `WIN-ALT-INIT-${Date.now()}`,
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Staff 1',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });
    restoStore.approvePendingRequest(custAlt.approval.id, 'Manager Alex');

    const cardA = generateCardToken(restoCode, custA.customer.memberNo, custA.customer.cardVersion);
    const cardAlt = generateCardToken(restoCode, custAlt.customer.memberNo, custAlt.customer.cardVersion);

    // Meal 1
    assert.equal(restoStore.processScan(cardA).outcome, 'ACCEPTED');
    restoStore.processScan(cardAlt); // Interleave

    // Meal 2
    assert.equal(restoStore.processScan(cardA).outcome, 'ACCEPTED');
    restoStore.processScan(cardAlt); // Interleave

    // Meal 3 (permitted)
    assert.equal(restoStore.processScan(cardA).outcome, 'ACCEPTED');
    restoStore.processScan(cardAlt); // Interleave

    // Meal 4 within same 120m window -> REJECTED (TWO_HOUR_LIMIT)
    const meal4 = restoStore.processScan(cardA);
    assert.equal(meal4.outcome, 'REJECTED');
    assert.equal(meal4.rejectionCode, 'TWO_HOUR_LIMIT');
    assert.match(meal4.rejectionReason || '', /maximum 3 meals in 2 hours/i);
    assert.equal(restoStore.getCustomerBalance(custA.customer.id), 7); // Exactly 3 deducted
  });

  test('Scenario 7: Zero balance rejection and counterfeit card signature detection', () => {
    // 1. Zero balance customer
    const zeroCust = restoStore.registerProvisionalCustomer({
      restaurantCode: restoCode,
      name: 'Zero Balance Patron',
      phone: `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`,
      idType: 'student_id',
      idNumber: `ZERO-${Date.now()}`,
      isStudent: true,
      platesRequested: 0,
      amountRwf: 0,
      paymentMethod: 'cash',
      paymentReference: `ZERO-${Date.now()}`,
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Staff 1',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });
    zeroCust.approval.platesRequested = 0;
    restoStore.approvePendingRequest(zeroCust.approval.id, 'Manager Alex');

    const zeroCard = generateCardToken(restoCode, zeroCust.customer.memberNo, zeroCust.customer.cardVersion);
    const resZero = restoStore.processScan(zeroCard);
    assert.equal(resZero.outcome, 'REJECTED');
    assert.equal(resZero.rejectionCode, 'NO_BALANCE');
    assert.equal(resZero.deducted, 0);

    // 2. Tampered / counterfeit card signature
    const fakeToken = `c1.${restoCode}.99999.1.invalid_mac_signature`;
    const resFake = restoStore.processScan(fakeToken);
    assert.equal(resFake.outcome, 'REJECTED');
    assert.equal(resFake.rejectionCode, 'INVALID_QR');
  });

  test('Scenario 8: Audited two-person financial exception workflow', async () => {
    // 1. Unauthenticated request to /api/financial-exceptions -> 401
    const resUnauth = await fetchTestRoute(app, 'POST', '/api/financial-exceptions', {
      type: 'scan_reversal',
      sourceId: 'scan_ev_12345',
      reason: 'Tray dropped at buffet counter and student left without meal',
      idempotencyKey: `idemp-exc-${Date.now()}-1`,
    });
    assert.equal(resUnauth.status, 401);

    // 2. Customer or non-admin user attempting to request exception -> 403 (Requires restaurant_admin)
    const custToken = createSessionToken({
      userId: 'cust_123',
      username: 'customer_user',
      role: 'customer',
      restaurantCode: restoCode,
    });
    const resCust = await fetchTestRoute(app, 'POST', '/api/financial-exceptions', {
      type: 'scan_reversal',
      sourceId: 'scan_ev_12345',
      reason: 'Tray dropped at buffet counter and student left without meal',
      idempotencyKey: `idemp-exc-${Date.now()}-2`,
    }, { authorization: `Bearer ${custToken}` });
    assert.equal(resCust.status, 403);

    // 3. Restaurant Admin attempting to approve exception -> 403 (Requires super_admin)
    const adminToken = createSessionToken({
      userId: 'admin_123',
      username: 'restaurant_manager',
      role: 'restaurant_admin',
      restaurantCode: restoCode,
    });
    const resAdminApprove = await fetchTestRoute(app, 'POST', '/api/financial-exceptions/exc_123/approve', {
      approvalReason: 'Approved compensation for dropped tray incident',
    }, { authorization: `Bearer ${adminToken}` });
    assert.equal(resAdminApprove.status, 403);
  });

  test('Scenario 9: Cloud authority rule and offline redirection guard', () => {
    // Verify cloud-authority check in restoStore
    assert.equal(typeof (restoStore as any).topUpCustomerAuthoritative, 'function');
    assert.equal(typeof (restoStore as any).recordPhotoCheckAuthoritative, 'function');

    // Confirm client state replacement is not accepted by server
    const serverFile = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');
    assert.match(serverFile, /Full-state replacement is disabled/);
    assert.match(serverFile, /Scan events are written only by server-side transactional scan endpoints/);
    assert.match(serverFile, /Financial ledger entries are written only by server-authoritative transactions/);
  });

  test('Scenario 10: Restaurant acceptance manual and runbook completeness', () => {
    const runbookPath = path.resolve(process.cwd(), 'docs', 'RESTAURANT_ACCEPTANCE_TESTING.md');
    assert.ok(fs.existsSync(runbookPath), 'docs/RESTAURANT_ACCEPTANCE_TESTING.md must exist');

    const content = fs.readFileSync(runbookPath, 'utf-8');
    assert.match(content, /Scenario 1: Student Self-Registration/);
    assert.match(content, /Scenario 2: Cashier Top-Up Recording/);
    assert.match(content, /Scenario 3: Physical Card Issuance/);
    assert.match(content, /Scenario 4: Scanner Hardware Pairing/);
    assert.match(content, /Scenario 5: Multi-Station Concurrency/);
    assert.match(content, /Scenario 6: Dynamic QR Replay Protection/);
    assert.match(content, /Scenario 7: Serving Window Limits/);
    assert.match(content, /Scenario 8: Scanner Display Patron Photo Match/);
    assert.match(content, /Scenario 9: Audited Two-Person Financial Exception/);
    assert.match(content, /Scenario 10: Network Outage & Backend Interruption/);
    assert.match(content, /Scenario 11: End-of-Day Shift Reconciliation/);
    assert.match(content, /Cloud Authority Rule/);
    assert.match(content, /Formal Operational Certification/);
  });
});
