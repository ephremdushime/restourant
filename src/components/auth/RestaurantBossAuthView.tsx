import React, { useState } from 'react';
import { UserRole, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { sound } from '../../services/audioService';
import { ScannerHeroStage } from '../common/ScannerHeroStage';
import { ScanningPersonBackground } from '../common/ScanningPersonBackground';
import {
  Server,
  Lock,
  Eye,
  EyeOff,
  Building2,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  User,
  Sparkles,
  BarChart3,
  CreditCard,
  CheckCircle2,
} from 'lucide-react';

interface RestaurantBossAuthViewProps {
  onLoginSuccess: (role: UserRole, userLabel: string) => void;
  onBackToLanding?: () => void;
  initialRestoCode?: string;
  isDemoMode?: boolean;
  language: Language;
}

export const RestaurantBossAuthView: React.FC<RestaurantBossAuthViewProps> = ({
  onLoginSuccess,
  onBackToLanding,
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

  const [username, setUsername] = useState(isDemoMode ? 'boss@example.local' : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const cleanUsername = username.trim();

    if (!cleanUsername) {
      setErrorMessage('Enter your assigned restaurant administrator username.');
      sound.playDangerAlarm();
      return;
    }
    if (!password) {
      setErrorMessage('Enter your administrator password.');
      sound.playDangerAlarm();
      return;
    }

    setIsVerifying(true);
    try {
      const serverAuth = await restoStore.loginToServer({
        role: 'restaurant_admin',
        username: cleanUsername,
        password,
        restaurantCode: selectedRestoCode,
      });

      if (serverAuth.success) {
        restoStore.setRestaurantCode(selectedRestoCode);
        restoStore.setRole('restaurant_admin');
        restoStore.logAudit({
          restaurantCode: selectedRestoCode,
          actorRole: 'restaurant_admin',
          actorName: cleanUsername || 'Restaurant Boss',
          action: 'PORTAL_LOGIN_SUCCESS',
          details: `Restaurant Boss authenticated for ${matchedFacility?.name} (${selectedRestoCode})`,
        });
        sound.playSuccessBeep();
        onLoginSuccess(
          'restaurant_admin',
          serverAuth.user?.userLabel || `${matchedFacility?.name} Boss (${cleanUsername || 'Admin'})`
        );
      } else {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        sound.playDangerAlarm();
        setErrorMessage(
          serverAuth.error || `Authentication failed (${5 - nextAttempts} attempts remaining before temporary lockout).`
        );
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleQuickDemoFill = () => {
    setUsername('boss@example.local');
    setPassword('demo-boss-password');
  };

  return (
    <div className="relative min-h-[90vh] flex items-center justify-center p-3 sm:p-6 lg:p-8 overflow-hidden">
      <ScanningPersonBackground />

      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        {/* Left Side: Executive Showcase */}
        <div className="lg:col-span-5 hidden lg:flex flex-col">
          <ScannerHeroStage
            title="Restaurant Boss Admin"
            subtitle="Real-time plate turnover metrics, staff station device pairing, Mobile Money approvals, and customer ledger audits."
            facilityName={matchedFacility?.name || 'Kigali Campus Resto'}
            facilityCode={selectedRestoCode}
          />
        </div>

        {/* Right Side: Boss Authentication Card */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-5 shadow-2xl ring-1 ring-white/10 transition-all">
            {/* Top Navigation Row */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                  <Server className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Restaurant Boss Portal
                  </h1>
                  <p className="text-xs text-slate-400">
                    Executive management · Real-time ledger &amp; approvals
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

            {/* Managed Cafeteria Scope */}
            <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400 font-mono text-xs font-black flex items-center justify-center shrink-0">
                  {selectedRestoCode}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold text-teal-400 tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3 h-3" />
                    <span>Restaurant Facility Scope</span>
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-white truncate">{matchedFacility?.name}</div>
                  <div className="text-[11px] text-slate-400 truncate">{matchedFacility?.address || 'Kigali, Rwanda'}</div>
                </div>
              </div>

              {state.restaurants.length > 1 && (
                <div className="relative shrink-0">
                  <select
                    value={selectedRestoCode}
                    onChange={(e) => {
                      setSelectedRestoCode(e.target.value);
                      setErrorMessage(null);
                    }}
                    className="bg-slate-900 border border-slate-700 hover:border-teal-500 focus:border-teal-500 rounded-xl px-2.5 py-1.5 text-slate-200 font-semibold text-xs outline-hidden cursor-pointer"
                  >
                    {state.restaurants.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.code} · {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Error Message Banner */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs flex items-center gap-2.5 animate-shake">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-1">
                <label className="font-semibold text-slate-300 text-xs">
                  Administrator Username / Email *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="e.g. boss@example.local or admin@resto.rw"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setErrorMessage(null);
                    }}
                    className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-3.5 py-2.5 text-white text-xs sm:text-sm outline-hidden transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 text-xs">
                  Administrator Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your confidential password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMessage(null);
                    }}
                    className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-10 py-2.5 text-white text-xs sm:text-sm outline-hidden transition-all"
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

              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
              >
                {isVerifying ? (
                  <span>Verifying Credentials...</span>
                ) : (
                  <span>Open Executive Management Dashboard &rarr;</span>
                )}
              </button>
            </form>

            {/* Security Assurance Footer */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hardware-Secured Credential Storage</span>
              </span>

              {isDemoMode && (
                <button
                  type="button"
                  onClick={handleQuickDemoFill}
                  className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Fill Demo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
