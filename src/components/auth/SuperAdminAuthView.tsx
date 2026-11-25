import React, { useState } from 'react';
import { UserRole, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { sound } from '../../services/audioService';
import { ScanningPersonBackground } from '../common/ScanningPersonBackground';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  AlertTriangle,
  User,
  Sparkles,
  KeyRound,
  Terminal,
} from 'lucide-react';

interface SuperAdminAuthViewProps {
  onLoginSuccess: (role: UserRole, userLabel: string) => void;
  onBackToLanding?: () => void;
  isDemoMode?: boolean;
  language: Language;
}

export const SuperAdminAuthView: React.FC<SuperAdminAuthViewProps> = ({
  onLoginSuccess,
  onBackToLanding,
  isDemoMode = false,
}) => {
  const [username, setUsername] = useState(isDemoMode ? 'superadmin@example.local' : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!password) {
      setErrorMessage('Please enter the Super Admin master password.');
      sound.playDangerAlarm();
      return;
    }

    setIsVerifying(true);
    try {
      const serverAuth = await restoStore.loginToServer({
        role: 'super_admin',
        username: username.trim() || 'superadmin@example.local',
        password,
      });

      if (serverAuth.success) {
        restoStore.setRole('super_admin');
        restoStore.logAudit({
          actorRole: 'super_admin',
          actorName: 'Platform Director (Super Admin)',
          action: 'SUPER_ADMIN_LOGIN',
          details: 'Global Super Admin authenticated via cryptographic constant-time comparison',
        });
        sound.playSuccessBeep();
        onLoginSuccess('super_admin', serverAuth.user?.userLabel || 'Platform Director (Super Admin)');
      } else {
        sound.playDangerAlarm();
        setErrorMessage(serverAuth.error || 'Super Admin authentication failed.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="relative min-h-[90vh] flex items-center justify-center p-3 sm:p-6 lg:p-8 overflow-hidden">
      <ScanningPersonBackground />

      <div className="relative z-10 w-full max-w-lg mx-auto">
        <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl ring-1 ring-white/10">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Super Admin Console
                </h1>
                <p className="text-xs text-slate-400">
                  Bestie Companies Ltd · Sovereign Authority
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

          <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/30 flex items-center gap-3">
            <KeyRound className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-xs text-slate-300">
              Platform administration, multi-tenant restaurant provisioning, license issuance, and co-signing authority.
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs flex items-center gap-2.5 animate-shake">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs sm:text-sm">
            <div className="space-y-1">
              <label className="font-semibold text-slate-300 text-xs">
                Platform Username / Handle
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="superadmin@example.local"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-3.5 py-2.5 text-white text-xs sm:text-sm outline-hidden"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300 text-xs">
                Master Security Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter Master Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-10 py-2.5 text-white text-xs sm:text-sm outline-hidden font-mono"
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
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
            >
              {isVerifying ? <span>Verifying Master Secret...</span> : <span>Enter Super Admin Console &rarr;</span>}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Versioned HMAC Session Binding</span>
            </span>

            {isDemoMode && (
              <button
                type="button"
                onClick={() => {
                  setUsername('superadmin@example.local');
                  setPassword('AdminPass#2026');
                }}
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
  );
};
