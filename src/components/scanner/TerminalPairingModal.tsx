import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import { ScanPoint } from '../../types';
import {
  QrCode,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  X,
  Scan,
  RefreshCw,
  Camera,
} from 'lucide-react';

interface TerminalPairingModalProps {
  restaurantCode: string;
  onClose: () => void;
  onSuccess: (station: ScanPoint) => void;
}

export const TerminalPairingModal: React.FC<TerminalPairingModalProps> = ({
  restaurantCode,
  onClose,
  onSuccess,
}) => {
  const [pairingMode, setPairingMode] = useState<'qr_scan' | 'manual_key'>('qr_scan');
  const [inputKey, setInputKey] = useState('');
  const [isSimulatingCamera, setIsSimulatingCamera] = useState(false);
  const [cameraScanProgress, setCameraScanProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [pairedStation, setPairedStation] = useState<ScanPoint | null>(null);

  const currentResto = restoStore.getCurrentRestaurant();
  const availableStations = restoStore
    .getState()
    .scanPoints.filter((sp) => sp.restaurantCode === restaurantCode);

  // Submit 6-character key or scanned payload
  const handlePairSubmit = (keyToSubmit: string, mode: 'phone' | 'laptop_scanner' = 'phone') => {
    setErrorMessage(null);
    if (!keyToSubmit.trim()) {
      setErrorMessage('Please enter a valid 6-character Station Pairing Key');
      return;
    }

    const res = restoStore.pairTerminalDevice({
      restaurantCode,
      pairingKeyOrCode: keyToSubmit.trim().toUpperCase(),
      deviceType: mode,
    });

    if (res.success && res.station) {
      setIsSuccess(true);
      setPairedStation(res.station);
      setTimeout(() => {
        onSuccess(res.station!);
      }, 1400);
    } else {
      setErrorMessage(res.error || 'Failed to authenticate and pair this terminal.');
    }
  };

  // Simulate mobile camera scanning the Boss Screen QR
  const handleStartCameraScan = (stationToPick?: ScanPoint) => {
    setIsSimulatingCamera(true);
    setCameraScanProgress(10);
    setErrorMessage(null);

    const targetStation = stationToPick || availableStations[0];
    const key = targetStation?.pairingKey || targetStation?.pairingCode;

    if (!key) {
      setIsSimulatingCamera(false);
      setErrorMessage('No active pairing key found for this station. Please configure one in Boss Settings.');
      return;
    }

    let progress = 10;
    const interval = setInterval(() => {
      progress += 25;
      setCameraScanProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setIsSimulatingCamera(false);
        handlePairSubmit(key, 'phone');
      }
    }, 280);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Authorize &amp; Pair Terminal</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Wi-Fi Shield
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Link this device to {currentResto?.name || 'Restaurant Cafeteria'}
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

        {/* Success View */}
        {isSuccess && pairedStation ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-bold text-white">Terminal Successfully Authorized!</h4>
              <p className="text-sm text-slate-300">
                Paired with <strong className="text-emerald-400">{pairedStation.name}</strong>
              </p>
              <p className="text-xs text-slate-400 font-mono">
                Cryptographic hardware certificate saved to browser local store.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setPairingMode('qr_scan');
                  setErrorMessage(null);
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  pairingMode === 'qr_scan'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Phone / Tablet (QR Scan)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPairingMode('manual_key');
                  setErrorMessage(null);
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  pairingMode === 'manual_key'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span>Laptop (Pairing Key)</span>
              </button>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* TAB 1: Phone / Tablet Camera Scanning */}
            {pairingMode === 'qr_scan' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-emerald-400" />
                    <span>How mobile cashier pairing works:</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    1. On the <strong>Boss Admin Computer</strong>, open <em>Staff &amp; Scanning Points</em>.<br />
                    2. Click <strong>Pair Terminal</strong> on this cashier&apos;s station to show the Pairing QR.<br />
                    3. Point this phone&apos;s camera at the Boss screen to pair.
                  </p>
                </div>

                {/* Viewfinder simulator */}
                <div className="relative rounded-2xl bg-black border-2 border-slate-800 overflow-hidden aspect-4/3 flex flex-col items-center justify-center">
                  {isSimulatingCamera ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/40">
                      <div className="w-48 h-48 border-2 border-emerald-400 rounded-2xl relative flex items-center justify-center">
                        <div className="w-full h-1 bg-emerald-400 animate-pulse absolute top-1/2 -translate-y-1/2 shadow-lg shadow-emerald-500" />
                        <span className="text-xs font-mono font-bold text-emerald-300 bg-slate-950/80 px-2 py-1 rounded">
                          Scanning Boss QR... {cameraScanProgress}%
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-6 space-y-3">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400">
                        <Scan className="w-8 h-8 text-emerald-400" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-white">Camera Viewfinder Ready</div>
                        <div className="text-xs text-slate-400">
                          Ready to scan Boss Screen Station QR Code
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStartCameraScan()}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 mx-auto cursor-pointer shadow-lg transition-colors"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Simulate Camera Scan on Boss QR</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Station Select for Quick Testing */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-400">
                    Quick Demo Stations in {restaurantCode}:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {availableStations.slice(0, 4).map((stn) => (
                      <button
                        key={stn.id}
                        type="button"
                        onClick={() => handleStartCameraScan(stn)}
                        className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-500/50 text-left transition-colors cursor-pointer group"
                      >
                        <div className="text-xs font-bold text-slate-200 group-hover:text-emerald-300 truncate">
                          {stn.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          Key: {stn.pairingKey || stn.pairingCode}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Laptop with Connected USB / BT Barcode Scanner */}
            {pairingMode === 'manual_key' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-blue-400" />
                    <span>Laptop with USB/Bluetooth Handheld Scanner:</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Laptops typically lack a rear/front camera for reading on-screen QR codes.
                    Ask the Restaurant Boss for the <strong>6-character Station Pairing Key</strong> (e.g. <code>PAIR-9932</code>) or scan the printed barcode sheet with your USB scanner into the box below.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handlePairSubmit(inputKey, 'laptop_scanner');
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Station Pairing Key (or Barcode)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value.toUpperCase())}
                        placeholder="e.g. PAIR-9932"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 font-mono text-sm tracking-wider text-emerald-400 focus:border-emerald-500 outline-hidden font-bold"
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify Key &amp; Authorize Laptop Terminal</span>
                  </button>
                </form>

                {/* Quick Station Select Buttons */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-400">
                    Click any station below to auto-fill its pairing key:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {availableStations.map((stn) => (
                      <button
                        key={stn.id}
                        type="button"
                        onClick={() => {
                          const k = stn.pairingKey || stn.pairingCode || '';
                          setInputKey(k);
                        }}
                        className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 text-left cursor-pointer transition-colors"
                      >
                        <div className="text-xs font-bold text-slate-300 truncate">{stn.name}</div>
                        <div className="text-[10px] font-mono text-emerald-400 font-bold">
                          {stn.pairingKey || stn.pairingCode}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950 text-center text-[11px] text-slate-500 font-mono">
          Terminal pairing establishes a signed device certificate stored in local isolation.
        </div>
      </div>
    </div>
  );
};
