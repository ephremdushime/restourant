import { useState, useEffect } from 'react';

export interface BatteryInfo {
  supported: boolean;
  level: number; // 0 to 1
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
}

export function useBattery(): BatteryInfo {
  const [battery, setBattery] = useState<BatteryInfo>({
    supported: false,
    level: 0.92,
    charging: false,
    chargingTime: 0,
    dischargingTime: 0,
  });

  useEffect(() => {
    let batteryManager: any = null;

    const handleUpdate = () => {
      if (batteryManager) {
        setBattery({
          supported: true,
          level: typeof batteryManager.level === 'number' ? batteryManager.level : 0.92,
          charging: Boolean(batteryManager.charging),
          chargingTime: batteryManager.chargingTime || 0,
          dischargingTime: batteryManager.dischargingTime || 0,
        });
      }
    };

    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any)
        .getBattery()
        .then((bm: any) => {
          batteryManager = bm;
          handleUpdate();
          bm.addEventListener('levelchange', handleUpdate);
          bm.addEventListener('chargingchange', handleUpdate);
          bm.addEventListener('chargingtimechange', handleUpdate);
          bm.addEventListener('dischargingtimechange', handleUpdate);
        })
        .catch(() => {
          // If rejected by security policy/permissions, maintain fallback
          setBattery({
            supported: false,
            level: 0.88,
            charging: true,
            chargingTime: 0,
            dischargingTime: 0,
          });
        });
    } else {
      // Fallback for browsers without Battery API (e.g. Safari / Firefox Desktop)
      setBattery({
        supported: false,
        level: 0.95,
        charging: true,
        chargingTime: 0,
        dischargingTime: 0,
      });
    }

    return () => {
      if (batteryManager) {
        batteryManager.removeEventListener('levelchange', handleUpdate);
        batteryManager.removeEventListener('chargingchange', handleUpdate);
        batteryManager.removeEventListener('chargingtimechange', handleUpdate);
        batteryManager.removeEventListener('dischargingtimechange', handleUpdate);
      }
    };
  }, []);

  return battery;
}
