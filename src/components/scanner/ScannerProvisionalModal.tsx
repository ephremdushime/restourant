import React, { useState } from 'react';
import { Customer, PaymentMethod } from '../../types';
import { restoStore } from '../../store/restoStore';
import { PrivatePhoto } from '../common/PrivatePhoto';
import { PhotoCaptureInput } from '../common/PhotoCaptureInput';
import {
  UserPlus,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  X,
  Camera,
  Edit3,
  Sparkles,
  UserCheck,
} from 'lucide-react';

interface ScannerProvisionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessScan?: (token: string) => void;
}

export const ScannerProvisionalModal: React.FC<ScannerProvisionalModalProps> = ({
  isOpen,
  onClose,
  onSuccessScan,
}) => {
  const state = restoStore.getState();
  const restoCode = state.currentRestaurantCode;
  const packages = restoStore.getRestaurantPackages(restoCode);
  const branches = restoStore.getRestaurantBranches(restoCode);
  const currentStation =
    state.scanPoints.find((sp) => sp.id === state.currentStationId) || state.scanPoints[0];

  const [activeMode, setActiveMode] = useState<'new_customer' | 'topup'>('new_customer');

  // Form fields for new customer (persisted across form updates; no fake fallback IDs)
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('/src/assets/images/avatar_student_male_1790979380050.jpg');
  const [branchId, setBranchId] = useState(branches[0]?.id || 'br_rw01_main');
  const [isStudent, setIsStudent] = useState(true);
  const [institution, setInstitution] = useState('');
  const [programme, setProgramme] = useState('');
  const [year, setYear] = useState(1);
  const [regNumber, setRegNumber] = useState('');
  const [idNumber, setIdNumber] = useState('');

  // Payment & Package
  const [selectedPackageId, setSelectedPackageId] = useState<string>(packages[0]?.id || '');
  const [isCustomPlates, setIsCustomPlates] = useState(false);
  const [customPlates, setCustomPlates] = useState(10);
  const [customPrice, setCustomPrice] = useState(
    10 * restoStore.getRestaurantDefaultPlatePrice(restoCode)
  );

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn_momo');
  const [paymentReference, setPaymentReference] = useState('');
  const [staffName, setStaffName] = useState('Station Reception Desk');

  // Top-Up Mode existing customer search & reception profile/photo verification
  const [topupSearch, setTopupSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Profile & photo verification fields for selected customer at reception
  const [verifiedName, setVerifiedName] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [verifiedPhotoUrl, setVerifiedPhotoUrl] = useState('/src/assets/images/avatar_student_male_1790979380050.jpg');
  const [verifiedIsStudent, setVerifiedIsStudent] = useState(true);
  const [verifiedRegNumber, setVerifiedRegNumber] = useState('');
  const [verifiedInstitution, setVerifiedInstitution] = useState('');
  const [verifiedProgramme, setVerifiedProgramme] = useState('');
  const [verifiedYear, setVerifiedYear] = useState(1);
  const [verifiedIdNumber, setVerifiedIdNumber] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setTopupSearch('');
    setVerifiedName(c.name || '');
    setVerifiedPhone(c.phone || '');
    setVerifiedPhotoUrl(c.photoUrl || '/src/assets/images/avatar_student_male_1790979380050.jpg');
    setVerifiedIsStudent(c.isStudent ?? true);
    setVerifiedRegNumber(c.studentProfile?.registrationNumber || c.idNumberMasked?.replace(/\*/g, '') || '');
    setVerifiedInstitution(c.studentProfile?.institution || 'University Campus');
    setVerifiedProgramme(c.studentProfile?.programme || '');
    setVerifiedYear(c.studentProfile?.year || 1);
    setVerifiedIdNumber(c.idNumberMasked || '');
    const isSelfReg = c.registrationStatus === 'pending_reception_payment';
    const isDefaultAvatar = !c.photoUrl || c.photoUrl.includes('avatar_student_male');
    setIsEditingProfile(isSelfReg || isDefaultAvatar);
    setError(null);
  };

  // Status & Feedback
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    customer: Customer;
    plates: number;
    amount: number;
    ref: string;
    qrToken: string;
  } | null>(null);

  if (!isOpen) return null;

  const currentBranch = branches.find((b) => b.id === branchId) || branches[0];
  const selectedPkg = packages.find((p) => p.id === selectedPackageId) || packages[0];

  const effectivePlates = isCustomPlates ? customPlates : selectedPkg ? selectedPkg.platesCount : 10;
  const effectiveAmount = isCustomPlates ? customPrice : selectedPkg ? selectedPkg.priceRwf : 12000;

  const resetNewCustomerFields = () => {
    setName('');
    setPhone('');
    setInstitution('');
    setProgramme('');
    setYear(1);
    setRegNumber('');
    setIdNumber('');
    setPaymentReference('');
    setError(null);
  };

  const isValidPhoneNumber = (rawPhone: string): boolean => {
    const cleaned = rawPhone.replace(/[\s()-]/g, '');
    // Accept Rwandan mobile formats (+2507XXXXXXXX, 2507XXXXXXXX, 07XXXXXXXX) or valid 9-15 digit phone numbers
    if (/^(\+?250|0)?7[2389]\d{7}$/.test(cleaned)) return true;
    const digitsOnly = cleaned.replace(/\D/g, '');
    return digitsOnly.length >= 9 && digitsOnly.length <= 15;
  };

  const handleRegisterNewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedRegNo = regNumber.trim();
    const trimmedNationalId = idNumber.trim();
    const trimmedInstitution = institution.trim();
    const trimmedPaymentRef = paymentReference.trim().toUpperCase();

    if (trimmedName.length < 2) return setError('Please enter the customer full name (at least 2 characters).');
    if (!trimmedPhone || !isValidPhoneNumber(trimmedPhone)) return setError('Please enter a valid phone number.');
    if (isStudent && (!trimmedRegNo || !trimmedInstitution)) return setError('Enter the student registration number and institution.');
    if (!isStudent && !trimmedNationalId) return setError('Enter the National ID or Passport number.');
    if (paymentMethod !== 'cash' && !trimmedPaymentRef) return setError('Enter the payment transaction reference.');
    if (!staffName.trim()) return setError('Enter the reception or staff operator name.');
    if (isCustomPlates || !selectedPkg?.id) return setError('Choose a configured meal package for this registration.');

    const effectiveIdType = isStudent ? 'student_id' : 'national_id';
    const effectiveIdNumber = isStudent ? trimmedRegNo : trimmedNationalId;
    const capturedPhoto = photoUrl.startsWith('data:') ? photoUrl : null;

    try {
      const registrationResponse = await fetch('/api/public/customer/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantCode: restoCode,
          branchId: currentBranch?.id,
          name: trimmedName,
          phone: trimmedPhone,
          idType: effectiveIdType,
          idNumber: effectiveIdNumber,
          isStudent,
          institution: trimmedInstitution,
          programme: programme.trim() || 'Not provided',
          year,
          registrationNumber: trimmedRegNo,
        }),
      });
      const registration = await registrationResponse.json();
      if (!registrationResponse.ok || !registration.success || !registration.customer?.id) {
        throw new Error(registration.error || 'Customer registration could not be saved.');
      }

      const paymentResult = await restoStore.confirmRegistrationPayment({
        customerId: registration.customer.id,
        packageId: selectedPkg.id,
        platesRequested: effectivePlates,
        amountRwf: effectiveAmount,
        paymentMethod,
        paymentReference: trimmedPaymentRef || `CASH-${Date.now()}`,
        registeredByStaffId: currentStation?.assignedStaffUserId || 'reception_staff',
        registeredByStaffName: staffName.trim(),
        stationId: currentStation?.id || 'sp_1',
        stationName: currentStation?.name || 'Reception & Stand 1',
      });
      if (!paymentResult.success) {
        throw new Error(`Registration saved as #${registration.customer.memberNo}, but payment was not confirmed: ${paymentResult.error || 'Please find this customer and retry payment confirmation.'}`);
      }

      if (capturedPhoto) {
        const photoResult = await restoStore.uploadCustomerPhoto(registration.customer.id, capturedPhoto);
        if (!photoResult.success) {
          setError(`Payment was confirmed for #${registration.customer.memberNo}, but the portrait could not be saved. Retry the photo from the customer profile.`);
        }
      }
      const updatedCustomer = restoStore.getState().customers.find((c) => c.id === registration.customer.id);
      if (!updatedCustomer) throw new Error('Payment was confirmed, but the customer record has not synchronized yet. Refresh the reception station.');
      const result = { customer: updatedCustomer };
      const qrToken = restoStore.isDemoModeActive() ? restoStore.getCustomerCardQr(result.customer) : await restoStore.getServerCustomerCardQr(result.customer);
      setSuccessResult({
        customer: updatedCustomer,
        plates: effectivePlates,
        amount: effectiveAmount,
        ref: paymentResult.approval?.paymentReference || trimmedPaymentRef || 'CASH',
        qrToken,
      });
      resetNewCustomerFields();
    } catch (err: any) {
      setError(err?.message || 'Registration or payment confirmation failed. Check the customer record before retrying.');
    }
  };

  const handleTopupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedCustomer) {
      setError('Please search and select a customer account first.');
      return;
    }
    if (paymentMethod !== 'cash' && !paymentReference.trim()) {
      setError('Please enter the payment transaction reference.');
      return;
    }
    if (!staffName.trim()) {
      setError('Please enter the reception or staff operator name.');
      return;
    }

    try {
      const reference = paymentReference.trim().toUpperCase();
      const isPendingPayment = selectedCustomer.registrationStatus === 'pending_reception_payment';
      const capturedPhoto = verifiedPhotoUrl.startsWith('data:') ? verifiedPhotoUrl : undefined;

      // 1. If photo was captured via camera or file upload, upload it to the photo service
      let finalPhotoUrl = verifiedPhotoUrl;
      if (capturedPhoto) {
        const photoUploadRes = await restoStore.uploadCustomerPhoto(selectedCustomer.id, capturedPhoto);
        if (photoUploadRes.success && photoUploadRes.photoUrl) {
          finalPhotoUrl = photoUploadRes.photoUrl;
        }
      }

      // 2. If profile details were edited at reception, update the customer profile
      const nameChanged = verifiedName.trim() && verifiedName.trim() !== selectedCustomer.name;
      const phoneChanged = verifiedPhone.trim() && verifiedPhone.trim() !== selectedCustomer.phone;
      const studentDetailsChanged =
        verifiedIsStudent !== selectedCustomer.isStudent ||
        verifiedRegNumber.trim() !== (selectedCustomer.studentProfile?.registrationNumber || '') ||
        verifiedInstitution.trim() !== (selectedCustomer.studentProfile?.institution || '') ||
        verifiedProgramme.trim() !== (selectedCustomer.studentProfile?.programme || '') ||
        verifiedYear !== (selectedCustomer.studentProfile?.year || 1);

      if (nameChanged || phoneChanged || studentDetailsChanged || (finalPhotoUrl && finalPhotoUrl !== selectedCustomer.photoUrl)) {
        restoStore.updateCustomerProfile(
          selectedCustomer.id,
          {
            name: verifiedName.trim() || selectedCustomer.name,
            phone: verifiedPhone.trim() || selectedCustomer.phone,
            photoUrl: finalPhotoUrl.startsWith('data:') ? undefined : finalPhotoUrl,
            isStudent: verifiedIsStudent,
            studentProfile: verifiedIsStudent
              ? {
                institution: verifiedInstitution.trim() || 'University Campus',
                programme: verifiedProgramme.trim() || 'General',
                year: verifiedYear || 1,
                registrationNumber: verifiedRegNumber.trim() || selectedCustomer.memberNo,
              }
              : undefined,
          },
          staffName.trim()
        );
      }

      // 3. Confirm registration payment or submit top-up
      if (isPendingPayment) {
        if (isCustomPlates) throw new Error('Choose a configured meal package to confirm a new registration payment.');
        const result = await restoStore.confirmRegistrationPayment({
          customerId: selectedCustomer.id,
          packageId: isCustomPlates ? undefined : selectedPkg?.id,
          platesRequested: effectivePlates,
          amountRwf: effectiveAmount,
          paymentMethod,
          paymentReference: reference,
          registeredByStaffId: currentStation?.assignedStaffUserId || 'reception_staff',
          registeredByStaffName: staffName.trim(),
          stationId: currentStation?.id || 'sp_1',
          stationName: currentStation?.name || 'Reception & Stand 1',
          photoBase64: capturedPhoto,
          photoUrl: finalPhotoUrl,
          name: verifiedName.trim() || selectedCustomer.name,
          phone: verifiedPhone.trim() || selectedCustomer.phone,
          isStudent: verifiedIsStudent,
          studentProfile: {
            institution: verifiedInstitution.trim() || 'University Campus',
            programme: verifiedProgramme.trim() || 'General',
            year: verifiedYear || 1,
            registrationNumber: verifiedRegNumber.trim() || selectedCustomer.memberNo,
          },
        });
        if (!result.success) throw new Error(result.error || 'Payment confirmation failed.');
      } else {
        restoStore.rechargeProvisionalCustomer(
          {
            restaurantCode: restoCode,
            branchId: currentBranch?.id || selectedCustomer.branchId || 'br_rw01_main',
            branchName: currentBranch?.name || selectedCustomer.branchName || 'Main Campus Dining Hall',
            customerId: selectedCustomer.id,
            packageId: isCustomPlates ? undefined : selectedPkg?.id,
            platesRequested: effectivePlates,
            amountRwf: effectiveAmount,
            paymentMethod,
            paymentReference: reference || `CASH-${Date.now()}`,
            registeredByStaffId: currentStation?.assignedStaffUserId || 'reception_staff',
            registeredByStaffName: staffName.trim(),
            stationId: currentStation?.id || 'sp_1',
            stationName: currentStation?.name || 'Reception & Stand 1',
          },
          staffName.trim()
        );
      }

      const updatedCustomer = restoStore.getState().customers.find((c) => c.id === selectedCustomer.id) || selectedCustomer;
      const qrToken = restoStore.isDemoModeActive() ? restoStore.getCustomerCardQr(selectedCustomer) : await restoStore.getServerCustomerCardQr(selectedCustomer);
      setPaymentReference('');
      setSuccessResult({
        customer: updatedCustomer,
        plates: effectivePlates,
        amount: effectiveAmount,
        ref: reference || 'CASH',
        qrToken,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm payment.');
    }
  };

  const matchingCustomers = state.customers.filter((c) => {
    if (c.restaurantCode !== restoCode) return false;
    const q = topupSearch.toLowerCase().trim();
    if (!q) return false;
    return (
      c.name.toLowerCase().includes(q) ||
      c.memberNo.includes(q) ||
      c.phone.replace(/[\s-]/g, '').includes(q.replace(/[\s-]/g, ''))
    );
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="provisional-modal-title"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border-2 border-slate-700 rounded-3xl max-w-2xl w-full p-5 sm:p-7 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h3 id="provisional-modal-title" className="text-lg sm:text-xl font-black text-white tracking-tight">
                Customer Registration &amp; Top-Up Desk
              </h3>
              <p className="text-sm text-slate-300 mt-0.5">
                Register walk-ins, confirm payments for online registrations, or record recharges. Reception-confirmed new accounts receive up to <strong>4 grace meals</strong> while awaiting boss approval.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSuccessResult(null);
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="Close registration modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success View */}
        {successResult ? (
          <div className="p-6 rounded-2xl bg-emerald-950/90 border-2 border-emerald-500 text-white space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center mx-auto shadow-lg font-bold">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <h4 className="text-2xl font-black text-white">
                Submission Recorded!
              </h4>
              <p className="text-sm text-emerald-100 mt-1.5 max-w-md mx-auto leading-relaxed">
                Customer <strong>#{successResult.customer.memberNo} ({successResult.customer.name})</strong> has been registered and the reception payment has been confirmed. It is now awaiting final boss approval.
              </p>
            </div>

            {/* Grace Plates Notice */}
            <div className="p-4 rounded-xl bg-black/50 border border-emerald-400/50 text-left space-y-2 text-sm">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-base">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span>Grace Meals Policy: Up to 4 Plates Authorized</span>
              </div>
              <p className="text-slate-200 text-sm leading-relaxed">
                Reception has confirmed {successResult.amount.toLocaleString()} RWF for {successResult.plates} plates (reference: <strong>{successResult.ref}</strong>). The customer may consume up to <strong>4 grace meals</strong> while the boss reviews the registration.
              </p>
            </div>

            {/* Quick Scan & Done buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {onSuccessScan && (
                <button
                  type="button"
                  onClick={() => {
                    const tok = successResult.qrToken;
                    setSuccessResult(null);
                    onSuccessScan(tok);
                    onClose();
                  }}
                  className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-md cursor-pointer transition-all"
                >
                  Serve First Plate Now &rarr;
                </button>
              )}

              <button
                type="button"
                onClick={() => setSuccessResult(null)}
                className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-colors cursor-pointer border border-slate-600"
              >
                Register Another
              </button>

              <button
                type="button"
                onClick={() => {
                  setSuccessResult(null);
                  onClose();
                }}
                className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition-colors cursor-pointer"
              >
                Done / Close
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Mode Switcher: New Customer vs Existing Customer Top-Up */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-950 rounded-2xl border border-slate-800 text-sm">
              <button
                type="button"
                onClick={() => {
                  setActiveMode('new_customer');
                  setError(null);
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 ${activeMode === 'new_customer'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
                  }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>New Customer Registration</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveMode('topup');
                  setError(null);
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 ${activeMode === 'topup'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
                  }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Find / Confirm Payment</span>
              </button>
            </div>

            {/* Boss Delegation Banner */}
            <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/50 text-sm text-amber-100 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Boss Approval Policy:</strong> Collect payment, record the Mobile Money reference, and submit. New registrations with confirmed reception payment can use up to <strong>4 grace plates</strong> while waiting for boss approval.
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-2xl bg-rose-950/90 border-2 border-rose-500 text-rose-100 text-sm font-semibold flex items-center gap-2.5"
              >
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* FORM A: NEW CUSTOMER REGISTRATION */}
            {activeMode === 'new_customer' && (
              <form onSubmit={handleRegisterNewSubmit} className="space-y-4 text-sm" noValidate>
                {/* Name & Phone (Primary Focus Fields) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reg-customer-name" className="font-bold text-white block mb-1.5 text-sm">
                      Customer Full Name <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      id="reg-customer-name"
                      name="customerFullName"
                      type="text"
                      autoComplete="name"
                      placeholder="e.g. Aimable Nkurunziza"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full py-3 px-3.5 rounded-xl bg-slate-950 border-2 border-slate-700 text-white text-base sm:text-sm font-medium placeholder-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 outline-hidden transition-all"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-customer-phone" className="font-bold text-white block mb-1.5 text-sm">
                      Phone Number <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      id="reg-customer-phone"
                      name="customerPhone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+250 788 123 456"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full py-3 px-3.5 rounded-xl bg-slate-950 border-2 border-slate-700 text-white text-base sm:text-sm font-mono font-semibold placeholder-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 outline-hidden transition-all"
                    />
                  </div>
                </div>

                {/* Branch & Staff metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reg-branch" className="font-bold text-slate-200 block mb-1.5 text-sm">
                      Serving Branch
                    </label>
                    <select
                      id="reg-branch"
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      className="w-full py-3 px-3.5 rounded-xl bg-slate-950 border-2 border-slate-700 text-white text-base sm:text-sm focus:border-emerald-400 outline-hidden"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="reg-staff-name" className="font-bold text-slate-200 block mb-1.5 text-sm">
                      Reception / Staff Name <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      id="reg-staff-name"
                      type="text"
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      className="w-full py-3 px-3.5 rounded-xl bg-slate-950 border-2 border-slate-700 text-white text-base sm:text-sm focus:border-emerald-400 outline-hidden"
                    />
                  </div>
                </div>

                {/* Photo Input (Webcam or upload or preset) */}
                <div>
                  <PhotoCaptureInput
                    photoUrl={photoUrl}
                    onChange={setPhotoUrl}
                    label="Patron Photo (For Card Badge & Spot-Checks)"
                    required={false}
                  />
                </div>

                {/* Student Checkbox & Identity fields (No fake fallback IDs) */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3.5">
                  <div className="flex items-center gap-2.5">
                    <input
                      id="reg-is-student"
                      type="checkbox"
                      checked={isStudent}
                      onChange={(e) => setIsStudent(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label htmlFor="reg-is-student" className="font-bold text-white text-sm cursor-pointer">
                      This patron is a student (student bundle rate)
                    </label>
                  </div>

                  {isStudent ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label htmlFor="reg-student-id" className="text-slate-200 font-semibold block mb-1 text-xs sm:text-sm">
                          Reg / Student ID # <span className="text-emerald-400">*</span>
                        </label>
                        <input
                          id="reg-student-id"
                          type="text"
                          placeholder="e.g. 221004891"
                          value={regNumber}
                          onChange={(e) => setRegNumber(e.target.value)}
                          className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm font-mono placeholder-slate-500 focus:border-emerald-400 outline-hidden"
                        />
                      </div>
                      <div>
                        <label htmlFor="reg-institution" className="text-slate-200 font-semibold block mb-1 text-xs sm:text-sm">
                          Institution <span className="text-emerald-400">*</span>
                        </label>
                        <input
                          id="reg-institution"
                          type="text"
                          placeholder="e.g. University of Rwanda"
                          value={institution}
                          onChange={(e) => setInstitution(e.target.value)}
                          className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm placeholder-slate-500 focus:border-emerald-400 outline-hidden"
                        />
                      </div>
                      <div>
                        <label htmlFor="reg-programme" className="text-slate-200 font-semibold block mb-1 text-xs sm:text-sm">
                          Class / Programme / Faculty
                        </label>
                        <input
                          id="reg-programme"
                          type="text"
                          placeholder="e.g. Class 3B or Computer Science (Yr 2)"
                          value={programme}
                          onChange={(e) => setProgramme(e.target.value)}
                          className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm placeholder-slate-500 focus:border-emerald-400 outline-hidden"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="reg-national-id" className="text-slate-200 font-semibold block mb-1 text-sm">
                        National ID / Passport # <span className="text-emerald-400">*</span>
                      </label>
                      <input
                        id="reg-national-id"
                        type="text"
                        placeholder="Enter 16-digit National ID or Passport number"
                        value={idNumber}
                        onChange={(e) => setIdNumber(e.target.value)}
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm font-mono placeholder-slate-500 focus:border-emerald-400 outline-hidden"
                      />
                    </div>
                  )}
                </div>

                {/* Package & Payment Section */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-bold text-white text-sm">Meal Package &amp; Payment Verification</span>
                    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-700">
                      <button
                        type="button"
                        onClick={() => setIsCustomPlates(false)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${!isCustomPlates ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
                          }`}
                      >
                        Bundle Pack
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCustomPlates(true)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${isCustomPlates ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
                          }`}
                      >
                        Custom Plates
                      </button>
                    </div>
                  </div>

                  {!isCustomPlates ? (
                    <div>
                      <label htmlFor="reg-package" className="text-slate-200 font-semibold block mb-1.5 text-sm">
                        Select Bundle
                      </label>
                      <select
                        id="reg-package"
                        value={selectedPackageId}
                        onChange={(e) => setSelectedPackageId(e.target.value)}
                        className="w-full py-3 px-3.5 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm focus:border-emerald-400 outline-hidden"
                      >
                        {packages.map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.name} ({pkg.platesCount} plates — {pkg.priceRwf.toLocaleString()} RWF)
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="reg-custom-plates" className="text-slate-200 font-semibold block mb-1 text-sm">
                            Number of Plates
                          </label>
                          <input
                            id="reg-custom-plates"
                            type="number"
                            min={1}
                            max={365}
                            value={customPlates}
                            onChange={(e) => {
                              const p = Math.max(1, parseInt(e.target.value) || 1);
                              const calc = restoStore.calculatePlatesPrice(restoCode, p);
                              setCustomPlates(p);
                              setCustomPrice(calc.amountRwf);
                            }}
                            className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white font-mono text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor="reg-custom-price" className="text-slate-200 font-semibold block mb-1 text-sm">
                            Price (RWF)
                          </label>
                          <input
                            id="reg-custom-price"
                            type="number"
                            value={customPrice}
                            onChange={(e) => setCustomPrice(Math.max(100, parseInt(e.target.value) || 100))}
                            className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-emerald-400 font-mono font-bold text-sm"
                          />
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 font-mono flex items-center justify-between">
                        <span>Rate: {restoStore.calculatePlatesPrice(restoCode, customPlates).appliedTier}</span>
                        <span>{customPlates} × {(customPrice / customPlates).toFixed(0)} = {customPrice.toLocaleString()} RWF</span>
                      </div>
                      {customPlates > 120 && (
                        <div className="p-2.5 rounded-xl bg-indigo-950/80 border border-indigo-500/80 text-indigo-200 text-xs flex items-center gap-2">
                          <span className="font-bold text-amber-300">🛡️ Dual Control:</span>
                          <span>Exceeds 120 plates (2+ months). Requires cryptographic co-signing from Super Admin.</span>
                        </div>
                      )}
                    </>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label htmlFor="reg-payment-method" className="text-slate-200 font-semibold block mb-1.5 text-sm">
                        Payment Channel <span className="text-emerald-400">*</span>
                      </label>
                      <select
                        id="reg-payment-method"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full py-3 px-3.5 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm focus:border-emerald-400 outline-hidden"
                      >
                        <option value="mtn_momo">MTN Mobile Money (*182#)</option>
                        <option value="cash">Cash Received at Counter</option>
                        <option value="bank_transfer">Bank Transfer (BK / Equity)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="reg-payment-ref" className="text-slate-200 font-semibold block mb-1.5 text-sm">
                        Payment / MoMo Reference {paymentMethod !== 'cash' && <span className="text-emerald-400">*</span>}
                      </label>
                      <input
                        id="reg-payment-ref"
                        type="text"
                        placeholder="e.g. MOMO-2026-993812"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full py-3 px-3.5 rounded-xl bg-slate-900 border-2 border-slate-700 text-white font-mono font-bold text-sm placeholder-slate-500 focus:border-emerald-400 outline-hidden uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-lg cursor-pointer transition-colors"
                  >
                    Register Customer &amp; Submit for Approval
                  </button>
                </div>
              </form>
            )}

            {/* FORM B: EXISTING CUSTOMER TOP-UP / RECEPTION PAYMENT CONFIRMATION */}
            {activeMode === 'topup' && (
              <form onSubmit={handleTopupSubmit} className="space-y-4 text-sm" noValidate>
                {/* Awaiting Payment Quick Queue (Customers who self-registered online) */}
                {!selectedCustomer && !topupSearch.trim() && (() => {
                  const pendingSelfRegCustomers = state.customers.filter(
                    (c) => c.restaurantCode === restoCode && (c.registrationStatus === 'pending_reception_payment' || c.receptionPaymentStatus === 'unpaid')
                  );
                  if (pendingSelfRegCustomers.length === 0) return null;
                  return (
                    <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                          <span>Self-Registered Online · Awaiting Reception Payment ({pendingSelfRegCustomers.length})</span>
                        </div>
                        <span className="text-[11px] font-mono text-amber-200/80">Pending Photo &amp; Payment</span>
                      </div>
                      <div className="divide-y divide-amber-900/30 rounded-xl bg-slate-950 border border-amber-500/30 overflow-hidden">
                        {pendingSelfRegCustomers.map((c) => (
                          <div key={c.id} className="p-3 flex items-center justify-between hover:bg-slate-900/90 transition-colors">
                            <div className="flex items-center gap-3">
                              <PrivatePhoto src={c.photoUrl} alt="" className="w-10 h-10 rounded-xl object-cover border border-amber-500/50" />
                              <div>
                                <div className="font-bold text-white text-sm">{c.name}</div>
                                <div className="text-xs text-slate-300 font-mono">#{c.memberNo} · {c.phone}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectCustomer(c)}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Take Photo &amp; Pay →</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Search existing member */}
                <div>
                  <label htmlFor="topup-member-search" className="font-bold text-white block mb-1.5 text-sm">
                    Find Registered Customer
                  </label>
                  <input
                    id="topup-member-search"
                    type="text"
                    placeholder="Search by name, member number, or registered phone..."
                    value={topupSearch}
                    onChange={(e) => setTopupSearch(e.target.value)}
                    className="w-full py-3 px-3.5 rounded-xl bg-slate-950 border-2 border-slate-700 text-white font-mono text-base sm:text-sm placeholder-slate-500 focus:border-emerald-400 outline-hidden"
                  />

                  {matchingCustomers.length > 0 && !selectedCustomer && (
                    <div className="mt-2 divide-y divide-slate-800 rounded-xl bg-slate-950 border border-slate-700 max-h-52 overflow-y-auto">
                      {matchingCustomers.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full p-3 flex items-center justify-between hover:bg-slate-800 cursor-pointer text-left"
                        >
                          <div className="flex items-center gap-3">
                            <PrivatePhoto src={c.photoUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                            <div>
                              <div className="font-bold text-white text-sm">{c.name}</div>
                              <div className="text-xs text-slate-300 font-mono">
                                #{c.memberNo} · {c.phone} {c.registrationStatus === 'pending_reception_payment' ? '· (Payment Needed)' : ''}
                              </div>
                            </div>
                          </div>
                          <span className="text-emerald-400 font-mono font-bold text-sm">
                            {c.registrationStatus === 'pending_reception_payment' ? 'New Online Reg' : `${restoStore.getCustomerBalance(c.id)} plates`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedCustomer && (
                    <div className="mt-3 space-y-4">
                      {/* Customer Summary Bar */}
                      <div className="p-3.5 rounded-2xl bg-slate-950 border-2 border-emerald-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <PrivatePhoto
                            src={verifiedPhotoUrl || selectedCustomer.photoUrl}
                            alt=""
                            className="w-12 h-12 rounded-xl object-cover border-2 border-emerald-400 shrink-0"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-white text-base">{verifiedName || selectedCustomer.name}</span>
                              {selectedCustomer.registrationStatus === 'pending_reception_payment' ? (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold uppercase font-mono">
                                  Online Self-Reg
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold uppercase font-mono">
                                  Active Member
                                </span>
                              )}
                            </div>
                            <div className="text-slate-300 font-mono text-xs mt-0.5">
                              Member #{selectedCustomer.memberNo} · {verifiedPhone || selectedCustomer.phone} · {selectedCustomer.registrationStatus === 'pending_reception_payment' ? 'Payment confirmation required' : `Balance: ${restoStore.getCustomerBalance(selectedCustomer.id)} plates`}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => setIsEditingProfile(!isEditingProfile)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{isEditingProfile ? 'Hide Profile Editor' : 'Edit Profile & Photo'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(null)}
                            className="text-xs text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer px-2"
                          >
                            Change
                          </button>
                        </div>
                      </div>

                      {/* Reception Photo Capture & Profile Verification Section */}
                      {isEditingProfile && (
                        <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-700 space-y-4 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                            <div className="flex items-center gap-2">
                              <Camera className="w-4 h-4 text-emerald-400" />
                              <span className="font-bold text-white text-sm">
                                Reception Photo Capture &amp; Profile Verification
                              </span>
                            </div>
                            <span className="text-[11px] text-amber-300 font-medium">
                              {selectedCustomer.registrationStatus === 'pending_reception_payment'
                                ? 'Upload/Take Photo Before Marking Paid'
                                : 'Update Photo or Profile'}
                            </span>
                          </div>

                          {selectedCustomer.registrationStatus === 'pending_reception_payment' && (
                            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-100 text-xs flex items-center gap-2.5">
                              <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span>
                                <strong>Self-Registration Workflow:</strong> This customer registered online. Capture their portrait photo below so it is printed on their smart card and displayed for Boss approval.
                              </span>
                            </div>
                          )}

                          {/* Photo Capture Input */}
                          <div>
                            <PhotoCaptureInput
                              photoUrl={verifiedPhotoUrl}
                              onChange={setVerifiedPhotoUrl}
                              label="Patron Portrait Photo (Webcam Snapshot or File Upload)"
                              required={false}
                            />
                          </div>

                          {/* Editable Customer Fields */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div>
                              <label className="text-slate-200 font-semibold block mb-1 text-xs">
                                Official Full Name <span className="text-emerald-400">*</span>
                              </label>
                              <input
                                type="text"
                                value={verifiedName}
                                onChange={(e) => setVerifiedName(e.target.value)}
                                placeholder="Full patron name"
                                className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm font-medium focus:border-emerald-400 outline-hidden"
                              />
                            </div>

                            <div>
                              <label className="text-slate-200 font-semibold block mb-1 text-xs">
                                Phone Number <span className="text-emerald-400">*</span>
                              </label>
                              <input
                                type="tel"
                                value={verifiedPhone}
                                onChange={(e) => setVerifiedPhone(e.target.value)}
                                placeholder="+250 788 123 456"
                                className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm font-mono font-semibold focus:border-emerald-400 outline-hidden"
                              />
                            </div>
                          </div>

                          {/* Student Specific Fields */}
                          {verifiedIsStudent ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                              <div>
                                <label className="text-slate-200 font-semibold block mb-1 text-xs">
                                  Student Reg # <span className="text-emerald-400">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={verifiedRegNumber}
                                  onChange={(e) => setVerifiedRegNumber(e.target.value)}
                                  placeholder="e.g. 221004891"
                                  className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm font-mono focus:border-emerald-400 outline-hidden"
                                />
                              </div>

                              <div>
                                <label className="text-slate-200 font-semibold block mb-1 text-xs">
                                  Institution <span className="text-emerald-400">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={verifiedInstitution}
                                  onChange={(e) => setVerifiedInstitution(e.target.value)}
                                  placeholder="e.g. University of Rwanda"
                                  className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm focus:border-emerald-400 outline-hidden"
                                />
                              </div>

                              <div>
                                <label className="text-slate-200 font-semibold block mb-1 text-xs">
                                  Programme / Faculty <span className="text-emerald-400">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={verifiedProgramme}
                                  onChange={(e) => setVerifiedProgramme(e.target.value)}
                                  placeholder="e.g. Computer Science"
                                  className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm focus:border-emerald-400 outline-hidden"
                                />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="text-slate-200 font-semibold block mb-1 text-xs">
                                National ID / Passport #
                              </label>
                              <input
                                type="text"
                                value={verifiedIdNumber}
                                onChange={(e) => setVerifiedIdNumber(e.target.value)}
                                placeholder="e.g. 1 1999 8 0045678 1 23"
                                className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm font-mono focus:border-emerald-400 outline-hidden"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Package selection */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{selectedCustomer?.registrationStatus === 'pending_reception_payment' ? 'Registration Meal Package' : 'Top-Up Package'}</span>
                    <span className="text-emerald-400 font-mono font-bold text-sm">
                      +{effectivePlates} Plates ({effectiveAmount.toLocaleString()} RWF)
                    </span>
                  </div>

                  <select
                    value={selectedPackageId}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                    className="w-full py-3 px-3.5 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm focus:border-emerald-400 outline-hidden"
                  >
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.platesCount} plates — {pkg.priceRwf.toLocaleString()} RWF)
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-slate-200 font-semibold block mb-1.5 text-sm">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full py-3 px-3.5 rounded-xl bg-slate-900 border-2 border-slate-700 text-white text-sm focus:border-emerald-400 outline-hidden"
                      >
                        <option value="mtn_momo">MTN Mobile Money (*182#)</option>
                        <option value="cash">Cash Received at Counter</option>
                        <option value="bank_transfer">Bank Transfer</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="topup-payment-ref" className="text-slate-200 font-semibold block mb-1.5 text-sm">
                        Payment Reference {paymentMethod !== 'cash' && <span className="text-emerald-400">*</span>}
                      </label>
                      <input
                        id="topup-payment-ref"
                        type="text"
                        placeholder={paymentMethod === 'cash' ? 'Optional for cash payments' : 'Enter payment transaction reference'}
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full py-3 px-3.5 rounded-xl bg-slate-900 border-2 border-slate-700 text-white font-mono font-bold text-sm placeholder-slate-500 focus:border-emerald-400 outline-hidden uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedCustomer}
                    className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black text-sm shadow-lg cursor-pointer transition-colors"
                  >
                    {selectedCustomer?.registrationStatus === 'pending_reception_payment'
                      ? 'Save Photo, Profile & Confirm Payment'
                      : 'Submit Top-Up for Approval'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
