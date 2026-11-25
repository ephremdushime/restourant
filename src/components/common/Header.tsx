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
  ArrowLeft,
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
  onOpenSyncDrawer?: () => void;
  onOpenNotifications?: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isSessionActive?: boolean;
  onLockSession?: () => void;
  sessionUserLabel?: string;
  isDemoMode?: boolean;
  onToggleDemoMode?: () => void;
  onNavigateHome?: () => void;
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
  onNavigateHome,
}) => {
  const t = translations[language] || translations.en;
  const state = restoStore.getState();
  const pendingOutboxCount = state.syncOutbox.filter((i) => !i.syncedToCloud).length;

  const currentCustomer = restoStore.getCurrentCustomer();
  const isCustomerDashboardGated =
    currentRole === 'customer' &&
    Boolean(
      currentCustomer &&
        restoStore.getStudentSubscriptionSettings().enabled &&
        !restoStore.checkStudentEntitlement(currentCustomer.id, 'customer_dashboard').allowed
    );
  const unreadNotifCount =
    currentRole === 'customer' && currentCustomer
      ? isCustomerDashboardGated
        ? 0
        : restoStore.getUnreadNotificationCount(currentCustomer.id)
      : restoStore.getRestaurantNotifications(state.currentRestaurantCode).filter(
          (n) => Date.now() - new Date(n.timestamp).getTime() < 24 * 3600 * 1000
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsRestoDropdownOpen(false);
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Customers are strictly isolated to their authenticated restaurant tenant
  const canSwitchFacility = currentRole === 'super_admin' || (isDemoMode && currentRole !== 'customer');

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
      <div className="app-header-inner max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* ========================================================
            ZONE 1: Enterprise Brand & Authenticated Facility Context
           ======================================================== */}
        <div className="app-header-brand flex items-center gap-4 shrink-0">
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              if (onNavigateHome) onNavigateHome();
              else if (typeof window !== 'undefined') window.location.hash = '#/';
            }}
            className="flex items-center gap-2.5 group cursor-pointer"
            title="RestoPass - Return to Commercial Home & Directory"
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

              {/* Authenticated Facility / Network Scope Badge */}
              <div className="relative">
                {currentRole === 'super_admin' ? (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-300 select-none shadow-inner"
                    title="Platform Super Admin Scope · Governing all 16 connected campus dining facilities"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-bold hidden sm:inline">Global Platform Network</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-[10px] font-mono font-bold text-amber-300 shrink-0">
                      {state.restaurants.length} Campuses
                    </span>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/70 border border-slate-800/90 text-xs font-semibold text-slate-200 select-none shadow-inner"
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
              </div>
            </>
          )}
        </div>

        {/* ========================================================
            ZONE 2: Executive Controls & Authenticated Profile Menu
           ======================================================== */}
        <div className="app-header-actions flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Clean Online / Offline Indicator (No Topology Drawer) */}
          {isSessionActive && (
            <div
              title={networkStatus === 'online' ? 'Online' : 'Offline'}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold select-none ${
                networkStatus !== 'online'
                  ? 'bg-rose-950/40 border-rose-800/60 text-rose-400'
                  : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  networkStatus !== 'online'
                    ? 'bg-rose-400 animate-pulse'
                    : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                }`}
              />
              <span>{networkStatus !== 'online' ? 'Offline' : 'Online'}</span>
            </div>
          )}

          {/* Notifications Trigger (Only when authenticated and not gated on customer dashboard) */}
          {isSessionActive && !isCustomerDashboardGated && (
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
          <div role="group" aria-label="Language" className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-0.5 text-xs">
            {(['en', 'rw', 'fr'] as Language[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => onLanguageChange(lang)}
                className={`min-h-9 min-w-9 px-2 py-1 rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer ${
                  language === lang
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          {/* Authenticated User Profile Dropdown / Unauthenticated Portal Switcher */}
          {isSessionActive ? (
            <>
              <div className="h-6 w-px bg-slate-800 hidden sm:block" />

              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setIsProfileDropdownOpen((prev) => !prev)}
                  aria-label={`Account menu for ${resolvedUserLabel}`}
                  aria-expanded={isProfileDropdownOpen}
                  aria-haspopup="true"
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
                  <div className="header-dropdown absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    {/* User Info Header */}
                    <div className="px-3 py-2.5 border-b border-slate-800">
                      <div className="text-xs font-bold text-white">
                        {resolvedUserLabel}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {currentRole === 'super_admin' ? 'Platform Multi-Tenant Authority' : `${restaurantName} · ${restaurantCode}`}
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">
                        <ShieldCheck className="w-3 h-3" />
                        <span>{roleBadgeLabel}</span>
                      </div>
                    </div>

                    {/* Cryptographic Session Integrity Badge */}
                    <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-950/40 rounded-xl mx-1 my-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Signed Session Active</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                        {currentRole === 'super_admin' ? 'Audit Logging & Tenancy Active' : `Tenant Scope: ${restaurantCode}`}
                      </div>
                    </div>

                    {/* Customer Profile & Settings Access (Customer portal owns primary navigation) */}
                    {currentRole === 'customer' && onTabChange && (
                      <div className="py-1.5 border-b border-slate-800 space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            onTabChange('profile');
                            setIsProfileDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            activeTab === 'profile'
                              ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-bold'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <User className="w-3.5 h-3.5 text-emerald-400" />
                            <span>My Profile &amp; Settings</span>
                          </span>
                          {activeTab === 'profile' && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        </button>
                      </div>
                    )}

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
          ) : (
            onNavigateHome && (
              <button
                type="button"
                onClick={onNavigateHome}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-semibold cursor-pointer transition-colors shadow-inner"
                title="Return to Public Home"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Landing Page</span>
              </button>
            )
          )}
        </div>
      </div>
    </header>
  );
};
