import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import {
  X,
  Server,
  Cloud,
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  HardDriveDownload,
  Shield,
  Layers,
} from 'lucide-react';

interface SyncSimulationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncSimulationDrawer: React.FC<SyncSimulationDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const state = restoStore.getState();
  const restaurant = restoStore.getCurrentRestaurant();
  const [isSyncing, setIsSyncing] = useState(false);
  const [drillSuccessMessage, setDrillSuccessMessage] = useState<string | null>(null);

  const pendingOutboxCount = state.syncOutbox.filter((item) => !item.syncedToCloud).length;

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      restoStore.syncPendingOutbox();
      setIsSyncing(false);
      setDrillSuccessMessage('Local authority pushed all pending outbox events to cloud mirror.');
      setTimeout(() => setDrillSuccessMessage(null), 3000);
    }, 800);
  };

  const handleNightlyBackupDrill = () => {
    const ts = restoStore.triggerNightlyBackup();
    setDrillSuccessMessage(`Encrypted snapshot generated & verified: ${new Date(ts).toLocaleTimeString()}`);
    setTimeout(() => setDrillSuccessMessage(null), 4000);
  };

  const handleSimulateReplacementMachineRestore = () => {
    setDrillSuccessMessage('Replacement Mini PC drill successful: Local SQLite/PostgreSQL schema restored from cloud snapshot.');
    setTimeout(() => setDrillSuccessMessage(null), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Local Authority &amp; Sync Engine
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Architecture Summary Banner */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Single Authority Architecture</span>
              </span>
              <span className="font-mono text-emerald-400 text-[11px] font-bold">
                {restaurant?.code} LOCAL SERVER
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Local server holds the authority for balances, scans, and transfers. Serving continues 100% offline without internet. Cloud acts as mirror and license issuer.
            </p>
          </div>

          {/* Network Simulator Toggle */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-300 block uppercase tracking-wider text-[11px]">
              Network Connectivity Simulator
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => restoStore.setNetworkStatus('online')}
                className={`p-2.5 rounded-xl border text-center transition-colors flex flex-col items-center gap-1.5 ${
                  state.networkStatus === 'online'
                    ? 'bg-emerald-950 border-emerald-600 text-emerald-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Wifi className="w-4 h-4 text-emerald-400" />
                <span>Online (4G/Fiber)</span>
              </button>

              <button
                onClick={() => restoStore.setNetworkStatus('unstable')}
                className={`p-2.5 rounded-xl border text-center transition-colors flex flex-col items-center gap-1.5 ${
                  state.networkStatus === 'unstable'
                    ? 'bg-amber-950 border-amber-600 text-amber-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <span>Unstable (Flapping)</span>
              </button>

              <button
                onClick={() => restoStore.setNetworkStatus('offline')}
                className={`p-2.5 rounded-xl border text-center transition-colors flex flex-col items-center gap-1.5 ${
                  state.networkStatus === 'offline'
                    ? 'bg-rose-950 border-rose-600 text-rose-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <WifiOff className="w-4 h-4 text-rose-400" />
                <span>Unplugged (Offline)</span>
              </button>
            </div>
          </div>

          {drillSuccessMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{drillSuccessMessage}</span>
            </div>
          )}

          {/* Sync Outbox Status */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-white text-sm">Database Outbox</div>
                <div className="text-[11px] text-slate-400">
                  {pendingOutboxCount} pending event{pendingOutboxCount !== 1 ? 's' : ''} queued
                </div>
              </div>

              <button
                onClick={handleManualSync}
                disabled={isSyncing || state.networkStatus === 'offline'}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Push Batch</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500">
              Last synced: {restaurant?.lastSyncAt ? new Date(restaurant.lastSyncAt).toLocaleTimeString() : 'Never'}
            </div>
          </div>

          {/* Backup & Machine Replacement Drill (Masterplan Section 6.5 & 13) */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="font-bold text-white text-sm flex items-center gap-1.5">
              <Database className="w-4 h-4 text-amber-400" />
              <span>Disaster Recovery &amp; Replacement PC Drill</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              In case of hardware failure or power surge, an encrypted local database snapshot is pushed nightly to the cloud mirror.
            </p>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={handleNightlyBackupDrill}
                className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs flex items-center justify-between transition-colors"
              >
                <span>Trigger Nightly Encrypted Backup</span>
                <HardDriveDownload className="w-4 h-4 text-emerald-400" />
              </button>

              <button
                onClick={handleSimulateReplacementMachineRestore}
                className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs flex items-center justify-between transition-colors"
              >
                <span>Simulate Machine Failure Restore</span>
                <RefreshCw className="w-4 h-4 text-amber-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
