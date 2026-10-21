import React from 'react';
import { useBattery } from '../../hooks/useBattery';
import {
  Battery,
  BatteryCharging,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
  Zap,
} from 'lucide-react';

interface BatteryIndicatorProps {
  isStaffMode?: boolean;
}

export const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({ isStaffMode = false }) => {
  const battery = useBattery();
  const percent = Math.round(battery.level * 100);

  // Dynamic icon based on charging & level
  const renderIcon = () => {
    if (battery.charging) {
      return <BatteryCharging className="w-4 h-4 text-emerald-400 animate-pulse" />;
    }
    if (percent <= 20) {
      return <BatteryWarning className="w-4 h-4 text-rose-400 animate-bounce" />;
    }
    if (percent <= 40) {
      return <BatteryLow className="w-4 h-4 text-amber-400" />;
    }
    if (percent <= 70) {
      return <BatteryMedium className="w-4 h-4 text-slate-300" />;
    }
    return <BatteryFull className="w-4 h-4 text-emerald-400" />;
  };

  const getStatusText = () => {
    if (battery.charging) {
      return `Device Battery: ${percent}% (Charging via AC/USB)`;
    }
    if (percent <= 20) {
      return `CRITICAL BATTERY: ${percent}%! Plug in scanner device to avoid service interruption`;
    }
    return `Device Battery: ${percent}% (${battery.supported ? 'Battery Status API' : 'Hardware Terminal'})`;
  };

  const isCritical = percent <= 20 && !battery.charging;

  return (
    <div
      title={getStatusText()}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono tabular-nums transition-all select-none ${
        isCritical
          ? 'bg-rose-950/70 border-rose-600 text-rose-300 shadow-[0_0_10px_rgba(225,29,72,0.4)] animate-pulse'
          : battery.charging
          ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
          : percent <= 40
          ? 'bg-amber-950/40 border-amber-800/70 text-amber-300'
          : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700'
      }`}
    >
      <div className="flex items-center">
        {renderIcon()}
      </div>

      <span className={`text-[11px] font-bold ${
        isCritical ? 'text-rose-200' : battery.charging ? 'text-emerald-300' : 'text-slate-200'
      }`}>
        {percent}%
      </span>

      {battery.charging && (
        <Zap className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
      )}

      {/* Staff mode subtle label */}
      {isStaffMode && isCritical && (
        <span className="hidden md:inline text-[9px] uppercase font-bold text-rose-300 px-1 py-0.5 rounded bg-rose-900/60">
          Low
        </span>
      )}
    </div>
  );
};
