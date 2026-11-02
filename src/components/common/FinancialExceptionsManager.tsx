import React, { useCallback, useEffect, useState } from 'react';
import { restoStore } from '../../store/restoStore';

type ExceptionType = 'scan_reversal' | 'transfer_reversal' | 'cash_refund';
type ExceptionRecord = {
  id: string;
  type: ExceptionType;
  sourceId: string;
  restaurantCode: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt?: string;
  requestedByUserId?: string;
  snapshot?: { amountRwf?: number; plates?: number; paymentMethod?: string };
  approval?: { username?: string; reason?: string; payoutReference?: string; approvedAt?: string };
  rejection?: { username?: string; reason?: string; rejectedAt?: string };
};

interface Props { mode: 'request' | 'review'; }

const typeLabels: Record<ExceptionType, string> = {
  scan_reversal: 'Reverse an incorrect meal scan',
  transfer_reversal: 'Reverse a completed plate transfer',
  cash_refund: 'Record a cash/bank refund',
};

export const FinancialExceptionsManager: React.FC<Props> = ({ mode }) => {
  const [items, setItems] = useState<ExceptionRecord[]>([]);
  const [type, setType] = useState<ExceptionType>('scan_reversal');
  const [sourceId, setSourceId] = useState('');
  const [reason, setReason] = useState('');
  const [approvalReason, setApprovalReason] = useState<Record<string, string>>({});
  const [payoutReference, setPayoutReference] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const token = restoStore.getAuthToken();
  const load = useCallback(async () => {
    if (!token) { setError('Your session has expired. Sign in again.'); return; }
    try {
      const response = await fetch('/api/financial-exceptions', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not load exception requests.');
      setItems(Array.isArray(body.exceptions) ? body.exceptions : []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load exception requests.');
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || sourceId.trim().length < 3 || reason.trim().length < 12) {
      setError('Enter a valid source ID and a reason of at least 12 characters.');
      return;
    }
    setBusyId('submit');
    setError('');
    setNotice('');
    try {
      const idempotencyKey = 'fex_' + (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      const response = await fetch('/api/financial-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ type, sourceId: sourceId.trim(), reason: reason.trim(), idempotencyKey }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Request was not submitted.');
      setSourceId(''); setReason('');
      setNotice('Exception request submitted. No balance was changed; a separate platform reviewer must decide.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request was not submitted.');
    } finally { setBusyId(''); }
  };

  const review = async (item: ExceptionRecord, decision: 'approve' | 'reject') => {
    if (!token) { setError('Your session has expired. Sign in again.'); return; }
    const reviewReason = (approvalReason[item.id] || '').trim();
    const payout = (payoutReference[item.id] || '').trim();
    if (reviewReason.length < 12) { setError('A review reason of at least 12 characters is required.'); return; }
    if (decision === 'approve' && item.type === 'cash_refund' && payout.length < 4) {
      setError('Enter the cash/bank payout receipt reference before approving this refund.');
      return;
    }
    setBusyId(item.id); setError(''); setNotice('');
    try {
      const response = await fetch('/api/financial-exceptions/' + encodeURIComponent(item.id) + '/' + decision, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(decision === 'approve'
          ? { approvalReason: reviewReason, payoutReference: payout }
          : { reason: reviewReason }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Review was not committed.');
      setNotice(decision === 'approve'
        ? 'Approved. The compensating ledger transaction was committed.'
        : 'Rejected. No customer balance was changed.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review was not committed.');
    } finally { setBusyId(''); }
  };

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white">Financial exceptions</h3>
          <p className="text-sm text-slate-300">
            {mode === 'request'
              ? 'Submit a reasoned request. This does not change a customer balance.'
              : 'Review pending requests. Approval posts an audited compensating ledger entry.'}
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold text-white">Refresh</button>
      </div>

      {mode === 'request' && (
        <form onSubmit={submitRequest} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-200">
            Exception type
            <select value={type} onChange={e => setType(e.target.value as ExceptionType)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2.5 text-white">
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-200">
            Source transaction / scan ID
            <input value={sourceId} onChange={e => setSourceId(e.target.value)} maxLength={64} required placeholder="Paste the exact transaction ID" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2.5 text-white" />
          </label>
          <label className="text-sm text-slate-200 md:col-span-2">
            Reason (minimum 12 characters)
            <textarea value={reason} onChange={e => setReason(e.target.value)} minLength={12} maxLength={500} required rows={3} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2.5 text-white" />
          </label>
          <div className="md:col-span-2">
            <button disabled={busyId === 'submit'} className="rounded-lg bg-emerald-600 px-4 py-2.5 font-bold text-white disabled:opacity-50">{busyId === 'submit' ? 'Submitting…' : 'Submit for platform review'}</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-950/50 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p>}

      <div className="space-y-3">
        {items.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">No financial exception requests found.</p> : items.map(item => (
          <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-white">{typeLabels[item.type] || item.type}</p>
                <p className="font-mono text-xs text-slate-400">{item.id} · {item.restaurantCode} · Source: {item.sourceId}</p>
              </div>
              <span className={'rounded-full px-2.5 py-1 text-xs font-bold ' + (item.status === 'pending' ? 'bg-amber-900 text-amber-200' : item.status === 'approved' ? 'bg-emerald-900 text-emerald-200' : 'bg-rose-900 text-rose-200')}>{item.status}</span>
            </div>
            <p className="text-sm text-slate-200">{item.reason}</p>
            {item.snapshot && <p className="text-xs text-slate-400">{item.snapshot.plates ?? '—'} plates {item.snapshot.amountRwf ? '· ' + item.snapshot.amountRwf.toLocaleString() + ' RWF' : ''}</p>}
            {mode === 'review' && item.status === 'pending' && (
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <textarea value={approvalReason[item.id] || ''} onChange={e => setApprovalReason(v => ({ ...v, [item.id]: e.target.value }))} rows={2} maxLength={500} placeholder="Review justification (minimum 12 characters)" className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm text-white" />
                {item.type === 'cash_refund' && <input value={payoutReference[item.id] || ''} onChange={e => setPayoutReference(v => ({ ...v, [item.id]: e.target.value }))} maxLength={128} placeholder="Cash/bank payout receipt reference" className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm text-white" />}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!!busyId} onClick={() => void review(item, 'approve')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busyId === item.id ? 'Processing…' : 'Approve and post'}</button>
                  <button type="button" disabled={!!busyId} onClick={() => void review(item, 'reject')} className="rounded-lg bg-rose-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Reject</button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};
