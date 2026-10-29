import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { restoStore } from '../src/store/restoStore';
import {
  generateCardToken,
  verifyQrToken,
} from '../src/services/cryptoService';

describe('RestoPass Customer Login (No OTP/SMS) & Physical Card Implementation', () => {
  beforeEach(() => {
    // Reset subscription feature flag to launch defaults
    restoStore.updateStudentSubscriptionSettings({
      enabled: false,
      priceRwf: 500,
      graceDays: 3,
    });
  });

  test('Step 1: Cashier registers customer -> pending_approval, no active account or meal credit granted yet', async () => {
    const regResult = restoStore.registerProvisionalCustomer({
      name: 'Uwimana Jean Bosco',
      phone: '+250 788 123 456',
      restaurantCode: 'RW01',
      platesRequested: 30,
      idType: 'student_id',
      idNumber: '20251123',
      isStudent: true,
      studentProfile: {
        institution: 'Kigali Independent University',
        registrationNumber: '20251123',
        programme: 'Computer Science',
        year: 2,
      },
    } as any);

    assert.ok(regResult.customer);
    const customer = regResult.customer;

    // Customer must start in pending_approval
    assert.equal(customer.activationStatus, 'pending_approval');
    assert.equal(customer.cardReadyForPrint, false);
    // No active meal credit or custom PIN yet
    assert.equal(restoStore.getCustomerBalance(customer.id), 0);
    assert.equal(customer.hasCustomPin, false);

    // Customer cannot log in while pending approval
    const loginAttempt = await restoStore.customerLogin({
      phone: '+250 788 123 456',
      pin: '123456',
    });
    assert.equal(loginAttempt.success, false);
    assert.match(loginAttempt.error || '', /pending|Invalid/i);
  });

  test('Step 2: Boss approves registration -> activates account for dashboard, generates card for printing, accounts for grace meals', () => {
    // Register provisional customer
    const reg = restoStore.registerProvisionalCustomer({
      name: 'Mukamana Alice',
      phone: '+250 789 222 333',
      restaurantCode: 'RW01',
      platesRequested: 20,
      idType: 'national_id',
      idNumber: '1199980001234567',
      isStudent: false,
    } as any);
    assert.ok(reg.customer);
    const customerId = reg.customer.id;

    // Simulate consuming 2 grace meals while waiting for boss approval (< 3 allowed)
    reg.customer.gracePlatesConsumed = 2;

    // Find the pending approval request in store
    const pendingReq = restoStore.getState().pendingApprovals.find(
      (a) => a.customerId === customerId && a.status === 'pending'
    );
    assert.ok(pendingReq, 'Pending approval request must exist');

    // Boss approves registration
    const approveResult = restoStore.approvePendingRequest(
      pendingReq.id,
      'Boss Jean Paul'
    );
    assert.equal(approveResult.success, true);
    assert.ok(approveResult.customer);

    const updatedCustomer = restoStore.getState().customers.find((c) => c.id === customerId);
    assert.ok(updatedCustomer);

    // Account becomes ready for activation and physical card is ready for printing
    assert.equal(updatedCustomer.activationStatus, 'ready_for_activation');
    assert.equal(updatedCustomer.cardReadyForPrint, true);

    // Balance must be net of consumed grace plates (20 requested - 2 grace = 18 plates)
    assert.equal(restoStore.getCustomerBalance(customerId), 18);
  });

  test('Step 3: Non-SMS PIN setup at cashier/manager station -> enforces 6+ digits, single-use 15m code, staff cannot choose PIN', async () => {
    // Setup approved customer
    const reg = restoStore.registerProvisionalCustomer({
      name: 'Nshimiyimana David',
      phone: '+250 788 555 777',
      restaurantCode: 'RW01',
      platesRequested: 10,
      idType: 'student_id',
      idNumber: '20259988',
      isStudent: true,
    } as any);
    assert.ok(reg.customer);
    const customer = reg.customer;
    customer.activationStatus = 'ready_for_activation';
    customer.provisionalStatus = 'approved';

    // Staff initiates non-SMS activation request after verifying identity
    const actReq = restoStore.requestCustomerActivation({
      customerId: customer.id,
      authorizingStaffId: 'staff_1',
      authorizingStaffName: 'Cashier Claudine',
      restaurantCode: 'RW01',
    });

    assert.equal(actReq.success, true);
    assert.ok(actReq.activationCode, 'Must return temporary activation code');
    const code = actReq.activationCode!;

    // Customer privately sets PIN with invalid length (< 6 digits) -> Must fail
    const shortPinResult = await restoStore.completeCustomerActivation({
      phoneOrMember: customer.phone,
      activationCode: code,
      newPin: '12345', // only 5 digits
    });
    assert.equal(shortPinResult.success, false);
    assert.match(shortPinResult.error || '', /at least 6|minimum 6/i);

    // Customer privately sets PIN with valid 6+ digits -> Must succeed
    const validActivation = await restoStore.completeCustomerActivation({
      phoneOrMember: customer.phone,
      activationCode: code,
      newPin: '829104',
    });
    assert.equal(validActivation.success, true);
    assert.equal(validActivation.customer?.activationStatus, 'active');
    assert.equal(validActivation.customer?.hasCustomPin, true);

    // Replay attack: Code is single-use and cannot be used again
    const reuseAttempt = await restoStore.completeCustomerActivation({
      phoneOrMember: customer.phone,
      activationCode: code,
      newPin: '999888',
    });
    assert.equal(reuseAttempt.success, false);
    assert.match(reuseAttempt.error || '', /already used|expired|invalid/i);
  });

  test('Step 4: Customer logs in with Phone + 6+ digit PIN (No SMS OTP) with rate-limiting and anti-enumeration', async () => {
    // Setup active customer
    const reg = restoStore.registerProvisionalCustomer({
      name: 'Kalisa Eric',
      phone: '+250 788 999 000',
      restaurantCode: 'RW01',
      platesRequested: 15,
      idType: 'student_id',
      idNumber: '20257766',
      isStudent: true,
    } as any);
    assert.ok(reg.customer);
    const customer = reg.customer;
    customer.activationStatus = 'active';
    customer.provisionalStatus = 'approved';
    restoStore.setCustomerPin(customer.id, '654321');

    // 1. Correct credentials login successfully
    const successLogin = await restoStore.customerLogin({
      phone: '+250 788 999 000',
      pin: '654321',
    });
    assert.equal(successLogin.success, true);
    assert.ok(successLogin.customer);
    assert.equal(successLogin.customer.phone, '+250 788 999 000');

    // 2. Incorrect PIN gives generic error without exposing whether phone is registered
    const wrongPinLogin = await restoStore.customerLogin({
      phone: '+250 788 999 000',
      pin: '000000',
    });
    assert.equal(wrongPinLogin.success, false);
    assert.equal(wrongPinLogin.error, 'Invalid phone number or PIN');

    // Non-existent phone returns identical generic error (anti-enumeration)
    const unknownPhoneLogin = await restoStore.customerLogin({
      phone: '+250 788 000 111',
      pin: '654321',
    });
    assert.equal(unknownPhoneLogin.success, false);
    assert.equal(unknownPhoneLogin.error, 'Invalid phone number or PIN');

    // 3. Rate-limiting: 5 consecutive failed attempts locks account temporarily
    for (let i = 0; i < 4; i++) {
      await restoStore.customerLogin({
        phone: customer.phone,
        pin: '000000',
      });
    }

    // 5th failed attempt triggers lock
    const lockedLogin = await restoStore.customerLogin({
      phone: customer.phone,
      pin: '654321',
    });
    assert.equal(lockedLogin.success, false);
    assert.match(lockedLogin.error || '', /locked due to/i);
  });

  test('Step 5: Non-SMS Audited PIN Recovery -> Manager verifies ID, single-use reset code, revokes sessions', async () => {
    // Setup active customer
    const customer = restoStore.getState().customers[0];
    assert.ok(customer);
    customer.failedLoginAttempts = 0;
    customer.lockedUntil = null;
    restoStore.setCustomerPin(customer.id, '112233');

    // 1. Request recovery after in-person ID verification
    const recReq = restoStore.requestCustomerPinRecovery({
      customerId: customer.id,
      reason: 'Forgot PIN at cafeteria desk',
      idVerificationMethod: 'student_id_check',
      restaurantCode: customer.restaurantCode,
      staffId: 'staff_desk',
      staffName: 'Desk Cashier',
    });
    assert.equal(recReq.success, true);
    assert.ok(recReq.requestId);

    // 2. Manager approves recovery request
    const approveRec = restoStore.approveCustomerPinRecovery({
      requestId: recReq.requestId!,
      authorizingStaffId: 'boss_1',
      authorizingStaffName: 'Manager Alphonse',
    });
    assert.equal(approveRec.success, true);
    assert.ok(approveRec.recoveryCode, 'Must issue single-use reset code');
    const resetCode = approveRec.recoveryCode!;

    // 3. Customer enters reset code privately and sets new PIN
    const completeRec = await restoStore.completeCustomerPinRecovery({
      requestId: recReq.requestId!,
      recoveryCode: resetCode,
      newPin: '998877',
    });
    assert.equal(completeRec.success, true);

    // Verify old PIN no longer works, new PIN works
    assert.equal(restoStore.verifyCustomerPin(customer.id, '112233'), false);
    assert.equal(restoStore.verifyCustomerPin(customer.id, '998877'), true);

    // Single-use check: recovery request cannot be completed twice
    const reuseAttempt = await restoStore.completeCustomerPinRecovery({
      requestId: recReq.requestId!,
      recoveryCode: resetCode,
      newPin: '123123',
    });
    assert.equal(reuseAttempt.success, false);
  });

  test('Step 6: Physical Card Front & Back specifications and real-time QR scanner deduction', () => {
    const customer = restoStore.getState().customers[0];
    assert.ok(customer);

    // 1. Generate opaque physical card QR token
    const cardToken = generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion);
    assert.ok(cardToken.startsWith('c1.'), 'Card QR payload must use opaque c1 token');

    // Verify card serial number matches format RP2026 + memberNo
    const serial = `RP2026${customer.memberNo}`;
    assert.match(serial, /^RP2026\d+/);

    // 2. Physical Card verification and real-time deduction
    const customerMap = {
      [customer.memberNo]: {
        keyVersion: customer.keyVersion,
        cardVersion: customer.cardVersion,
        cardStatus: customer.cardStatus,
      },
    };
    const verified = verifyQrToken(cardToken, customer.restaurantCode, customerMap);
    assert.equal(verified.valid, true);
    assert.equal(verified.memberNo, customer.memberNo);
    assert.equal(verified.isCard, true);

    // Perform atomic deduction at cafeteria buffet scanner
    const initialBalance = restoStore.getCustomerBalance(customer.id);
    const scanResult = restoStore.processScan(cardToken);
    assert.equal(scanResult.scanEvent.status, 'approved');
    assert.equal(scanResult.scanEvent.platesDeducted, 1);
    assert.equal(scanResult.balanceAfter, initialBalance - 1);
    assert.equal(restoStore.getCustomerBalance(customer.id), initialBalance - 1);
  });

  test('Step 7: Customer Dashboard 500 RWF Monetization Gating & Physical Card Fallback', () => {
    const customer = restoStore.getState().customers[1];
    assert.ok(customer);

    // Case A: Subscription disabled at launch -> Dashboard is completely accessible
    restoStore.updateStudentSubscriptionSettings({
      enabled: false,
      priceRwf: 500,
    });

    const entDisabled = restoStore.checkStudentEntitlement(customer.id, 'customer_dashboard');
    assert.equal(entDisabled.allowed, true);
    assert.match(entDisabled.reason || '', /disabled at launch/i);

    // Case B: Subscription enabled by super-admin -> Dashboard gates non-paying customers
    restoStore.updateStudentSubscriptionSettings({
      enabled: true,
      priceRwf: 500,
      graceDays: 3,
    });

    // Fresh/unsubscribed customer has no active digital pass
    const entEnabled = restoStore.checkStudentEntitlement(customer.id, 'customer_dashboard');
    assert.equal(entEnabled.allowed, false);
    assert.match(entEnabled.reason || '', /500 RWF/i);

    // Case C: PHYSICAL CARD FALLBACK IS 100% PRESERVED
    // Even though dashboard access is gated, physical card QR scans and redeems meals without interruption
    const cardToken = generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion);
    const customerMap = {
      [customer.memberNo]: {
        keyVersion: customer.keyVersion,
        cardVersion: customer.cardVersion,
        cardStatus: customer.cardStatus,
      },
    };
    const verified = verifyQrToken(cardToken, customer.restaurantCode, customerMap);
    assert.equal(verified.valid, true);

    const initialBal7 = restoStore.getCustomerBalance(customer.id);
    const scanFallback = restoStore.processScan(cardToken);
    assert.equal(scanFallback.scanEvent.status, 'approved');
    assert.equal(scanFallback.scanEvent.platesDeducted, 1);
    assert.equal(restoStore.getCustomerBalance(customer.id), initialBal7 - 1);

    // Case D: Customer pays 500 RWF via Mobile Money -> Dashboard access unlocked
    const checkout = restoStore.initiateStudentCheckout({
      customerId: customer.id,
      phoneNumber: customer.phone,
      provider: 'mtn_momo',
    });
    assert.equal(checkout.success, true);
    assert.ok(checkout.payment);

    const verifyResult = restoStore.verifyStudentPayment(checkout.payment!.internalReference);
    assert.equal(verifyResult.success, true);
    assert.equal(verifyResult.subscription?.status, 'active');

    const entSubscribed = restoStore.checkStudentEntitlement(customer.id, 'customer_dashboard');
    assert.equal(entSubscribed.allowed, true);
  });

  test('Step 8: Boss approves new registration -> Customer immediately sets up PIN on Customer Portal without Magic Link/WhatsApp', async () => {
    const reg = restoStore.registerProvisionalCustomer({
      name: 'Habimana Patrick',
      phone: '+250 788 334 455',
      restaurantCode: 'RW01',
      platesRequested: 30,
      idType: 'student_id',
      idNumber: '20264455',
      isStudent: true,
    } as any);
    assert.ok(reg.customer);
    const customerId = reg.customer.id;

    // Before boss approval, portal status reports pending_boss_approval
    const beforeApprovalStatus = restoStore.checkCustomerPortalStatus('+250 788 334 455', 'RW01');
    assert.ok(beforeApprovalStatus.customer);
    assert.equal(beforeApprovalStatus.status, 'pending_boss_approval');

    // Boss approves new customer registration
    const pendingReq = restoStore.getState().pendingApprovals.find(
      (a) => a.customerId === customerId && a.status === 'pending'
    );
    assert.ok(pendingReq);
    const approveRes = restoStore.approvePendingRequest(pendingReq.id, 'Boss Jean Paul');
    assert.equal(approveRes.success, true);

    // First-time customer has cardReadyForPrint = true
    assert.equal(approveRes.customer?.cardReadyForPrint, true);

    // Portal status now reports needs_pin_setup
    const afterApprovalStatus = restoStore.checkCustomerPortalStatus('+250 788 334 455', 'RW01');
    assert.ok(afterApprovalStatus.customer);
    assert.equal(afterApprovalStatus.status, 'needs_pin_setup');

    // Customer sets their 6+ digit personal PIN directly on Customer Portal
    const pinSetupRes = await restoStore.setupFirstTimeCustomerPin({
      phoneOrMember: '+250 788 334 455',
      newPin: '748392',
      restaurantCode: 'RW01',
    });
    assert.equal(pinSetupRes.success, true);
    assert.equal(pinSetupRes.customer?.activationStatus, 'active');
    assert.equal(pinSetupRes.customer?.hasCustomPin, true);

    // Customer can now sign in with Phone + PIN
    const loginRes = await restoStore.customerLogin({
      phone: '+250 788 334 455',
      pin: '748392',
    });
    assert.equal(loginRes.success, true);
    assert.equal(loginRes.customer?.id, customerId);

    // Verify customer received in-app notifications for registration, boss approval, and PIN setup
    const customerNotifs = restoStore.getCustomerNotifications(customerId);
    assert.ok(customerNotifs.length >= 3, 'Customer must receive in-app notifications for account lifecycle events');
  });

  test('Step 9: Permanent Physical Card Rule -> Never expires across top-ups or temporary lock/unlock; old card permanently blocked when revoked & reissued', () => {
    const customer = restoStore.getState().customers[0];
    assert.ok(customer);

    // Mark first-time physical card as printed
    customer.cardReadyForPrint = false;
    assert.equal(customer.cardReadyForPrint, false);
    const originalCardVersion = customer.cardVersion;
    const cardTokenV1 = generateCardToken(customer.restaurantCode, customer.memberNo, originalCardVersion);

    // 1. Existing customer tops up -> physical card remains permanent, cardReadyForPrint stays false
    const topupApproval = restoStore.rechargeProvisionalCustomer({
      restaurantCode: customer.restaurantCode,
      customerId: customer.id,
      platesRequested: 20,
      amountRwf: 23000,
      paymentMethod: 'mtn_momo',
      paymentReference: 'MOMO-PERM-CARD-01',
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Cashier Claudine',
      stationId: 'station_1',
      stationName: 'Main Gate Stand',
    });
    assert.ok(topupApproval.id);

    const approveTopup = restoStore.approvePendingRequest(topupApproval.id, 'Boss Jean Paul');
    assert.equal(approveTopup.success, true);
    assert.equal(customer.cardReadyForPrint, false, 'Top-up must not mark permanent physical card for re-printing');
    assert.equal(customer.cardVersion, originalCardVersion, 'Top-up must not alter permanent physical card version');

    // 2. Temporary lock and unlock preserves permanent physical card version
    restoStore.setCustomerCardStatus(customer.id, 'locked', 'Temporary security check');
    const lockedScan = restoStore.processScan(cardTokenV1);
    assert.notEqual(lockedScan.scanEvent.status, 'approved', 'Locked card must be rejected while locked');

    restoStore.setCustomerCardStatus(customer.id, 'active', 'Customer confirmed card in hand');
    assert.equal(customer.cardVersion, originalCardVersion, 'Unlocking a temporarily locked card must keep same cardVersion');

    // Clear previous station scans for this customer to test immediate scan after unlock
    restoStore.getState().scanEvents = restoStore.getState().scanEvents.filter(
      (e) => e.customerId !== customer.id
    );

    const unlockedScan = restoStore.processScan(cardTokenV1);
    assert.equal(unlockedScan.scanEvent.status, 'approved', 'Permanent physical card V1 works again once unlocked');

    // 3. Stolen card revoked & reissued -> V1 permanently invalidated, V2 works immediately
    restoStore.reissueCard(customer.id, 'Physical card reported stolen by patron');
    assert.equal(customer.cardVersion, originalCardVersion + 1, 'Reissuing stolen card must increment cardVersion');

    // Clear previous station scans for this customer to test immediate scan with old V1 vs new V2
    restoStore.getState().scanEvents = restoStore.getState().scanEvents.filter(
      (e) => e.customerId !== customer.id
    );

    const stolenV1Scan = restoStore.processScan(cardTokenV1);
    assert.equal(stolenV1Scan.scanEvent.status, 'blocked', 'Revoked V1 physical card must never work again');
    assert.match(stolenV1Scan.rejectionReason || '', /Obsolete card|reissued|revoked/i);

    const newCardTokenV2 = generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion);
    const newV2Scan = restoStore.processScan(newCardTokenV2);
    assert.equal(newV2Scan.scanEvent.status, 'approved', 'Newly issued V2 physical card works immediately with customer balance');
  });

  test('Step 10: Time-Dependent Monthly Restaurant License (7-Day Warning, Auto-Expiry Lock, Super Admin Renewal) & Full Customer Subscription Enforcement', () => {
    const customer = restoStore.getState().customers[0];
    assert.ok(customer);

    // 1. Set restaurant license to 5 days remaining -> triggers 7-day expiry warning
    restoStore.setRestaurantLicenseRemainingDays('RW01', 5);
    const warnStatus = restoStore.getRestaurantLicenseStatus('RW01');
    assert.equal(warnStatus.status, 'expiring_soon');
    assert.equal(warnStatus.isExpiringSoon, true);
    assert.equal(warnStatus.isExpired, false);
    assert.ok(warnStatus.daysRemaining <= 7 && warnStatus.daysRemaining > 0);

    // 2. Monthly subscription ends -> license automatically expires and blocks scanning
    restoStore.setRestaurantLicenseRemainingDays('RW01', -1);
    const expStatus = restoStore.getRestaurantLicenseStatus('RW01');
    assert.equal(expStatus.status, 'expired');
    assert.equal(expStatus.isExpired, true);

    const cardToken = generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion);
    const blockedByExpiredLicense = restoStore.processScan(cardToken);
    assert.equal(blockedByExpiredLicense.outcome, 'REJECTED');
    assert.equal(blockedByExpiredLicense.rejectionCode, 'LICENSE_INVALID');

    // 3. Super Admin renews/activates 30-day license -> immediately unlocks restaurant operations
    const renewedLic = restoStore.renewRestaurantLicense({
      restaurantCode: 'RW01',
      validDays: 30,
    });
    assert.ok(renewedLic.id);
    const activeStatus = restoStore.getRestaurantLicenseStatus('RW01');
    assert.equal(activeStatus.status, 'active');
    assert.equal(activeStatus.isExpired, false);
    assert.equal(activeStatus.isExpiringSoon, false);

    // 4. Customer Subscription Enforcement across every customer feature when enabled
    restoStore.updateStudentSubscriptionSettings({
      enabled: true,
      priceRwf: 500,
      graceDays: 3,
    });

    const unsubscribedCust = restoStore.getState().customers[2];
    assert.ok(unsubscribedCust);
    // Ensure unsubscribedCust has no active subscription
    restoStore.getState().customerSubscriptions = restoStore
      .getState()
      .customerSubscriptions.filter((s) => s.customerId !== unsubscribedCust.id);

    // Digital phone QR generation is blocked without subscription
    const phoneQrBlocked = restoStore.getCustomerPhoneQr(unsubscribedCust);
    assert.equal(phoneQrBlocked.token, '', 'Digital phone QR must not be generated without active subscription');

    // Plate transfer is blocked without subscription
    const transferBlocked = restoStore.transferPlates({
      senderCustomerId: unsubscribedCust.id,
      recipientIdentifier: customer.memberNo,
      plates: 1,
      pin: '1234',
    });
    assert.equal(transferBlocked.success, false);
    assert.equal(transferBlocked.requiresSubscription, true);
  });

  test('Step 11: Single-Plate Pricing, Dual-Control Co-Signing (>120p), P&L Co-Pilot & Super Admin Subscription Toggle', () => {
    // 1. Single Plate Base Rate & Dynamic Bundle Calculation
    const singleRate = restoStore.getRestaurantDefaultPlatePrice('RW01');
    assert.ok(singleRate >= 1000, 'Baseline single plate price is configured');

    const calc7 = restoStore.calculatePlatesPrice('RW01', 7);
    assert.equal(calc7.amountRwf, 7 * singleRate, '7 plates calculated at unit rate');

    const calc60 = restoStore.calculatePlatesPrice('RW01', 60);
    assert.ok(calc60.amountRwf > 0, '60 plates bundle calculated correctly');

    // 2. High-Liability Dual Control (> 120 plates / 2-month threshold)
    const { approval: highValApproval, customer: highValCustomer } = restoStore.registerProvisionalCustomer({
      restaurantCode: 'RW01',
      name: 'Aimable Nkurunziza',
      phone: '+250788334455',
      idType: 'national_id',
      idNumber: '1199880011223344',
      isStudent: false,
      platesRequested: 150, // > 120 plates!
      amountRwf: 150000,
      paymentMethod: 'mtn_momo',
      paymentReference: 'MOMO-HIGH-VAL-991',
      registeredByStaffId: 'staff_1',
      registeredByStaffName: 'Cashier Alice',
      stationId: 'sp_1',
      stationName: 'Stand 1',
    });

    assert.equal(highValApproval.requiresSuperAdminCoSign, true);
    assert.equal(highValApproval.coSignStatus, 'pending_super_admin');

    // Boss approves payment verification
    const bossReview = restoStore.approvePendingRequest(highValApproval.id, 'Restaurant Boss (Executive)');
    assert.equal(bossReview.success, true);
    // Ledger credit is withheld until Super Admin co-signs
    assert.equal(highValApproval.coSignStatus, 'pending_super_admin');
    const balanceBeforeCoSign = restoStore.getCustomerBalance(highValApproval.customerId);
    assert.equal(balanceBeforeCoSign, 0, 'Plates not credited to balance before Super Admin co-sign');

    // Super Admin co-signs
    const coSignResult = restoStore.coSignPendingRequest(highValApproval.id, 'Ephrem (Founder & Super Admin)');
    assert.equal(coSignResult.success, true);
    assert.equal(highValApproval.coSignStatus, 'co_signed');
    assert.ok(highValApproval.coSignature?.startsWith('COSIGN-'));
    const balanceAfterCoSign = restoStore.getCustomerBalance(highValApproval.customerId);
    assert.equal(balanceAfterCoSign, 150, '150 plates credited after Super Admin cryptographic co-signature');

    // 3. Operating Expense Recording & Profit/Loss (P&L) Co-Pilot
    const exp = restoStore.addRestaurantExpense({
      restaurantCode: 'RW01',
      category: 'food_supplies',
      amountRwf: 85000,
      description: '100kg Rice & Dry Beans Wholesale',
      supplierName: 'Nyabugogo Grain Hub',
      receiptNumber: 'INV-8891',
      recordedByName: 'Manager Ephrem',
    });
    assert.ok(exp.id);
    assert.equal(exp.amountRwf, 85000);

    const pnl = restoStore.getRestaurantProfitAndLoss('RW01');
    assert.ok(pnl.totalExpensesRwf >= 85000);
    assert.ok(typeof pnl.grossProfitRwf === 'number');
    assert.ok(pnl.healthStatus === 'profitable' || pnl.healthStatus === 'balanced' || pnl.healthStatus === 'loss_warning');

    // 4. Super Admin Toggles Customer Subscription OFF -> All features unlocked without payment
    restoStore.updateStudentSubscriptionSettings({
      enabled: false,
    });
    const subSettings = restoStore.getStudentSubscriptionSettings();
    assert.equal(subSettings.enabled, false);

    const testCust = restoStore.getState().customers.find((c) => c.id === highValApproval.customerId);
    assert.ok(testCust);
    const phoneQrUnlocked = restoStore.getCustomerPhoneQr(testCust);
    assert.ok(phoneQrUnlocked.token.length > 0, 'Digital phone QR works when monetization is toggled OFF');
  });
});
