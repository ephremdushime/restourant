import React, { useState, useEffect } from 'react';
import { ShiftRecord, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import { sound } from '../../services/audioService';
import {
  Clock,
  Coins,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  UserCheck,
  ShieldCheck,
  Building2,
  Printer,
  History,
  Lock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

interface ShiftHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  stationId?: string;
}

export const ShiftHandoverModal: React.FC<ShiftHandoverModalProps> = ({
  isOpen,
  onClose,
  language,
  stationId,
}) => {
  const t = translations[language] || translations.en;
  const state = restoStore.getState();

  const currentResto = restoStore.getCurrentRestaurant();
  const currentStation =
    state.scanPoints.find((sp) => sp.id === (stationId || state.currentStationId)) ||
    state.scanPoints[0];

  const activeShift = restoStore.getActiveShift(currentStation?.id);
  const shiftHistory = restoStore.getShiftHistory(state.currentRestaurantCode);

  // Closing Shift Form State
  const [countedCashInput, setCountedCashInput] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [signOffPin, setSignOffPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New Shift Form State (if no active shift)
  const [newOpeningFloat, setNewOpeningFloat] = useState<number>(20000);
  const [newOperatorName, setNewOperatorName] = useState<string>('Eric Nshimiyimana');

  // Print slip state
  const [lastClosedShift, setLastClosedShift] = useState<ShiftRecord | null>(null);

  useEffect(() => {
    if (activeShift) {
      const expected = activeShift.openingCashRwf + activeShift.cashCollectedRwf;
      setCountedCashInput(expected.toString());
      setClosingNotes('');
      setSignOffPin('');
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [activeShift, isOpen]);

  if (!isOpen) return null;

  const countedCash = parseInt(countedCashInput, 10) || 0;
  const expectedCash = activeShift
    ? activeShift.openingCashRwf + activeShift.cashCollectedRwf
    : 0;
  const variance = countedCash - expectedCash;

  const handleCloseShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    setErrorMessage(null);

    if (signOffPin.trim() !== '1234' && signOffPin.trim() !== 'admin') {
      setErrorMessage(t.shifts?.invalidPin || 'Invalid staff sign-off PIN. (Default: 1234)');
      sound.playDangerAlarm();
      return;
    }

    const res = restoStore.closeShift({
      shiftId: activeShift.id,
      closingCashRwf: countedCash,
      closingNotes: closingNotes.trim() || undefined,
      signedOffByPin: signOffPin,
    });

    if (res.success && res.shift) {
      sound.playSuccessBeep();
      setLastClosedShift(res.shift);
      setSuccessMessage(
        t.shifts?.shiftClosedSuccess ||
          `Shift #${res.shift.id.slice(-6)} successfully reconciled and closed.`
      );
    } else {
      setErrorMessage(res.error || 'Failed to close shift');
      sound.playDangerAlarm();
    }
  };

  const handleOpenNewShift = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const branches = restoStore.getRestaurantBranches(state.currentRestaurantCode);
    const branch = branches[0] || {
      id: 'br_rw01_main',
      name: 'Main Campus Dining Hall',
    };

    const shift = restoStore.openShift({
      restaurantCode: state.currentRestaurantCode,
      branchId: branch.id,
      branchName: branch.name,
      stationId: currentStation?.id || 'sp_1',
      stationName: currentStation?.name || 'Stand 1 - Main Buffet',
      operatorId: 'usr_stand_operator',
      operatorName: newOperatorName.trim() || 'Stand Operator',
      openingCashRwf: newOpeningFloat,
    });

    sound.playSuccessBeep();
    setSuccessMessage(`Opened new shift for ${shift.operatorName} with float ${newOpeningFloat.toLocaleString()} RWF.`);
  };

  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>{t.shifts?.title || 'Cashier Shift Handover & Daily Reconciliation'}</span>
                {activeShift ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                    {t.shifts?.activeShiftBadge || 'Shift Active'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400">
                    {t.shifts?.closedShiftBadge || 'Shift Closed'}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {currentStation?.name} · {currentResto?.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
              {lastClosedShift && (
                <button
                  type="button"
                  onClick={handlePrintSlip}
                  className="px-2.5 py-1 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{t.shifts?.printHandoverSlip || 'Print Slip'}</span>
                </button>
              )}
            </div>
          )}

          {activeShift ? (
            /* ACTIVE SHIFT HANDOVER FORM */
            <div className="space-y-6">
              {/* Shift Key Metrics Dashboard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    {t.shifts?.openingFloat || 'Opening Float'}
                  </span>
                  <div className="text-base font-bold font-mono text-white">
                    {activeShift.openingCashRwf.toLocaleString()} <span className="text-[10px] text-slate-400">RWF</span>
                  </div>
                  <div className="text-[10px] text-slate-500">Drawer seed cash</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-emerald-400 uppercase font-semibold">
                    {t.shifts?.cashSalesIntake || 'Cash Top-Ups'}
                  </span>
                  <div className="text-base font-bold font-mono text-emerald-400">
                    +{activeShift.cashCollectedRwf.toLocaleString()} <span className="text-[10px] text-slate-400">RWF</span>
                  </div>
                  <div className="text-[10px] text-slate-500">{activeShift.topUpsProcessedCount} recharges</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-blue-400 uppercase font-semibold">
                    {t.shifts?.platesRedeemed || 'Plates Served'}
                  </span>
                  <div className="text-base font-bold font-mono text-white">
                    {activeShift.platesServedCount} <span className="text-[10px] text-slate-400">meals</span>
                  </div>
                  <div className="text-[10px] text-slate-500">Buffet scans validated</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-amber-800/60 space-y-1">
                  <span className="text-[10px] text-amber-400 uppercase font-semibold">
                    {t.shifts?.expectedTotalCash || 'Expected Total'}
                  </span>
                  <div className="text-base font-bold font-mono text-amber-300">
                    {expectedCash.toLocaleString()} <span className="text-[10px] text-slate-400">RWF</span>
                  </div>
                  <div className="text-[10px] text-slate-400">Float + Cash sales</div>
                </div>
              </div>

              {/* Handover & Cash Reconciliation Form */}
              <form onSubmit={handleCloseShiftSubmit} className="space-y-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-emerald-400" />
                      <span>{t.shifts?.cashDrawerAuditTitle || 'Physical Cash Count & Variance Audit'}</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Operator: <strong className="text-white">{activeShift.operatorName}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-300 block">
                        {t.shifts?.physicalCashCounted || 'Physical Cash Counted in Drawer (RWF)'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={countedCashInput}
                        onChange={(e) => setCountedCashInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white font-mono text-base font-bold outline-hidden"
                      />
                    </div>

                    {/* Real-time Variance Meter */}
                    <div className="space-y-1">
                      <span className="font-semibold text-slate-300 block">
                        {t.shifts?.varianceStatus || 'Cash Variance (Counted vs Expected)'}
                      </span>
                      <div
                        className={`p-2.5 rounded-xl border flex items-center justify-between font-mono font-bold text-sm ${
                          variance === 0
                            ? 'bg-emerald-950/50 border-emerald-700 text-emerald-400'
                            : variance > 0
                            ? 'bg-amber-950/50 border-amber-700 text-amber-400'
                            : 'bg-rose-950/50 border-rose-700 text-rose-400'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {variance === 0 ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : variance > 0 ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : (
                            <TrendingDown className="w-4 h-4" />
                          )}
                          <span>
                            {variance === 0
                              ? t.shifts?.varianceBalanced || 'Balanced (0 RWF)'
                              : variance > 0
                              ? `+${variance.toLocaleString()} RWF (Overage)`
                              : `${variance.toLocaleString()} RWF (Shortage)`}
                          </span>
                        </span>
                        <span className="text-[10px] font-sans font-normal opacity-80">
                          Expected: {expectedCash.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-300 block">
                      {t.shifts?.handoverNotes || 'Handover Notes / Evening Cashier Assignment'}
                    </label>
                    <input
                      type="text"
                      value={closingNotes}
                      onChange={(e) => setClosingNotes(e.target.value)}
                      placeholder={t.shifts?.handoverNotesPlaceholder || 'e.g. Handed 54,000 RWF to Evening Shift Cashier Patrick Bizimana'}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-white outline-hidden"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-300">
                        {t.shifts?.signOffPin || 'Staff Sign-Off 4-Digit Security PIN'}
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono">Default: 1234</span>
                    </div>
                    <input
                      type="password"
                      maxLength={6}
                      required
                      value={signOffPin}
                      onChange={(e) => setSignOffPin(e.target.value)}
                      placeholder="••••"
                      className="w-full sm:w-48 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-white font-mono text-center tracking-widest text-base font-bold outline-hidden"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors cursor-pointer"
                  >
                    {t.scanner?.cancelServing || 'Cancel'}
                  </button>

                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t.shifts?.closeShiftButton || 'Reconcile & Close Cashier Shift'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* NO ACTIVE SHIFT: START NEW SHIFT FORM */
            <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {t.shifts?.noActiveShiftTitle || 'No Active Cashier Shift on this Station'}
                  </h3>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {t.shifts?.noActiveShiftDesc || 'Record the starting cash float to open a new morning or evening dining shift.'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleOpenNewShift} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-300 block">
                      {t.shifts?.operatorName || 'Staff Operator Name'}
                    </label>
                    <input
                      type="text"
                      required
                      value={newOperatorName}
                      onChange={(e) => setNewOperatorName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white outline-hidden"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-300 block">
                      {t.shifts?.openingFloat || 'Opening Cash Float (RWF)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      required
                      value={newOpeningFloat}
                      onChange={(e) => setNewOpeningFloat(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white font-mono font-bold outline-hidden"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Coins className="w-4 h-4" />
                  <span>{t.shifts?.startNewShiftButton || 'Open New Cashier Shift'}</span>
                </button>
              </form>
            </div>
          )}

          {/* Shift History & Audit Table */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-slate-400" />
                <span>{t.shifts?.shiftHistoryTitle || 'Recent Shift Reconciliations & Handover Logs'}</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {shiftHistory.length} {t.shifts?.recordsCount || 'records'}
              </span>
            </div>

            <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Shift ID</th>
                    <th className="py-2.5 px-3">Operator</th>
                    <th className="py-2.5 px-3">Plates</th>
                    <th className="py-2.5 px-3">Cash Expected</th>
                    <th className="py-2.5 px-3">Counted</th>
                    <th className="py-2.5 px-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
                  {shiftHistory.slice(0, 5).map((s) => (
                    <tr key={s.id} className="hover:bg-slate-900/40">
                      <td className="py-2.5 px-3 text-slate-400">
                        #{s.id.slice(-6)}
                        {s.status === 'open' && (
                          <span className="ml-1 text-[9px] text-emerald-400 font-sans font-bold uppercase">
                            (Active)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-sans font-medium text-white truncate max-w-[120px]">
                        {s.operatorName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{s.platesServedCount}</td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {((s.expectedCashRwf ?? (s.openingCashRwf + s.cashCollectedRwf))).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-white font-bold">
                        {(s.closingCashRwf ?? (s.openingCashRwf + s.cashCollectedRwf)).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            (s.cashVarianceRwf || 0) === 0
                              ? 'text-emerald-400 bg-emerald-950/60'
                              : (s.cashVarianceRwf || 0) > 0
                              ? 'text-amber-400 bg-amber-950/60'
                              : 'text-rose-400 bg-rose-950/60'
                          }`}
                        >
                          {(s.cashVarianceRwf || 0) >= 0 ? `+${(s.cashVarianceRwf || 0)}` : s.cashVarianceRwf}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
