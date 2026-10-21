import React from 'react';
import { UserRole, Language } from '../../types';
import { translations } from '../../services/i18n';
import { restoStore } from '../../store/restoStore';
import { BatteryIndicator } from './BatteryIndicator';
import { 
  Volume2, 
  VolumeX, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  QrCode,
  ShieldCheck,
  Smartphone,
  Server,
  Sun,
  Moon,
  Bell,
  Lock
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
  activeTab,
  onTabChange,
  isSessionActive,
  onLockSession,
  sessionUserLabel,
}) => {
  const t = translations[language];
  const state = restoStore.getState();
  const pendingOutboxCount = state.syncOutbox.filter((i) => !i.syncedToCloud).length;

  const currentCustomer = restoStore.getCurrentCustomer();
  const unreadNotifCount = currentRole === 'customer' && currentCustomer
    ? restoStore.getUnreadNotificationCount(currentCustomer.id)
    : restoStore.getRestaurantNotifications(state.currentRestaurantCode).filter(
        (n) => (Date.now() - new Date(n.timestamp).getTime()) < 24 * 3600 * 1000
      ).length;

  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/80 text-slate-100 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Brand title wordmark & Multi-Restaurant Entity Switcher */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <a 
            href="#home" 
            onClick={(e) => { e.preventDefault(); }}
            className="flex items-center gap-2 text-lg font-black tracking-tight text-white hover:text-emerald-400 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <QrCode className="w-4 h-4" />
            </div>
            <span>RestoPass</span>
          </a>
          <span className="hidden md:inline text-slate-600 font-light">/</span>

          {/* Restaurant Entity Selector */}
          <div className="relative">
            <select
              value={restaurantCode}
              onChange={(e) => restoStore.setRestaurantCode(e.target.value)}
              title="Switch Active Restaurant Authority (Demonstrate multi-tenant data isolation)"
              aria-label="Active Restaurant Authority"
              className="bg-slate-900 border border-slate-700 hover:border-emerald-500 text-xs text-emerald-400 font-bold rounded-lg px-2.5 py-1 outline-hidden cursor-pointer transition-colors max-w-44 sm:max-w-xs"
            >
              {restoStore.getState().restaurants.map((r) => (
                <option key={r.code} value={r.code} className="bg-slate-950 text-white">
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Zone 2: Tactile Role Switcher & System Toggles */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Segmented Tactile Role Switcher */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-0.5 text-xs font-medium shadow-inner">
            <button
              onClick={() => onRoleChange('stand_staff')}
              title="Scanner Operator PWA"
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                currentRole === 'stand_staff'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <QrCode className="w-3 h-3" />
              <span className="hidden sm:inline">Scanner</span>
            </button>
            <button
              onClick={() => onRoleChange('restaurant_admin')}
              title="Restaurant Cashier & Manager"
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                currentRole === 'restaurant_admin'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="w-3 h-3" />
              <span className="hidden sm:inline">Resto Admin</span>
            </button>
            <button
              onClick={() => onRoleChange('customer')}
              title="Customer Phone Web App"
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                currentRole === 'customer'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span className="hidden sm:inline">Customer</span>
            </button>
            <button
              onClick={() => onRoleChange('super_admin')}
              title="Founder Super Admin Console"
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                currentRole === 'super_admin'
                  ? 'bg-amber-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span className="hidden md:inline">Super Admin</span>
            </button>
          </div>

          {/* Notification Center Trigger */}
          <button
            onClick={onOpenNotifications}
            title={unreadNotifCount > 0 ? `${unreadNotifCount} unread cafeteria notification(s)` : 'Notifications & Announcements'}
            aria-label="Notifications & Announcements"
            className="p-2 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer relative"
          >
            <Bell className="w-4 h-4 text-emerald-400" />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-emerald-500 text-slate-950 font-black text-[10px] rounded-full font-mono shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-pulse">
                {unreadNotifCount}
              </span>
            )}
          </button>

          {/* Theme Toggle (Light / Dark) */}
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            className="p-2 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-500" />
            )}
          </button>

          {/* POS Sound Toggle */}
          <button
            onClick={onToggleSound}
            title={soundEnabled ? 'Mute scanner POS audio feedback' : 'Unmute scanner POS audio feedback'}
            className="p-2 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Network Indicator & Local Authority Sync Drawer Trigger */}
          <button
            onClick={onOpenSyncDrawer}
            title={`Authority Network: ${networkStatus.toUpperCase()} (Click to inspect local outbox)`}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono tabular-nums transition-colors cursor-pointer ${
              networkStatus === 'online'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:border-emerald-700'
                : networkStatus === 'unstable'
                ? 'bg-amber-950/40 border-amber-800/60 text-amber-400 hover:border-amber-700'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-400 hover:border-rose-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${
              networkStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : networkStatus === 'unstable' ? 'bg-amber-500' : 'bg-rose-500'
            }`} />
            <span className="hidden sm:inline uppercase text-[11px] font-semibold">{networkStatus}</span>
            {pendingOutboxCount > 0 && (
              <span
                title={`${pendingOutboxCount} transaction(s) waiting in offline outbox`}
                className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold font-sans animate-pulse"
              >
                {pendingOutboxCount}
              </span>
            )}
          </button>

          {/* Device Battery Level Indicator (Battery Status API) */}
          <BatteryIndicator isStaffMode={currentRole === 'stand_staff' || currentRole === 'restaurant_admin'} />

          {/* Multi-language Selector */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-0.5 text-xs">
            {(['en', 'rw', 'fr'] as Language[]).map((lang) => (
              <button
                key={lang}
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

          {/* Session Lock / Sign Out button */}
          {isSessionActive && onLockSession && (
            <button
              onClick={onLockSession}
              title={t.nav.logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-900/90 hover:bg-rose-950/50 hover:border-rose-700 text-slate-300 hover:text-rose-400 text-xs font-semibold transition-all cursor-pointer shadow-inner"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xl:inline text-[11px] font-medium">{t.nav.logout}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
