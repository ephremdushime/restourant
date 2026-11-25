import React, { useState, useEffect } from 'react';
import { UserRole, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { sound } from '../../services/audioService';
import { ScannerHeroStage } from '../common/ScannerHeroStage';
import { ScanningPersonBackground } from '../common/ScanningPersonBackground';
import {
  Smartphone,
  Lock,
  Eye,
  EyeOff,
  Building2,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  Key,
  Sparkles,
  ShieldCheck,
  Clock,
  X,
  CreditCard,
  User,
} from 'lucide-react';

interface CustomerAuthViewProps {
  onLoginSuccess: (role: UserRole, userLabel: string) => void;
  onBackToLanding?: () => void;
  onOpenRegister: (restoCode?: string) => void;
  initialRestoCode?: string;
  isDemoMode?: boolean;
  language: Language;
}

export const CustomerAuthView: React.FC<CustomerAuthViewProps> = ({
  onLoginSuccess,
  onBackToLanding,
  onOpenRegister,
  initialRestoCode,
  isDemoMode = false,
}) => {
  const state = restoStore.getState();

  const [selectedRestoCode, setSelectedRestoCode] = useState(() => {
    if (initialRestoCode && state.restaurants.some((r) => r.code === initialRestoCode)) {
      return initialRestoCode;
    }
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
    return state.currentRestaurantCode || state.restaurants[0]?.code || 'RW01';
  });

  const matchedFacility = state.restaurants.find((r) => r.code === selectedRestoCode) || state.restaurants[0];

  const [phoneOrMember, setPhoneOrMember] = useState(isDemoMode ? '28491' : '');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Activation & Recovery Modal States (Non-SMS)
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Activation Inputs
  const [actPhone, setActPhone] = useState('');
  const [actCode, setActCode] = useState('');
  const [actPin, setActPin] = useState('');
  const [actPinConfirm, setActPinConfirm] = useState('');
  const [actError, setActError] = useState<string | null>(null);
  const [actLoading, setActLoading] = useState(false);

  // Recovery Inputs
  const [recPhoneOrMember, setRecPhoneOrMember] = useState('');
  const [recCode, setRecCode] = useState('');
  const [recPin, setRecPin] = useState('');
  const [recPinConfirm, setRecPinConfirm] = useState('');
  const [recError, setRecError] = useState<string | null>(null);
  const [recLoading, setRecLoading] = useState(false);

  // Query registration status in real time
  const [customerPortalStatus, setCustomerPortalStatus] = useState<{
    status: 'needs_pin_setup' | 'ready_for_login' | 'pending_reception_payment' | 'pending_boss_approval' | 'rejected' | 'not_found' | 'unavailable';
    memberNo?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    const identifier = phoneOrMember.trim();
    if (identifier.replace(/\D/g, '').length < 9 && !identifier.startsWith('284') && !identifier.startsWith('#')) {
      setCustomerPortalStatus(null);
      return;
    }
    let current = true;
    const timeout = window.setTimeout(async () => {
      const status = await restoStore.getCustomerRegistrationStatus(identifier, selectedRestoCode);
      if (current) setCustomerPortalStatus(status);
    }, 350);
    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [phoneOrMember, selectedRestoCode]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const cleanPhoneOrMember = phoneOrMember.trim();
    const enteredPin = pin.trim();

    if (!cleanPhoneOrMember) {
      setErrorMessage('Please enter your registered phone number or Member ID.');
      sound.playDangerAlarm();
      return;
    }

    setIsVerifying(true);
    try {
      const statusCheck = await restoStore.getCustomerRegistrationStatus(cleanPhoneOrMember, selectedRestoCode);
      if (statusCheck.status === 'unavailable') {
        setErrorMessage(statusCheck.error || 'Unable to verify registration. Please check your connection.');
        return;
      }
      if (statusCheck.status === 'pending_reception_payment') {
        setErrorMessage('Your registration is queued. Please visit the reception desk to choose and pay for your meal package.');
        sound.playDangerAlarm();
        return;
      }
      if (statusCheck.status === 'needs_pin_setup') {
        if (!/^\d{6,}$/.test(enteredPin)) {
          setErrorMessage('Payment received! Please set a 6-digit personal PIN to activate your pass.');
          sound.playDangerAlarm();
          return;
        }
        if (enteredPin !== pinConfirm.trim()) {
          setErrorMessage('PINs do not match. Please verify your new PIN.');
          sound.playDangerAlarm();
          return;
        }
        const activation = await restoStore.completeCustomerActivation({
          phoneOrMember: cleanPhoneOrMember,
          newPin: enteredPin,
          restaurantCode: selectedRestoCode,
        });
        if (activation.success && activation.customer) {
          sound.playSuccessBeep();
          onLoginSuccess('customer', `${activation.customer.name} (#${activation.customer.memberNo})`);
        } else {
          setErrorMessage(activation.error || 'PIN setup could not be completed. Please visit reception.');
          sound.playDangerAlarm();
        }
        return;
      }
      if (statusCheck.status === 'pending_boss_approval') {
        setErrorMessage('Your registration is awaiting manager approval. Reception has confirmed payment; up to 3 grace plates are active at the scanner.');
        sound.playDangerAlarm();
        return;
      }
      if (statusCheck.status === 'rejected') {
        setErrorMessage('This registration was not approved. Please contact cafeteria management.');
        sound.playDangerAlarm();
        return;
      }

      if (!enteredPin) {
        setErrorMessage('Please enter your 6-digit PIN.');
        sound.playDangerAlarm();
        return;
      }

      const customerLoginRes = await restoStore.customerLogin({
        phone: cleanPhoneOrMember,
        pin: enteredPin,
        restaurantCode: selectedRestoCode,
      });

      if (customerLoginRes.success && customerLoginRes.customer) {
        sound.playSuccessBeep();
        onLoginSuccess('customer', `${customerLoginRes.customer.name} (#${customerLoginRes.customer.memberNo})`);
      } else {
        setErrorMessage(customerLoginRes.error || 'Invalid phone number or PIN. Please check your details.');
        sound.playDangerAlarm();
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleManualActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    setActError(null);
    if (!actPhone.trim() || !actCode.trim()) {
      setActError('Please enter your phone number and the 6-digit code given at reception.');
      return;
    }
    if (!/^\d{6,}$/.test(actPin.trim())) {
      setActError('PIN must be at least 6 digits.');
      return;
    }
    if (actPin.trim() !== actPinConfirm.trim()) {
      setActError('PINs do not match.');
      return;
    }

    setActLoading(true);
    try {
      const res = await restoStore.completeCustomerActivation({
        phoneOrMember: actPhone.trim(),
        activationCode: actCode.trim(),
        newPin: actPin.trim(),
        restaurantCode: selectedRestoCode,
      });
      if (res.success && res.customer) {
        sound.playSuccessBeep();
        setShowActivationModal(false);
        onLoginSuccess('customer', `${res.customer.name} (#${res.customer.memberNo})`);
      } else {
        setActError(res.error || 'Activation code invalid or expired. Please visit reception.');
        sound.playDangerAlarm();
      }
    } finally {
      setActLoading(false);
    }
  };

  return (
    <div className="relative min-h-[90vh] flex items-center justify-center p-3 sm:p-6 lg:p-8 overflow-hidden">
      <ScanningPersonBackground />

      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        {/* Left Side: Dedicated Hero Showcase */}
        <div className="lg:col-span-5 hidden lg:flex flex-col">
          <ScannerHeroStage
            title="Dining Pass &amp; Meal Portal"
            subtitle="Check prepaid meal plates, show your dynamic optical QR pass, and dine without waiting in queues."
            facilityName={matchedFacility?.name || 'Kigali Campus Resto'}
            facilityCode={selectedRestoCode}
          />
        </div>

        {/* Right Side: Customer Sign-In Card */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-5 shadow-2xl ring-1 ring-white/10 transition-all">
            {/* Top Navigation Row */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Student Dining Portal
                  </h1>
                  <p className="text-xs text-slate-400">
                    Prepaid passes · Real-time plate balance
                  </p>
                </div>
              </div>

              {onBackToLanding && (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Home</span>
                </button>
              )}
            </div>

            {/* Target Facility Selector Pill */}
            <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-black flex items-center justify-center shrink-0">
                  {selectedRestoCode}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Campus Cafeteria</div>
                  <div className="text-xs font-bold text-white truncate">{matchedFacility?.name}</div>
                </div>
              </div>

              <select
                value={selectedRestoCode}
                onChange={(e) => {
                  setSelectedRestoCode(e.target.value);
                  setErrorMessage(null);
                }}
                className="bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-2.5 py-1.5 text-white font-medium text-xs outline-hidden shrink-0 cursor-pointer"
              >
                {state.restaurants.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} · {r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Error Message Banner */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs flex items-center gap-2.5 animate-shake">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Live Registration Status Assistant Banner */}
            {customerPortalStatus && (
              <div className="p-3 rounded-xl bg-slate-950/90 border border-emerald-500/30 space-y-1">
                {customerPortalStatus.status === 'needs_pin_setup' && (
                  <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Payment verified! Create your personal 6-digit PIN below.</span>
                  </div>
                )}
                {customerPortalStatus.status === 'pending_reception_payment' && (
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Registration received. Please visit reception to pay for your meal package.</span>
                  </div>
                )}
                {customerPortalStatus.status === 'pending_boss_approval' && (
                  <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Awaiting final manager approval. 3 grace plates are active at the scanner!</span>
                  </div>
                )}
              </div>
            )}

            {/* Sign In Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-1">
                <label className="font-semibold text-slate-300 text-xs">
                  Phone Number or Member ID *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="e.g. 0788 123 456 or #28491"
                    value={phoneOrMember}
                    onChange={(e) => {
                      setPhoneOrMember(e.target.value);
                      setErrorMessage(null);
                    }}
                    className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-3.5 py-2.5 text-white text-xs sm:text-sm outline-hidden transition-all"
                  />
                </div>
              </div>

              {customerPortalStatus?.status === 'needs_pin_setup' ? (
                <>
                  <div className="space-y-1">
                    <label className="font-semibold text-emerald-300 text-xs">
                      Create 6-Digit PIN *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                      <input
                        type="password"
                        placeholder="Choose a 6-digit PIN"
                        maxLength={8}
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="w-full bg-slate-950 border border-emerald-500/60 focus:border-emerald-500 rounded-xl pl-10 pr-3.5 py-2.5 text-white font-mono tracking-widest text-xs sm:text-sm outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-emerald-300 text-xs">
                      Confirm PIN *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                      <input
                        type="password"
                        placeholder="Re-enter your 6-digit PIN"
                        maxLength={8}
                        value={pinConfirm}
                        onChange={(e) => setPinConfirm(e.target.value)}
                        className="w-full bg-slate-950 border border-emerald-500/60 focus:border-emerald-500 rounded-xl pl-10 pr-3.5 py-2.5 text-white font-mono tracking-widest text-xs sm:text-sm outline-hidden"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-300 text-xs">
                      Personal PIN *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowRecoveryModal(true)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                    >
                      Forgot PIN?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter 6-digit PIN"
                      maxLength={8}
                      value={pin}
                      onChange={(e) => {
                        setPin(e.target.value);
                        setErrorMessage(null);
                      }}
                      className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-10 py-2.5 text-white font-mono tracking-widest text-xs sm:text-sm outline-hidden transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
              >
                {isVerifying ? (
                  <span>Checking Registration...</span>
                ) : customerPortalStatus?.status === 'needs_pin_setup' ? (
                  <span>Activate Pass &amp; Sign In &rarr;</span>
                ) : (
                  <span>Sign In to Pass &rarr;</span>
                )}
              </button>
            </form>

            {/* Quick Links Row */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <button
                type="button"
                onClick={() => onOpenRegister(selectedRestoCode)}
                className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>New Student? Register for Pass &rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => setShowActivationModal(true)}
                className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Have a 6-digit Reception Code?</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Zero-SMS Activation Modal */}
      {showActivationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <button
              type="button"
              onClick={() => setShowActivationModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                RECEPTION DESK ACTIVATION
              </span>
              <h3 className="text-lg font-black text-white">Activate With Reception Code</h3>
              <p className="text-xs text-slate-400">
                Enter your phone and the single-use 6-digit code handed to you at reception to set your PIN.
              </p>
            </div>

            {actError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs">
                {actError}
              </div>
            )}

            <form onSubmit={handleManualActivation} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Phone Number *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. 0788 123 456"
                  value={actPhone}
                  onChange={(e) => setActPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white outline-hidden"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">6-Digit Code *</label>
                <input
                  required
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 849201"
                  value={actCode}
                  onChange={(e) => setActCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono tracking-widest text-center text-sm outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">New PIN *</label>
                  <input
                    required
                    type="password"
                    maxLength={8}
                    placeholder="6 digits"
                    value={actPin}
                    onChange={(e) => setActPin(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono tracking-widest outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Confirm PIN *</label>
                  <input
                    required
                    type="password"
                    maxLength={8}
                    placeholder="Re-enter"
                    value={actPinConfirm}
                    onChange={(e) => setActPinConfirm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono tracking-widest outline-hidden"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={actLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {actLoading ? 'Activating...' : 'Complete Activation & Sign In &rarr;'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* PIN Recovery Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <button
              type="button"
              onClick={() => setShowRecoveryModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase">PIN RECOVERY</span>
              <h3 className="text-lg font-black text-white">Reset Your Dining Pass PIN</h3>
              <p className="text-xs text-slate-400">
                To protect against SIM swaps and unauthorized meal use, PIN resets are issued in person at the cafeteria reception desk.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2">
              <div className="font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Zero-Fraud Security Policy</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Visit the cafeteria cashier desk with your student ID. The receptionist will confirm your identity and generate a 15-minute reset authorization code.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowRecoveryModal(false);
                setShowActivationModal(true);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all border border-slate-700 cursor-pointer"
            >
              I Already Have a Reset Code from Reception &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
