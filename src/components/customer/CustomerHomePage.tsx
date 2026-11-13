import React, { useState } from 'react';
import { Customer, Language, LedgerEntry, Restaurant, StudentSubscriptionSettings } from '../../types';
import { translations } from '../../services/i18n';
import { CustomerPortalPage, CustomerProfileSubPage } from './CustomerPortalLayout';
import {
  QrCode,
  Send,
  History,
  Bell,
  Shield,
  User,
  Utensils,
  AlertTriangle,
  Lock,
  Unlock,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  CheckCircle2,
  Gift,
  Eye,
  EyeOff,
  CreditCard,
  Sparkles,
} from 'lucide-react';

interface CustomerHomePageProps {
  customer: Customer;
  restaurant?: Restaurant;
  balance: number;
  recentActivity: LedgerEntry[];
  unreadNotifCount: number;
  graceInfo?: { allowed: number; consumed: number; remaining: number };
  subscriptionSettings?: StudentSubscriptionSettings;
  language?: Language;
  lowBalanceTitle: string;
  lowBalanceMessage: string;
  unlockCardLabel: string;
  transferPlatesLabel: string;
  onNavigatePage: (page: CustomerPortalPage, profileSubPage?: CustomerProfileSubPage) => void;
  onOpenTransferModal: () => void;
  onToggleLockCard: () => void;
}

export const CustomerHomePage: React.FC<CustomerHomePageProps> = ({
  customer,
  restaurant,
  balance,
  recentActivity,
  unreadNotifCount,
  graceInfo,
  subscriptionSettings,
  language,
  lowBalanceTitle,
  lowBalanceMessage,
  unlockCardLabel,
  transferPlatesLabel,
  onNavigatePage,
  onOpenTransferModal,
  onToggleLockCard,
}) => {
  const t = translations[language || 'en'] || translations.en;

  const [showBalance, setShowBalance] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem('restopass_customer_show_balance');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleShowBalance = () => {
    setShowBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('restopass_customer_show_balance', String(next));
      } catch {}
      return next;
    });
  };

  const formatEntryLabel = (type: LedgerEntry['type']) => {
    switch (type) {
      case 'scan':
        return 'Buffet Meal Redeemed';
      case 'purchase':
        return 'Meal Package Top-Up';
      case 'transfer_out':
        return 'Plates Transferred Out';
      case 'transfer_in':
        return 'Plates Received';
      case 'reversal':
        return 'Transaction Reversal';
      case 'adjustment':
        return 'Balance Adjustment';
      case 'undo':
        return 'Scan Reversal';
      default:
        return String(type).replace('_', ' ');
    }
  };

  const remainingGrace = graceInfo
    ? graceInfo.remaining
    : Math.max(0, customer.gracePlatesRemaining ?? (customer.gracePlatesAllowed || 3));
  const allowedGrace = graceInfo ? graceInfo.allowed : (customer.gracePlatesAllowed || 3);
  const promoStartMs = subscriptionSettings?.promoStartsAt ? Date.parse(subscriptionSettings.promoStartsAt) : 0;
  const promoEndMs = subscriptionSettings?.promoEndsAt ? Date.parse(subscriptionSettings.promoEndsAt) : Number.POSITIVE_INFINITY;
  const promoActive = Boolean(subscriptionSettings?.promoAccessEnabled) &&
    (!subscriptionSettings?.promoStartsAt || Number.isFinite(promoStartMs)) &&
    (!subscriptionSettings?.promoEndsAt || Number.isFinite(promoEndMs)) &&
    Date.now() >= promoStartMs && Date.now() < promoEndMs;
  const customerAccessIsFree = subscriptionSettings?.enabled === false || promoActive;

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {customerAccessIsFree && (
        <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-600/60 flex items-start gap-3">
          <Gift className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-emerald-100 leading-relaxed">
            <strong className="block text-white mb-1">{promoActive ? 'Complimentary promotional access' : 'Customer dashboard access is free'}</strong>
            {promoActive
              ? (subscriptionSettings?.promoMessage || 'You are enjoying complimentary RestoPass access during our launch promotion.')
              : 'RestoPass has temporarily disabled customer subscription payments. Your dashboard access is free.'}
            {promoActive && subscriptionSettings?.promoEndsAt && (
              <span className="block mt-1 font-semibold">Promotional access ends {new Date(subscriptionSettings.promoEndsAt).toLocaleDateString()}.</span>
            )}
            <span className="block mt-1 text-emerald-200/80">No automatic charge will occur. Any future access fee requires a separate subscription and your approval of an MTN MoMo request.</span>
          </div>
        </div>
      )}
      {/* Relevant Account Warnings Only When Applicable */}
      {customer.provisionalStatus === 'pending_approval' && (
        <div className="p-4 rounded-2xl bg-amber-950/60 border border-amber-500/50 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0 mt-0.5">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">{t.customer.awaitingApproval || 'Awaiting Boss Approval'}</div>
              <p className="text-xs text-amber-100/90 mt-0.5">
                Your registration is in the approval queue. You can already redeem provisional grace meals at the stand.
              </p>
            </div>
          </div>
          <div className="text-right shrink-0 font-mono">
            <div className="text-lg font-black text-amber-300">{remainingGrace} / {allowedGrace}</div>
            <div className="text-[11px] text-amber-200">{t.customer.graceMeals || 'Grace Meals'}</div>
          </div>
        </div>
      )}

      {balance < 5 && (
        <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/50 text-amber-100 text-sm flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-white">{lowBalanceTitle}</div>
            <div className="mt-0.5 text-amber-100/90 text-xs sm:text-sm leading-relaxed">
              {lowBalanceMessage}
            </div>
          </div>
        </div>
      )}

      {customer.cardStatus === 'locked' && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/60 text-rose-100 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-white">Physical Card Locked</div>
              <div className="text-xs text-rose-200">Stand taps are paused · Meal balance is preserved</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleLockCard}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
          >
            {unlockCardLabel}
          </button>
        </div>
      )}

      {/* Airtel-Style Meal Wallet Hero Card */}
      <div className="relative rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/50 border border-slate-800 p-6 sm:p-7 shadow-xl overflow-hidden">
        {/* Subtle decorative watermark */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-4 right-4 opacity-5 pointer-events-none">
          <Utensils className="w-32 h-32 text-emerald-400" />
        </div>

        {/* Card Header: Tenant Facility & Card Status Badge */}
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
                {customer.restaurantCode}
              </span>
              <span className="text-xs font-bold text-slate-300 truncate">
                {restaurant?.name || 'Campus Dining'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1.5 flex items-center gap-2">
              <span>{customer.name}</span>
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Member ID #{customer.memberNo} {customer.branchName ? `· ${customer.branchName}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold ${
                customer.cardStatus === 'active'
                  ? 'bg-emerald-950/70 border-emerald-600/70 text-emerald-300 shadow-xs'
                  : 'bg-rose-950/70 border-rose-600/70 text-rose-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  customer.cardStatus === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              <span>
                Card {customer.cardStatus === 'active' ? 'Active' : 'Locked'} · V{customer.cardVersion}
              </span>
            </span>

            <button
              type="button"
              onClick={onToggleLockCard}
              className={`p-1.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                customer.cardStatus === 'active'
                  ? 'bg-slate-800/80 hover:bg-rose-950/60 border-slate-700 hover:border-rose-700 text-slate-400 hover:text-rose-300'
                  : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
              }`}
              title={customer.cardStatus === 'active' ? 'Freeze physical card' : 'Unfreeze physical card'}
            >
              {customer.cardStatus === 'active' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Card Body: Balance with Privacy Eye Toggle */}
        <div className="relative py-6 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Remaining Meal Balance
              </span>
              <button
                type="button"
                onClick={toggleShowBalance}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px] font-mono"
                title={showBalance ? 'Hide meal balance' : 'Show meal balance'}
              >
                {showBalance ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="text-[10px]">{showBalance ? 'Hide' : 'Show'}</span>
              </button>
            </div>

            <div className="mt-2 flex items-baseline gap-3">
              <span
                data-testid="customer-home-balance"
                className="text-5xl sm:text-6xl font-black text-white font-mono tabular-nums tracking-tight"
              >
                {showBalance ? balance : '••••'}
              </span>
              <span className="text-sm sm:text-base font-bold text-emerald-400 uppercase tracking-wide">
                Plates Available
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Verified dining ledger · Unused meal plates never expire</span>
            </p>
          </div>

          {/* Quick Hero Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigatePage('my_card')}
              className="px-5 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <QrCode className="w-5 h-5 text-white" />
              <span>Show My QR Pass</span>
            </button>

            <button
              type="button"
              onClick={onOpenTransferModal}
              className="px-4 py-3.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Send className="w-4 h-4 text-emerald-400" />
              <span>{transferPlatesLabel}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Airtel-Style Quick Action Grid (6 Rounded Shortcuts) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Quick Actions
          </span>
          <span className="text-[11px] text-emerald-400 font-mono">
            {customer.restaurantCode} Cafeteria
          </span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
          {/* 1. Show QR Pass */}
          <button
            type="button"
            onClick={() => onNavigatePage('my_card')}
            className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 flex flex-col items-center justify-center text-center transition-all cursor-pointer active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 group-hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-2 transition-colors shadow-inner">
              <QrCode className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white leading-tight">QR Pass</span>
            <span className="text-[10px] text-slate-400 leading-tight mt-0.5">Scan at stand</span>
          </button>

          {/* 2. Transfer Plates */}
          <button
            type="button"
            onClick={onOpenTransferModal}
            className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/40 flex flex-col items-center justify-center text-center transition-all cursor-pointer active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <div className="w-11 h-11 rounded-2xl bg-sky-500/15 group-hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 flex items-center justify-center mb-2 transition-colors shadow-inner">
              <Send className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white leading-tight">Transfer</span>
            <span className="text-[10px] text-slate-400 leading-tight mt-0.5">To friend</span>
          </button>

          {/* 3. Freeze / Lock Physical Card */}
          <button
            type="button"
            onClick={onToggleLockCard}
            className={`p-3 sm:p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-850 border transition-all cursor-pointer active:scale-95 group focus-visible:outline-none focus-visible:ring-2 ${
              customer.cardStatus === 'locked'
                ? 'border-rose-500/50 hover:border-rose-400 focus-visible:ring-rose-400'
                : 'border-slate-800 hover:border-rose-500/40 focus-visible:ring-rose-400'
            } flex flex-col items-center justify-center text-center`}
          >
            <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center mb-2 transition-colors shadow-inner ${
              customer.cardStatus === 'locked'
                ? 'bg-rose-500/25 border-rose-500/40 text-rose-300'
                : 'bg-rose-500/15 group-hover:bg-rose-500/25 border-rose-500/30 text-rose-400'
            }`}>
              {customer.cardStatus === 'locked' ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <span className="text-xs font-bold text-white leading-tight">
              {customer.cardStatus === 'locked' ? 'Unlock Card' : 'Freeze Card'}
            </span>
            <span className="text-[10px] text-slate-400 leading-tight mt-0.5">
              {customer.cardStatus === 'locked' ? 'Tap to resume' : 'Anti-theft'}
            </span>
          </button>

          {/* 4. Passbook / Statements */}
          <button
            type="button"
            onClick={() => onNavigatePage('activity')}
            className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/40 flex flex-col items-center justify-center text-center transition-all cursor-pointer active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 group-hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mb-2 transition-colors shadow-inner">
              <History className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white leading-tight">Passbook</span>
            <span className="text-[10px] text-slate-400 leading-tight mt-0.5">Meal history</span>
          </button>

          {/* 5. Top-Up & Billing */}
          <button
            type="button"
            onClick={() => onNavigatePage('profile', 'subscription')}
            className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 flex flex-col items-center justify-center text-center transition-all cursor-pointer active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 group-hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-2 transition-colors shadow-inner">
              <CreditCard className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white leading-tight">Top-Up</span>
            <span className="text-[10px] text-slate-400 leading-tight mt-0.5">Cash / MoMo</span>
          </button>

          {/* 6. Security & PIN */}
          <button
            type="button"
            onClick={() => onNavigatePage('profile', 'security')}
            className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/40 flex flex-col items-center justify-center text-center transition-all cursor-pointer active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <div className="w-11 h-11 rounded-2xl bg-purple-500/15 group-hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 flex items-center justify-center mb-2 transition-colors shadow-inner">
              <Shield className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white leading-tight">Security</span>
            <span className="text-[10px] text-slate-400 leading-tight mt-0.5">PIN &amp; keys</span>
          </button>
        </div>
      </div>

      {/* Passbook Statement: Recent Activity Feed */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 space-y-4 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Passbook Statement
              </h2>
              <p className="text-[11px] text-slate-400">Recent meal deductions &amp; top-ups</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigatePage('activity')}
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg px-2 py-1 bg-slate-950/60 border border-slate-800"
          >
            <span>View All Statements</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentActivity.length === 0 ? (
          <div className="py-8 text-center text-xs sm:text-sm text-slate-400">
            No meal redemptions or top-ups recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {recentActivity.slice(0, 5).map((item) => {
              const isPositive = item.platesDelta > 0;
              return (
                <div key={item.id} className="py-3.5 flex items-center justify-between text-sm group hover:bg-slate-800/20 px-2 rounded-xl transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border ${
                        isPositive
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : item.type === 'transfer_out'
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {item.type === 'purchase' || item.type === 'transfer_in' ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : item.type === 'transfer_out' ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <Utensils className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-xs sm:text-sm">
                        {formatEntryLabel(item.type)}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>
                          {new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} ·{' '}
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {(item.reason || item.reference) && (
                          <span className="truncate text-slate-500 font-mono text-[10px]">
                            · {item.reason || item.reference}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`font-mono font-bold tabular-nums text-sm shrink-0 px-2.5 py-1 rounded-lg border ${
                      isPositive
                        ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                        : item.type === 'transfer_out'
                        ? 'bg-amber-950/60 border-amber-800/60 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    {isPositive ? `+${item.platesDelta}` : item.platesDelta} plates
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

