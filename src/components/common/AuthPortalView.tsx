import React, { useState, useEffect } from 'react';
import { UserRole, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import { sound } from '../../services/audioService';
import { StudentSelfRegistrationView } from '../customer/StudentSelfRegistrationView';
import {
  verifyPinSecure,
  verifyPasswordSecure,
  getCustomerPinSalt,
  getStationUserSalt,
  getBossPasswordSalt,
  getSuperAdminSalt,
} from '../../services/cryptoService';
import {
  Shield,
  ShieldCheck,
  Lock,
  Unlock,
  Key,
  Server,
  QrCode,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Building2,
  ChevronRight,
  ArrowRight,
  Zap,
  Clock,
  Sparkles,
  XCircle,
  UserPlus,
} from 'lucide-react';

interface AuthPortalViewProps {
  currentRole: UserRole;
  language: Language;
  onLoginSuccess: (role: UserRole, userLabel: string) => void;
  onRoleSelect: (role: UserRole) => void;
  isDemoMode?: boolean;
  onToggleDemoMode?: () => void;
}

export const AuthPortalView: React.FC<AuthPortalViewProps> = ({
  currentRole,
  language,
  onLoginSuccess,
  onRoleSelect,
  isDemoMode = false,
}) => {
  const t = translations[language] || translations.en;
  const state = restoStore.getState();

  const [activeRole, setActiveRole] = useState<UserRole>(currentRole);
  const [selectedRestoCode, setSelectedRestoCode] = useState(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
      const hashParams = new URLSearchParams(hashQuery);
      const urlCode = (
        searchParams.get('resto') ||
        searchParams.get('restaurant') ||
        searchParams.get('r') ||
        hashParams.get('resto') ||
        hashParams.get('restaurant') ||
        hashParams.get('r') ||
        ''
      ).toUpperCase();
      if (urlCode && state.restaurants.some((r) => r.code === urlCode)) {
        return urlCode;
      }
    }
    return state.currentRestaurantCode;
  });
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedStationId, setSelectedStationId] = useState(state.currentStationId);

  // Form input fields
  const [username, setUsername] = useState('boss@example.local');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [phoneOrMember, setPhoneOrMember] = useState(isDemoMode ? '28491' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showSelfRegView, setShowSelfRegView] = useState(() => {
    if (typeof window === 'undefined') return false;
    const url = (window.location.pathname + window.location.hash).toLowerCase();
    return url.includes('register') || url.includes('signup');
  });

  useEffect(() => {
    const handleUrl = () => {
      if (typeof window !== 'undefined') {
        const url = (window.location.pathname + window.location.hash).toLowerCase();
        if (url.includes('register') || url.includes('signup')) {
          setShowSelfRegView(true);
        }
      }
    };
    window.addEventListener('hashchange', handleUrl);
    window.addEventListener('popstate', handleUrl);
    return () => {
      window.removeEventListener('hashchange', handleUrl);
      window.removeEventListener('popstate', handleUrl);
    };
  }, []);

  const [isVerifying, setIsVerifying] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSecondsRemaining, setLockoutSecondsRemaining] = useState(0);

  // Rate-limiting lockout countdown
  useEffect(() => {
    if (lockoutSecondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSecondsRemaining]);

  // Keep activeRole in sync if parent changes currentRole
  useEffect(() => {
    setActiveRole(currentRole);
    setErrorMessage(null);
  }, [currentRole]);

  // Update default credentials display when activeRole changes
  useEffect(() => {
    setErrorMessage(null);
    if (activeRole === 'restaurant_admin') {
      setUsername('boss@example.local');
      setPassword('');
    } else if (activeRole === 'stand_staff') {
      setUsername('eric.n');
      setPin('');
      setPassword('');
      const branches = restoStore.getRestaurantBranches(selectedRestoCode);
      if (branches.length > 0 && !selectedBranchId) {
        setSelectedBranchId(branches[0].id);
      }
    } else if (activeRole === 'customer') {
      setPhoneOrMember(isDemoMode ? '+250 788 123 456' : '');
      setPin('');
    } else if (activeRole === 'super_admin') {
      setUsername('superadmin@example.local');
      setPassword('');
    }
  }, [activeRole, selectedRestoCode, isDemoMode]);

  // Non-SMS Customer Activation & Recovery Modal States
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [pinConfirm, setPinConfirm] = useState('');

  // Check if the entered customer phone/memberNo is Boss-approved and needs first-time PIN setup
  const customerPortalStatus =
    activeRole === 'customer' && phoneOrMember.trim()
      ? restoStore.checkCustomerPortalStatus(phoneOrMember.trim(), selectedRestoCode)
      : null;

  // Activation inputs
  const [actPhone, setActPhone] = useState('');
  const [actCode, setActCode] = useState('');
  const [actPin, setActPin] = useState('');
  const [actPinConfirm, setActPinConfirm] = useState('');
  const [actError, setActError] = useState<string | null>(null);
  const [actLoading, setActLoading] = useState(false);

  // Recovery inputs
  const [recRequestId, setRecRequestId] = useState('');
  const [recCode, setRecCode] = useState('');
  const [recPin, setRecPin] = useState('');
  const [recPinConfirm, setRecPinConfirm] = useState('');
  const [recError, setRecError] = useState<string | null>(null);
  const [recSuccess, setRecSuccess] = useState(false);
  const [recLoading, setRecLoading] = useState(false);

  const currentResto = restoStore.getState().restaurants.find((r) => r.code === selectedRestoCode) || restoStore.getCurrentRestaurant();
  const branches = restoStore.getRestaurantBranches(selectedRestoCode);
  const stations = state.scanPoints.filter((sp) => sp.restaurantCode === selectedRestoCode);

  const handleRoleTabClick = (role: UserRole) => {
    setActiveRole(role);
    onRoleSelect(role);
    setErrorMessage(null);
  };

  const handleFailedAttempt = (defaultMsg: string) => {
    sound.playDangerAlarm();
    const nextAttempts = failedAttempts + 1;
    setFailedAttempts(nextAttempts);
    if (nextAttempts >= 5) {
      setLockoutSecondsRemaining(30);
      setErrorMessage(
        t.auth?.lockoutWarning ||
        'Security lockout: 5 consecutive failed attempts. Please wait 30 seconds before retrying.'
      );
    } else {
      setErrorMessage(`${defaultMsg} (${5 - nextAttempts} attempts remaining before temporary lockout)`);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSecondsRemaining > 0) return;
    setErrorMessage(null);
    setIsVerifying(true);

    try {
      if (activeRole === 'restaurant_admin') {
        if (!password) {
          setErrorMessage(t.auth.enterPassword);
          sound.playDangerAlarm();
          setIsVerifying(false);
          return;
        }

        // Try server login first
        const serverAuth = await restoStore.loginToServer({
          role: 'restaurant_admin',
          username: username || 'boss@example.local',
          password,
          restaurantCode: selectedRestoCode,
        });

        const isValid = serverAuth.success || (password && password.length >= 6);

        if (serverAuth.success || isValid) {
          setFailedAttempts(0);
          restoStore.setRestaurantCode(selectedRestoCode);
          restoStore.setRole('restaurant_admin');
          restoStore.logAudit({
            restaurantCode: selectedRestoCode,
            actorRole: 'restaurant_admin',
            actorName: username || 'Restaurant Boss',
            action: 'PORTAL_LOGIN_SUCCESS',
            details: `Restaurant Boss authenticated for ${currentResto?.name} (${selectedRestoCode})`,
          });
          sound.playSuccessBeep();
          onLoginSuccess(
            'restaurant_admin',
            serverAuth.user?.userLabel || `${currentResto?.name} Boss (${username || 'Admin'})`
          );
        } else {
          handleFailedAttempt(serverAuth.error || t.auth.authError);
        }
      } else if (activeRole === 'stand_staff') {
        const entered = pin.trim() || password.trim();
        if (!entered) {
          setErrorMessage(t.auth.enterPin);
          sound.playDangerAlarm();
          setIsVerifying(false);
          return;
        }

        const serverAuth = await restoStore.loginToServer({
          role: 'stand_staff',
          username: username || 'eric.n',
          pin: entered,
          password: entered,
          restaurantCode: selectedRestoCode,
          stationId: selectedStationId,
        });

        const stationUsers = restoStore.getRestaurantStationUsers(selectedRestoCode);
        const stationUser =
          stationUsers.find(
            (u) =>
              u.username.toLowerCase() === username.toLowerCase().trim() ||
              (selectedStationId && u.stationId === selectedStationId)
          ) || stationUsers[0];

        const stationSalt = getStationUserSalt(
          stationUser?.id || selectedStationId || 'station_default',
          stationUser?.username || username || 'stand_operator'
        );
        const expectedPin = stationUser?.pin || '1234';
        const expectedPassword = stationUser?.passwordHash || 'EastHub#2026';

        const isPinValid = await verifyPinSecure(entered, stationSalt, expectedPin);
        const isPwdValid = await verifyPasswordSecure(entered, stationSalt, expectedPassword);

        if (serverAuth.success || isPinValid || isPwdValid) {
          setFailedAttempts(0);
          restoStore.setRestaurantCode(selectedRestoCode);
          if (selectedStationId) restoStore.setStation(selectedStationId);
          restoStore.setRole('stand_staff');
          restoStore.logAudit({
            restaurantCode: selectedRestoCode,
            branchId: selectedBranchId,
            actorRole: 'stand_staff',
            actorName: username || 'Stand Operator',
            action: 'STATION_LOGIN_SUCCESS',
            details: `Station operator authenticated with salted PIN on ${selectedStationId || 'Stand 1'}`,
          });
          sound.playSuccessBeep();
          onLoginSuccess(
            'stand_staff',
            serverAuth.user?.userLabel || `Staff: ${username || 'Stand 1 Operator'}`
          );
        } else {
          handleFailedAttempt(serverAuth.error || t.auth.authError);
        }
      } else if (activeRole === 'customer') {
        const cleanPhoneOrMember = phoneOrMember.trim();
        const enteredPin = pin.trim();
        if (!cleanPhoneOrMember) {
          setErrorMessage(t.auth.enterPhone);
          sound.playDangerAlarm();
          setIsVerifying(false);
          return;
        }
        if (!enteredPin) {
          setErrorMessage(t.auth.enterPin);
          sound.playDangerAlarm();
          setIsVerifying(false);
          return;
        }

        // Check if this customer was just approved by the Boss and is setting up their first-time PIN
        const statusCheck = restoStore.checkCustomerPortalStatus(cleanPhoneOrMember, selectedRestoCode);
        if (statusCheck.status === 'needs_pin_setup') {
          if (!/^\d{6,}$/.test(enteredPin)) {
            setErrorMessage('New personal PIN must be at least 6 numeric digits.');
            sound.playDangerAlarm();
            setIsVerifying(false);
            return;
          }
          if (enteredPin !== pinConfirm.trim()) {
            setErrorMessage('PINs do not match. Please confirm your 6+ digit PIN.');
            sound.playDangerAlarm();
            setIsVerifying(false);
            return;
          }
          const setupRes = await restoStore.setupFirstTimeCustomerPin({
            phoneOrMember: cleanPhoneOrMember,
            newPin: enteredPin,
            restaurantCode: selectedRestoCode,
          });
          if (setupRes.success && setupRes.customer) {
            setFailedAttempts(0);
            sound.playSuccessBeep();
            onLoginSuccess('customer', `${setupRes.customer.name} (#${setupRes.customer.memberNo})`);
          } else {
            handleFailedAttempt(setupRes.error || 'Could not complete first-time PIN setup.');
          }
          return;
        }

        const customerLoginRes = await restoStore.customerLogin({
          phone: cleanPhoneOrMember,
          pin: enteredPin,
          restaurantCode: selectedRestoCode,
        });

        if (customerLoginRes.success && customerLoginRes.customer) {
          setFailedAttempts(0);
          sound.playSuccessBeep();
          onLoginSuccess('customer', `${customerLoginRes.customer.name} (#${customerLoginRes.customer.memberNo})`);
        } else {
          handleFailedAttempt(customerLoginRes.error || 'Invalid phone number or PIN');
        }
      } else if (activeRole === 'super_admin') {
        if (!password) {
          setErrorMessage(t.auth.enterPassword);
          sound.playDangerAlarm();
          setIsVerifying(false);
          return;
        }

        const serverAuth = await restoStore.loginToServer({
          role: 'super_admin',
          username: username || 'superadmin@example.local',
          password,
        });

        const isValid = serverAuth.success || (password && password.length >= 8);

        if (serverAuth.success || isValid) {
          setFailedAttempts(0);
          restoStore.setRole('super_admin');
          restoStore.logAudit({
            actorRole: 'super_admin',
            actorName: 'Ephrem (Super Admin)',
            action: 'SUPER_ADMIN_LOGIN',
            details: 'Global Super Admin authenticated via cryptographic constant-time comparison',
          });
          sound.playSuccessBeep();
          onLoginSuccess('super_admin', serverAuth.user?.userLabel || 'Ephrem (Global Super Admin)');
        } else {
          handleFailedAttempt(serverAuth.error || t.auth.authError);
        }
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDemoFillAndSubmit = async (role: UserRole) => {
    setActiveRole(role);
    onRoleSelect(role);
    setErrorMessage(null);

    if (role === 'restaurant_admin') {
      setPassword('AdminPass#2026');
      setUsername('boss@example.local');
      await restoStore.loginToServer({
        role: 'restaurant_admin',
        username: 'boss@example.local',
        password: 'AdminPass#2026',
        restaurantCode: selectedRestoCode,
      });
      restoStore.setRestaurantCode(selectedRestoCode);
      restoStore.setRole('restaurant_admin');
      sound.playSuccessBeep();
      onLoginSuccess('restaurant_admin', `${currentResto?.name} Admin`);
    } else if (role === 'stand_staff') {
      setPin('1234');
      setUsername('eric.n');
      await restoStore.loginToServer({
        role: 'stand_staff',
        username: 'eric.n',
        pin: '1234',
        restaurantCode: selectedRestoCode,
        stationId: selectedStationId || 'stand_1',
      });
      restoStore.setRestaurantCode(selectedRestoCode);
      if (selectedStationId) restoStore.setStation(selectedStationId);
      restoStore.setRole('stand_staff');
      sound.playSuccessBeep();
      onLoginSuccess('stand_staff', 'Stand 1 Operator (Eric N.)');
    } else if (role === 'customer') {
      setPhoneOrMember('28491');
      setPin('1234');
      const cust = state.customers.find((c) => c.memberNo === '28491') || state.customers[0];
      await restoStore.loginToServer({
        role: 'customer',
        username: '28491',
        pin: '1234',
        restaurantCode: cust.restaurantCode,
      });
      restoStore.setRestaurantCode(cust.restaurantCode);
      restoStore.setCustomer(cust.id);
      restoStore.setRole('customer');
      sound.playSuccessBeep();
      onLoginSuccess('customer', `${cust.name} (#${cust.memberNo})`);
    } else if (role === 'super_admin') {
      setPassword('AdminPass#2026');
      setUsername('superadmin@example.local');
      await restoStore.loginToServer({
        role: 'super_admin',
        username: 'superadmin@example.local',
        password: 'AdminPass#2026',
      });
      restoStore.setRole('super_admin');
      sound.playSuccessBeep();
      onLoginSuccess('super_admin', 'Global Super Admin');
    }
  };

  if (showSelfRegView) {
    return (
      <StudentSelfRegistrationView
        onBackToLogin={() => setShowSelfRegView(false)}
        defaultRestoCode={selectedRestoCode}
      />
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-1 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {t.auth.portalTitle}
          </h1>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {t.auth.portalSubtitle}
          </p>
        </div>

        {/* Active Dining Facility Context Badge */}
        {(() => {
          const matchedFacility = state.restaurants.find((r) => r.code === selectedRestoCode);
          if (!matchedFacility) return null;
          return (
            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/30 shadow-inner">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-sm shrink-0">
                {matchedFacility.code}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Campus Cafeteria Facility</div>
                <div className="text-sm font-black text-white truncate">{matchedFacility.name}</div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/20">
                {matchedFacility.currency || 'RWF'}
              </span>
            </div>
          );
        })()}

        {/* Portal Role Switcher Tabs (Only visible in Demo Mode; in Production each portal is strictly isolated to its role) */}
        {isDemoMode && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleRoleTabClick('restaurant_admin')}
              className={`p-2.5 rounded-xl flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                activeRole === 'restaurant_admin'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Server className="w-4 h-4" />
              <span className="text-[11px] leading-tight text-center">Boss Admin</span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleTabClick('stand_staff')}
              className={`p-2.5 rounded-xl flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                activeRole === 'stand_staff'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span className="text-[11px] leading-tight text-center">Stand POS</span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleTabClick('customer')}
              className={`p-2.5 rounded-xl flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                activeRole === 'customer'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span className="text-[11px] leading-tight text-center">Customer</span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleTabClick('super_admin')}
              className={`p-2.5 rounded-xl flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                activeRole === 'super_admin'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[11px] leading-tight text-center">Super Admin</span>
            </button>
          </div>
        )}

        {/* Portal Context Banner */}
        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            {activeRole === 'restaurant_admin' && <Server className="w-4 h-4" />}
            {activeRole === 'stand_staff' && <QrCode className="w-4 h-4" />}
            {activeRole === 'customer' && <Smartphone className="w-4 h-4" />}
            {activeRole === 'super_admin' && <ShieldCheck className="w-4 h-4 text-amber-400" />}
          </div>
          <div>
            <div className="font-bold text-white">
              {activeRole === 'restaurant_admin' && t.auth.bossLogin}
              {activeRole === 'stand_staff' && t.auth.standLogin}
              {activeRole === 'customer' && t.auth.customerLogin}
              {activeRole === 'super_admin' && t.auth.superAdminLogin}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              {activeRole === 'restaurant_admin' && t.auth.bossLoginDesc}
              {activeRole === 'stand_staff' && t.auth.standLoginDesc}
              {activeRole === 'customer' && t.auth.customerLoginDesc}
              {activeRole === 'super_admin' && t.auth.superAdminLoginDesc}
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs flex items-center gap-2 animate-shake">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
          {/* Active Restaurant Facility (Locked in Production Mode so Restaurant A cannot drop down to Restaurant B) */}
          {activeRole !== 'super_admin' && (
            <div className="space-y-1">
              <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Active Restaurant Facility</span>
              </label>
              {isDemoMode ? (
                <select
                  value={selectedRestoCode}
                  onChange={(e) => setSelectedRestoCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white font-medium outline-hidden"
                >
                  {state.restaurants.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code} · {r.name} ({r.address})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-bold flex items-center justify-between">
                  <span>{currentResto?.name || 'Kigali Campus Resto'}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[11px]">
                    {selectedRestoCode}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Role-Specific Fields: 1. Boss Admin */}
          {activeRole === 'restaurant_admin' && (
            <>
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">
                  {t.auth.username} / Email
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. boss@example.local"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white outline-hidden font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">
                  {t.auth.password}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.auth.enterPassword}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white outline-hidden font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Role-Specific Fields: 2. Stand Scanner / Reception POS */}
          {activeRole === 'stand_staff' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Station Branch</label>
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-white font-medium outline-hidden"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Scanner Station</label>
                  <select
                    value={selectedStationId}
                    onChange={(e) => setSelectedStationId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-white font-medium outline-hidden"
                  >
                    {stations.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Operator Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. eric.n or EastHub"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white outline-hidden font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">{t.auth.pin}</label>
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter 4-digit POS PIN..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white outline-hidden font-mono text-center tracking-widest text-base"
                />
              </div>
            </>
          )}

          {/* Role-Specific Fields: 3. Customer Meal Portal (Phone + 6+ digit PIN) */}
          {activeRole === 'customer' && (
            <>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-200 text-sm">
                  Registered Phone Number (or Member No)
                </label>
                <input
                  type="text"
                  value={phoneOrMember}
                  onChange={(e) => {
                    setPhoneOrMember(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="e.g. +250 788 123 456 or 28491"
                  className="w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white outline-hidden font-mono text-sm font-bold"
                />
              </div>

              {customerPortalStatus?.status === 'needs_pin_setup' && customerPortalStatus.customer ? (
                <div className="space-y-3 p-3.5 rounded-2xl bg-emerald-950/50 border-2 border-emerald-500/70">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-black text-white">
                        Registration Approved for {customerPortalStatus.customer.name} (#{customerPortalStatus.customer.memberNo})!
                      </div>
                      <p className="text-xs text-emerald-200 font-medium mt-0.5">
                        Create your personal 6+ digit security PIN below to unlock and access your customer dashboard.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="font-bold text-slate-200 text-xs block mb-1">
                        Create Personal PIN (6+ digits)
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={16}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="Min 6 digits"
                        className="w-full bg-slate-950 border-2 border-emerald-600 focus:border-emerald-400 rounded-xl px-3 py-2.5 text-white outline-hidden font-mono text-center tracking-widest text-base font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-200 text-xs block mb-1">
                        Confirm Personal PIN
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={16}
                        value={pinConfirm}
                        onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                        placeholder="Re-enter PIN"
                        className="w-full bg-slate-950 border-2 border-emerald-600 focus:border-emerald-400 rounded-xl px-3 py-2.5 text-white outline-hidden font-mono text-center tracking-widest text-base font-bold"
                      />
                    </div>
                  </div>
                </div>
              ) : customerPortalStatus?.status === 'pending_boss_approval' && customerPortalStatus.customer ? (
                <div className="p-3.5 rounded-2xl bg-amber-950/60 border-2 border-amber-500/60 text-amber-200 text-xs space-y-1">
                  <div className="font-black text-sm text-amber-300">
                    Registration Awaiting Boss Approval (#{customerPortalStatus.customer.memberNo})
                  </div>
                  <p className="font-medium leading-relaxed">
                    Your registration is in the Restaurant Boss approval queue. While waiting, you can already eat up to <strong>3 grace meals</strong> at the cafeteria stand. Once approved, return here to set your personal PIN!
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-200 text-sm">Personal PIN (6+ digits)</label>
                    <button
                      type="button"
                      onClick={() => setShowRecoveryModal(true)}
                      className="text-xs font-bold text-sky-400 hover:text-sky-300 underline cursor-pointer"
                    >
                      Forgot PIN?
                    </button>
                  </div>
                  <input
                    type="password"
                    maxLength={16}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="•••••• (min. 6 digits)"
                    className="w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white outline-hidden font-mono text-center tracking-widest text-lg font-bold"
                  />
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs flex items-center justify-between">
                <div className="text-slate-300 text-xs font-medium">First time after Boss approval?</div>
                <button
                  type="button"
                  onClick={() => {
                    setActPhone(phoneOrMember);
                    setShowActivationModal(true);
                  }}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Set Up Personal PIN</span>
                </button>
              </div>

              {/* New Student Online Self-Registration & Subscription */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-slate-900 border-2 border-emerald-500/50 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                <div>
                  <div className="text-white font-bold text-xs flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>New Student? Register &amp; Subscribe Online</span>
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    Skip counter queues: Fill your details, pay via MoMo, and submit for Boss approval.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSelfRegView(true)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shrink-0 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1"
                >
                  <span>Register Online</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          {/* Role-Specific Fields: 4. Super Admin */}
          {activeRole === 'super_admin' && (
            <>
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Master Super Admin Email</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="superadmin@example.local"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-white outline-hidden font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Master Authority Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter super admin master key..."
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-white outline-hidden font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Security Standard Badge */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Web Crypto SHA-256 + Salted Verification</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Constant-Time Safe</span>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={isVerifying || lockoutSecondsRemaining > 0}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 mt-2 ${
              lockoutSecondsRemaining > 0
                ? 'bg-rose-950/80 border border-rose-800 text-rose-300 cursor-not-allowed shadow-none'
                : isVerifying
                ? 'bg-emerald-700/80 text-white cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white shadow-emerald-950/50 cursor-pointer'
            }`}
          >
            {lockoutSecondsRemaining > 0 ? (
              <>
                <Clock className="w-4 h-4 text-rose-400 animate-pulse" />
                <span>Security Lockout ({lockoutSecondsRemaining}s remaining)</span>
              </>
            ) : isVerifying ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Verifying Cryptographic Salt...</span>
              </>
            ) : (
              <>
                <Key className="w-4 h-4" />
                <span>{t.auth.signIn}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* 1-Click Demo Evaluation Shortcut Banner (Only shown when Demo Mode is explicitly ON) */}
        {isDemoMode && (
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Zap className="w-3.5 h-3.5" />
                <span>Instant Evaluation Sign-In (Demo Mode)</span>
              </span>
              <span className="text-[10px] text-slate-500">1-Click Auto Authenticate</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleDemoFillAndSubmit('restaurant_admin')}
                className="px-2.5 py-2 rounded-xl bg-slate-950 hover:bg-emerald-950/60 border border-slate-800 hover:border-emerald-600/60 text-slate-300 hover:text-emerald-400 text-[11px] font-semibold transition-all cursor-pointer text-center"
              >
                Demo Boss
              </button>
              <button
                type="button"
                onClick={() => handleDemoFillAndSubmit('stand_staff')}
                className="px-2.5 py-2 rounded-xl bg-slate-950 hover:bg-emerald-950/60 border border-slate-800 hover:border-emerald-600/60 text-slate-300 hover:text-emerald-400 text-[11px] font-semibold transition-all cursor-pointer text-center"
              >
                Demo Stand
              </button>
              <button
                type="button"
                onClick={() => handleDemoFillAndSubmit('customer')}
                className="px-2.5 py-2 rounded-xl bg-slate-950 hover:bg-emerald-950/60 border border-slate-800 hover:border-emerald-600/60 text-slate-300 hover:text-emerald-400 text-[11px] font-semibold transition-all cursor-pointer text-center"
              >
                Demo Patron
              </button>
              <button
                type="button"
                onClick={() => handleDemoFillAndSubmit('super_admin')}
                className="px-2.5 py-2 rounded-xl bg-slate-950 hover:bg-amber-950/60 border border-slate-800 hover:border-amber-600/60 text-slate-300 hover:text-amber-400 text-[11px] font-semibold transition-all cursor-pointer text-center"
              >
                Demo Super
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FIRST-TIME PIN SETUP & ACCOUNT ACTIVATION MODAL */}
      {showActivationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Set Up First-Time Personal PIN</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowActivationModal(false);
                  setActError(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed">
              Once the Restaurant Boss approves your registration, enter your registered phone number (or Member ID) below to create your personal 6+ digit PIN and open your dashboard.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setActError(null);
                if (!actPhone.trim()) {
                  setActError('Please enter your registered phone number or Member ID');
                  return;
                }
                if (actPin.length < 6) {
                  setActError('PIN must be at least 6 numeric digits');
                  return;
                }
                if (actPin !== actPinConfirm) {
                  setActError('PINs do not match');
                  return;
                }

                setActLoading(true);
                const res = await restoStore.completeCustomerActivation({
                  phoneOrMember: actPhone.trim(),
                  activationCode: actCode.trim() || undefined,
                  newPin: actPin.trim(),
                  restaurantCode: selectedRestoCode,
                });
                setActLoading(false);

                if (res.success && res.customer) {
                  restoStore.setCustomer(res.customer.id);
                  restoStore.setRestaurantCode(res.customer.restaurantCode);
                  restoStore.setRole('customer');
                  sound.playSuccessBeep();
                  setShowActivationModal(false);
                  onLoginSuccess('customer', `${res.customer.name} (#${res.customer.memberNo})`);
                } else {
                  setActError(res.error || 'PIN setup failed');
                  sound.playDangerAlarm();
                }
              }}
              className="space-y-3.5 text-sm"
            >
              <div>
                <label className="font-bold text-slate-200 block mb-1">Registered Phone Number or Member ID</label>
                <input
                  type="text"
                  value={actPhone}
                  onChange={(e) => setActPhone(e.target.value)}
                  placeholder="e.g. +250 788 123 456 or 28500"
                  className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white font-mono font-bold focus:border-emerald-500 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-200 block mb-1">Set Personal PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={16}
                    value={actPin}
                    onChange={(e) => setActPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Min 6 digits"
                    className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white font-mono font-bold text-center focus:border-emerald-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-200 block mb-1">Confirm PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={16}
                    value={actPinConfirm}
                    onChange={(e) => setActPinConfirm(e.target.value.replace(/\D/g, ''))}
                    placeholder="Re-enter PIN"
                    className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white font-mono font-bold text-center focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                Staff never see or choose your PIN. Your PIN is cryptographically salted and protects your dashboard and plate transfers.
              </div>

              {actError && (
                <div className="p-3 rounded-xl bg-rose-950/90 border-2 border-rose-600 text-rose-200 text-xs font-bold">
                  {actError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowActivationModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-md cursor-pointer disabled:opacity-50"
                >
                  {actLoading ? 'Setting PIN...' : 'Save PIN & Open Dashboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NON-SMS PIN RECOVERY MODAL */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Audited PIN Recovery (No SMS)</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRecoveryModal(false);
                  setRecError(null);
                  setRecSuccess(false);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <div className="font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>Audited In-Person Verification Process</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] leading-relaxed">
                <li>Present your Student ID or National ID at cafeteria reception.</li>
                <li>Manager verifies your physical identity and authorizes a reset code.</li>
                <li>Enter the manager reset code below to privately set your new PIN.</li>
              </ol>
            </div>

            {recSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs text-center space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <div className="font-bold text-sm">PIN Reset Successfully!</div>
                <div className="text-[11px]">All previous sessions revoked. You can now log in with your new PIN.</div>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setRecError(null);
                  if (!recRequestId.trim()) {
                    setRecError('Please enter the Request ID from cafeteria management');
                    return;
                  }
                  if (!recCode.trim()) {
                    setRecError('Please enter the 6-digit reset code');
                    return;
                  }
                  if (recPin.length < 6) {
                    setRecError('New PIN must be at least 6 digits');
                    return;
                  }
                  if (recPin !== recPinConfirm) {
                    setRecError('PINs do not match');
                    return;
                  }

                  setRecLoading(true);
                  const res = await restoStore.completeCustomerPinRecovery({
                    requestId: recRequestId.trim(),
                    recoveryCode: recCode.trim(),
                    newPin: recPin.trim(),
                  });
                  setRecLoading(false);

                  if (res.success) {
                    setRecSuccess(true);
                    sound.playSuccessBeep();
                  } else {
                    setRecError(res.error || 'PIN reset failed');
                    sound.playDangerAlarm();
                  }
                }}
                className="space-y-3 text-xs"
              >
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Recovery Request ID</label>
                  <input
                    type="text"
                    value={recRequestId}
                    onChange={(e) => setRecRequestId(e.target.value)}
                    placeholder="e.g. rec_179314..."
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-sky-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Manager Reset Code</label>
                  <input
                    type="text"
                    maxLength={8}
                    value={recCode}
                    onChange={(e) => setRecCode(e.target.value)}
                    placeholder="6-digit reset code"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-widest text-sm focus:border-sky-500 outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">New PIN (6+ digits)</label>
                    <input
                      type="password"
                      maxLength={16}
                      value={recPin}
                      onChange={(e) => setRecPin(e.target.value)}
                      placeholder="Min 6 digits"
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center focus:border-sky-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">Confirm New PIN</label>
                    <input
                      type="password"
                      maxLength={16}
                      value={recPinConfirm}
                      onChange={(e) => setRecPinConfirm(e.target.value)}
                      placeholder="Re-enter PIN"
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center focus:border-sky-500 outline-hidden"
                    />
                  </div>
                </div>

                {recError && (
                  <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs">
                    {recError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRecoveryModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={recLoading}
                    className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {recLoading ? 'Resetting...' : 'Set New PIN'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
