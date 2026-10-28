import React, { useState, useEffect, useRef } from 'react';
import { Customer, ScanEvent, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import { sound } from '../../services/audioService';
import { BatteryIndicator } from '../common/BatteryIndicator';
import { ScannerProvisionalModal } from './ScannerProvisionalModal';
import { ShiftHandoverModal } from './ShiftHandoverModal';
import { UnauthorizedTerminalShield } from './UnauthorizedTerminalShield';
import { TerminalPairingModal } from './TerminalPairingModal';
import {
  Camera,
  Barcode,
  RotateCcw,
  PlusCircle,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  UserCheck,
  UserX,
  UserPlus,
  History,
  Info,
  Clock,
  Zap,
  ArrowRight,
  ShieldCheck,
  Coins,
  KeyRound,
  Lock,
  Wifi,
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
  const terms = restoStore.getRestaurantTerms(state.currentRestaurantCode);

  const [refreshCount, setRefreshCount] = useState(0);
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const isTerminalPaired = restoStore.isCurrentTerminalPaired(state.currentRestaurantCode);
  const currentStation = state.scanPoints.find(
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
        if (ok) setAudioUnlocked(true);
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
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProvisionalModalOpen, setIsProvisionalModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isPinDeskModalOpen, setIsPinDeskModalOpen] = useState(false);
  const [pinDeskCustomerId, setPinDeskCustomerId] = useState<string>('');
  const [pinDeskMode, setPinDeskMode] = useState<'activation' | 'recovery'>('activation');
  const [pinDeskIdMethod, setPinDeskIdMethod] = useState<'student_id_check' | 'national_id_check' | 'photo_match' | 'manager_override'>('student_id_check');
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

  // Auto-focus keyboard input for USB/BT barcode scanner wedge
  useEffect(() => {
    const focusScanner = () => {
      if (keyboardInputRef.current && !overrideModalOpen) {
        keyboardInputRef.current.focus();
      }
    };
    focusScanner();
    const interval = setInterval(focusScanner, 1500);
    return () => clearInterval(interval);
  }, [overrideModalOpen]);

  // POS Physical Keyboard Shortcuts for Stand Operator
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
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
  }, [activeScan]);

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

            // If browser supports hardware BarcodeDetector API (Android Chrome & modern Chromium)
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
                    } catch (e) {
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

  // Helper for window display text
  const getWindowTimeLabel = (event: ScanEvent) => {
    const win = restoStore.getPlatesInWindow(event.customerId, event.restaurantCode);
    if (win.lastServedMinutesAgo !== null) {
      return `${win.count} plate${win.count > 1 ? 's' : ''}, ${win.lastServedMinutesAgo} min ago`;
    }
    return t.scanner.noPlatesInWindow;
  };

  // ROGUE WI-FI TERMINAL LOCKOUT GUARD
  if (!isTerminalPaired) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-5">
        <UnauthorizedTerminalShield
          onOpenPairModal={() => setIsPairingModalOpen(true)}
          onQuickAuthorize={() => setRefreshCount((c) => c + 1)}
        />
        {isPairingModalOpen && (
          <TerminalPairingModal
            restaurantCode={state.currentRestaurantCode}
            onClose={() => setIsPairingModalOpen(false)}
            onSuccess={() => {
              setIsPairingModalOpen(false);
              setRefreshCount((c) => c + 1);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
      {/* 1. Sleek Compact Station Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <div className="text-sm font-bold text-white tracking-tight">
              {currentRestaurant?.name || 'Restaurant Pass Stand'}
            </div>
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
              <span>{currentStation?.name || 'Stand 1'} · Online</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px]">
                Authorized Terminal
              </span>
            </div>
          </div>
        </div>

        {/* Quick Station Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Terminal Pairing Badge & Simulator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono text-slate-300 font-bold">
              {currentStation?.pairingKey || currentStation?.pairingCode || 'UNPAIRED'}
            </span>
            <button
              type="button"
              onClick={() => setIsPairingModalOpen(true)}
              className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 cursor-pointer"
              title="Pair or switch this terminal"
            >
              Pairing
            </button>
            <button
              type="button"
              onClick={() => {
                restoStore.revokeTerminalPairing(state.currentStationId, 'Test Simulation');
                setRefreshCount((c) => c + 1);
              }}
              className="text-[10px] text-rose-400 hover:text-rose-300 px-1.5 py-0.5 rounded bg-rose-950/50 border border-rose-800/60 cursor-pointer"
              title="Simulate unauthorized rogue phone accessing cafeteria Wi-Fi address"
            >
              Test Rogue Wi-Fi
            </button>
          </div>
          {/* Auto-Advance Speed */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[11px]">
            <span className="text-slate-400 px-2 font-medium">Auto-Next:</span>
            {[
              { id: 2, label: '2s' },
              { id: 3, label: '3s' },
              { id: 0, label: 'Off' },
            ].map((speed) => (
              <button
                key={speed.id}
                type="button"
                onClick={() => setAutoAdvanceSeconds(speed.id)}
                className={`px-2 py-0.5 rounded font-mono font-bold transition-colors cursor-pointer ${
                  autoAdvanceSeconds === speed.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {speed.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsProvisionalModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer shadow-sm"
            title="Register new customer or record recharge with 3 grace meals while boss is away"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Provisional Reg / Top-Up</span>
            <span className="sm:hidden">Provisional</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const restoCusts = state.customers.filter((c) => c.restaurantCode === state.currentRestaurantCode);
              setPinDeskCustomerId(restoCusts[0]?.id || '');
              setPinDeskResult(null);
              setIsPinDeskModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 hover:text-white transition-colors cursor-pointer shadow-sm"
            title="Issue 15-minute non-SMS activation code or request PIN recovery for a patron"
          >
            <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">PIN / Activation Desk</span>
            <span className="sm:hidden">PIN Desk</span>
          </button>

          <button
            type="button"
            onClick={() => setIsShiftModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 hover:text-white transition-colors cursor-pointer shadow-sm"
            title={t.shifts?.title || 'Cashier Shift Handover & Daily Reconciliation'}
          >
            <Coins className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">{t.shifts?.shiftHandoverButton || 'Shift Handover'}</span>
            <span className="sm:hidden">Shift</span>
            {(() => {
              const activeShift = restoStore.getActiveShift(state.currentStationId);
              return activeShift ? (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950 text-emerald-300 font-mono">
                  {activeShift.platesServedCount}p
                </span>
              ) : null;
            })()}
          </button>

          <button
            onClick={() => setIsCameraActive(!isCameraActive)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              isCameraActive
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{isCameraActive ? 'Camera ON' : 'Camera'}</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400">
            <Barcode className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ready</span>
          </div>

          {/* Scanner Audio Control & Volume */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs">
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
              className={`flex items-center gap-1 font-semibold cursor-pointer ${
                soundEnabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-rose-400 hover:text-rose-300'
              }`}
              title={soundEnabled ? 'Scanner sound alerts ON (click to mute)' : 'Scanner sound alerts MUTED (click to enable)'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="hidden md:inline text-[11px]">{soundEnabled ? `${Math.round(soundVolume * 100)}%` : 'Muted'}</span>
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
                className="w-14 accent-emerald-500 cursor-pointer"
              />
            )}
          </div>

          <BatteryIndicator isStaffMode={true} />
        </div>
      </div>

      {/* Browser Audio Muted / Blocked Warning Banner */}
      {(!soundEnabled || !audioUnlocked) && (
        <div className="p-3 rounded-2xl bg-amber-950/80 border border-amber-500/60 text-amber-100 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <VolumeX className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
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
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shrink-0 cursor-pointer"
          >
            Enable Audio
          </button>
        </div>
      )}

      {/* 2. Camera Live Viewfinder if activated */}
      {isCameraActive && (
        <div className="rounded-2xl bg-black border border-slate-800 overflow-hidden relative shadow-2xl">
          <div className="relative aspect-video max-h-72 mx-auto flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Viewfinder target reticle */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-52 h-52 border-2 border-emerald-400 rounded-2xl relative shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-emerald-400/60 shadow-[0_0_8px_#34d399]" />
              </div>
            </div>
          </div>
          <div className="py-2 text-center text-xs text-slate-400 bg-slate-950 border-t border-slate-800">
            Hold student card or phone QR in view of camera
          </div>
        </div>
      )}

      {/* 3. Streamlined Scan Input Bar (Clean & Focused) */}
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
            placeholder="Scan card or enter Member ID..."
            className="w-full pl-11 pr-24 py-3.5 bg-slate-900 border border-slate-700/80 focus:border-emerald-500 rounded-2xl text-sm font-mono text-white placeholder-slate-500 outline-hidden transition-all shadow-inner"
          />
          <Barcode className="w-5 h-5 text-emerald-400 absolute left-3.5 top-3.5" />
          <button
            type="submit"
            className="absolute right-2 top-2 bottom-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Scan
          </button>
        </div>
      </form>

      {/* 4. Quick Simulation Pills (Visible when Demo Mode is active) */}
      {isDemoMode && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 text-xs">
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 shrink-0">
            Demo Taps:
          </span>
          <button
            onClick={() => handleExecuteScan(demoTokens.jpCard)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 font-semibold text-emerald-400 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <span>💳 Card Tap</span>
          </button>

          <button
            onClick={() => handleExecuteScan(demoTokens.jpPhone)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 font-semibold text-cyan-400 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <span>📱 Phone QR</span>
          </button>

          <button
            onClick={() => handleExecuteScan(demoTokens.kezaLowBalance)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 font-semibold text-amber-400 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <span>⚠️ Low Balance</span>
          </button>

          <button
            onClick={() => handleExecuteScan(demoTokens.wrongResto)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-rose-500/50 font-semibold text-rose-400 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
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
            <div className="p-6 rounded-3xl bg-rose-950/90 border-2 border-rose-500 text-white shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-rose-600 rounded-2xl text-white shadow-md">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/30 border border-rose-400/50 text-[10px] font-black uppercase tracking-wider text-rose-100 mb-1">
                      REJECTED · NO MEAL DEDUCTED
                    </div>
                    <h2 className="text-2xl font-black text-rose-100 tracking-tight">
                      MEAL REJECTED
                    </h2>
                    <p className="text-sm text-rose-100 mt-1 font-bold">
                      {activeScan.rejectionReason || activeScan.event.blockedReason}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleCloseServing}
                  className="px-4 py-2 rounded-xl bg-rose-900 hover:bg-rose-800 text-xs font-bold text-white transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>

              {activeScan.event.customerId && (
                <div className="flex items-center justify-between gap-3 bg-black/30 p-3 rounded-2xl border border-rose-500/30 text-xs">
                  <div>
                    <span className="font-bold text-white">{activeScan.event.customerName}</span>
                    <span className="text-rose-200 font-mono ml-2">#{activeScan.event.memberNo}</span>
                  </div>
                  <div className="font-mono font-bold text-rose-200">
                    Approved Balance: {activeScan.balanceAfter} meal(s)
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-800/80">
                {activeScan.event.customerId && (
                  <button
                    onClick={() => setOverrideModalOpen(true)}
                    className="px-4 py-2 bg-white text-rose-950 font-bold text-xs rounded-xl hover:bg-rose-100 transition-colors cursor-pointer"
                  >
                    Supervisor Override
                  </button>
                )}
                <button
                  onClick={handleCloseServing}
                  className="px-4 py-2 bg-rose-900/80 hover:bg-rose-900 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          ) : activeScan.event.status === 'rejected_photo' ? (
            /* 5B. REJECTED SPOT-CHECK */
            <div className="p-6 rounded-3xl bg-amber-950/90 border-2 border-amber-500 text-white shadow-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <XCircle className="w-8 h-8 text-amber-400" />
                <div>
                  <h2 className="text-xl font-bold text-amber-100">Photo Mismatch</h2>
                  <p className="text-xs text-amber-200 mt-0.5">Serving cancelled. Plate refunded.</p>
                </div>
              </div>
              <button
                onClick={handleCloseServing}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Next &rarr;
              </button>
            </div>
          ) : activeScan.event.status === 'undone' ? (
            /* 5C. UNDONE */
            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-700 text-white flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <RotateCcw className="w-6 h-6 text-emerald-400" />
                <div>
                  <h2 className="text-base font-bold text-white">Serving Undone</h2>
                  <p className="text-xs text-slate-400">Plate returned to customer balance.</p>
                </div>
              </div>
              <button
                onClick={handleCloseServing}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Next &rarr;
              </button>
            </div>
          ) : (
            /* 5D. SUCCESS APPROVED (High Contrast, Bold, Ultra-Clean POS) */
            <div className={`p-6 rounded-3xl border-2 transition-all shadow-2xl space-y-4 ${
              activeScan.event.status === 'warning_confirmed'
                ? 'bg-amber-950/90 border-amber-500 text-white'
                : 'bg-emerald-950/90 border-emerald-500 text-white'
            }`}>
              {/* Header: Deduction Banner & Balance */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black shadow-md">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/30 border border-emerald-400/50 text-[10px] font-black uppercase tracking-wider text-emerald-100 mb-1">
                      ACCEPTED · {activeScan.message || 'Meal accepted — 1 meal recorded.'}
                    </div>
                    <h2 className="text-2xl font-black tracking-tight">
                      {activeScan.event.platesDeducted === 2 ? '2 PLATES SERVED' : '1 PLATE SERVED'}
                    </h2>
                    <div className="text-xs text-emerald-300 font-mono">
                      {new Date(activeScan.event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {/* Remaining Balance */}
                <div className="text-right">
                  <div className="text-4xl font-black font-mono tabular-nums text-white">
                    {activeScan.balanceAfter}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider font-bold text-emerald-300">
                    Plates Left
                  </div>
                </div>
              </div>

              {/* Photo Spot Check prompt if physical card scanned */}
              {activeScan.event.photoCheckRequired && activeScan.event.photoCheckResult === 'none' && (
                <div className="p-3 rounded-2xl bg-black/50 border border-amber-500/60 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-amber-200">
                    Verify Photo Identity:
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePhotoCheckDecision('matched')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
                    >
                      Match ✓
                    </button>
                    <button
                      onClick={() => handlePhotoCheckDecision('rejected')}
                      className="px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer"
                    >
                      Mismatch ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Member Card Profile */}
              <div className="flex items-center gap-3.5 bg-black/30 p-3 rounded-2xl border border-white/10">
                <img
                  src={activeScan.event.customerPhoto}
                  alt={activeScan.event.customerName}
                  className="w-14 h-14 rounded-xl object-cover border border-white/30 shadow-md shrink-0"
                />
                <div>
                  <div className="text-xl font-black leading-tight text-white">
                    {activeScan.event.customerName}
                  </div>
                  <div className="text-xs text-slate-300 font-mono mt-0.5">
                    Member #{activeScan.event.memberNo}
                  </div>
                  {activeScan.balanceAfter < 5 && (
                    <div className="text-[11px] text-amber-300 font-bold mt-0.5">
                      ⚠️ Low Balance ({activeScan.balanceAfter} remaining)
                    </div>
                  )}
                  {activeScan.event.isGracePlate && (
                    <div className="mt-1.5 p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-[11px] text-amber-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        <strong>Provisional Grace Plate Served:</strong> Customer authorized for up to 3 plates while awaiting boss Mobile Money payment approval.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons: 2nd Plate, Undo, Done */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  {activeScan.event.platesDeducted < 2 && activeScan.balanceAfter >= 1 && (
                    <button
                      onClick={handleAddSecondPlate}
                      className="px-4 py-2 rounded-xl bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 transition-all shadow-md cursor-pointer active:scale-95"
                    >
                      + 2nd Plate
                    </button>
                  )}

                  <button
                    onClick={handleUndo}
                    className="px-3.5 py-2 rounded-xl bg-black/40 hover:bg-black/60 border border-white/20 text-white font-semibold text-xs transition-all cursor-pointer"
                  >
                    Undo
                  </button>
                </div>

                <button
                  onClick={handleCloseServing}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all shadow-lg cursor-pointer"
                >
                  Next &rarr; {autoAdvanceSeconds > 0 && `(${autoAdvanceRemaining}s)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RECENT STAND SCANS FEED (Clean & Uncluttered) */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Recent Servings
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {restoScanEvents.length} recorded
          </span>
        </div>

        {restoScanEvents.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            Ready for scans. Tap a card or phone QR.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 max-h-56 overflow-y-auto">
            {restoScanEvents.slice(0, 6).map((ev) => (
              <div key={ev.id} className="py-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${
                    ev.status === 'approved'
                      ? 'bg-emerald-500'
                      : ev.status === 'warning_confirmed'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`} />
                  <div>
                    <span className="font-semibold text-slate-200">
                      {ev.customerName || 'Unknown Customer'}
                    </span>
                    <span className="text-slate-400 ml-1.5 font-mono text-[11px]">
                      #{ev.memberNo}
                    </span>
                    {ev.platesDeducted > 0 && (
                      <span className="text-emerald-400 font-mono ml-2 font-bold">
                        -{ev.platesDeducted} plate{ev.platesDeducted > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px] tabular-nums">
                  <span>{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADMIN OVERRIDE MODAL */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Approve Manager Override</h3>
            </div>
            <p className="text-xs text-slate-300">
              Customer reached maximum serving limit in 2 hours. Overriding requires a logged justification for the platform audit log.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Override Reason / Justification</label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:border-emerald-500 outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setOverrideModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOverride}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm"
              >
                Confirm Override & Deduct Plate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROVISIONAL REGISTRATION & RECHARGE MODAL (Boss Delegation) */}
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

      {/* TERMINAL PAIRING MODAL */}
      {isPairingModalOpen && (
        <TerminalPairingModal
          restaurantCode={state.currentRestaurantCode}
          onClose={() => setIsPairingModalOpen(false)}
          onSuccess={() => {
            setIsPairingModalOpen(false);
            setRefreshCount((c) => c + 1);
          }}
        />
      )}

      {/* CUSTOMER NON-SMS ACTIVATION & PIN RECOVERY DESK MODAL */}
      {isPinDeskModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Customer PIN &amp; Activation Desk</h3>
                  <p className="text-xs text-slate-400">In-person identity check (No SMS required)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPinDeskModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setPinDeskMode('activation');
                  setPinDeskResult(null);
                }}
                className={`py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                  pinDeskMode === 'activation' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
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
                className={`py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                  pinDeskMode === 'recovery' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                2. Forgot PIN Recovery
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select Verified Patron</label>
                <select
                  value={pinDeskCustomerId}
                  onChange={(e) => {
                    setPinDeskCustomerId(e.target.value);
                    setPinDeskResult(null);
                  }}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-hidden focus:border-cyan-500"
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
                    <label className="block text-slate-300 font-semibold mb-1">Physical ID Verified</label>
                    <select
                      value={pinDeskIdMethod}
                      onChange={(e) => setPinDeskIdMethod(e.target.value as any)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-hidden"
                    >
                      <option value="student_id_check">University Student ID Card</option>
                      <option value="national_id_check">National ID / Passport</option>
                      <option value="photo_match">Live Photo Match</option>
                      <option value="manager_override">In-Person Manager Verification</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Audit Reason</label>
                    <input
                      type="text"
                      value={pinDeskReason}
                      onChange={(e) => setPinDeskReason(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-hidden"
                    />
                  </div>
                </>
              )}

              {pinDeskResult && (
                <div
                  className={`p-4 rounded-2xl border space-y-2 ${
                    pinDeskResult.error
                      ? 'bg-rose-950/80 border-rose-700 text-rose-200'
                      : 'bg-emerald-950/80 border-emerald-600 text-emerald-200'
                  }`}
                >
                  {pinDeskResult.error ? (
                    <div className="font-semibold">{pinDeskResult.error}</div>
                  ) : (
                    <>
                      <div className="text-[11px] uppercase tracking-wider font-bold text-emerald-400">
                        {pinDeskResult.type === 'activation'
                          ? '15-Minute Single-Use Activation Code'
                          : 'PIN Recovery Request Logged'}
                      </div>
                      {pinDeskResult.code && (
                        <div className="text-3xl font-black font-mono tracking-widest text-white bg-slate-950/90 py-3 px-4 rounded-xl text-center border border-emerald-500/40">
                          {pinDeskResult.code}
                        </div>
                      )}
                      {pinDeskResult.requestId && (
                        <div className="text-xs font-mono text-amber-300">
                          Request ID: <strong>{pinDeskResult.requestId}</strong>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-300">
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
                className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
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
