import React, { useState, useEffect } from 'react';
import { UserRole, Language, ScanPoint } from '../../types';
import { restoStore } from '../../store/restoStore';
import { sound } from '../../services/audioService';
import { ScannerHeroStage } from '../common/ScannerHeroStage';
import { ScanningPersonBackground } from '../common/ScanningPersonBackground';
import {
  QrCode,
  Lock,
  ArrowLeft,
  Building2,
  CheckCircle2,
  AlertTriangle,
  User,
  Radio,
  Sparkles,
  ShieldCheck,
  Zap,
  Key,
} from 'lucide-react';

interface ScannerTerminalAuthViewProps {
  onLoginSuccess: (role: UserRole, userLabel: string) => void;
  onBackToLanding?: () => void;
  initialRestoCode?: string;
  isDemoMode?: boolean;
  language: Language;
}

export const ScannerTerminalAuthView: React.FC<ScannerTerminalAuthViewProps> = ({
  onLoginSuccess,
  onBackToLanding,
  initialRestoCode,
  isDemoMode = false,
}) => {
  const state = restoStore.getState();

  const [selectedRestoCode, setSelectedRestoCode] = useState(() => {
    if (initialRestoCode && state.restaurants.some((r) => r.code === initialRestoCode)) {
      return initialRestoCode;
    }
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
      const hashParams = new URLSearchParams(hashQuery);
      const urlCode = (
        searchParams.get('resto') ||
        searchParams.get('restaurant') ||
        searchParams.get('r') ||
        hashParams.get('resto') ||
        hashParams.get('restaurant') ||
        hashParams.get('r') ||
        ''
      ).toUpperCase();
      if (urlCode && state.restaurants.some((r) => r.code === urlCode)) {
        return urlCode;
      }
    }
    return state.currentRestaurantCode || state.restaurants[0]?.code || 'RW01';
  });

  const matchedFacility = state.restaurants.find((r) => r.code === selectedRestoCode) || state.restaurants[0];
  const stations = state.scanPoints.filter((sp) => sp.restaurantCode === selectedRestoCode);
  const pairedStation = restoStore.getPairedStation(selectedRestoCode);

  const [selectedStationId, setSelectedStationId] = useState(
    pairedStation?.id || stations[0]?.id || 'sp_rw01_1'
  );

  const [operatorUsername, setOperatorUsername] = useState(isDemoMode ? 'stand1_staff' : '');
  const [operatorPin, setOperatorPin] = useState(isDemoMode ? '1234' : '');
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [showPairingForm, setShowPairingForm] = useState(!pairedStation);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const paired = restoStore.getPairedStation(selectedRestoCode);
    if (paired) {
      setSelectedStationId(paired.id);
      setShowPairingForm(false);
    }
  }, [selectedRestoCode]);

  const handlePairStation = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const cleanCode = pairingCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMessage('Please enter the 6-digit station pairing code provided by your Restaurant Boss.');
      return;
    }

    const res = restoStore.pairTerminalDevice({
      restaurantCode: selectedRestoCode,
      pairingKeyOrCode: cleanCode,
      deviceType: navigator.userAgent.includes('Mobile') ? 'phone' : 'laptop_scanner',
    });

    if (res.success && res.station) {
      sound.playSuccessBeep();
      setSelectedStationId(res.station.id);
      setShowPairingForm(false);
      setPairingCodeInput('');
    } else {
      sound.playDangerAlarm();
      setErrorMessage(res.error || 'Invalid or expired station pairing code.');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const cleanUser = operatorUsername.trim();
    const cleanPin = operatorPin.trim();

    if (!cleanUser) {
      setErrorMessage('Please enter your assigned operator username or name.');
      sound.playDangerAlarm();
      return;
    }
    if (!cleanPin) {
      setErrorMessage('Please enter your shift PIN or password.');
      sound.playDangerAlarm();
      return;
    }

    setIsVerifying(true);
    try {
      const serverAuth = await restoStore.loginToServer({
        role: 'stand_staff',
        username: cleanUser,
        pin: cleanPin,
        password: cleanPin,
        restaurantCode: selectedRestoCode,
        stationId: selectedStationId,
      });

      if (serverAuth.success) {
        restoStore.setRestaurantCode(selectedRestoCode);
        restoStore.setRole('stand_staff');
        sound.playSuccessBeep();
        onLoginSuccess(
          'stand_staff',
          serverAuth.user?.userLabel || `Staff: ${cleanUser} (${selectedStationId})`
        );
      } else {
        sound.playDangerAlarm();
        setErrorMessage(serverAuth.error || 'Operator authentication failed.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const activeStation = stations.find((s) => s.id === selectedStationId) || stations[0];

  return (
    <div className="relative min-h-[90vh] flex items-center justify-center p-3 sm:p-6 lg:p-8 overflow-hidden">
      <ScanningPersonBackground />

      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        {/* Left Side: Scanner Stage Showcase */}
        <div className="lg:col-span-5 hidden lg:flex flex-col">
          <ScannerHeroStage
            title="Buffet Stand Scanner POS"
            subtitle="Instant 0.3s QR code pass redemption, offline queue caching, and reception customer payment verification."
            facilityName={matchedFacility?.name || 'Kigali Campus Resto'}
            facilityCode={selectedRestoCode}
          />
        </div>

        {/* Right Side: Terminal POS Auth Card */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-5 shadow-2xl ring-1 ring-white/10 transition-all">
            {/* Top Navigation Row */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                  <QrCode className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Buffet Scanner &amp; POS Station
                  </h1>
                  <p className="text-xs text-slate-400">
                    High-velocity optical pass reader &middot; Offline resilient
                  </p>
                </div>
              </div>

              {onBackToLanding && (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Home</span>
                </button>
              )}
            </div>

            {/* Target Restaurant Facility */}
            <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-black flex items-center justify-center shrink-0">
                  {selectedRestoCode}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Dining Facility</div>
                  <div className="text-xs font-bold text-white truncate">{matchedFacility?.name}</div>
                </div>
              </div>

              <select
                value={selectedRestoCode}
                onChange={(e) => {
                  setSelectedRestoCode(e.target.value);
                  setErrorMessage(null);
                }}
                className="bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-2.5 py-1.5 text-white font-medium text-xs outline-hidden shrink-0 cursor-pointer"
              >
                {state.restaurants.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} · {r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Station Pairing Status Banner */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Radio className={`w-4 h-4 shrink-0 ${pairedStation ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Hardware Terminal Status</div>
                  <div className="text-xs font-bold text-white truncate">
                    {pairedStation ? `${pairedStation.name} (Device Verified)` : 'Terminal Not Formally Paired'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPairingForm(!showPairingForm)}
                className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 hover:text-white transition-all cursor-pointer shrink-0"
              >
                {showPairingForm ? 'Hide Pairing' : 'Pair Device'}
              </button>
            </div>

            {/* Error Message Banner */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs flex items-center gap-2.5 animate-shake">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Station Pairing Form Modal/Section */}
            {showPairingForm ? (
              <form onSubmit={handlePairStation} className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" />
                    <span>Pair Laptop or Scanner Terminal</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Ask your Restaurant Boss for the 6-digit station pairing code from the Boss Dashboard.
                  </p>
                </div>

                <div>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="e.g. 749-218 or CODE"
                    value={pairingCodeInput}
                    onChange={(e) => setPairingCodeInput(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-white font-mono text-center tracking-widest text-sm outline-hidden"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs transition-all cursor-pointer"
                >
                  Confirm Station Pairing &rarr;
                </button>
              </form>
            ) : (
              /* Shift Operator Login Form */
              <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs sm:text-sm">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 text-xs">
                    Target Scan Station
                  </label>
                  <select
                    value={selectedStationId}
                    onChange={(e) => setSelectedStationId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white text-xs sm:text-sm outline-hidden cursor-pointer"
                  >
                    {stations.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name} · ({sp.deviceType})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 text-xs">
                    Operator Handle / Staff Username *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="e.g. stand1_staff or Emmanuel"
                      value={operatorUsername}
                      onChange={(e) => {
                        setOperatorUsername(e.target.value);
                        setErrorMessage(null);
                      }}
                      className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-3.5 py-2.5 text-white text-xs sm:text-sm outline-hidden transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 text-xs">
                    Shift PIN or Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                    <input
                      type="password"
                      placeholder="Enter shift PIN or password"
                      value={operatorPin}
                      onChange={(e) => {
                        setOperatorPin(e.target.value);
                        setErrorMessage(null);
                      }}
                      className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-3.5 py-2.5 text-white font-mono text-xs sm:text-sm outline-hidden transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
                >
                  {isVerifying ? (
                    <span>Opening Terminal...</span>
                  ) : (
                    <span>Start POS / Scanner Shift &rarr;</span>
                  )}
                </button>
              </form>
            )}

            {/* Footer Assurance */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>0.3s Optical Verification Ready</span>
              </span>

              {isDemoMode && (
                <button
                  type="button"
                  onClick={() => {
                    setOperatorUsername('stand1_staff');
                    setOperatorPin('1234');
                  }}
                  className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Fill Demo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
