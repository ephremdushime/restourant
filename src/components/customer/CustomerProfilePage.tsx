import React, { useState } from 'react';
import {
  Customer,
  CustomerSubscription,
  Restaurant,
  StudentSubscriptionPayment,
  StudentSubscriptionSettings,
} from '../../types';
import { CustomerProfileSubPage } from './CustomerPortalLayout';
import { CustomerSecuritySettings } from './CustomerSecuritySettings';
import { CustomerSubscriptionPage } from './CustomerSubscriptionPage';
import {
  User,
  Shield,
  Smartphone,
  FileText,
  Building2,
  Copy,
  Check,
  LogOut,
  GraduationCap,
  Phone,
  Hash,
  MapPin,
  Mail,
} from 'lucide-react';

interface CustomerProfilePageProps {
  customer: Customer;
  restaurant?: Restaurant;
  balance: number;
  activeSubPage: CustomerProfileSubPage;
  onChangeSubPage: (subPage: CustomerProfileSubPage) => void;
  subscriptionSettings: StudentSubscriptionSettings;
  subscription: CustomerSubscription | null;
  monthlyPriceRwf: number;
  paymentHistory: StudentSubscriptionPayment[];
  onOpenPinSetup: () => void;
  onLockDashboard: () => void;
  onToggleLockCard: () => void;
  onSignOut?: () => void;
  lockMyCardLabel: string;
  unlockMyCardLabel: string;
}

export const CustomerProfilePage: React.FC<CustomerProfilePageProps> = ({
  customer,
  restaurant,
  balance,
  activeSubPage,
  onChangeSubPage,
  subscriptionSettings,
  subscription,
  monthlyPriceRwf,
  paymentHistory,
  onOpenPinSetup,
  onLockDashboard,
  onToggleLockCard,
  onSignOut,
  lockMyCardLabel,
  unlockMyCardLabel,
}) => {
  const [copiedMemberNo, setCopiedMemberNo] = useState(false);

  const handleCopyMemberNo = () => {
    navigator.clipboard?.writeText(customer.memberNo);
    setCopiedMemberNo(true);
    setTimeout(() => setCopiedMemberNo(false), 2000);
  };

  const tabs: Array<{
    id: CustomerProfileSubPage;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'personal', label: 'Personal Info', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'subscription', label: 'Subscription', icon: Smartphone },
    { id: 'privacy', label: 'Privacy & Data', icon: FileText },
    { id: 'account', label: 'Account', icon: Building2 },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Profile Header & Sub-Navigation */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 space-y-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-black text-base flex items-center justify-center shrink-0">
              {customer.name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() || '')
                .join('') || 'RP'}
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
                {customer.name}
              </h1>
              <div className="text-xs sm:text-sm text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                <span className="font-mono text-slate-200 font-semibold">#{customer.memberNo}</span>
                <span>·</span>
                <span>{restaurant?.name || 'Campus Dining'} ({customer.restaurantCode})</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyMemberNo}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono font-bold text-emerald-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copiedMemberNo ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied #{customer.memberNo}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Member #{customer.memberNo}</span>
              </>
            )}
          </button>
        </div>

        {/* Section Tabs */}
        <div
          role="tablist"
          aria-label="Profile and Settings Sections"
          className="flex gap-1.5 p-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs sm:text-sm overflow-x-auto"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeSubPage === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isSelected}
                type="button"
                onClick={() => onChangeSubPage(tab.id)}
                className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. PERSONAL INFORMATION */}
      {activeSubPage === 'personal' && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 space-y-5 shadow-lg">
          <div>
            <h2 className="text-base font-bold text-white">Personal Information</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified patron identity registered with {restaurant?.name || customer.restaurantCode}. To update official identity fields, visit the cafeteria reception desk with your physical ID.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span>Full Name</span>
              </div>
              <div className="font-bold text-white">{customer.name}</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Registered Phone Number</span>
              </div>
              <div className="font-mono font-bold text-white">{customer.phone || 'Not provided'}</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-emerald-400" />
                <span>Member Number</span>
              </div>
              <div className="font-mono font-bold text-emerald-400">#{customer.memberNo}</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Home Dining Branch</span>
              </div>
              <div className="font-bold text-white">{customer.branchName || 'Main Dining Hall'}</div>
            </div>
          </div>

          {customer.isStudent && customer.studentProfile && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <GraduationCap className="w-4 h-4" />
                <span>Student Academic Profile</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
                <div>
                  <div className="text-xs text-slate-400">Institution</div>
                  <div className="font-semibold text-white mt-0.5">
                    {customer.studentProfile.institution || 'Campus'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Programme</div>
                  <div className="font-semibold text-white mt-0.5">
                    {customer.studentProfile.programme || 'Undergraduate'} (Year {customer.studentProfile.year || 1})
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Student Registration Number</div>
                  <div className="font-mono font-semibold text-slate-200 mt-0.5">
                    {customer.studentProfile.registrationNumber || 'Verified on file'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. SECURITY */}
      {activeSubPage === 'security' && (
        <CustomerSecuritySettings
          customer={customer}
          onOpenPinSetup={onOpenPinSetup}
          onLockDashboard={onLockDashboard}
          onToggleLockCard={onToggleLockCard}
          lockMyCardLabel={lockMyCardLabel}
          unlockMyCardLabel={unlockMyCardLabel}
        />
      )}

      {/* 3. SUBSCRIPTION */}
      {activeSubPage === 'subscription' && (
        <CustomerSubscriptionPage
          customer={customer}
          subscriptionSettings={subscriptionSettings}
          subscription={subscription}
          monthlyPriceRwf={monthlyPriceRwf}
          paymentHistory={paymentHistory}
        />
      )}

      {/* 4. PRIVACY & DATA */}
      {activeSubPage === 'privacy' && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 space-y-4 shadow-lg text-sm">
          <div>
            <h2 className="text-base font-bold text-white">Privacy &amp; Data Protection</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              How RestoPass and {restaurant?.name || customer.restaurantCode} protect your dining records.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="font-bold text-white">Data Collected</div>
              <p className="text-slate-300 leading-relaxed text-xs">
                Your name, phone number, Member ID (#{customer.memberNo}), salted PIN verification hash, stand verification portrait, and append-only meal ledger entries. Raw identity document numbers and plaintext PINs are never stored or exposed.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="font-bold text-white">Strict Multi-Tenant Isolation</div>
              <p className="text-slate-300 leading-relaxed text-xs">
                Your account is scoped exclusively to <strong className="text-white">{restaurant?.name || customer.restaurantCode}</strong> ({customer.restaurantCode}). Other restaurants and other patrons cannot view your balance, portrait, or activity history.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="font-bold text-white text-xs sm:text-sm">
              Support, Corrections &amp; Account Requests
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              For profile corrections, card replacement, or data inquiries, contact your dining facility administration:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs text-slate-300">
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{restaurant?.phone || 'Reception Desk'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{restaurant?.email || 'support@restopass.rw'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{restaurant?.address || 'Campus Cafeteria'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. ACCOUNT & SIGN-OUT */}
      {activeSubPage === 'account' && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 space-y-5 shadow-lg">
          <div>
            <h2 className="text-base font-bold text-white">Restaurant Membership &amp; Session</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Authenticated membership details and session controls.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-400">Restaurant Tenant</div>
              <div className="font-bold text-white mt-0.5">
                {restaurant?.name || 'Campus Dining'} ({customer.restaurantCode})
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-400">Member Since</div>
              <div className="font-mono font-bold text-white mt-0.5">
                {customer.createdAt
                  ? new Date(customer.createdAt).toLocaleDateString([], {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Active'}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-400">Prepaid Meal Balance</div>
              <div className="font-mono font-bold text-emerald-400 mt-0.5">
                {balance} plates (Never expires)
              </div>
            </div>
          </div>

          {onSignOut && (
            <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                Signing out terminates your active session on this browser while preserving your meal balance and physical card status.
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shrink-0 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out Securely</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

