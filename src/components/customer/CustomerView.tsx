import React, { useState, useEffect } from 'react';
import { Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import { generateCardToken } from '../../services/cryptoService';
import { QrCanvas } from '../common/QrCanvas';
import {
  Send,
  Lock,
  Unlock,
  History,
  AlertTriangle,
  Clock,
  CheckCircle2,
  RefreshCw,
  QrCode,
  ArrowUpRight,
  ArrowDownLeft,
  Utensils,
  Check,
  Bell,
  CheckCheck,
  Megaphone,
  DollarSign,
  ShieldAlert,
  ArrowRightLeft,
  ExternalLink,
  Tag,
  Copy,
  KeyRound,
  Shield,
  Smartphone,
} from 'lucide-react';
import { PWAInstallBanner } from './PWAInstallBanner';
import { PinSetupModal } from './PinSetupModal';
import { DashboardLockScreen } from './DashboardLockScreen';

interface CustomerViewProps {
  language: Language;
  activeSubTab?: string;
  onNavigateTab?: (tab: string) => void;
  isDemoMode?: boolean;
}

export const CustomerView: React.FC<CustomerViewProps> = ({
  language,
  activeSubTab,
  onNavigateTab,
}) => {
  const t = translations[language];
  const state = restoStore.getState();
  const currentRestaurant = restoStore.getCurrentRestaurant();

  const customer = restoStore.getCurrentCustomer();

  // Student Subscription & MoMo State (500 RWF/mo, 72h Grace, MoMo Checkout)
  const subSettings = restoStore.getStudentSubscriptionSettings();
  const customerSub = customer ? restoStore.getCustomerSubscription(customer.id) : null;
  const dashboardEntitlement = customer
    ? restoStore.checkStudentEntitlement(customer.id, 'customer_dashboard')
    : null;
  const isDashboardGated = Boolean(
    customer && subSettings.enabled && (!dashboardEntitlement || !dashboardEntitlement.allowed)
  );

  // Only read balance when dashboard subscription allows it
  const balance = customer && !isDashboardGated ? restoStore.getCustomerBalance(customer.id) : 0;

  const [subModalOpen, setSubModalOpen] = useState(false);
  const [momoPhone, setMomoPhone] = useState(customer?.phone || '+250 788 ');
  const [momoProvider, setMomoProvider] = useState<'mtn_momo' | 'airtel_money'>('mtn_momo');
  const [subCheckoutLoading, setSubCheckoutLoading] = useState(false);
  const [subCheckoutMessage, setSubCheckoutMessage] = useState<{
    text: string;
    isError: boolean;
    ref?: string;
  } | null>(null);
  const [transferRequiresSub, setTransferRequiresSub] = useState(false);

  // Dynamic 30-second token rotation (only generated when dashboard subscription is active)
  const [tokenInfo, setTokenInfo] = useState(() =>
    customer && !isDashboardGated
      ? restoStore.getCustomerPhoneQr(customer)
      : { token: '', step: 0, secondsRemaining: 0 }
  );
  const [qrPassType, setQrPassType] = useState<'dynamic' | 'permanent'>('dynamic');
  const [copiedRef, setCopiedRef] = useState(false);
  const [plansExpanded, setPlansExpanded] = useState(false);

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

  // Badge Style Dynamic Theming
  const getBadgeTheme = (style?: 'gold' | 'emerald' | 'blue' | 'dark') => {
    switch (style) {
      case 'gold':
        return {
          gradient: 'from-slate-900 via-amber-950/40 to-slate-900',
          border: 'border-amber-500/60',
          accent: 'text-amber-300',
          badgeBg: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
          glow: 'bg-amber-500/10',
          glowSecondary: 'bg-amber-600/10',
          statusRing: 'ring-amber-400/40',
        };
      case 'blue':
        return {
          gradient: 'from-slate-900 via-blue-950/40 to-slate-900',
          border: 'border-blue-500/60',
          accent: 'text-sky-300',
          badgeBg: 'bg-blue-500/20 text-sky-200 border-blue-500/40',
          glow: 'bg-blue-500/10',
          glowSecondary: 'bg-sky-500/10',
          statusRing: 'ring-sky-400/40',
        };
      case 'dark':
        return {
          gradient: 'from-slate-950 via-zinc-900 to-slate-950',
          border: 'border-purple-500/50',
          accent: 'text-purple-300',
          badgeBg: 'bg-purple-500/20 text-purple-200 border-purple-500/40',
          glow: 'bg-purple-500/10',
          glowSecondary: 'bg-indigo-500/10',
          statusRing: 'ring-purple-400/40',
        };
      case 'emerald':
      default:
        return {
          gradient: 'from-slate-900 via-slate-900 to-emerald-950/40',
          border: 'border-slate-700',
          accent: 'text-emerald-300',
          badgeBg: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
          glow: 'bg-emerald-500/10',
          glowSecondary: 'bg-blue-500/10',
          statusRing: 'ring-emerald-400/40',
        };
    }
  };

  const badgeTheme = getBadgeTheme(currentRestaurant?.badgeStyle);

  const permanentCardToken =
    customer && !isDashboardGated
      ? generateCardToken(customer.restaurantCode, customer.memberNo, customer.cardVersion)
      : '';

  const handleForceRefresh = () => {
    if (customer && !isDashboardGated) {
      setTokenInfo(restoStore.getCustomerPhoneQr(customer));
    }
  };

  useEffect(() => {
    if (!customer || isDashboardGated) {
      setTokenInfo({ token: '', step: 0, secondsRemaining: 0 });
      return;
    }
    const updateToken = () => {
      setTokenInfo(restoStore.getCustomerPhoneQr(customer));
    };
    updateToken();
    const interval = setInterval(updateToken, 1000);
    return () => clearInterval(interval);
  }, [customer, isDashboardGated]);

  // View Mode: 'qr_pass' | 'notifications' | 'history'
  const [activeTab, setActiveTab] = useState<'qr_pass' | 'notifications' | 'history'>('qr_pass');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'meals' | 'topups' | 'transfers'>('all');
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'broadcast' | 'alerts'>('all');

  useEffect(() => {
    if (isDashboardGated) return;
    if (activeSubTab === 'my_card') setActiveTab('qr_pass');
    else if (activeSubTab === 'notifications') setActiveTab('notifications');
    else if (activeSubTab === 'history') setActiveTab('history');
    else if (activeSubTab === 'transfer') {
      setActiveTab('qr_pass');
      setTransferModalOpen(true);
    } else if (activeSubTab === 'lock') {
      setActiveTab('qr_pass');
    }
  }, [activeSubTab, isDashboardGated]);

  const customerNotifications =
    customer && !isDashboardGated
      ? restoStore.getCustomerNotifications(customer.id, state.currentRestaurantCode)
      : [];
  const unreadNotifCount =
    customer && !isDashboardGated ? restoStore.getUnreadNotificationCount(customer.id) : 0;

  // Transfer Modal State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [platesToTransfer, setPlatesToTransfer] = useState(2);
  const [transferPin, setTransferPin] = useState('');
  const [transferMessage, setTransferMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Recipient Lookup Helper
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

  const handleExecuteTransfer = () => {
    if (!customer || !foundRecipient) {
      setTransferMessage({ text: 'Recipient not found in this restaurant', isError: true });
      return;
    }

    const res = restoStore.transferPlates({
      senderCustomerId: customer.id,
      recipientIdentifier: foundRecipient.memberNo,
      plates: Number(platesToTransfer),
      pin: transferPin,
    });

    if (res.success) {
      setTransferMessage({ text: t.customer.transferSuccess, isError: false });
      setTransferRequiresSub(false);
      setTimeout(() => {
        setTransferModalOpen(false);
        setTransferMessage(null);
        setTransferPin('');
        setRecipientQuery('');
      }, 1500);
    } else {
      setTransferMessage({ text: res.error || 'Transfer failed', isError: true });
      if (res.requiresSubscription) {
        setTransferRequiresSub(true);
      }
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
          .filter((e) => e.customerId === customer.id)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      : [];

  const filteredHistory = customerHistory.filter((item) => {
    if (historyFilter === 'meals') return item.type === 'scan' || item.type === 'extra' || item.type === 'undo';
    if (historyFilter === 'topups') return item.type === 'purchase';
    if (historyFilter === 'transfers') return item.type === 'transfer_out' || item.type === 'transfer_in' || item.type === 'reversal';
    return true;
  });

  if (!customer) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-2xl bg-slate-900 border-2 border-slate-700 text-center space-y-4">
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

  // GATED VIEW WHEN MONETIZATION IS ENABLED AND CUSTOMER HAS NO ACTIVE SUBSCRIPTION:
  // Blocks: Digital dashboard QR, viewing remaining plates/balance, transfers, activity, notifications.
  // Preserves: Home-screen installation option, approved restaurant/campus branding, and physical card usage at stands.
  if (isDashboardGated) {
    return (
      <div className="max-w-md mx-auto px-4 py-6 space-y-5 animate-in fade-in duration-200">
        {/* HOME-SCREEN INSTALLATION OPTION */}
        <PWAInstallBanner />

        {/* APPROVED RESTAURANT / CAMPUS BRANDING HEADER */}
        <div className={`p-5 rounded-3xl bg-gradient-to-br ${badgeTheme.gradient} border-2 ${badgeTheme.border} shadow-xl relative overflow-hidden`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-xl shadow-inner shrink-0">
              🍽️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  {currentRestaurant?.name || 'Campus Dining'}
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider border ${badgeTheme.badgeBg}`}>
                  {currentRestaurant?.code}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-200 font-medium mt-0.5">
                Member #{customer.memberNo} · {customer.name}
              </p>
            </div>
          </div>
        </div>

        {/* DASHBOARD SUBSCRIPTION PAYWALL CARD */}
        <div className="p-6 rounded-3xl bg-slate-900 border-2 border-amber-500/80 shadow-2xl space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center gap-3 text-amber-400">
            <Smartphone className="w-6 h-6 shrink-0" />
            <h2 className="text-lg font-black text-white tracking-tight">
              RestoPass Digital Dashboard Subscription
            </h2>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/50 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-slate-300 uppercase font-mono font-semibold">Monthly Digital Fee</div>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                500 RWF <span className="text-sm font-normal text-slate-300">/ month</span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-200 border border-amber-500/50 uppercase">
              Subscription Required
            </span>
          </div>

          <p className="text-sm text-slate-200 leading-relaxed">
            An active dashboard subscription is required to view your remaining plates/balance online, generate your digital dashboard QR, transfer plates, and access dashboard features.
          </p>

          {/* PHYSICAL CARD EXCEPTION GUARANTEE */}
          <div className="p-4 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500 text-sm space-y-1.5 shadow-sm">
            <div className="flex items-center gap-2 font-black text-emerald-200">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>Physical Card Always Works Without Subscription</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
              Physical card QR scanning does <strong>not</strong> require the dashboard subscription. You can use your printed physical card at any cafeteria scanner station for all eligible meal deductions.
            </p>
          </div>

          {/* MOBILE MONEY CHECKOUT */}
          <div className="space-y-3.5 pt-3 border-t border-slate-800">
            <div className="text-sm font-bold text-white">
              Activate Dashboard Subscription via Mobile Money:
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-sm">
              <button
                type="button"
                onClick={() => setMomoProvider('mtn_momo')}
                className={`p-3 rounded-xl border-2 text-center font-bold transition-all cursor-pointer ${
                  momoProvider === 'mtn_momo'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                MTN MoMo (*182#)
              </button>
              <button
                type="button"
                onClick={() => setMomoProvider('airtel_money')}
                className={`p-3 rounded-xl border-2 text-center font-bold transition-all cursor-pointer ${
                  momoProvider === 'airtel_money'
                    ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                Airtel Money (*500#)
              </button>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-200 block mb-1.5">MoMo Phone Number</label>
              <input
                type="tel"
                value={momoPhone}
                onChange={(e) => setMomoPhone(e.target.value)}
                placeholder="+250 788 123 456"
                className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white font-mono text-sm focus:border-amber-400 outline-hidden"
              />
            </div>

            {subCheckoutMessage && (
              <div
                className={`p-3.5 rounded-xl text-sm space-y-2.5 ${
                  subCheckoutMessage.isError
                    ? 'bg-rose-950/90 border border-rose-600 text-rose-100'
                    : 'bg-emerald-950/90 border border-emerald-600 text-emerald-100'
                }`}
              >
                <div className="font-medium">{subCheckoutMessage.text}</div>
                {subCheckoutMessage.ref && (
                  <button
                    type="button"
                    onClick={() => {
                      const verifyRes = restoStore.verifyStudentPayment(subCheckoutMessage.ref!);
                      if (verifyRes.success) {
                        setSubCheckoutMessage({
                          text: 'Payment verified! Digital dashboard unlocked.',
                          isError: false,
                        });
                      }
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition-colors cursor-pointer shadow-sm"
                  >
                    Simulate USSD Approval &amp; Unlock Dashboard Now
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setSubCheckoutLoading(true);
                setSubCheckoutMessage(null);
                const checkoutRes = restoStore.initiateStudentCheckout({
                  customerId: customer.id,
                  phoneNumber: momoPhone,
                  provider: momoProvider,
                });
                setSubCheckoutLoading(false);
                if (checkoutRes.success && checkoutRes.payment) {
                  setSubCheckoutMessage({
                    text: checkoutRes.instructions || 'USSD prompt sent. Please approve on your phone.',
                    isError: false,
                    ref: checkoutRes.payment.internalReference,
                  });
                } else {
                  setSubCheckoutMessage({
                    text: checkoutRes.error || 'Failed to initiate Mobile Money payment',
                    isError: true,
                  });
                }
              }}
              disabled={subCheckoutLoading || !momoPhone}
              className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <Smartphone className="w-5 h-5" />
              <span>{subCheckoutLoading ? 'Sending USSD Prompt...' : 'Pay 500 RWF & Unlock Dashboard'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-5 animate-in fade-in duration-200">
      {/* PWA ADD TO HOME SCREEN PROMPT BANNER */}
      <PWAInstallBanner />

      {/* CLEAN RESTAURANT / CAMPUS BRANDING HEADER (No Verified Account badge, No direct portal link row) */}
      <div className={`p-5 rounded-3xl bg-gradient-to-br ${badgeTheme.gradient} border-2 ${badgeTheme.border} shadow-xl relative overflow-hidden`}>
        <div className={`absolute top-0 right-0 w-32 h-32 ${badgeTheme.glow} rounded-full blur-2xl pointer-events-none`} />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-xl shadow-inner shrink-0">
              🍽️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  {currentRestaurant?.name || 'Campus Dining'}
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider border ${badgeTheme.badgeBg}`}>
                  {currentRestaurant?.code}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-200 font-medium line-clamp-1 mt-0.5">
                {currentRestaurant?.welcomeMessage || 'Eat fresh meals, study with energy!'}
              </p>
            </div>
          </div>

          {customer.provisionalStatus === 'pending_approval' ? (
            <span className="px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs font-mono font-bold uppercase flex items-center gap-1.5 shrink-0">
              <Clock className="w-3.5 h-3.5" />
              <span>Pending</span>
            </span>
          ) : customer.provisionalStatus === 'rejected' ? (
            <span className="px-3 py-1 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs font-mono font-bold uppercase flex items-center gap-1.5 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Rejected</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* WAITING FOR BOSS APPROVAL ROOM BANNER */}
      {customer.provisionalStatus === 'pending_approval' && (
        <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-950/95 via-slate-900 to-amber-950/70 border-2 border-amber-500 shadow-2xl relative overflow-hidden animate-in fade-in duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                <span className="font-black text-amber-200 text-xs sm:text-sm tracking-wider uppercase">
                  Awaiting Boss Approval Room
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-xs font-bold text-amber-200 font-mono">
                Approval Queue
              </span>
            </div>

            <p className="text-slate-100 text-sm leading-relaxed">
              Your registration has been submitted to the <strong className="text-amber-300 font-bold">Boss Approval Room</strong>. The Restaurant Boss is verifying your payment.
            </p>

            <div className="p-3 rounded-2xl bg-slate-950/90 border border-amber-500/50 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5">
                <Utensils className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="font-bold text-white text-sm">Provisional Grace Allowance</div>
                  <div className="text-xs text-amber-200">You can already eat at the counter today</div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-amber-300 font-mono">
                  {customer.gracePlatesRemaining ?? 3}
                </span>
                <span className="text-xs text-slate-300 block font-mono">Grace Meals</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patron Navigation Subtabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-700 text-sm font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('qr_pass')}
          className={`flex-1 py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'qr_pass'
              ? 'bg-emerald-600 text-white font-black shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>Digital Pass</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          className={`flex-1 py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer relative ${
            activeTab === 'notifications'
              ? 'bg-emerald-600 text-white font-black shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Alerts</span>
          {unreadNotifCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-black text-xs font-mono">
              {unreadNotifCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'history'
              ? 'bg-emerald-600 text-white font-black shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Activity</span>
        </button>
      </div>

      {/* Critical Alerts: Low Balance or Locked Status */}
      {balance < 5 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/90 via-slate-900 to-slate-900 border-2 border-amber-500/60 text-amber-100 text-sm flex items-start gap-3 shadow-md">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-white">{t.scanner.lowBalanceWarning}</div>
            <div className="mt-0.5 text-amber-100 leading-relaxed text-xs sm:text-sm">
              {t.customer.lowBalanceBanner}
            </div>
          </div>
        </div>
      )}

      {customer.cardStatus === 'locked' && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/90 via-slate-900 to-slate-900 border-2 border-rose-500/60 text-rose-100 text-sm flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-white">Physical Card Locked</div>
              <div className="text-xs sm:text-sm text-rose-200">Tap at stands is disabled · Plates preserved</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleLockCard}
            className="px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs sm:text-sm font-bold shrink-0 transition-colors cursor-pointer"
          >
            {t.customer.unlockMyCard}
          </button>
        </div>
      )}

      {/* TAB 1: DIGITAL PASS */}
      {activeTab === 'qr_pass' && (
        <>
          {/* DIGITAL MEAL PASS */}
          <div className={`digital-card relative rounded-3xl bg-gradient-to-br ${badgeTheme.gradient} border-2 ${badgeTheme.border} p-6 shadow-2xl overflow-hidden select-none`}>
            <div className={`absolute top-0 right-0 w-44 h-44 ${badgeTheme.glow} rounded-full blur-3xl pointer-events-none`} />
            <div className={`absolute bottom-0 left-0 w-44 h-44 ${badgeTheme.glowSecondary} rounded-full blur-3xl pointer-events-none`} />

            {/* Card Header: Restaurant & Status */}
            <div className="flex items-start justify-between relative z-10">
              <div>
                <div className={`text-xs font-mono tracking-widest ${badgeTheme.accent} uppercase font-bold`}>
                  RestoPass Digital Card
                </div>
                <div className="text-lg font-black text-white tracking-tight mt-0.5">
                  {currentRestaurant?.name}
                </div>
              </div>

              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-600 text-xs font-mono font-bold text-slate-100">
                  <span className={`w-2 h-2 rounded-full ${customer.cardStatus === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  <span>CARD V{customer.cardVersion}</span>
                </div>
              </div>
            </div>

            {/* Central Balance Display */}
            <div className="my-6 text-center relative z-10">
              <div className="text-6xl sm:text-7xl font-black text-white font-mono tabular-nums tracking-tighter drop-shadow-sm">
                {balance}
              </div>
              <div className={`text-sm uppercase font-black tracking-widest ${badgeTheme.accent} mt-1.5 flex items-center justify-center gap-1.5`}>
                <Utensils className="w-4 h-4" />
                <span>Prepaid Plates Available</span>
              </div>
            </div>

            {/* Card Footer: Member details & sync status */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-sm relative z-10">
              <div>
                <div className="text-xs text-slate-300 uppercase font-mono">Member ID</div>
                <div className="text-base font-bold text-white font-mono">#{customer.memberNo}</div>
              </div>

              <div className="text-center">
                <div className="text-xs text-slate-300 uppercase font-mono">Holder</div>
                <div className="text-sm font-bold text-white">{customer.name}</div>
              </div>

              <div className="text-right">
                <div className="text-xs text-slate-300 uppercase font-mono">Facility</div>
                <div className={`text-sm font-bold ${badgeTheme.accent} font-mono`}>{customer.restaurantCode}</div>
              </div>
            </div>
          </div>

          {/* STUDENT DIGITAL PASS STATUS BANNER */}
          {subSettings.enabled && (
            <div
              className={`p-4 rounded-2xl border-2 flex items-center justify-between gap-3 shadow-md ${
                customerSub?.status === 'active' || customerSub?.status === 'complimentary'
                  ? 'bg-emerald-950/70 border-emerald-700 text-emerald-100'
                  : customerSub?.status === 'grace_period'
                  ? 'bg-amber-950/70 border-amber-700 text-amber-100'
                  : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl ${
                    customerSub?.status === 'active' || customerSub?.status === 'complimentary'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : customerSub?.status === 'grace_period'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Student Digital Pass (500 RWF/mo)</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-mono font-bold uppercase ${
                        customerSub?.status === 'active'
                          ? 'bg-emerald-500/20 text-emerald-200'
                          : customerSub?.status === 'grace_period'
                          ? 'bg-amber-500/20 text-amber-200'
                          : customerSub?.status === 'complimentary'
                          ? 'bg-purple-500/20 text-purple-200'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {customerSub?.status || 'inactive'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-200 mt-0.5">
                    {customerSub?.status === 'active'
                      ? `Active until ${customerSub.currentPeriodEnd ? new Date(customerSub.currentPeriodEnd).toLocaleDateString() : 'end of month'}`
                      : customerSub?.status === 'grace_period'
                      ? `In 3-day grace period until ${customerSub.gracePeriodEnd ? new Date(customerSub.gracePeriodEnd).toLocaleDateString() : 'soon'}`
                      : 'Physical card remains 100% active at buffet stands without digital pass'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSubModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap shadow-xs"
              >
                {customerSub?.status === 'active' || customerSub?.status === 'complimentary' ? 'Manage' : 'Subscribe'}
              </button>
            </div>
          )}

          {/* QUICK WALLET ACTIONS */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTransferModalOpen(true)}
              className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-sm font-bold flex items-center justify-center gap-3 transition-all shadow-md cursor-pointer group"
            >
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-300 group-hover:bg-emerald-500/25 transition-colors">
                <Send className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="leading-tight font-bold">{t.customer.transferPlates}</div>
                <div className="text-xs text-slate-300 font-normal mt-0.5">Send to classmate</div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleToggleLockCard}
              className={`p-4 rounded-2xl border text-sm font-bold flex items-center justify-center gap-3 transition-all shadow-md cursor-pointer ${
                customer.cardStatus === 'locked'
                  ? 'bg-rose-950/80 border-rose-700 text-rose-100 hover:bg-rose-900/80'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-white'
              }`}
            >
              <div
                className={`p-2.5 rounded-xl transition-colors ${
                  customer.cardStatus === 'locked'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-amber-500/15 text-amber-300'
                }`}
              >
                {customer.cardStatus === 'locked' ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </div>
              <div className="text-left">
                <div className="leading-tight font-bold">
                  {customer.cardStatus === 'locked' ? t.customer.unlockMyCard : t.customer.lockMyCard}
                </div>
                <div className="text-xs text-slate-300 font-normal mt-0.5">
                  {customer.cardStatus === 'locked' ? 'Restore access' : 'Freeze lost card'}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsDashboardLocked(true)}
              className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-sm font-bold flex items-center justify-center gap-3 transition-all shadow-md cursor-pointer group"
            >
              <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-300 group-hover:bg-purple-500/25 transition-colors">
                <Shield className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="leading-tight font-bold">Lock Screen</div>
                <div className="text-xs text-slate-300 font-normal mt-0.5">Off-screen PIN shield</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowPinSetupModal(true)}
              className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-sm font-bold flex items-center justify-center gap-3 transition-all shadow-md cursor-pointer group"
            >
              <div className="p-2.5 rounded-xl bg-sky-500/15 text-sky-300 group-hover:bg-sky-500/25 transition-colors">
                <KeyRound className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="leading-tight font-bold">
                  {customer.hasCustomPin ? 'Security PIN' : 'Set 6-Digit PIN'}
                </div>
                <div className="text-xs text-slate-300 font-normal mt-0.5">
                  {customer.hasCustomPin ? '•••••• (Tap to edit)' : 'Required for safety'}
                </div>
              </div>
            </button>
          </div>

          {/* DIGITAL QR PASS SECTION */}
          <div className="p-6 rounded-3xl bg-slate-900 border-2 border-slate-700 shadow-xl text-center space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-700 text-xs sm:text-sm">
                <button
                  type="button"
                  onClick={() => setQrPassType('dynamic')}
                  className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer ${
                    qrPassType === 'dynamic'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Rotating Phone QR
                </button>
                <button
                  type="button"
                  onClick={() => setQrPassType('permanent')}
                  className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer ${
                    qrPassType === 'permanent'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Card Backup QR
                </button>
              </div>

              {qrPassType === 'dynamic' ? (
                <button
                  type="button"
                  onClick={handleForceRefresh}
                  title="Force immediate QR refresh"
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-mono text-emerald-300 bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              ) : (
                <span className="text-xs font-mono text-cyan-300 bg-cyan-950 border border-cyan-700 px-2.5 py-1 rounded-full font-bold">
                  Never Expires
                </span>
              )}
            </div>

            <div className="p-4 bg-white rounded-2xl inline-block shadow-lg mx-auto">
              <QrCanvas
                value={qrPassType === 'dynamic' ? tokenInfo.token : permanentCardToken}
                size={215}
              />
            </div>

            {qrPassType === 'dynamic' ? (
              <div className="space-y-2 max-w-xs mx-auto">
                <div className="flex items-center justify-between text-xs sm:text-sm font-mono text-slate-200">
                  <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Dynamic (v1)</span>
                  </span>
                  <span className="font-bold text-white tabular-nums">
                    Rotates in {tokenInfo.secondsRemaining}s
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-1000 ease-linear rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    style={{ width: `${(tokenInfo.secondsRemaining / 30) * 100}%` }}
                  />
                </div>
                <div className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
                  Anti-fraud rotating token (±5 min clock sync tolerance).
                </div>
              </div>
            ) : (
              <div className="space-y-1 max-w-xs mx-auto text-xs sm:text-sm text-slate-200">
                <div className="font-mono text-cyan-300 font-bold">
                  Physical Card Token (c1) · Ver: {customer.cardVersion}
                </div>
                <div className="text-slate-300">
                  100% time-independent. Matches printed physical PVC card.
                </div>
              </div>
            )}
          </div>

          {/* CAFETERIA MEAL SUBSCRIPTION PLANS & PRICING */}
          {(() => {
            const restoPackages = restoStore.getRestaurantPackages(customer.restaurantCode);
            const defaultRate = restoStore.getRestaurantDefaultPlatePrice(customer.restaurantCode);

            const handleCopyMemberRef = () => {
              navigator.clipboard?.writeText(customer.memberNo);
              setCopiedRef(true);
              setTimeout(() => setCopiedRef(false), 2500);
            };

            return (
              <div className="p-5 rounded-3xl bg-slate-900 border border-slate-700 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center">
                      <Tag className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white tracking-tight">
                        Meal Plans &amp; Pricing
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-300">
                        {currentRestaurant?.name} meal bundles
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPlansExpanded(!plansExpanded)}
                    className="text-sm font-bold text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer"
                  >
                    {plansExpanded ? 'Collapse' : 'View Plans'}
                  </button>
                </div>

                {/* Always-visible Quick Pricing Summary */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                    <div className="text-xs text-slate-300 font-bold uppercase">Single Plate Rate</div>
                    <div className="text-lg font-black text-white font-mono mt-0.5">
                      {defaultRate.toLocaleString()} RWF
                    </div>
                    <div className="text-xs text-slate-400">Custom top-up rate</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                    <div className="text-xs text-slate-300 font-bold uppercase">Best Value Bundle</div>
                    <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                      {restoPackages.length > 0
                        ? `${Math.round(restoPackages[restoPackages.length - 1].priceRwf / restoPackages[restoPackages.length - 1].platesCount).toLocaleString()} RWF/p`
                        : `${defaultRate} RWF`}
                    </div>
                    <div className="text-xs text-emerald-300">
                      {restoPackages.length > 0 ? restoPackages[restoPackages.length - 1].name.split(' ')[0] : 'Standard'}
                    </div>
                  </div>
                </div>

                {/* Expanded Detailed Packages List */}
                {plansExpanded && (
                  <div className="space-y-2.5 pt-1 animate-in fade-in duration-150">
                    <div className="text-sm font-bold text-slate-200">
                      Available Meal Packages:
                    </div>

                    <div className="space-y-2.5">
                      {restoPackages.map((pkg) => {
                        const unitPrice = Math.round(pkg.priceRwf / pkg.platesCount);
                        const saving = defaultRate - unitPrice;
                        return (
                          <div
                            key={pkg.id}
                            className="p-3.5 rounded-2xl bg-slate-950 border border-slate-700 flex items-center justify-between text-sm hover:border-slate-600 transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-700 text-xs font-mono font-bold">
                                  {pkg.platesCount}p
                                </span>
                                <span className="font-bold text-white text-sm">{pkg.name}</span>
                              </div>
                              <div className="text-xs text-slate-300 mt-1">{pkg.description}</div>
                            </div>

                            <div className="text-right shrink-0 pl-2">
                              <div className="font-mono font-black text-white text-sm">
                                {pkg.priceRwf.toLocaleString()} RWF
                              </div>
                              <div className="text-xs text-slate-300 font-mono">
                                {unitPrice.toLocaleString()} RWF/p
                                {saving > 0 && <span className="text-emerald-300 ml-1">(-{saving})</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Payment & Top-Up Instructions */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">How to Top Up:</span>
                    <button
                      type="button"
                      onClick={handleCopyMemberRef}
                      className="flex items-center gap-1.5 text-xs font-mono text-emerald-300 hover:text-emerald-200 cursor-pointer font-bold"
                    >
                      {copiedRef ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span>Copied ID #{customer.memberNo}!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Member #{customer.memberNo}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
                    Pay at the cashier desk or via Mobile Money using your Member ID <strong className="text-white font-mono">#{customer.memberNo}</strong> as payment reference.
                  </p>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* TAB 2: IN-APP NOTIFICATIONS CENTER */}
      {activeTab === 'notifications' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-700 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-emerald-400" />
                  <span>In-App Notifications</span>
                  {unreadNotifCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs">
                      {unreadNotifCount} unread
                    </span>
                  )}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                  Cafeteria meal logs &amp; manager announcements
                </p>
              </div>

              {unreadNotifCount > 0 && (
                <button
                  type="button"
                  onClick={() => restoStore.markAllNotificationsAsRead(customer.id)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <CheckCheck className="w-4 h-4 text-emerald-400" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            <div className="flex gap-1.5 p-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs sm:text-sm overflow-x-auto">
              {[
                { id: 'all', label: 'All' },
                { id: 'unread', label: `Unread (${unreadNotifCount})` },
                { id: 'broadcast', label: 'Announcements' },
                { id: 'alerts', label: 'Alerts & Meals' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setNotifFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    notifFilter === f.id
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const filteredNotifs = customerNotifications.filter((n) => {
              if (notifFilter === 'unread') return !n.readByCustomerIds.includes(customer.id);
              if (notifFilter === 'broadcast') return n.target === 'all' || n.type === 'system_broadcast';
              if (notifFilter === 'alerts') return n.type === 'low_balance' || n.type === 'card_security' || n.type === 'meal_served';
              return true;
            });

            if (filteredNotifs.length === 0) {
              return (
                <div className="p-8 rounded-3xl bg-slate-900 border border-slate-700 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <Bell className="w-6 h-6 opacity-60" />
                  </div>
                  <div className="text-sm font-bold text-slate-200">No notifications in this folder</div>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-xs mx-auto">
                    When you eat meals at dining stands or the manager sends alerts, they appear right here.
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {filteredNotifs.map((n) => {
                  const isUnread = !n.readByCustomerIds.includes(customer.id);
                  return (
                    <div
                      key={n.id}
                      onClick={() => restoStore.markNotificationAsRead(n.id, customer.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                        isUnread
                          ? 'bg-slate-800/90 border-emerald-500/60 shadow-md'
                          : 'bg-slate-900 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {isUnread && (
                        <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
                      )}

                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            n.priority === 'urgent'
                              ? 'bg-rose-500/15 border border-rose-500/40 text-rose-300'
                              : n.priority === 'important'
                              ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                              : 'bg-slate-800 border border-slate-700 text-emerald-300'
                          }`}
                        >
                          {n.type === 'low_balance' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                          ) : n.type === 'meal_served' ? (
                            <Utensils className="w-4 h-4 text-emerald-400" />
                          ) : n.type === 'topup_success' ? (
                            <DollarSign className="w-4 h-4 text-emerald-400" />
                          ) : n.type === 'card_security' ? (
                            <ShieldAlert className="w-4 h-4 text-rose-400" />
                          ) : n.type === 'plate_transfer' ? (
                            <ArrowRightLeft className="w-4 h-4 text-purple-400" />
                          ) : (
                            <Megaphone className="w-4 h-4 text-amber-400" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm leading-snug">{n.title}</span>
                          </div>

                          <p className="text-slate-200 text-sm mt-1 leading-relaxed">{n.message}</p>

                          <div className="flex items-center justify-between text-xs text-slate-400 font-mono mt-2.5 pt-2 border-t border-slate-800">
                            <span>{n.senderName}</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 opacity-70" />
                              {new Date(n.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} ·{' '}
                              {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {n.actionTab && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                restoStore.markNotificationAsRead(n.id, customer.id);
                                if (n.actionTab === 'history') setActiveTab('history');
                                else if (n.actionTab === 'my_card') setActiveTab('qr_pass');
                              }}
                              className="mt-2 text-xs font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1 cursor-pointer"
                            >
                              <span>Open in {n.actionTab === 'my_card' ? 'Digital Pass' : 'Activity'}</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 3: MEAL ACTIVITY & USAGE TIMELINE */}
      {activeTab === 'history' && (
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-700 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-black text-white uppercase tracking-wider">
              <History className="w-5 h-5 text-emerald-400" />
              <span>Recent Meal Activity</span>
            </div>
            <span className="text-xs sm:text-sm text-slate-300">Last 3 Months</span>
          </div>

          <div className="flex gap-1.5 p-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs sm:text-sm font-bold text-slate-300">
            {[
              { id: 'all', label: 'All' },
              { id: 'meals', label: 'Meals Eaten' },
              { id: 'topups', label: 'Top-Ups' },
              { id: 'transfers', label: 'Transfers' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setHistoryFilter(f.id as any)}
                className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer text-center ${
                  historyFilter === f.id
                    ? 'bg-slate-800 text-white font-black shadow-xs'
                    : 'hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredHistory.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-300">
              No activity matching this filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-800 max-h-80 overflow-y-auto">
              {filteredHistory.map((item) => {
                const isPositive = item.platesDelta > 0;
                return (
                  <div key={item.id} className="py-3.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isPositive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-200'
                        }`}
                      >
                        {item.type === 'purchase' ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : item.type === 'transfer_out' ? (
                          <ArrowUpRight className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Utensils className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-white capitalize leading-tight">
                          {item.type === 'scan' ? 'Stand Serving (Buffet)' : item.type.replace('_', ' ')}
                        </div>
                        <div className="text-xs text-slate-300 mt-0.5">
                          {new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} ·{' '}
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`font-mono font-black tabular-nums text-base ${
                        isPositive ? 'text-emerald-400' : 'text-slate-200'
                      }`}
                    >
                      {isPositive ? `+${item.platesDelta}` : item.platesDelta} plates
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SETTLED RULES NOTICE */}
      <div className="text-center text-xs sm:text-sm text-slate-300 leading-relaxed pb-4">
        RestoPass Member #{customer.memberNo} · Unused plates never expire · No refunds
      </div>

      {/* TRANSFER MODAL */}
      {transferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-sm">
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
              Transfer plates to a friend or classmate registered at <strong>{currentRestaurant?.name}</strong>.
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
                  className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white font-mono focus:border-emerald-400 outline-hidden"
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
                <label className="font-bold text-slate-200 block mb-1.5">
                  Plates to Transfer
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, balance)}
                  value={platesToTransfer}
                  onChange={(e) => setPlatesToTransfer(parseInt(e.target.value) || 1)}
                  className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white font-mono focus:border-emerald-400 outline-hidden"
                />
                <div className="text-xs text-slate-300 mt-1">Available balance: {balance} plates</div>
              </div>

              <div>
                <label className="font-bold text-slate-200 block mb-1.5">
                  Your Security PIN
                </label>
                <input
                  type="password"
                  maxLength={8}
                  placeholder="••••••"
                  value={transferPin}
                  onChange={(e) => setTransferPin(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white font-mono text-center tracking-widest text-lg focus:border-emerald-400 outline-hidden"
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
              <button
                type="button"
                onClick={() => {
                  setTransferModalOpen(false);
                  setSubModalOpen(true);
                }}
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
              >
                <Smartphone className="w-4 h-4" />
                <span>Subscribe to Digital Pass (500 RWF / mo)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExecuteTransfer}
              disabled={!foundRecipient || !transferPin}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm shadow-md transition-colors cursor-pointer"
            >
              Confirm &amp; Transfer Plates
            </button>
          </div>
        </div>
      )}

      {/* STUDENT DIGITAL SUBSCRIPTION MODAL */}
      {subModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-sm animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <Smartphone className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Student Digital Pass</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSubModalOpen(false);
                  setSubCheckoutMessage(null);
                }}
                className="text-slate-300 hover:text-white font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/50 via-slate-950 to-slate-950 border border-amber-700/60 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-300 uppercase font-mono">Monthly Rate</div>
                <div className="text-2xl font-black text-emerald-400 font-mono">500 RWF</div>
                <div className="text-xs text-slate-300 mt-0.5">Includes 3-day (72h) grace period</div>
              </div>
              <span
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase ${
                  customerSub?.status === 'active'
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : customerSub?.status === 'grace_period'
                    ? 'bg-amber-500/20 text-amber-200'
                    : customerSub?.status === 'complimentary'
                    ? 'bg-purple-500/20 text-purple-200'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {customerSub?.status || 'inactive'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-200 space-y-1">
              <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Physical Card Always Supported</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                Physical card QR scanning never requires a subscription. The digital pass unlocks dashboard balance viewing, digital QR, and online plate transfers.
              </p>
            </div>

            {customerSub &&
            (customerSub.status === 'active' ||
              customerSub.status === 'complimentary' ||
              customerSub.status === 'grace_period') ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 font-mono text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Current Period:</span>
                    <span className="text-white">
                      {customerSub.currentPeriodEnd
                        ? new Date(customerSub.currentPeriodEnd).toLocaleDateString()
                        : 'Active'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Grace End (+72h):</span>
                    <span className="text-amber-300">
                      {customerSub.gracePeriodEnd
                        ? new Date(customerSub.gracePeriodEnd).toLocaleDateString()
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Auto-Renewal:</span>
                    <span className={customerSub.cancelAtPeriodEnd ? 'text-rose-300' : 'text-emerald-300'}>
                      {customerSub.cancelAtPeriodEnd ? 'Cancelled at period end' : 'Active'}
                    </span>
                  </div>
                </div>

                {!customerSub.cancelAtPeriodEnd && customerSub.status !== 'complimentary' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          'Cancel future renewal? You will retain access until the end of your paid period.'
                        )
                      ) {
                        restoStore.cancelStudentSubscription(customer.id);
                      }
                    }}
                    className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-colors cursor-pointer"
                  >
                    Cancel Future Renewal
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="font-bold text-slate-200 block mb-1.5">Select Mobile Money Provider</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMomoProvider('mtn_momo')}
                      className={`p-3 rounded-xl border-2 text-center font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                        momoProvider === 'mtn_momo'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-slate-950 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      MTN MoMo (*182#)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMomoProvider('airtel_money')}
                      className={`p-3 rounded-xl border-2 text-center font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                        momoProvider === 'airtel_money'
                          ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                          : 'bg-slate-950 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      Airtel Money (*500#)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-200 block mb-1.5">Mobile Money Phone Number</label>
                  <input
                    type="tel"
                    value={momoPhone}
                    onChange={(e) => setMomoPhone(e.target.value)}
                    placeholder="e.g. +250 788 123 456"
                    className="w-full p-3 rounded-xl bg-slate-950 border-2 border-slate-700 text-white font-mono focus:border-amber-400 outline-hidden"
                  />
                </div>

                {subCheckoutMessage && (
                  <div
                    className={`p-3 rounded-xl text-xs sm:text-sm space-y-2 ${
                      subCheckoutMessage.isError
                        ? 'bg-rose-950/90 border border-rose-600 text-rose-100'
                        : 'bg-emerald-950/90 border border-emerald-600 text-emerald-100'
                    }`}
                  >
                    <div>{subCheckoutMessage.text}</div>
                    {subCheckoutMessage.ref && (
                      <button
                        type="button"
                        onClick={() => {
                          const verifyRes = restoStore.verifyStudentPayment(subCheckoutMessage.ref!);
                          if (verifyRes.success) {
                            setSubCheckoutMessage({
                              text: 'Payment verified! Student Digital Pass is now active.',
                              isError: false,
                            });
                          }
                        }}
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer"
                      >
                        Simulate Prompt Approval (Test/Demo)
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSubCheckoutLoading(true);
                    setSubCheckoutMessage(null);
                    const checkoutRes = restoStore.initiateStudentCheckout({
                      customerId: customer.id,
                      phoneNumber: momoPhone,
                      provider: momoProvider,
                    });
                    setSubCheckoutLoading(false);
                    if (checkoutRes.success && checkoutRes.payment) {
                      setSubCheckoutMessage({
                        text: checkoutRes.instructions || 'USSD prompt sent. Please approve on your phone.',
                        isError: false,
                        ref: checkoutRes.payment.internalReference,
                      });
                    } else {
                      setSubCheckoutMessage({
                        text: checkoutRes.error || 'Failed to initiate Mobile Money payment',
                        isError: true,
                      });
                    }
                  }}
                  disabled={subCheckoutLoading || !momoPhone}
                  className="w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-black text-sm shadow-md transition-colors cursor-pointer"
                >
                  {subCheckoutLoading ? 'Sending USSD Prompt...' : 'Pay 500 RWF via Mobile Money'}
                </button>
              </div>
            )}
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
    </div>
  );
};
