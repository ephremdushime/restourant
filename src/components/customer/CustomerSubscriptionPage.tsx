import React from 'react';
import {
  Customer,
  CustomerSubscription,
  StudentSubscriptionPayment,
  StudentSubscriptionSettings,
} from '../../types';
import {
  Smartphone,
  CheckCircle2,
  Clock,
  Receipt,
  ShieldCheck,
} from 'lucide-react';

interface CustomerSubscriptionPageProps {
  customer: Customer;
  subscriptionSettings: StudentSubscriptionSettings;
  subscription: CustomerSubscription | null;
  monthlyPriceRwf: number;
  paymentHistory: StudentSubscriptionPayment[];
}

export const CustomerSubscriptionPage: React.FC<CustomerSubscriptionPageProps> = ({
  customer,
  subscriptionSettings,
  subscription,
  monthlyPriceRwf,
  paymentHistory,
}) => {
  // Strictly scope payment history to the authenticated customer and tenant
  const scopedPayments = paymentHistory.filter(
    (p) =>
      p.customerId === customer.id &&
      (!p.restaurantCode || p.restaurantCode === customer.restaurantCode)
  );

  const effectiveStatus = !subscriptionSettings.enabled
    ? 'complimentary'
    : subscription?.status || customer.customerAccessStatus || 'inactive';

  const expiryDate =
    subscription?.currentPeriodEnd ||
    customer.freeAccessExpiresAt ||
    subscription?.gracePeriodEnd ||
    null;

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Critical Non-Negotiable Distinction Banner */}
      <div className="rounded-2xl bg-emerald-950/50 border border-emerald-600/60 p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          <strong className="text-white block mb-0.5">
            Dashboard Subscription Is Separate From Your Meal Balance
          </strong>
          An expired digital dashboard subscription never disables your physical PVC card or consumes, erases, or alters your prepaid meal credits. Your printed card continues to work at all cafeteria scanner stations.
        </div>
      </div>

      {/* Subscription Status & Pricing Card */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Digital Dashboard Access Entitlement
              </h2>
              <p className="text-xs text-slate-400">
                Member #{customer.memberNo} · {customer.restaurantCode}
              </p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-xl border text-xs font-mono font-bold uppercase ${effectiveStatus === 'active' || effectiveStatus === 'complimentary'
                ? 'bg-emerald-950/70 border-emerald-600/70 text-emerald-300'
                : effectiveStatus === 'grace_period'
                  ? 'bg-amber-950/70 border-amber-600/70 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
          >
            {!subscriptionSettings.enabled ? 'INCLUDED (FREE)' : effectiveStatus.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-400">Monthly Dashboard Fee</div>
            <div className="text-base font-black text-white font-mono mt-1">
              {subscriptionSettings.enabled
                ? `${monthlyPriceRwf.toLocaleString()} RWF / 30 days`
                : '0 RWF (Policy Disabled)'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-400">Current Period / Expiry</div>
            <div className="text-sm font-bold text-white font-mono mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {expiryDate
                  ? new Date(expiryDate).toLocaleDateString([], {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                  : !subscriptionSettings.enabled
                    ? 'Unrestricted'
                    : 'No active period'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-400">Grace Window After Expiry</div>
            <div className="text-sm font-bold text-slate-200 font-mono mt-1">
              {subscriptionSettings.graceDays || 3} Days ({(subscriptionSettings.graceDays || 3) * 24}h)
            </div>
          </div>
        </div>
      </div>

      {/* Manual Renewal Instructions */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Manual Renewal &amp; Verification Instructions</span>
        </div>
        <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <li>
            Visit your cafeteria reception desk and pay the monthly digital dashboard access fee (
            <strong className="text-white font-mono">{monthlyPriceRwf.toLocaleString()} RWF</strong>) using your Member ID{' '}
            <strong className="text-white font-mono">#{customer.memberNo}</strong>.
          </li>
          <li>Keep your official receipt or verified MTN MoMo payment reference.</li>
          <li>
            Platform Super Admin independently verifies the payment and activates your next 30-day digital dashboard period.
          </li>
        </ol>
        <p className="text-xs text-slate-400 pt-1">
          Online self-checkout remains disabled until provider webhook verification is enabled. Subscriptions are never marked paid from unverified client references.
        </p>
      </div>

      {/* Verified Subscription Payment History */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span>Verified Subscription Payment History</span>
          </div>
          <span className="text-xs font-mono text-slate-400">{scopedPayments.length} record(s)</span>
        </div>

        {scopedPayments.length === 0 ? (
          <div className="py-6 text-center text-xs sm:text-sm text-slate-400">
            No subscription payment records on file for Member #{customer.memberNo}.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {scopedPayments.map((payment) => (
              <div key={payment.id} className="py-3 flex items-center justify-between text-xs sm:text-sm">
                <div>
                  <div className="font-bold text-white font-mono">
                    {payment.amountRwf.toLocaleString()} {payment.currency || 'RWF'} ·{' '}
                    <span className="uppercase">{payment.provider.replace('_', ' ')}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Ref: {payment.providerTransactionId || payment.internalReference} ·{' '}
                    {new Date(payment.verifiedAt || payment.initiatedAt).toLocaleDateString([], {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-md font-mono font-bold text-xs uppercase ${payment.status === 'verified'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-300'
                    }`}
                >
                  {payment.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

