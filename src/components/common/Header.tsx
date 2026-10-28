import React, { useState, useRef, useEffect } from 'react';
import { UserRole, Language } from '../../types';
import { translations } from '../../services/i18n';
import { restoStore } from '../../store/restoStore';
import { BatteryIndicator } from './BatteryIndicator';
import { 
  Volume2, 
  VolumeX, 
  RefreshCw,
  QrCode,
  ShieldCheck,
  Smartphone,
  Server,
  Sun,
  Moon,
  Bell,
  Lock,
  Building2,
  ChevronDown,
  BarChart3,
  Clock,
  Users,
  TrendingUp,
  Palette,
  ShieldAlert,
  Check,
  LogOut,
  User,
  Sparkles,
} from 'lucide-react';

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  networkStatus: 'online' | 'offline' | 'unstable';
  onNetworkChange: (status: 'online' | 'offline' | 'unstable') => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  restaurantName: string;
  restaurantCode: string;
  onOpenSyncDrawer: () => void;
  onOpenNotifications?: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isSessionActive?: boolean;
  onLockSession?: () => void;
  sessionUserLabel?: string;
  isDemoMode?: boolean;
  onToggleDemoMode?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  language,
  onLanguageChange,
  theme,
  onToggleTheme,
  networkStatus,
  soundEnabled,
  onToggleSound,
  restaurantName,
  restaurantCode,
  onOpenSyncDrawer,
  onOpenNotifications,
  activeTab = 'dashboard',
  onTabChange,
  isSessionActive,
  onLockSession,
  sessionUserLabel,
  isDemoMode = false,
  onToggleDemoMode,
}) => {
  const t = translations[language] || translations.en;
  const state = restoStore.getState();
  const pendingOutboxCount = state.syncOutbox.filter((i) => !i.syncedToCloud).length;

  const currentCustomer = restoStore.getCurrentCustomer();
  const unreadNotifCount = currentRole === 'customer' && currentCustomer
    ? restoStore.getUnreadNotificationCount(currentCustomer.id)
    : restoStore.getRestaurantNotifications(state.currentRestaurantCode).filter(
        (n) => (Date.now() - new Date(n.timestamp).getTime()) < 24 * 3600 * 1000
      ).length;

  // Dropdown popover states
  const [isRestoDropdownOpen, setIsRestoDropdownOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const restoRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (restoRef.current && !restoRef.current.contains(e.target as Node)) {
        setIsRestoDropdownOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const canSwitchFacility = currentRole === 'super_admin' || isDemoMode;

  const resolvedUserLabel =
    sessionUserLabel && sessionUserLabel !== 'Not signed in'
      ? sessionUserLabel
      : currentRole === 'customer' && currentCustomer
      ? `${currentCustomer.name} (#${currentCustomer.memberNo})`
      : currentRole === 'super_admin'
      ? 'Platform Authority'
      : currentRole === 'restaurant_admin'
      ? `${restaurantName} Boss`
      : 'Station Operator';

  const userInitials = resolvedUserLabel
    .replace(/\(.*\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'RP';

  const roleBadgeLabel =
    currentRole === 'restaurant_admin'
      ? 'Restaurant Boss'
      : currentRole === 'stand_staff'
      ? 'Scanner & Reception POS'
      : currentRole === 'super_admin'
      ? 'Super Admin Authority'
      : 'Patron Meal Pass';

  return (
    <header className="sticky top-0 z-50 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 text-slate-100 transition-all select-none print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* ========================================================
            ZONE 1: Enterprise Brand & Authenticated Facility Context
           ======================================================== */}
        <div className="flex items-center gap-4 shrink-0">
          <a
            href="#home"
            onClick={(e) => { e.preventDefault(); }}
            className="flex items-center gap-2.5 group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-white group-hover:text-emerald-400 transition-colors">
                  RestoPass
                </span>
                <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
                  OS
                </span>
              </div>
            </div>
          </a>

          {isSessionActive && (
            <>
              <div className="h-6 w-px bg-slate-800 hidden sm:block" />

              {/* Authenticated Facility Badge / Switcher */}
              <div className="relative" ref={restoRef}>
                {canSwitchFacility ? (
                  <button
                    type="button"
                    onClick={() => setIsRestoDropdownOpen((prev) => !prev)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 transition-all cursor-pointer shadow-inner"
                    title="Switch active dining facility scope"
                  >
                    <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate max-w-[140px] sm:max-w-[220px]">
                      {restaurantName}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono font-bold text-emerald-400 shrink-0">
                      {restaurantCode}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isRestoDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                ) : (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/70 border border-slate-800/90 text-xs font-semibold text-slate-200"
                    title={`Authenticated Facility: ${restaurantName} (${restaurantCode})`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate max-w-[140px] sm:max-w-[220px]">
                      {restaurantName}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono font-bold text-emerald-400 shrink-0">
                      {restaurantCode}
                    </span>
                  </div>
                )}

                {canSwitchFacility && isRestoDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 mb-1 flex items-center justify-between">
                      <span>{currentRole === 'super_admin' ? 'Target Tenant Scope' : 'Active Dining Facility'}</span>
                      {isDemoMode && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                          DEMO
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {state.restaurants.map((r) => {
                        const isSelected = r.code === restaurantCode;
                        return (
                          <button
                            key={r.code}
                            type="button"
                            onClick={() => {
                              restoStore.setRestaurantCode(r.code);
                              setIsRestoDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-600 text-white font-bold'
                                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                            }`}
                          >
                            <div className="flex flex-col">
                              <span>{r.name}</span>
                              <span className={`text-[10px] font-mono ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                                Facility Code: {r.code}
                              </span>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ========================================================
            ZONE 2: Executive Controls & Authenticated Profile Menu
           ======================================================== */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isSessionActive && isDemoMode && onToggleDemoMode && (
            <button
              type="button"
              onClick={onToggleDemoMode}
              title="Demo Mode is active (click to disable demo switchers)"
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-[11px] font-mono font-bold transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Demo Tools: ON</span>
            </button>
          )}

          {/* Trustworthy Offline & Outbox Status Indicator (Only when authenticated) */}
          {isSessionActive && (
            <button
              type="button"
              onClick={onOpenSyncDrawer}
              title={
                networkStatus === 'online'
                  ? pendingOutboxCount > 0
                    ? `Online — ${pendingOutboxCount} transaction(s) awaiting server synchronization`
                    : 'Online — All transactions synchronized with server'
                  : `Offline — ${pendingOutboxCount} transaction(s) queued in local outbox`
              }
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                networkStatus !== 'online'
                  ? 'bg-rose-950/40 border-rose-800/60 text-rose-400 hover:border-rose-600'
                  : pendingOutboxCount > 0
                  ? 'bg-amber-950/40 border-amber-700/60 text-amber-300 hover:border-amber-500'
                  : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:border-emerald-600'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  networkStatus !== 'online'
                    ? 'bg-rose-400 animate-pulse'
                    : pendingOutboxCount > 0
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                }`}
              />
              <span className="hidden sm:inline">
                {networkStatus !== 'online'
                  ? `Offline · ${pendingOutboxCount} Queued`
                  : pendingOutboxCount > 0
                  ? `Needs Sync (${pendingOutboxCount})`
                  : 'Online · Synced'}
              </span>
              {pendingOutboxCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold font-mono">
                  {pendingOutboxCount}
                </span>
              )}
            </button>
          )}

          {/* Notifications Trigger (Only when authenticated) */}
          {isSessionActive && (
            <button
              type="button"
              onClick={onOpenNotifications}
              title={unreadNotifCount > 0 ? `${unreadNotifCount} unread notification(s)` : 'Notifications'}
              aria-label="Notifications"
              className="p-2 rounded-xl border border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer relative"
            >
              <Bell className="w-4 h-4 text-slate-300" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-emerald-500 text-slate-950 font-black text-[10px] rounded-full font-mono shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-pulse">
                  {unreadNotifCount}
                </span>
              )}
            </button>
          )}

          {/* Theme & Sound Controls */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
            className="p-2 rounded-xl border border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer hidden md:flex"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
          </button>

          <button
            type="button"
            onClick={onToggleSound}
            title={soundEnabled ? 'Mute Audio Feedback' : 'Unmute Audio Feedback'}
            aria-label="Toggle Sound"
            className="p-2 rounded-xl border border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer hidden md:flex"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Language Switcher */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-0.5 text-xs">
            {(['en', 'rw', 'fr'] as Language[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => onLanguageChange(lang)}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase transition-colors cursor-pointer ${
                  language === lang
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          {/* Authenticated User Profile Dropdown */}
          {isSessionActive && (
            <>
              <div className="h-6 w-px bg-slate-800 hidden sm:block" />

              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setIsProfileDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer shadow-inner"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">
                    {userInitials}
                  </div>
                  <div className="hidden xl:flex flex-col text-left">
                    <span className="text-xs font-bold text-white truncate max-w-[140px]">
                      {resolvedUserLabel}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-medium">
                      {roleBadgeLabel}
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isProfileDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isProfileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    {/* User Info Header */}
                    <div className="px-3 py-2.5 border-b border-slate-800">
                      <div className="text-xs font-bold text-white">
                        {resolvedUserLabel}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {restaurantName} · {restaurantCode}
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">
                        <ShieldCheck className="w-3 h-3" />
                        <span>{roleBadgeLabel}</span>
                      </div>
                    </div>

                    {/* Demo Mode Toggle */}
                    {onToggleDemoMode && (
                      <div className="px-2 py-2 border-b border-slate-800">
                        <button
                          type="button"
                          onClick={onToggleDemoMode}
                          className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            isDemoMode
                              ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold'
                              : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles className={`w-3.5 h-3.5 ${isDemoMode ? 'text-amber-400' : 'text-slate-400'}`} />
                            <div className="text-left">
                              <div>Demo &amp; Testing Tools</div>
                              <div className="text-[10px] text-slate-400 font-normal">
                                {isDemoMode ? 'Quick taps & switchers visible' : 'Production clean view active'}
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            isDemoMode ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {isDemoMode ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Workspace / Role Switcher Section */}
                    <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Switch Portal
                    </div>
                    <div className="space-y-0.5">
                      {[
                        { role: 'restaurant_admin' as UserRole, label: 'Restaurant Boss Admin', icon: Server, desc: 'Full cafeteria management' },
                        { role: 'stand_staff' as UserRole, label: 'Scanner Operator POS', icon: QrCode, desc: 'High-speed meal pass reader' },
                        { role: 'customer' as UserRole, label: 'Customer Dining Pass', icon: Smartphone, desc: 'Mobile pass & plate balance' },
                        { role: 'super_admin' as UserRole, label: 'Super Admin Console', icon: ShieldCheck, desc: 'Platform authority & licenses' },
                      ].map((item) => {
                        const isSelected = currentRole === item.role;
                        const ItemIcon = item.icon;
                        return (
                          <button
                            key={item.role}
                            type="button"
                            onClick={() => {
                              onRoleChange(item.role);
                              setIsProfileDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-bold'
                                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <ItemIcon className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                              <div className="flex flex-col">
                                <span>{item.label}</span>
                                <span className="text-[10px] text-slate-400 font-normal">{item.desc}</span>
                              </div>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Sign Out / Lock Session Action */}
                    {onLockSession && (
                      <div className="pt-2 mt-2 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setIsProfileDropdownOpen(false);
                            onLockSession();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Lock Session &amp; Sign Out</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
