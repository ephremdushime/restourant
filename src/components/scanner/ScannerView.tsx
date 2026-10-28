import React, { useState, useEffect, useRef } from 'react';
import { ScanEvent, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import { sound } from '../../services/audioService';
import { BatteryIndicator } from '../common/BatteryIndicator';
import { ScannerProvisionalModal } from './ScannerProvisionalModal';
import { ShiftHandoverModal } from './ShiftHandoverModal';
import {
  Camera,
  Barcode,
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  UserPlus,
  History,
  ShieldCheck,
  Coins,
  KeyRound,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface ScannerViewProps {
  language: Language;
  operatorName?: string;
  isDemoMode?: boolean;
}

export const ScannerView: React.FC<ScannerViewProps> = ({
  language,
  operatorName = 'Station Operator',
  isDemoMode = false,
}) => {
  const t = translations[language];
  const state = restoStore.getState();
  const currentRestaurant = restoStore.getCurrentRestaurant();
  const currentStation =
    state.scanPoints.find(
      (sp) => sp.id === state.currentStationId && sp.restaurantCode === state.currentRestaurantCode
    ) || state.scanPoints.find((sp) => sp.restaurantCode === state.currentRestaurantCode);

  const [inputPayload, setInputPayload] = useState('');
  const [activeScan, setActiveScan] = useState<{
    outcome?: 'ACCEPTED' | 'REJECTED';
    message?: string;
    rejectionReason?: string;
    event: ScanEvent;
    balanceAfter: number;
    error?: string;
    latencyMs?: number;
  } | null>(null);

  // Scanner Sound Alert state (volume, mute, and browser autoplay unlock indicator)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => sound.isSoundEnabled());
  const [soundVolume, setSoundVolume] = useState<number>(() => sound.getVolume());
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(() => sound.isAudioUnlocked());

  useEffect(() => {
    sound.preloadScannerSounds();
    const handleUnlockGesture = () => {
      sound.unlockAudio().then((ok) => {
        if (ok) setAudioUnlocked((prev) => (prev ? prev : true));
      });
    };
    window.addEventListener('pointerdown', handleUnlockGesture, { once: true });
    window.addEventListener('keydown', handleUnlockGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlockGesture);
      window.removeEventListener('keydown', handleUnlockGesture);
    };
  }, []);

  // Auto-advance configuration (0 = manual, 2 = 2s, 3 = 3s)
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState<number>(3);
  const [autoAdvanceRemaining, setAutoAdvanceRemaining] = useState<number>(3);

  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('Authorized by Head Cafeteria Supervisor');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [, setCameraError] = useState<string | null>(null);
  const [isProvisionalModalOpen, setIsProvisionalModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isPinDeskModalOpen, setIsPinDeskModalOpen] = useState(false);
  const [pinDeskCustomerId, setPinDeskCustomerId] = useState<string>('');
  const [pinDeskMode, setPinDeskMode] = useState<'activation' | 'recovery'>('activation');
  const [pinDeskIdMethod, setPinDeskIdMethod] = useState<
    'student_id_check' | 'national_id_check' | 'photo_match' | 'manager_override'
  >('student_id_check');
  const [pinDeskReason, setPinDeskReason] = useState('Verified patron ID at reception desk');
  const [pinDeskResult, setPinDeskResult] = useState<{
    type: 'activation' | 'recovery';
    code?: string;
    requestId?: string;
    expiresAt?: string;
    customerName: string;
    memberNo: string;
    error?: string;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const keyboardInputRef = useRef<HTMLInputElement | null>(null);

  const isAnyModalOpen =
    overrideModalOpen || isProvisionalModalOpen || isShiftModalOpen || isPinDeskModalOpen;

  // Auto-advance timer countdown
  useEffect(() => {
    if (!activeScan || autoAdvanceSeconds === 0) return;
    if (activeScan.event.status !== 'approved' && activeScan.event.status !== 'warning_confirmed') return;

    setAutoAdvanceRemaining(autoAdvanceSeconds);
    const interval = setInterval(() => {
      setAutoAdvanceRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleCloseServing();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeScan, autoAdvanceSeconds]);

  // Focus scanner input ONLY when modals close and no other input/select/textarea has focus.
  // Never run a background interval that steals focus from registration or modal inputs.
  useEffect(() => {
    if (isAnyModalOpen) return;
    const activeEl = document.activeElement;
    const isInteractiveElementFocused =
      activeEl instanceof HTMLInputElement ||
      activeEl instanceof HTMLTextAreaElement ||
      activeEl instanceof HTMLSelectElement ||
      Boolean(activeEl?.closest('[role="dialog"]'));

    if (!isInteractiveElementFocused && keyboardInputRef.current) {
      keyboardInputRef.current.focus();
    }
  }, [isAnyModalOpen]);

  // POS Physical Keyboard Shortcuts for Stand Operator
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnyModalOpen) return;
      // Don't intercept if typing in an input, textarea, or select
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (!activeScan) return;

      if (e.key === '2' && activeScan.event.platesDeducted < 2 && activeScan.balanceAfter >= 1) {
        e.preventDefault();
        handleAddSecondPlate();
      } else if ((e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'U') && activeScan.event.status !== 'undone') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        handleCloseServing();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeScan, isAnyModalOpen]);

  // Camera video stream & GPU-accelerated Native BarcodeDetector handler
  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number | null = null;
    let isDetecting = false;

    if (isCameraActive) {
      navigator.mediaDevices
        ?.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        .then((s) => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play().catch(() => {});

            if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
              try {
                const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
                let lastScannedToken = '';
                let lastScannedTime = 0;

                const scanFrame = async () => {
                  if (!videoRef.current || !isCameraActive) return;
                  if (!isDetecting && videoRef.current.readyState >= 2) {
                    isDetecting = true;
                    try {
                      const barcodes = await detector.detect(videoRef.current);
                      if (barcodes && barcodes.length > 0) {
                        const raw = barcodes[0].rawValue;
                        const now = Date.now();
                        if (raw && (raw !== lastScannedToken || now - lastScannedTime > 2500)) {
                          lastScannedToken = raw;
                          lastScannedTime = now;
                          handleExecuteScan(raw);
                        }
                      }
                    } catch {
                      // Non-fatal frame capture error
                    } finally {
                      isDetecting = false;
                    }
                  }
                  animationFrameId = requestAnimationFrame(scanFrame);
                };

                animationFrameId = requestAnimationFrame(scanFrame);
              } catch (e) {
                console.warn('BarcodeDetector initialization skipped:', e);
              }
            }
          }
        })
        .catch((err) => {
          console.warn('Camera access unavailable:', err);
          setCameraError('Camera stream not accessible on this device. Use hardware scanner or simulation.');
          setIsCameraActive(false);
        });
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isCameraActive]);

  const handleExecuteScan = (payload: string) => {
    if (!payload.trim()) return;
    sound.unlockAudio().then((ok) => {
      if (ok) setAudioUnlocked(true);
    });
    const result = restoStore.processScan(payload);
    setActiveScan({
      outcome: result.outcome,
      message: result.message,
      rejectionReason: result.rejectionReason,
      event: result.scanEvent,
      balanceAfter: result.balanceAfter,
      error: result.error,
      latencyMs: result.latencyMs,
    });
    setInputPayload('');
  };

  // Instant trigger when a full QR token pattern is detected in keystrokes
  const handleInputChange = (val: string) => {
    setInputPayload(val);
    const trimmed = val.trim();
    if (/^(v1|c1)\.[A-Za-z0-9_-]+\.[0-9]+\.[0-9A-Za-z_-]+\.[0-9A-Fa-f]{16}$/.test(trimmed)) {
      handleExecuteScan(trimmed);
    }
  };

  const handleAddSecondPlate = () => {
    if (!activeScan) return;
    const ok = restoStore.addSecondPlate(activeScan.event.id);
    if (ok) {
      const updatedBalance = restoStore.getCustomerBalance(activeScan.event.customerId);
      setActiveScan({
        ...activeScan,
        event: {
          ...activeScan.event,
          platesDeducted: 2,
          isSecondPlateAdded: true,
        },
        balanceAfter: updatedBalance,
      });
    }
  };

  const handleUndo = () => {
    if (!activeScan) return;
    const ok = restoStore.undoScan(activeScan.event.id);
    if (ok) {
      const updatedBalance = restoStore.getCustomerBalance(activeScan.event.customerId);
      setActiveScan({
        ...activeScan,
        event: {
          ...activeScan.event,
          status: 'undone',
          platesDeducted: 0,
        },
        balanceAfter: updatedBalance,
      });
    }
  };

  const handlePhotoCheckDecision = (result: 'matched' | 'rejected') => {
    if (!activeScan) return;
    restoStore.recordPhotoCheck(activeScan.event.id, result);
    if (result === 'rejected') {
      setActiveScan({
        ...activeScan,
        event: {
          ...activeScan.event,
          photoCheckResult: 'rejected',
          status: 'rejected_photo',
          platesDeducted: 0,
        },
        balanceAfter: restoStore.getCustomerBalance(activeScan.event.customerId),
      });
    } else {
      setActiveScan({
        ...activeScan,
        event: {
          ...activeScan.event,
          photoCheckResult: 'matched',
        },
      });
    }
  };

  const handleConfirmOverride = () => {
    if (!activeScan) return;
    const ok = restoStore.approveScanOverride(
      activeScan.event.id,
      overrideReason,
      'admin_on_duty'
    );
    if (ok) {
      setOverrideModalOpen(false);
      const newBal = restoStore.getCustomerBalance(activeScan.event.customerId);
      setActiveScan({
        ...activeScan,
        event: {
          ...activeScan.event,
          status: 'approved',
          platesDeducted: 1,
          overrideReason,
        },
        balanceAfter: newBal,
        error: undefined,
      });
    }
  };

  const handleCloseServing = () => {
    setActiveScan(null);
  };

  // Quick simulation payloads generator
  const getDemoTokens = () => {
    const restoCusts = state.customers.filter((c) => c.restaurantCode === state.currentRestaurantCode);
    const otherRestoCode = state.currentRestaurantCode === 'RW01' ? 'RW02' : 'RW01';
    const otherCust = state.customers.find((c) => c.restaurantCode === otherRestoCode);
    const otherCardToken = otherCust
      ? restoStore.getCustomerCardQr(otherCust)
      : `c1.${otherRestoCode}.50101.1.1234567890abcdef`;

    const c1 = restoCusts[0] || state.customers[0];
    const c2 = restoCusts[1] || restoCusts[0];
    const phoneToken = c1 ? restoStore.getCustomerPhoneQr(c1).token : '';
    const cardToken = c1 ? restoStore.getCustomerCardQr(c1) : '';
    const c2CardToken = c2 ? restoStore.getCustomerCardQr(c2) : '';

    return {
      jpPhone: phoneToken,
      jpCard: cardToken,
      kezaLowBalance: c2CardToken,
      replayedToken: `v1.${state.currentRestaurantCode}.${c1?.memberNo || '28491'}.5000.abcd1234ef567890`,
      wrongResto: otherCardToken,
    };
  };

  const demoTokens = getDemoTokens();
  const restoScanEvents = state.scanEvents.filter((ev) => ev.restaurantCode === state.currentRestaurantCode);

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
      {/* 1. Clean Station Header (Simplified: No Pairing Gate, Pairing Code, or Rogue Wi-Fi Controls) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <div>
            <div className="text-base sm:text-lg font-black text-white tracking-tight">
              {currentRestaurant?.name || 'Restaurant Pass Stand'}
            </div>
            <div className="text-xs sm:text-sm text-slate-300 font-mono flex items-center gap-2">
              <span>{currentStation?.name || 'Stand 1'} · Ready for Scanning</span>
            </div>
          </div>
        </div>

        {/* Staff Operational Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Auto-Advance Speed */}
          <div className="flex items-center bg-slate-950 rounded-xl p-1 border border-slate-700 text-xs sm:text-sm">
            <span className="text-slate-200 px-2 font-semibold">Auto-Next:</span>
            {[
              { id: 2, label: '2s' },
              { id: 3, label: '3s' },
              { id: 0, label: 'Off' },
            ].map((speed) => (
              <button
                key={speed.id}
                type="button"
                onClick={() => setAutoAdvanceSeconds(speed.id)}
                className={`px-2.5 py-1 rounded-lg font-mono font-bold transition-colors cursor-pointer ${
                  autoAdvanceSeconds === speed.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {speed.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsProvisionalModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer shadow-sm"
            title="Register new customer or record recharge with up to 3 grace meals while boss is away"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register / Top-Up</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const restoCusts = state.customers.filter((c) => c.restaurantCode === state.currentRestaurantCode);
              setPinDeskCustomerId(restoCusts[0]?.id || '');
              setPinDeskResult(null);
              setIsPinDeskModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 text-cyan-300 hover:text-white transition-colors cursor-pointer shadow-sm"
            title="Issue 15-minute non-SMS activation code or request PIN recovery for a patron"
          >
            <KeyRound className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">PIN / Activation Desk</span>
            <span className="sm:hidden">PIN Desk</span>
          </button>

          <button
            type="button"
            onClick={() => setIsShiftModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 text-emerald-300 hover:text-white transition-colors cursor-pointer shadow-sm"
            title={t.shifts?.title || 'Cashier Shift Handover & Daily Reconciliation'}
          >
            <Coins className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">{t.shifts?.shiftHandoverButton || 'Shift Handover'}</span>
            <span className="sm:hidden">Shift</span>
            {(() => {
              const activeShift = restoStore.getActiveShift(state.currentStationId);
              return activeShift ? (
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-emerald-950 text-emerald-200 font-mono">
                  {activeShift.platesServedCount}p
                </span>
              ) : null;
            })()}
          </button>

          <button
            type="button"
            onClick={() => setIsCameraActive(!isCameraActive)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors cursor-pointer ${
              isCameraActive
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-800 text-slate-100 border-slate-600 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>{isCameraActive ? 'Camera ON' : 'Camera'}</span>
          </button>

          {/* Scanner Audio Control & Volume */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                sound.setSoundEnabled(next);
                setSoundEnabled(next);
                if (next) {
                  sound.unlockAudio().then((ok) => {
                    if (ok) setAudioUnlocked(true);
                    sound.playSuccessSound(`vol_test_${Date.now()}`);
                  });
                }
              }}
              className={`flex items-center gap-1.5 font-bold cursor-pointer ${
                soundEnabled ? 'text-emerald-300 hover:text-emerald-200' : 'text-rose-300 hover:text-rose-200'
              }`}
              title={soundEnabled ? 'Scanner sound alerts ON (click to mute)' : 'Scanner sound alerts MUTED (click to enable)'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span>{soundEnabled ? `${Math.round(soundVolume * 100)}%` : 'Muted'}</span>
            </button>
            {soundEnabled && (
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={soundVolume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  sound.setVolume(v);
                  setSoundVolume(v);
                }}
                aria-label="Scanner alert volume"
                className="w-16 accent-emerald-500 cursor-pointer"
              />
            )}
          </div>

          <BatteryIndicator isStaffMode={true} />
        </div>
      </div>

      {/* Browser Audio Muted / Blocked Warning Banner */}
      {(!soundEnabled || !audioUnlocked) && (
        <div className="p-3.5 rounded-2xl bg-amber-950/90 border-2 border-amber-500/70 text-amber-100 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2.5">
            <VolumeX className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="font-medium">
              {!soundEnabled
                ? 'Scanner sound alerts are currently muted. Enable audio so the cashier hears Accepted and Rejected scan tones.'
                : 'Browser audio is awaiting first interaction. Click Enable Audio to activate loud scan confirmation & warning sounds.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              sound.setSoundEnabled(true);
              setSoundEnabled(true);
              sound.unlockAudio().then((ok) => {
                setAudioUnlocked(ok);
                sound.playSuccessSound(`unlock_test_${Date.now()}`);
              });
            }}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shrink-0 cursor-pointer"
          >
            Enable Audio
          </button>
        </div>
      )}

      {/* 2. Camera Live Viewfinder if activated */}
      {isCameraActive && (
        <div className="rounded-2xl bg-black border-2 border-slate-700 overflow-hidden relative shadow-2xl">
          <div className="relative aspect-video max-h-72 mx-auto flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-52 h-52 border-2 border-emerald-400 rounded-2xl relative shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-emerald-400/60 shadow-[0_0_8px_#34d399]" />
              </div>
            </div>
          </div>
          <div className="py-2.5 text-center text-sm font-medium text-slate-200 bg-slate-950 border-t border-slate-800">
            Hold customer card or phone QR in view of camera
          </div>
        </div>
      )}

      {/* 3. Streamlined High-Contrast Scan Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleExecuteScan(inputPayload);
        }}
        className="relative"
      >
        <div className="relative">
          <input
            ref={keyboardInputRef}
            type="text"
            value={inputPayload}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Scan physical card / QR or enter token..."
            className="w-full pl-12 pr-28 py-4 bg-slate-900 border-2 border-slate-700 focus:border-emerald-400 rounded-2xl text-base sm:text-lg font-mono text-white placeholder-slate-400 outline-hidden transition-all shadow-inner"
          />
          <Barcode className="w-6 h-6 text-emerald-400 absolute left-4 top-4" />
          <button
            type="submit"
            className="absolute right-2.5 top-2.5 bottom-2.5 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-sm transition-colors cursor-pointer shadow-sm"
          >
            Scan
          </button>
        </div>
      </form>

      {/* 4. Quick Simulation Pills (Visible when Demo Mode is active) */}
      {isDemoMode && (
        <div className="flex items-center gap-2.5 overflow-x-auto py-1 text-xs sm:text-sm">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 shrink-0">
            Demo Taps:
          </span>
          <button
            type="button"
            onClick={() => handleExecuteScan(demoTokens.jpCard)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/60 font-bold text-emerald-300 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <span>💳 Card Tap</span>
          </button>

          <button
            type="button"
            onClick={() => handleExecuteScan(demoTokens.jpPhone)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/60 font-bold text-cyan-300 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <span>📱 Phone QR</span>
          </button>

          <button
            type="button"
            onClick={() => handleExecuteScan(demoTokens.kezaLowBalance)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/60 font-bold text-amber-300 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <span>⚠️ Low Balance</span>
          </button>

          <button
            type="button"
            onClick={() => handleExecuteScan(demoTokens.wrongResto)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-rose-500/60 font-bold text-rose-300 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <span>⛔ Other Resto Card</span>
          </button>
        </div>
      )}

      {/* 5. ACTIVE SCAN RESULT DISPLAY */}
      {activeScan && (
        <div className="animate-in fade-in zoom-in-95 duration-150">
          {/* 5A. REJECTED / BLOCKED SCREEN */}
          {activeScan.event.status === 'blocked' ? (
            <div className="p-6 rounded-3xl bg-rose-950/95 border-2 border-rose-500 text-white shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="p-3.5 bg-rose-600 rounded-2xl text-white shadow-md">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/30 border border-rose-400/60 text-xs font-black uppercase tracking-wider text-rose-100 mb-1">
                      REJECTED · NO MEAL DEDUCTED
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      MEAL REJECTED
                    </h2>
                    <p className="text-base text-rose-100 mt-1 font-bold">
                      {activeScan.rejectionReason || activeScan.event.blockedReason}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseServing}
                  className="px-4 py-2.5 rounded-xl bg-rose-900 hover:bg-rose-800 text-sm font-bold text-white transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>

              {activeScan.event.customerId && (
                <div className="flex items-center justify-between gap-3 bg-black/40 p-3.5 rounded-2xl border border-rose-500/40 text-sm">
                  <div>
                    <span className="font-bold text-white text-base">{activeScan.event.customerName}</span>
                    <span className="text-rose-200 font-mono ml-2">#{activeScan.event.memberNo}</span>
                  </div>
                  <div className="font-mono font-bold text-rose-100 text-sm">
                    Approved Balance: {activeScan.balanceAfter} meal(s)
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-rose-800/80">
                {activeScan.event.customerId && (
                  <button
                    type="button"
                    onClick={() => setOverrideModalOpen(true)}
                    className="px-4 py-2.5 bg-white text-rose-950 font-black text-sm rounded-xl hover:bg-rose-100 transition-colors cursor-pointer"
                  >
                    Supervisor Override
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCloseServing}
                  className="px-5 py-2.5 bg-rose-900/90 hover:bg-rose-800 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer"
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          ) : activeScan.event.status === 'rejected_photo' ? (
            /* 5B. REJECTED SPOT-CHECK */
            <div className="p-6 rounded-3xl bg-amber-950/95 border-2 border-amber-500 text-white shadow-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <XCircle className="w-9 h-9 text-amber-400" />
                <div>
                  <h2 className="text-2xl font-black text-amber-100">Photo Mismatch</h2>
                  <p className="text-sm text-amber-200 mt-0.5">Serving cancelled. Plate refunded.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseServing}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Next &rarr;
              </button>
            </div>
          ) : activeScan.event.status === 'undone' ? (
            /* 5C. UNDONE */
            <div className="p-5 rounded-3xl bg-slate-900 border-2 border-slate-700 text-white flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <RotateCcw className="w-7 h-7 text-emerald-400" />
                <div>
                  <h2 className="text-lg font-bold text-white">Serving Undone</h2>
                  <p className="text-sm text-slate-300">Plate returned to customer balance.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseServing}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Next &rarr;
              </button>
            </div>
          ) : (
            /* 5D. SUCCESS APPROVED (High Contrast, Bold, Ultra-Clean POS) */
            <div
              className={`p-6 rounded-3xl border-2 transition-all shadow-2xl space-y-4 ${
                activeScan.event.status === 'warning_confirmed'
                  ? 'bg-amber-950/95 border-amber-500 text-white'
                  : 'bg-emerald-950/95 border-emerald-500 text-white'
              }`}
            >
              {/* Header: Deduction Banner & Balance */}
              <div className="flex items-center justify-between border-b border-white/15 pb-3.5">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black shadow-md">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/30 border border-emerald-400/60 text-xs font-black uppercase tracking-wider text-emerald-100 mb-1">
                      ACCEPTED · {activeScan.message || 'Meal accepted — 1 meal recorded.'}
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                      {activeScan.event.platesDeducted === 2 ? '2 PLATES SERVED' : '1 PLATE SERVED'}
                    </h2>
                    <div className="text-sm text-emerald-200 font-mono">
                      {new Date(activeScan.event.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>

                {/* Remaining Balance */}
                <div className="text-right">
                  <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-white">
                    {activeScan.balanceAfter}
                  </div>
                  <div className="text-xs sm:text-sm uppercase tracking-wider font-bold text-emerald-200">
                    Plates Left
                  </div>
                </div>
              </div>

              {/* Photo Spot Check prompt if physical card scanned */}
              {activeScan.event.photoCheckRequired && activeScan.event.photoCheckResult === 'none' && (
                <div className="p-3.5 rounded-2xl bg-black/50 border border-amber-500/70 flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-amber-100">Verify Photo Identity:</div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handlePhotoCheckDecision('matched')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm cursor-pointer"
                    >
                      Match ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePhotoCheckDecision('rejected')}
                      className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold text-sm cursor-pointer"
                    >
                      Mismatch ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Member Card Profile */}
              <div className="flex items-center gap-4 bg-black/35 p-3.5 rounded-2xl border border-white/15">
                <img
                  src={activeScan.event.customerPhoto}
                  alt={activeScan.event.customerName}
                  className="w-16 h-16 rounded-xl object-cover border border-white/30 shadow-md shrink-0"
                />
                <div>
                  <div className="text-xl sm:text-2xl font-black leading-tight text-white">
                    {activeScan.event.customerName}
                  </div>
                  <div className="text-sm text-slate-200 font-mono mt-0.5">
                    Member #{activeScan.event.memberNo}
                  </div>
                  {activeScan.balanceAfter < 5 && (
                    <div className="text-xs sm:text-sm text-amber-300 font-bold mt-1">
                      ⚠️ Low Balance ({activeScan.balanceAfter} remaining)
                    </div>
                  )}
                  {activeScan.event.isGracePlate && (
                    <div className="mt-2 p-2.5 rounded-xl bg-amber-500/25 border border-amber-400/50 text-xs sm:text-sm text-amber-100 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0" />
                      <span>
                        <strong>Provisional Grace Plate Served:</strong> Customer authorized for up to 3 plates while awaiting boss Mobile Money payment approval.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons: 2nd Plate, Undo, Done */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2.5">
                  {activeScan.event.platesDeducted < 2 && activeScan.balanceAfter >= 1 && (
                    <button
                      type="button"
                      onClick={handleAddSecondPlate}
                      className="px-4 py-2.5 rounded-xl bg-white text-slate-950 font-black text-sm hover:bg-slate-100 transition-all shadow-md cursor-pointer active:scale-95"
                    >
                      + 2nd Plate
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleUndo}
                    className="px-4 py-2.5 rounded-xl bg-black/50 hover:bg-black/70 border border-white/25 text-white font-bold text-sm transition-all cursor-pointer"
                  >
                    Undo
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCloseServing}
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition-all shadow-lg cursor-pointer"
                >
                  Next &rarr; {autoAdvanceSeconds > 0 && `(${autoAdvanceRemaining}s)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RECENT STAND SCANS FEED */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-700/80 space-y-3.5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Recent Servings
            </h3>
          </div>
          <span className="text-xs sm:text-sm font-mono text-slate-300 font-semibold">
            {restoScanEvents.length} recorded
          </span>
        </div>

        {restoScanEvents.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-300">
            Ready for scans. Tap a physical card or digital QR pass.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
            {restoScanEvents.slice(0, 6).map((ev) => (
              <div key={ev.id} className="py-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      ev.status === 'approved'
                        ? 'bg-emerald-400'
                        : ev.status === 'warning_confirmed'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  <div>
                    <span className="font-bold text-white">
                      {ev.customerName || 'Unknown Customer'}
                    </span>
                    <span className="text-slate-300 ml-2 font-mono text-xs sm:text-sm">
                      #{ev.memberNo}
                    </span>
                    {ev.platesDeducted > 0 && (
                      <span className="text-emerald-300 font-mono ml-2 font-bold">
                        -{ev.platesDeducted} plate{ev.platesDeducted > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-300 font-mono text-xs sm:text-sm tabular-nums">
                  <span>
                    {new Date(ev.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADMIN OVERRIDE MODAL */}
      {overrideModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Approve Manager Override</h3>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">
              Customer reached maximum serving limit in 2 hours. Overriding requires a logged justification for the platform audit log.
            </p>

            <div className="space-y-1.5">
              <label className="text-sm font-bold text-slate-200">Override Reason / Justification</label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-sm text-white focus:border-emerald-400 outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setOverrideModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOverride}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black shadow-sm cursor-pointer"
              >
                Confirm Override &amp; Deduct Plate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROVISIONAL REGISTRATION & RECHARGE MODAL */}
      <ScannerProvisionalModal
        isOpen={isProvisionalModalOpen}
        onClose={() => setIsProvisionalModalOpen(false)}
        onSuccessScan={(tok) => handleExecuteScan(tok)}
      />

      {/* CASHIER SHIFT HANDOVER & RECONCILIATION MODAL */}
      <ShiftHandoverModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        language={language}
        stationId={state.currentStationId}
      />

      {/* CUSTOMER NON-SMS ACTIVATION & PIN RECOVERY DESK MODAL */}
      {isPinDeskModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Customer PIN &amp; Activation Desk</h3>
                  <p className="text-sm text-slate-300">In-person identity check (No SMS required)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPinDeskModalOpen(false)}
                className="text-slate-300 hover:text-white text-sm font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl bg-slate-950 border border-slate-800 text-sm">
              <button
                type="button"
                onClick={() => {
                  setPinDeskMode('activation');
                  setPinDeskResult(null);
                }}
                className={`py-2.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  pinDeskMode === 'activation' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                1. First-Time Activation
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinDeskMode('recovery');
                  setPinDeskResult(null);
                }}
                className={`py-2.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  pinDeskMode === 'recovery' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                2. Forgot PIN Recovery
              </button>
            </div>

            <div className="space-y-3.5 text-sm">
              <div>
                <label className="block text-slate-200 font-bold mb-1.5">Select Verified Patron</label>
                <select
                  value={pinDeskCustomerId}
                  onChange={(e) => {
                    setPinDeskCustomerId(e.target.value);
                    setPinDeskResult(null);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white outline-hidden focus:border-cyan-400"
                >
                  {state.customers
                    .filter((c) => c.restaurantCode === state.currentRestaurantCode)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.memberNo} — {c.name} ({c.phone}) [{c.activationStatus || c.provisionalStatus}]
                      </option>
                    ))}
                </select>
              </div>

              {pinDeskMode === 'recovery' && (
                <>
                  <div>
                    <label className="block text-slate-200 font-bold mb-1.5">Physical ID Verified</label>
                    <select
                      value={pinDeskIdMethod}
                      onChange={(e) => setPinDeskIdMethod(e.target.value as any)}
                      className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white outline-hidden"
                    >
                      <option value="student_id_check">University Student ID Card</option>
                      <option value="national_id_check">National ID / Passport</option>
                      <option value="photo_match">Live Photo Match</option>
                      <option value="manager_override">In-Person Manager Verification</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-200 font-bold mb-1.5">Audit Reason</label>
                    <input
                      type="text"
                      value={pinDeskReason}
                      onChange={(e) => setPinDeskReason(e.target.value)}
                      className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white outline-hidden"
                    />
                  </div>
                </>
              )}

              {pinDeskResult && (
                <div
                  className={`p-4 rounded-2xl border-2 space-y-2 ${
                    pinDeskResult.error
                      ? 'bg-rose-950/90 border-rose-600 text-rose-100'
                      : 'bg-emerald-950/90 border-emerald-500 text-emerald-100'
                  }`}
                >
                  {pinDeskResult.error ? (
                    <div className="font-bold text-sm">{pinDeskResult.error}</div>
                  ) : (
                    <>
                      <div className="text-xs uppercase tracking-wider font-black text-emerald-300">
                        {pinDeskResult.type === 'activation'
                          ? '15-Minute Single-Use Activation Code'
                          : 'PIN Recovery Request Logged'}
                      </div>
                      {pinDeskResult.code && (
                        <div className="text-3xl font-black font-mono tracking-widest text-white bg-slate-950 py-3 px-4 rounded-xl text-center border border-emerald-500/50">
                          {pinDeskResult.code}
                        </div>
                      )}
                      {pinDeskResult.requestId && (
                        <div className="text-sm font-mono text-amber-300">
                          Request ID: <strong>{pinDeskResult.requestId}</strong>
                        </div>
                      )}
                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                        Have <strong>{pinDeskResult.customerName} (#{pinDeskResult.memberNo})</strong> enter this code on the Customer Portal login screen to privately set their new 6-digit PIN.
                      </p>
                    </>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  const cust = state.customers.find((c) => c.id === pinDeskCustomerId);
                  if (!cust) return;
                  if (pinDeskMode === 'activation') {
                    const res = restoStore.requestCustomerActivation({
                      customerId: cust.id,
                      authorizingStaffId: state.currentStationId || 'staff_pos',
                      authorizingStaffName: operatorName,
                      restaurantCode: state.currentRestaurantCode,
                    });
                    setPinDeskResult({
                      type: 'activation',
                      code: res.activationCode,
                      expiresAt: res.expiresAt,
                      customerName: cust.name,
                      memberNo: cust.memberNo,
                      error: res.error,
                    });
                  } else {
                    const reqRes = restoStore.requestCustomerPinRecovery({
                      customerId: cust.id,
                      reason: pinDeskReason,
                      idVerificationMethod: pinDeskIdMethod,
                      restaurantCode: state.currentRestaurantCode,
                      staffId: state.currentStationId || 'staff_pos',
                      staffName: operatorName,
                    });
                    if (reqRes.success && reqRes.requestId) {
                      const apprRes = restoStore.approveCustomerPinRecovery({
                        requestId: reqRes.requestId,
                        authorizingStaffId: state.currentStationId || 'staff_pos',
                        authorizingStaffName: operatorName,
                      });
                      setPinDeskResult({
                        type: 'recovery',
                        code: apprRes.recoveryCode,
                        requestId: reqRes.requestId,
                        expiresAt: apprRes.expiresAt,
                        customerName: cust.name,
                        memberNo: cust.memberNo,
                        error: apprRes.error,
                      });
                    } else {
                      setPinDeskResult({
                        type: 'recovery',
                        customerName: cust.name,
                        memberNo: cust.memberNo,
                        error: reqRes.error || 'Failed to create recovery request',
                      });
                    }
                  }
                }}
                className="w-full py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-sm shadow-md transition-colors cursor-pointer"
              >
                {pinDeskMode === 'activation'
                  ? 'Generate 15-Minute Activation Code'
                  : 'Verify ID & Issue PIN Reset Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
