import React, { useState } from 'react';
import { Customer, Package, Restaurant } from '../../types';
import { restoStore } from '../../store/restoStore';
import { QrCanvas } from '../common/QrCanvas';
import {
  Printer,
  Download,
  Users,
  Sparkles,
  QrCode,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  Copy,
  Check,
  Send,
  PlusCircle,
  CreditCard,
  AlertCircle,
  ShieldCheck,
  Utensils,
  GraduationCap,
  Radio,
  Eye,
  CheckCircle,
} from 'lucide-react';

export interface CardPrintStudioProps {
  onBack?: () => void;
  initialCustomerId?: string;
  initialMode?: 'bulk_onboarding' | 'existing_customers';
  operatorName?: string;
}

export const CardPrintStudio: React.FC<CardPrintStudioProps> = ({
  onBack,
  initialCustomerId,
  initialMode,
  operatorName,
}) => {
  const state = restoStore.getState();
  const restaurant = restoStore.getCurrentRestaurant();

  const resolvedOperatorName =
    operatorName ||
    (typeof window !== 'undefined' && sessionStorage.getItem('restopass_user_label')) ||
    'Restaurant Administrator';

  // Active Tab: 'bulk_onboarding' | 'existing_customers'
  const [activeMode, setActiveMode] = useState<'bulk_onboarding' | 'existing_customers'>(
    initialMode || 'existing_customers'
  );

  // Card Side Layout format: Duplex Aligned (Page 1 Front / Page 2 Back), Side-by-Side Proof, Front Only, Back Only
  const [cardSideView, setCardSideView] = useState<'duplex_aligned' | 'double_sided' | 'front_only' | 'back_only'>('duplex_aligned');
  const [sandboxSimEnabled, setSandboxSimEnabled] = useState<boolean>(false);

  // Bulk Generator Options
  const [batchCount, setBatchCount] = useState<number>(10);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('blank');
  const [templateType, setTemplateType] = useState<'pvc_id1' | 'onboarding_slip'>('pvc_id1');
  const [lastGeneratedBatch, setLastGeneratedBatch] = useState<Customer[] | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [batchSuccessNotice, setBatchSuccessNotice] = useState<string | null>(null);
  const [testScanResult, setTestScanResult] = useState<{ memberNo: string; balanceAfter: number; timestamp: string } | null>(null);

  // Existing Customers Selection (Filtered strictly by active restaurant)
  const restoCustomers = state.customers.filter((c) => c.restaurantCode === state.currentRestaurantCode);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomerId || restoCustomers[0]?.id || ''
  );
  const [isExistingBatchMode, setIsExistingBatchMode] = useState(false);

  // Strict lookup: NEVER silently fall back to restoCustomers[0] if selectedCustomerId is missing or invalid
  const selectedExistingCustomer = restoCustomers.find((c) => c.id === selectedCustomerId) || null;

  // Handler to generate bulk onboarding cards using authenticated operator attribution
  const handleGenerateBulk = () => {
    const pkgId = selectedPackageId !== 'blank' ? selectedPackageId : undefined;
    const created = restoStore.generateBulkOnboardingCards({
      restaurantCode: state.currentRestaurantCode,
      count: Number(batchCount),
      packageId: pkgId,
      adminStaffName: resolvedOperatorName,
    });
    setLastGeneratedBatch(created);
    setBatchSuccessNotice(`Successfully generated ${created.length} new onboarding cards (#${created[0]?.memberNo} to #${created[created.length - 1]?.memberNo}) by ${resolvedOperatorName}! Ready to print.`);
    setTimeout(() => setBatchSuccessNotice(null), 5000);
  };

  // Test Real-Time Card QR Scan (atomically deducts 1 meal and verifies live ledger)
  const handleTestCardScan = (customer: Customer) => {
    const token = restoStore.getCustomerCardQr(customer);
    const res = restoStore.processScan(token);
    if (res.scanEvent && (res.scanEvent.status === 'approved' || res.scanEvent.status === 'warning_confirmed')) {
      setTestScanResult({
        memberNo: customer.memberNo,
        balanceAfter: res.balanceAfter,
        timestamp: new Date().toLocaleTimeString(),
      });
      setTimeout(() => setTestScanResult(null), 6000);
    } else {
      alert(`Scan blocked: ${res.error || 'Verification check failed'}`);
    }
  };

  // Export Onboarding Manifest (CSV)
  const handleExportManifestCsv = () => {
    const cardsToExport = lastGeneratedBatch || restoCustomers;
    const headers = [
      'Member Number',
      'Card Serial',
      'Card Token (QR Payload)',
      'Onboarding Token',
      'WhatsApp Invite Link',
    ];

    const rows = cardsToExport.map((c) => {
      const cardToken = restoStore.getCustomerCardQr(c);
      const inviteMsg = encodeURIComponent(
        `Hello! Welcome to ${restaurant?.name || 'RestoPass'}. Your meal pass Member Number is #${c.memberNo}. Tap this link to set your PIN: https://restopass.rw/activate?token=${c.onboardingToken}`
      );
      const waLink = `https://wa.me/?text=${inviteMsg}`;

      return [
        `"#${c.memberNo}"`,
        `"RP2026${c.memberNo}"`,
        `"${cardToken}"`,
        `"${c.onboardingToken}"`,
        `"${waLink}"`,
      ];
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RestoPass_${state.currentRestaurantCode}_Cards_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  // Cards to render in print view
  const displayCards: Customer[] = activeMode === 'bulk_onboarding'
    ? (lastGeneratedBatch || restoCustomers.slice(-batchCount))
    : isExistingBatchMode
    ? restoCustomers
    : (selectedExistingCustomer ? [selectedExistingCustomer] : []);

  return (
    <div className="space-y-6">
      {/* Top Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Physical Card Print Studio (Front &amp; Back CR80)
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-sky-950 border border-sky-800 text-sky-400">
              ISO/IEC 7810 ID-1 Standard
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Print professional PVC meal cards with tamper-resistant QR codes and restaurant ownership notices. (Dynamic plate counts are never printed).
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {onBack && (
            <button
              onClick={onBack}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              Back
            </button>
          )}

          <button
            onClick={handleExportManifestCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download CSV manifest"
          >
            <FileSpreadsheet className="w-4 h-4 text-sky-400" />
            <span>Export Manifest (CSV)</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Cards / Save PDF</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs font-semibold text-slate-400 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveMode('bulk_onboarding')}
            className={`px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeMode === 'bulk_onboarding'
                ? 'bg-sky-600 text-white font-bold shadow-xs'
                : 'hover:text-white hover:bg-slate-900'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Bulk Pre-Printed Cards</span>
          </button>

          <button
            onClick={() => setActiveMode('existing_customers')}
            className={`px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeMode === 'existing_customers'
                ? 'bg-sky-600 text-white font-bold shadow-xs'
                : 'hover:text-white hover:bg-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Approved Customers ({restoCustomers.length})</span>
          </button>
        </div>

        {/* Card Sides Selector (Duplex Aligned / Side-by-Side Proof / Front Only / Back Only) */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap">
          <span className="text-[11px] text-slate-400 px-2 font-mono">Print Mode:</span>
          <button
            type="button"
            onClick={() => setCardSideView('duplex_aligned')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              cardSideView === 'duplex_aligned'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Prints Front on Page 1 and aligned Back on Page 2 for physical duplex CR80 card printing"
          >
            Duplex (Aligned Front/Back Pages)
          </button>
          <button
            type="button"
            onClick={() => setCardSideView('double_sided')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              cardSideView === 'double_sided'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Side-by-Side Proof
          </button>
          <button
            type="button"
            onClick={() => setCardSideView('front_only')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              cardSideView === 'front_only'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Front Only
          </button>
          <button
            type="button"
            onClick={() => setCardSideView('back_only')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              cardSideView === 'back_only'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Back Only
          </button>
          <button
            type="button"
            onClick={() => setSandboxSimEnabled((v) => !v)}
            className={`ml-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-colors cursor-pointer border ${
              sandboxSimEnabled
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle local sandbox scan simulation button"
          >
            {sandboxSimEnabled ? 'Sandbox Sim: ON' : 'Sandbox Sim: OFF'}
          </button>
        </div>
      </div>

      {batchSuccessNotice && (
        <div className="p-3.5 rounded-xl bg-sky-950/80 border border-sky-600 text-sky-200 text-xs flex items-center gap-2.5 shadow-sm print:hidden">
          <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
          <span>{batchSuccessNotice}</span>
        </div>
      )}

      {testScanResult && (
        <div className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs flex items-center justify-between shadow-lg print:hidden animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="font-bold text-white text-xs">Real-Time Card Scan Verified!</div>
              <div className="text-[11px] text-emerald-300">
                Card #{testScanResult.memberNo} scanned at buffet station. 1 plate deducted atomically. Remaining: <strong>{testScanResult.balanceAfter} plates</strong>.
              </div>
            </div>
          </div>
          <span className="font-mono text-[10px] text-slate-400">{testScanResult.timestamp}</span>
        </div>
      )}

      {/* 1. BULK ONBOARDING GENERATOR CONTROLS */}
      {activeMode === 'bulk_onboarding' && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 print:hidden text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <div className="font-bold text-white text-sm">Batch Pre-Printed Cards Generation</div>
              <div className="text-[11px] text-slate-400">
                Generate sequential cards ready for physical printing and instant cashier assignment.
              </div>
            </div>
            <div className="text-right text-[11px] font-mono text-sky-400 font-bold">
              Next Range: #{28490 + state.customers.length + 1} &rarr; #{28490 + state.customers.length + batchCount}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Number of Cards to Print</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[5, 10, 20, 50].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setBatchCount(count)}
                    className={`py-2 rounded-lg border font-bold text-xs transition-colors cursor-pointer ${
                      batchCount === count
                        ? 'bg-sky-950 border-sky-600 text-sky-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">Pre-Loaded Bundle (Optional)</label>
              <select
                value={selectedPackageId}
                onChange={(e) => setSelectedPackageId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium focus:border-sky-500 outline-hidden"
              >
                <option value="blank">Blank Card (Top-up at reception desk)</option>
                {state.packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} (+{pkg.platesCount} plates)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">Physical Card Standard</label>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-[11px] leading-snug">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400 inline mr-1" />
                <span>Plate balances are <strong>never printed</strong> on cards. The QR carries a cryptographic card token (c1) verified in real-time.</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleGenerateBulk}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate {batchCount} Physical Cards Ready to Print</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. EXISTING CUSTOMERS SELECTION CONTROLS */}
      {activeMode === 'existing_customers' && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 print:hidden text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300">Select Print Scope:</span>
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
              <button
                onClick={() => setIsExistingBatchMode(false)}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  !isExistingBatchMode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Single Selected Card
              </button>
              <button
                onClick={() => setIsExistingBatchMode(true)}
                className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  isExistingBatchMode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>All Approved ({restoCustomers.length})</span>
              </button>
            </div>
          </div>

          {!isExistingBatchMode && (
            <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
              {restoCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomerId(c.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                    c.id === selectedCustomerId
                      ? 'bg-sky-950/90 border-sky-500 text-white shadow-xs'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  <img src={c.photoUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                  <span>{c.name}</span>
                  <span className="font-mono text-slate-400 text-[11px]">#{c.memberNo}</span>
                  {c.cardReadyForPrint && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Ready to print" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PRINT CANVAS */}
      <div className="flex flex-col items-center justify-center p-2 w-full">
        {displayCards.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2 max-w-md print:hidden">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
            <div className="text-sm font-bold text-white">No Customer Selected for Printing</div>
            <p className="text-xs text-slate-400">
              Please select a verified patron from the list above or generate a bulk onboarding batch.
            </p>
          </div>
        ) : (
          <>
            {/* ON-SCREEN INTERACTIVE PREVIEW (Hidden during physical window.print() when duplex_aligned is active) */}
            <div className={`flex flex-col gap-6 w-full max-w-4xl ${cardSideView === 'duplex_aligned' ? 'print:hidden' : 'print:gap-4'}`}>
              {displayCards.map((cust) => (
                <div
                  key={cust.id}
                  className="flex flex-col md:flex-row gap-6 items-center justify-center p-5 rounded-2xl bg-slate-900/60 border border-slate-800 print:bg-white print:border-none print:p-0 print:gap-3 break-inside-avoid shadow-sm"
                >
                  {/* FRONT SIDE */}
                  {(cardSideView === 'duplex_aligned' || cardSideView === 'double_sided' || cardSideView === 'front_only') && (
                    <div className="flex flex-col items-center">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 print:hidden flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                        <span>Side A — Front (85.60 × 53.98 mm CR80)</span>
                      </div>
                      <CardFrontView
                        customer={cust}
                        restaurantName={restaurant?.name || 'Kigali Independent University Canteen'}
                        isOnboarding={cust.name.startsWith('Onboarding Patron')}
                        restaurant={restaurant}
                      />
                      {sandboxSimEnabled && (
                        <div className="mt-2 flex items-center gap-2 print:hidden">
                          <button
                            onClick={() => handleTestCardScan(cust)}
                            className="px-2.5 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 text-amber-300 hover:text-white text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer border border-amber-700/70"
                            title="Local client store simulation only — does not represent a live server stand scan"
                          >
                            <Radio className="w-3 h-3 text-amber-400" />
                            <span>[SANDBOX SIM] Test Local QR Scan</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* BACK SIDE */}
                  {(cardSideView === 'duplex_aligned' || cardSideView === 'double_sided' || cardSideView === 'back_only') && (
                    <div className="flex flex-col items-center">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 print:hidden flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                        <span>Side B — Back (Aligned Duplex Reverse)</span>
                      </div>
                      <CardBackView
                        customer={cust}
                        restaurantName={restaurant?.name || 'Kigali Independent University Canteen'}
                        restaurant={restaurant}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* DEDICATED DUPLEX ALIGNED PRINT SHEETS (Page 1 = Fronts, Page 2 = Aligned Backs) */}
            {cardSideView === 'duplex_aligned' && (
              <div className="hidden print:block w-full">
                {displayCards.map((cust) => (
                  <React.Fragment key={`duplex_${cust.id}`}>
                    {/* PAGE 1: FRONT SIDE (85.60mm x 53.98mm) */}
                    <div className="print-page-break flex flex-col items-center justify-center py-4">
                      <div className="text-[8pt] font-mono text-slate-500 mb-2">
                        CR80 DUPLEX SIDE A (FRONT) — #{cust.memberNo} · 85.60mm × 53.98mm
                      </div>
                      <CardFrontView
                        customer={cust}
                        restaurantName={restaurant?.name || 'Kigali Independent University Canteen'}
                        isOnboarding={cust.name.startsWith('Onboarding Patron')}
                        restaurant={restaurant}
                      />
                    </div>

                    {/* PAGE 2: ALIGNED BACK SIDE (85.60mm x 53.98mm) */}
                    <div className="print-page-break flex flex-col items-center justify-center py-4">
                      <div className="text-[8pt] font-mono text-slate-500 mb-2">
                        CR80 DUPLEX SIDE B (BACK) — #{cust.memberNo} · 85.60mm × 53.98mm
                      </div>
                      <CardBackView
                        customer={cust}
                        restaurantName={restaurant?.name || 'Kigali Independent University Canteen'}
                        restaurant={restaurant}
                      />
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------------
// FRONT SIDE CARD COMPONENT (ISO/IEC 7810 ID-1 CR80: 85.60 × 53.98 mm)
// --------------------------------------------------------------------------------
export interface CardFrontViewProps {
  customer: Customer;
  restaurantName: string;
  isOnboarding?: boolean;
  restaurant?: Restaurant | null;
}

export const getCardThemePalette = (badgeStyle?: string, primaryColor?: string) => {
  if (badgeStyle === 'emerald' || primaryColor === 'emerald') {
    return {
      gradientStart: '#10b981',
      gradientMid: '#059669',
      gradientEnd: '#064e3b',
      accentLight: '#34d399',
      badgeBg: 'bg-emerald-900',
      badgeBorder: 'border-emerald-500',
      brandText: 'text-emerald-950',
      sloganColor: 'text-emerald-900',
      backStripe: 'bg-emerald-800',
      accentSvg: '#059669',
    };
  }
  if (badgeStyle === 'gold' || primaryColor === 'amber') {
    return {
      gradientStart: '#f59e0b',
      gradientMid: '#d97706',
      gradientEnd: '#78350f',
      accentLight: '#fbbf24',
      badgeBg: 'bg-amber-900',
      badgeBorder: 'border-amber-500',
      brandText: 'text-amber-950',
      sloganColor: 'text-amber-900',
      backStripe: 'bg-amber-800',
      accentSvg: '#d97706',
    };
  }
  if (badgeStyle === 'dark') {
    return {
      gradientStart: '#475569',
      gradientMid: '#1e293b',
      gradientEnd: '#0f172a',
      accentLight: '#64748b',
      badgeBg: 'bg-slate-900',
      badgeBorder: 'border-slate-600',
      brandText: 'text-slate-950',
      sloganColor: 'text-slate-800',
      backStripe: 'bg-slate-950',
      accentSvg: '#334155',
    };
  }
  if (primaryColor === 'purple') {
    return {
      gradientStart: '#c084fc',
      gradientMid: '#9333ea',
      gradientEnd: '#581c87',
      accentLight: '#d8b4fe',
      badgeBg: 'bg-purple-900',
      badgeBorder: 'border-purple-500',
      brandText: 'text-purple-950',
      sloganColor: 'text-purple-900',
      backStripe: 'bg-purple-900',
      accentSvg: '#9333ea',
    };
  }
  if (primaryColor === 'rose') {
    return {
      gradientStart: '#fb7185',
      gradientMid: '#e11d48',
      gradientEnd: '#881337',
      accentLight: '#fda4af',
      badgeBg: 'bg-rose-900',
      badgeBorder: 'border-rose-500',
      brandText: 'text-rose-950',
      sloganColor: 'text-rose-900',
      backStripe: 'bg-rose-900',
      accentSvg: '#e11d48',
    };
  }
  // Default Campus Blue
  return {
    gradientStart: '#0284c7',
    gradientMid: '#0369a1',
    gradientEnd: '#0c4a6e',
    accentLight: '#38bdf8',
    badgeBg: 'bg-blue-900',
    badgeBorder: 'border-blue-500',
    brandText: 'text-blue-950',
    sloganColor: 'text-blue-900',
    backStripe: 'bg-blue-950',
    accentSvg: '#0284c7',
  };
};

export const CardFrontView: React.FC<CardFrontViewProps> = ({
  customer,
  restaurantName,
  isOnboarding,
  restaurant,
}) => {
  const cardToken = restoStore.getCustomerCardQr(customer);
  const serialNo = `RP2026${customer.memberNo}`;
  const studentNo = customer.studentProfile?.registrationNumber?.trim() || null;
  const theme = getCardThemePalette(restaurant?.badgeStyle, restaurant?.primaryColor);
  const logoUrl = restaurant?.logoUrl;
  const welcomeMessage = restaurant?.welcomeMessage || 'Murakaza Neza! Healthy Meals';
  const gradId = `cardGrad_${customer.id ? customer.id.replace(/[^a-zA-Z0-9]/g, '') : 'default'}`;

  return (
    <div
      className="cr80-card w-[350px] h-[218px] bg-white text-slate-900 rounded-[20px] border border-slate-300 shadow-xl relative overflow-hidden flex flex-col justify-between font-sans select-none break-inside-avoid print:shadow-none print:border-slate-400"
      style={{ aspectRatio: '85.60 / 53.98' }}
    >
      {/* Dynamic Curved Swoosh matching Restaurant Custom Theme */}
      <svg
        className="absolute bottom-0 left-0 right-0 w-full h-[120px] pointer-events-none"
        viewBox="0 0 350 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <path
          d="M0,55 C85,15 170,95 260,35 C310,5 340,15 350,10 L350,120 L0,120 Z"
          fill={theme.accentLight}
          opacity="0.3"
        />
        <path
          d="M0,75 C90,30 180,95 270,45 C315,20 340,30 350,25 L350,120 L0,120 Z"
          fill={`url(#${gradId})`}
        />
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={theme.gradientStart} />
            <stop offset="60%" stopColor={theme.gradientMid} />
            <stop offset="100%" stopColor={theme.gradientEnd} />
          </linearGradient>
        </defs>
      </svg>

      {/* Top Header: Restaurant Logo & RestoPass Brand */}
      <div className="flex items-center justify-between p-3.5 pb-0 relative z-10">
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={restaurantName}
              className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-xs shrink-0"
            />
          ) : (
            <div className={`w-10 h-10 rounded-full ${theme.badgeBg} text-white flex items-center justify-center shadow-xs shrink-0`}>
              <Utensils className="w-5 h-5" />
            </div>
          )}
          <div>
            <div className={`text-[17px] font-black ${theme.brandText} leading-tight tracking-tight`}>
              RestoPass
            </div>
            <div className="text-[10.5px] font-bold text-slate-700 leading-tight">
              Smart Meal Access
            </div>
          </div>
        </div>

        {/* Decorative watermark */}
        <div className="text-slate-400/20 mr-1 pointer-events-none">
          <Utensils className="w-9 h-9" />
        </div>
      </div>

      {/* Center Body: Customer Details with Enlarged Dashboard-Level Typography */}
      <div className="grid grid-cols-12 gap-2 px-4 items-center relative z-10 my-auto">
        {/* Left Column: Photo & Name & Info */}
        <div className="col-span-7 space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border-2 border-white shadow-sm shrink-0">
              {isOnboarding ? (
                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 text-[8.5px] font-black text-center uppercase">
                  PHOTO
                </div>
              ) : (
                <img
                  src={customer.photoUrl}
                  alt={customer.name}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="text-[14px] sm:text-[15px] font-black text-slate-950 truncate leading-tight uppercase tracking-tight">
                {customer.name}
              </div>
              <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono text-[11px] font-black tracking-wider shadow-xs">
                <span>MEM: #{customer.memberNo}</span>
              </div>
              {studentNo && (
                <div className="text-[11px] text-slate-800 font-bold truncate">
                  ID: <span className="font-mono">{studentNo}</span>
                </div>
              )}
              {customer.studentProfile?.programme && (
                <div className="text-[10.5px] text-slate-800 font-bold truncate">
                  Class: <span className="font-semibold">{customer.studentProfile.programme}{customer.studentProfile.year ? ` (Yr ${customer.studentProfile.year})` : ''}</span>
                </div>
              )}
              <div className="text-[11px] text-slate-700 font-bold font-mono truncate">
                Tel: {customer.phone}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Scannable QR Code & Bold Serial */}
        <div className="col-span-5 flex flex-col items-center justify-center">
          <div className="p-1 bg-white rounded-xl border border-slate-300 shadow-md">
            <QrCanvas value={cardToken} size={82} />
          </div>
          <div className="text-[11px] font-mono font-black text-slate-950 tracking-wider text-center mt-1">
            {serialNo}
          </div>
        </div>
      </div>

      {/* Bottom Footer: Restaurant Branding & Customized Slogan */}
      <div className="px-4 pb-2.5 pt-1 flex items-end justify-between relative z-10">
        <div className="flex items-center gap-1.5 max-w-[210px]">
          <div className="w-6 h-6 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-xs shrink-0">
            <GraduationCap className="w-3.5 h-3.5" />
          </div>
          <div className="text-[11px] font-black leading-tight truncate text-slate-950 uppercase tracking-tight">
            {restaurantName}
          </div>
        </div>

        <div className="text-right max-w-[125px]">
          <div className={`text-[11px] italic font-bold ${theme.sloganColor} font-serif leading-tight truncate`}>
            {welcomeMessage.split('!')[0] || 'Healthy Meals'}
          </div>
          <div className="text-[10px] italic font-semibold text-slate-700 font-serif leading-tight">
            Prepaid Meal Pass
          </div>
        </div>
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------------
// BACK SIDE CARD COMPONENT (Matching User Mockup)
// --------------------------------------------------------------------------------
export const CardBackView: React.FC<{
  customer: Customer;
  restaurantName: string;
  restaurant?: Restaurant | null;
}> = ({ customer, restaurantName, restaurant }) => {
  const theme = getCardThemePalette(restaurant?.badgeStyle, restaurant?.primaryColor);
  const logoUrl = restaurant?.logoUrl;

  return (
    <div
      className="cr80-card w-[350px] h-[218px] bg-white text-slate-900 rounded-[20px] border border-slate-300 shadow-xl relative overflow-hidden flex flex-col justify-between font-sans select-none break-inside-avoid print:shadow-none print:border-slate-400"
      style={{ aspectRatio: '85.60 / 53.98' }}
    >
      {/* Top Header Stripe with Restaurant Theme Color */}
      <div className={`h-4.5 ${theme.backStripe} w-full`} />

      {/* Center Branding & Notice */}
      <div className="px-5 py-2 text-center my-auto space-y-2">
        {/* RestoPass Logo */}
        <div className="flex items-center justify-center gap-2">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={restaurantName}
              className="w-8 h-8 rounded-full object-cover border border-slate-300 shadow-xs shrink-0"
            />
          ) : (
            <div className={`w-8 h-8 rounded-full ${theme.badgeBg} text-white flex items-center justify-center shadow-xs`}>
              <Utensils className="w-4 h-4" />
            </div>
          )}
          <div className="text-left">
            <div className={`text-base font-black ${theme.brandText} leading-tight`}>
              RestoPass
            </div>
            <div className="text-[10px] font-bold text-slate-600 leading-tight">
              Smart Meal Access · {restaurantName}
            </div>
          </div>
        </div>

        {/* Divider Line */}
        <div className="w-44 h-0.5 bg-slate-200 mx-auto" />

        {/* Mandatory Legal Notice in Kinyarwanda & English with High-Contrast Typography */}
        <div className="space-y-0.5">
          <div className="text-[13.5px] font-black text-slate-950 leading-snug">
            Iyi karita ni umutungo wihariye wa resitora.
          </div>
          <div className="text-[11px] text-slate-700 font-semibold">
            This card is the property of the restaurant.
          </div>
        </div>
      </div>

      {/* Bottom Feature Badges (Sikure, Tegereza, Koresha) */}
      <div className="px-4 pb-3 pt-1.5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-around text-center text-slate-800">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="text-left leading-tight">
            <div className="text-[10px] font-black text-slate-950">Sikure</div>
            <div className="text-[8.5px] text-slate-600 font-medium">(Secure)</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Radio className="w-4 h-4 text-sky-600 shrink-0" />
          <div className="text-left leading-tight">
            <div className="text-[10px] font-black text-slate-950">Tegereza</div>
            <div className="text-[8.5px] text-slate-600 font-medium">(Scan)</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <QrCode className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-left leading-tight">
            <div className="text-[10px] font-black text-slate-950">Koresha</div>
            <div className="text-[8.5px] text-slate-600 font-medium">(Use)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
