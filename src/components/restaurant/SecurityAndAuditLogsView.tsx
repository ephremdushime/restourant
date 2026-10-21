import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import { Language } from '../../types';
import { translations } from '../../services/i18n';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Key,
  Clock,
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  FileCode,
  Users,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Calendar,
  Eye,
  RefreshCw,
} from 'lucide-react';

interface SecurityAndAuditLogsViewProps {
  restaurantCode: string;
  language?: Language;
}

export const SecurityAndAuditLogsView: React.FC<SecurityAndAuditLogsViewProps> = ({
  restaurantCode,
  language,
}) => {
  const t = translations[language || 'en'];
  const state = restoStore.getState();
  const currentResto = restoStore.getCurrentRestaurant();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [actionCategoryFilter, setActionCategoryFilter] = useState<string>('all');

  // Customer Quick Security Modal
  const [selectedCustomerToManage, setSelectedCustomerToManage] = useState<any | null>(null);
  const [quickPinInput, setQuickPinInput] = useState('1234');
  const [securityToast, setSecurityToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSecurityToast(msg);
    setTimeout(() => setSecurityToast(null), 3500);
  };

  const customers = state.customers.filter((c) => c.restaurantCode === restaurantCode);
  const stationUsers = (state.stationUsers || []).filter((u) => u.restaurantCode === restaurantCode);
  const auditLogs = (state.auditLogs || []).filter((a) => a.restaurantCode === restaurantCode);

  // Security KPIs
  const totalCustomers = customers.length;
  const activeCards = customers.filter((c) => c.cardStatus === 'active').length;
  const lockedCards = customers.filter((c) => c.cardStatus === 'locked').length;

  const totalStationUsers = stationUsers.length;
  const activeStationUsers = stationUsers.filter((u) => u.status === 'active').length;
  const blockedStationUsers = stationUsers.filter((u) => u.status === 'blocked').length;

  const blockedScansCount = state.scanEvents.filter(
    (ev) => ev.restaurantCode === restaurantCode && ev.status === 'blocked'
  ).length;

  // Filtered Audit Logs
  const filteredLogs = auditLogs.filter((log) => {
    if (roleFilter !== 'all' && log.actorRole !== roleFilter) return false;

    if (actionCategoryFilter !== 'all') {
      const act = log.action.toUpperCase();
      if (actionCategoryFilter === 'card_security' && !act.includes('CARD') && !act.includes('KEY')) return false;
      if (actionCategoryFilter === 'account' && !act.includes('USER') && !act.includes('CUSTOMER') && !act.includes('BRANCH')) return false;
      if (actionCategoryFilter === 'approval' && !act.includes('APPROVAL') && !act.includes('PROVISIONAL')) return false;
      if (actionCategoryFilter === 'pricing' && !act.includes('PRICE') && !act.includes('MENU') && !act.includes('PACKAGE')) return false;
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      log.actorName.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      (log.branchName && log.branchName.toLowerCase().includes(q))
    );
  });

  // Export audit log to JSON
  const handleExportAuditJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `security_audit_logs_${restaurantCode}_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Exported audit trail to JSON');
  };

  // Export audit log to CSV
  const handleExportAuditCsv = () => {
    const headers = ['Timestamp', 'Actor Role', 'Actor Name', 'Action', 'Branch', 'Details'];
    const rows = filteredLogs.map((log) => [
      `"${log.timestamp}"`,
      `"${log.actorRole}"`,
      `"${log.actorName.replace(/"/g, '""')}"`,
      `"${log.action}"`,
      `"${(log.branchName || 'Main Campus').replace(/"/g, '""')}"`,
      `"${log.details.replace(/"/g, '""')}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `security_audit_logs_${restaurantCode}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Exported audit trail to CSV');
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {securityToast && (
        <div className="p-3.5 rounded-xl bg-emerald-950 border border-emerald-700 text-emerald-200 text-xs font-semibold flex items-center gap-2 shadow-2xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{securityToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Security Governance &amp; Immutable Audit Trail</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Comprehensive event logging with exact timestamps, operator attribution, account credential resets, and anti-fraud protections for {currentResto?.name}.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportAuditCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportAuditJson}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5 text-amber-400" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Security Health Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Customer Badges</span>
          </div>
          <div className="text-2xl font-black font-mono text-white mt-1">
            {activeCards} <span className="text-xs text-slate-400 font-normal">active</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {lockedCards > 0 ? (
              <span className="text-rose-400 font-semibold">{lockedCards} locked cards</span>
            ) : (
              'All customer cards secure'
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span>Station Accounts</span>
          </div>
          <div className="text-2xl font-black font-mono text-white mt-1">
            {activeStationUsers} <span className="text-xs text-slate-400 font-normal">active</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {blockedStationUsers > 0 ? (
              <span className="text-rose-400 font-semibold">{blockedStationUsers} blocked users</span>
            ) : (
              'All operator accounts active'
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Scan Blocks (Anomalies)</span>
          </div>
          <div className="text-2xl font-black font-mono text-amber-400 mt-1">
            {blockedScansCount}
          </div>
          <div className="text-[11px] text-slate-400">
            Consecutive taps &amp; limits guarded
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Audit Records</span>
          </div>
          <div className="text-2xl font-black font-mono text-cyan-400 mt-1">
            {auditLogs.length}
          </div>
          <div className="text-[11px] text-slate-400">
            Chronological forensic events
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by actor name, event action, or details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:border-cyan-500 outline-hidden"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="py-2 px-3 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 focus:border-cyan-500 outline-hidden"
          >
            <option value="all">All Actors</option>
            <option value="restaurant_admin">Restaurant Boss (Admin)</option>
            <option value="reception">Reception Desk</option>
            <option value="stand_staff">Scanner Stand</option>
            <option value="super_admin">Authority / Super Admin</option>
            <option value="system">System Guard</option>
          </select>

          {/* Action Category Filter */}
          <select
            value={actionCategoryFilter}
            onChange={(e) => setActionCategoryFilter(e.target.value)}
            className="py-2 px-3 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 focus:border-cyan-500 outline-hidden"
          >
            <option value="all">All Categories</option>
            <option value="card_security">Card &amp; Key Security</option>
            <option value="account">Account Lifecycle</option>
            <option value="approval">MoMo Approvals</option>
            <option value="pricing">Pricing &amp; Menu</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Exact Timestamp</th>
              <th className="py-3 px-4">Actor ("By Who")</th>
              <th className="py-3 px-4">Action Type</th>
              <th className="py-3 px-4">Branch / Context</th>
              <th className="py-3 px-4">Forensic Event Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                  No audit log events found matching the search criteria.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                    <div>
                      {new Date(log.timestamp).toLocaleDateString([], {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="text-[10px] text-cyan-400">
                      {new Date(log.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </div>
                  </td>

                  <td className="py-2.5 px-4 font-sans">
                    <div className="font-bold text-white">{log.actorName}</div>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-400 border border-slate-700 inline-block mt-0.5">
                      {log.actorRole.replace('_', ' ')}
                    </span>
                  </td>

                  <td className="py-2.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        log.action.includes('LOCK') || log.action.includes('BLOCK') || log.action.includes('DELETED')
                          ? 'bg-rose-950 text-rose-400 border border-rose-800'
                          : log.action.includes('APPROVED') || log.action.includes('CONFIRMED') || log.action.includes('CREATED')
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : log.action.includes('REISSUED') || log.action.includes('RESET')
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>

                  <td className="py-2.5 px-4 font-sans text-slate-300">
                    {log.branchName || 'Main Campus'}
                  </td>

                  <td className="py-2.5 px-4 font-sans text-slate-300 max-w-md break-words">
                    {log.details}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
