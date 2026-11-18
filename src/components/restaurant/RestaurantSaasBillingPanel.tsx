import React, { useCallback, useEffect, useState } from 'react';
import { restoStore } from '../../store/restoStore';

type BillingSnapshot = {
  subscription?: { status: string; price_rwf: number; current_period_end?: string | null; grace_period_end?: string | null; complimentary_ends_at?: string | null; renewal_grace_days?: number };
  payments?: Array<{ id: string; amount_rwf: number; months_purchased?: number; status: string; created_at: string; internal_reference: string }>;
};

export const RestaurantSaasBillingPanel: React.FC<{ restaurantCode: string; restricted?: boolean }> = ({ restaurantCode, restricted = false }) => {
  const [snapshot, setSnapshot] = useState<BillingSnapshot>({});
  const [phone, setPhone] = useState('');
  const [months, setMonths] = useState(1);
  const [paymentId, setPaymentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isPolling, setIsPolling] = useState(false);
  const [pollSecondsRemaining, setPollSecondsRemaining] = useState(60);

  const authHeaders = useCallback(() => {
    const token = restoStore.getAuthToken();
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/restaurant-saas/subscription', { headers: authHeaders(), cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load subscription.');
    setSnapshot(body);
  }, [authHeaders]);

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, [refresh]);

  const verify = useCallback(async (id: string, silent = false) => {
    if (!silent) setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/restaurant-saas/payment/' + encodeURIComponent(id) + '/verify', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Payment verification failed.');
      if (body.status === 'successful') {
        setIsPolling(false);
        setMessage('Payment verified. Your calendar-month RestoPass subscription is active.');
        setPaymentId('');
        await restoStore.pullStateFromServer();
      } else if (body.status === 'review_required') {
        setIsPolling(false);
        setMessage('MTN reports a successful transfer, but the payment details do not match. No access was activated; contact Bestie Companies Ltd for reconciliation.');
      } else if (body.status === 'failed') {
        setIsPolling(false);
        setError('MTN reports this payment failed. Please try again.');
      } else {
        if (!silent) {
          setMessage('MTN has not confirmed a successful payment yet. No access time has been granted.');
        }
      }
      await refresh();
    } catch (e: any) {
      if (!silent) setError(e.message || 'Verification failed.');
    } finally {
      if (!silent) setBusy(false);
    }
  }, [authHeaders, refresh]);

  const initiate = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || ('rp-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      const response = await fetch('/api/restaurant-saas/payment/initiate', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ payerMsisdn: phone, idempotencyKey, months }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not initiate MTN payment.');
      const pid = body.payment?.id || body.paymentId;
      if (pid) {
        setPaymentId(pid);
        setIsPolling(true);
      }
      setMessage(body.message || 'Payment request sent. Approve the MTN MoMo prompt.');
      await refresh();
    } catch (e: any) {
      setError(e.message || 'Payment initiation failed.');
      await refresh().catch(() => undefined);
    }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!isPolling || !paymentId) return;
    setPollSecondsRemaining(60);

    const countdown = setInterval(() => {
      setPollSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsPolling(false);
          setMessage('Auto-check window closed. You can tap "Verify payment status" whenever you approve the prompt on your phone.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const poller = setInterval(() => {
      void verify(paymentId, true);
    }, 3000);

    return () => {
      clearInterval(countdown);
      clearInterval(poller);
    };
  }, [isPolling, paymentId, verify]);

  const sub = snapshot.subscription;
  return (
    <div className="max-w-3xl mx-auto my-8 p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-700 space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-2xl">₣</div>
        <div>
          <h2 className="text-xl font-black text-white">RestoPass software subscription</h2>
          <p className="text-sm text-slate-400 mt-1">Pay Bestie Companies Ltd for restaurant access. This is separate from your customers’ meal balances and meal payments.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <div className="text-xs text-slate-400">Subscription price</div>
          <div className="text-2xl font-black text-white mt-1">{sub?.price_rwf ? Number(sub.price_rwf).toLocaleString() + ' RWF' : 'Loading…'}</div>
          <div className="text-xs text-slate-500 mt-1">Per calendar month; multiple months may be prepaid</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <div className="text-xs text-slate-400">Subscription status</div>
          <div className="text-lg font-bold text-white mt-1">{sub?.status || 'Loading…'}</div>
          <div className="text-xs text-slate-500 mt-1">{sub?.current_period_end ? 'Paid until ' + new Date(sub.current_period_end).toLocaleString() : 'No paid subscription period yet'}</div>
        </div>
      </div>
      {sub?.status === 'complimentary' && sub.complimentary_ends_at && (
        <div className="p-4 rounded-xl border border-emerald-700 bg-emerald-950/40 text-emerald-200 text-sm">
          <strong>Complimentary access is active.</strong> Your agreed free period ends on {new Date(sub.complimentary_ends_at).toLocaleDateString()}.
          Your first paid calendar month will begin only after that period ends and MTN confirms your payment.
        </div>
      )}
      {restricted && <div className="p-3 rounded-xl border border-amber-700 bg-amber-950/40 text-amber-200 text-sm">Your subscription is restricted. Scanner redemption and business-changing operations remain disabled until a payment is verified.</div>}
      {sub?.status !== 'complimentary' && Number(snapshot.subscription?.price_rwf ?? 0) > 0 && <div className="space-y-3">
        <h3 className="font-bold text-white">Pay with MTN MoMo</h3>
        <label className="block text-xs text-slate-400">Choose subscription duration</label>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-white">
          {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} calendar month{count === 1 ? '' : 's'} · {((Number(sub?.price_rwf) || 0) * count).toLocaleString()} RWF</option>)}
        </select>
        <p className="text-xs text-slate-400">Total due: <strong>{((Number(sub?.price_rwf) || 0) * months).toLocaleString()} RWF</strong></p>
        <label className="block text-xs text-slate-400">MTN Rwanda phone number</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+250 78X XXX XXX" className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-white outline-none focus:border-emerald-500" />
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={busy || isPolling || !phone.trim() || sub?.status === 'complimentary'} onClick={initiate} className="w-full sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-3 font-bold text-white">
            {busy ? 'Please wait…' : isPolling ? 'Prompt Sent' : 'Request MTN MoMo payment'}
          </button>
          {paymentId && !isPolling && (
            <button disabled={busy} onClick={() => verify(paymentId)} className="w-full sm:w-auto rounded-xl border border-emerald-600 text-emerald-300 hover:bg-emerald-950 disabled:opacity-50 px-5 py-3 font-bold">
              Verify payment status
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
                  Please approve the payment prompt on your phone for <strong>{((Number(sub?.price_rwf) || 0) * months).toLocaleString()} RWF</strong>. Access activates automatically once MTN confirms the transaction.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
              <button type="button" onClick={() => void verify(paymentId)} className="text-emerald-400 hover:text-emerald-300 font-semibold">
                Check status now
              </button>
              <button type="button" onClick={() => setIsPolling(false)} className="text-slate-400 hover:text-slate-200">
                Stop auto-checking
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-500">You must approve the payment prompt on your phone. An accepted request is not a successful payment. Subscription access changes only after server verification.</p>
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      </div>}
      <div className="border-t border-slate-800 pt-4">
        <h3 className="font-bold text-white mb-3">Recent SaaS payments</h3>
        {(snapshot.payments || []).length === 0 ? <p className="text-sm text-slate-500">No payment attempts recorded.</p> : (
          <div className="space-y-2">{snapshot.payments!.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950 border border-slate-800 p-3">
              <div><div className="text-sm font-semibold text-white">{Number(payment.amount_rwf).toLocaleString()} RWF · {payment.months_purchased || 1} month(s) · {payment.status}</div><div className="text-xs text-slate-500">{new Date(payment.created_at).toLocaleString()}</div></div>
              {!['successful','review_required'].includes(payment.status) && <button disabled={busy} onClick={() => { setPaymentId(payment.id); verify(payment.id); }} className="text-xs font-bold text-emerald-300 hover:text-white">Check status</button>}
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
};
