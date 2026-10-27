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

  const pendingApprovalsCount = (state.pendingApprovals || []).filter(
    (a) => a.restaurantCode === state.currentRestaurantCode && a.status === 'pending'
  ).length;

  const activePatronsCount = state.customers.filter(
    (c) => c.restaurantCode === state.currentRestaurantCode && c.cardStatus === 'active'
  ).length;

  // Restaurant Admin Workspace Navigation Items
  const adminNavItems = [
    { id: 'dashboard', label: 'Overview', icon: BarChart3 },
    {
      id: 'approvals',
      label: 'Approvals',
      icon: Clock,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
      badgeType: 'amber' as const,
    },
    {
      id: 'customers',
      label: 'Patrons & Staff',
      icon: Users,
      badge: activePatronsCount > 0 ? activePatronsCount : undefined,
      badgeType: 'slate' as const,
    },
    { id: 'pricing', label: 'Pricing & Plans', icon: TrendingUp },
    { id: 'security', label: 'Security & Terminals', icon: ShieldCheck },
    { id: 'appearance', label: 'Branding', icon: Palette },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 text-slate-100 transition-all select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* ========================================================
            ZONE 1: Enterprise Brand & Facility Switcher
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

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          {/* Polished Restaurant / Authority Dropdown Selector */}
          <div className="relative" ref={restoRef}>
            <button
              type="button"
              onClick={() => setIsRestoDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 transition-all cursor-pointer shadow-inner"
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate max-w-[140px] sm:max-w-[200px]">
                {restaurantName}
              </span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono font-bold text-emerald-400 shrink-0">
                {restaurantCode}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isRestoDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isRestoDropdownOpen && (
              <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 mb-1">
                  Active Dining Facility
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
        </div>

        {/* ========================================================
            ZONE 2: Center Primary Navigation (Contextual to Boss)
           ======================================================== */}
        {currentRole === 'restaurant_admin' && onTabChange && (
          <nav className="hidden lg:flex items-center gap-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-1 shadow-inner">
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isSelected =
                activeTab === item.id ||
                (item.id === 'dashboard' && activeTab === 'activities') ||
                (item.id === 'customers' && (activeTab === 'registration' || activeTab === 'users'));

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  {Boolean(item.badge && item.badge > 0) && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                        isSelected
                          ? 'bg-white text-emerald-900'
                          : item.badgeType === 'amber'
                          ? 'bg-amber-500 text-slate-950 font-black animate-pulse'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* ========================================================
            ZONE 3: Executive Controls & Profile Dropdown
           ======================================================== */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Live Sync Status Pill */}
          <button
            type="button"
            onClick={onOpenSyncDrawer}
            title={`Authority Network: ${networkStatus.toUpperCase()} (Click to inspect sync outbox)`}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              networkStatus === 'online'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:border-emerald-600'
                : networkStatus === 'unstable'
                ? 'bg-amber-950/40 border-amber-800/60 text-amber-400 hover:border-amber-600'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-400 hover:border-rose-600'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                networkStatus === 'online'
                  ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                  : networkStatus === 'unstable'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span className="hidden sm:inline capitalize">
              {networkStatus === 'online' ? 'Live' : networkStatus}
            </span>
            {pendingOutboxCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold font-mono animate-pulse">
                {pendingOutboxCount}
              </span>
            )}
          </button>

          {/* Notifications Trigger */}
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
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-0.5 text-xs hidden sm:flex">
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

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          {/* Executive User Profile Dropdown (Replaces the cluttered role switcher!) */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setIsProfileDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer shadow-inner"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">
                {currentRole === 'restaurant_admin' ? 'CM' : currentRole === 'super_admin' ? 'SA' : currentRole === 'stand_staff' ? 'PO' : 'CU'}
              </div>
              <div className="hidden xl:flex flex-col text-left">
                <span className="text-xs font-bold text-white truncate max-w-[130px]">
                  {sessionUserLabel || (currentRole === 'restaurant_admin' ? 'Claire M.' : 'Staff Member')}
                </span>
                <span className="text-[10px] text-emerald-400 font-medium capitalize">
                  {currentRole === 'restaurant_admin' ? 'Restaurant Boss' : currentRole.replace('_', ' ')}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isProfileDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isProfileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                {/* User Info Header */}
                <div className="px-3 py-2.5 border-b border-slate-800">
                  <div className="text-xs font-bold text-white">
                    {sessionUserLabel || 'Claire Mukamurenzi'}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {restaurantName} · {restaurantCode}
                  </div>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Hardened Session Authenticated</span>
                  </div>
                </div>

                {/* Workspace / Role Switcher Section */}
                <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Switch Workspace / View
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
                {isSessionActive && onLockSession && (
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
                      <span>Lock Session & Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
