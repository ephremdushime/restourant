import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import {
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Building2,
  GraduationCap,
  ArrowRight,
  ShieldCheck,
  ArrowLeft,
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

  // Active restaurant selection (supports URL parameters: ?resto=CODE or #/register?resto=CODE)
  const [selectedRestoCode, setSelectedRestoCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
      const hashParams = new URLSearchParams(hashQuery);
      const urlCode = (
        searchParams.get('resto') ||
        searchParams.get('restaurant') ||
        searchParams.get('r') ||
        hashParams.get('resto') ||
        hashParams.get('restaurant') ||
        hashParams.get('r') ||
        ''
      ).toUpperCase();
      if (urlCode && state.restaurants.some((r) => r.code === urlCode)) {
        return urlCode;
      }
    }
    if (defaultRestoCode && state.restaurants.some((r) => r.code === defaultRestoCode)) {
      return defaultRestoCode;
    }
    return state.currentRestaurantCode || state.restaurants[0]?.code || 'RW01';
  });

  const branches = restoStore.getRestaurantBranches(selectedRestoCode);

  // Student Identity Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [institution, setInstitution] = useState('University / College');
  const [programme, setProgramme] = useState('');
  const [year, setYear] = useState(1);
  const [branchId, setBranchId] = useState(branches[0]?.id || 'br_rw01_main');

  // Status & Error
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    memberNo: string;
    name: string;
  } | null>(null);

  const isValidPhoneNumber = (rawPhone: string): boolean => {
    const cleaned = rawPhone.replace(/[\s()-]/g, '');
    if (/^(\+?250|0)?7[2389]\d{7}$/.test(cleaned)) return true;
    const digitsOnly = cleaned.replace(/\D/g, '');
    return digitsOnly.length >= 9 && digitsOnly.length <= 15;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedRegNo = regNumber.trim();
    const trimmedInstitution = institution.trim();
    const trimmedProgramme = programme.trim();

    if (trimmedName.length < 2) return setError('Please enter your full official name (at least 2 characters).');
    if (!trimmedPhone || !isValidPhoneNumber(trimmedPhone)) return setError('Please enter a valid phone number (e.g. 0788 123 456 or +250 788 123 456).');
    if (!trimmedRegNo) return setError('Please enter your Student ID / Registration Number.');
    if (!trimmedProgramme) return setError('Please enter your Class, Faculty, or Programme.');
    const curBranch = branches.find((b) => b.id === branchId) || branches[0];

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/public/customer/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantCode: selectedRestoCode,
          branchId: curBranch?.id,
          name: trimmedName,
          phone: trimmedPhone,
          idType: 'student_id',
          idNumber: trimmedRegNo,
          isStudent: true,
          institution: trimmedInstitution || 'University Campus',
          programme: trimmedProgramme,
          year,
          registrationNumber: trimmedRegNo,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.customer?.memberNo) {
        throw new Error(result.error || 'Registration could not be saved. Please retry or visit reception.');
      }
      setSubmittedResult({ memberNo: result.customer.memberNo, name: trimmedName });
    } catch (err: any) {
      setError(err?.message || 'Unable to submit registration. Please check your connection and retry.');
    } finally {
      setIsSubmitting(false);
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
              Registration Request Received!
            </h2>
            <div className="inline-flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-700 px-4 py-2 mt-2">
              <span className="text-xs text-slate-400">Member number</span>
              <strong className="font-mono text-lg text-white">#{submittedResult.memberNo}</strong>
            </div>
            <p className="text-sm text-emerald-200">
              Welcome, <strong>{submittedResult.name}</strong>! Your details have been saved. Please visit reception to complete payment confirmation.
            </p>
          </div>

          {/* Next Steps Card */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>What Happens Next?</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 leading-relaxed">
              <li>
                <strong>Reception payment</strong>: Visit the reception desk, choose your meal package and pay. The receptionist records and confirms the payment.
              </li>
              <li>
                <strong>PIN setup</strong>: After reception confirms payment, sign in with your registered phone number and set your private PIN. You will receive limited onboarding dashboard access while the boss reviews your registration.
              </li>
              <li>
                <strong>Final approval and card</strong>: The Restaurant Boss approves your registration. Your full dashboard and physical card become available after approval.
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
                  Register now, then visit reception to choose and pay for your meal package.
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
              onChange={(e) => {
                const nextCode = e.target.value;
                const nextBranches = restoStore.getRestaurantBranches(nextCode);
                setSelectedRestoCode(nextCode);
                setBranchId(nextBranches[0]?.id || '');
              }}
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

            {/* Payment is completed in person at reception after registration. */}
            <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/30 text-sm text-emerald-100">
              <strong>Next step: visit reception.</strong>
              <p className="mt-1 text-xs text-emerald-200">Your registration does not collect payment. Reception will select your meal package, receive payment and confirm it in RestoPass. You can then set your PIN using this phone number.</p>
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
                    <span>Submit Registration</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              <p className="text-[11px] text-slate-400 text-center mt-2">
                No payment is collected online. Your registration is sent to the selected dining facility.
              </p>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

