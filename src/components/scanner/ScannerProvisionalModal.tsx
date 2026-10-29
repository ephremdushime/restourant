import React, { useState } from 'react';
import { Customer, PaymentMethod } from '../../types';
import { restoStore } from '../../store/restoStore';
import { PhotoCaptureInput } from '../common/PhotoCaptureInput';
import {
  UserPlus,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  X,
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

  // Top-Up Mode existing customer search
  const [topupSearch, setTopupSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

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

  const handleRegisterNewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedRegNo = regNumber.trim();
    const trimmedNationalId = idNumber.trim();
    const trimmedInstitution = institution.trim();
    const trimmedPaymentRef = paymentReference.trim();

    if (trimmedName.length < 2) {
      setError('Please enter the customer full name (at least 2 characters).');
      return;
    }
    if (!trimmedPhone || !isValidPhoneNumber(trimmedPhone)) {
      setError('Please enter a valid phone number (e.g. +250 788 123 456 or 0788 123 456).');
      return;
    }
    if (isStudent) {
      if (!trimmedRegNo) {
        setError('Please enter the Student Registration / ID Number.');
        return;
      }
      if (!trimmedInstitution) {
        setError('Please enter the student institution / university name.');
        return;
      }
    } else {
      if (!trimmedNationalId) {
        setError('Please enter the National ID or Passport number.');
        return;
      }
    }
    if (!trimmedPaymentRef) {
      setError('Please enter the Mobile Money SMS transaction reference or receipt code.');
      return;
    }
    if (!staffName.trim()) {
      setError('Please enter the reception or staff operator name.');
      return;
    }

    const effectiveIdType = isStudent ? 'student_id' : 'national_id';
    const effectiveIdNumber = isStudent ? trimmedRegNo : trimmedNationalId;

    // Prevent duplicate customer phone or ID in the same restaurant
    const dupCheck = restoStore.checkDuplicateCustomerIdentity(
      restoCode,
      trimmedPhone,
      effectiveIdType,
      effectiveIdNumber,
      isStudent ? trimmedRegNo : undefined
    );
    if (dupCheck.isDuplicate) {
      setError(dupCheck.message || 'A customer with this phone number or ID is already registered.');
      return;
    }

    try {
      const result = restoStore.registerProvisionalCustomer(
        {
          restaurantCode: restoCode,
          branchId: currentBranch?.id || 'br_rw01_main',
          branchName: currentBranch?.name || 'Main Campus Dining Hall',
          name: trimmedName,
          phone: trimmedPhone,
          photoUrl,
          idType: effectiveIdType,
          idNumber: effectiveIdNumber,
          isStudent,
          studentProfile: isStudent
            ? {
                institution: trimmedInstitution,
                programme: programme.trim(),
                year,
                registrationNumber: trimmedRegNo,
              }
            : undefined,
          packageId: isCustomPlates ? undefined : selectedPkg?.id,
          platesRequested: effectivePlates,
          amountRwf: effectiveAmount,
          paymentMethod,
          paymentReference: trimmedPaymentRef.toUpperCase(),
          registeredByStaffId: currentStation?.assignedStaffUserId || 'reception_staff',
          registeredByStaffName: staffName.trim(),
          stationId: currentStation?.id || 'sp_1',
          stationName: currentStation?.name || 'Reception & Stand 1',
        },
        staffName.trim()
      );

      const qrToken = restoStore.getCustomerCardQr(result.customer);
      resetNewCustomerFields();
      setSuccessResult({
        customer: result.customer,
        plates: effectivePlates,
        amount: effectiveAmount,
        ref: trimmedPaymentRef.toUpperCase(),
        qrToken,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to submit provisional registration.');
    }
  };

  const handleTopupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedCustomer) {
      setError('Please search and select a customer account first.');
      return;
    }
    if (!paymentReference.trim()) {
      setError('Please enter the Mobile Money transaction reference number.');
      return;
    }

    try {
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
          paymentReference: paymentReference.trim().toUpperCase(),
          registeredByStaffId: currentStation?.assignedStaffUserId || 'reception_staff',
          registeredByStaffName: staffName.trim(),
          stationId: currentStation?.id || 'sp_1',
          stationName: currentStation?.name || 'Reception & Stand 1',
        },
        staffName.trim()
      );

      const qrToken = restoStore.getCustomerCardQr(selectedCustomer);
      const refUpper = paymentReference.trim().toUpperCase();
      setPaymentReference('');
      setSuccessResult({
        customer: selectedCustomer,
        plates: effectivePlates,
        amount: effectiveAmount,
        ref: refUpper,
        qrToken,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to submit provisional recharge.');
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
                Register new customers or record recharges. Eligible accounts can use up to <strong>3 grace meals</strong> while awaiting boss verification.
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
                Customer <strong>#{successResult.customer.memberNo} ({successResult.customer.name})</strong> has been queued for Boss Mobile Money verification.
              </p>
            </div>

            {/* Grace Plates Notice */}
            <div className="p-4 rounded-xl bg-black/50 border border-emerald-400/50 text-left space-y-2 text-sm">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-base">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span>Grace Meals Policy: Up to 3 Plates Authorized</span>
              </div>
              <p className="text-slate-200 text-sm leading-relaxed">
                While the boss verifies payment reference <strong>{successResult.ref}</strong> ({successResult.amount.toLocaleString()} RWF for {successResult.plates} plates), the customer may consume up to <strong>3 grace meals</strong> if their paid balance is zero.
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
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                  activeMode === 'new_customer'
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
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                  activeMode === 'topup'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Existing Customer Top-Up</span>
              </button>
            </div>

            {/* Boss Delegation Banner */}
            <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/50 text-sm text-amber-100 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Boss Approval Policy:</strong> Collect payment, record the Mobile Money reference, and submit. New or zero-balance customers can eat up to <strong>3 grace plates</strong> while waiting for boss approval.
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
                        className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                          !isCustomPlates ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Bundle Pack
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCustomPlates(true)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                          isCustomPlates ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
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
                        <option value="airtel_money">Airtel Money (*500#)</option>
                        <option value="cash">Cash Received at Counter</option>
                        <option value="bank_transfer">Bank Transfer (BK / Equity)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="reg-payment-ref" className="text-slate-200 font-semibold block mb-1.5 text-sm">
                        Payment / MoMo Reference <span className="text-emerald-400">*</span>
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

            {/* FORM B: EXISTING CUSTOMER TOP-UP */}
            {activeMode === 'topup' && (
              <form onSubmit={handleTopupSubmit} className="space-y-4 text-sm" noValidate>
                {/* Search existing member */}
                <div>
                  <label htmlFor="topup-member-search" className="font-bold text-white block mb-1.5 text-sm">
                    Find Existing Member
                  </label>
                  <input
                    id="topup-member-search"
                    type="text"
                    placeholder="Type name, member # (e.g. 28491), or phone..."
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
                          onClick={() => {
                            setSelectedCustomer(c);
                            setTopupSearch('');
                          }}
                          className="w-full p-3 flex items-center justify-between hover:bg-slate-800 cursor-pointer text-left"
                        >
                          <div className="flex items-center gap-3">
                            <img src={c.photoUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                            <div>
                              <div className="font-bold text-white text-sm">{c.name}</div>
                              <div className="text-xs text-slate-300 font-mono">
                                #{c.memberNo} · {c.phone}
                              </div>
                            </div>
                          </div>
                          <span className="text-emerald-400 font-mono font-bold text-sm">
                            {restoStore.getCustomerBalance(c.id)} plates
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedCustomer && (
                    <div className="mt-2 p-3.5 rounded-2xl bg-slate-950 border-2 border-emerald-500/50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={selectedCustomer.photoUrl}
                          alt=""
                          className="w-11 h-11 rounded-xl object-cover border border-emerald-500"
                        />
                        <div>
                          <div className="font-bold text-white text-base">{selectedCustomer.name}</div>
                          <div className="text-slate-300 font-mono text-xs">
                            Member #{selectedCustomer.memberNo} · Approved Balance: {restoStore.getCustomerBalance(selectedCustomer.id)} plates
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedCustomer(null)}
                        className="text-sm text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>

                {/* Package selection */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">Top-Up Package</span>
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
                        <option value="airtel_money">Airtel Money (*500#)</option>
                        <option value="cash">Cash Received at Counter</option>
                        <option value="bank_transfer">Bank Transfer</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="topup-payment-ref" className="text-slate-200 font-semibold block mb-1.5 text-sm">
                        Mobile Money SMS Ref <span className="text-emerald-400">*</span>
                      </label>
                      <input
                        id="topup-payment-ref"
                        type="text"
                        placeholder="e.g. MOMO-TOPUP-4891"
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
                    Submit Top-Up for Approval
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
