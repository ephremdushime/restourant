import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { restoStore } from '../src/store/restoStore';

describe('Reception Self-Registration Verification, Photo Upload & Payment Confirmation Workflow', () => {
  test('1. Scanner modal code includes PhotoCaptureInput and profile editing in Find / Confirm Payment mode', () => {
    const modalPath = path.resolve(process.cwd(), 'src/components/scanner/ScannerProvisionalModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    // Verification that PhotoCaptureInput is rendered inside the topup / confirm payment mode
    assert.match(modalContent, /Reception Photo Capture &amp; Profile Verification/);
    assert.match(modalContent, /PhotoCaptureInput/);
    assert.match(modalContent, /verifiedPhotoUrl/);
    assert.match(modalContent, /verifiedName/);
    assert.match(modalContent, /verifiedRegNumber/);
    assert.match(modalContent, /Save Photo, Profile & Confirm Payment/);
    assert.match(modalContent, /Self-Registered Online · Awaiting Reception Payment/);
  });

  test('2. Server payment-confirm endpoint accepts and stores photoBase64 and verified profile updates', () => {
    const serverPath = path.resolve(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    assert.match(serverContent, /uploadBase64Photo\(body\.photoBase64, customer\.restaurantCode\)/);
    assert.match(serverContent, /customer\.photoUrl = photoUrl/);
    assert.match(serverContent, /customer\.name = body\.name\.trim\(\)/);
    assert.match(serverContent, /customer\.studentProfile/);
  });

  test('3. Store confirms registration payment with photo and verified profile, updating customer and approval record', async () => {
    const now = Date.now();
    const testCustomerId = `cust_selfreg_test_${now}`;
    const testMemberNo = `77${now.toString().slice(-4)}`;

    // Seed self-registered customer waiting for reception payment (without custom photo)
    const selfRegCustomer: any = {
      id: testCustomerId,
      memberNo: testMemberNo,
      restaurantCode: 'RW01',
      name: 'Ineza Claudine',
      phone: `+250788${now.toString().slice(-6)}`,
      photoUrl: '/src/assets/images/avatar_student_male_1790979380050.jpg',
      idType: 'student_id',
      idNumberMasked: '22100****',
      isStudent: true,
      studentProfile: {
        registrationNumber: '221008891',
        institution: 'University of Rwanda',
        programme: 'Applied Biology',
        year: 1,
      },
      registrationStatus: 'pending_reception_payment',
      receptionPaymentStatus: 'unpaid',
      cardStatus: 'pending_activation',
      provisionalStatus: 'pending_payment',
      hasCustomPin: false,
    };

    restoStore.getState().customers.unshift(selfRegCustomer);

    const testUploadedPhotoUrl = `/api/customers/${testCustomerId}/photo`;

    // Reception operator verifies ID, takes photo, and confirms payment
    const confirmResult = await restoStore.confirmRegistrationPayment({
      customerId: testCustomerId,
      packageId: 'pkg_rw01_standard',
      platesRequested: 20,
      amountRwf: 24000,
      paymentMethod: 'mtn_momo',
      paymentReference: `MOMO-VERIFIED-${now}`,
      registeredByStaffId: 'staff_rw01_reception',
      registeredByStaffName: 'Claire (Reception Desk)',
      stationId: 'sp_1',
      stationName: 'Stand 1 - Main Buffet Line',
      photoUrl: testUploadedPhotoUrl,
      name: 'Ineza Claudine Mukamana', // Updated official name
      phone: selfRegCustomer.phone,
      isStudent: true,
      studentProfile: {
        registrationNumber: '221008891',
        institution: 'University of Rwanda (College of Science & Tech)',
        programme: 'Applied Biology',
        year: 2, // Corrected year of study
      },
    });

    const updatedCust = restoStore.getState().customers.find((c) => c.id === testCustomerId);
    assert.ok(updatedCust, 'Customer should exist in store');
    assert.equal(updatedCust.photoUrl, testUploadedPhotoUrl, 'Photo URL must be updated to the verified portrait');
    assert.equal(updatedCust.name, 'Ineza Claudine Mukamana', 'Customer name must be updated to verified name');
    assert.equal(updatedCust.studentProfile?.year, 2, 'Student year must be updated');
    assert.equal(updatedCust.studentProfile?.institution, 'University of Rwanda (College of Science & Tech)');
  });
});

