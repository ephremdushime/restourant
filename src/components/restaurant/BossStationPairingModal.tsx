import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import { ScanPoint, StationUser } from '../../types';
import {
  QrCode,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  X,
  Copy,
  Check,
  Trash2,
  Radio,
  ExternalLink,
  Lock,
} from 'lucide-react';

interface BossStationPairingModalProps {
  station: ScanPoint;
  assignedUser?: StationUser;
  onClose: () => void;
  onUpdated: () => void;
}

export const BossStationPairingModal: React.FC<BossStationPairingModalProps> = ({
  station,
  assignedUser,
  onClose,
  onUpdated,
}) => {
  const currentResto = restoStore.getCurrentRestaurant();
  const pairingKey = station.pairingKey || station.pairingCode || 'PAIR-8841';
  const isCurrentlyPaired = station.isPaired !== false;

  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const pairingPayload = `restopass://pair?resto=${station.restaurantCode}&station=${station.id}&key=${pairingKey}`;

  const handleCopyKey = () => {
    navigator.clipboard.writeText(pairingKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyUrl = () => {
    const fullUrl = `${window.location.origin}/#/scanner?pair_key=${pairingKey}&resto=${station.restaurantCode}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleRevokePairing = () => {
    restoStore.revokeTerminalPairing(station.id, 'Restaurant Boss');
    setFeedbackMsg('Terminal pairing revoked. The cashier device is now locked out until re-paired.');
    onUpdated();
  };

  const handleReAuthorizeStation = () => {
    restoStore.pairTerminalDevice({
      restaurantCode: station.restaurantCode,
      pairingKeyOrCode: pairingKey,
      deviceType: station.deviceType || 'phone',
    });
    setFeedbackMsg('Station re-authorized successfully.');
    onUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Station Pairing Credentials</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isCurrentlyPaired
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border-amber-800'
                  }`}
                >
                  {isCurrentlyPaired ? 'Active Paired' : 'Pending Pairing'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {station.name} · {station.branchName || 'Main Campus'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5">
          {feedbackMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
              <span>{feedbackMsg}</span>
              <button
                type="button"
                onClick={() => setFeedbackMsg(null)}
                className="text-emerald-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Assigned Staff Banner */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Assigned Cashier Seat (1:1 Quota)
              </span>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>{assignedUser?.name || station.assignedStaffUserName || 'Stand Cashier'}</span>
                {assignedUser && (
                  <span className="text-xs text-slate-400 font-mono">(@{assignedUser.username})</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Device Type
              </span>
              <span className="text-xs font-mono text-emerald-400 capitalize">
                {station.deviceType ? station.deviceType.replace('_', ' ') : 'Phone / Tablet'}
              </span>
            </div>
          </div>

          {/* Pairing Section: Dual Mode Display */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Visual QR Code Display */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center space-y-2.5">
              <div className="p-3 rounded-xl bg-white border border-slate-300 shadow-md">
                {/* SVG QR Code Replica */}
                <svg
                  className="w-36 h-36"
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="100" height="100" fill="white" />
                  {/* Top-Left Position Detection Marker */}
                  <rect x="10" y="10" width="24" height="24" fill="black" />
                  <rect x="14" y="14" width="16" height="16" fill="white" />
                  <rect x="18" y="18" width="8" height="8" fill="black" />
                  {/* Top-Right Position Detection Marker */}
                  <rect x="66" y="10" width="24" height="24" fill="black" />
                  <rect x="70" y="14" width="16" height="16" fill="white" />
                  <rect x="74" y="18" width="8" height="8" fill="black" />
                  {/* Bottom-Left Position Detection Marker */}
                  <rect x="10" y="66" width="24" height="24" fill="black" />
                  <rect x="14" y="70" width="16" height="16" fill="white" />
                  <rect x="18" y="74" width="8" height="8" fill="black" />
                  {/* Dense data cells simulating crypto pairing payload */}
                  <rect x="40" y="12" width="6" height="6" fill="black" />
                  <rect x="52" y="14" width="6" height="6" fill="black" />
                  <rect x="42" y="24" width="6" height="6" fill="black" />
                  <rect x="50" y="22" width="6" height="6" fill="black" />
                  <rect x="12" y="44" width="6" height="6" fill="black" />
                  <rect x="22" y="48" width="6" height="6" fill="black" />
                  <rect x="36" y="38" width="6" height="6" fill="black" />
                  <rect x="48" y="42" width="6" height="6" fill="black" />
                  <rect x="58" y="38" width="6" height="6" fill="black" />
                  <rect x="72" y="44" width="6" height="6" fill="black" />
                  <rect x="82" y="48" width="6" height="6" fill="black" />
                  <rect x="38" y="56" width="6" height="6" fill="black" />
                  <rect x="48" y="54" width="6" height="6" fill="black" />
                  <rect x="60" y="58" width="6" height="6" fill="black" />
                  <rect x="42" y="72" width="6" height="6" fill="black" />
                  <rect x="52" y="74" width="6" height="6" fill="black" />
                  <rect x="68" y="70" width="6" height="6" fill="black" />
                  <rect x="78" y="74" width="6" height="6" fill="black" />
                  <rect x="70" y="84" width="6" height="6" fill="black" />
                  <rect x="82" y="82" width="6" height="6" fill="black" />
                </svg>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white flex items-center justify-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Scan via Phone / Tablet</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  Cashier opens <code>#/scanner</code> and scans this
                </span>
              </div>
            </div>

            {/* 6-Character Key Display for Laptop USB Scanners */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Laptop className="w-3.5 h-3.5 text-blue-400" />
                  <span>Laptop USB/BT Key</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  For cashier laptops with handheld USB barcode guns that lack cameras:
                </p>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">
                    Station Pairing Key
                  </span>
                  <span className="text-xl font-black font-mono tracking-widest text-emerald-400 selection:bg-emerald-800">
                    {pairingKey}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                >
                  {copiedKey ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied Pairing Key!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy 6-Char Key</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-800"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Direct URL Copied!</span>
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy Direct Pairing URL</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Device Security & Remote Revocation Controls */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Remote Terminal Control:</span>
              <span className="font-mono text-[11px] text-slate-500">
                Fingerprint: {station.pairedDeviceFingerprint || 'Not yet fingerprinted'}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {isCurrentlyPaired ? (
                <button
                  type="button"
                  onClick={handleRevokePairing}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Revoke Terminal Pairing (Remote Lockout)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReAuthorizeStation}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Authorize &amp; Link Device</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 text-center text-[11px] text-slate-500 font-mono">
          Only paired devices can access local cafeteria IP deduction routines.
        </div>
      </div>
    </div>
  );
};
