import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import { CashierSession, ScanPoint, StationUser, Language } from '../../types';
import {
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Laptop,
  Radio,
  Wifi,
  Lock,
  Unlock,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Power,
  KeyRound,
  Eye,
  EyeOff,
  UserCheck,
  X,
  Server,
  Terminal,
  Activity,
  Layers,
  QrCode,
} from 'lucide-react';
import { BossStationPairingModal } from './BossStationPairingModal';
import { SecurityAndAuditLogsView } from './SecurityAndAuditLogsView';

interface RestaurantSecurityCenterProps {
  restaurantCode: string;
  language?: Language;
}

export const RestaurantSecurityCenter: React.FC<RestaurantSecurityCenterProps> = ({
  restaurantCode,
  language,
}) => {
  const state = restoStore.getState();
  const currentResto = restoStore.getCurrentRestaurant();
  const quota = restoStore.getCashierQuotaStatus(restaurantCode);
  const branches = restoStore.getRestaurantBranches(restaurantCode);
  const scanPoints = state.scanPoints.filter((sp) => sp.restaurantCode === restaurantCode);

  const [securitySection, setSecuritySection] = useState<'sessions' | 'audit'>('sessions');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'revoked' | 'all'>('active');
  const [sessionToRevoke, setSessionToRevoke] = useState<CashierSession | null>(null);
  const [revokeReason, setRevokeReason] = useState('Lost terminal / shift handover cleanup');
  const [isEmergencyLockdownOpen, setIsEmergencyLockdownOpen] = useState(false);
  const [emergencyConfirmText, setEmergencyConfirmText] = useState('');

  // Create Cashier Account Modal State
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [cashierName, setCashierName] = useState('');
  const [cashierUsername, setCashierUsername] = useState('');
  const [cashierPhone, setCashierPhone] = useState('+250 78');
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || 'br_rw01_main');
  const [stationNameInput, setStationNameInput] = useState('Stand 3 - Express Buffet');
  const [authMode, setAuthMode] = useState<'pin8' | 'password'>('pin8');
  const [pin8Input, setPin8Input] = useState('83920194');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Pairing Modal State
  const [selectedStationForPairing, setSelectedStationForPairing] = useState<ScanPoint | null>(null);

  // Toast State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3800);
  };

  // Sessions list
  const allSessions = restoStore.getAllCashierSessions(restaurantCode);
  const activeSessions = restoStore.getActiveCashierSessions(restaurantCode);

  const filteredSessions = allSessions.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      s.staffName.toLowerCase().includes(q) ||
      s.staffUsername.toLowerCase().includes(q) ||
      s.stationName.toLowerCase().includes(q) ||
      s.ipAddress.includes(q) ||
      s.deviceType.toLowerCase().includes(q) ||
      s.deviceModel.toLowerCase().includes(q)
    );
  });

  // Execute Revoke Session
  const handleExecuteRevoke = () => {
    if (!sessionToRevoke) return;
    const success = restoStore.revokeCashierSession(
      sessionToRevoke.id,
      revokeReason,
      'Restaurant Boss (Executive)'
    );
    if (success) {
      showToast(`Terminated cashier session for ${sessionToRevoke.staffName} on ${sessionToRevoke.stationName}. Terminal locked immediately.`);
      setSessionToRevoke(null);
    } else {
      showToast('Failed to revoke session.', 'error');
    }
  };

  // Execute Emergency Lockdown (Revoke All Sessions)
  const handleEmergencyLockdown = () => {
    if (emergencyConfirmText !== 'LOCKDOWN') {
      showToast('Please type LOCKDOWN to confirm emergency termination.', 'error');
      return;
    }
    const count = restoStore.revokeAllCashierSessions(
      restaurantCode,
      'Emergency security lockdown triggered by Restaurant Admin',
      'Restaurant Boss (Executive)'
    );
    setIsEmergencyLockdownOpen(false);
    setEmergencyConfirmText('');
    showToast(`Emergency Lockdown Activated: Remotely killed all ${count} active cashier terminals.`);
  };

  // Handle Create Cashier Account
  const handleCreateCashierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!cashierName.trim() || !cashierUsername.trim() || !cashierPhone.trim()) {
      setFormError('Name, username, and phone number are required.');
      return;
    }

    if (quota.isAtLimit) {
      setFormError(
        `Plan Quota Reached: Your ${quota.planName} plan includes ${quota.maxAllowed} cashier stations. Upgrade plan or contact Super Admin to add extra seats (+${quota.extraPriceRwf.toLocaleString()} RWF/mo).`
      );
      return;
    }

    if (authMode === 'pin8') {
      const clean = pin8Input.trim();
      if (!/^\d{8}$/.test(clean)) {
        setFormError('Security PIN must be exactly 8 numeric digits (e.g., 83920194).');
        return;
      }
    } else {
      if (!passwordInput || passwordInput.trim().length < 6) {
        setFormError('Password must be at least 6 characters long.');
        return;
      }
    }

    try {
      const branch = branches.find((b) => b.id === selectedBranchId) || branches[0];
      const stationId = `sp_${restaurantCode.toLowerCase()}_${Date.now()}`;

      restoStore.createCashierAccount(
        {
          restaurantCode,
          name: cashierName.trim(),
          username: cashierUsername.trim().toLowerCase(),
          phone: cashierPhone.trim(),
          branchId: branch ? branch.id : 'br_rw01_main',
          branchName: branch ? branch.name : 'Main Campus Dining Hall',
          stationId,
          stationName: stationNameInput.trim(),
          role: 'cashier',
          authType: authMode,
          pin: authMode === 'pin8' ? pin8Input.trim() : undefined,
          password: authMode === 'password' ? passwordInput.trim() : undefined,
        },
        'Restaurant Boss (Executive)'
      );

      setIsCreateAccountOpen(false);
      setCashierName('');
      setCashierUsername('');
      setCashierPhone('+250 78');
      showToast(`Created cashier account "@${cashierUsername}" protected by ${authMode === 'pin8' ? '8-digit PIN' : 'password'}!`);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create cashier account.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-lg transition-all ${
            toastMessage.type === 'error'
              ? 'bg-rose-950/80 border-rose-800 text-rose-300'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Security Executive KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Active Live Terminals */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Live Cashier Terminals
            </span>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          </div>
          <div className="text-2xl font-black text-white font-mono flex items-baseline gap-2">
            <span>{activeSessions.length}</span>
            <span className="text-xs text-slate-400 font-sans font-normal">terminals online</span>
          </div>
          <span className="text-[11px] text-emerald-400 font-mono block">
            Wi-Fi isolation &amp; cert guard active
          </span>
        </div>

        {/* KPI 2: Licensed Scan Point Seats */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Scan Point Quota (1:1)
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {quota.planName}
            </span>
          </div>
          <div className="text-2xl font-black text-white font-mono flex items-baseline gap-2">
            <span>{quota.activeCashiers}</span>
            <span className="text-xs text-slate-400 font-sans font-normal">/ {quota.maxAllowed} seats used</span>
          </div>
          <span className="text-[11px] text-slate-400 block truncate">
            {quota.isAtLimit ? 'Plan quota reached' : `${quota.maxAllowed - quota.activeCashiers} seat(s) available to add`}
          </span>
        </div>

        {/* KPI 3: Local Network Subnet */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Cafeteria Local LAN
            </span>
            <Wifi className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-white font-mono truncate">
            192.168.1.0/24
          </div>
          <span className="text-[11px] text-slate-400 block font-mono">
            Manager PC: 192.168.1.100:3000
          </span>
        </div>

        {/* KPI 4: Emergency Remote Kill Switch */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-900 border border-rose-900/60 flex flex-col justify-between space-y-2">
          <div>
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
              Emergency Lockdown
            </span>
            <span className="text-xs text-slate-300 block">
              Kill all cashier sessions instantly
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsEmergencyLockdownOpen(true)}
            className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Revoke All Terminals</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation: Sessions & Terminal Kill vs Forensic Audit Trail */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setSecuritySection('sessions')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            securitySection === 'sessions'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Active Cashier Sessions &amp; Terminal Controls</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-700">
            {activeSessions.length} Online
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSecuritySection('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            securitySection === 'audit'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Forensic Security Audit Trail &amp; Staff Logs</span>
        </button>
      </div>

      {securitySection === 'audit' ? (
        <SecurityAndAuditLogsView restaurantCode={restaurantCode} language={language} />
      ) : (
        /* Main Sessions & Security Console */
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        {/* Console Header & Action Toolbar */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Active Cashier Sessions &amp; Device Revocation</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                  {activeSessions.length} Online
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Remotely kill unauthorized, lost, or misplaced cashier terminals on cafeteria Wi-Fi
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsCreateAccountOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Cashier (8-Digit PIN)</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search staff, username, station, IP address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:border-emerald-500 outline-hidden"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            {[
              { id: 'active', label: `Active (${activeSessions.length})` },
              { id: 'revoked', label: 'Revoked / Terminated' },
              { id: 'all', label: `All (${allSessions.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sessions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Terminal &amp; Station</th>
                <th className="py-3 px-4">Cashier / Operator</th>
                <th className="py-3 px-4">Network &amp; Device IP</th>
                <th className="py-3 px-4">Heartbeat &amp; Status</th>
                <th className="py-3 px-4 text-right">Security Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    No cashier sessions found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => {
                  const isActive = session.status === 'active';
                  const isTabletOrPhone = session.deviceType === 'phone' || session.deviceType === 'tablet';

                  return (
                    <tr
                      key={session.id}
                      className={`transition-colors ${
                        isActive ? 'hover:bg-slate-800/40' : 'bg-slate-950/40 opacity-70'
                      }`}
                    >
                      {/* 1. Terminal & Station */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`p-2 rounded-xl border ${
                              isTabletOrPhone
                                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                                : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                            }`}
                          >
                            {isTabletOrPhone ? (
                              <Smartphone className="w-4 h-4" />
                            ) : (
                              <Laptop className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-white text-sm flex items-center gap-1.5">
                              <span>{session.stationName}</span>
                            </div>
                            <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                              <span className="capitalize">{session.deviceType.replace('_', ' ')}</span>
                              <span>·</span>
                              <span>{session.deviceModel}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Cashier / Operator */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{session.staffName}</div>
                        <div className="text-slate-400 font-mono text-[11px] flex items-center gap-1.5 mt-0.5">
                          <span>@{session.staffUsername}</span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px]">
                            8-Digit PIN Protected
                          </span>
                        </div>
                      </td>

                      {/* 3. Network & Device IP */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-emerald-400 font-bold flex items-center gap-1">
                          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{session.ipAddress}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate max-w-[200px] mt-0.5">
                          {session.deviceFingerprint}
                        </div>
                      </td>

                      {/* 4. Heartbeat & Status */}
                      <td className="py-3.5 px-4">
                        {isActive ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="text-emerald-400 font-mono font-bold text-xs">
                                Live Active
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Started {new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-rose-950 text-rose-400 border border-rose-800">
                              {session.status}
                            </span>
                            {session.revokedAt && (
                              <div className="text-[10px] text-slate-500 font-mono">
                                Revoked {new Date(session.revokedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 5. Security Action Button */}
                      <td className="py-3.5 px-4 text-right">
                        {isActive ? (
                          <button
                            type="button"
                            onClick={() => setSessionToRevoke(session)}
                            className="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-300 hover:text-white font-bold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                            title="Remotely terminate this terminal session and lockout cashier"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Revoke &amp; Logout</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const matchingStn = scanPoints.find((sp) => sp.id === session.stationId);
                              if (matchingStn) setSelectedStationForPairing(matchingStn);
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Re-Pair</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* CONFIRM REVOKE & LOGOUT MODAL */}
      {sessionToRevoke && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Revoke Terminal &amp; Forcibly Logout?</h3>
                <p className="text-xs text-rose-300">Terminal will be locked out immediately</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to kill the active cashier session for <strong>{sessionToRevoke.staffName}</strong> on <strong>{sessionToRevoke.stationName}</strong> ({sessionToRevoke.ipAddress})?
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              The cashier device will immediately clear its local authorization certificate and render the <em>Unauthorized Terminal Lockout</em> screen. Plate deductions will be halted.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Revocation Audit Reason:
              </label>
              <input
                type="text"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="e.g. Lost terminal, shift ended, or security precaution"
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:border-rose-500 outline-hidden"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSessionToRevoke(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRevoke}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Confirm Revoke &amp; Lockout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY ALL-TERMINAL LOCKDOWN MODAL */}
      {isEmergencyLockdownOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-600 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 animate-pulse">
                <Power className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Emergency All-Terminal Lockdown</h3>
                <p className="text-xs text-rose-300">Kill all active cashier terminals at once</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will immediately revoke <strong>all {activeSessions.length} active cashier sessions</strong> across all buffet stands in {currentResto?.name}. Every tablet and laptop will be forced back to the Unauthorized Terminal shield.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                Type <span className="font-mono text-rose-400">LOCKDOWN</span> to confirm:
              </label>
              <input
                type="text"
                value={emergencyConfirmText}
                onChange={(e) => setEmergencyConfirmText(e.target.value.toUpperCase())}
                placeholder="LOCKDOWN"
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-rose-700 text-xs text-rose-400 font-mono font-bold tracking-widest focus:border-rose-500 outline-hidden"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsEmergencyLockdownOpen(false);
                  setEmergencyConfirmText('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmergencyLockdown}
                disabled={emergencyConfirmText !== 'LOCKDOWN'}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Execute Emergency Lockdown</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CASHIER ACCOUNT MODAL (Protected by 8-Digit PIN or Password) */}
      {isCreateAccountOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Create Cashier / Scanner Account</h3>
                  <p className="text-xs text-slate-400">Protected by 8-Digit Security PIN or Password</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateAccountOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCashierSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Cashier Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Eric Nshimiyimana"
                    value={cashierName}
                    onChange={(e) => setCashierName(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Cashier Username</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-mono">@</span>
                    <input
                      type="text"
                      required
                      placeholder="eric_cashier"
                      value={cashierUsername}
                      onChange={(e) => setCashierUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={cashierPhone}
                    onChange={(e) => setCashierPhone(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Assigned Branch</label>
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Station Stand Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stand 1 - Main Buffet Line"
                  value={stationNameInput}
                  onChange={(e) => setStationNameInput(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                />
              </div>

              {/* AUTH PROTECTION SELECTOR: 8-DIGIT PIN vs PASSWORD */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold">Terminal Security Protection:</span>
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setAuthMode('pin8')}
                      className={`px-2.5 py-1 rounded font-bold text-xs transition-colors cursor-pointer ${
                        authMode === 'pin8' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      8-Digit PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('password')}
                      className={`px-2.5 py-1 rounded font-bold text-xs transition-colors cursor-pointer ${
                        authMode === 'password' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Password
                    </button>
                  </div>
                </div>

                {authMode === 'pin8' ? (
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-semibold">
                      8-Digit Security PIN (Strictly 8 Numeric Digits)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={8}
                        value={pin8Input}
                        onChange={(e) => setPin8Input(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="83920194"
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border border-emerald-500/50 font-mono text-base tracking-widest text-emerald-400 font-black focus:border-emerald-400 outline-hidden"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Rapid numeric touch entry ($10^8$ combination entropy). Cashier types this on touchscreen or keypad.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-semibold">
                      Alphanumeric Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full py-2.5 pl-3 pr-10 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Standard account password for web dashboard and scanner stand sign-in.
                    </p>
                  </div>
                )}
              </div>

              {/* 1:1 Quota Indicator */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
                <span>Subscription Scan Point Seats:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {quota.activeCashiers} / {quota.maxAllowed} Used
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateAccountOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Account &amp; Bind Station</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOSS STATION PAIRING MODAL */}
      {selectedStationForPairing && (
        <BossStationPairingModal
          station={selectedStationForPairing}
          onClose={() => setSelectedStationForPairing(null)}
          onUpdated={() => {
            setSelectedStationForPairing(null);
            showToast('Terminal pairing credentials refreshed.');
          }}
        />
      )}
    </div>
  );
};
