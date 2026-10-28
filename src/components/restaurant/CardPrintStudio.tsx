import React, { useState } from 'react';
import { Customer, Package } from '../../types';
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
}

export const CardPrintStudio: React.FC<CardPrintStudioProps> = ({
  onBack,
  initialCustomerId,
  initialMode,
}) => {
  const state = restoStore.getState();
  const restaurant = restoStore.getCurrentRestaurant();

  // Active Tab: 'bulk_onboarding' | 'existing_customers'
  const [activeMode, setActiveMode] = useState<'bulk_onboarding' | 'existing_customers'>(
    initialMode || (initialCustomerId ? 'existing_customers' : 'bulk_onboarding')
  );

  // Card Side Layout format: Double-Sided (Front & Back), Front Only, Back Only
  const [cardSideView, setCardSideView] = useState<'double_sided' | 'front_only' | 'back_only'>('double_sided');

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

  const selectedExistingCustomer = restoCustomers.find((c) => c.id === selectedCustomerId) || restoCustomers[0];

  // Handler to generate bulk onboarding cards
  const handleGenerateBulk = () => {
    const pkgId = selectedPackageId !== 'blank' ? selectedPackageId : undefined;
    const created = restoStore.generateBulkOnboardingCards({
      restaurantCode: state.currentRestaurantCode,
      count: Number(batchCount),
      packageId: pkgId,
      adminStaffName: 'Claire Mukamurenzi (Cashier)',
    });
    setLastGeneratedBatch(created);
    setBatchSuccessNotice(`Successfully generated ${created.length} new onboarding cards (#${created[0]?.memberNo} to #${created[created.length - 1]?.memberNo})! Ready to print.`);
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

        {/* Card Sides Selector (Double-Sided / Front Only / Back Only) */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 px-2 font-mono">Layout:</span>
          <button
            type="button"
            onClick={() => setCardSideView('double_sided')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              cardSideView === 'double_sided'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Front &amp; Back
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
        <div className="flex flex-col gap-6 w-full max-w-4xl print:gap-4">
          {displayCards.map((cust) => (
            <div
              key={cust.id}
              className="flex flex-col md:flex-row gap-6 items-center justify-center p-5 rounded-2xl bg-slate-900/60 border border-slate-800 print:bg-white print:border-none print:p-0 print:gap-3 break-inside-avoid shadow-sm"
            >
              {/* FRONT SIDE */}
              {(cardSideView === 'double_sided' || cardSideView === 'front_only') && (
                <div className="flex flex-col items-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 print:hidden flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                    <span>Front Side (RestoPass Smart Meal Access)</span>
                  </div>
                  <CardFrontView
                    customer={cust}
                    restaurantName={restaurant?.name || 'Kigali Independent University Canteen'}
                    isOnboarding={cust.name.startsWith('Onboarding Patron')}
                  />
                  <div className="mt-2 flex items-center gap-2 print:hidden">
                    <button
                      onClick={() => handleTestCardScan(cust)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer border border-slate-700"
                      title="Test real-time buffet scanner deduction"
                    >
                      <Radio className="w-3 h-3 text-sky-400" />
                      <span>Test Real-Time QR Scan</span>
                    </button>
                  </div>
                </div>
              )}

              {/* BACK SIDE */}
              {(cardSideView === 'double_sided' || cardSideView === 'back_only') && (
                <div className="flex flex-col items-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 print:hidden flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                    <span>Back Side (Property Notice &amp; Badges)</span>
                  </div>
                  <CardBackView
                    customer={cust}
                    restaurantName={restaurant?.name || 'Kigali Independent University Canteen'}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------------
// FRONT SIDE CARD COMPONENT (Matching User Mockup)
// --------------------------------------------------------------------------------
export const CardFrontView: React.FC<{
  customer: Customer;
  restaurantName: string;
  isOnboarding?: boolean;
}> = ({ customer, restaurantName, isOnboarding }) => {
  const cardToken = restoStore.getCustomerCardQr(customer);
  const serialNo = `RP2026${customer.memberNo}`;
  const studentNo = customer.studentProfile?.registrationNumber || (customer.isStudent ? '20251123' : null);

  return (
    <div
      className="w-[350px] h-[218px] bg-white text-slate-900 rounded-[20px] border border-slate-300 shadow-xl relative overflow-hidden flex flex-col justify-between font-sans select-none break-inside-avoid print:shadow-none print:border-slate-400"
      style={{ aspectRatio: '85.6 / 54' }}
    >
      {/* Dynamic Blue Curved Swoosh at Bottom & Right */}
      <svg
        className="absolute bottom-0 left-0 right-0 w-full h-[120px] pointer-events-none"
        viewBox="0 0 350 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <path
          d="M0,55 C85,15 170,95 260,35 C310,5 340,15 350,10 L350,120 L0,120 Z"
          fill="#0284c7"
          opacity="0.3"
        />
        <path
          d="M0,75 C90,30 180,95 270,45 C315,20 340,30 350,25 L350,120 L0,120 Z"
          fill="url(#cardFrontBlueGrad)"
        />
        <defs>
          <linearGradient id="cardFrontBlueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="60%" stopColor="#0369a1" />
            <stop offset="100%" stopColor="#0c4a6e" />
          </linearGradient>
        </defs>
      </svg>

      {/* Top Header: RestoPass Logo & Smart Meal Access */}
      <div className="flex items-center justify-between p-3.5 pb-0 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-blue-900 text-white flex items-center justify-center shadow-xs">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[17px] font-black text-blue-950 leading-tight tracking-tight">
              RestoPass
            </div>
            <div className="text-[10px] font-semibold text-sky-700 leading-tight">
              Smart Meal Access
            </div>
          </div>
        </div>

        {/* Fork & knife subtle watermark */}
        <div className="text-blue-900/15 mr-1 pointer-events-none">
          <Utensils className="w-8 h-8" />
        </div>
      </div>

      {/* Center Body: Customer Details & Scannable QR Code */}
      <div className="grid grid-cols-12 gap-2 px-3.5 items-center relative z-10 my-auto">
        {/* Left Column: Photo & Name & Info */}
        <div className="col-span-7 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-100 border-2 border-white shadow-sm shrink-0">
              {isOnboarding ? (
                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 text-[8px] font-bold text-center">
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
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-900 truncate leading-tight">
                {customer.name}
              </div>
              {studentNo ? (
                <div className="text-[9px] text-slate-700 font-medium truncate">
                  Student No: {studentNo} (Optional)
                </div>
              ) : (
                <div className="text-[9px] text-slate-700 font-medium truncate">
                  Member: #{customer.memberNo}
                </div>
              )}
              <div className="text-[9px] text-slate-600 font-mono">
                Phone: {customer.phone}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Real Scannable QR Code & Serial */}
        <div className="col-span-5 flex flex-col items-center justify-center">
          <div className="p-1.5 bg-white rounded-xl border border-slate-300 shadow-md">
            <QrCanvas value={cardToken} size={74} />
          </div>
          <div className="text-[10px] font-mono font-black text-slate-900 tracking-wider text-center mt-1">
            {serialNo}
          </div>
        </div>
      </div>

      {/* Bottom Footer: Restaurant/Canteen Branding & Slogan */}
      <div className="px-3.5 pb-2.5 pt-1 flex items-end justify-between relative z-10">
        <div className="flex items-center gap-1.5 max-w-[200px]">
          <div className="w-6 h-6 rounded-full bg-white text-blue-900 flex items-center justify-center shadow-xs shrink-0">
            <GraduationCap className="w-3.5 h-3.5" />
          </div>
          <div className="text-[9px] font-bold leading-tight truncate text-slate-900">
            {restaurantName}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] italic font-semibold text-blue-950 font-serif leading-tight">
            Healthy Meals
          </div>
          <div className="text-[10px] italic font-bold text-blue-900 font-serif leading-tight">
            Bright Future
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
}> = ({ customer, restaurantName }) => {
  return (
    <div
      className="w-[350px] h-[218px] bg-white text-slate-900 rounded-[20px] border border-slate-300 shadow-xl relative overflow-hidden flex flex-col justify-between font-sans select-none break-inside-avoid print:shadow-none print:border-slate-400"
      style={{ aspectRatio: '85.6 / 54' }}
    >
      {/* Top Navy Header Stripe */}
      <div className="h-4 bg-slate-950 w-full" />

      {/* Center Branding & Notice */}
      <div className="px-5 py-2 text-center my-auto space-y-2">
        {/* RestoPass Logo */}
        <div className="flex items-center justify-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-900 text-white flex items-center justify-center shadow-xs">
            <Utensils className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-base font-black text-blue-950 leading-tight">
              RestoPass
            </div>
            <div className="text-[9px] font-semibold text-slate-500 leading-tight">
              Smart Meal Access
            </div>
          </div>
        </div>

        {/* Divider Line */}
        <div className="w-40 h-0.5 bg-blue-200 mx-auto" />

        {/* Mandatory Legal Notice in Kinyarwanda & English */}
        <div className="space-y-0.5">
          <div className="text-[13px] font-black text-blue-950 leading-snug">
            Iyi karita ni umutungo wihariye wa resitora.
          </div>
          <div className="text-[10.5px] text-slate-600 font-medium">
            This card is the property of the restaurant.
          </div>
        </div>
      </div>

      {/* Bottom Feature Badges (Sikure, Tegereza, Koresha) */}
      <div className="px-4 pb-3 pt-1.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-around text-center text-slate-700">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-blue-900 shrink-0" />
          <div className="text-left leading-tight">
            <div className="text-[9px] font-black text-blue-950">Sikure</div>
            <div className="text-[8px] text-slate-500">(Secure)</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Radio className="w-4 h-4 text-blue-900 shrink-0" />
          <div className="text-left leading-tight">
            <div className="text-[9px] font-black text-blue-950">Tegereza</div>
            <div className="text-[8px] text-slate-500">(Scan)</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <QrCode className="w-4 h-4 text-blue-900 shrink-0" />
          <div className="text-left leading-tight">
            <div className="text-[9px] font-black text-blue-950">Koresha</div>
            <div className="text-[8px] text-slate-500">(Use)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
