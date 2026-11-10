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
}) => (
  <>
      {/* Unified Boss Navigation Bar (Wraps cleanly without horizontal scrollbar) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div role="navigation" aria-label="Restaurant administration sections" className="restaurant-admin-nav flex items-center flex-wrap gap-1.5 text-xs font-medium">
          {[
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
              id: 'billing',
              label: 'Software Subscription',
              icon: CreditCard,
              match: activeSubTab === 'billing',
            },
            {
              id: 'notifications',
              label: 'Alerts & Studio',
              icon: Bell,
              match: activeSubTab === 'notifications',
            },
            {
              id: 'reports',
              label: 'Financial Reports',
              icon: FileSpreadsheet,
              match: activeSubTab === 'reports',
            },
            {
              id: 'pnl_copilot',
              label: 'Expenses & P&L Co-Pilot',
              icon: Calculator,
              match: activeSubTab === 'pnl_copilot',
            },
            {
              id: 'security',
              label: 'Security & Terminals',
              icon: ShieldAlert,
              badge: activeCashierSessionCount || undefined,
              match: activeSubTab === 'security',
            },
            {
              id: 'appearance',
              label: 'Branding & Policies',
              icon: Palette,
              match: activeSubTab === 'appearance',
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = tab.match;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  onSubTabChange(tab.id);
                  if (tab.id === 'customers') onSelectCustomers();
                }}
                aria-current={isSelected ? "page" : undefined}
                className={`restaurant-admin-tab flex items-center gap-1.5 px-3.5 py-2 rounded-xl whitespace-nowrap transition-all font-bold text-xs cursor-pointer ${
                  isSelected
                    ? tab.isBossRoom
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                      : 'bg-emerald-600 text-white shadow-md'
                    : tab.isBossRoom && pendingCount > 0
                    ? 'text-amber-300 hover:text-white bg-amber-950/40 border border-amber-600/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800/80'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                {Boolean(tab.badge && tab.badge > 0) && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                      isSelected
                        ? tab.isBossRoom
                          ? 'bg-slate-950 text-amber-300'
                          : 'bg-white text-emerald-900'
                        : tab.isBossRoom
                        ? 'bg-amber-500 text-slate-950 font-black animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-Navigation Bar for Patrons & Cards Group */}
      {(activeSubTab === 'customers' || activeSubTab === 'registration' || activeSubTab === 'cards') && (
        <div role="navigation" aria-label="Patron, card, pricing and policy sections" className="restaurant-admin-subnav flex items-center justify-between gap-2 p-2 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onSubTabChange('customers')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'customers'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Members Directory ({activeCustomersCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onSubTabChange('registration')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'registration'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register New Patron</span>
            </button>
            <button
              type="button"
              onClick={() => onSubTabChange('cards')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'cards'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PVC Card Print Studio</span>
            </button>
          </div>
          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline px-2">
            Identity &amp; Badge Management
          </span>
        </div>
      )}

      {/* Sub-Navigation Bar for Pricing, Menu & Rules Group */}
      {(activeSubTab === 'pricing' || activeSubTab === 'overrides' || activeSubTab === 'settings') && (
        <div className="flex items-center justify-between gap-2 p-2 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                onSubTabChange('pricing');
                onPricingSectionViewChange('analytics');
              }}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'pricing' && pricingSectionView === 'analytics'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Menu Dishes &amp; Trends</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSubTabChange('pricing');
                onPricingSectionViewChange('bundles');
              }}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'pricing' && pricingSectionView === 'bundles'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Meal Packages &amp; Single-Plate Rate</span>
            </button>
            <button
              type="button"
              onClick={() => onSubTabChange('overrides')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'overrides'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Blocked Scans &amp; Spot-Checks</span>
            </button>
            <button
              type="button"
              onClick={() => onSubTabChange('settings')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'settings'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Cooldown &amp; Serving Rules</span>
            </button>
          </div>
          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline px-2">
            Cafeteria Pricing &amp; Policy Controls
          </span>
        </div>
      )}

  </>
);
