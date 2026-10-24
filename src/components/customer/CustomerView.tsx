import React, { useState, useEffect } from 'react';
import { Customer, Language, LedgerEntry } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import { generateCardToken } from '../../services/cryptoService';
import { QrCanvas } from '../common/QrCanvas';
import {
  CreditCard,
  Send,
  Lock,
  Unlock,
  History,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Info,
  User,
  Phone,
  QrCode,
  ArrowUpRight,
  ArrowDownLeft,
  Utensils,
  Sparkles,
  Zap,
  Check,
  Share2,
  Bell,
  CheckCheck,
  Megaphone,
  DollarSign,
  ShieldAlert,
  ArrowRightLeft,
  ExternalLink,
  Tag,
  Copy,
  Building2,
  Store,
  ChevronDown,
  KeyRound,
  Shield,
} from 'lucide-react';
import { PWAInstallBanner } from './PWAInstallBanner';
import { PinSetupModal } from './PinSetupModal';
import { DashboardLockScreen } from './DashboardLockScreen';

interface CustomerViewProps {
  language: Language;
  activeSubTab?: string;
  onNavigateTab?: (tab: string) => void;
}

export const CustomerView: React.FC<CustomerViewProps> = ({
  language,
  activeSubTab,
  onNavigateTab,
}) => {
  const t = translations[language];
  const state = restoStore.getState();
  const currentRestaurant = restoStore.getCurrentRestaurant();

  const customer = restoStore.getCurrentCustomer() || state.customers.find((c) => c.restaurantCode === state.currentRestaurantCode) || state.customers[0];
  const balance = restoStore.getCustomerBalance(customer.id);

  // Dynamic 30-second token rotation
  const [tokenInfo, setTokenInfo] = useState(() =>
    restoStore.getCustomerPhoneQr(customer)
  );
  const [qrPassType, setQrPassType] = useState<'dynamic' | 'permanent'>('dynamic');
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);
  const [cafeteriaDropdownOpen, setCafeteriaDropdownOpen] = useState(false);
  const [plansExpanded, setPlansExpanded] = useState(false);

  // 4-Digit Security PIN & Instant Off-Screen Auto-Lock
  const [isDashboardLocked, setIsDashboardLocked] = useState(false);
  const [showPinSetupModal, setShowPinSetupModal] = useState(!customer.hasCustomPin);

  // Show PIN Setup Modal if customer hasn't set their personal 4-digit PIN yet
  useEffect(() => {
    if (!customer.hasCustomPin) {
      setShowPinSetupModal(true);
    }
  }, [customer.id, customer.hasCustomPin]);

  // Instant Off-Screen Auto-Lock Protection:
  // Triggers immediately when phone screen locks, tabs switch, or app backgrounds
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (customer.hasCustomPin) {
          setIsDashboardLocked(true);
        }
      }
    };

    const handleWindowBlur = () => {
      if (customer.hasCustomPin && document.hidden) {
        setIsDashboardLocked(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [customer.hasCustomPin]);

  // Badge Style Dynamic Theming
  const getBadgeTheme = (style?: 'gold' | 'emerald' | 'blue' | 'dark') => {
    switch (style) {
      case 'gold':
        return {
          gradient: 'from-slate-900 via-amber-950/40 to-slate-900',
          border: 'border-amber-500/50',
          accent: 'text-amber-400',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          glow: 'bg-amber-500/10',
          glowSecondary: 'bg-amber-600/10',
          statusRing: 'ring-amber-400/40',
        };
      case 'blue':
        return {
          gradient: 'from-slate-900 via-blue-950/40 to-slate-900',
          border: 'border-blue-500/50',
          accent: 'text-sky-400',
          badgeBg: 'bg-blue-500/20 text-sky-300 border-blue-500/30',
          glow: 'bg-blue-500/10',
          glowSecondary: 'bg-sky-500/10',
          statusRing: 'ring-sky-400/40',
        };
      case 'dark':
        return {
          gradient: 'from-slate-950 via-zinc-900 to-slate-950',
          border: 'border-purple-500/40',
          accent: 'text-purple-300',
          badgeBg: 'bg-purple-500/20 text-purple-200 border-purple-500/30',
          glow: 'bg-purple-500/10',
          glowSecondary: 'bg-indigo-500/10',
          statusRing: 'ring-purple-400/40',
        };
      case 'emerald':
      default:
        return {
          gradient: 'from-slate-900 via-slate-900 to-emerald-950/40',
          border: 'border-slate-700/80',
          accent: 'text-emerald-400',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          glow: 'bg-emerald-500/10',
          glowSecondary: 'bg-blue-500/10',
          statusRing: 'ring-emerald-400/40',
        };
    }
  };

  const badgeTheme = getBadgeTheme(currentRestaurant?.badgeStyle);

  const permanentCardToken = generateCardToken(
    customer.restaurantCode,
    customer.memberNo,
    customer.cardVersion
  );

  const handleForceRefresh = () => {
    setTokenInfo(restoStore.getCustomerPhoneQr(customer));
  };

  useEffect(() => {
    const updateToken = () => {
      setTokenInfo(restoStore.getCustomerPhoneQr(customer));
    };
    updateToken();
    const interval = setInterval(updateToken, 1000);
    return () => clearInterval(interval);
  }, [customer]);

  // View Mode: 'qr_pass' | 'notifications' | 'history'
  const [activeTab, setActiveTab] = useState<'qr_pass' | 'notifications' | 'history'>('qr_pass');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'meals' | 'topups' | 'transfers'>('all');
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'broadcast' | 'alerts'>('all');

  useEffect(() => {
    if (activeSubTab === 'my_card') setActiveTab('qr_pass');
    else if (activeSubTab === 'notifications') setActiveTab('notifications');
    else if (activeSubTab === 'history') setActiveTab('history');
    else if (activeSubTab === 'transfer') {
      setActiveTab('qr_pass');
      setTransferModalOpen(true);
    } else if (activeSubTab === 'lock') {
      setActiveTab('qr_pass');
    }
  }, [activeSubTab]);

  const customerNotifications = restoStore.getCustomerNotifications(customer.id, state.currentRestaurantCode);
  const unreadNotifCount = restoStore.getUnreadNotificationCount(customer.id);

  // Transfer Modal State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [platesToTransfer, setPlatesToTransfer] = useState(2);
  const [transferPin, setTransferPin] = useState('');
  const [transferMessage, setTransferMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Recipient Lookup Helper
  const foundRecipient = state.customers.find(
    (c) =>
      c.restaurantCode === customer.restaurantCode &&
      c.id !== customer.id &&
      (c.memberNo === recipientQuery.trim() ||
        c.phone.replace(/[\s-]/g, '') === recipientQuery.trim().replace(/[\s-]/g, ''))
  );

  const maskName = (name: string) => {
    return name
      .split(' ')
      .map((part) => (part.length > 2 ? `${part[0]}***${part.slice(-1)}` : `${part[0]}*`))
      .join(' ');
  };

  const handleExecuteTransfer = () => {
    if (!foundRecipient) {
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
      setTimeout(() => {
        setTransferModalOpen(false);
        setTransferMessage(null);
        setTransferPin('');
        setRecipientQuery('');
      }, 1500);
    } else {
      setTransferMessage({ text: res.error || 'Transfer failed', isError: true });
    }
  };

  const handleToggleLockCard = () => {
    const nextStatus = customer.cardStatus === 'locked' ? 'active' : 'locked';
    restoStore.setCustomerCardStatus(customer.id, nextStatus, customer.name);
  };

  // Last 3 months ledger history for customer
  const customerHistory = state.ledgerEntries
    .filter((e) => e.customerId === customer.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredHistory = customerHistory.filter((item) => {
    if (historyFilter === 'meals') return item.type === 'scan' || item.type === 'extra' || item.type === 'undo';
    if (historyFilter === 'topups') return item.type === 'purchase';
    if (historyFilter === 'transfers') return item.type === 'transfer_out' || item.type === 'transfer_in' || item.type === 'reversal';
    return true;
  });

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-5 animate-in fade-in duration-200">
      {/* PWA ADD TO HOME SCREEN PROMPT BANNER */}
      <PWAInstallBanner />

      {/* CAFETERIA BRANDING HEADER & MULTI-TENANT SWITCHER */}
      <div className={`p-4 rounded-3xl bg-gradient-to-br ${badgeTheme.gradient} border ${badgeTheme.border} shadow-xl relative overflow-hidden`}>
        <div className={`absolute top-0 right-0 w-32 h-32 ${badgeTheme.glow} rounded-full blur-2xl pointer-events-none`} />

        <div className="relative z-10 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 border border-slate-700/80 flex items-center justify-center text-lg shadow-inner">
                🍽️
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-black text-white tracking-tight">
                    {currentRestaurant?.name || 'Campus Dining'}
                  </h1>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${badgeTheme.badgeBg}`}>
                    {currentRestaurant?.code}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 font-medium line-clamp-1 mt-0.5">
                  {currentRestaurant?.welcomeMessage || 'Eat fresh meals, study with energy!'}
                </p>
              </div>
            </div>

            {/* Switch Cafeteria Dropdown Button */}
            <div className="relative shrink-0">
              <button
                onClick={() => setCafeteriaDropdownOpen((prev) => !prev)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                title="Switch between cafeterias on the central cloud server"
              >
                <Store className="w-3.5 h-3.5 text-slate-300" />
                <span>Cafeteria</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${cafeteriaDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {cafeteriaDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 p-2 rounded-2xl bg-slate-950 border border-slate-700 shadow-2xl z-50 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between">
                    <span>Central Cloud Multi-Tenant</span>
                    <span className="font-mono text-emerald-400">3 Restos</span>
                  </div>
                  {state.restaurants.map((resto) => {
                    const isCur = resto.code === state.currentRestaurantCode;
                    return (
                      <button
                        key={resto.code}
                        onClick={() => {
                          restoStore.setRestaurantCode(resto.code);
                          if (typeof window !== 'undefined') {
                            window.location.hash = `#/portal/${resto.code.toLowerCase()}`;
                          }
                          setCafeteriaDropdownOpen(false);
                        }}
                        className={`w-full text-left p-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer ${
                          isCur
                            ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-600/50 font-bold'
                            : 'hover:bg-slate-900 text-slate-300 hover:text-white'
                        }`}
                      >
                        <div className="truncate mr-2">
                          <div className="font-semibold truncate">{resto.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">Slug: #{resto.code.toLowerCase()}</div>
                        </div>
                        {isCur && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Direct Slug URL Row with 1-click copy */}
          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] gap-2">
            <div className="flex items-center gap-1.5 text-slate-400 truncate">
              <span className="font-mono text-[10px] text-slate-500">Direct Link:</span>
              <span className="font-mono font-bold text-slate-300 truncate">
                #/portal/{currentRestaurant?.code.toLowerCase()}
              </span>
            </div>
            <button
              onClick={() => {
                const directUrl = `${window.location.origin}${window.location.pathname}#/portal/${currentRestaurant?.code.toLowerCase()}`;
                navigator.clipboard.writeText(directUrl);
                setCopiedSlug(true);
                setTimeout(() => setCopiedSlug(false), 2000);
              }}
              className="px-2 py-0.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white font-mono text-[10px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
            >
              {copiedSlug ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Copied URL</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-slate-400" />
                  <span>Copy Portal Link</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* KILLER FEATURE: WAITING FOR BOSS APPROVAL ROOM BANNER */}
      {customer.provisionalStatus === 'pending_approval' && (
        <div className="p-4 rounded-3xl bg-gradient-to-br from-amber-950/90 via-slate-900 to-amber-950/60 border-2 border-amber-500 shadow-2xl relative overflow-hidden animate-in fade-in duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                <span className="font-black text-amber-200 text-xs tracking-wider uppercase">
                  Awaiting Boss Approval Room
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-[10px] font-bold text-amber-300 font-mono">
                Executive Queue #1
              </span>
            </div>

            <p className="text-slate-200 text-xs leading-relaxed">
              Your registration has been submitted directly to the <strong className="text-amber-300 font-bold">Boss Approval Room</strong>. The Restaurant Boss is verifying your Student ID and Mobile Money payment.
            </p>

            <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-amber-600/40 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="font-bold text-white text-xs">Provisional Grace Allowance</div>
                  <div className="text-[10px] text-amber-300">You can already eat at the counter today</div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-amber-400 font-mono">
                  {customer.gracePlatesRemaining ?? 2}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">Grace Meals</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Boss will send your WhatsApp Magic Pass link immediately upon approval.</span>
            </div>
          </div>
        </div>
      )}

      {/* Patron Persona Switcher (For Demo & Multi-account Testing) */}
      <div className="p-2 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-inner flex items-center justify-between gap-1 text-xs">
        <span className="text-[11px] font-semibold text-slate-400 pl-2">Account:</span>
        <div className="flex gap-1 overflow-x-auto">
          {state.customers
            .filter((c) => c.restaurantCode === state.currentRestaurantCode)
            .map((c) => {
            const isSelected = c.id === customer.id;
            return (
              <button
                key={c.id}
                onClick={() => restoStore.setCustomer(c.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <img src={c.photoUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                <span className="text-[11px]">{c.name.split(' ')[0]}</span>
                {c.provisionalStatus === 'pending_approval' ? (
                  <span className="px-1 py-0.2 rounded-full bg-amber-500 text-slate-950 font-bold text-[9px]">PENDING</span>
                ) : (
                  <span className="font-mono text-[10px] opacity-75">#{c.memberNo}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Patron Navigation Subtabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900 border border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('qr_pass')}
          className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'qr_pass'
              ? 'bg-emerald-600 text-white font-bold shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>Digital Pass</span>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer relative ${
            activeTab === 'notifications'
              ? 'bg-emerald-600 text-white font-bold shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Alerts</span>
          {unreadNotifCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-400 text-slate-950 font-black text-[10px] font-mono">
              {unreadNotifCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'history'
              ? 'bg-emerald-600 text-white font-bold shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Activity</span>
        </button>
      </div>

      {/* Critical Alerts: Low Balance or Locked Status */}
      {balance < 5 && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-900 border border-amber-600/50 text-amber-200 text-xs flex items-start gap-3 shadow-md">
          <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-amber-100">{t.scanner.lowBalanceWarning}</div>
            <div className="mt-0.5 opacity-90 leading-relaxed text-[11px]">{t.customer.lowBalanceBanner}</div>
          </div>
        </div>
      )}

      {customer.cardStatus === 'locked' && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-900 border border-rose-600/50 text-rose-200 text-xs flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-rose-100">Physical Card Locked</div>
              <div className="text-[11px] text-rose-300">Tap at stands is disabled · Plates preserved</div>
            </div>
          </div>
          <button
            onClick={handleToggleLockCard}
            className="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
          >
            {t.customer.unlockMyCard}
          </button>
        </div>
      )}

      {/* TAB 1: DIGITAL PASS */}
      {activeTab === 'qr_pass' && (
        <>
          {/* LUXURY DIGITAL MEAL PASS (Apple Wallet-Style Card with Dynamic Cafeteria Theming) */}
          <div className={`digital-card relative rounded-3xl bg-gradient-to-br ${badgeTheme.gradient} border ${badgeTheme.border} p-6 shadow-2xl overflow-hidden select-none`}>
            {/* Ambient Glows */}
            <div className={`absolute top-0 right-0 w-44 h-44 ${badgeTheme.glow} rounded-full blur-3xl pointer-events-none`} />
            <div className={`absolute bottom-0 left-0 w-44 h-44 ${badgeTheme.glowSecondary} rounded-full blur-3xl pointer-events-none`} />

            {/* Card Header: Restaurant & Status */}
            <div className="flex items-start justify-between relative z-10">
              <div>
                <div className={`text-[11px] font-mono tracking-widest ${badgeTheme.accent} uppercase font-semibold`}>
                  RestoPass Digital Card
                </div>
                <div className="text-base font-black text-white tracking-tight mt-0.5">
                  {currentRestaurant?.name}
                </div>
              </div>

              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-[10px] font-mono font-bold text-slate-300">
                  <span className={`w-1.5 h-1.5 rounded-full ${customer.cardStatus === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  <span>CARD V{customer.cardVersion}</span>
                </div>
              </div>
            </div>

            {/* Central Balance Display */}
            <div className="my-6 text-center relative z-10">
              <div className="text-6xl font-black text-white font-mono tabular-nums tracking-tighter drop-shadow-sm">
                {balance}
              </div>
              <div className={`text-xs uppercase font-bold tracking-widest ${badgeTheme.accent} mt-1 flex items-center justify-center gap-1.5`}>
                <Utensils className="w-3.5 h-3.5" />
                <span>Prepaid Plates Available</span>
              </div>
            </div>

            {/* Card Footer: Member details & sync status */}
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs relative z-10">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-mono">Member ID</div>
                <div className="text-sm font-bold text-white font-mono">#{customer.memberNo}</div>
              </div>

              <div className="text-center">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Holder</div>
                <div className="text-xs font-bold text-slate-200">{customer.name.split(' ')[0]}</div>
              </div>

              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Authority</div>
                <div className={`text-xs font-bold ${badgeTheme.accent} font-mono`}>{customer.restaurantCode}</div>
              </div>
            </div>
          </div>

          {/* QUICK WALLET ACTIONS */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTransferModalOpen(true)}
              className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 text-white text-xs font-bold flex items-center justify-center gap-2.5 transition-all shadow-md cursor-pointer group"
            >
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                <Send className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="leading-tight">{t.customer.transferPlates}</div>
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">Send to classmate</div>
              </div>
            </button>

            <button
              onClick={handleToggleLockCard}
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2.5 transition-all shadow-md cursor-pointer ${
                customer.cardStatus === 'locked'
                  ? 'bg-rose-950/70 border-rose-800 text-rose-200 hover:bg-rose-900/80'
                  : 'bg-slate-900 hover:bg-slate-800/90 border-slate-800 hover:border-slate-700 text-white'
              }`}
            >
              <div className={`p-2 rounded-xl transition-colors ${
                customer.cardStatus === 'locked' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/10 text-amber-400'
              }`}>
                {customer.cardStatus === 'locked' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </div>
              <div className="text-left">
                <div className="leading-tight">
                  {customer.cardStatus === 'locked' ? t.customer.unlockMyCard : t.customer.lockMyCard}
                </div>
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                  {customer.cardStatus === 'locked' ? 'Restore access' : 'Freeze lost card'}
                </div>
              </div>
            </button>

            {/* Instant Off-Screen Auto-Lock Shield Test / Trigger */}
            <button
              onClick={() => setIsDashboardLocked(true)}
              className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 text-white text-xs font-bold flex items-center justify-center gap-2.5 transition-all shadow-md cursor-pointer group"
            >
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                <Shield className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="leading-tight">Lock Screen</div>
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">Off-screen PIN shield</div>
              </div>
            </button>

            {/* 4-Digit Security PIN Customization */}
            <button
              onClick={() => setShowPinSetupModal(true)}
              className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 text-white text-xs font-bold flex items-center justify-center gap-2.5 transition-all shadow-md cursor-pointer group"
            >
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 group-hover:bg-sky-500/20 transition-colors">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="leading-tight">
                  {customer.hasCustomPin ? 'Security PIN' : 'Set 4-Digit PIN'}
                </div>
                <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                  {customer.hasCustomPin ? '•••• (Tap to edit)' : 'Required for safety'}
                </div>
              </div>
            </button>
          </div>

          {/* OFFLINE QR CODE SECTION (DYNAMIC OR PERMANENT CARD PASS) */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl text-center space-y-4 relative overflow-hidden">
            {/* Pass Format Toggle */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setQrPassType('dynamic')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    qrPassType === 'dynamic'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Rotating Phone QR
                </button>
                <button
                  onClick={() => setQrPassType('permanent')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    qrPassType === 'permanent'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Permanent Card QR
                </button>
              </div>

              {qrPassType === 'dynamic' ? (
                <button
                  onClick={handleForceRefresh}
                  title="Force immediate QR refresh"
                  className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-800/80 px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh</span>
                </button>
              ) : (
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 border border-cyan-800/80 px-2 py-0.5 rounded-full font-bold">
                  Never Expires
                </span>
              )}
            </div>

            {/* High-Contrast Ceramic QR Canvas */}
            <div className="p-4 bg-white rounded-2xl inline-block shadow-lg mx-auto">
              <QrCanvas
                value={qrPassType === 'dynamic' ? tokenInfo.token : permanentCardToken}
                size={210}
              />
            </div>

            {/* Details & Status */}
            {qrPassType === 'dynamic' ? (
              <div className="space-y-1.5 max-w-xs mx-auto">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Dynamic (v1)</span>
                  </span>
                  <span className="font-bold text-white tabular-nums">
                    Rotates in {tokenInfo.secondsRemaining}s
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-1000 ease-linear rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    style={{ width: `${(tokenInfo.secondsRemaining / 30) * 100}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed pt-1">
                  Antifraud rotating token (±5 min clock sync tolerance).
                </div>
              </div>
            ) : (
              <div className="space-y-1 max-w-xs mx-auto text-[11px] text-slate-400">
                <div className="font-mono text-cyan-400 font-bold">
                  Physical Card Token (c1) · Ver: {customer.cardVersion}
                </div>
                <div>
                  100% time-independent. Identical to printed PVC plastic cards.
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
              <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight">
                        Subscription Plans &amp; Pricing
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        {currentRestaurant?.name} meal bundles
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPlansExpanded(!plansExpanded)}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    {plansExpanded ? 'Collapse' : 'View Plans'}
                  </button>
                </div>

                {/* Always-visible Quick Pricing Summary */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Single Plate Rate</div>
                    <div className="text-base font-bold text-white font-mono mt-0.5">
                      {defaultRate.toLocaleString()} RWF
                    </div>
                    <div className="text-[10px] text-slate-500">Custom top-up rate</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Best Value Bundle</div>
                    <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                      {restoPackages.length > 0
                        ? `${Math.round(restoPackages[restoPackages.length - 1].priceRwf / restoPackages[restoPackages.length - 1].platesCount).toLocaleString()} RWF/p`
                        : `${defaultRate} RWF`}
                    </div>
                    <div className="text-[10px] text-emerald-400/80">
                      {restoPackages.length > 0 ? restoPackages[restoPackages.length - 1].name.split(' ')[0] : 'Standard'}
                    </div>
                  </div>
                </div>

                {/* Expanded Detailed Packages List */}
                {plansExpanded && (
                  <div className="space-y-2.5 pt-1 animate-in fade-in duration-150">
                    <div className="text-[11px] font-semibold text-slate-300">
                      Available Meal Packages:
                    </div>

                    <div className="space-y-2">
                      {restoPackages.map((pkg) => {
                        const unitPrice = Math.round(pkg.priceRwf / pkg.platesCount);
                        const saving = defaultRate - unitPrice;
                        return (
                          <div
                            key={pkg.id}
                            className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono font-bold">
                                  {pkg.platesCount}p
                                </span>
                                <span className="font-bold text-white text-[11px]">{pkg.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{pkg.description}</div>
                            </div>

                            <div className="text-right shrink-0 pl-2">
                              <div className="font-mono font-bold text-white text-xs">
                                {pkg.priceRwf.toLocaleString()} RWF
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {unitPrice.toLocaleString()} RWF/p
                                {saving > 0 && <span className="text-emerald-400 ml-1">(-{saving})</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Payment & Top-Up Instructions */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">How to Top Up:</span>
                    <button
                      type="button"
                      onClick={handleCopyMemberRef}
                      className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 cursor-pointer font-bold"
                    >
                      {copiedRef ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied ID #{customer.memberNo}!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Member #{customer.memberNo}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-[10px]">
                    Pay at the cashier desk or via MTN Mobile Money (*182#) using your Member ID <strong className="text-white font-mono">#{customer.memberNo}</strong> as payment reference. Plates are credited immediately.
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
          <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-400" />
                  <span>In-App Notifications</span>
                  {unreadNotifCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px]">
                      {unreadNotifCount} unread
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Autogenerated cafeteria meal logs &amp; manager announcements
                </p>
              </div>

              {unreadNotifCount > 0 && (
                <button
                  onClick={() => restoStore.markAllNotificationsAsRead(customer.id)}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {/* Filter pills */}
            <div className="flex gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[11px] overflow-x-auto">
              {[
                { id: 'all', label: 'All' },
                { id: 'unread', label: `Unread (${unreadNotifCount})` },
                { id: 'broadcast', label: 'Announcements' },
                { id: 'alerts', label: 'Alerts & Meals' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setNotifFilter(f.id as any)}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    notifFilter === f.id
                      ? 'bg-slate-800 text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications List */}
          {(() => {
            const filteredNotifs = customerNotifications.filter((n) => {
              if (notifFilter === 'unread') return !n.readByCustomerIds.includes(customer.id);
              if (notifFilter === 'broadcast') return n.target === 'all' || n.type === 'system_broadcast';
              if (notifFilter === 'alerts') return n.type === 'low_balance' || n.type === 'card_security' || n.type === 'meal_served';
              return true;
            });

            if (filteredNotifs.length === 0) {
              return (
                <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
                    <Bell className="w-5 h-5 opacity-40" />
                  </div>
                  <div className="text-xs font-semibold text-slate-300">No notifications in this folder</div>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    When you eat meals at dining stands or manager sends alerts, they appear right here.
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-2.5">
                {filteredNotifs.map((n) => {
                  const isUnread = !n.readByCustomerIds.includes(customer.id);
                  return (
                    <div
                      key={n.id}
                      onClick={() => restoStore.markNotificationAsRead(n.id, customer.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                        isUnread
                          ? 'bg-slate-850 border-emerald-500/50 shadow-md'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {isUnread && (
                        <span className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
                      )}

                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          n.priority === 'urgent'
                            ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                            : n.priority === 'important'
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                            : 'bg-slate-800 border border-slate-700 text-emerald-400'
                        }`}>
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
                            <span className="font-bold text-white text-xs leading-snug">
                              {n.title}
                            </span>
                            {n.priority === 'urgent' && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-800">
                                Urgent
                              </span>
                            )}
                            {n.priority === 'important' && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-950 text-amber-300 border border-amber-800">
                                Important
                              </span>
                            )}
                          </div>

                          <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                            {n.message}
                          </p>

                          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-2 pt-2 border-t border-slate-800/60">
                            <span>{n.senderName}</span>
                            <span className="flex items-center gap-1 text-[10px]">
                              <Clock className="w-3 h-3 opacity-60" />
                              {new Date(n.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {n.actionTab && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                restoStore.markNotificationAsRead(n.id, customer.id);
                                if (n.actionTab === 'history') setActiveTab('history');
                                else if (n.actionTab === 'my_card') setActiveTab('qr_pass');
                              }}
                              className="mt-2 text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <span>Open in {n.actionTab === 'my_card' ? 'My QR Pass' : 'Activity'}</span>
                              <ExternalLink className="w-3 h-3" />
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
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
              <History className="w-4 h-4 text-emerald-400" />
              <span>Recent Meal Activity</span>
            </div>
            <span className="text-[11px] text-slate-500">Last 3 Months</span>
          </div>

          {/* Segmented Timeline Filters */}
          <div className="flex gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800/80 text-[11px] font-medium text-slate-400">
            {[
              { id: 'all', label: 'All' },
              { id: 'meals', label: 'Meals Eaten' },
              { id: 'topups', label: 'Top-Ups' },
              { id: 'transfers', label: 'Transfers' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setHistoryFilter(f.id as any)}
                className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer text-center ${
                  historyFilter === f.id
                    ? 'bg-slate-800 text-white font-bold shadow-xs'
                    : 'hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredHistory.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500">
              No activity matching this filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto">
              {filteredHistory.map((item) => {
                const isPositive = item.platesDelta > 0;
                return (
                  <div key={item.id} className="py-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-300'
                      }`}>
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
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    <div className={`font-mono font-black tabular-nums text-sm ${
                      isPositive ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
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
      <div className="text-center text-[11px] text-slate-500 leading-relaxed pb-4">
        RestoPass Member #{customer.memberNo} · Unused plates never expire · No refunds
      </div>

      {/* TRANSFER MODAL */}
      {transferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Send className="w-4 h-4" />
                <h3 className="text-sm font-bold text-white">{t.customer.transferPlates}</h3>
              </div>
              <button
                onClick={() => setTransferModalOpen(false)}
                className="text-slate-400 hover:text-white font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            <p className="text-slate-300 text-[11px] leading-relaxed">
              Transfer plates to a friend or classmate registered at <strong>{currentRestaurant?.name}</strong>.
            </p>

            <div className="space-y-3">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Recipient Member # or Phone
                </label>
                <input
                  type="text"
                  placeholder="e.g. 28492 or +250 785 119 220"
                  value={recipientQuery}
                  onChange={(e) => setRecipientQuery(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                />
              </div>

              {foundRecipient && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700 text-xs space-y-1">
                  <div className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Recipient Verified</span>
                  </div>
                  <div className="font-bold text-white">
                    {maskName(foundRecipient.name)} (#{foundRecipient.memberNo})
                  </div>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Plates to Transfer
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, balance)}
                  value={platesToTransfer}
                  onChange={(e) => setPlatesToTransfer(parseInt(e.target.value) || 1)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                />
                <div className="text-[10px] text-slate-500 mt-1">Available balance: {balance} plates</div>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Your 4-Digit Security PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={transferPin}
                  onChange={(e) => setTransferPin(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-widest text-lg focus:border-emerald-500 outline-hidden"
                />
              </div>
            </div>

            {transferMessage && (
              <div className={`p-2.5 rounded-xl text-xs font-medium ${
                transferMessage.isError
                  ? 'bg-rose-950/80 border border-rose-700 text-rose-300'
                  : 'bg-emerald-950/80 border border-emerald-700 text-emerald-300'
              }`}>
                {transferMessage.text}
              </div>
            )}

            <button
              onClick={handleExecuteTransfer}
              disabled={!foundRecipient || !transferPin}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
            >
              Confirm &amp; Transfer Plates
            </button>
          </div>
        </div>
      )}

      {/* 4-DIGIT SECURITY PIN SETUP MODAL */}
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
