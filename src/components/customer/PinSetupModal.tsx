import React, { useState } from 'react';
import { Customer } from '../../types';
import { restoStore } from '../../store/restoStore';
import {
  ShieldCheck,
  Lock,
  Delete,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface PinSetupModalProps {
  customer: Customer;
  isOpen: boolean;
  onComplete: () => void;
  onCancel?: () => void;
  isMandatory?: boolean;
}

export const PinSetupModal: React.FC<PinSetupModalProps> = ({
  customer,
  isOpen,
  onComplete,
  onCancel,
  isMandatory = true,
}) => {
  if (!isOpen) return null;

  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const activeValue = step === 'create' ? pin : confirmPin;

  const handleDigit = (digit: string) => {
    setErrorMessage(null);
    if (step === 'create') {
      if (pin.length < 4) {
        const next = pin + digit;
        setPin(next);
        if (next.length === 4) {
          setTimeout(() => setStep('confirm'), 200);
        }
      }
    } else {
      if (confirmPin.length < 4) {
        const next = confirmPin + digit;
        setConfirmPin(next);
        if (next.length === 4) {
          if (next === pin) {
            // Save PIN
            const ok = restoStore.setCustomerPin(customer.id, next);
            if (ok) {
              setSuccess(true);
              setTimeout(() => {
                onComplete();
              }, 1200);
            }
          } else {
            setErrorMessage('PINs do not match. Please try again.');
            setTimeout(() => {
              setConfirmPin('');
              setStep('create');
              setPin('');
            }, 1000);
          }
        }
      }
    }
  };

  const handleBackspace = () => {
    setErrorMessage(null);
    if (step === 'create') {
      setPin((prev) => prev.slice(0, -1));
    } else {
      if (confirmPin.length === 0) {
        setStep('create');
      } else {
        setConfirmPin((prev) => prev.slice(0, -1));
      }
    }
  };

  const handleReset = () => {
    setPin('');
    setConfirmPin('');
    setStep('create');
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200">
        {/* Header Icon */}
        <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
          {success ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-bounce" />
          ) : (
            <Lock className="w-7 h-7" />
          )}
        </div>

        <div>
          <h2 className="text-base font-black text-white tracking-tight">
            {success
              ? 'Security PIN Established!'
              : step === 'create'
              ? 'Set Your 4-Digit Security PIN'
              : 'Confirm Your 4-Digit Security PIN'}
          </h2>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {success
              ? `Your meal pass for #${customer.memberNo} is now protected.`
              : step === 'create'
              ? `Welcome ${customer.name.split(' ')[0]}! Set a 4-digit PIN to protect your plate balance and auto-lock this device.`
              : 'Re-enter your 4 digits to confirm.'}
          </p>
        </div>

        {/* 4 Digit Indicators */}
        <div className="flex justify-center gap-4 py-2">
          {[0, 1, 2, 3].map((idx) => {
            const hasDigit = activeValue.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-150 ${
                  hasDigit
                    ? 'bg-emerald-400 ring-4 ring-emerald-500/30 scale-110'
                    : 'bg-slate-800 border-2 border-slate-600'
                }`}
              />
            );
          })}
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-center gap-1.5 animate-shake">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Step Indicator */}
        <div className="text-[11px] font-mono text-slate-400">
          Step {step === 'create' ? '1 of 2: Choose digits' : '2 of 2: Confirm digits'}
        </div>

        {/* Tactile Keypad */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto select-none">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              disabled={success}
              className="h-13 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:bg-emerald-600 text-white font-mono font-bold text-lg transition-colors cursor-pointer shadow-xs active:scale-95 disabled:opacity-40"
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleReset}
            disabled={success || activeValue.length === 0}
            className="h-13 rounded-2xl bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-30"
          >
            Clear
          </button>
          <button
            onClick={() => handleDigit('0')}
            disabled={success}
            className="h-13 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:bg-emerald-600 text-white font-mono font-bold text-lg transition-colors cursor-pointer shadow-xs active:scale-95 disabled:opacity-40"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            disabled={success || activeValue.length === 0}
            className="h-13 rounded-2xl bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {!isMandatory && onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer pt-1"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
