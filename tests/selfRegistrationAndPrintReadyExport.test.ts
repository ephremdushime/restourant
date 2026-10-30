import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { restoStore } from '../src/store/restoStore';

describe('Student Self-Registration, Boss Approval & Print-Ready Export Workflow', () => {
  const restoCode = 'RW01';

  it('1. Student submits self-registration online -> stored as pending_approval and not ready for print yet', () => {
    const studentPhone = '+250 788 999 111';
    const studentReg = '21RP999111';
    const platesRequested = 60;
    const amountRwf = 72000;
    const momoRef = 'MOMO-ONLINE-REG-991';

    const res = restoStore.registerProvisionalCustomer({
      restaurantCode: restoCode,
      branchId: 'br_rw01_main',
      branchName: 'Main Campus Dining Hall',
      name: 'Ineza Alice',
      phone: studentPhone,
      photoUrl: '/src/assets/images/avatar_student_female_1790979387287.jpg',
      idType: 'student_id',
      idNumber: studentReg,
      isStudent: true,
      studentProfile: {
        institution: 'ULK',
        programme: 'Computer Science (Yr 2)',
        year: 2,
        registrationNumber: studentReg,
      },
      platesRequested,
      amountRwf,
      paymentMethod: 'mtn_momo',
      paymentReference: momoRef,
      registeredByStaffId: 'self_student_portal',
      registeredByStaffName: 'Ineza Alice (Online)',
      stationId: 'online_self_service',
      stationName: 'Online Student Portal',
    });

    assert.ok(res.customer);
    assert.equal(res.customer.name, 'Ineza Alice');
    assert.equal(res.customer.provisionalStatus, 'pending_approval');
    assert.equal(res.customer.cardReadyForPrint, false);

    // Customer cannot log into dashboard yet
    const statusBefore = restoStore.checkCustomerPortalStatus(studentPhone, restoCode);
    assert.equal(statusBefore.status, 'pending_boss_approval');
  });

  it('2. Boss approves registration in Pending Approvals -> triggers cardReadyForPrint and unlocks PIN setup', () => {
    const pendingList = restoStore.getState().pendingApprovals.filter(
      (a) => a.restaurantCode === restoCode && a.status === 'pending'
    );
    const targetApproval = pendingList.find((a) => a.paymentReference === 'MOMO-ONLINE-REG-991');
    assert.ok(targetApproval, 'Approval request must exist for student registration');

    const approveRes = restoStore.approvePendingRequest(targetApproval.id, 'Restaurant Boss (Executive)');
    assert.ok(approveRes.success);
    assert.ok(approveRes.customer);
    assert.equal(approveRes.customer.cardReadyForPrint, true);
    assert.equal(approveRes.customer.provisionalStatus, 'approved');

    // Print-ready cards view on scanner/cashier station lists this customer
    const printReadyList = restoStore.getPrintReadyCustomers(restoCode);
    const inList = printReadyList.find((c) => c.id === approveRes.customer!.id);
    assert.ok(inList, 'Customer must appear in print-ready list for scanner/cashier station');

    // Customer status is now ready for self-service PIN setup
    const statusAfter = restoStore.checkCustomerPortalStatus(approveRes.customer.phone, restoCode);
    assert.equal(statusAfter.status, 'needs_pin_setup');
  });

  it('3. Cashier/Scanner marks card as printed/exported -> cardReadyForPrint clears cleanly', () => {
    const printReadyBefore = restoStore.getPrintReadyCustomers(restoCode);
    const target = printReadyBefore.find((c) => c.phone === '+250 788 999 111');
    assert.ok(target);

    const count = restoStore.markBatchCardsAsPrinted([target.id]);
    assert.equal(count, 1);

    const printReadyAfter = restoStore.getPrintReadyCustomers(restoCode);
    const stillInList = printReadyAfter.find((c) => c.id === target.id);
    assert.equal(stillInList, undefined, 'Card must no longer be queued in print-ready list');
  });

  it('4. Student completes first-time PIN setup and logs in to dashboard', async () => {
    const setupRes = await restoStore.setupFirstTimeCustomerPin({
      phoneOrMember: '+250 788 999 111',
      newPin: '987654',
      restaurantCode: restoCode,
    });
    assert.ok(setupRes.success);
    assert.ok(setupRes.customer);
    assert.equal(setupRes.customer.hasCustomPin, true);

    const loginRes = await restoStore.customerLogin({
      phone: '+250 788 999 111',
      pin: '987654',
      restaurantCode: restoCode,
    });
    assert.ok(loginRes.success);
    assert.equal(loginRes.customer?.name, 'Ineza Alice');
  });
});
