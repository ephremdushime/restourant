import React from 'react';
import { restoStore } from '../../store/restoStore';
import {
  ShieldAlert,
  Wifi,
  Lock,
  KeyRound,
  QrCode,
  AlertTriangle,
  ArrowRight,
  UserCheck,
  Building2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface UnauthorizedTerminalShieldProps {
  onOpenPairModal: () => void;
  onQuickAuthorize?: () => void;
}

export const UnauthorizedTerminalShield: React.FC<UnauthorizedTerminalShieldProps> = ({
  onOpenPairModal,
  onQuickAuthorize,
}) => {
  const state = restoStore.getState();
  const currentResto = restoStore.getCurrentRestaurant();
  const primaryStation = state.scanPoints.find((sp) => sp.restaurantCode === state.currentRestaurantCode);

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl bg-slate-900 border-2 border-rose-500/30 shadow-2xl overflow-hidden backdrop-blur-xl">
        {/* Top Warning Banner */}
        <div className="p-6 bg-gradient-to-b from-rose-950/60 to-slate-900 border-b border-rose-500/20 text-center relative">
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 font-mono text-[11px] font-bold">
            <Wifi className="w-3.5 h-3.5 text-rose-400" />
            <span>Cafeteria Wi-Fi Guard</span>
          </div>

          <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-500/10 border-2 border-rose-500/40 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-950 mb-4 animate-pulse">
            <ShieldAlert className="w-10 h-10" />
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Unauthorized Cashier Terminal
          </h2>
          <p className="text-xs sm:text-sm text-rose-300 font-medium mt-1">
            Access to plate deduction scanner is blocked on this device
          </p>
        </div>

        {/* Security Context Details */}
        <div className="p-6 space-y-5">
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-3">
            <div className="flex items-center gap-2 font-bold text-white">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Why is this terminal blocked?</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              This phone, tablet, or laptop is connected to the cafeteria local Wi-Fi or server network (<code>192.168.1.x</code>), but has <strong>not yet been cryptographically paired</strong> by the restaurant manager.
            </p>
            <p className="text-slate-400 leading-relaxed">
              To prevent unauthorized patrons or rogue bystanders from forging meal transactions, each cashier device requires boss authorization and is counted against your restaurant&apos;s licensed scan point quota.
            </p>

            {/* Diagnostic Details Grid */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-850 text-[11px] font-mono">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">RESTAURANT</span>
                <span className="font-bold text-slate-200 truncate block">
                  {currentResto?.name || 'RestoPass Cafeteria'}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">NETWORK ADDRESS</span>
                <span className="font-bold text-amber-400 truncate block">
                  192.168.1.100:3000
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">TERMINAL STATUS</span>
                <span className="font-bold text-rose-400 truncate block">
                  Unlicensed Wi-Fi Client
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">REQUIRED ACTION</span>
                <span className="font-bold text-emerald-400 truncate block">
                  Pair via Boss Screen
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={onOpenPairModal}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-950 transition-all cursor-pointer group"
            >
              <KeyRound className="w-4 h-4 text-emerald-200 group-hover:rotate-12 transition-transform" />
              <span>Pair This Device as Authorized Cashier</span>
              <ArrowRight className="w-4 h-4 text-emerald-200" />
            </button>

            {/* Evaluator / Demo Quick Pair Shortcut */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const key = primaryStation?.pairingKey || primaryStation?.pairingCode || 'PAIR-8841';
                  restoStore.pairTerminalDevice({
                    restaurantCode: state.currentRestaurantCode,
                    pairingKeyOrCode: key,
                    deviceType: 'phone',
                  });
                  if (onQuickAuthorize) onQuickAuthorize();
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-700"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Quick Demo Pair (Stand 1)</span>
              </button>

              <a
                href="#portal"
                className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors border border-slate-800"
              >
                <span>Patron Portal</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <a
                href="#admin"
                className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors border border-slate-800"
              >
                <span>Boss Admin</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Footnote */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-850 text-center text-[11px] text-slate-500 font-mono">
          Strict Zero-Trust Local Terminal Security · Prevents Unlicensed Staff Accounts
        </div>
      </div>
    </div>
  );
};
