import React, { useState } from 'react';
import { Branch, StationUser, ScanPoint, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import {
  Building2,
  Users,
  Shield,
  Key,
  Lock,
  Unlock,
  Trash2,
  Edit,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Clock,
  Smartphone,
  Phone,
  Eye,
  EyeOff,
  Activity,
  UserCheck,
  UserX,
  MapPin,
  RefreshCw,
  QrCode,
  Laptop,
  Wifi,
  ShieldCheck,
} from 'lucide-react';
import { BossStationPairingModal } from './BossStationPairingModal';

interface BranchesAndStationsManagerProps {
  restaurantCode: string;
  language?: Language;
}

export const BranchesAndStationsManager: React.FC<BranchesAndStationsManagerProps> = ({
  restaurantCode,
  language,
}) => {
  const t = translations[language || 'en'];
  const state = restoStore.getState();
  const currentResto = restoStore.getCurrentRestaurant();
  const license = restoStore.getRestaurantLicense(restaurantCode);

  const branches = restoStore.getRestaurantBranches(restaurantCode);
  const stationUsers = restoStore.getRestaurantStationUsers(restaurantCode);
  const scanPoints = state.scanPoints.filter((sp) => sp.restaurantCode === restaurantCode);
  const quota = restoStore.getCashierQuotaStatus(restaurantCode);

  // Tab: 'stations' | 'station_users' | 'branches' | 'activity'
  const [activeTab, setActiveTab] = useState<'stations' | 'station_users' | 'branches' | 'activity'>('stations');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');

  // Add Branch Modal
  const [isAddBranchModalOpen, setIsAddBranchModalOpen] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('+250 78');
  const [branchManager, setBranchManager] = useState('');

  // Add Physical Station Modal
  const [isAddStationModalOpen, setIsAddStationModalOpen] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [newStationBranchId, setNewStationBranchId] = useState(branches[0]?.id || '');
  const [newStationType, setNewStationType] = useState<'meal_scanner' | 'reception_pos' | 'turnstile'>('meal_scanner');
  const [newStationDeviceType, setNewStationDeviceType] = useState<'tablet' | 'laptop_scanner' | 'phone' | 'pos_terminal'>('tablet');

  // Add Station User Modal
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [userFullName, setUserFullName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userPhone, setUserPhone] = useState('+250 78');
  const [userRole, setUserRole] = useState<'scanner' | 'reception' | 'cashier' | 'stand_staff'>('stand_staff');
  const [userBranchId, setUserBranchId] = useState<string>(branches[0]?.id || '');
  const [userStationId, setUserStationId] = useState<string>(scanPoints[0]?.id || '');
  const [userStationName, setUserStationName] = useState(scanPoints[0]?.name || 'Stand 1 - Main Buffet');
  const [userPassword, setUserPassword] = useState('');
  const [userPin, setUserPin] = useState('');
  const [showUserPassword, setShowUserPassword] = useState(false);

  // Reset Password Modal
  const [userToReset, setUserToReset] = useState<StationUser | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetPinInput, setResetPinInput] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Delete User Confirmation
  const [userToDelete, setUserToDelete] = useState<StationUser | null>(null);

  // Station Pairing Modal (Boss Screen)
  const [selectedStationForPairing, setSelectedStationForPairing] = useState<ScanPoint | null>(null);
  const [selectedUserForPairing, setSelectedUserForPairing] = useState<StationUser | null>(null);

  // Toast feedback
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedbackToast({ type, message });
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  // Filtered station users
  const filteredUsers = stationUsers.filter((u) => {
    if (selectedBranchFilter !== 'all' && u.branchId !== selectedBranchFilter) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.phone.includes(q) ||
      (u.stationName || '').toLowerCase().includes(q) ||
      u.branchName.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  // Handle Add Branch
  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim() || !branchCode.trim()) {
      showToast('Please provide both Branch Name and Code', 'error');
      return;
    }

    restoStore.addBranch(
      {
        restaurantCode,
        name: branchName.trim(),
        code: branchCode.trim().toUpperCase(),
        address: branchAddress.trim() || 'Kigali, Rwanda',
        phone: branchPhone.trim(),
        managerName: branchManager.trim() || 'Branch Supervisor',
        status: 'active',
      },
      'Restaurant Boss (Executive)'
    );

    setIsAddBranchModalOpen(false);
    setBranchName('');
    setBranchCode('');
    setBranchAddress('');
    setBranchManager('');
    showToast(`Branch "${branchName}" created successfully!`);
  };

  // Handle Add Scanner Station (Physical Workstation)
  const handleCreateStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationName.trim()) {
      showToast('Please provide a Station Name', 'error');
      return;
    }

    try {
      const branch = branches.find((b) => b.id === newStationBranchId) || branches[0];
      const created = restoStore.addScanPoint(
        {
          restaurantCode,
          branchId: branch?.id || 'br_main',
          branchName: branch?.name || 'Main Dining Hall',
          name: newStationName.trim(),
          stationType: newStationType,
          deviceType: newStationDeviceType,
        },
        'Restaurant Boss (Executive)'
      );

      setIsAddStationModalOpen(false);
      setNewStationName('');
      setSelectedStationForPairing(created);
      showToast(`Scanner Station "${created.name}" created! Pairing key generated.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to create scanner station', 'error');
    }
  };

  // Handle Add Station User (Staff Operator)
  const handleCreateStationUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFullName.trim() || !userUsername.trim() || userPassword.trim().length < 12 || !/^\d{6,12}$/.test(userPin.trim())) {
      showToast('Enter a username, a password of at least 12 characters, and a 6–12 digit POS PIN.', 'error');
      return;
    }

    try {
      const branch = branches.find((b) => b.id === userBranchId) || branches[0];
      const chosenStation = scanPoints.find((sp) => sp.id === userStationId) || scanPoints[0];

      restoStore.addStationUser(
        {
          restaurantCode,
          branchId: branch ? branch.id : 'br_main',
          branchName: branch ? branch.name : 'Main Campus Dining Hall',
          stationId: chosenStation ? chosenStation.id : undefined,
          stationName: chosenStation ? chosenStation.name : userStationName.trim(),
          name: userFullName.trim(),
          username: userUsername.trim().toLowerCase(),
          phone: userPhone.trim(),
          role: userRole,
          status: 'active',
          passwordHash: userPassword,
          pin: userPin.trim(),
          lastLoginAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        },
        'Restaurant Boss (Executive)'
      );

      setIsAddUserModalOpen(false);
      setUserFullName('');
      setUserUsername('');
      setUserPassword('');
      setUserPin('');
      showToast(`Station operator account "@${userUsername}" created with active credentials!`);
    } catch (err: any) {
      showToast(err.message || 'Failed to create operator account', 'error');
    }
  };

  // Handle Reset Credentials
  const handleExecutePasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToReset) return;
    if (resetPasswordInput.trim().length < 12 || (resetPinInput.trim() && !/^\d{6,12}$/.test(resetPinInput.trim()))) {
      showToast('New password must be at least 12 characters; optional POS PIN must contain 6–12 digits.', 'error');
      return;
    }

    const success = restoStore.resetStationUserPassword(
      userToReset.id,
      resetPasswordInput.trim(),
      resetPinInput.trim() || undefined,
      'Restaurant Boss (Executive)'
    );

    if (success) {
      showToast(`Updated login password & POS PIN for "${userToReset.name}" (@${userToReset.username})`);
      setUserToReset(null);
      setResetPasswordInput('');
      setResetPinInput('1234');
    } else {
      showToast('Failed to reset credentials', 'error');
    }
  };

  // Handle Toggle Block / Unblock
  const handleToggleUserStatus = (user: StationUser) => {
    const nextStatus = user.status === 'active' ? 'blocked' : 'active';
    const success = restoStore.setStationUserStatus(user.id, nextStatus, 'Restaurant Boss (Executive)');
    if (success) {
      showToast(
        nextStatus === 'blocked'
          ? `Blocked "${user.name}" (@${user.username}). Station login is disabled.`
          : `Unblocked "${user.name}". Station access is restored.`
      );
    }
  };

  // Handle Station User Deactivation
  const handleExecuteDeleteUser = () => {
    if (!userToDelete) return;
    const success = restoStore.deleteStationUser(userToDelete.id, restaurantCode, 'Restaurant Boss (Executive)');
    if (success) {
      showToast(`Deactivated station user account "${userToDelete.name}" (@${userToDelete.username})`);
      setUserToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {feedbackToast && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-xs font-semibold shadow-2xl transition-all ${
            feedbackToast.type === 'success'
              ? 'bg-emerald-950 border border-emerald-700 text-emerald-200'
              : 'bg-rose-950 border border-rose-700 text-rose-200'
          }`}
        >
          {feedbackToast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{feedbackToast.message}</span>
        </div>
      )}

      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Branches, Scanning Points &amp; Station User Accounts</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage multi-branch cafeteria locations, assign scanner stations to staff users, and control operator security credentials for {currentResto?.name}.
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('stations')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'stations'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Scanner Stations</span>
            <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-black/40 text-emerald-200">
              {scanPoints.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('station_users')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'station_users'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Station Operators</span>
            <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-black/40 text-emerald-200">
              {stationUsers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('branches')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'branches'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Branches</span>
            <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-black/40 text-emerald-200">
              {branches.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Live Activity</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PHYSICAL SCANNER STATIONS & PAIRING CODES */}
      {activeTab === 'stations' && (() => {
        const quota = restoStore.getCashierQuotaStatus(restaurantCode);
        return (
          <div className="space-y-4">
            {/* Quota Banner */}
            <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              quota.isAtLimit ? 'bg-amber-950/30 border-amber-800/60' : 'bg-slate-900 border-slate-800'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${
                  quota.isAtLimit
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">Physical Stations &amp; Device Pairing</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      Hardware Workstations
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {quota.planName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Physical Stations: <strong className="text-white">{scanPoints.length}</strong> / {quota.maxAllowed} Licensed
                    · Devices are paired once via pairing code or QR. Operators sign in individually on paired devices.
                  </p>
                </div>
              </div>

              {quota.isAtLimit && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-amber-300 bg-amber-900/40 px-2.5 py-1 rounded-lg border border-amber-700/60 font-bold">
                    Station Quota Full ({scanPoints.length}/{quota.maxAllowed})
                  </span>
                </div>
              )}
            </div>

            {/* Action Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <div className="relative w-full">
                  <input
                    type="text"
                    placeholder="Search stations, branches, device models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:border-emerald-500 outline-hidden"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAddStationModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-md shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add Scanner Station</span>
              </button>
            </div>

            {/* Stations Table */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Station / Location</th>
                    <th className="py-3 px-4">Station Type</th>
                    <th className="py-3 px-4">Hardware Device</th>
                    <th className="py-3 px-4">Pairing Key</th>
                    <th className="py-3 px-4">Device Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {scanPoints.map((station) => (
                    <tr key={station.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white flex items-center gap-2">
                          <Radio className="w-4 h-4 text-emerald-400" />
                          <span>{station.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {station.branchName || 'Main Campus'} · ID: <code className="font-mono text-[10px] text-slate-500">{station.id}</code>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                          {station.stationType === 'reception_pos' ? 'Reception / POS' : station.stationType === 'turnstile' ? 'Turnstile Scanner' : 'Meal Scanner'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-white font-medium flex items-center gap-1.5">
                          {station.deviceType === 'laptop_scanner' ? <Laptop className="w-3.5 h-3.5 text-blue-400" /> : <Smartphone className="w-3.5 h-3.5 text-emerald-400" />}
                          <span>{station.deviceModel || 'Web Scanner Terminal'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {station.pairedDeviceFingerprint || 'No device paired yet'}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <span className="px-2 py-0.5 rounded bg-slate-950 text-amber-300 border border-slate-800 font-bold text-[11px]">
                          {station.pairingKey || station.pairingCode || 'PAIR-0001'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            station.isPaired !== false
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}
                        >
                          {station.isPaired !== false ? 'Paired & Active' : 'Unpaired'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStationForPairing(station);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1"
                          title="Show Station Pairing QR code & key"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Pair Device</span>
                        </button>

                        {station.isPaired !== false && (
                          <button
                            type="button"
                            onClick={() => {
                              restoStore.revokeTerminalPairing(station.id, 'Restaurant Boss');
                              showToast(`Revoked pairing for "${station.name}". Device locked.`);
                            }}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 border border-slate-700 hover:border-rose-800 text-slate-300 hover:text-rose-300 font-semibold text-xs transition-colors cursor-pointer"
                            title="Revoke device pairing"
                          >
                            Revoke
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete scanner station "${station.name}"?`)) {
                              restoStore.deleteScanPoint(station.id);
                              showToast(`Deleted scanner station "${station.name}".`);
                            }
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 border border-slate-700 hover:border-rose-800 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete station"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {scanPoints.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        No physical scanner stations registered yet. Click "Add Scanner Station" to provision one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* TAB 1: STATION USERS & SECURITY CONTROLS */}
      {activeTab === 'station_users' && (() => {
        const quota = restoStore.getCashierQuotaStatus(restaurantCode);
        return (
          <div className="space-y-4">
            {/* Cashier & Scan Point Quota Banner (1 Cashier = 1 Scan Point) */}
            <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              quota.isAtLimit
                ? 'bg-amber-950/30 border-amber-800/60'
                : 'bg-slate-900 border-slate-800'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${
                  quota.isAtLimit
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">Cashier Stations &amp; Quota</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      1 Cashier = 1 Scan Point
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {quota.planName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Active Cashier Stations: <strong className="text-white">{quota.activeCashiers}</strong> / {quota.maxAllowed} Licensed
                    {quota.isAtLimit ? ' · Plan quota reached. Extra scan points: +15,000 RwF/mo via Super Admin.' : ' · Quota within active subscription.'}
                  </p>
                </div>
              </div>

              {quota.isAtLimit && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-amber-300 bg-amber-900/40 px-2.5 py-1 rounded-lg border border-amber-700/60 font-bold">
                    Quota Full ({quota.activeCashiers}/{quota.maxAllowed})
                  </span>
                </div>
              )}
            </div>

            {/* Action Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <div className="relative w-full">
                  <input
                    type="text"
                    placeholder="Search operator, username, station, branch..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:border-emerald-500 outline-hidden"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>

                {/* Branch Filter */}
                <select
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  className="py-2 px-3 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-300 focus:border-emerald-500 outline-hidden whitespace-nowrap"
                >
                  <option value="all">All Branches ({stationUsers.length})</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setIsAddUserModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-md shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Create Station User Account</span>
              </button>
            </div>

            {/* Station Users Table */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Operator / Staff</th>
                    <th className="py-3 px-4">Role &amp; Credentials</th>
                    <th className="py-3 px-4">Branch &amp; Station</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Activity</th>
                    <th className="py-3 px-4 text-right">Security Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                        No station user accounts matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            <span>{user.name}</span>
                          </div>
                          <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                            @{user.username} · {user.phone}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1 w-fit">
                            <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Scanner Operator</span>
                          </span>
                          <div className="text-[10px] text-emerald-400 mt-1">
                            Credentials are securely stored and never displayed.
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-200 flex items-center gap-1.5">
                            <span>{user.stationName}</span>
                            {(() => {
                              const stn = scanPoints.find((sp) => sp.id === user.stationId);
                              const isPaired = stn ? stn.isPaired !== false : false;
                              return (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                                    isPaired
                                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                                  }`}
                                >
                                  {isPaired ? 'Paired' : 'Unpaired'}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>{user.branchName}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              user.status === 'active'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {user.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                          <div>{new Date(user.lastActiveAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(user.lastActiveAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {/* Pair Terminal (QR & Key) */}
                          <button
                            type="button"
                            onClick={() => {
                              const matchingStation = scanPoints.find((sp) => sp.id === user.stationId) || {
                                id: user.stationId || `sp_${user.id}`,
                                restaurantCode,
                                branchId: user.branchId,
                                branchName: user.branchName,
                                name: user.stationName,
                                pairingCode: user.stationId ? `PAIR-${user.stationId.slice(-4).toUpperCase()}` : 'PAIR-0001',
                                pairingKey: user.stationId ? `PAIR-${user.stationId.slice(-4).toUpperCase()}` : 'PAIR-0001',
                                isPaired: true,
                                status: 'active',
                                lastHeartbeat: new Date().toISOString(),
                                assignedStaffUserId: user.id,
                                assignedStaffUserName: user.name,
                              };
                              setSelectedStationForPairing(matchingStation as ScanPoint);
                              setSelectedUserForPairing(user);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1"
                            title="Show Station Pairing QR code & 6-char key for cashier device"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Pair Terminal</span>
                          </button>
                        {/* Reset Password */}
                        <button
                          type="button"
                          onClick={() => {
                            setUserToReset(user);
                            setResetPasswordInput('');
                            setResetPinInput('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1"
                          title="Reset operator login password or PIN"
                        >
                          <Key className="w-3.5 h-3.5" />
                          <span>Reset Creds</span>
                        </button>

                        {/* Block / Unblock */}
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(user)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                            user.status === 'blocked'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900'
                              : 'bg-rose-950 text-rose-400 border border-rose-800 hover:bg-rose-900'
                          }`}
                          title={user.status === 'blocked' ? 'Unblock operator access' : 'Block operator login'}
                        >
                          {user.status === 'blocked' ? (
                            <>
                              <Unlock className="w-3 h-3" />
                              <span>Unblock</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3" />
                              <span>Block</span>
                            </>
                          )}
                        </button>

                        {/* Deactivate User */}
                        <button
                          type="button"
                          onClick={() => setUserToDelete(user)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer inline-flex items-center"
                          title="Deactivate user account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ); })()}

      {/* TAB 2: MULTI-BRANCH HIERARCHY */}
      {activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">Configured Restaurant Branches</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every branch operates its own buffet stations, dining windows, and cashier desks under your central executive management.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsAddBranchModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-md shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Branch</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map((branch) => {
              const branchUsers = stationUsers.filter((u) => u.branchId === branch.id);
              const branchStations = scanPoints.filter((sp) => sp.branchId === branch.id);
              const branchScans = state.scanEvents.filter(
                (ev) =>
                  ev.restaurantCode === restaurantCode &&
                  (ev.branchId === branch.id || branchStations.some((sp) => sp.id === ev.scanPointId)) &&
                  (ev.status === 'approved' || ev.status === 'warning_confirmed')
              );

              return (
                <div
                  key={branch.id}
                  className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 relative overflow-hidden shadow-xl"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          {branch.code}
                        </span>
                        <span className="text-xs font-bold text-white">{branch.name}</span>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-1 mt-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{branch.address}</span>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {branch.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-center">
                    <div>
                      <div className="text-slate-500 text-[10px] uppercase font-bold">Stations</div>
                      <div className="text-base font-black font-mono text-white mt-0.5">
                        {branchStations.length || 1}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[10px] uppercase font-bold">Staff</div>
                      <div className="text-base font-black font-mono text-emerald-400 mt-0.5">
                        {branchUsers.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[10px] uppercase font-bold">Servings</div>
                      <div className="text-base font-black font-mono text-cyan-400 mt-0.5">
                        {branchScans.length}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1 font-mono border-t border-slate-800 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-sans">Manager:</span>
                      <span className="text-slate-200">{branch.managerName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-sans">Phone:</span>
                      <span className="text-slate-300">{branch.phone}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: LIVE BRANCH ACTIVITY STREAM */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <h3 className="text-sm font-bold text-white">Live Activity Across All Branches &amp; Stations</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time audit stream of meals served, provisional customer registrations, and cashier recharges processed by station operators.
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Station / Branch</th>
                  <th className="py-3 px-4">Operator</th>
                  <th className="py-3 px-4">Patron / Member</th>
                  <th className="py-3 px-4">Event Status</th>
                  <th className="py-3 px-4 text-right">Plates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                {state.scanEvents
                  .filter((ev) => ev.restaurantCode === restaurantCode)
                  .slice(0, 20)
                  .map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-4 text-slate-400">
                        {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-4 font-sans">
                        <div className="font-bold text-white">{ev.scanPointName}</div>
                        <div className="text-[10px] text-slate-400">{ev.branchName || 'Main Campus Dining Hall'}</div>
                      </td>
                      <td className="py-2.5 px-4 font-sans text-slate-300">
                        {ev.staffName || 'Station Operator'}
                      </td>
                      <td className="py-2.5 px-4 font-sans">
                        <span className="font-medium text-white">{ev.customerName}</span>
                        <span className="text-slate-500 ml-1">#{ev.memberNo}</span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            ev.status === 'approved'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : ev.status === 'warning_confirmed'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {ev.status}
                        </span>
                        {ev.isGracePlate && (
                          <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] bg-amber-900/60 text-amber-300">
                            GRACE #{ev.gracePlateNumber}
                          </span>
                        )}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-bold tabular-nums ${
                        ev.platesDeducted > 0 ? 'text-rose-400' : 'text-slate-500'
                      }`}>
                        {ev.platesDeducted > 0 ? `-${ev.platesDeducted}` : '0'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD BRANCH */}
      {isAddBranchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateBranch}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <span>Create New Restaurant Branch</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddBranchModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-slate-300 font-semibold block mb-1">Branch Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. East Wing Science Cafeteria"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Branch Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EAST"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono font-bold focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Physical Address *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Science Complex Block C, Kigali"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Branch Phone</label>
                  <input
                    type="text"
                    value={branchPhone}
                    onChange={(e) => setBranchPhone(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Branch Supervisor / Manager</label>
                  <input
                    type="text"
                    placeholder="e.g. Jean-Paul Habimana"
                    value={branchManager}
                    onChange={(e) => setBranchManager(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddBranchModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                Save &amp; Activate Branch
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADD PHYSICAL SCANNER STATION */}
      {isAddStationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateStation}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-400" />
                <span>Register Physical Scanner Station</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddStationModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Station Name / Location *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dining Hall Stand 2, Main Buffet Line, Gate 1"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Assigned Branch *</label>
                  <select
                    value={newStationBranchId}
                    onChange={(e) => setNewStationBranchId(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Station Capability / Type</label>
                  <select
                    value={newStationType}
                    onChange={(e: any) => setNewStationType(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  >
                    <option value="meal_scanner">Meal Scanner (Buffet / Counter)</option>
                    <option value="reception_pos">Reception &amp; POS (Cashier / Reg)</option>
                    <option value="turnstile">Turnstile / Gate Scanner</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Device Hardware Profile</label>
                <select
                  value={newStationDeviceType}
                  onChange={(e: any) => setNewStationDeviceType(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                >
                  <option value="tablet">Android / iPad Tablet (Kiosk)</option>
                  <option value="laptop_scanner">Laptop / Desktop PC + USB Scanner</option>
                  <option value="phone">Staff Mobile Phone</option>
                  <option value="pos_terminal">Dedicated POS Smart Terminal</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-slate-400 text-[11px] leading-relaxed">
                <p className="font-semibold text-slate-300">How 2-Stage Station Pairing works:</p>
                <p>
                  1. Creating this station registers a physical point and generates a secure <strong>Pairing Key</strong> and <strong>Pairing QR Code</strong>.
                </p>
                <p>
                  2. Open the scanner station portal on the physical tablet or laptop once to pair it.
                </p>
                <p>
                  3. Multiple authorized operators (e.g. Jean, Bosco) can sign in on the paired station with their personal credentials.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddStationModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                Register Station &amp; Get Pairing Key
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADD STATION OPERATOR */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateStationUser}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <span>Create Station Operator Account</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddUserModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alice Mukantwali"
                    value={userFullName}
                    onChange={(e) => setUserFullName(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">System Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. alice.stand1"
                    value={userUsername}
                    onChange={(e) => setUserUsername(e.target.value.toLowerCase().replace(/\s+/g, '.'))}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Assigned Branch *</label>
                  <select
                    value={userBranchId}
                    onChange={(e) => setUserBranchId(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Primary Physical Station</label>
                  <select
                    value={userStationId}
                    onChange={(e) => {
                      setUserStationId(e.target.value);
                      const stn = scanPoints.find((sp) => sp.id === e.target.value);
                      if (stn) setUserStationName(stn.name);
                    }}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  >
                    {scanPoints.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name} ({sp.branchName})
                      </option>
                    ))}
                    {scanPoints.length === 0 && (
                      <option value="">Main Campus Station</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Station Operator Security Model Banner */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Personal Operator Credentials</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Named Human Operator
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Operators log in to paired workstations using their username and personal 6–12 digit PIN. Every meal deduction, cash top-up, or registration is attributed to this operator for precise auditing.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1 flex items-center justify-between">
                    <span>Initial Password *</span>
                    <button
                      type="button"
                      onClick={() => setShowUserPassword(!showUserPassword)}
                      className="text-slate-500 hover:text-white"
                    >
                      {showUserPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </label>
                  <input
                    type={showUserPassword ? 'text' : 'password'}
                    required
                    minLength={12}
                    placeholder="At least 12 characters"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    6–12 Digit POS PIN *
                  </label>
                  <input
                    type="password"
                    maxLength={12}
                    minLength={6}
                    pattern="[0-9]{6,12}"
                    required
                    placeholder="6–12 digits (e.g. 123456)"
                    value={userPin}
                    onChange={(e) => setUserPin(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold tracking-widest text-center focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddUserModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                Create Operator Account
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: RESET PASSWORD & PIN */}
      {userToReset && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleExecutePasswordReset}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <span>Reset Operator Credentials</span>
              </h3>
              <button
                type="button"
                onClick={() => setUserToReset(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div className="text-slate-400">Station Operator:</div>
              <div className="font-bold text-white text-sm">{userToReset.name}</div>
              <div className="text-slate-500 font-mono mt-0.5">@{userToReset.username} · {userToReset.stationName}</div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1 flex items-center justify-between">
                  <span>New Login Password *</span>
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="text-slate-500 hover:text-white"
                  >
                    {showResetPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </label>
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  required
                  minLength={12}
                  placeholder="At least 12 characters"
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:border-amber-500 outline-hidden"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  New 6–12 Digit POS PIN (Optional)
                </label>
                <input
                  type="password"
                  maxLength={12}
                  minLength={6}
                  pattern="[0-9]{6,12}"
                  placeholder="Optional 6–12 digits"
                  value={resetPinInput}
                  onChange={(e) => setResetPinInput(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono font-bold tracking-widest text-center focus:border-amber-500 outline-hidden"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setUserToReset(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                Confirm &amp; Update Credentials
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: DELETE USER CONFIRMATION */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white">Deactivate Account?</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to deactivate operator account <strong>"{userToDelete.name}" (@{userToDelete.username})</strong>?
              They will immediately lose access to scanner stands and reception portals. The account and audit history will be retained.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDeleteUser}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                Deactivate Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOSS STATION PAIRING CREDENTIALS MODAL */}
      {selectedStationForPairing && (
        <BossStationPairingModal
          station={selectedStationForPairing}
          assignedUser={selectedUserForPairing || undefined}
          onClose={() => {
            setSelectedStationForPairing(null);
            setSelectedUserForPairing(null);
          }}
          onUpdated={() => {
            setSelectedStationForPairing(null);
            setSelectedUserForPairing(null);
            showToast('Station pairing configuration updated.');
          }}
        />
      )}
    </div>
  );
};
