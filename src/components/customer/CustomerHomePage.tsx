import React from 'react';
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
    : Math.max(0, customer.gracePlatesRemaining ?? (customer.gracePlatesAllowed || 4));
  const allowedGrace = graceInfo ? graceInfo.allowed : (customer.gracePlatesAllowed || 4);
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

      {/* Primary Hero Card: Welcome, Balance, Card Status & Primary Action */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-7 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
              {restaurant?.name || 'Campus Dining'} · {customer.restaurantCode}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
              Welcome, {customer.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Member ID <span className="font-mono font-semibold text-slate-200">#{customer.memberNo}</span>
              {customer.branchName ? ` · ${customer.branchName}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold ${
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
              <span>
                Card {customer.cardStatus === 'active' ? 'Active' : 'Locked'} · V{customer.cardVersion}
              </span>
            </span>
          </div>
        </div>

        <div className="py-6 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Utensils className="w-4 h-4 text-emerald-400" />
              <span>Remaining Meal Balance</span>
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span
                data-testid="customer-home-balance"
                className="text-5xl sm:text-6xl font-black text-white font-mono tabular-nums tracking-tight"
              >
                {balance}
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-300 uppercase tracking-wide">
                Prepaid Plates
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Derived from your verified restaurant ledger · Unused plates never expire
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigatePage('my_card')}
              className="px-5 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <QrCode className="w-5 h-5" />
              <span>Show My QR Pass</span>
            </button>

            <button
              type="button"
              onClick={onOpenTransferModal}
              className="px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Send className="w-4 h-4 text-emerald-400" />
              <span>{transferPlatesLabel}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Shortcuts Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onNavigatePage('my_card')}
          className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 text-left transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-2.5">
            <QrCode className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-white">{t.customer.navMyCard || 'My Card & QR'}</div>
          <div className="text-xs text-slate-400 mt-0.5">Rotating &amp; backup QR</div>
        </button>

        <button
          type="button"
          onClick={onOpenTransferModal}
          className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 text-left transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center mb-2.5">
            <Send className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-white">{t.customer.transferPlates || 'Transfer Plates'}</div>
          <div className="text-xs text-slate-400 mt-0.5">Send within {customer.restaurantCode}</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigatePage('notifications')}
          className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 text-left transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            {unreadNotifCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-mono font-bold text-xs">
                {unreadNotifCount} new
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-white">{t.customer.navNotifications || 'Notifications'}</div>
          <div className="text-xs text-slate-400 mt-0.5">Meal &amp; account alerts</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigatePage('profile', 'security')}
          className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 text-left transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center mb-2.5">
            <Shield className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-white">{t.customer.navSecurity || 'Security & PIN'}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {customer.hasCustomPin ? 'PIN active · Card controls' : 'Set 6-digit PIN'}
          </div>
        </button>
      </div>

      {/* Compact Recent Activity Preview */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">{t.customer.recentActivityTitle || 'Recent Activity'}</h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigatePage('activity')}
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg px-1.5 py-0.5"
          >
            <span>{t.customer.viewAll || 'View all'}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentActivity.length === 0 ? (
          <div className="py-6 text-center text-xs sm:text-sm text-slate-400">
            {t.customer.noActivityYet || 'No meal redemptions or top-ups recorded yet.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {recentActivity.slice(0, 4).map((item) => {
              const isPositive = item.platesDelta > 0;
              return (
                <div key={item.id} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.type === 'purchase' || item.type === 'transfer_in' ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : item.type === 'transfer_out' ? (
                        <ArrowUpRight className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Utensils className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{formatEntryLabel(item.type)}</div>
                      <div className="text-xs text-slate-400">
                        {new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} ·{' '}
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`font-mono font-bold tabular-nums text-sm shrink-0 ${
                      isPositive ? 'text-emerald-400' : 'text-slate-200'
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

