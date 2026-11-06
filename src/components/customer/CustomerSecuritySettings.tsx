import React from 'react';
import { Customer } from '../../types';
import {
  KeyRound,
  Shield,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
} from 'lucide-react';

interface CustomerSecuritySettingsProps {
  customer: Customer;
  onOpenPinSetup: () => void;
  onLockDashboard: () => void;
  onToggleLockCard: () => void;
  lockMyCardLabel: string;
  unlockMyCardLabel: string;
}

export const CustomerSecuritySettings: React.FC<CustomerSecuritySettingsProps> = ({
  customer,
  onOpenPinSetup,
  onLockDashboard,
  onToggleLockCard,
  lockMyCardLabel,
  unlockMyCardLabel,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Personal PIN Management */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <KeyRound className="w-4 h-4 text-sky-400" />
            <span>Personal 6-Digit Security PIN</span>
            {customer.hasCustomPin ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-mono font-bold text-emerald-300">
                Active
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-mono font-bold text-amber-300">
                Setup Recommended
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
            Your PIN authorizes sign-in, peer-to-peer plate transfers, and unlocking the off-screen privacy shield. Staff never see or know your PIN.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenPinSetup}
          className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-bold shrink-0 transition-colors cursor-pointer"
        >
          {customer.hasCustomPin ? 'Change Security PIN' : 'Set 6-Digit PIN'}
        </button>
      </div>

      {/* Off-Screen Auto-Lock & Manual Lock Screen */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Shield className="w-4 h-4 text-purple-400" />
            <span>Instant Off-Screen Dashboard Lock</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
            RestoPass automatically locks your digital pass whenever your phone screen turns off or the browser tab is hidden. You can also lock the screen immediately below.
          </p>
        </div>

        <button
          type="button"
          onClick={onLockDashboard}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs sm:text-sm font-bold shrink-0 transition-colors cursor-pointer"
        >
          Lock Screen Now
        </button>
      </div>

      {/* Physical Card Lock / Freeze */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            {customer.cardStatus === 'locked' ? (
              <Lock className="w-4 h-4 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <span>Physical PVC Card Lock (Card V{customer.cardVersion})</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
            {customer.cardStatus === 'locked'
              ? 'Your physical card is locked. No meals can be scanned at cafeteria stands until you unlock it. Your meal credits remain completely intact.'
              : 'Misplaced your printed card? Lock it immediately to block stand scans while keeping your remaining meal balance safe.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleLockCard}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold shrink-0 flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            customer.cardStatus === 'locked'
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-100'
          }`}
        >
          {customer.cardStatus === 'locked' ? (
            <>
              <Unlock className="w-4 h-4" />
              <span>{unlockMyCardLabel}</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>{lockMyCardLabel}</span>
            </>
          )}
        </button>
      </div>

      {/* Session & Credential Security Metadata (Safe Public Indicators Only) */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <span>Credential &amp; Session Integrity</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-400">Physical Card Version</div>
            <div className="font-mono font-bold text-white mt-0.5">
              V{customer.cardVersion} ({customer.cardStatus})
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-400">Phone QR Key Version</div>
            <div className="font-mono font-bold text-white mt-0.5">V{customer.keyVersion}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-400">Authenticated Tenant</div>
            <div className="font-mono font-bold text-emerald-400 mt-0.5">{customer.restaurantCode}</div>
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs text-slate-400 pt-1">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            If you forget your PIN or lose your physical card permanently, visit the cafeteria reception desk with your Student ID or National ID for an audited PIN reset or card reissue.
          </span>
        </div>
      </div>
    </div>
  );
};

