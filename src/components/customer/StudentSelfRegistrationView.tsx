import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import { PhotoCaptureInput } from '../common/PhotoCaptureInput';
import { PaymentMethod, Restaurant } from '../../types';
import {
  UserCheck,
  Smartphone,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Building2,
  GraduationCap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ArrowLeft,
  DollarSign,
  Utensils,
  Clock,
} from 'lucide-react';

interface StudentSelfRegistrationViewProps {
  onBackToLogin: () => void;
  defaultRestoCode?: string;
}

export const StudentSelfRegistrationView: React.FC<StudentSelfRegistrationViewProps> = ({
  onBackToLogin,
  defaultRestoCode,
}) => {
  const state = restoStore.getState();

  // Active restaurant selection
  const [selectedRestoCode, setSelectedRestoCode] = useState<string>(() => {
    if (defaultRestoCode && state.restaurants.some((r) => r.code === defaultRestoCode)) {
      return defaultRestoCode;
    }
    return state.currentRestaurantCode || state.restaurants[0]?.code || 'RW01';
  });

  const activeResto = state.restaurants.find((r) => r.code === selectedRestoCode) || state.restaurants[0];
  const packages = restoStore.getRestaurantPackages(selectedRestoCode);
  const branches = restoStore.getRestaurantBranches(selectedRestoCode);
  const singlePlatePrice = restoStore.getRestaurantDefaultPlatePrice(selectedRestoCode);

  // Student Identity Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('/src/assets/images/avatar_student_male_1790979380050.jpg');
  const [regNumber, setRegNumber] = useState('');
  const [institution, setInstitution] = useState(activeResto?.name?.includes('ULK') ? 'ULK' : 'University / College');
  const [programme, setProgramme] = useState('');
  const [year, setYear] = useState(1);
  const [branchId, setBranchId] = useState(branches[0]?.id || 'br_rw01_main');

  // Plate Package Selection
  const [selectedPackageId, setSelectedPackageId] = useState<string>(packages[0]?.id || '');
  const [isCustomPlates, setIsCustomPlates] = useState(false);
  const [customPlates, setCustomPlates] = useState(10);

  // MoMo Payment Fields
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn_momo');
  const [momoPayerName, setMomoPayerName] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentTime, setPaymentTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  // Status & Error
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    memberNo: string;
    name: string;
    plates: number;
    amount: number;
    ref: string;
    payer: string;
  } | null>(null);

  const selectedPkg = packages.find((p) => p.id === selectedPackageId) || packages[0];
  const effectivePlates = isCustomPlates ? customPlates : selectedPkg ? selectedPkg.platesCount : 10;
  const effectiveAmount = isCustomPlates ? customPlates * singlePlatePrice : selectedPkg ? selectedPkg.priceRwf : 12000;

  const isValidPhoneNumber = (rawPhone: string): boolean => {
    const cleaned = rawPhone.replace(/[\s()-]/g, '');
    if (/^(\+?250|0)?7[2389]\d{7}$/.test(cleaned)) return true;
    const digitsOnly = cleaned.replace(/\D/g, '');
    return digitsOnly.length >= 9 && digitsOnly.length <= 15;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedRegNo = regNumber.trim();
    const trimmedInstitution = institution.trim();
    const trimmedProgramme = programme.trim();
    const trimmedPayer = momoPayerName.trim();
    const trimmedRef = paymentReference.trim().toUpperCase();

    if (trimmedName.length < 2) {
      setError('Please enter your full official name (at least 2 characters).');
      return;
    }
    if (!trimmedPhone || !isValidPhoneNumber(trimmedPhone)) {
      setError('Please enter a valid phone number (e.g. 0788 123 456 or +250 788 123 456).');
      return;
    }
    if (!trimmedRegNo) {
      setError('Please enter your Student ID / Registration Number.');
      return;
    }
    if (!trimmedProgramme) {
      setError('Please enter your Class, Faculty, or Programme (e.g. Class 3B or Computer Science Yr 2).');
      return;
    }
    if (!trimmedPayer) {
      setError('Please enter the name on the Mobile Money account used to pay.');
      return;
    }
    if (!trimmedRef) {
      setError('Please enter the Mobile Money SMS transaction reference ID.');
      return;
    }

    // Check duplicate customer phone or Student ID in this restaurant
    const dupCheck = restoStore.checkDuplicateCustomerIdentity(
      selectedRestoCode,
      trimmedPhone,
      'student_id',
      trimmedRegNo,
      trimmedRegNo
    );
    if (dupCheck.isDuplicate) {
      setError(dupCheck.message || 'An account with this phone number or Student ID is already registered.');
      return;
    }

    setIsSubmitting(true);
    try {
      const curBranch = branches.find((b) => b.id === branchId) || branches[0];
      const result = restoStore.registerProvisionalCustomer(
        {
          restaurantCode: selectedRestoCode,
          branchId: curBranch?.id || 'br_rw01_main',
          branchName: curBranch?.name || activeResto?.name || 'Main Dining Hall',
          name: trimmedName,
          phone: trimmedPhone,
          photoUrl,
          idType: 'student_id',
          idNumber: trimmedRegNo,
          isStudent: true,
          studentProfile: {
            institution: trimmedInstitution || 'University Campus',
            programme: trimmedProgramme,
            year,
            registrationNumber: trimmedRegNo,
          },
          packageId: isCustomPlates ? undefined : selectedPkg?.id,
          platesRequested: effectivePlates,
          amountRwf: effectiveAmount,
          paymentMethod,
          paymentReference: trimmedRef,
          registeredByStaffId: 'self_student_portal',
          registeredByStaffName: `${trimmedName} (Self-Registered Online)`,
          stationId: 'online_self_service',
          stationName: 'Online Student Portal',
        },
        trimmedName
      );

      // Send high-priority notification to Boss Approvals Room
      restoStore.sendNotification({
        restaurantCode: selectedRestoCode,
        target: 'all',
        senderRole: 'system',
        senderName: 'Student Self-Service Portal',
        type: 'topup_success',
        title: `New Online Registration: ${trimmedName} (${effectivePlates} Plates)`,
        message: `Student ${trimmedName} (${trimmedProgramme}, ID: ${trimmedRegNo}) registered online for ${effectivePlates} plates (${effectiveAmount.toLocaleString()} RWF). Paid via ${paymentMethod.toUpperCase()} (Payer: "${trimmedPayer}", Ref: ${trimmedRef}, Time: ${paymentTime}). Awaiting Boss verification.`,
        priority: 'urgent',
        actionTab: 'approvals',
      });

      setIsSubmitting(false);
      setSubmittedResult({
        memberNo: result.customer.memberNo,
        name: trimmedName,
        plates: effectivePlates,
        amount: effectiveAmount,
        ref: trimmedRef,
        payer: trimmedPayer,
      });
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Failed to submit online registration request.');
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-4 px-3 sm:px-6">
      {/* Back button */}
      <div className="mb-4">
        <button
          type="button"
          onClick={onBackToLogin}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-900/90 border border-slate-700 px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-emerald-400" />
          <span>Back to Sign In</span>
        </button>
      </div>

      {submittedResult ? (
        /* SUCCESS CONFIRMATION VIEW */
        <div className="bg-slate-900 border-2 border-emerald-500 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl text-center animate-in fade-in zoom-in-95">
          <div className="w-18 h-18 rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-black text-white tracking-tight">
              Registration Request Sent!
            </h2>
            <p className="text-sm text-emerald-200">
              Welcome, <strong>{submittedResult.name}</strong>! Your account has been queued for verification.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left space-y-2.5 text-xs sm:text-sm">
            <div className="flex justify-between items-center py-1 border-b border-slate-800">
              <span className="text-slate-400 font-medium">Assigned Member ID:</span>
              <span className="font-mono font-black text-white text-base">#{submittedResult.memberNo}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-800">
              <span className="text-slate-400 font-medium">Plates Requested:</span>
              <span className="font-bold text-emerald-400">{submittedResult.plates} Plates</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-800">
              <span className="text-slate-400 font-medium">Amount Paid:</span>
              <span className="font-bold text-white font-mono">{submittedResult.amount.toLocaleString()} RWF</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-800">
              <span className="text-slate-400 font-medium">MoMo Transaction ID:</span>
              <span className="font-mono font-bold text-amber-300">{submittedResult.ref}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400 font-medium">Payer Account:</span>
              <span className="font-bold text-white">{submittedResult.payer}</span>
            </div>
          </div>

          {/* Next Steps Card */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>What Happens Next?</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 leading-relaxed">
              <li>
                <strong>Boss Verification</strong>: The Restaurant Boss verifies your MoMo SMS code against the restaurant account.
              </li>
              <li>
                <strong>Instant Dashboard Access</strong>: Once verified, open the Customer Portal with your phone number and create your private 6-digit PIN.
              </li>
              <li>
                <strong>Card Pickup</strong>: Your customized PVC card is automatically sent for printing. Collect it at the cafeteria counter!
              </li>
            </ol>
          </div>

          <button
            type="button"
            onClick={onBackToLogin}
            className="w-full py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition-all shadow-lg cursor-pointer"
          >
            Go to Customer Sign In &rarr;
          </button>
        </div>
      ) : (
        /* REGISTRATION FORM */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
          {/* Header */}
          <div className="border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Student Meal Pass Registration
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                  Register, subscribe to meal plates, and submit your Mobile Money payment.
                </p>
              </div>
            </div>
          </div>

          {/* Restaurant Facility Selection */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dining Facility / Restaurant</span>
            </label>
            <select
              value={selectedRestoCode}
              onChange={(e) => setSelectedRestoCode(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-white font-medium text-xs sm:text-sm outline-hidden"
            >
              {state.restaurants.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 text-xs sm:text-sm">
            {/* STEP 1: PERSONAL IDENTITY */}
            <div className="space-y-3.5 pt-1">
              <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                <span>1. Personal &amp; Academic Identity</span>
              </div>

              {/* Photo selfie / upload */}
              <PhotoCaptureInput
                photoUrl={photoUrl}
                onChange={(url) => setPhotoUrl(url)}
                label="Student Photo (Selfie or Passport Photo)"
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-200 block mb-1">
                    Full Official Name <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mugisha Jean Paul"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-400 outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-200 block mb-1">
                    Phone Number (MTN / Airtel) <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 0788 123 456"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-400 outline-hidden font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-200 block mb-1">
                    Student ID / Reg # <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 21RP04921"
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-400 outline-hidden font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold text-slate-200 block mb-1">
                    Class / Programme / Department <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Computer Science (Yr 2) or Class 3B"
                    value={programme}
                    onChange={(e) => setProgramme(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-400 outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-200 block mb-1">Institution / Campus</label>
                <input
                  type="text"
                  placeholder="e.g. Kigali Independent University (ULK)"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-400 outline-hidden"
                />
              </div>
            </div>

            {/* STEP 2: MEAL PACKAGE SELECTION */}
            <div className="space-y-3.5 border-t border-slate-800 pt-4">
              <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5" />
                <span>2. Select Meal Package</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => {
                      setSelectedPackageId(pkg.id);
                      setIsCustomPlates(false);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                      !isCustomPlates && selectedPackageId === pkg.id
                        ? 'bg-emerald-950/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs text-slate-400 font-bold uppercase">{pkg.name}</div>
                    <div className="text-lg font-black text-white mt-0.5">{pkg.platesCount} Plates</div>
                    <div className="text-xs font-mono font-bold text-emerald-300 mt-1">
                      {pkg.priceRwf.toLocaleString()} RWF
                    </div>
                  </button>
                ))}

                {/* Custom Plates Option */}
                <button
                  type="button"
                  onClick={() => setIsCustomPlates(true)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    isCustomPlates
                      ? 'bg-emerald-950/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs text-slate-400 font-bold uppercase">Custom Plates</div>
                  <div className="text-lg font-black text-white mt-0.5">Flexible Plates</div>
                  <div className="text-xs font-mono font-bold text-emerald-300 mt-1">
                    @{singlePlatePrice.toLocaleString()} RWF / plate
                  </div>
                </button>
              </div>

              {isCustomPlates && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-200">Number of Plates:</span>
                    <span className="font-mono font-black text-emerald-400 text-sm">
                      {customPlates} plates = {(customPlates * singlePlatePrice).toLocaleString()} RWF
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={120}
                    value={customPlates}
                    onChange={(e) => setCustomPlates(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>1 plate</span>
                    <span>30 plates</span>
                    <span>60 plates</span>
                    <span>120 plates</span>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 3: MOBILE MONEY PAYMENT & PROOF */}
            <div className="space-y-3.5 border-t border-slate-800 pt-4">
              <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                <span>3. Mobile Money Payment &amp; Proof</span>
              </div>

              {/* Provider selection */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('mtn_momo')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    paymentMethod === 'mtn_momo'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span>MTN Mobile Money</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('airtel_money')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    paymentMethod === 'airtel_money'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span>Airtel Money</span>
                </button>
              </div>

              {/* How to Pay Banner */}
              <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-300 uppercase">Payment Instruction:</span>
                  <span className="font-mono font-black text-white text-sm">
                    Total: {effectiveAmount.toLocaleString()} RWF
                  </span>
                </div>
                <p className="text-slate-200 leading-relaxed">
                  Pay <strong>{effectiveAmount.toLocaleString()} RWF</strong> to the cafeteria merchant code:
                </p>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono font-bold text-center text-sm text-emerald-400 select-all">
                  *182*8*1*{activeResto?.code === 'RW01' ? '054321' : '012345'}*{effectiveAmount}#
                </div>
                <div className="text-[11px] text-slate-400">
                  Recipient Name: <strong>{activeResto?.name || 'Campus Dining Services Ltd'}</strong>
                </div>
              </div>

              {/* Transaction details inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-200 block mb-1">
                    Payer Name on MoMo <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Name shown on MoMo SMS"
                    value={momoPayerName}
                    onChange={(e) => setMomoPayerName(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-400 outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-200 block mb-1">
                    MoMo SMS Reference ID <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MP261030.1420.B81920"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value.toUpperCase())}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-400 outline-hidden font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-200 block mb-1">Payment Time</label>
                <input
                  type="text"
                  placeholder="e.g. 14:25 PM"
                  value={paymentTime}
                  onChange={(e) => setPaymentTime(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-400 outline-hidden font-mono"
                />
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-sm transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Submitting to Restaurant Boss...</span>
                ) : (
                  <>
                    <span>Submit Registration &amp; Payment Proof</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              <p className="text-[11px] text-slate-400 text-center mt-2">
                Your request is delivered directly to the Restaurant Boss for Mobile Money SMS confirmation.
              </p>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
