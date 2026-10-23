import React, { useState, useEffect, useCallback } from 'react';
import { restoStore } from './store/restoStore';
import { UserRole, Language } from './types';
import { Header } from './components/common/Header';
import { ScannerView } from './components/scanner/ScannerView';
import { RestaurantAdminView } from './components/restaurant/RestaurantAdminView';
import { CustomerView } from './components/customer/CustomerView';
import { SuperAdminView } from './components/superadmin/SuperAdminView';
import { AuthPortalView } from './components/common/AuthPortalView';
import { SyncSimulationDrawer } from './components/sync/SyncSimulationDrawer';
import { NotificationDrawer } from './components/common/NotificationDrawer';
import { sound } from './services/audioService';
import { validateCustomerMagicToken } from './services/magicAuthService';

export default function App() {
  const [state, setState] = useState(() => restoStore.getState());
  const [activeTab, setActiveTab] = useState<string>('scanner');
  const [restoAdminSubTab, setRestoAdminSubTab] = useState<string>('dashboard');
  const [superAdminSubTab, setSuperAdminSubTab] = useState<string>('restaurants');
  const [isSyncDrawerOpen, setIsSyncDrawerOpen] = useState(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(sound.isSoundEnabled());

  // Password / PIN Session State across portals (Requirement 2 & 3: Unified App + Secure Sessions)
  const [sessions, setSessions] = useState<Record<UserRole, boolean>>(() => {
    try {
      const saved = sessionStorage.getItem('restopass_portal_sessions');
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default: Authenticated for seamless onboarding, with instant ability to lock/sign out
    return {
      stand_staff: true,
      restaurant_admin: true,
      customer: true,
      super_admin: true,
    };
  });

  const [sessionLabels, setSessionLabels] = useState<Record<UserRole, string>>({
    stand_staff: 'Stand 1 Operator (Eric N.)',
    restaurant_admin: 'Claire Mukamurenzi (Boss)',
    customer: 'Jean-Paul Habimana (#28491)',
    super_admin: 'Ephrem (Global Super Admin)',
  });

  useEffect(() => {
    const unsubscribe = restoStore.subscribe(() => {
      setState({ ...restoStore.getState() });
    });
    return unsubscribe;
  }, []);

  // Synchronize root HTML data-theme and class
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    if (state.theme === 'light') {
      document.documentElement.classList.add('theme-light');
      document.documentElement.classList.remove('theme-dark');
    } else {
      document.documentElement.classList.add('theme-dark');
      document.documentElement.classList.remove('theme-light');
    }
  }, [state.theme]);

  // Automatic Online / Offline detection & instant background database sync
  useEffect(() => {
    const handleOnline = () => {
      restoStore.setNetworkStatus('online');
      restoStore.syncPendingOutbox();
    };

    const handleOffline = () => {
      restoStore.setNetworkStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync if online
    if (typeof window !== 'undefined' && navigator.onLine) {
      if (restoStore.getState().networkStatus !== 'offline') {
        restoStore.syncPendingOutbox();
      }
    }

    // Fast real-time multi-device sync heartbeat (every 3 seconds):
    // Whenever online, pulls new registrations and scans from server
    // so laptop and phone see each other's actions in real time!
    const syncInterval = setInterval(() => {
      if (typeof window !== 'undefined' && navigator.onLine) {
        const cur = restoStore.getState();
        if (cur.networkStatus === 'online') {
          restoStore.pullStateFromServer();
          const hasUnsynced = cur.syncOutbox.some((item) => !item.syncedToCloud);
          if (hasUnsynced) {
            restoStore.syncPendingOutbox();
          }
        }
      }
    }, 3000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
    };
  }, []);

  const handleRoleChange = useCallback((role: UserRole, updateHash = true) => {
    restoStore.setRole(role);
    if (role === 'stand_staff') {
      setActiveTab('scanner');
      if (updateHash && typeof window !== 'undefined') window.location.hash = '#/scanner';
    } else if (role === 'restaurant_admin') {
      setActiveTab('dashboard');
      setRestoAdminSubTab('dashboard');
      if (updateHash && typeof window !== 'undefined') window.location.hash = '#/boss';
    } else if (role === 'customer') {
      setActiveTab('my_card');
      if (updateHash && typeof window !== 'undefined') window.location.hash = '#/customer';
    } else if (role === 'super_admin') {
      setActiveTab('restaurants');
      setSuperAdminSubTab('restaurants');
      if (updateHash && typeof window !== 'undefined') window.location.hash = '#/superadmin';
    }
  }, []);

  // Unified app routing: URL Hash sync (#/scanner, #/boss, #/customer, #/superadmin)
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash;
      const hash = rawHash.toLowerCase();

      // Check for direct restaurant slug or code in URL:
      // Supports #/portal/RW01, #/portal/RW02, #/cafeteria/RW01, or ?resto=RW01
      const restoParamMatch = rawHash.match(/[?&]resto=([a-zA-Z0-9_-]+)/i);
      const portalPathMatch = rawHash.match(/#(?:portal|cafeteria|r)\/([a-zA-Z0-9_-]+)/i);
      const targetSlug = restoParamMatch?.[1] || portalPathMatch?.[1];

      if (targetSlug) {
        const targetClean = targetSlug.toLowerCase();
        const availableRestos = restoStore.getState().restaurants;
        const matched = availableRestos.find(
          (r) =>
            r.code.toLowerCase() === targetClean ||
            r.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(targetClean.replace(/[^a-z0-9]/g, ''))
        );
        if (matched && matched.code !== restoStore.getState().currentRestaurantCode) {
          restoStore.setRestaurantCode(matched.code);
        }
      }

      // Check for WhatsApp 1-tap magic authentication token (?auth=...)
      if (rawHash.includes('auth=')) {
        const match = rawHash.match(/auth=([^&]+)/);
        if (match && match[1]) {
          const token = match[1];
          const decoded = validateCustomerMagicToken(token);
          if (decoded) {
            const allCustomers = restoStore.getState().customers;
            const matchedCust = allCustomers.find(
              (c) => c.id === decoded.customerId || c.memberNo === decoded.memberNo
            );
            if (matchedCust) {
              restoStore.setRestaurantCode(decoded.restaurantCode);
              restoStore.setCustomer(matchedCust.id);
              setSessions((prev) => {
                const next = { ...prev, customer: true };
                try {
                  sessionStorage.setItem('restopass_portal_sessions', JSON.stringify(next));
                } catch {}
                return next;
              });
              setSessionLabels((prev) => ({
                ...prev,
                customer: `${matchedCust.name} (#${matchedCust.memberNo})`,
              }));
              handleRoleChange('customer', false);
              return;
            }
          }
        }
      }

      if (hash.includes('scanner') || hash.includes('stand')) {
        handleRoleChange('stand_staff', false);
      } else if (hash.includes('super')) {
        handleRoleChange('super_admin', false);
      } else if (hash.includes('boss') || hash.includes('resto-admin') || (hash.includes('admin') && !hash.includes('super'))) {
        handleRoleChange('restaurant_admin', false);
      } else if (
        hash.includes('customer') ||
        hash.includes('patron') ||
        hash.includes('card') ||
        hash.includes('portal') ||
        hash.includes('cafeteria')
      ) {
        handleRoleChange('customer', false);
      }
    };

    if (typeof window !== 'undefined' && window.location.hash) {
      handleHashChange();
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [handleRoleChange]);

  const handleLoginSuccess = (role: UserRole, userLabel: string) => {
    setSessions((prev) => {
      const next = { ...prev, [role]: true };
      try {
        sessionStorage.setItem('restopass_portal_sessions', JSON.stringify(next));
      } catch {}
      return next;
    });
    setSessionLabels((prev) => ({ ...prev, [role]: userLabel }));
    handleRoleChange(role);
  };

  const handleLockSession = (role: UserRole) => {
    setSessions((prev) => {
      const next = { ...prev, [role]: false };
      try {
        sessionStorage.setItem('restopass_portal_sessions', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (state.currentRole === 'restaurant_admin') {
      setRestoAdminSubTab(tab);
    } else if (state.currentRole === 'super_admin') {
      setSuperAdminSubTab(tab);
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    sound.setSoundEnabled(next);
    setSoundEnabled(next);
  };

  const currentRestaurant = restoStore.getCurrentRestaurant();

  return (
    <div className={`min-h-screen ${state.theme === 'light' ? 'theme-light bg-slate-50 text-slate-900' : 'theme-dark bg-slate-950 text-slate-100'} flex flex-col font-sans selection:bg-emerald-500 selection:text-white transition-colors duration-200`}>
      {/* Top Bar Header adhering strictly to Top Bar Contract */}
      <Header
        currentRole={state.currentRole}
        onRoleChange={(role) => handleRoleChange(role)}
        language={state.currentLanguage}
        onLanguageChange={(lang: Language) => restoStore.setLanguage(lang)}
        theme={state.theme}
        onToggleTheme={() => restoStore.toggleTheme()}
        networkStatus={state.networkStatus}
        onNetworkChange={(status) => restoStore.setNetworkStatus(status)}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        restaurantName={currentRestaurant?.name || 'Kigali Campus Resto'}
        restaurantCode={state.currentRestaurantCode}
        onOpenSyncDrawer={() => setIsSyncDrawerOpen(true)}
        onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isSessionActive={Boolean(sessions[state.currentRole])}
        onLockSession={() => handleLockSession(state.currentRole)}
        sessionUserLabel={sessionLabels[state.currentRole]}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto pb-16">
        {!sessions[state.currentRole] ? (
          <AuthPortalView
            currentRole={state.currentRole}
            language={state.currentLanguage}
            onLoginSuccess={handleLoginSuccess}
            onRoleSelect={(role) => handleRoleChange(role)}
          />
        ) : (
          <>
            {state.currentRole === 'stand_staff' && (
              <ScannerView language={state.currentLanguage} />
            )}

            {state.currentRole === 'restaurant_admin' && (
              <RestaurantAdminView
                language={state.currentLanguage}
                activeSubTab={restoAdminSubTab}
                onSubTabChange={(sub) => {
                  setRestoAdminSubTab(sub);
                  setActiveTab(sub);
                }}
              />
            )}

            {state.currentRole === 'customer' && (
              <CustomerView
                language={state.currentLanguage}
                activeSubTab={activeTab}
                onNavigateTab={(tab) => handleTabChange(tab)}
              />
            )}

            {state.currentRole === 'super_admin' && (
              <SuperAdminView
                language={state.currentLanguage}
                activeSubTab={superAdminSubTab}
                onSubTabChange={(sub) => {
                  setSuperAdminSubTab(sub);
                  setActiveTab(sub);
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Sync Engine & Local Authority Drawer */}
      <SyncSimulationDrawer
        isOpen={isSyncDrawerOpen}
        onClose={() => setIsSyncDrawerOpen(false)}
      />

      {/* In-App / System Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        onNavigateTab={(tab) => handleTabChange(tab)}
      />
    </div>
  );
}
