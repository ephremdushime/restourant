import React, { useState } from 'react';
import { PendingApproval, Customer, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CreditCard,
  Copy,
  Check,
  ShieldCheck,
  Smartphone,
  Phone,
  UserCheck,
  Filter,
  Search,
  ExternalLink,
  Tag,
  DollarSign,
  UserPlus,
} from 'lucide-react';

interface BossApprovalsManagerProps {
  restaurantCode: string;
  language?: Language;
}

export const BossApprovalsManager: React.FC<BossApprovalsManagerProps> = ({
  restaurantCode,
  language,
}) => {
  const t = translations[language || 'en'];
  const state = restoStore.getState();
  const currentResto = restoStore.getCurrentRestaurant();
  const approvals = restoStore.getRestaurantPendingApprovals(restaurantCode);

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'new_customer' | 'balance_topup'>('all');

  // Copy feedback
  const [copiedRefId, setCopiedRefId] = useState<string | null>(null);

  // Rejection modal
  const [selectedApprovalToReject, setSelectedApprovalToReject] = useState<PendingApproval | null>(null);
  const [rejectReason, setRejectReason] = useState('Payment deposit not verified on Mobile Money statement');

  // Success toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const historyApprovals = approvals.filter((a) => a.status !== 'pending');

  const displayedList = (activeTab === 'pending' ? pendingApprovals : historyApprovals).filter((a) => {
    if (typeFilter !== 'all' && a.type !== typeFilter) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      a.customerName.toLowerCase().includes(q) ||
      a.memberNo.includes(q) ||
      a.customerPhone.includes(q) ||
      a.paymentReference.toLowerCase().includes(q) ||
      a.branchName.toLowerCase().includes(q)
    );
  });

  const handleCopyRef = (ref: string, id: string) => {
    navigator.clipboard?.writeText(ref);
    setCopiedRefId(id);
    setTimeout(() => setCopiedRefId(null), 2000);
  };

  const handleConfirmApproval = (approval: PendingApproval) => {
    const res = restoStore.approvePendingRequest(approval.id, 'Restaurant Boss (Executive)');
    if (res.success && res.customer) {
      setToastMessage(
        `Confirmed payment! Member #${res.customer.memberNo} (${res.customer.name}) is fully active with ${restoStore.getCustomerBalance(res.customer.id)} plates.`
      );
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleExecuteReject = () => {
    if (!selectedApprovalToReject) return;
    const res = restoStore.rejectPendingRequest(
      selectedApprovalToReject.id,
      rejectReason,
      'Restaurant Boss (Executive)'
    );
    if (res.success) {
      setSelectedApprovalToReject(null);
      setToastMessage(`Rejected approval for #${selectedApprovalToReject.memberNo}. Customer card access locked.`);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Boss Delegation &amp; Mobile Money Payment Approval Queue</span>
              {pendingApprovals.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500 text-slate-950">
                  {pendingApprovals.length} Pending
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Stand cashiers and reception desk provisionally register customers and record top-ups when you are away. Verify Mobile Money deposits here to finalize membership and balances.
            </p>
          </div>
        </div>

        {/* Tab Switcher: Pending vs History */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Action Required</span>
            <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-black/40 text-amber-200">
              {pendingApprovals.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Audit History</span>
            <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-black/40 text-slate-300">
              {historyApprovals.length}
            </span>
          </button>
        </div>
      </div>

      {/* Operational Policy Guide */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="space-y-1">
          <div className="font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>3 Grace Meals Policy Active</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed max-w-2xl">
            To ensure patrons eat even if the boss is in a meeting or away, provisional members can consume up to <strong>3 grace plates</strong> immediately upon paying at the reception desk. When you confirm the Mobile Money transaction, consumed plates are already accounted for on the ledger.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[11px] shrink-0">
          <Smartphone className="w-3.5 h-3.5 text-amber-400" />
          <span>Verify via MTN (*182#) or Airtel</span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search by patron, member #, phone, ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-amber-500 outline-hidden"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'all', label: 'All Requests' },
            { id: 'new_customer', label: 'New Registrations' },
            { id: 'balance_topup', label: 'Top-Ups' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id as any)}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap text-[11px] ${
                typeFilter === f.id
                  ? 'bg-slate-700 text-white font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Approvals List */}
      {displayedList.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">No requests matching this view</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {activeTab === 'pending'
              ? 'All provisional customer registrations and top-ups have been verified and confirmed.'
              : 'No historical approvals recorded yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedList.map((appr) => {
            const customer = state.customers.find((c) => c.id === appr.customerId);
            const graceConsumed = appr.gracePlatesConsumed || customer?.gracePlatesConsumed || 0;
            const isPending = appr.status === 'pending';

            return (
              <div
                key={appr.id}
                className={`p-5 rounded-2xl border transition-all shadow-md space-y-4 ${
                  isPending
                    ? 'bg-slate-900 border-amber-500/50 hover:border-amber-500'
                    : appr.status === 'approved'
                    ? 'bg-slate-900/60 border-emerald-900/60'
                    : 'bg-slate-900/60 border-rose-900/60'
                }`}
              >
                {/* Header row: Customer identity & Request Type badge */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={appr.customerPhoto || customer?.photoUrl || '/src/assets/images/avatar_student_male_1790979380050.jpg'}
                      alt={appr.customerName}
                      className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0 shadow-sm"
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-white">{appr.customerName}</span>
                        <span className="font-mono text-xs text-slate-400 font-medium">
                          #{appr.memberNo}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            appr.type === 'new_customer'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-blue-950 text-blue-400 border border-blue-800'
                          }`}
                        >
                          {appr.type === 'new_customer' ? 'New Registration' : 'Balance Top-Up'}
                        </span>
                        {!isPending && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              appr.status === 'approved'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {appr.status.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{appr.customerPhone}</span>
                        <span>·</span>
                        <span>Branch: {appr.branchName}</span>
                        <span>·</span>
                        <span className="text-slate-500 font-mono">
                          Taken by {appr.registeredByStaffName} at {appr.stationName}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-mono text-slate-400">
                      {new Date(appr.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                    {appr.reviewedAt && (
                      <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                        Reviewed by {appr.reviewedByAdminName}
                      </div>
                    )}
                  </div>
                </div>

                {/* Mobile Money Verification & Package Box */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Package & Plates */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-slate-400 text-[11px] font-semibold uppercase">
                      Requested Meal Pack
                    </div>
                    <div className="text-lg font-black font-mono text-white">
                      +{appr.platesRequested} Plates
                    </div>
                    <div className="text-slate-400 text-[11px]">{appr.packageName}</div>
                  </div>

                  {/* Payment Channel & Amount */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-slate-400 text-[11px] font-semibold uppercase">
                      Intake Amount &amp; Channel
                    </div>
                    <div className="text-lg font-black font-mono text-emerald-400">
                      {appr.amountRwf.toLocaleString()} RWF
                    </div>
                    <div className="text-slate-300 font-mono uppercase text-[11px]">
                      via {appr.paymentMethod.replace('_', ' ')}
                    </div>
                  </div>

                  {/* MoMo Reference Verification Code with Copy button */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/40 space-y-1">
                    <div className="text-slate-400 text-[11px] font-semibold uppercase flex items-center justify-between">
                      <span>Payment Reference ID</span>
                      <button
                        onClick={() => handleCopyRef(appr.paymentReference, appr.id)}
                        className="text-amber-400 hover:text-white flex items-center gap-1 cursor-pointer text-[10px]"
                        title="Copy payment reference"
                      >
                        {copiedRefId === appr.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedRefId === appr.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="text-base font-black font-mono text-amber-300 break-all">
                      {appr.paymentReference}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Verify against your Mobile Money SMS
                    </div>
                  </div>
                </div>

                {/* Grace Plates Status Alert */}
                <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                  graceConsumed > 0
                    ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Grace Plates Consumed at Stand: <strong>{graceConsumed} of 3 plates</strong>
                    </span>
                  </div>

                  {isPending && (
                    <span className="text-[11px] font-mono text-slate-400">
                      {graceConsumed > 0
                        ? `Net balance after confirmation will be +${appr.platesRequested - graceConsumed} plates.`
                        : 'No grace plates consumed yet.'}
                    </span>
                  )}
                </div>

                {appr.rejectionReason && (
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Rejection Reason: {appr.rejectionReason}</span>
                  </div>
                )}

                {/* Action Buttons for Boss */}
                {isPending && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800">
                    <div className="text-[11px] text-slate-400">
                      Check your phone for deposit: <strong>{appr.amountRwf.toLocaleString()} RWF</strong> (Ref: {appr.paymentReference})
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => {
                          setSelectedApprovalToReject(appr);
                          setRejectReason('Payment deposit not verified on Mobile Money statement');
                        }}
                        className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 border border-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        Reject
                      </button>

                      <button
                        onClick={() => handleConfirmApproval(appr)}
                        className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Verify MoMo &amp; Confirm (+{appr.platesRequested} Plates)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* REJECT CONFIRMATION MODAL */}
      {selectedApprovalToReject && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <XCircle className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Reject Provisional Request</h3>
            </div>
            <p className="text-xs text-slate-300">
              Rejecting will mark the payment as unverified, lock customer card access at dining stands, and generate an audit record.
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div>Customer: <strong>{selectedApprovalToReject.customerName} (#{selectedApprovalToReject.memberNo})</strong></div>
              <div>Amount: <strong className="font-mono text-emerald-400">{selectedApprovalToReject.amountRwf.toLocaleString()} RWF</strong></div>
              <div>Ref: <strong className="font-mono text-amber-300">{selectedApprovalToReject.paymentReference}</strong></div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Reason for Rejection</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:border-rose-500 outline-hidden resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedApprovalToReject(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReject}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md cursor-pointer transition-colors"
              >
                Confirm Rejection &amp; Lock Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-emerald-500 text-white shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs font-semibold">{toastMessage}</div>
        </div>
      )}
    </div>
  );
};
