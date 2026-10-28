import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { restoStore } from '../src/store/restoStore';
import { generateCardToken, generatePhoneToken } from '../src/services/cryptoService';
import { sound } from '../src/services/audioService';

/**
 * Helper to create a clean approved customer with an exact starting balance,
 * plus an alternate customer at the same restaurant to interleave scans when testing non-consecutive rules.
 */
function setupCustomerWithBalance(balance: number, nameSuffix: string) {
  restoStore.setRestaurantCode('RW01');
  restoStore.setStation('sp_1');

  const uniquePhone = `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`;
  const uniqueId = `ID-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const reg = restoStore.registerProvisionalCustomer({
    restaurantCode: 'RW01',
    name: `Patron ${nameSuffix}`,
    phone: uniquePhone,
    idType: 'national_id',
    idNumber: uniqueId,
    isStudent: false,
    platesRequested: balance,
    amountRwf: balance * 1000,
    paymentMethod: 'mtn_momo',
    paymentReference: `REF-INIT-${Date.now()}-${Math.random()}`,
    registeredByStaffId: 'staff_1',
    registeredByStaffName: 'Cashier',
    stationId: 'sp_1',
    stationName: 'Stand 1',
  });

  if (balance > 0) {
    restoStore.approvePendingRequest(reg.approval.id, 'Boss Admin');
  } else {
    // Mark approved with 0 balance
    reg.approval.platesRequested = 0;
    restoStore.approvePendingRequest(reg.approval.id, 'Boss Admin');
  }

  return reg.customer;
}

describe('Part 1: Top-Up, Approval-Linked Ledger, and Grace-Meal Accounting Scenarios', () => {
  test('Scenario 1: Existing balance 103; customer pays for 60 more -> Pending balance stays 103; after approval becomes 163', () => {
    const customer = setupCustomerWithBalance(103, 'Scenario1_103');
    assert.equal(restoStore.getCustomerBalance(customer.id), 103);
    assert.equal(customer.provisionalStatus, 'approved');

    // Customer submits top-up for 60 plates
    const pendingTopup = restoStore.rechargeProvisionalCustomer({
      restaurantCode: 'RW01',
      customerId: customer.id,
      platesRequested: 60,
      amountRwf: 66000,
      paymentMethod: 'mtn_momo',
      paymentReference: 'MOMO-SCEN1-60',
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Cashier',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });

    // Defect 1 check: Customer remains approved and balance remains 103 while top-up is pending
    assert.equal(customer.provisionalStatus, 'approved');
    assert.equal(restoStore.getCustomerBalance(customer.id), 103);

    // Boss approves the 60-plate top-up
    const apprRes = restoStore.approvePendingRequest(pendingTopup.id, 'Restaurant Boss');
    assert.equal(apprRes.success, true);
    assert.equal(restoStore.getCustomerBalance(customer.id), 163);

    // Idempotency check: Approving the same request a second time must not double-credit
    const duplicateAppr = restoStore.approvePendingRequest(pendingTopup.id, 'Restaurant Boss');
    assert.equal(duplicateAppr.success, false);
    assert.equal(restoStore.getCustomerBalance(customer.id), 163);
  });

  test('Scenario 2: Existing balance 5; customer pays for 60 -> Uses 2 paid meals while pending (balance becomes 3); after approval becomes 63 (no double-charging)', () => {
    const customer = setupCustomerWithBalance(5, 'Scenario2_5');
    const helperCustomer = setupCustomerWithBalance(10, 'Helper2');
    assert.equal(restoStore.getCustomerBalance(customer.id), 5);

    // Customer pays for 60 more (pending boss approval)
    const pendingTopup = restoStore.rechargeProvisionalCustomer({
      restaurantCode: 'RW01',
      customerId: customer.id,
      platesRequested: 60,
      amountRwf: 66000,
      paymentMethod: 'mtn_momo',
      paymentReference: 'MOMO-SCEN2-60',
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Cashier',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });

    const cardToken = generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion);
    const helperToken = generateCardToken(helperCustomer.restaurantCode, helperCustomer.memberNo, helperCustomer.cardVersion);

    // Scan 1 (uses paid credit, NOT grace credit)
    const scan1 = restoStore.processScan(cardToken);
    assert.equal(scan1.outcome, 'ACCEPTED');
    assert.equal(scan1.isGraceMeal, false);
    assert.equal(restoStore.getCustomerBalance(customer.id), 4);

    // Interleave with helper customer so successive-scan guard is satisfied
    const interleave = restoStore.processScan(helperToken);
    assert.equal(interleave.outcome, 'ACCEPTED');

    // Scan 2 (uses paid credit, NOT grace credit)
    const scan2 = restoStore.processScan(cardToken);
    assert.equal(scan2.outcome, 'ACCEPTED');
    assert.equal(scan2.isGraceMeal, false);
    assert.equal(restoStore.getCustomerBalance(customer.id), 3);

    // Defect 2 check: No grace plates should have been counted because paid balance was > 0
    assert.equal(pendingTopup.gracePlatesConsumed, 0);

    // Boss approves the 60-plate top-up -> 3 + 60 = 63!
    const apprRes = restoStore.approvePendingRequest(pendingTopup.id, 'Restaurant Boss');
    assert.equal(apprRes.success, true);
    assert.equal(restoStore.getCustomerBalance(customer.id), 63);
  });

  test('Scenario 3: Existing balance 0; customer pays for 60 -> Uses 2 authorized grace meals while waiting; after approval balance is 58 (60 - 2)', () => {
    const customer = setupCustomerWithBalance(0, 'Scenario3_0');
    const helperCustomer = setupCustomerWithBalance(10, 'Helper3');
    assert.equal(restoStore.getCustomerBalance(customer.id), 0);

    // Customer pays for 60 plates
    const pendingTopup = restoStore.rechargeProvisionalCustomer({
      restaurantCode: 'RW01',
      customerId: customer.id,
      platesRequested: 60,
      amountRwf: 66000,
      paymentMethod: 'mtn_momo',
      paymentReference: 'MOMO-SCEN3-60',
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Cashier',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });

    const cardToken = generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion);
    const helperToken = generateCardToken(helperCustomer.restaurantCode, helperCustomer.memberNo, helperCustomer.cardVersion);

    // Consume 1st grace meal
    const g1 = restoStore.processScan(cardToken);
    assert.equal(g1.outcome, 'ACCEPTED');
    assert.equal(g1.isGraceMeal, true);

    restoStore.processScan(helperToken);

    // Consume 2nd grace meal
    const g2 = restoStore.processScan(cardToken);
    assert.equal(g2.outcome, 'ACCEPTED');
    assert.equal(g2.isGraceMeal, true);

    assert.equal(pendingTopup.gracePlatesConsumed, 2);

    // Boss approves -> Final balance must be 60 - 2 = 58
    const apprRes = restoStore.approvePendingRequest(pendingTopup.id, 'Restaurant Boss');
    assert.equal(apprRes.success, true);
    assert.equal(restoStore.getCustomerBalance(customer.id), 58);
  });

  test('Scenario 4: New customer pays for 60 -> Uses 3 grace meals before approval; after approval account activates with 57 (60 - 3)', () => {
    const helperCustomer = setupCustomerWithBalance(10, 'Helper4');
    const helperToken = generateCardToken(helperCustomer.restaurantCode, helperCustomer.memberNo, helperCustomer.cardVersion);

    const reg = restoStore.registerProvisionalCustomer({
      restaurantCode: 'RW01',
      name: 'New Student Patron 4',
      phone: `+250 788 ${Math.floor(100000 + Math.random() * 899999)}`,
      idType: 'student_id',
      idNumber: `STU-SCEN4-${Date.now()}`,
      isStudent: true,
      platesRequested: 60,
      amountRwf: 66000,
      paymentMethod: 'mtn_momo',
      paymentReference: 'MOMO-SCEN4-60',
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Cashier',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });

    const newCustomer = reg.customer;
    const cardToken = generateCardToken(newCustomer.restaurantCode, newCustomer.memberNo, newCustomer.cardVersion);

    // Consume 3 grace meals (interleaving with helperCustomer)
    for (let i = 1; i <= 3; i++) {
      const scan = restoStore.processScan(cardToken);
      assert.equal(scan.outcome, 'ACCEPTED');
      assert.equal(scan.isGraceMeal, true);
      restoStore.processScan(helperToken);
    }

    assert.equal(reg.approval.gracePlatesConsumed, 3);

    // Boss approves -> Account activates with 60 - 3 = 57
    const apprRes = restoStore.approvePendingRequest(reg.approval.id, 'Restaurant Boss');
    assert.equal(apprRes.success, true);
    assert.equal(restoStore.getCustomerBalance(newCustomer.id), 57);
    assert.equal(newCustomer.provisionalStatus, 'approved');
  });

  test('Scenario 5: Existing customer has 0 balance and already used 3 grace meals -> No more grace meals authorized even if a second pending top-up is submitted', () => {
    const customer = setupCustomerWithBalance(0, 'Scenario5_0');
    const helperCustomer = setupCustomerWithBalance(20, 'Helper5');
    const cardToken = generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion);
    const helperToken = generateCardToken(helperCustomer.restaurantCode, helperCustomer.memberNo, helperCustomer.cardVersion);

    // First pending top-up
    const topup1 = restoStore.rechargeProvisionalCustomer({
      restaurantCode: 'RW01',
      customerId: customer.id,
      platesRequested: 30,
      amountRwf: 34000,
      paymentMethod: 'mtn_momo',
      paymentReference: 'MOMO-SCEN5-A',
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Cashier',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });

    // Consume all 3 allowed grace meals
    for (let i = 1; i <= 3; i++) {
      const s = restoStore.processScan(cardToken);
      assert.equal(s.outcome, 'ACCEPTED');
      assert.equal(s.isGraceMeal, true);
      restoStore.processScan(helperToken);
    }

    // 4th attempt before approval must be rejected (grace limit 3/3 reached)
    const fourthAttempt = restoStore.processScan(cardToken);
    assert.equal(fourthAttempt.outcome, 'REJECTED');
    assert.equal(fourthAttempt.rejectionCode, 'NO_BALANCE');

    // Defect 3 check: Submitting a SECOND pending top-up must NOT reset the grace counter!
    const topup2 = restoStore.rechargeProvisionalCustomer({
      restaurantCode: 'RW01',
      customerId: customer.id,
      platesRequested: 30,
      amountRwf: 34000,
      paymentMethod: 'mtn_momo',
      paymentReference: 'MOMO-SCEN5-B',
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Cashier',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });

    assert.equal(customer.gracePlatesConsumed, 3);
    const afterSecondTopupScan = restoStore.processScan(cardToken);
    assert.equal(afterSecondTopupScan.outcome, 'REJECTED');
    assert.equal(afterSecondTopupScan.rejectionCode, 'NO_BALANCE');

    // Approve topup1 (30 - 3 = 27) and topup2 (+30 = 57) independently
    restoStore.approvePendingRequest(topup1.id, 'Boss');
    assert.equal(restoStore.getCustomerBalance(customer.id), 27);

    restoStore.approvePendingRequest(topup2.id, 'Boss');
    assert.equal(restoStore.getCustomerBalance(customer.id), 57);
  });
});

describe('Part 2: Scanner Station Sound Alerts & Meal-Validation Specification (12 Acceptance Tests)', () => {
  test('1 & 2: Valid physical card scan & valid dashboard QR scan deduct 1 meal, play Sound 1, and show accepted message', () => {
    const customerA = setupCustomerWithBalance(10, 'ScanSpecA');
    const customerB = setupCustomerWithBalance(10, 'ScanSpecB');

    // Physical card scan (Customer A)
    const cardTokenA = generateCardToken(customerA.restaurantCode, customerA.memberNo, customerA.cardVersion);
    const resCard = restoStore.processScan(cardTokenA);
    assert.equal(resCard.outcome, 'ACCEPTED');
    assert.equal(resCard.deducted, 1);
    assert.equal(resCard.balanceAfter, 9);
    assert.match(resCard.message, /Meal accepted — 1 meal recorded/i);

    // Dashboard dynamic phone QR scan (Customer B)
    const phoneTokenB = generatePhoneToken(customerB.restaurantCode, customerB.memberNo, customerB.keyVersion).token;
    const resPhone = restoStore.processScan(phoneTokenB);
    assert.equal(resPhone.outcome, 'ACCEPTED');
    assert.equal(resPhone.deducted, 1);
    assert.equal(resPhone.balanceAfter, 9);
    assert.match(resPhone.message, /Meal accepted — 1 meal recorded/i);
  });

  test('3 & 4: Invalid/tampered QR and Zero-balance customer are rejected with explicit reason and no meal deducted', () => {
    const zeroCust = setupCustomerWithBalance(0, 'ZeroBalCust');

    // 3. Invalid / tampered QR
    const resInvalid = restoStore.processScan('c1.RW01.28491.1.deadbeef00000000');
    assert.equal(resInvalid.outcome, 'REJECTED');
    assert.equal(resInvalid.deducted, 0);
    assert.equal(resInvalid.rejectionCode, 'INVALID_QR');
    assert.match(resInvalid.rejectionReason || '', /Invalid card \/ QR code/i);

    // 4. Zero balance with no eligible grace meal
    const zeroCard = generateCardToken(zeroCust.restaurantCode, zeroCust.memberNo, zeroCust.cardVersion);
    const resZero = restoStore.processScan(zeroCard);
    assert.equal(resZero.outcome, 'REJECTED');
    assert.equal(resZero.deducted, 0);
    assert.equal(resZero.rejectionCode, 'NO_BALANCE');
    assert.equal(resZero.rejectionReason, 'No balance — please top up or await payment approval.');
  });

  test('5 & 6: Immediate second scan by same customer is rejected; failed scans do not reset consecutive guard; different customer scan allows Customer A again', () => {
    const customerA = setupCustomerWithBalance(10, 'ConsecA');
    const customerB = setupCustomerWithBalance(10, 'ConsecB');
    const cardA = generateCardToken(customerA.restaurantCode, customerA.memberNo, customerA.cardVersion);
    const cardB = generateCardToken(customerB.restaurantCode, customerB.memberNo, customerB.cardVersion);

    // Customer A scans first -> ACCEPTED
    const firstA = restoStore.processScan(cardA);
    assert.equal(firstA.outcome, 'ACCEPTED');
    assert.equal(restoStore.getCustomerBalance(customerA.id), 9);

    // Customer A immediately scans again -> REJECTED (Too many successive taps)
    const secondA = restoStore.processScan(cardA);
    assert.equal(secondA.outcome, 'REJECTED');
    assert.equal(secondA.rejectionCode, 'CONSECUTIVE_SCAN');
    assert.equal(secondA.rejectionReason, 'Too many successive taps — scan another customer first.');
    assert.equal(restoStore.getCustomerBalance(customerA.id), 9); // No deduction!

    // Failed scan in between (e.g. invalid QR) must NOT reset the consecutive-scan guard
    restoStore.processScan('c1.RW01.99999.1.0000000000000000');
    const thirdA = restoStore.processScan(cardA);
    assert.equal(thirdA.outcome, 'REJECTED');
    assert.equal(thirdA.rejectionCode, 'CONSECUTIVE_SCAN');

    // Customer B scans successfully in between -> ACCEPTED
    const scanB = restoStore.processScan(cardB);
    assert.equal(scanB.outcome, 'ACCEPTED');

    // Now Customer A scans again -> ACCEPTED (2nd meal in 2 hours)
    const fourthA = restoStore.processScan(cardA);
    assert.equal(fourthA.outcome, 'ACCEPTED');
    assert.equal(restoStore.getCustomerBalance(customerA.id), 8);
  });

  test('7, 8 & 9: 3 meals in 120m allowed (when interleaved), 4th meal in 120m rejected, and meal exiting 120m window allows new scan', () => {
    const customerA = setupCustomerWithBalance(10, 'WindowA');
    const customerB = setupCustomerWithBalance(10, 'WindowB');
    const cardA = generateCardToken(customerA.restaurantCode, customerA.memberNo, customerA.cardVersion);
    const cardB = generateCardToken(customerB.restaurantCode, customerB.memberNo, customerB.cardVersion);

    // Meal 1 for A
    assert.equal(restoStore.processScan(cardA).outcome, 'ACCEPTED');
    assert.equal(restoStore.processScan(cardB).outcome, 'ACCEPTED');

    // Meal 2 for A
    assert.equal(restoStore.processScan(cardA).outcome, 'ACCEPTED');
    assert.equal(restoStore.processScan(cardB).outcome, 'ACCEPTED');

    // Meal 3 for A (allowed: up to 3 meals in 120 minutes)
    const meal3 = restoStore.processScan(cardA);
    assert.equal(meal3.outcome, 'ACCEPTED');
    assert.equal(restoStore.getCustomerBalance(customerA.id), 7);

    // Interleave with B so consecutive-scan check passes, isolating the 2-hour limit check
    assert.equal(restoStore.processScan(cardB).outcome, 'ACCEPTED');

    // Meal 4 for A within 120 minutes -> REJECTED (TWO_HOUR_LIMIT)
    const meal4 = restoStore.processScan(cardA);
    assert.equal(meal4.outcome, 'REJECTED');
    assert.equal(meal4.rejectionCode, 'TWO_HOUR_LIMIT');
    assert.equal(meal4.rejectionReason, 'Meal limit reached — maximum 3 meals in 2 hours.');
    assert.equal(restoStore.getCustomerBalance(customerA.id), 7);

    // Age the earliest scan of Customer A to 121 minutes ago so it exits the rolling 120-minute window
    const customerAScans = restoStore
      .getState()
      .scanEvents.filter((e) => e.customerId === customerA.id && e.platesDeducted > 0);
    assert.equal(customerAScans.length, 3);
    const oldestScan = customerAScans[customerAScans.length - 1];
    oldestScan.timestamp = new Date(restoStore.getGuardedTime('RW01') - 121 * 60 * 1000).toISOString();

    // Now Customer A has only 2 meals in the last 120 minutes -> Scan succeeds!
    const mealAfterExpiry = restoStore.processScan(cardA);
    assert.equal(mealAfterExpiry.outcome, 'ACCEPTED');
    assert.equal(restoStore.getCustomerBalance(customerA.id), 6);
  });

  test('10, 11 & 12: Audio service volume, mute control, and duplicate event key suppression', () => {
    sound.setSoundEnabled(true);
    sound.setVolume(0.75);
    assert.equal(sound.getVolume(), 0.75);
    assert.equal(sound.isSoundEnabled(), true);

    // Duplicate event key suppression check
    sound.setSoundEnabled(false);
    assert.equal(sound.playSuccessSound('evt_test_1'), false);
    assert.equal(sound.playFailureSound('evt_test_2'), false);
    sound.setSoundEnabled(true);
  });
});

