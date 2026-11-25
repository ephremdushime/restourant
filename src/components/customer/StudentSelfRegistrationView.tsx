import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import { ScannerHeroStage } from '../common/ScannerHeroStage';
import {
  User,
  Phone,
  CreditCard,
  Building2,
  GraduationCap,
  ArrowRight,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  School,
  Calendar,
} from 'lucide-react';

interface StudentSelfRegistrationViewProps {
  onBackToLogin: () => void;
  onNavigateToDirectory?: () => void;
  defaultRestoCode?: string;
}

export const StudentSelfRegistrationView: React.FC<StudentSelfRegistrationViewProps> = ({
  onBackToLogin,
  onNavigateToDirectory,
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
  const matchedFacility = state.restaurants.find((r) => r.code === selectedRestoCode) || state.restaurants[0];

  // Student Identity Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [institution, setInstitution] = useState('University Campus');
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

    if (trimmedName.length < 2) {
      setError('Please enter your full official name (minimum 2 characters).');
      return;
    }
    if (!trimmedPhone || !isValidPhoneNumber(trimmedPhone)) {
      setError('Please enter a valid phone number (e.g. 0788 123 456 or +250 788 123 456).');
      return;
    }
    if (!trimmedRegNo) {
      setError('Please enter your Student ID or Registration Number.');
      return;
    }
    if (!trimmedProgramme) {
      setError('Please enter your Class, Faculty, or Department.');
      return;
    }
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
    <div className="relative min-h-[90vh] w-full flex items-center justify-center p-3 sm:p-6 lg:p-8">
      {/* Container with Modern Dual-Column Showcase */}
      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        {/* Left Side: Prominent Scanner Hero Stage */}
        <div className="lg:col-span-5 flex flex-col">
          <ScannerHeroStage
            title="Fast Student Meal Pass"
            subtitle="Register online, choose your meal pack at reception, and tap your phone or physical PVC card to dine in under 0.3s."
            facilityName={matchedFacility?.name || 'Kigali Campus Resto'}
            facilityCode={selectedRestoCode}
          />
        </div>

        {/* Right Side: Form or Success Confirmation Card */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          {submittedResult ? (
            /* SUCCESS CONFIRMATION VIEW */
            <div className="bg-slate-900/95 backdrop-blur-2xl border-2 border-emerald-500/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl text-center ring-1 ring-white/10 animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white tracking-tight">
                  Registration Received!
                </h2>
                <div className="inline-flex items-center gap-2 rounded-xl bg-slate-950 border border-emerald-500/40 px-4 py-2 shadow-inner">
                  <span className="text-xs text-slate-400 uppercase font-semibold">Your Member ID</span>
                  <strong className="font-mono text-xl text-emerald-300">#{submittedResult.memberNo}</strong>
                </div>
                <p className="text-sm text-slate-300 max-w-md mx-auto pt-1 leading-relaxed">
                  Welcome, <strong className="text-white">{submittedResult.name}</strong>! Your registration profile has been queued at <strong className="text-emerald-400">{matchedFacility?.name}</strong>.
                </p>
              </div>

              {/* What Happens Next Stepper Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-slate-800 text-left space-y-3 text-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Next Steps at the Cafeteria</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">STEP 1</span>
                    <div className="font-bold text-white text-xs">Visit Reception</div>
                    <div className="text-[11px] text-slate-400 leading-tight">Pay for your desired meal pack (cash, card or MoMo).</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">STEP 2</span>
                    <div className="font-bold text-white text-xs">Snap Photo</div>
                    <div className="text-[11px] text-slate-400 leading-tight">Receptionist verifies ID and captures your pass photo.</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">STEP 3</span>
                    <div className="font-bold text-white text-xs">Set PIN & Dine</div>
                    <div className="text-[11px] text-slate-400 leading-tight">Log in with your phone to set PIN and use your pass.</div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onBackToLogin}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                Go to Customer Sign In &rarr;
              </button>
            </div>
          ) : (
            /* THE REGISTRATION FORM */
            <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-5 shadow-2xl ring-1 ring-white/10 transition-all">
              {/* Form Header with Integrated Back Link */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                      Student Registration
                    </h1>
                    <p className="text-xs text-slate-400">
                      Join campus dining · Instant optical QR pass
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sign In</span>
                </button>
              </div>

              {/* Directive Selected Dining Facility Context */}
              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-black flex items-center justify-center shrink-0">
                    {selectedRestoCode}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-3 h-3" />
                      <span>Target Campus Cafeteria</span>
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-white truncate">{matchedFacility?.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{matchedFacility?.address || 'Campus Dining Facility'}</div>
                  </div>
                </div>

                {onNavigateToDirectory && (
                  <button
                    type="button"
                    onClick={onNavigateToDirectory}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-4 decoration-emerald-500/40 hover:decoration-emerald-400 transition-colors shrink-0 cursor-pointer"
                  >
                    Change Cafeteria
                  </button>
                )}
              </div>

              {/* Custom Error Banner (no raw browser popups) */}
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs flex items-center gap-2.5 animate-shake">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              {/* Form Elements */}
              <form noValidate onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
                {/* 1. Full Official Name & Phone Number */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-300 text-xs flex items-center justify-between">
                      <span>Full Official Name <span className="text-emerald-400">*</span></span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="e.g. Mugisha Jean Paul"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setError(null);
                        }}
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-3.5 py-2.5 text-white text-xs sm:text-sm outline-hidden transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-300 text-xs flex items-center justify-between">
                      <span>Phone Number <span className="text-emerald-400">*</span></span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                      <input
                        type="tel"
                        placeholder="e.g. 0788 123 456"
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          setError(null);
                        }}
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-3.5 py-2.5 text-white font-mono text-xs sm:text-sm outline-hidden transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Student ID & Class / Department */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-300 text-xs flex items-center justify-between">
                      <span>Student ID / Reg # <span className="text-emerald-400">*</span></span>
                    </label>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="e.g. 21RP04921"
                        value={regNumber}
                        onChange={(e) => {
                          setRegNumber(e.target.value);
                          setError(null);
                        }}
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-3.5 py-2.5 text-white font-mono text-xs sm:text-sm outline-hidden transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-300 text-xs flex items-center justify-between">
                      <span>Faculty / Department <span className="text-emerald-400">*</span></span>
                    </label>
                    <div className="relative">
                      <GraduationCap className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="e.g. Computer Science (Yr 2)"
                        value={programme}
                        onChange={(e) => {
                          setProgramme(e.target.value);
                          setError(null);
                        }}
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-3.5 py-2.5 text-white text-xs sm:text-sm outline-hidden transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Institution / University */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 text-xs">Campus / Institution</label>
                  <div className="relative">
                    <School className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="e.g. Kigali Independent University (ULK)"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-3.5 py-2.5 text-white text-xs sm:text-sm outline-hidden transition-all"
                    />
                  </div>
                </div>

                {/* Helpful Guidance Notice */}
                <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-200 leading-relaxed">
                    <span className="font-bold text-white block">No Online Payment Required</span>
                    Submit your profile now. Pay for your meal pack directly at the cafeteria reception desk, where your pass will be activated.
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-sm tracking-wide transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-slate-950/30 border-t-slate-950 animate-spin" />
                        <span>Submitting Profile...</span>
                      </div>
                    ) : (
                      <>
                        <span>Submit Registration Profile</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
