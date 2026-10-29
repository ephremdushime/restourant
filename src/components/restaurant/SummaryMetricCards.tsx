import React from 'react';
import { restoStore } from '../../store/restoStore';
import { Language } from '../../types';
import { translations } from '../../services/i18n';
import {
  UtensilsCrossed,
  AlertTriangle,
  ClockAlert,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';

interface SummaryMetricCardsProps {
  restaurantCode: string;
  onDrilldown: (target: 'meals_today' | 'low_balance' | 'pending_actions') => void;
  language?: Language;
}

export const SummaryMetricCards: React.FC<SummaryMetricCardsProps> = ({
  restaurantCode,
  onDrilldown,
  language = 'en',
}) => {
  const t = translations[language] || translations.en;
  const state = restoStore.getState();

  // 1. Metric: Active Meals Today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayScans = state.scanEvents.filter((e) => {
    if (e.restaurantCode !== restaurantCode) return false;
    const scanDate = new Date(e.timestamp);
    return (
      scanDate >= todayStart &&
      (e.status === 'approved' || e.status === 'warning_confirmed')
    );
  });

  const totalPlatesServedToday = todayScans.reduce((sum, e) => sum + e.platesDeducted, 0);

  let lunchPlates = 0;
  let dinnerPlates = 0;
  todayScans.forEach((e) => {
    const hour = new Date(e.timestamp).getHours();
    if (hour < 16) {
      lunchPlates += e.platesDeducted;
    } else {
      dinnerPlates += e.platesDeducted;
    }
  });

  // 2. Metric: Low Balance Alerts
  const restoCustomers = state.customers.filter((c) => c.restaurantCode === restaurantCode);
  const customersWithBalance = restoCustomers.map((c) => ({
    ...c,
    balance: restoStore.getCustomerBalance(c.id),
  }));

  const lowBalanceCustomers = customersWithBalance.filter((c) => c.balance < 5);
  const criticalBalanceCount = customersWithBalance.filter((c) => c.balance <= 1).length;

  // 3. Metric: Pending Staff Actions
  const pendingApprovals = (state.pendingApprovals || []).filter(
    (a) => a.restaurantCode === restaurantCode && a.status === 'pending'
  );

  const totalPendingActions = pendingApprovals.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {/* CARD 1: ACTIVE MEALS TODAY */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onDrilldown('meals_today')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDrilldown('meals_today')}
        className="group relative text-left p-6 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-emerald-950/20 flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="text-xs font-bold text-slate-300 tracking-wider uppercase">
                Meals Served Today
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
          </div>

          <div className="pt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-white font-mono tracking-tight tabular-nums">
                {totalPlatesServedToday.toLocaleString()}
              </span>
              <span className="text-sm font-semibold text-emerald-400">plates</span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-xs font-medium text-slate-300">
                Lunch: <strong className="text-white font-mono">{lunchPlates}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-xs font-medium text-slate-300">
                Dinner: <strong className="text-white font-mono">{dinnerPlates}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="pt-4 mt-5 border-t border-slate-800/80 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">Live Buffet Feed</span>
          <div className="text-emerald-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform text-xs">
            <span>View Scans</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* CARD 2: LOW BALANCE ALERTS */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onDrilldown('low_balance')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDrilldown('low_balance')}
        className={`group relative text-left p-6 rounded-2xl border transition-all duration-200 cursor-pointer shadow-lg flex flex-col justify-between ${
          lowBalanceCustomers.length > 0
            ? 'bg-slate-900/80 hover:bg-slate-900 border-amber-500/40 hover:border-amber-400/80'
            : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
        }`}
      >
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  lowBalanceCustomers.length > 0
                    ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                    : 'bg-slate-600'
                }`}
              />
              <span className="text-xs font-bold text-slate-300 tracking-wider uppercase">
                Low Balance Attention
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>

          <div className="pt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-amber-400 font-mono tracking-tight tabular-nums">
                {lowBalanceCustomers.length}
              </span>
              <span className="text-sm font-semibold text-slate-300">patrons under 5 plates</span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              {criticalBalanceCount > 0 ? (
                <span className="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-800/60 text-xs font-bold text-rose-300">
                  {criticalBalanceCount} urgent (&le; 1 plate)
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-xs font-medium text-emerald-400">
                  All others in safe range
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="pt-4 mt-5 border-t border-slate-800/80 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">Top-Up Outreach</span>
          <div className="text-amber-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform text-xs">
            <span>Filter Patrons</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* CARD 3: PENDING STAFF ACTIONS */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onDrilldown('pending_actions')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDrilldown('pending_actions')}
        className={`group relative text-left p-6 rounded-2xl border transition-all duration-200 cursor-pointer shadow-lg flex flex-col justify-between ${
          totalPendingActions > 0
            ? 'bg-slate-900/80 hover:bg-slate-900 border-indigo-500/40 hover:border-indigo-400/80'
            : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
        }`}
      >
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  pendingApprovals.length > 0
                    ? 'bg-indigo-400 animate-ping shadow-[0_0_8px_rgba(129,140,248,0.8)]'
                    : 'bg-slate-600'
                }`}
              />
              <span className="text-xs font-bold text-slate-300 tracking-wider uppercase">
                Pending Staff Actions
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-slate-950 transition-colors">
              <ClockAlert className="w-4 h-4" />
            </div>
          </div>

          <div className="pt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-white font-mono tracking-tight tabular-nums">
                {totalPendingActions}
              </span>
              <span className="text-sm font-semibold text-indigo-400">
                {totalPendingActions === 1 ? 'action required' : 'actions required'}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-xs font-medium text-slate-300">
                Deposits: <strong className="text-white font-mono">{pendingApprovals.length}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="pt-4 mt-5 border-t border-slate-800/80 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">Boss Approval Desk</span>
          <div className="text-indigo-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform text-xs">
            <span>Review Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
};
