import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import { generateCardToken } from '../../services/cryptoService';
import { QrCanvas } from '../common/QrCanvas';
import {
  Send,
  Clock,
  CheckCircle2,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import { PWAInstallBanner } from './PWAInstallBanner';
import { PinSetupModal } from './PinSetupModal';
import { DashboardLockScreen } from './DashboardLockScreen';
import {
  CustomerPortalLayout,
  CustomerPortalPage,
  CustomerProfileSubPage,
} from './CustomerPortalLayout';
import { CustomerHomePage } from './CustomerHomePage';
import { CustomerCardPage } from './CustomerCardPage';
import { CustomerActivityPage, CustomerActivityFilter } from './CustomerActivityPage';
import {
  CustomerNotificationsPage,
  CustomerNotificationFilter,
} from './CustomerNotificationsPage';
import { CustomerProfilePage } from './CustomerProfilePage';

interface CustomerViewProps {
  language: Language;
  activeSubTab?: string;
  onNavigateTab?: (tab: string) => void;
  onSignOut?: () => void;
  isDemoMode?: boolean;
}

export function resolveCustomerPortalRoute(
  subTab?: string,
  hash?: string
): { page: CustomerPortalPage; profileSubPage: CustomerProfileSubPage } {
  const raw = `${subTab || ''} ${(hash || '').replace(/^#\/?/, '')}`.toLowerCase();

  if (raw.includes('security') || raw.includes('pin')) {
    return { page: 'profile', profileSubPage: 'security' };
  }
  if (raw.includes('subscription') || raw.includes('renewal')) {
    return { page: 'profile', profileSubPage: 'subscription' };
  }
  if (raw.includes('privacy')) {
    return { page: 'profile', profileSubPage: 'privacy' };
  }
  if (raw.includes('account')) {
    return { page: 'profile', profileSubPage: 'account' };
  }
  if (raw.includes('profile') || raw.includes('settings')) {
    return { page: 'profile', profileSubPage: 'personal' };
  }
  if (raw.includes('notification') || raw.includes('alerts')) {
    return { page: 'notifications', profileSubPage: 'personal' };
  }
  if (raw.includes('activity') || raw.includes('history')) {
    return { page: 'activity', profileSubPage: 'personal' };
  }
  if (raw.includes('my_card') || raw.includes('qr_pass') || raw.includes('/card') || subTab === 'card') {
    return { page: 'my_card', profileSubPage: 'personal' };
  }
  return { page: 'home', profileSubPage: 'personal' };
}

export const CustomerView: React.FC<CustomerViewProps> = ({
  language,
  activeSubTab,
  onNavigateTab,
  onSignOut,
}) => {
  const t = translations[language] || translations.en;
  const state = restoStore.getState();
  const customer = restoStore.getCurrentCustomer();

  // Strictly lock restaurant context to the authenticated customer's tenant
  const currentRestaurant =
    (customer
      ? state.restaurants.find((r) => r.code === customer.restaurantCode)
      : undefined) || restoStore.getCurrentRestaurant();

  // Customer digital access entitlement and renewal state
  const subSettings = restoStore.getStudentSubscriptionSettings();
  const customerSub = customer ? restoStore.getCustomerSubscription(customer.id) : null;
  const dashboardEntitlement = customer
    ? restoStore.checkStudentEntitlement(customer.id, 'customer_dashboard')
    : null;
  const freeAccessExpired = Boolean(
    customer?.customerAccessStatus === 'complimentary' &&
      customer.freeAccessExpiresAt &&
      new Date(customer.freeAccessExpiresAt).getTime() <= Date.now()
  );
  const isDashboardGated = Boolean(
    customer &&
      (customer.customerAccessStatus === 'pending_super_admin_activation' ||
        customer.customerAccessStatus === 'payment_required' ||
        customer.customerAccessStatus === 'expired' ||
        freeAccessExpired ||
        (subSettings.enabled && (!dashboardEntitlement || !dashboardEntitlement.allowed)))
  );

  // Authoritative ledger-derived meal balance
  const balance = customer && !isDashboardGated ? restoStore.getCustomerBalance(customer.id) : 0;

  // Retained for MTN MoMo provider contract & gated notice
  const momoProvider = 'mtn_momo' as const;
  void momoProvider;

  const [transferRequiresSub, setTransferRequiresSub] = useState(false);

  // Dynamic 30-second token rotation (only generated when dashboard subscription is active)
  const [tokenInfo, setTokenInfo] = useState(() =>
    customer && !isDashboardGated && restoStore.isDemoModeActive()
      ? restoStore.getCustomerPhoneQr(customer)
      : { token: '', step: 0, secondsRemaining: 0 }
  );
  const [qrPassType, setQrPassType] = useState<'dynamic' | 'permanent'>('dynamic');

  // Security PIN & Instant Off-Screen Auto-Lock
  const [isDashboardLocked, setIsDashboardLocked] = useState(false);
  const [showPinSetupModal, setShowPinSetupModal] = useState(
    Boolean(customer && !isDashboardGated && !customer.hasCustomPin)
  );

  useEffect(() => {
    if (customer && !isDashboardGated && !customer.hasCustomPin) {
      setShowPinSetupModal(true);
    }
  }, [customer?.id, customer?.hasCustomPin, isDashboardGated]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (customer?.hasCustomPin && !isDashboardGated) {
          setIsDashboardLocked(true);
        }
      }
    };

    const handleWindowBlur = () => {
      if (customer?.hasCustomPin && document.hidden && !isDashboardGated) {
        setIsDashboardLocked(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [customer?.hasCustomPin, isDashboardGated]);

  const [permanentCardToken, setPermanentCardToken] = useState(() =>
    customer && !isDashboardGated && restoStore.isDemoModeActive()
      ? generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion)
      : ''
  );

  useEffect(() => {
    let active = true;
    const updateCardToken = async () => {
      if (!customer || isDashboardGated) {
        if (active) setPermanentCardToken('');
        return;
      }
      const token = restoStore.isDemoModeActive()
        ? generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion)
        : await restoStore.getServerCustomerCardQr(customer);
      if (active) setPermanentCardToken(token);
    };
    void updateCardToken();
    return () => {
      active = false;
    };
  }, [
    customer?.id,
    customer?.restaurantCode,
    customer?.memberNo,
    customer?.cardVersion,
    customer?.cardStatus,
    isDashboardGated,
  ]);

  const requestCustomerPhoneQr = async () => {
    if (!customer || isDashboardGated) {
      setTokenInfo({ token: '', step: 0, secondsRemaining: 0 });
      return;
    }
    const nextToken = restoStore.isDemoModeActive()
      ? restoStore.getCustomerPhoneQr(customer)
      : await restoStore.getServerCustomerPhoneQr(customer);
    setTokenInfo(nextToken);
  };

  const handleForceRefresh = () => {
    void requestCustomerPhoneQr();
  };

  useEffect(() => {
    if (!customer || isDashboardGated) {
      setTokenInfo({ token: '', step: 0, secondsRemaining: 0 });
      return;
    }

    let active = true;
    const updateToken = async () => {
      const nextToken = restoStore.isDemoModeActive()
        ? restoStore.getCustomerPhoneQr(customer)
        : await restoStore.getServerCustomerPhoneQr(customer);
      if (active) setTokenInfo(nextToken);
    };

    void updateToken();
    const refreshInterval = setInterval(() => {
      void updateToken();
    }, 20000);
    const countdownInterval = setInterval(() => {
      if (active) {
        setTokenInfo((current) => ({
          ...current,
          secondsRemaining: current.token ? Math.max(0, current.secondsRemaining - 1) : 0,
        }));
      }
    }, 1000);

    return () => {
      active = false;
      clearInterval(refreshInterval);
      clearInterval(countdownInterval);
    };
  }, [
    customer?.id,
    customer?.restaurantCode,
    customer?.memberNo,
    customer?.keyVersion,
    isDashboardGated,
  ]);

  // Page Navigation State (Home, My Card, Activity, Notifications, Profile & Settings)
  const initialRoute = resolveCustomerPortalRoute(
    activeSubTab,
    typeof window !== 'undefined' ? window.location.hash : ''
  );
  const [activePage, setActivePage] = useState<CustomerPortalPage>(initialRoute.page);
  const [activeProfileSubPage, setActiveProfileSubPage] = useState<CustomerProfileSubPage>(
    initialRoute.profileSubPage
  );
  const [historyFilter, setHistoryFilter] = useState<CustomerActivityFilter>('all');
  const [notifFilter, setNotifFilter] = useState<CustomerNotificationFilter>('all');

  // Transfer Modal State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [platesToTransfer, setPlatesToTransfer] = useState(2);
  const [transferPin, setTransferPin] = useState('');
  const [transferMessage, setTransferMessage] = useState<{ text: string; isError: boolean } | null>(
    null
  );
  const [transferRequestId, setTransferRequestId] = useState<string | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  useEffect(() => setTransferRequestId(null), [recipientQuery, platesToTransfer, customer?.id]);

  const handleNavigatePage = useCallback(
    (page: CustomerPortalPage, profileSub?: CustomerProfileSubPage) => {
      setActivePage(page);
      if (profileSub) {
        setActiveProfileSubPage(profileSub);
      }
      if (typeof window !== 'undefined') {
        const subSuffix =
          page === 'profile' && profileSub && profileSub !== 'personal' ? `/${profileSub}` : '';
        const nextHash = `#/customer/${page}${subSuffix}`;
        if (window.location.hash !== nextHash) {
          window.history.pushState(null, '', nextHash);
        }
      }
      onNavigateTab?.(page === 'profile' && profileSub ? profileSub : page);
    },
    [onNavigateTab]
  );

  // Sync with external activeSubTab prop and browser Back/Forward hash navigation
  useEffect(() => {
    if (isDashboardGated) return;
    if (activeSubTab === 'transfer') {
      setTransferModalOpen(true);
      return;
    }
    if (activeSubTab === 'lock') {
      setIsDashboardLocked(true);
      return;
    }
    if (activeSubTab) {
      const resolved = resolveCustomerPortalRoute(activeSubTab, '');
      setActivePage(resolved.page);
      setActiveProfileSubPage(resolved.profileSubPage);
    }
  }, [activeSubTab, isDashboardGated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopOrHash = () => {
      const hash = window.location.hash || '';
      if (!hash.toLowerCase().includes('customer')) return;
      const resolved = resolveCustomerPortalRoute('', hash);
      setActivePage(resolved.page);
      setActiveProfileSubPage(resolved.profileSubPage);
    };
    window.addEventListener('hashchange', onPopOrHash);
    window.addEventListener('popstate', onPopOrHash);
    return () => {
      window.removeEventListener('hashchange', onPopOrHash);
      window.removeEventListener('popstate', onPopOrHash);
    };
  }, []);

  const customerNotifications =
    customer && !isDashboardGated
      ? restoStore.getCustomerNotifications(customer.id, customer.restaurantCode)
      : [];
  const unreadNotifCount =
    customer && !isDashboardGated ? restoStore.getUnreadNotificationCount(customer.id) : 0;

  // Recipient Lookup Helper (strictly within the authenticated customer's restaurant)
  const foundRecipient = customer
    ? state.customers.find(
        (c) =>
          c.restaurantCode === customer.restaurantCode &&
          c.id !== customer.id &&
          (c.memberNo === recipientQuery.trim() ||
            c.phone.replace(/[\s-]/g, '') === recipientQuery.trim().replace(/[\s-]/g, ''))
      )
    : null;

  const maskName = (name: string) => {
    return name
      .split(' ')
      .map((part) => (part.length > 2 ? `${part[0]}***${part.slice(-1)}` : `${part[0]}*`))
      .join(' ');
  };

  const handleExecuteTransfer = async () => {
    if (!customer || !foundRecipient) {
      setTransferMessage({ text: 'Recipient not found in this restaurant', isError: true });
      return;
    }
    if (!navigator.onLine) {
      setTransferMessage({
        text: 'An internet connection is required to securely authorize a plate transfer. Reconnect and retry.',
        isError: true,
      });
      return;
    }
    const authToken = restoStore.getAuthToken();
    if (!authToken) {
      setTransferMessage({
        text: 'Your secure session has expired. Please sign in again.',
        isError: true,
      });
      return;
    }

    const requestId = transferRequestId || globalThis.crypto.randomUUID();
    setTransferRequestId(requestId);
    setTransferSubmitting(true);
    try {
      const response = await fetch('/api/customer/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          recipientIdentifier: foundRecipient.memberNo,
          plates: Number(platesToTransfer),
          pin: transferPin,
          idempotencyKey: requestId,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setTransferMessage({
          text: result.error || 'Transfer failed. No transfer was confirmed.',
          isError: true,
        });
        if (result.requiresSubscription) setTransferRequiresSub(true);
        return;
      }

      await restoStore.pullStateFromServer();
      setTransferMessage({ text: t.customer.transferSuccess, isError: false });
      setTransferRequiresSub(false);
      setTransferRequestId(null);
      setTimeout(() => {
        setTransferModalOpen(false);
        setTransferMessage(null);
        setTransferPin('');
        setRecipientQuery('');
      }, 1500);
    } catch {
      setTransferMessage({
        text: 'Network error. Retry when connected; the request is protected against duplicate processing.',
        isError: true,
      });
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleToggleLockCard = () => {
    if (!customer || isDashboardGated) return;
    const nextStatus = customer.cardStatus === 'locked' ? 'active' : 'locked';
    restoStore.setCustomerCardStatus(customer.id, nextStatus, customer.name);
  };

  const customerHistory =
    customer && !isDashboardGated
      ? state.ledgerEntries
          .filter(
            (e) =>
              e.customerId === customer.id &&
              (!e.restaurantCode || e.restaurantCode === customer.restaurantCode)
          )
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      : [];

  if (customer?.registrationStatus === 'pending_boss_approval') {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 space-y-5">
        <PWAInstallBanner />
        <div className="rounded-3xl border border-amber-500/50 bg-slate-900 p-6 sm:p-8 space-y-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Account Partially Activated</h2>
              <p className="text-xs text-amber-200">Reception payment confirmed</p>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Member number</span>
              <strong className="font-mono text-white">#{customer.memberNo}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Grace meals available</span>
              <strong className="text-emerald-300">
                {Math.max(0, customer.gracePlatesRemaining ?? 4)} / 4
              </strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Registration review</span>
              <strong className="text-amber-300">Awaiting boss approval</strong>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 flex flex-col items-center gap-2">
            <QrCanvas
              value={generateCardToken(
                customer.restaurantCode,
                customer.memberNo,
                customer.cardVersion
              )}
              size={210}
              className="max-w-full"
            />
            <span className="text-xs font-bold text-slate-900">
              Temporary meal pass · #{customer.memberNo}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-slate-200">
            Your reception payment has been confirmed. You may use up to four grace meals while the Restaurant Boss reviews your registration. Your full dashboard and physical card will be enabled after approval.
          </p>
          <p className="text-xs text-amber-200">
            Show this QR at the cafeteria scanner for your four provisional grace meals. Do not share or post your QR code.
          </p>
        </div>
      </div>
    );
  }

  if (customer?.customerAccessStatus === 'pending_super_admin_activation') {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="rounded-3xl border border-amber-500/50 bg-slate-900 p-6 sm:p-8 space-y-3 shadow-xl">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          <h2 className="text-xl font-black text-white">Registration Approved</h2>
          <p className="text-sm text-slate-200">
            Your Restaurant Boss has approved your registration and your physical card is ready for issuance. Your one-month complimentary digital access is awaiting Super Admin activation.
          </p>
          <p className="text-xs text-slate-400">
            You will receive dashboard access as soon as the complimentary month is activated.
          </p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Customer Sign-In Required</h2>
        <p className="text-sm text-slate-200 leading-relaxed">
          Your customer session could not be verified or has expired. Please sign in with your registered phone number or Member ID to view your digital meal pass.
        </p>
        <button
          onClick={() => onNavigateTab?.('scanner')}
          className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-colors cursor-pointer"
        >
          Go to Sign-In Portal
        </button>
      </div>
    );
  }

  // Gated view when subscription monetization is enabled and customer has no active digital access
  if (isDashboardGated) {
    return (
      <div className="max-w-md mx-auto px-4 py-6 space-y-5 animate-in fade-in duration-200">
        <PWAInstallBanner />
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-xl">
              🍽️
            </div>
            <div>
              <h1 className="text-base font-black text-white">
                {currentRestaurant?.name || 'Campus Dining'}
              </h1>
              <p className="text-xs text-slate-300">
                Member #{customer.memberNo} · {customer.name}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900 border border-amber-500/70 shadow-xl space-y-4">
          <div className="flex items-center gap-3 text-amber-400">
            <Smartphone className="w-6 h-6 shrink-0" />
            <h2 className="text-lg font-black text-white">Digital Dashboard Access Required</h2>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/40">
            <div className="text-xs text-slate-300 uppercase font-mono font-semibold">
              Monthly Access Fee
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              {restoStore.getStudentSubscriptionPrice(customer.restaurantCode).toLocaleString()} RWF{' '}
              <span className="text-sm font-normal text-slate-300">/ month</span>
            </div>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">
            {customer.customerAccessStatus === 'payment_required' ||
            customer.customerAccessStatus === 'expired'
              ? 'Your complimentary or paid digital access period has ended. Pay the monthly access fee to restore your dashboard.'
              : 'Digital dashboard access requires an active monthly entitlement.'}
          </p>
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 space-y-2">
            <h3 className="text-sm font-bold text-amber-200">How to renew access</h3>
            <ol className="list-decimal pl-5 space-y-1 text-xs text-slate-200">
              <li>Visit the cafeteria reception and pay the displayed monthly access fee.</li>
              <li>Keep your cash receipt or MTN MoMo / bank transaction reference.</li>
              <li>
                Super Admin verifies the payment and activates your next 30-day access period.
              </li>
            </ol>
            <p className="text-xs text-amber-100">
              Your dashboard remains locked until verification is complete.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-500/70 space-y-1.5">
            <div className="flex items-center gap-2 font-black text-emerald-200">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>Physical Card Remains Active</span>
            </div>
            <p className="text-xs text-slate-100 leading-relaxed">
              Dashboard expiry does not remove your meal balance or block your physical card. Continue using your printed card at cafeteria scanner stations.
            </p>
          </div>
          <div className="space-y-3.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled
              className="w-full py-3.5 px-4 rounded-xl bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg opacity-50 cursor-not-allowed"
            >
              <Smartphone className="w-5 h-5" />
              <span>Mobile Money Payments Coming Soon</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
        <PWAInstallBanner />
      </div>

      <CustomerPortalLayout
        customer={customer}
        restaurant={currentRestaurant}
        activePage={activePage}
        activeProfileSubPage={activeProfileSubPage}
        unreadNotifCount={unreadNotifCount}
        balance={balance}
        onNavigatePage={handleNavigatePage}
        onLockDashboard={() => setIsDashboardLocked(true)}
        onSignOut={onSignOut}
      >
        {activePage === 'home' && (
          <CustomerHomePage
            customer={customer}
            restaurant={currentRestaurant}
            balance={balance}
            recentActivity={customerHistory}
            unreadNotifCount={unreadNotifCount}
            lowBalanceTitle={t.scanner.lowBalanceWarning}
            lowBalanceMessage={t.customer.lowBalanceBanner}
            unlockCardLabel={t.customer.unlockMyCard}
            transferPlatesLabel={t.customer.transferPlates}
            onNavigatePage={handleNavigatePage}
            onOpenTransferModal={() => setTransferModalOpen(true)}
            onToggleLockCard={handleToggleLockCard}
          />
        )}

        {activePage === 'my_card' && (
          <CustomerCardPage
            customer={customer}
            restaurant={currentRestaurant}
            qrPassType={qrPassType}
            onChangeQrPassType={setQrPassType}
            tokenInfo={tokenInfo}
            permanentCardToken={permanentCardToken}
            onForceRefresh={handleForceRefresh}
            onToggleLockCard={handleToggleLockCard}
            lockMyCardLabel={t.customer.lockMyCard}
            unlockMyCardLabel={t.customer.unlockMyCard}
          />
        )}

        {activePage === 'activity' && (
          <CustomerActivityPage
            customer={customer}
            balance={balance}
            entries={customerHistory}
            activeFilter={historyFilter}
            onChangeFilter={setHistoryFilter}
          />
        )}

        {activePage === 'notifications' && (
          <CustomerNotificationsPage
            customer={customer}
            notifications={customerNotifications}
            unreadNotifCount={unreadNotifCount}
            activeFilter={notifFilter}
            onChangeFilter={setNotifFilter}
            onMarkAsRead={(id) => restoStore.markNotificationAsRead(id, customer.id)}
            onMarkAllAsRead={() => restoStore.markAllNotificationsAsRead(customer.id)}
            onNavigatePage={handleNavigatePage}
          />
        )}

        {activePage === 'profile' && (
          <CustomerProfilePage
            customer={customer}
            restaurant={currentRestaurant}
            balance={balance}
            activeSubPage={activeProfileSubPage}
            onChangeSubPage={(sub) => handleNavigatePage('profile', sub)}
            subscriptionSettings={subSettings}
            subscription={customerSub}
            monthlyPriceRwf={restoStore.getStudentSubscriptionPrice(customer.restaurantCode)}
            paymentHistory={state.studentSubscriptionPayments || []}
            onOpenPinSetup={() => setShowPinSetupModal(true)}
            onLockDashboard={() => setIsDashboardLocked(true)}
            onToggleLockCard={handleToggleLockCard}
            onSignOut={onSignOut}
            lockMyCardLabel={t.customer.lockMyCard}
            unlockMyCardLabel={t.customer.unlockMyCard}
          />
        )}
      </CustomerPortalLayout>

      {/* TRANSFER MODAL */}
      {transferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Send className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">{t.customer.transferPlates}</h3>
              </div>
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="text-slate-300 hover:text-white font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <p className="text-slate-200 text-xs sm:text-sm leading-relaxed">
              Transfer plates to a friend or classmate registered at{' '}
              <strong>{currentRestaurant?.name}</strong>.
            </p>

            <div className="space-y-3.5">
              <div>
                <label className="font-bold text-slate-200 block mb-1.5">
                  Recipient Member # or Phone
                </label>
                <input
                  type="text"
                  placeholder="e.g. 28492 or +250 785 119 220"
                  value={recipientQuery}
                  onChange={(e) => setRecipientQuery(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-400 outline-hidden"
                />
              </div>

              {foundRecipient && (
                <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-600 text-sm space-y-1">
                  <div className="text-xs uppercase font-bold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Recipient Verified</span>
                  </div>
                  <div className="font-bold text-white">
                    {maskName(foundRecipient.name)} (#{foundRecipient.memberNo})
                  </div>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-200 block mb-1.5">Plates to Transfer</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, balance)}
                  value={platesToTransfer}
                  onChange={(e) => setPlatesToTransfer(parseInt(e.target.value, 10) || 1)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-400 outline-hidden"
                />
                <div className="text-xs text-slate-300 mt-1">
                  Available balance: {balance} plates
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-200 block mb-1.5">Your Security PIN</label>
                <input
                  type="password"
                  maxLength={8}
                  placeholder="••••••"
                  value={transferPin}
                  onChange={(e) => setTransferPin(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-widest text-lg focus:border-emerald-400 outline-hidden"
                />
              </div>
            </div>

            {transferMessage && (
              <div
                className={`p-3 rounded-xl text-sm font-medium ${
                  transferMessage.isError
                    ? 'bg-rose-950/90 border border-rose-600 text-rose-100'
                    : 'bg-emerald-950/90 border border-emerald-600 text-emerald-100'
                }`}
              >
                {transferMessage.text}
              </div>
            )}

            {transferRequiresSub && (
              <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-600 text-amber-100 text-xs">
                Digital transfers require active dashboard access. Visit reception to pay the monthly fee; Super Admin must verify and activate your access before transfers resume.
              </div>
            )}

            <button
              type="button"
              onClick={handleExecuteTransfer}
              disabled={!foundRecipient || !transferPin || transferSubmitting}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm shadow-md transition-colors cursor-pointer"
            >
              {transferSubmitting ? 'Processing securely…' : 'Confirm & Transfer Plates'}
            </button>
          </div>
        </div>
      )}

      {/* SECURITY PIN SETUP MODAL */}
      <PinSetupModal
        customer={customer}
        isOpen={showPinSetupModal}
        onComplete={() => setShowPinSetupModal(false)}
        onCancel={() => setShowPinSetupModal(false)}
        isMandatory={!customer.hasCustomPin}
      />

      {/* INSTANT OFF-SCREEN AUTO-LOCK SCREEN */}
      {isDashboardLocked && (
        <DashboardLockScreen
          customer={customer}
          restaurant={currentRestaurant}
          onUnlock={() => setIsDashboardLocked(false)}
        />
      )}
    </>
  );
};
