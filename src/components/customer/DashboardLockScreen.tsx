import React, { useState } from 'react';
import { Customer, Restaurant } from '../../types';
import { restoStore } from '../../store/restoStore';
import {
  Shield,
  Lock,
  Delete,
  AlertCircle,
  HelpCircle,
  Utensils,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface DashboardLockScreenProps {
  customer: Customer;
  restaurant?: Restaurant;
  onUnlock: () => void;
}

export const DashboardLockScreen: React.FC<DashboardLockScreenProps> = ({
  customer,
  restaurant,
  onUnlock,
}) => {
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);

  const handleDigit = (digit: string) => {
    setErrorMessage(null);
    if (pin.length < 6) {
      const next = pin + digit;
      setPin(next);
      if (!customer.hasCustomPin && next.length === 4 && restoStore.verifyCustomerPin(customer.id, next)) {
        onUnlock();
        return;
      }
      if (next.length === 6) {
        // Verify PIN
        const isValid = restoStore.verifyCustomerPin(customer.id, next);
        if (isValid) {
          onUnlock();
        } else {
          setIsShaking(true);
          setErrorMessage('Incorrect PIN. Please re-enter.');
          setTimeout(() => {
            setIsShaking(false);
            setPin('');
          }, 600);
        }
      }
    }
  };

  const handleBackspace = () => {
    setErrorMessage(null);
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-sm flex flex-col items-center text-center space-y-6">
        {/* Cafeteria Identity Badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
          <Utensils className="w-3.5 h-3.5 text-emerald-400" />
          <span>{restaurant?.name || 'RestoPass Campus Dining'}</span>
          <span className="text-emerald-400 font-bold uppercase">[{customer.restaurantCode}]</span>
        </div>

        {/* User Card Icon & Name */}
        <div className="space-y-2">
          <div className="relative mx-auto w-18 h-18">
            <img
              src={customer.photoUrl}
              alt=""
              className="w-18 h-18 rounded-3xl object-cover border-2 border-emerald-500/60 shadow-xl"
            />
            <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-slate-900 border border-slate-700 text-amber-400">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>

          <div>
            <h1 className="text-base font-black text-white tracking-tight">
              {customer.name}
            </h1>
            <div className="text-xs font-mono text-slate-400">
              Member ID #{customer.memberNo}
            </div>
          </div>
        </div>

        {/* Lock Status Prompt */}
        <div className="space-y-1">
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>Dashboard Auto-Locked</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Screen went off. Enter your 6-digit PIN to access your meal pass.
          </p>
        </div>

        {/* 6 Digit Dots Indicator */}
        <div
          className={`flex justify-center gap-3 py-2 transition-transform ${
            isShaking ? 'translate-x-[-8px] animate-shake' : ''
          }`}
        >
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const hasDigit = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-150 ${
                  hasDigit
                    ? 'bg-emerald-400 ring-4 ring-emerald-500/30 scale-125'
                    : 'bg-slate-800 border-2 border-slate-700'
                }`}
              />
            );
          })}
        </div>

        {errorMessage && (
          <div className="text-xs text-rose-400 font-medium flex items-center justify-center gap-1.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tactile Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-emerald-600 border border-slate-800 hover:border-slate-700 text-white font-mono font-bold text-xl flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={handleClear}
            disabled={pin.length === 0}
            className="h-14 rounded-2xl bg-slate-900/40 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold flex items-center justify-center transition-all cursor-pointer disabled:opacity-30"
          >
            Clear
          </button>
          <button
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-emerald-600 border border-slate-800 hover:border-slate-700 text-white font-mono font-bold text-xl flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            disabled={pin.length === 0}
            className="h-14 rounded-2xl bg-slate-900/40 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-30"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Forgot PIN Link */}
        <div className="pt-2">
          <button
            onClick={() => setShowForgotHelp((prev) => !prev)}
            className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>Forgot 6-digit PIN?</span>
          </button>
        </div>

        {/* Forgot PIN Guidance Note */}
        {showForgotHelp && (
          <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-left text-xs text-slate-300 space-y-1.5 animate-in fade-in duration-200">
            <div className="font-bold text-white flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cafeteria Desk PIN Reset</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              For student security, your plate balance is guarded on this phone. If you forgot your PIN, visit the{' '}
              <strong className="text-white">Restaurant Boss Room</strong> or any dining stand cashier. They will verify your Student ID / National ID document and issue an instant reset code.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
