import React from 'react';
import { Customer, Language, LedgerEntry } from '../../types';
import { translations } from '../../services/i18n';
import {
  History,
  Utensils,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
} from 'lucide-react';

export type CustomerActivityFilter = 'all' | 'meals' | 'topups' | 'transfers';

interface CustomerActivityPageProps {
  customer: Customer;
  balance: number;
  entries: LedgerEntry[];
  activeFilter: CustomerActivityFilter;
  onChangeFilter: (filter: CustomerActivityFilter) => void;
  language?: Language;
}

export const CustomerActivityPage: React.FC<CustomerActivityPageProps> = ({
  customer,
  balance,
  entries,
  activeFilter,
  onChangeFilter,
  language,
}) => {
  const t = translations[language || 'en'] || translations.en;

  // Strictly enforce customer & tenant scoping on ledger records (unscoped records rejected)
  const scopedEntries = entries.filter(
    (entry) =>
      entry.customerId === customer.id &&
      entry.restaurantCode === customer.restaurantCode
  );

  const filteredEntries = scopedEntries.filter((item) => {
    if (activeFilter === 'meals') {
      return item.type === 'scan' || item.type === 'extra' || item.type === 'undo';
    }
    if (activeFilter === 'topups') {
      return item.type === 'purchase';
    }
    if (activeFilter === 'transfers') {
      return (
        item.type === 'transfer_out' ||
        item.type === 'transfer_in' ||
        item.type === 'reversal' ||
        item.type === 'adjustment'
      );
    }
    return true;
  });

  const grossMealScans = scopedEntries
    .filter((e) => (e.type === 'scan' || e.type === 'extra') && e.platesDelta < 0)
    .reduce((sum, e) => sum + Math.abs(e.platesDelta), 0);

  const mealReversals = scopedEntries
    .filter((e) => e.type === 'undo' || (e.type === 'reversal' && e.platesDelta > 0))
    .reduce((sum, e) => sum + e.platesDelta, 0);

  const netMealsRedeemed = Math.max(0, grossMealScans - mealReversals);

  const platesPurchased = scopedEntries
    .filter((e) => e.type === 'purchase')
    .reduce((sum, e) => sum + Math.max(0, e.platesDelta), 0);

  const formatEntryType = (item: LedgerEntry) => {
    switch (item.type) {
      case 'scan':
        return 'Stand Serving (Buffet)';
      case 'extra':
        return 'Additional Plate Serving';
      case 'purchase':
        return 'Meal Package Top-Up';
      case 'transfer_out':
        return 'Plates Sent to Member';
      case 'transfer_in':
        return 'Plates Received from Member';
      case 'reversal':
        return 'Transaction Reversal';
      case 'adjustment':
        return 'Audited Balance Adjustment';
      case 'undo':
        return 'Scan Reversal';
      default:
        return String(item.type).replace('_', ' ');
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Summary Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
          <div className="text-xs text-slate-400">{t.customer.currentBalance || 'Current Balance'}</div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono mt-1">
            {balance} <span className="text-xs font-normal text-slate-400">{t.customer.plates || 'plates'}</span>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
          <div className="text-xs text-slate-400">{t.customer.topupsCredited || 'Top-Ups Credited'}</div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono mt-1">
            +{platesPurchased} <span className="text-xs font-normal text-slate-400">{t.customer.plates || 'plates'}</span>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
          <div className="text-xs text-slate-400">{t.customer.mealsRedeemedNet || 'Meals Redeemed (Net)'}</div>
          <div className="text-xl sm:text-2xl font-black text-slate-200 font-mono mt-1">
            {netMealsRedeemed} <span className="text-xs font-normal text-slate-400">{t.customer.plates || 'plates'}</span>
          </div>
          {mealReversals > 0 && (
            <div className="text-[10px] text-amber-300 font-mono mt-0.5">
              ({mealReversals} reversed)
            </div>
          )}
        </div>
      </div>

      {/* Ledger Filter & List Card */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 space-y-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
              Ledger &amp; Meal Activity
            </h1>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Member #{customer.memberNo} · {customer.restaurantCode}
          </span>
        </div>

        <div className="flex gap-1.5 p-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs sm:text-sm font-bold text-slate-300 overflow-x-auto">
          {[
            { id: 'all', label: 'All Activity' },
            { id: 'meals', label: 'Meals Eaten' },
            { id: 'topups', label: 'Top-Ups' },
            { id: 'transfers', label: 'Transfers & Adjustments' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChangeFilter(f.id as CustomerActivityFilter)}
              className={`flex-1 py-2 px-3 rounded-lg transition-colors cursor-pointer text-center whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                activeFilter === f.id
                  ? 'bg-slate-800 text-white font-black shadow-xs'
                  : 'hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filteredEntries.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <History className="w-6 h-6 opacity-60" />
            </div>
            <div className="text-sm font-bold text-slate-200">No ledger entries matching this filter</div>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Every verified meal scan, package top-up, transfer, and adjustment appears in this append-only ledger.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredEntries.map((item) => {
              const isPositive = item.platesDelta > 0;
              return (
                <div key={item.id} className="py-3.5 flex items-center justify-between gap-4 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isPositive
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : item.type === 'reversal' || item.type === 'adjustment'
                          ? 'bg-sky-500/15 text-sky-400'
                          : 'bg-slate-800 text-slate-200'
                      }`}
                    >
                      {item.type === 'purchase' || item.type === 'transfer_in' ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : item.type === 'transfer_out' ? (
                        <ArrowUpRight className="w-4 h-4 text-amber-400" />
                      ) : item.type === 'reversal' || item.type === 'undo' ? (
                        <RotateCcw className="w-4 h-4" />
                      ) : (
                        <Utensils className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white leading-tight truncate">
                        {formatEntryType(item)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span>
                          {new Date(item.timestamp).toLocaleDateString([], {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          ·{' '}
                          {new Date(item.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {item.reason && (
                          <span className="text-slate-300 truncate max-w-[240px]">· {item.reason}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`font-mono font-black tabular-nums text-base shrink-0 ${
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

