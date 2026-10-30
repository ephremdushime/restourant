import React, { useState, useEffect, useCallback } from 'react';
import { restoStore } from './store/restoStore';
import { UserRole, Language } from './types';
import { Header } from './components/common/Header';
import { ScannerView } from './components/scanner/ScannerView';
import { RestaurantAdminView } from './components/restaurant/RestaurantAdminView';
import { CustomerView } from './components/customer/CustomerView';
import { SuperAdminView } from './components/superadmin/SuperAdminView';
import { AuthPortalView } from './components/common/AuthPortalView';
import { NotificationDrawer } from './components/common/NotificationDrawer';
import { sound } from './services/audioService';
import { validateCustomerMagicToken } from './services/magicAuthService';

export default function App() {
  const [state, setState] = useState(() => restoStore.getState());
  const [activeTab, setActiveTab] = useState<string>('scanner');
  const [restoAdminSubTab, setRestoAdminSubTab] = useState<string>('dashboard');
  const [superAdminSubTab, setSuperAdminSubTab] = useState<string>('restaurants');
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(sound.isSoundEnabled());

  // Password / PIN Session State across portals (Finding 4: Strict Server-Side Authentication)
  const [sessions, setSessions] = useState<Record<UserRole, boolean>>(() => {
    try {
      const saved = sessionStorage.getItem('restopass_portal_sessions');
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default: Unauthenticated across all portals for strict security isolation
    return {
      stand_staff: false,
      restaurant_admin: false,
      customer: false,
      super_admin: false,
    };
  });

  const [sessionLabels, setSessionLabels] = useState<Record<UserRole, string>>(() => {
    try {
      const saved = sessionStorage.getItem('restopass_portal_session_labels');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      stand_staff: 'Not signed in',
      restaurant_admin: 'Not signed in',
      customer: 'Not signed in',
      super_admin: 'Not signed in',
    };
  });

  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('restopass_demo_mode') === 'true';
    } catch {}
    return false;
  });

  const handleToggleDemoMode = () => {
    setIsDemoMode((prev) => {
      const next = !prev;
      restoStore.setDemoMode(next);
      return next;
    });
  };

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
          const decoded = validateCustomerMagicToken(token, { markAsRedeemed: true });
          if (decoded) {
            const allCustomers = restoStore.getState().customers;
            const matchedCust = allCustomers.find(
              (c) => c.id === decoded.customerId || c.memberNo === decoded.memberNo
            );
            if (matchedCust) {
              restoStore.setRestaurantCode(decoded.restaurantCode);
              restoStore.setCustomer(matchedCust.id);
              restoStore
                .loginToServer({
                  role: 'customer',
                  username: matchedCust.memberNo,
                  pin: '1234',
                  restaurantCode: decoded.restaurantCode,
                })
                .then(() => {
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
                });
              return;
            }
          }
        }
      }

      // Auto-pair cashier device if pair_key query param exists in hash or search
      if (hash.includes('pair_key=') || (typeof window !== 'undefined' && window.location.search.includes('pair_key='))) {
        const queryStr = hash.includes('?') ? hash.split('?')[1] : window.location.search.replace('?', '');
        const params = new URLSearchParams(queryStr);
        const pairKey = params.get('pair_key');
        const restoCode = params.get('resto') || state.currentRestaurantCode;
        if (pairKey) {
          restoStore.pairTerminalDevice({
            restaurantCode: restoCode,
            pairingKeyOrCode: pairKey,
            deviceType: navigator.userAgent.includes('Mobile') ? 'phone' : 'laptop_scanner',
          });
        }
      }

      if (hash.includes('scanner') || hash.includes('stand')) {
        handleRoleChange('stand_staff', false);
      } else if (hash.includes('super')) {
        if (hash.includes('subtab=deployment')) {
          setSuperAdminSubTab('deployment');
          setActiveTab('deployment');
        } else if (hash.includes('subtab=')) {
          const sub = new URLSearchParams(hash.split('?')[1] || '').get('subtab');
          if (sub) {
            setSuperAdminSubTab(sub);
            setActiveTab(sub);
          }
        }
        handleRoleChange('super_admin', false);
      } else if (hash.includes('boss') || hash.includes('resto-admin') || (hash.includes('admin') && !hash.includes('super'))) {
        handleRoleChange('restaurant_admin', false);
      } else if (
        hash.includes('customer') ||
        hash.includes('register') ||
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
    setSessionLabels((prev) => {
      const next = { ...prev, [role]: userLabel };
      try {
        sessionStorage.setItem('restopass_portal_session_labels', JSON.stringify(next));
      } catch {}
      return next;
    });
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
    setSessionLabels((prev) => {
      const next = { ...prev, [role]: 'Not signed in' };
      try {
        sessionStorage.setItem('restopass_portal_session_labels', JSON.stringify(next));
      } catch {}
      return next;
    });
    restoStore.logoutFromServer();
    restoStore.logAudit({
      actorRole: role,
      actorName: 'User Session',
      action: 'PORTAL_LOCKED',
      details: `User signed out and locked portal session for ${role}`,
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
        onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isSessionActive={Boolean(sessions[state.currentRole])}
        onLockSession={() => handleLockSession(state.currentRole)}
        sessionUserLabel={sessionLabels[state.currentRole]}
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto pb-16">
        {!sessions[state.currentRole] ? (
          <AuthPortalView
            currentRole={state.currentRole}
            language={state.currentLanguage}
            onLoginSuccess={handleLoginSuccess}
            onRoleSelect={(role) => handleRoleChange(role)}
            isDemoMode={isDemoMode}
            onToggleDemoMode={handleToggleDemoMode}
          />
        ) : (
          <>
            {state.currentRole === 'stand_staff' && (
              <ScannerView
                language={state.currentLanguage}
                operatorName={sessionLabels.stand_staff !== 'Not signed in' ? sessionLabels.stand_staff : undefined}
                isDemoMode={isDemoMode}
              />
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
                isDemoMode={isDemoMode}
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

      {/* In-App / System Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        onNavigateTab={(tab) => handleTabChange(tab)}
      />
    </div>
  );
}
