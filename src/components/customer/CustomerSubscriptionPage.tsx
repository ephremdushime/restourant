import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Customer,
  CustomerSubscription,
  StudentSubscriptionPayment,
  StudentSubscriptionSettings,
} from '../../types';
import { restoStore } from '../../store/restoStore';
import { Smartphone, CheckCircle2, Clock, Receipt, ShieldCheck, Gift, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

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
  const [phone, setPhone] = useState(customer.phone || '');
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingReference, setPendingReference] = useState('');
  const [isPolling, setIsPolling] = useState(false);
  const [pollSecondsRemaining, setPollSecondsRemaining] = useState(60);

  const scopedPayments = paymentHistory.filter(
    (p) => p.customerId === customer.id && p.restaurantCode === customer.restaurantCode
  );
  const policy = subscriptionSettings;
  const promoState = useMemo(() => {
    const now = Date.now();
    const start = policy.promoStartsAt ? Date.parse(policy.promoStartsAt) : 0;
    const end = policy.promoEndsAt ? Date.parse(policy.promoEndsAt) : Number.POSITIVE_INFINITY;
    const valid = (!policy.promoStartsAt || Number.isFinite(start)) && (!policy.promoEndsAt || Number.isFinite(end));
    return {
      active: Boolean(policy.promoAccessEnabled) && valid && now >= start && now < end,
      startsAt: policy.promoStartsAt,
      endsAt: policy.promoEndsAt,
    };
  }, [policy.promoAccessEnabled, policy.promoStartsAt, policy.promoEndsAt]);
  const freeAccess = !policy.enabled || promoState.active;
  const effectiveStatus = freeAccess ? 'complimentary' : subscription?.status || customer.customerAccessStatus || 'inactive';
  const expiryDate = promoState.active
    ? promoState.endsAt || null
    : subscription?.currentPeriodEnd || customer.freeAccessExpiresAt || subscription?.gracePeriodEnd || null;
  const totalAmount = monthlyPriceRwf * months;
  const token = restoStore.getAuthToken();
  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  }), [token]);

  const verifyPayment = useCallback(async (reference = pendingReference, silent = false) => {
    if (!reference) return;
    if (!silent) setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/customer/subscription/payments/' + encodeURIComponent(reference) + '/status', {
        headers: authHeaders,
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not verify payment status.');
      if (body.status === 'SUCCESSFUL') {
        setIsPolling(false);
        setPendingReference('');
        setMessage('Payment verified. Your dashboard subscription has been activated.');
        await restoStore.pullStateFromServer();
      } else if (body.status === 'REVIEW_REQUIRED') {
        setIsPolling(false);
        setMessage('MTN reports a payment, but details need reconciliation. No access has been activated yet.');
      } else if (body.status === 'FAILED') {
        setIsPolling(false);
        setPendingReference('');
        setError('MTN reports that this payment failed. You can start a new payment.');
      } else {
        if (!silent) {
          setMessage('MTN has not confirmed payment yet. Please wait and check again.');
        }
      }
      await restoStore.pullStateFromServer();
    } catch (e: any) {
      if (!silent) setError(e?.message || 'Payment verification failed.');
    } finally {
      if (!silent) setBusy(false);
    }
  }, [pendingReference, authHeaders]);

  const startPayment = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || ('patron-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      const response = await fetch('/api/customer/subscription/checkout', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ phone, months, idempotencyKey }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not initiate MTN MoMo payment.');
      const ref = body.internalReference || body.payment?.internalReference || body.paymentAttempt?.internalReference;
      if (ref) {
        setPendingReference(ref);
        setIsPolling(true);
      }
      setMessage(body.message || 'Approve the MTN MoMo prompt. Access activates after provider verification.');
    } catch (e: any) {
      setError(e?.message || 'Payment request failed.');
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!isPolling || !pendingReference) return;
    setPollSecondsRemaining(60);

    const countdownTimer = setInterval(() => {
      setPollSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsPolling(false);
          setMessage('Auto-check window closed. You can tap "Verify payment status" whenever you approve the prompt on your phone.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const statusPoller = setInterval(() => {
      void verifyPayment(pendingReference, true);
    }, 3000);

    return () => {
      clearInterval(countdownTimer);
      clearInterval(statusPoller);
    };
  }, [isPolling, pendingReference, verifyPayment]);

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="rounded-2xl bg-emerald-950/50 border border-emerald-600/60 p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          <strong className="text-white block mb-0.5">Dashboard Subscription Is Separate From Your Meal Balance</strong>
          An expired dashboard subscription never disables your physical card or consumes, erases, or alters your prepaid meal credits. Your card continues to work at the restaurant's scanner stations.
        </div>
      </div>

      {freeAccess && (
        <div className="rounded-2xl bg-emerald-950/50 border border-emerald-600/60 p-4 flex items-start gap-3">
          <Gift className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-emerald-100 leading-relaxed">
            <strong className="block text-white mb-1">{promoState.active ? 'You are using promotional access' : 'Your RestoPass access is currently free'}</strong>
            {promoState.active
              ? (policy.promoMessage || 'You are enjoying complimentary RestoPass access during our launch promotion.')
              : 'Customer subscription payments are currently disabled by RestoPass. You can use the available customer dashboard features without an access fee.'}
            {promoState.active && promoState.endsAt && (
              <span className="block mt-1 font-semibold">Promotional period ends {new Date(promoState.endsAt).toLocaleDateString()}.</span>
            )}
            <span className="block mt-1 text-emerald-200/80">The promotion end date is displayed here so you can plan ahead. No payment is automatic: you must choose a subscription and approve an MTN MoMo request. Meal purchases remain payable directly to the restaurant.</span>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">Digital Dashboard Access</h2>
              <p className="text-xs text-slate-400">Member #{customer.memberNo} · {customer.restaurantCode}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-xl border text-xs font-mono font-bold uppercase ${effectiveStatus === 'active' || effectiveStatus === 'complimentary'
            ? 'bg-emerald-950/70 border-emerald-600/70 text-emerald-300'
            : effectiveStatus === 'grace_period'
              ? 'bg-amber-950/70 border-amber-600/70 text-amber-300'
              : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
            {promoState.active ? 'PROMOTIONAL ACCESS' : !policy.enabled ? 'INCLUDED (FREE)' : effectiveStatus.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-400">Monthly Dashboard Fee</div>
            <div className="text-base font-black text-white font-mono mt-1">
              {policy.enabled ? `${monthlyPriceRwf.toLocaleString()} RWF / calendar month` : '0 RWF (Free access)'}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-400">{promoState.active ? 'Promotional Expiry' : 'Current Period / Expiry'}</div>
            <div className="text-sm font-bold text-white font-mono mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{expiryDate ? new Date(expiryDate).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : freeAccess ? 'Unrestricted' : 'No active period'}</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-400">Renewal Grace Window</div>
            <div className="text-sm font-bold text-slate-200 font-mono mt-1">{policy.graceDays} calendar day(s)</div>
          </div>
        </div>
      </div>

      {!freeAccess && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Renew with MTN MoMo</span>
          </div>
          <p className="text-xs text-slate-400">Select the number of calendar months you want to pay for. Your existing paid time is preserved when you renew early.</p>
          <label className="block text-xs text-slate-400">Subscription duration</label>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-white">
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>{count} calendar month{count === 1 ? '' : 's'} · {(monthlyPriceRwf * count).toLocaleString()} RWF</option>
            ))}
          </select>
          <label className="block text-xs text-slate-400">MTN Rwanda phone number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+250 78X XXX XXX" className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-white outline-none focus:border-emerald-500" />
          <div className="text-sm text-slate-200">Total due: <strong className="text-white">{totalAmount.toLocaleString()} RWF</strong></div>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={busy || isPolling || !phone.trim()} onClick={startPayment} className="w-full sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-3 font-bold text-white flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
              <span>{busy ? 'Dispatching prompt…' : isPolling ? 'Prompt Sent' : 'Request MTN MoMo payment'}</span>
            </button>
            {pendingReference && !isPolling && (
              <button disabled={busy} onClick={() => void verifyPayment(pendingReference)} className="w-full sm:w-auto rounded-xl border border-emerald-600 text-emerald-300 hover:bg-emerald-950 disabled:opacity-50 px-5 py-3 font-bold flex items-center justify-center gap-2">
                <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                <span>Verify payment status</span>
              </button>
            )}
          </div>

          {isPolling && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>MTN MoMo prompt sent to {phone}</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-mono">
                      {pollSecondsRemaining}s
                    </span>
                  </div>
                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    Please check your phone screen, review the prompt for <strong>{totalAmount.toLocaleString()} RWF</strong>, enter your PIN and confirm. This screen updates automatically upon approval.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                <button type="button" onClick={() => void verifyPayment(pendingReference)} className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5" /> Check status now
                </button>
                <button type="button" onClick={() => setIsPolling(false)} className="text-slate-400 hover:text-slate-200">
                  Stop auto-checking
                </button>
              </div>
            </div>
          )}

          {message && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
          <p className="text-xs text-slate-500">A payment request is not proof of payment. Your subscription activates only after RestoPass verifies the transaction directly with MTN.</p>
        </div>
      )}

      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span>Subscription Payment History</span>
          </div>
          <span className="text-xs font-mono text-slate-400">{scopedPayments.length} record(s)</span>
        </div>
        {scopedPayments.length === 0 ? (
          <div className="py-6 text-center text-xs sm:text-sm text-slate-400">No subscription payment records on file for Member #{customer.memberNo}.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {scopedPayments.map((payment) => (
              <div key={payment.id} className="py-3 flex items-center justify-between text-xs sm:text-sm">
                <div>
                  <div className="font-bold text-white font-mono">
                    {payment.amountRwf.toLocaleString()} {payment.currency || 'RWF'} · {payment.monthsPurchased || 1} month(s) · <span className="uppercase">{payment.provider.replace('_', ' ')}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Ref: {payment.providerTransactionId || payment.internalReference} · {new Date(payment.verifiedAt || payment.initiatedAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-md font-mono font-bold text-xs uppercase ${payment.status === 'verified'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-300'}`}>{payment.status}</span>
                  {['created', 'provider_pending', 'pending'].includes(payment.status) && (
                    <button type="button" disabled={busy} onClick={() => { setPendingReference(payment.internalReference); void verifyPayment(payment.internalReference); }}
                      className="text-xs font-bold text-emerald-300 hover:text-white disabled:opacity-50">Check status</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
