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
  Tag,
  DollarSign,
  UserPlus,
  Printer,
} from 'lucide-react';
import { CardFrontView, CardBackView } from './CardPrintStudio';

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
  const [printCardCustomer, setPrintCardCustomer] = useState<Customer | null>(null);

  // Copy feedback
  const [copiedRefId, setCopiedRefId] = useState<string | null>(null);

  // Rejection modal
  const [selectedApprovalToReject, setSelectedApprovalToReject] = useState<PendingApproval | null>(null);
  const [rejectReason, setRejectReason] = useState('Payment deposit not verified on Mobile Money statement');

  // Success toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Approval Confirmation Modal after Boss Approval
  const [approvedModalData, setApprovedModalData] = useState<{
    customer: Customer;
    approval: PendingApproval;
  } | null>(null);

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
      setApprovedModalData({
        customer: res.customer,
        approval,
      });

      setToastMessage(
        approval.type === 'new_customer'
          ? `Approved registration for #${res.customer.memberNo}! Account active for Customer Portal PIN setup.`
          : `Approved top-up for #${res.customer.memberNo}! Plates added to permanent card.`
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
            const graceConsumed =
              (appr.gracePlatesConsumed || 0) > 0
                ? appr.gracePlatesConsumed
                : appr.type === 'new_customer'
                ? (customer?.gracePlatesConsumed || 0)
                : 0;
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
                {isPending ? (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800">
                    <div className="text-[11px] text-slate-400">
                      Check your phone for deposit: <strong>{appr.amountRwf.toLocaleString()} RWF</strong> (Ref: {appr.paymentReference})
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {appr.coSignStatus === 'pending_super_admin' ? (
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-950/90 border border-indigo-500/80 text-indigo-200 text-xs">
                          <span className="font-bold text-amber-300">🛡️ Dual-Control Active:</span>
                          <span>Boss approved. Forwarded to Super Admin for co-signing ({appr.platesRequested} plates).</span>
                        </div>
                      ) : (
                        <>
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
                            className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                              appr.platesRequested > 120
                                ? 'bg-indigo-600 hover:bg-indigo-500'
                                : 'bg-emerald-600 hover:bg-emerald-500'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {appr.platesRequested > 120
                                ? `Verify & Forward for Co-Sign (+${appr.platesRequested}p)`
                                : `Verify MoMo & Confirm (+${appr.platesRequested} Plates)`}
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  appr.status === 'approved' && customer && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
                      <span className="text-slate-300 text-xs font-medium">
                        Approved by {appr.reviewedByAdminName || 'Restaurant Boss'}
                      </span>
                      {appr.type === 'new_customer' ? (
                        <button
                          type="button"
                          onClick={() => setPrintCardCustomer(customer)}
                          className="px-4 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600 border border-sky-500/40 hover:border-sky-500 text-sky-300 hover:text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                        >
                          <Printer className="w-3.5 h-3.5 text-sky-400" />
                          <span>Print First-Time Physical Card</span>
                        </button>
                      ) : (
                        <span className="text-xs font-mono text-emerald-400 font-bold">
                          Permanent Card V{customer.cardVersion} · +{appr.platesRequested} Plates Credited
                        </span>
                      )}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* BOSS APPROVAL CONFIRMATION MODAL (No Magic Link / No WhatsApp) */}
      {approvedModalData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-emerald-500/70 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">
                      {approvedModalData.approval.type === 'new_customer'
                        ? 'Registration Approved & Account Active!'
                        : 'Top-Up Approved & Balance Credited!'}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Boss Verified
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {approvedModalData.approval.type === 'new_customer'
                      ? 'The customer account is now active in the system. They can sign in to the Customer Portal with their phone number to set up their personal PIN.'
                      : "The plates have been added to the customer's permanent physical card and ledger."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setApprovedModalData(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Status & Entitlement Badges */}
            {approvedModalData.approval.type === 'new_customer' ? (
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold">Portal Ready for PIN</div>
                    <div className="text-[11px] text-emerald-300">Self-service PIN setup enabled</div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-sky-950/80 border border-sky-800 text-sky-200 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="font-bold">First-Time Card Ready</div>
                    <div className="text-[11px] text-sky-300">Permanent Card V{approvedModalData.customer.cardVersion}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2.5">
                <CreditCard className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-bold text-sm">Permanent Physical Card V{approvedModalData.customer.cardVersion} Active</div>
                  <div className="text-xs text-emerald-300">
                    No card reprint needed — the existing physical card never expires and automatically uses the updated plate balance.
                  </div>
                </div>
              </div>
            )}

            {/* Customer Summary Card & Net Balance Accounting */}
            {(() => {
              const graceConsumed =
                (approvedModalData.approval.gracePlatesConsumed || 0) > 0
                  ? approvedModalData.approval.gracePlatesConsumed
                  : approvedModalData.approval.type === 'new_customer'
                  ? (approvedModalData.customer.gracePlatesConsumed || 0)
                  : 0;
              const finalBal = restoStore.getCustomerBalance(approvedModalData.customer.id);
              return (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={approvedModalData.customer.photoUrl}
                        alt={approvedModalData.customer.name}
                        className="w-11 h-11 rounded-xl object-cover border border-slate-700"
                      />
                      <div>
                        <div className="font-black text-white text-sm">
                          {approvedModalData.customer.name}
                        </div>
                        <div className="text-xs font-mono text-slate-300 font-bold">
                          #{approvedModalData.customer.memberNo} · {approvedModalData.customer.phone}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-black text-emerald-400 font-mono">
                        +{approvedModalData.approval.platesRequested} Plates
                      </div>
                      <div className="text-xs font-mono text-slate-300">
                        {approvedModalData.approval.amountRwf.toLocaleString()} RWF
                      </div>
                    </div>
                  </div>

                  {/* Net Balance Breakdown minus Consumed Grace Meals (< 3) */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center justify-between">
                    <div className="text-slate-300">
                      <span>Grace Meals Reconciled: </span>
                      <strong className="text-amber-400 font-mono">-{graceConsumed}</strong>
                    </div>
                    <div className="text-right font-mono font-black text-emerald-300 text-sm">
                      Net Balance: {finalBal} Plates
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              {approvedModalData.approval.type === 'new_customer' && (
                <button
                  type="button"
                  onClick={() => {
                    const cust = approvedModalData.customer;
                    setApprovedModalData(null);
                    setPrintCardCustomer(cust);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Physical Card (Front &amp; Back)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setApprovedModalData(null)}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black cursor-pointer shadow-md transition-colors"
              >
                Done
              </button>
            </div>
          </div>
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

      {/* PHYSICAL CARD PRINT PREVIEW MODAL */}
      {printCardCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-3xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">
                  Physical Meal Card (Front &amp; Back CR80) — #{printCardCustomer.memberNo}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPrintCardCustomer(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Double-sided physical card with scannable offline cryptographic QR and property notice in Kinyarwanda &amp; English. (No plate balances printed).
            </p>

            <div className="flex flex-col md:flex-row gap-6 items-center justify-center p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Front Side</span>
                <CardFrontView
                  customer={printCardCustomer}
                  restaurantName={currentResto?.name || 'Kigali Independent University Canteen'}
                />
              </div>

              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Back Side (Property Notice)</span>
                <CardBackView
                  customer={printCardCustomer}
                  restaurantName={currentResto?.name || 'Kigali Independent University Canteen'}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPrintCardCustomer(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Print Card Now</span>
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
