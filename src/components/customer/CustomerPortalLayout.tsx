import React from 'react';
import { Customer, Language, Restaurant } from '../../types';
import { translations } from '../../services/i18n';
import {
  Home,
  QrCode,
  History,
  Bell,
  User,
  Lock,
  ShieldCheck,
  Building2,
  LogOut,
} from 'lucide-react';

export type CustomerPortalPage = 'home' | 'my_card' | 'activity' | 'notifications' | 'profile';
export type CustomerProfileSubPage = 'personal' | 'security' | 'subscription' | 'privacy' | 'account';

interface CustomerPortalLayoutProps {
  customer: Customer;
  restaurant?: Restaurant;
  activePage: CustomerPortalPage;
  activeProfileSubPage?: CustomerProfileSubPage;
  unreadNotifCount: number;
  balance: number;
  language?: Language;
  onNavigatePage: (page: CustomerPortalPage, profileSubPage?: CustomerProfileSubPage) => void;
  onLockDashboard: () => void;
  onSignOut?: () => void;
  children: React.ReactNode;
}

export const CustomerPortalLayout: React.FC<CustomerPortalLayoutProps> = ({
  customer,
  restaurant,
  activePage,
  unreadNotifCount,
  balance,
  language,
  onNavigatePage,
  onLockDashboard,
  onSignOut,
  children,
}) => {
  const t = translations[language || 'en'] || translations.en;

  const navItems: Array<{
    id: CustomerPortalPage;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'home', label: t.customer.navHome || 'Home', shortLabel: t.customer.navHome || 'Home', icon: Home },
    { id: 'my_card', label: t.customer.navMyCard || 'My Card', shortLabel: t.customer.navMyCard || 'My Card', icon: QrCode },
    { id: 'activity', label: t.customer.navActivity || 'Activity', shortLabel: t.customer.navActivity || 'Activity', icon: History },
    {
      id: 'notifications',
      label: t.customer.navNotifications || 'Notifications',
      shortLabel: t.customer.navNotifications || 'Alerts',
      icon: Bell,
      badge: unreadNotifCount > 0 ? unreadNotifCount : undefined,
    },
    { id: 'profile', label: t.customer.navProfile || 'Profile & Settings', shortLabel: t.customer.navPersonalInfo || 'Profile', icon: User },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-24 lg:pb-10">
      {/* Compact Tenant & Patron Context Bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900/90 border border-slate-800 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm sm:text-base font-bold text-white truncate">
                {restaurant?.name || 'Campus Dining'}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[11px] font-mono font-bold text-emerald-400">
                {customer.restaurantCode}
              </span>
            </div>
            <div className="text-xs text-slate-400 truncate">
              {customer.name} · <span className="font-mono text-slate-300">#{customer.memberNo}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigatePage('my_card')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
              activePage === 'my_card'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{t.customer.showMyQr || 'My QR'}</span>
          </button>

          <button
            type="button"
            onClick={onLockDashboard}
            title="Lock Dashboard Screen"
            aria-label="Lock Dashboard Screen"
            className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <Lock className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onNavigatePage('profile', 'personal')}
            title="Profile and Settings"
            aria-label="Profile and Settings"
            className={`p-2 rounded-xl border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
              activePage === 'profile'
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Responsive Two-Column Desktop Layout / Single-Column Mobile Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:block lg:col-span-3 space-y-4 sticky top-20">
          <nav
            aria-label="Customer Portal Navigation"
            className="rounded-2xl bg-slate-900 border border-slate-800 p-2.5 space-y-1 shadow-sm"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onNavigatePage(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                        isActive ? 'bg-white text-slate-950' : 'bg-emerald-500 text-slate-950'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Compact Desktop Balance & Security Summary */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Remaining Balance</span>
              <span className="font-mono font-bold text-emerald-400">{balance} plates</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Physical Card</span>
              <span
                className={`font-mono font-bold uppercase ${
                  customer.cardStatus === 'active' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {customer.cardStatus} · V{customer.cardVersion}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-800 flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{t.customer.activeDiningPassAt || 'Active dining pass at'} {restaurant?.name || customer.restaurantCode}</span>
            </div>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="w-full mt-1 py-2 px-3 rounded-xl bg-slate-950 hover:bg-rose-950/50 border border-slate-800 hover:border-rose-800/60 text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t.customer.signOutSecurely || 'Sign Out'}</span>
              </button>
            )}
          </div>
        </aside>

        {/* Active Page Viewport */}
        <section className="lg:col-span-9 min-w-0">{children}</section>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Customer Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 px-2 py-1.5 print:hidden"
      >
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigatePage(item.id)}
                className={`relative py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  isActive ? 'text-emerald-400 bg-slate-900' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate max-w-full">{item.shortLabel}</span>
                {item.badge !== undefined && (
                  <span className="absolute top-1 right-2 px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-mono font-black text-[10px]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

