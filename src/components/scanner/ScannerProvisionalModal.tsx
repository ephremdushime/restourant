import React, { useState } from 'react';
import { Customer, PaymentMethod, Package } from '../../types';
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
  Smartphone,
  Phone,
  Tag,
  DollarSign,
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
  const restaurant = restoStore.getCurrentRestaurant();
  const restoCode = state.currentRestaurantCode;
  const packages = restoStore.getRestaurantPackages(restoCode);
  const branches = restoStore.getRestaurantBranches(restoCode);
  const currentStation =
    state.scanPoints.find((sp) => sp.id === state.currentStationId) || state.scanPoints[0];

  const [activeMode, setActiveMode] = useState<'new_customer' | 'topup'>('new_customer');

  // Form fields for new customer
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+250 78');
  const [photoUrl, setPhotoUrl] = useState('/src/assets/images/avatar_student_male_1790979380050.jpg');
  const [branchId, setBranchId] = useState(branches[0]?.id || 'br_rw01_main');
  const [isStudent, setIsStudent] = useState(true);
  const [institution, setInstitution] = useState('University of Rwanda');
  const [programme, setProgramme] = useState('Computer Science');
  const [year, setYear] = useState(2);
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

  const handleRegisterNewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please provide the customer full name.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 8) {
      setError('Please provide a valid Rwandan phone number.');
      return;
    }
    if (!paymentReference.trim()) {
      setError('Please enter the Mobile Money SMS transaction code or receipt reference.');
      return;
    }

    try {
      const result = restoStore.registerProvisionalCustomer(
        {
          restaurantCode: restoCode,
          branchId: currentBranch?.id || 'br_rw01_main',
          branchName: currentBranch?.name || 'Main Campus Dining Hall',
          name: name.trim(),
          phone: phone.trim(),
          photoUrl,
          idType: isStudent ? 'student_id' : 'national_id',
          idNumber: isStudent ? regNumber.trim() || 'STU-992' : idNumber.trim() || '11999800',
          isStudent,
          studentProfile: isStudent
            ? {
                institution: institution.trim(),
                programme: programme.trim(),
                year,
                registrationNumber: regNumber.trim() || '221008888',
              }
            : undefined,
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
        staffName
      );

      const qrToken = restoStore.getCustomerCardQr(result.customer);
      setSuccessResult({
        customer: result.customer,
        plates: effectivePlates,
        amount: effectiveAmount,
        ref: paymentReference.trim().toUpperCase(),
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
        staffName
      );

      const qrToken = restoStore.getCustomerCardQr(selectedCustomer);
      setSuccessResult({
        customer: selectedCustomer,
        plates: effectivePlates,
        amount: effectiveAmount,
        ref: paymentReference.trim().toUpperCase(),
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Reception Provisional Desk &amp; MoMo Intake
              </h3>
              <p className="text-xs text-slate-400">
                Staff registration &amp; recharge when restaurant boss is away. Authorizes up to <strong>3 grace plates</strong> immediately.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success View */}
        {successResult ? (
          <div className="p-6 rounded-2xl bg-emerald-950/80 border border-emerald-500 text-white space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center mx-auto shadow-lg font-bold">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h4 className="text-xl font-black text-white">
                Provisional Registration Successful!
              </h4>
              <p className="text-xs text-emerald-200 mt-1 max-w-md mx-auto">
                Customer <strong>#{successResult.customer.memberNo} ({successResult.customer.name})</strong> has been registered and queued for Boss Mobile Money confirmation.
              </p>
            </div>

            {/* Grace Plates Notice */}
            <div className="p-4 rounded-xl bg-black/40 border border-emerald-400/40 text-left space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Grace Meals Allowed: 3 Plates Right Now</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                The customer can eat up to <strong>3 meals</strong> immediately while the boss reviews the <strong>{successResult.ref}</strong> payment receipt on their dashboard. Consumed grace plates will automatically deduct from their package once confirmed.
              </p>
            </div>

            {/* Quick Scan & Done buttons */}
            <div className="flex items-center justify-center gap-3 pt-2">
              {onSuccessScan && (
                <button
                  onClick={() => {
                    onSuccessScan(successResult.qrToken);
                    onClose();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md cursor-pointer transition-all"
                >
                  Serve First Plate Now &rarr;
                </button>
              )}

              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Done / Close
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Mode Switcher: New Customer vs Existing Customer Top-Up */}
            <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveMode('new_customer')}
                className={`flex-1 py-2 rounded-lg font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeMode === 'new_customer'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>New Customer Registration</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMode('topup')}
                className={`flex-1 py-2 rounded-lg font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeMode === 'topup'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Existing Customer Top-Up</span>
              </button>
            </div>

            {/* Boss Delegation Banner */}
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-[11px] text-amber-200/90 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>Boss Authorization Policy:</strong> The boss does not need to be physically at the stand. You collect payment, record the Mobile Money reference, and serve up to <strong>3 grace plates</strong> immediately. The boss will verify the deposit on their phone and confirm the account.
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* FORM A: NEW CUSTOMER REGISTRATION */}
            {activeMode === 'new_customer' && (
              <form onSubmit={handleRegisterNewSubmit} className="space-y-4 text-xs">
                {/* Branch & Staff metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">Serving Branch</label>
                    <select
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">Reception / Staff Name</label>
                    <input
                      type="text"
                      required
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                    />
                  </div>
                </div>

                {/* Name & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">Customer Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Aimable Nkurunziza"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">Phone Number (Rwandan) *</label>
                    <input
                      type="text"
                      required
                      placeholder="+250 788 000 000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
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

                {/* Student Checkbox & fields */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isStudent}
                      onChange={(e) => setIsStudent(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-bold text-white">This patron is a student (discount bundle rate)</span>
                  </label>

                  {isStudent ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      <div>
                        <label className="text-slate-400 block mb-1">Institution</label>
                        <input
                          type="text"
                          value={institution}
                          onChange={(e) => setInstitution(e.target.value)}
                          className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Programme</label>
                        <input
                          type="text"
                          value={programme}
                          onChange={(e) => setProgramme(e.target.value)}
                          className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Reg / Student ID #</label>
                        <input
                          type="text"
                          placeholder="UR-2024-..."
                          value={regNumber}
                          onChange={(e) => setRegNumber(e.target.value)}
                          className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="text-slate-400 block mb-1">National ID / Passport #</label>
                      <input
                        type="text"
                        placeholder="1 1999 8 00..."
                        value={idNumber}
                        onChange={(e) => setIdNumber(e.target.value)}
                        className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* Package & Payment Section */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Meal Package &amp; Payment Verification</span>
                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-700">
                      <button
                        type="button"
                        onClick={() => setIsCustomPlates(false)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          !isCustomPlates ? 'bg-emerald-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        Bundle Pack
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCustomPlates(true)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isCustomPlates ? 'bg-emerald-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        Custom Plates
                      </button>
                    </div>
                  </div>

                  {!isCustomPlates ? (
                    <div>
                      <label className="text-slate-400 block mb-1">Select Bundle</label>
                      <select
                        value={selectedPackageId}
                        onChange={(e) => setSelectedPackageId(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
                      >
                        {packages.map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.name} ({pkg.platesCount} plates - {pkg.priceRwf.toLocaleString()} RWF)
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Number of Plates</label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={customPlates}
                          onChange={(e) => {
                            const p = Math.max(1, parseInt(e.target.value) || 1);
                            const rate = restoStore.getRestaurantDefaultPlatePrice(restoCode);
                            setCustomPlates(p);
                            setCustomPrice(p * rate);
                          }}
                          className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Price (RWF)</label>
                        <input
                          type="number"
                          value={customPrice}
                          onChange={(e) => setCustomPrice(Math.max(100, parseInt(e.target.value) || 100))}
                          className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-emerald-400 font-mono font-bold"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-slate-400 block mb-1">Payment Channel *</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white"
                      >
                        <option value="mtn_momo">MTN Mobile Money (*182#)</option>
                        <option value="airtel_money">Airtel Money (*500#)</option>
                        <option value="cash">Cash Received at Counter</option>
                        <option value="bank_transfer">Bank Transfer (BK / Equity)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">
                        Mobile Money SMS Transaction Ref *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. MOMO-2026-993812"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold focus:border-emerald-500 outline-hidden uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md cursor-pointer transition-colors"
                  >
                    Provisional Register &amp; Authorize 3 Grace Meals
                  </button>
                </div>
              </form>
            )}

            {/* FORM B: EXISTING CUSTOMER TOP-UP */}
            {activeMode === 'topup' && (
              <form onSubmit={handleTopupSubmit} className="space-y-4 text-xs">
                {/* Search existing member */}
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Find Existing Member</label>
                  <input
                    type="text"
                    placeholder="Type name, member # (e.g. 28491), or phone..."
                    value={topupSearch}
                    onChange={(e) => setTopupSearch(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />

                  {matchingCustomers.length > 0 && !selectedCustomer && (
                    <div className="mt-2 divide-y divide-slate-800 rounded-xl bg-slate-950 border border-slate-800 max-h-48 overflow-y-auto">
                      {matchingCustomers.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomer(c);
                            setTopupSearch('');
                          }}
                          className="p-2.5 flex items-center justify-between hover:bg-slate-800 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <img src={c.photoUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                            <div>
                              <div className="font-bold text-white">{c.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                #{c.memberNo} · {c.phone}
                              </div>
                            </div>
                          </div>
                          <span className="text-emerald-400 font-mono font-bold">
                            {restoStore.getCustomerBalance(c.id)} plates
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedCustomer && (
                    <div className="mt-2 p-3 rounded-xl bg-slate-950 border border-emerald-500/40 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={selectedCustomer.photoUrl}
                          alt=""
                          className="w-10 h-10 rounded-xl object-cover border border-emerald-500"
                        />
                        <div>
                          <div className="font-bold text-white text-sm">{selectedCustomer.name}</div>
                          <div className="text-slate-400 font-mono text-[11px]">
                            Member #{selectedCustomer.memberNo} · Current Balance: {restoStore.getCustomerBalance(selectedCustomer.id)} plates
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedCustomer(null)}
                        className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>

                {/* Package selection */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Top-Up Package</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      +{effectivePlates} Plates ({effectiveAmount.toLocaleString()} RWF)
                    </span>
                  </div>

                  <select
                    value={selectedPackageId}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
                  >
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.platesCount} plates - {pkg.priceRwf.toLocaleString()} RWF)
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-slate-400 block mb-1">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white"
                      >
                        <option value="mtn_momo">MTN Mobile Money (*182#)</option>
                        <option value="airtel_money">Airtel Money (*500#)</option>
                        <option value="cash">Cash Received at Counter</option>
                        <option value="bank_transfer">Bank Transfer</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">
                        Mobile Money SMS Ref *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. MOMO-TOPUP-4891"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold focus:border-emerald-500 outline-hidden uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedCustomer}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs shadow-md cursor-pointer transition-colors"
                  >
                    Submit Provisional Recharge
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
