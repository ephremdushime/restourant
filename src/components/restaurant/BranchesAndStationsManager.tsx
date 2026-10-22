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
  Coins,
  Printer,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { ShiftHandoverModal } from '../scanner/ShiftHandoverModal';

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

  // Tab: 'branches' | 'station_users' | 'activity' | 'shifts'
  const [activeTab, setActiveTab] = useState<'station_users' | 'branches' | 'activity' | 'shifts'>('station_users');
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [selectedShiftStationId, setSelectedShiftStationId] = useState<string | undefined>(undefined);

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

  // Add Station User Modal
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [userFullName, setUserFullName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userPhone, setUserPhone] = useState('+250 78');
  const [userRole, setUserRole] = useState<'scanner' | 'reception' | 'cashier' | 'stand_staff'>('stand_staff');
  const [userBranchId, setUserBranchId] = useState<string>(branches[0]?.id || '');
  const [userStationName, setUserStationName] = useState('Stand 1 - Main Buffet');
  const [userPassword, setUserPassword] = useState('');
  const [userPin, setUserPin] = useState('1234');
  const [showUserPassword, setShowUserPassword] = useState(false);

  // Reset Password Modal
  const [userToReset, setUserToReset] = useState<StationUser | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetPinInput, setResetPinInput] = useState('1234');
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Delete User Confirmation
  const [userToDelete, setUserToDelete] = useState<StationUser | null>(null);

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
      u.stationName.toLowerCase().includes(q) ||
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

  // Handle Add Station User
  const handleCreateStationUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFullName.trim() || !userUsername.trim() || !userPassword.trim()) {
      showToast('Please fill out all required credentials', 'error');
      return;
    }

    const branch = branches.find((b) => b.id === userBranchId) || branches[0];
    const stationId = `sp_${restaurantCode.toLowerCase()}_${Date.now()}`;

    restoStore.addStationUser(
      {
        restaurantCode,
        branchId: branch ? branch.id : 'br_main',
        branchName: branch ? branch.name : 'Main Campus Dining Hall',
        stationId,
        stationName: userStationName.trim(),
        name: userFullName.trim(),
        username: userUsername.trim().toLowerCase(),
        phone: userPhone.trim(),
        role: userRole,
        status: 'active',
        passwordHash: userPassword,
        pin: userPin.trim() || '1234',
        lastLoginAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
      'Restaurant Boss (Executive)'
    );

    setIsAddUserModalOpen(false);
    setUserFullName('');
    setUserUsername('');
    setUserPassword('');
    setUserPin('1234');
    showToast(`Station operator account "@${userUsername}" created with active credentials!`);
  };

  // Handle Reset Credentials
  const handleExecutePasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToReset) return;
    if (!resetPasswordInput.trim()) {
      showToast('New password cannot be empty', 'error');
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

  // Handle Delete Station User
  const handleExecuteDeleteUser = () => {
    if (!userToDelete) return;
    const success = restoStore.deleteStationUser(userToDelete.id, restaurantCode, 'Restaurant Boss (Executive)');
    if (success) {
      showToast(`Deleted station user account "${userToDelete.name}" (@${userToDelete.username})`);
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

          <button
            type="button"
            onClick={() => setActiveTab('shifts')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'shifts'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>{t.shifts?.shiftAuditTab || 'Cashier Shifts & Audits'}</span>
            <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-black/40 text-emerald-200">
              {restoStore.getShiftHistory(restaurantCode).length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: STATION USERS & SECURITY CONTROLS */}
      {activeTab === 'station_users' && (
        <div className="space-y-4">
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
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-800 text-slate-200 border border-slate-700">
                          {user.role.replace('_', ' ')}
                        </span>
                        <div className="text-[10px] font-mono text-slate-500 mt-1">
                          POS PIN: <strong className="text-slate-300">{user.pin}</strong>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">{user.stationName}</div>
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
                        {/* Reset Password */}
                        <button
                          type="button"
                          onClick={() => {
                            setUserToReset(user);
                            setResetPasswordInput('');
                            setResetPinInput(user.pin);
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

                        {/* Delete User */}
                        <button
                          type="button"
                          onClick={() => setUserToDelete(user)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer inline-flex items-center"
                          title="Delete user account"
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
      )}

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

      {/* TAB 4: CASHIER SHIFTS & DAILY RECONCILIATION AUDITS */}
      {activeTab === 'shifts' && (() => {
        const shifts = restoStore.getShiftHistory(restaurantCode);
        const openShifts = shifts.filter((s) => s.status === 'open');
        const closedShifts = shifts.filter((s) => s.status === 'closed');
        const totalCashHandled = shifts.reduce((sum, s) => sum + (s.closingCashRwf || (s.openingCashRwf + s.cashCollectedRwf)), 0);
        const totalPlatesServedInShifts = shifts.reduce((sum, s) => sum + s.platesServedCount, 0);
        const totalVariance = shifts.reduce((sum, s) => sum + (s.cashVarianceRwf || 0), 0);

        return (
          <div className="space-y-5">
            {/* Action Bar & Summary KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Active Shifts
                </div>
                <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                  {openShifts.length} <span className="text-xs font-normal text-slate-400">operating</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Currently running drawers
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Total Cash Reconciled
                </div>
                <div className="text-2xl font-black text-white font-mono mt-1">
                  {totalCashHandled.toLocaleString()} <span className="text-xs font-normal text-slate-400">RWF</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Drawer floats + cash top-ups
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Plates Served in Shifts
                </div>
                <div className="text-2xl font-black text-white font-mono mt-1">
                  {totalPlatesServedInShifts.toLocaleString()} <span className="text-xs font-normal text-slate-400">meals</span>
                </div>
                <div className="text-[11px] text-emerald-400 mt-0.5">
                  Across all verified cashier shifts
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  Net Drawer Variance
                </div>
                <div className={`text-2xl font-black font-mono mt-1 ${
                  totalVariance === 0 ? 'text-emerald-400' : totalVariance > 0 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {totalVariance >= 0 ? `+${totalVariance.toLocaleString()}` : totalVariance.toLocaleString()} <span className="text-xs font-normal text-slate-400">RWF</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {totalVariance === 0 ? 'Exact drawer match' : totalVariance > 0 ? 'Net drawer overage' : 'Net drawer shortage'}
                </div>
              </div>
            </div>

            {/* Shift Reconciliations Table */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    <span>{t.shifts?.title || 'Cashier Shift Handover & Daily Reconciliation'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Physical cash counts, float seeds, expected intakes, plate counts, and operator sign-offs.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedShiftStationId(scanPoints[0]?.id || 'sp_1');
                      setIsShiftModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Open / Reconcile Shift</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-3.5">Shift ID & Status</th>
                      <th className="py-3 px-3.5">Station & Branch</th>
                      <th className="py-3 px-3.5">Operator</th>
                      <th className="py-3 px-3.5 text-right">Opening Float</th>
                      <th className="py-3 px-3.5 text-right">Cash Intake</th>
                      <th className="py-3 px-3.5 text-right">Expected Drawer</th>
                      <th className="py-3 px-3.5 text-right">Counted Cash</th>
                      <th className="py-3 px-3.5 text-right">Variance</th>
                      <th className="py-3 px-3.5 text-center">Plates</th>
                      <th className="py-3 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
                    {shifts.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-500 font-sans">
                          No shifts recorded yet for this restaurant.
                        </td>
                      </tr>
                    ) : (
                      shifts.map((s) => {
                        const expected = s.expectedCashRwf ?? (s.openingCashRwf + s.cashCollectedRwf);
                        const counted = s.closingCashRwf ?? expected;
                        const variance = s.cashVarianceRwf || 0;

                        return (
                          <tr key={s.id} className="hover:bg-slate-900/40">
                            <td className="py-3 px-3.5">
                              <div className="font-bold text-white">#{s.id.slice(-6)}</div>
                              <span
                                className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-sans font-bold uppercase mt-0.5 ${
                                  s.status === 'open'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {s.status === 'open' ? 'Active' : 'Closed'}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 font-sans">
                              <div className="font-medium text-white">{s.stationName}</div>
                              <div className="text-[10px] text-slate-400">{s.branchName}</div>
                            </td>
                            <td className="py-3 px-3.5 font-sans">
                              <div className="font-semibold text-slate-200">{s.operatorName}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                Started: {new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td className="py-3 px-3.5 text-right text-slate-300">
                              {s.openingCashRwf.toLocaleString()}
                            </td>
                            <td className="py-3 px-3.5 text-right text-emerald-400 font-bold">
                              +{s.cashCollectedRwf.toLocaleString()}
                            </td>
                            <td className="py-3 px-3.5 text-right text-amber-300 font-bold">
                              {expected.toLocaleString()}
                            </td>
                            <td className="py-3 px-3.5 text-right text-white font-bold">
                              {counted.toLocaleString()}
                            </td>
                            <td className="py-3 px-3.5 text-right">
                              <span
                                className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                  variance === 0
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                                    : variance > 0
                                    ? 'bg-amber-950/80 text-amber-400 border border-amber-800'
                                    : 'bg-rose-950/80 text-rose-400 border border-rose-800'
                                }`}
                              >
                                {variance >= 0 ? `+${variance.toLocaleString()}` : variance.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-center font-bold text-white">
                              {s.platesServedCount}
                            </td>
                            <td className="py-3 px-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedShiftStationId(s.stationId);
                                  setIsShiftModalOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-sans font-semibold transition-colors cursor-pointer"
                              >
                                {s.status === 'open' ? 'Reconcile' : 'Audit'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

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
                  <label className="text-slate-300 font-semibold block mb-1">Role &amp; Permissions *</label>
                  <select
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value as any)}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  >
                    <option value="stand_staff">Scanner Stand Operator</option>
                    <option value="reception">Reception / Onboarding Desk</option>
                    <option value="cashier">Cashier &amp; Top-Up Desk</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Station / Stand Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stand 1 - Main Buffet Line"
                  value={userStationName}
                  onChange={(e) => setUserStationName(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                />
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
                    placeholder="Min 6 characters"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    4-Digit Tablet PIN *
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    placeholder="1234"
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
                Create Account &amp; Provision Station
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
                  placeholder="Enter strong new password"
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:border-amber-500 outline-hidden"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  New 4-Digit Quick POS PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
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
              <h3 className="text-base font-bold text-white">Permanently Delete Account?</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete operator account <strong>"{userToDelete.name}" (@{userToDelete.username})</strong>?
              They will immediately lose access to scanner stands and reception portals.
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
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT HANDOVER & AUDIT MODAL */}
      <ShiftHandoverModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        language={language || 'en'}
        stationId={selectedShiftStationId}
      />
    </div>
  );
};
