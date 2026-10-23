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
  ShieldAlert,
  Users,
  CheckCircle2,
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
  const t = translations[language];
  const state = restoStore.getState();

  // 1. Critical Metric: Active Meals Today
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

  // Breakdown: Lunch (< 16:00) vs Dinner (>= 16:00)
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

  // 2. Critical Metric: Low Balance Alerts
  const restoCustomers = state.customers.filter((c) => c.restaurantCode === restaurantCode);
  const customersWithBalance = restoCustomers.map((c) => ({
    ...c,
    balance: restoStore.getCustomerBalance(c.id),
  }));

  const lowBalanceCustomers = customersWithBalance.filter((c) => c.balance < 5);
  const criticalBalanceCount = customersWithBalance.filter((c) => c.balance <= 1).length;

  // 3. Critical Metric: Pending Staff Actions
  const pendingApprovals = (state.pendingApprovals || []).filter(
    (a) => a.restaurantCode === restaurantCode && a.status === 'pending'
  );
  const graceMealsConsumingCount = pendingApprovals.reduce(
    (acc, a) => acc + (a.gracePlatesConsumed || 0),
    0
  );

  // Active cashier shifts
  const activeShifts = (state.shifts || []).filter(
    (s) => s.restaurantCode === restaurantCode && s.status === 'open'
  );

  const totalPendingActions = pendingApprovals.length + activeShifts.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* CARD 1: ACTIVE MEALS TODAY */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onDrilldown('meals_today')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDrilldown('meals_today')}
        className="group relative text-left p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/70 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-emerald-950/20 flex flex-col justify-between"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Active Meals Today</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-white font-mono tabular-nums tracking-tight">
                {totalPlatesServedToday}
              </span>
              <span className="text-xs font-semibold text-emerald-400">plates served</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Dining consumption recorded across all active buffet scan stations.
            </p>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <div className="text-slate-400 flex items-center gap-3 font-mono text-[11px]">
            <span>Lunch: <strong className="text-white">{lunchPlates}</strong></span>
            <span>·</span>
            <span>Dinner: <strong className="text-white">{dinnerPlates}</strong></span>
          </div>

          <div className="text-emerald-400 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-[11px]">
            <span>Live Feed</span>
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
        className={`group relative text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer shadow-lg flex flex-col justify-between ${
          lowBalanceCustomers.length > 0
            ? 'bg-slate-900/90 border-amber-500/50 hover:border-amber-400'
            : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  lowBalanceCustomers.length > 0 ? 'bg-amber-400' : 'bg-slate-600'
                }`}
              />
              <span>Low Balance Alerts</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-amber-400 font-mono tabular-nums tracking-tight">
                {lowBalanceCustomers.length}
              </span>
              <span className="text-xs font-semibold text-slate-400">
                patrons &lt; 5 plates
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Members nearing zero balance who risk stand dining rejection without top-up.
            </p>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <div className="text-slate-400 flex items-center gap-2 text-[11px]">
            {criticalBalanceCount > 0 ? (
              <span className="text-rose-400 font-mono font-bold">
                {criticalBalanceCount} urgent (≤1 plate)
              </span>
            ) : (
              <span className="text-slate-400 font-mono">
                {restoCustomers.length - lowBalanceCustomers.length} in safe balance
              </span>
            )}
          </div>

          <div className="text-amber-400 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-[11px]">
            <span>Filter Roster</span>
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
        className={`group relative text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer shadow-lg flex flex-col justify-between ${
          totalPendingActions > 0
            ? 'bg-slate-900/90 border-blue-500/50 hover:border-blue-400'
            : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  pendingApprovals.length > 0 ? 'bg-blue-400 animate-ping' : 'bg-slate-600'
                }`}
              />
              <span>Pending Staff Actions</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-slate-950 transition-colors">
              <ClockAlert className="w-4 h-4" />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-white font-mono tabular-nums tracking-tight">
                {totalPendingActions}
              </span>
              <span className="text-xs font-semibold text-blue-400">
                actions required
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Provisional cashier registrations &amp; Mobile Money deposits awaiting Boss sign-off.
            </p>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <div className="text-slate-400 flex items-center gap-2 font-mono text-[11px]">
            <span>{pendingApprovals.length} deposits</span>
            <span>·</span>
            <span>{activeShifts.length} open shift</span>
          </div>

          <div className="text-blue-400 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-[11px]">
            <span>Review Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
};
