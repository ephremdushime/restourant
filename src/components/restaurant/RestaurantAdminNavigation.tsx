import React from 'react';
import {
  BarChart3, Clock, Users, Building2, TrendingUp, CreditCard, Bell,
  FileSpreadsheet, Calculator, ShieldAlert, Palette, UserPlus, Printer,
  Tag, Settings,
} from 'lucide-react';

interface RestaurantAdminNavigationProps {
  activeSubTab: string;
  onSubTabChange: (tab: string) => void;
  pendingCount: number;
  activeCustomersCount: number;
  stationUserCount: number;
  activeCashierSessionCount: number;
  pricingSectionView: 'analytics' | 'bundles';
  onPricingSectionViewChange: (view: 'analytics' | 'bundles') => void;
  onSelectCustomers: () => void;
}

export const RestaurantAdminNavigation: React.FC<RestaurantAdminNavigationProps> = ({
  activeSubTab,
  onSubTabChange,
  pendingCount,
  activeCustomersCount,
  stationUserCount,
  activeCashierSessionCount,
  pricingSectionView,
  onPricingSectionViewChange,
  onSelectCustomers,
}) => {
  const navTabs = [
    // Group 1: Operations
    {
      id: 'dashboard',
      label: 'Overview & Live',
      icon: BarChart3,
      match: activeSubTab === 'dashboard' || activeSubTab === 'activities',
    },
    {
      id: 'approvals',
      label: 'MoMo Approvals',
      icon: Clock,
      badge: pendingCount > 0 ? pendingCount : undefined,
      match: activeSubTab === 'approvals',
      isBossRoom: true,
    },
    {
      id: 'customers',
      label: 'Patrons & Cards',
      icon: Users,
      badge: activeCustomersCount,
      match:
        activeSubTab === 'customers' ||
        activeSubTab === 'registration' ||
        activeSubTab === 'cards' ||
        activeSubTab === 'users',
    },
    {
      id: 'stations',
      label: 'Branches & Staff',
      icon: Building2,
      badge: stationUserCount || undefined,
      match: activeSubTab === 'stations',
    },
    // Group 2: Financials & Menu
    {
      id: 'pricing',
      label: 'Pricing & Rules',
      icon: TrendingUp,
      match:
        activeSubTab === 'pricing' ||
        activeSubTab === 'overrides' ||
        activeSubTab === 'settings',
    },
    {
      id: 'reports',
      label: 'Financial Reports',
      icon: FileSpreadsheet,
      match: activeSubTab === 'reports',
    },
    {
      id: 'pnl_copilot',
      label: 'Expenses & P&L',
      icon: Calculator,
      match: activeSubTab === 'pnl_copilot',
    },
    // Group 3: System & Security
    {
      id: 'security',
      label: 'Terminal Security',
      icon: ShieldAlert,
      badge: activeCashierSessionCount || undefined,
      match: activeSubTab === 'security',
    },
    {
      id: 'notifications',
      label: 'Alerts & Studio',
      icon: Bell,
      match: activeSubTab === 'notifications',
    },
    {
      id: 'billing',
      label: 'SaaS Plan',
      icon: CreditCard,
      match: activeSubTab === 'billing',
    },
    {
      id: 'appearance',
      label: 'Branding & Theme',
      icon: Palette,
      match: activeSubTab === 'appearance',
    },
  ];

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-3">
      {/* Primary Boss Navigation Bar */}
      <div className="relative w-full max-w-full min-w-0">
        <div
          role="navigation"
          aria-label="Restaurant administration sections"
          className="restaurant-admin-nav w-full max-w-full min-w-0 flex items-center gap-1.5 overflow-x-auto pb-2 pt-1 no-scrollbar border-b border-slate-800 text-xs font-semibold select-none"
        >
          {navTabs.map((tab, idx) => {
            const Icon = tab.icon;
            const isSelected = tab.match;
            const showDivider = idx === 4 || idx === 7;

            return (
              <React.Fragment key={tab.id}>
                {showDivider && (
                  <div className="h-6 w-px bg-slate-800 mx-1 shrink-0 hidden sm:block" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    onSubTabChange(tab.id);
                    if (tab.id === 'customers') onSelectCustomers();
                  }}
                  aria-current={isSelected ? 'page' : undefined}
                  className={`restaurant-admin-tab flex items-center gap-2 px-3.5 py-2.5 rounded-xl whitespace-nowrap transition-all font-bold text-xs cursor-pointer ${
                    isSelected
                      ? tab.isBossRoom
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40 font-black'
                        : 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40 border border-emerald-500/40'
                      : tab.isBossRoom && pendingCount > 0
                      ? 'text-amber-300 hover:text-white bg-amber-950/40 border border-amber-600/60 animate-pulse'
                      : 'text-slate-300 hover:text-white bg-slate-900/60 hover:bg-slate-800 border border-slate-800/80'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSelected
                        ? tab.isBossRoom
                          ? 'text-slate-950'
                          : 'text-white'
                        : tab.isBossRoom
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  />
                  <span>{tab.label}</span>
                  {Boolean(tab.badge && tab.badge > 0) && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                        isSelected
                          ? tab.isBossRoom
                            ? 'bg-slate-950 text-amber-300'
                            : 'bg-white text-emerald-900'
                          : tab.isBossRoom
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Sub-Navigation Bar for Patrons & Cards Group */}
      {(activeSubTab === 'customers' || activeSubTab === 'registration' || activeSubTab === 'cards') && (
        <div
          role="navigation"
          aria-label="Patron and card management sections"
          className="restaurant-admin-subnav w-full max-w-full min-w-0 overflow-hidden flex items-center justify-between gap-2 p-2 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm text-xs"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onSubTabChange('customers')}
              className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'customers'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80 bg-slate-950/40 border border-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Members Directory ({activeCustomersCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onSubTabChange('registration')}
              className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'registration'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80 bg-slate-950/40 border border-slate-800'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Register New Patron</span>
            </button>
            <button
              type="button"
              onClick={() => onSubTabChange('cards')}
              className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'cards'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80 bg-slate-950/40 border border-slate-800'
              }`}
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>PVC Card Print Studio</span>
            </button>
          </div>
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline px-3 py-1 rounded-lg bg-slate-950/60 border border-slate-800">
            Identity &amp; Badge Management
          </span>
        </div>
      )}

      {/* Sub-Navigation Bar for Pricing, Menu & Rules Group */}
      {(activeSubTab === 'pricing' || activeSubTab === 'overrides' || activeSubTab === 'settings') && (
        <div
          role="navigation"
          aria-label="Pricing and policy sections"
          className="restaurant-admin-subnav w-full max-w-full min-w-0 overflow-hidden flex items-center justify-between gap-2 p-2 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm text-xs"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                onSubTabChange('pricing');
                onPricingSectionViewChange('analytics');
              }}
              className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'pricing' && pricingSectionView === 'analytics'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80 bg-slate-950/40 border border-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Menu Dishes &amp; Trends</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSubTabChange('pricing');
                onPricingSectionViewChange('bundles');
              }}
              className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'pricing' && pricingSectionView === 'bundles'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80 bg-slate-950/40 border border-slate-800'
              }`}
            >
              <Tag className="w-3.5 h-3.5 text-emerald-400" />
              <span>Meal Packages &amp; Single-Plate Rate</span>
            </button>
            <button
              type="button"
              onClick={() => onSubTabChange('overrides')}
              className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'overrides'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80 bg-slate-950/40 border border-slate-800'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
              <span>Blocked Scans &amp; Spot-Checks</span>
            </button>
            <button
              type="button"
              onClick={() => onSubTabChange('settings')}
              className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'settings'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80 bg-slate-950/40 border border-slate-800'
              }`}
            >
              <Settings className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cooldown &amp; Serving Rules</span>
            </button>
          </div>
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline px-3 py-1 rounded-lg bg-slate-950/60 border border-slate-800">
            Cafeteria Pricing &amp; Policy Controls
          </span>
        </div>
      )}
    </div>
  );
};
