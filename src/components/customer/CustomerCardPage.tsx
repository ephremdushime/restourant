import React from 'react';
import { Customer, Language, Restaurant } from '../../types';
import { translations } from '../../services/i18n';
import { QrCanvas } from '../common/QrCanvas';
import {
  QrCode,
  RefreshCw,
  Lock,
  Unlock,
  ShieldAlert,
  CheckCircle2,
  CreditCard,
} from 'lucide-react';

interface CustomerCardPageProps {
  customer: Customer;
  restaurant?: Restaurant;
  qrPassType?: 'dynamic';
  onChangeQrPassType?: (type: 'dynamic') => void;
  tokenInfo: { token: string; step: number; secondsRemaining: number };
  onForceRefresh: () => void;
  onToggleLockCard: () => void;
  lockMyCardLabel: string;
  unlockMyCardLabel: string;
  language?: Language;
}

export const CustomerCardPage: React.FC<CustomerCardPageProps> = ({
  customer,
  restaurant,
  tokenInfo,
  onForceRefresh,
  onToggleLockCard,
  lockMyCardLabel,
  unlockMyCardLabel,
  language,
}) => {
  const t = translations[language || 'en'] || translations.en;
  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Page Title & Card Status Header */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-black text-white tracking-tight">My Meal Pass &amp; Card</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            {restaurant?.name || 'Campus Dining'} ({customer.restaurantCode}) · Member #{customer.memberNo}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-mono font-bold ${
              customer.cardStatus === 'active'
                ? 'bg-emerald-950/60 border-emerald-700/70 text-emerald-300'
                : 'bg-rose-950/60 border-rose-700/70 text-rose-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                customer.cardStatus === 'active' ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <span>CARD V{customer.cardVersion} · {customer.cardStatus.toUpperCase()}</span>
          </span>
        </div>
      </div>

      {/* Main QR Credential Panel (Rotating v1 Phone Pass Only — Static c1 QR Is Printed Only on Physical PVC Cards) */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-lg text-center space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs sm:text-sm">
            <span className="px-3.5 py-2 rounded-lg font-bold bg-emerald-600 text-white shadow-xs">
              {t.customer.rotatingPhoneQr || 'Rotating Phone QR'}
            </span>
            <span className="px-2.5 py-1 text-[11px] font-mono text-cyan-300 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" />
              <span>PVC Card V{customer.cardVersion} (Staff Issued Only)</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onForceRefresh}
            title="Force immediate QR refresh"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-mono text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/80 px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t.customer.refreshQr || 'Refresh'}</span>
          </button>
        </div>

        {/* QR Code Canvas */}
        <div className="relative inline-block mx-auto">
          <div className="relative p-4 bg-white rounded-2xl shadow-lg border-2 border-emerald-500/80">
            <QrCanvas
              value={tokenInfo.token}
              size={220}
            />
            <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-800">
              <span className="flex items-center gap-1 font-black text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                LIVE 30S PASS
              </span>
              <span className="font-bold text-slate-900">
                #{customer.memberNo} · {customer.cardStatus === 'active' ? 'Active' : 'Locked'}
              </span>
            </div>
          </div>
        </div>

        {/* Token Rotation Status */}
        <div className="space-y-2 max-w-xs mx-auto">
          <div className="flex items-center justify-between text-xs sm:text-sm font-mono text-slate-200">
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Dynamic Token (v1 · Key V{customer.keyVersion})</span>
            </span>
            <span className="font-bold text-white tabular-nums">
              Rotates in {tokenInfo.secondsRemaining}s
            </span>
          </div>
          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className="bg-emerald-500 h-full transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, (tokenInfo.secondsRemaining / 30) * 100))}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 leading-relaxed pt-1">
            Single-use 30-second token verified by the cafeteria scanner authority. Permanent card credentials (c1) are printed exclusively on physical CR80 PVC cards by restaurant staff.
          </p>
        </div>
      </div>

      {/* Card Lock / Unlock & Anti-Fraud Security Guidance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              {customer.cardStatus === 'locked' ? (
                <Lock className="w-4 h-4 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              <span>
                Physical Card Status: {customer.cardStatus === 'locked' ? 'Locked' : 'Active'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {customer.cardStatus === 'locked'
                ? 'Your card is currently frozen. No meals can be deducted at buffet stands until you unlock it. Your meal balance remains 100% intact.'
                : 'If your physical PVC card is misplaced, lock it immediately to block unauthorized scans while keeping your meal credits safe.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleLockCard}
            className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              customer.cardStatus === 'locked'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-rose-950/80 hover:bg-rose-900 border border-rose-700/80 text-rose-100'
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

        <div className="rounded-2xl bg-amber-950/30 border border-amber-500/40 p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Do Not Share Your QR Pass</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Never send screenshots or photos of your QR code to anyone. Dynamic phone tokens expire every 30 seconds and are blocked after a single scan across all cafeteria terminals.
          </p>
          <div className="pt-1 text-[11px] font-mono text-amber-300/90">
            Holder: {customer.name} · #{customer.memberNo} · {customer.restaurantCode}
          </div>
        </div>
      </div>
    </div>
  );
};

