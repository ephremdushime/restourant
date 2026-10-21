import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import {
  exportTransactionsToCsv,
  exportTransactionsToJson,
  getEnrichedTransactions,
  ExportFilterOptions,
} from '../../services/exportService';
import {
  FileSpreadsheet,
  FileCode,
  Download,
  X,
  CheckCircle2,
  Calendar,
  Filter,
  Layers,
  Database,
  Eye,
} from 'lucide-react';

interface ExportTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantCode: string;
}

export const ExportTransactionsModal: React.FC<ExportTransactionsModalProps> = ({
  isOpen,
  onClose,
  restaurantCode,
}) => {
  if (!isOpen) return null;

  const [dateRange, setDateRange] = useState<ExportFilterOptions['dateRange']>('all');
  const [eventType, setEventType] = useState<ExportFilterOptions['eventType']>('all');
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [downloadSuccess, setDownloadSuccess] = useState<{ count: number; filename: string } | null>(null);

  const previewTransactions = getEnrichedTransactions(restaurantCode, {
    dateRange,
    eventType,
  });

  const handleDownload = () => {
    let result: { count: number; filename: string };
    if (exportFormat === 'csv') {
      result = exportTransactionsToCsv(restaurantCode, { dateRange, eventType });
    } else {
      result = exportTransactionsToJson(restaurantCode, { dateRange, eventType });
    }
    setDownloadSuccess(result);
    setTimeout(() => {
      setDownloadSuccess(null);
    }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-xs">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-950 border border-emerald-700 text-emerald-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Export Transaction Logs for Local Auditing
              </h3>
              <p className="text-[11px] text-slate-400">
                Generate offline audit files for local tax records, MoMo reconciliation, or management review.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {downloadSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="font-bold">File Exported Successfully!</div>
              <div className="text-[11px] opacity-90">
                Downloaded <strong>{downloadSuccess.filename}</strong> ({downloadSuccess.count} records).
              </div>
            </div>
          </div>
        )}

        {/* Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Format Selector */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300 block uppercase tracking-wider text-[10px]">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExportFormat('csv')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-colors ${
                  exportFormat === 'csv'
                    ? 'bg-emerald-950 border-emerald-600 text-white font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>CSV (Excel)</span>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('json')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-colors ${
                  exportFormat === 'json'
                    ? 'bg-emerald-950 border-emerald-600 text-white font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-4 h-4 text-amber-400" />
                <span>JSON (Audit)</span>
              </button>
            </div>
          </div>

          {/* Date Range Selector */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300 block uppercase tracking-wider text-[10px]">
              Date Period
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden font-medium"
            >
              <option value="all">All-Time History</option>
              <option value="today">Today's Service Shift</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days (Current Month)</option>
            </select>
          </div>

          {/* Event Filter */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300 block uppercase tracking-wider text-[10px]">
              Transaction Types
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as any)}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden font-medium"
            >
              <option value="all">All Events (Full Ledger)</option>
              <option value="scans">Scans &amp; Extra Plates Only</option>
              <option value="topups">Cash &amp; MoMo Top-Ups Only</option>
              <option value="transfers">Plate Transfers &amp; Reversals</option>
            </select>
          </div>
        </div>

        {/* Live Preview Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>Preview ({previewTransactions.length} matching transactions)</span>
            </span>
            <span>Showing top 4 rows</span>
          </div>

          <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Date/Time</th>
                  <th className="py-2 px-3">Member</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3 text-right">Plates</th>
                  <th className="py-2 px-3">Reference / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {previewTransactions.slice(0, 4).map((t) => (
                  <tr key={t.id} className="hover:bg-slate-900/40">
                    <td className="py-2 px-3 text-slate-400">
                      {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2 px-3 text-white font-sans font-medium">
                      {t.customerName} (#{t.memberNo})
                    </td>
                    <td className="py-2 px-3 uppercase text-[10px] text-slate-300">
                      {t.type}
                    </td>
                    <td className={`py-2 px-3 text-right font-bold tabular-nums ${
                      t.platesDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {t.platesDelta > 0 ? `+${t.platesDelta}` : t.platesDelta}
                    </td>
                    <td className="py-2 px-3 text-slate-400 font-sans truncate max-w-xs">
                      {t.reference !== 'N/A' ? t.reference : t.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-800">
          <div className="text-[11px] text-slate-500">
            Files include UTF-8 BOM encoding for seamless Microsoft Excel &amp; Numbers compatibility.
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleDownload}
              disabled={previewTransactions.length === 0}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold transition-colors flex items-center gap-2 shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download {exportFormat.toUpperCase()} ({previewTransactions.length} records)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
