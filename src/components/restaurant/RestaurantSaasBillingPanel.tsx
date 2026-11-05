import React, { useCallback, useEffect, useState } from 'react';
import { restoStore } from '../../store/restoStore';

type BillingSnapshot = {
  subscription?: { status: string; price_rwf: number; current_period_end?: string | null; grace_period_end?: string | null };
  payments?: Array<{ id: string; amount_rwf: number; status: string; created_at: string; internal_reference: string }>;
};

export const RestaurantSaasBillingPanel: React.FC<{ restaurantCode: string; restricted?: boolean }> = ({ restaurantCode, restricted = false }) => {
  const [snapshot, setSnapshot] = useState<BillingSnapshot>({});
  const [phone, setPhone] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  const initiate = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || ('rp-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      const response = await fetch('/api/restaurant-saas/payment/initiate', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ payerMsisdn: phone, idempotencyKey }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not initiate MTN payment.');
      if (body.payment?.id) setPaymentId(body.payment.id);
      if (body.paymentId) setPaymentId(body.paymentId);
      setMessage(body.message || 'Payment request sent. Approve the MTN MoMo prompt.');
      await refresh();
    } catch (e: any) { setError(e.message || 'Payment initiation failed.'); }
    finally { setBusy(false); }
  };

  const verify = async (id: string) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/restaurant-saas/payment/' + encodeURIComponent(id) + '/verify', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Payment verification failed.');
      setMessage(body.status === 'successful' ? 'Payment verified. Your 30-day RestoPass subscription is active.' : 'MTN has not confirmed a successful payment yet. No access time has been granted.');
      if (body.status === 'successful') {
        setPaymentId('');
        await restoStore.pullStateFromServer();
      }
      await refresh();
    } catch (e: any) { setError(e.message || 'Verification failed.'); }
    finally { setBusy(false); }
  };

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
          <div className="text-xs text-slate-500 mt-1">30 days per verified payment</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <div className="text-xs text-slate-400">Subscription status</div>
          <div className="text-lg font-bold text-white mt-1">{sub?.status || 'Loading…'}</div>
          <div className="text-xs text-slate-500 mt-1">{sub?.current_period_end ? 'Paid until ' + new Date(sub.current_period_end).toLocaleString() : 'No paid subscription period yet'}</div>
        </div>
      </div>
      {restricted && <div className="p-3 rounded-xl border border-amber-700 bg-amber-950/40 text-amber-200 text-sm">Your subscription is restricted. Scanner redemption and business-changing operations remain disabled until a payment is verified.</div>}
      <div className="space-y-3">
        <h3 className="font-bold text-white">Pay with MTN MoMo</h3>
        <label className="block text-xs text-slate-400">MTN Rwanda phone number</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+250 78X XXX XXX" className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-white outline-none focus:border-emerald-500" />
        <button disabled={busy || !phone.trim()} onClick={initiate} className="w-full sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-3 font-bold text-white">{busy ? 'Please wait…' : 'Request MTN MoMo payment'}</button>
        <p className="text-xs text-slate-500">You must approve the payment prompt on your phone. An accepted request is not a successful payment. Subscription access changes only after server verification.</p>
        {paymentId && <button disabled={busy} onClick={() => verify(paymentId)} className="w-full sm:w-auto rounded-xl border border-emerald-600 text-emerald-300 hover:bg-emerald-950 disabled:opacity-50 px-5 py-3 font-bold">Verify payment status</button>}
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      </div>
      <div className="border-t border-slate-800 pt-4">
        <h3 className="font-bold text-white mb-3">Recent SaaS payments</h3>
        {(snapshot.payments || []).length === 0 ? <p className="text-sm text-slate-500">No payment attempts recorded.</p> : (
          <div className="space-y-2">{snapshot.payments!.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950 border border-slate-800 p-3">
              <div><div className="text-sm font-semibold text-white">{Number(payment.amount_rwf).toLocaleString()} RWF · {payment.status}</div><div className="text-xs text-slate-500">{new Date(payment.created_at).toLocaleString()}</div></div>
              {payment.status !== 'successful' && <button disabled={busy} onClick={() => { setPaymentId(payment.id); verify(payment.id); }} className="text-xs font-bold text-emerald-300 hover:text-white">Check status</button>}
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
};
