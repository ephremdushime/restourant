import { restoStore } from '../store/restoStore';
import { LedgerEntry, Customer, PaymentRecord, ScanEvent } from '../types';

export interface ExportFilterOptions {
  dateRange: 'all' | 'today' | '7days' | '30days';
  eventType: 'all' | 'scans' | 'topups' | 'transfers';
}

export interface EnrichedTransaction {
  id: string;
  timestamp: string;
  memberNo: string;
  customerName: string;
  customerPhone: string;
  type: string;
  platesDelta: number;
  scanPointName: string;
  staffName: string;
  reference: string;
  reason: string;
  paymentMethod?: string;
  amountRwf?: number;
}

export function getEnrichedTransactions(
  restaurantCode: string,
  options: ExportFilterOptions = { dateRange: 'all', eventType: 'all' }
): EnrichedTransaction[] {
  const state = restoStore.getState();
  const customersMap = new Map<string, Customer>();
  state.customers.forEach((c) => customersMap.set(c.id, c));

  const stationsMap = new Map<string, string>();
  state.scanPoints.forEach((sp) => stationsMap.set(sp.id, sp.name));

  const paymentsMap = new Map<string, PaymentRecord>();
  state.payments.forEach((p) => {
    if (p.reference) paymentsMap.set(p.reference, p);
  });

  const now = new Date();
  let startTime = 0;
  if (options.dateRange === 'today') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startTime = startOfDay.getTime();
  } else if (options.dateRange === '7days') {
    startTime = now.getTime() - 7 * 24 * 3600 * 1000;
  } else if (options.dateRange === '30days') {
    startTime = now.getTime() - 30 * 24 * 3600 * 1000;
  }

  const entries = state.ledgerEntries.filter((e) => {
    if (e.restaurantCode !== restaurantCode) return false;
    const entryTime = new Date(e.timestamp).getTime();
    if (entryTime < startTime) return false;

    if (options.eventType === 'scans') {
      return e.type === 'scan' || e.type === 'extra' || e.type === 'undo';
    }
    if (options.eventType === 'topups') {
      return e.type === 'purchase';
    }
    if (options.eventType === 'transfers') {
      return e.type === 'transfer_out' || e.type === 'transfer_in' || e.type === 'reversal';
    }
    return true;
  });

  return entries
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map((e) => {
      const cust = customersMap.get(e.customerId);
      const stationName = e.scanPointId ? stationsMap.get(e.scanPointId) || 'Stand 1' : 'Cashier Desk';
      const payment = e.reference ? paymentsMap.get(e.reference) : undefined;

      return {
        id: e.id,
        timestamp: e.timestamp,
        memberNo: cust?.memberNo || 'N/A',
        customerName: cust?.name || 'Unknown Customer',
        customerPhone: cust?.phone || 'N/A',
        type: e.type,
        platesDelta: e.platesDelta,
        scanPointName: stationName,
        staffName: e.staffId || 'Staff Operator',
        reference: e.reference || 'N/A',
        reason: e.reason || (e.type === 'scan' ? 'Serving line meal deduction' : ''),
        paymentMethod: payment?.paymentMethod,
        amountRwf: payment?.amountRwf,
      };
    });
}

function escapeCsvField(field: any): string {
  if (field === null || field === undefined) return '""';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Exports enriched transaction logs as an RFC 4180 CSV file with UTF-8 BOM
 */
export function exportTransactionsToCsv(
  restaurantCode: string,
  options: ExportFilterOptions = { dateRange: 'all', eventType: 'all' }
): { count: number; filename: string } {
  const transactions = getEnrichedTransactions(restaurantCode, options);
  const restaurant = restoStore.getState().restaurants.find((r) => r.code === restaurantCode);
  const restoName = restaurant?.name || restaurantCode;

  const headers = [
    'Timestamp (ISO)',
    'Date & Time (Local)',
    'Transaction ID',
    'Member #',
    'Customer Name',
    'Phone',
    'Event Type',
    'Plates Delta',
    'Station / Location',
    'Staff / Operator',
    'Reference / MoMo ID',
    'Reason / Notes',
    'Payment Method',
    'Amount (RWF)',
  ];

  const rows = transactions.map((t) => [
    escapeCsvField(t.timestamp),
    escapeCsvField(new Date(t.timestamp).toLocaleString()),
    escapeCsvField(t.id),
    escapeCsvField(t.memberNo),
    escapeCsvField(t.customerName),
    escapeCsvField(t.customerPhone),
    escapeCsvField(t.type.toUpperCase()),
    escapeCsvField(t.platesDelta > 0 ? `+${t.platesDelta}` : t.platesDelta),
    escapeCsvField(t.scanPointName),
    escapeCsvField(t.staffName),
    escapeCsvField(t.reference),
    escapeCsvField(t.reason),
    escapeCsvField(t.paymentMethod ? t.paymentMethod.toUpperCase() : 'N/A'),
    escapeCsvField(t.amountRwf !== undefined ? t.amountRwf : ''),
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `RestoPass_${restaurantCode}_Transactions_${dateStr}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  restoStore.logAudit({
    restaurantCode,
    actorRole: 'restaurant_admin',
    actorName: 'Audit Cashier',
    action: 'TRANSACTIONS_EXPORTED_CSV',
    details: `Exported ${transactions.length} transaction rows to CSV file: ${filename}`,
  });

  return { count: transactions.length, filename };
}

/**
 * Exports enriched transaction logs as structured JSON for local accounting & auditing
 */
export function exportTransactionsToJson(
  restaurantCode: string,
  options: ExportFilterOptions = { dateRange: 'all', eventType: 'all' }
): { count: number; filename: string } {
  const transactions = getEnrichedTransactions(restaurantCode, options);
  const state = restoStore.getState();
  const restaurant = state.restaurants.find((r) => r.code === restaurantCode);

  const totalDeducted = transactions
    .filter((t) => t.platesDelta < 0)
    .reduce((sum, t) => sum + Math.abs(t.platesDelta), 0);

  const totalAdded = transactions
    .filter((t) => t.platesDelta > 0)
    .reduce((sum, t) => sum + t.platesDelta, 0);

  const relevantPayments = state.payments.filter((p) => p.restaurantCode === restaurantCode);
  const totalRevenueRwf = relevantPayments.reduce((sum, p) => sum + p.amountRwf, 0);

  const payload = {
    meta: {
      application: 'RestoPass Operating System',
      version: '1.1',
      purpose: 'Local Offline Restaurant Audit & Reconciliation',
      exportedAt: new Date().toISOString(),
      restaurantCode,
      restaurantName: restaurant?.name || 'Kigali Campus Resto',
      currency: restaurant?.currency || 'RWF',
      filterCriteria: options,
      summary: {
        totalRecords: transactions.length,
        totalPlatesDeducted: totalDeducted,
        totalPlatesPurchased: totalAdded,
        totalCashRevenueRwf: totalRevenueRwf,
        activeCustomersCount: state.customers.filter((c) => c.restaurantCode === restaurantCode).length,
      },
    },
    transactions,
    paymentsJournal: relevantPayments,
    scanEventsAudit: state.scanEvents.filter((ev) => ev.restaurantCode === restaurantCode).slice(0, 50),
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `RestoPass_${restaurantCode}_Transactions_${dateStr}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  restoStore.logAudit({
    restaurantCode,
    actorRole: 'restaurant_admin',
    actorName: 'Audit Cashier',
    action: 'TRANSACTIONS_EXPORTED_JSON',
    details: `Exported ${transactions.length} transaction records to JSON audit file: ${filename}`,
  });

  return { count: transactions.length, filename };
}
