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
} from 'lucide-react';

interface CardPrintStudioProps {
  onBack?: () => void;
}

export const CardPrintStudio: React.FC<CardPrintStudioProps> = () => {
  const state = restoStore.getState();
  const restaurant = restoStore.getCurrentRestaurant();

  // Active Tab: 'bulk_onboarding' | 'existing_customers'
  const [activeMode, setActiveMode] = useState<'bulk_onboarding' | 'existing_customers'>('bulk_onboarding');

  // Bulk Generator Options
  const [batchCount, setBatchCount] = useState<number>(10);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('blank');
  const [templateType, setTemplateType] = useState<'pvc_id1' | 'onboarding_slip'>('pvc_id1');
  const [lastGeneratedBatch, setLastGeneratedBatch] = useState<Customer[] | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [batchSuccessNotice, setBatchSuccessNotice] = useState<string | null>(null);

  // Existing Customers Selection (Filtered strictly by active restaurant)
  const restoCustomers = state.customers.filter((c) => c.restaurantCode === state.currentRestaurantCode);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    restoCustomers[0]?.id || ''
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

  // Export Onboarding Manifest (CSV)
  const handleExportManifestCsv = () => {
    const cardsToExport = lastGeneratedBatch || restoCustomers;
    const headers = [
      'Member Number',
      'Card Token (QR Payload)',
      'Onboarding Token',
      'Plate Balance',
      'WhatsApp Invite Link',
    ];

    const rows = cardsToExport.map((c) => {
      const cardToken = restoStore.getCustomerCardQr(c);
      const bal = restoStore.getCustomerBalance(c.id);
      const inviteMsg = encodeURIComponent(
        `Hello! Welcome to ${restaurant?.name || 'RestoPass'}. Your meal pass Member Number is #${c.memberNo}. Tap this link to set your PIN and view your balance: https://restopass.rw/activate?token=${c.onboardingToken}`
      );
      const waLink = `https://wa.me/?text=${inviteMsg}`;

      return [
        `"#${c.memberNo}"`,
        `"${cardToken}"`,
        `"${c.onboardingToken}"`,
        `"${bal}"`,
        `"${waLink}"`,
      ];
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RestoPass_${state.currentRestaurantCode}_Onboarding_Batch_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyInvite = (customer: Customer) => {
    const inviteMsg = `Hello! Welcome to ${restaurant?.name || 'RestoPass'}. Your meal pass Member Number is #${customer.memberNo}. Tap this link to activate your web app: https://restopass.rw/activate?token=${customer.onboardingToken}`;
    navigator.clipboard.writeText(inviteMsg);
    setCopiedToken(customer.id);
    setTimeout(() => setCopiedToken(null), 2000);
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
            <QrCode className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Bulk Card &amp; QR Code Generation Studio
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400">
              Masterplan v1.1
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Generate and print pre-allocated QR cards for new customer onboarding, student cohorts, or reprint existing cards.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportManifestCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download CSV manifest with member numbers, QR payloads, and WhatsApp invite links"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export Manifest (CSV)</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Cards / Save PDF</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs font-semibold text-slate-400 print:hidden">
        <button
          onClick={() => setActiveMode('bulk_onboarding')}
          className={`px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeMode === 'bulk_onboarding'
              ? 'bg-emerald-600 text-white font-bold shadow-xs'
              : 'hover:text-white hover:bg-slate-900'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Bulk Onboarding Card Generator</span>
        </button>

        <button
          onClick={() => setActiveMode('existing_customers')}
          className={`px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeMode === 'existing_customers'
              ? 'bg-emerald-600 text-white font-bold shadow-xs'
              : 'hover:text-white hover:bg-slate-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Active Patrons ({restoCustomers.length})</span>
        </button>
      </div>

      {batchSuccessNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs flex items-center gap-2.5 shadow-sm print:hidden">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{batchSuccessNotice}</span>
        </div>
      )}

      {/* 1. BULK ONBOARDING GENERATOR CONTROLS */}
      {activeMode === 'bulk_onboarding' && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 print:hidden text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <div className="font-bold text-white text-sm">New Onboarding Batch Configuration</div>
              <div className="text-[11px] text-slate-400">
                Pre-allocate sequential Member Numbers with static cryptographic QR tokens (c1) and WhatsApp onboarding tokens.
              </div>
            </div>
            <div className="text-right text-[11px] font-mono text-emerald-400 font-bold">
              Next Member Range: #{28490 + state.customers.length + 1} &rarr; #{28490 + state.customers.length + batchCount}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Batch Count */}
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Number of Cards to Generate</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[5, 10, 20, 50].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setBatchCount(count)}
                    className={`py-2 rounded-lg border font-bold text-xs transition-colors ${
                      batchCount === count
                        ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {/* Initial Plate Bundle Selection */}
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Pre-Loaded Plate Bundle</label>
              <select
                value={selectedPackageId}
                onChange={(e) => setSelectedPackageId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium focus:border-emerald-500 outline-hidden"
              >
                <option value="blank">Blank Card (Cashier Top-Up upon handover)</option>
                {state.packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} (+{pkg.platesCount} plates)
                  </option>
                ))}
              </select>
            </div>

            {/* Template Layout Selection */}
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Print Layout Format</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTemplateType('pvc_id1')}
                  className={`p-2 rounded-lg border font-bold text-xs transition-colors flex items-center justify-center gap-1.5 ${
                    templateType === 'pvc_id1'
                      ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>PVC (85×54mm)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplateType('onboarding_slip')}
                  className={`p-2 rounded-lg border font-bold text-xs transition-colors flex items-center justify-center gap-1.5 ${
                    templateType === 'onboarding_slip'
                      ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Vouchers Sheet</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <div className="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 p-2 rounded-xl flex items-center gap-2 max-w-xl">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                <strong>Physical Card Standard:</strong> Plate counts are <strong>never printed</strong> on physical cards because balances change with every meal. Cards only carry the permanent cryptographic QR token and Member ID.
              </span>
            </div>

            <button
              onClick={handleGenerateBulk}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate {batchCount} Onboarding Cards Now</span>
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
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  !isExistingBatchMode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Single Card
              </button>
              <button
                onClick={() => setIsExistingBatchMode(true)}
                className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                  isExistingBatchMode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>All Registered ({restoCustomers.length})</span>
              </button>
            </div>
          </div>

          {!isExistingBatchMode && (
            <div className="flex items-center gap-2 overflow-x-auto pt-1">
              {restoCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomerId(c.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors shrink-0 ${
                    c.id === selectedCustomerId
                      ? 'bg-emerald-950/80 border-emerald-600 text-white shadow-xs'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  <img src={c.photoUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                  <span>{c.name}</span>
                  <span className="font-mono text-slate-400 text-[11px]">#{c.memberNo}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PRINT SHEET RENDERING CANVAS */}
      <div className="flex flex-col items-center justify-center p-2">
        {/* Render PVC Cards (Standard ISO ID-1 85.6 × 54 mm) */}
        {templateType === 'pvc_id1' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl print:grid-cols-2 print:gap-4">
            {displayCards.map((cust) => (
              <PvcCardItem
                key={cust.id}
                customer={cust}
                restaurantName={restaurant?.name || 'Kigali Campus Resto'}
                isOnboarding={cust.name.startsWith('Onboarding Patron')}
                onCopyInvite={() => handleCopyInvite(cust)}
                isCopied={copiedToken === cust.id}
              />
            ))}
          </div>
        ) : (
          /* Render Onboarding QR Vouchers / Slips */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl print:grid-cols-3 print:gap-3">
            {displayCards.map((cust) => (
              <OnboardingSlipItem
                key={cust.id}
                customer={cust}
                restaurantName={restaurant?.name || 'Kigali Campus Resto'}
                onCopyInvite={() => handleCopyInvite(cust)}
                isCopied={copiedToken === cust.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------------
// ISO/IEC 7810 ID-1 Card Component (85.6 × 54 mm ratio)
// --------------------------------------------------------------------------------
interface PvcCardItemProps {
  customer: Customer;
  restaurantName: string;
  isOnboarding?: boolean;
  onCopyInvite?: () => void;
  isCopied?: boolean;
}

const PvcCardItem: React.FC<PvcCardItemProps> = ({
  customer,
  restaurantName,
  isOnboarding,
  onCopyInvite,
  isCopied,
}) => {
  const cardToken = restoStore.getCustomerCardQr(customer);

  return (
    <div
      className="w-[340px] h-[214px] bg-slate-950 text-white rounded-[14px] border border-slate-700/80 p-3.5 shadow-2xl relative overflow-hidden flex flex-col justify-between font-sans select-none print:border-black print:text-black print:bg-white print:shadow-none break-inside-avoid"
      style={{ aspectRatio: '85.6 / 54' }}
    >
      {/* Background Subtle Accent Pattern */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-600/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-36 h-36 bg-amber-600/10 rounded-full blur-2xl pointer-events-none" />

      {/* Card Header: Restaurant Name & Logo */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 relative z-10">
        <div>
          <div className="text-[12px] font-black uppercase tracking-wider text-emerald-400">
            {restaurantName}
          </div>
          <div className="text-[9px] text-slate-400 uppercase tracking-widest font-mono">
            RestoPass Meal Card · Authority {customer.restaurantCode}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[12px] font-mono font-bold text-white">
            #{customer.memberNo}
          </div>
          <div className="text-[8px] text-emerald-400 uppercase font-mono font-bold tracking-wider">
            PASS V{customer.cardVersion}
          </div>
        </div>
      </div>

      {/* Card Body: Photo / Placeholder, Details, and Static Cryptographic QR */}
      <div className="grid grid-cols-12 gap-2.5 items-center my-auto relative z-10">
        {/* Passport Photo or Photo Holder Frame for Onboarding */}
        <div className="col-span-4 flex flex-col items-center">
          {isOnboarding ? (
            <div className="w-[66px] h-[78px] rounded-md border-2 border-dashed border-slate-600 bg-slate-900/60 flex flex-col items-center justify-center text-center p-1">
              <span className="text-[8px] text-slate-400 uppercase font-mono leading-tight">
                AFFIX PHOTO HERE
              </span>
            </div>
          ) : (
            <div className="w-[66px] h-[78px] rounded-md overflow-hidden border border-slate-600 bg-slate-900 shadow-sm">
              <img
                src={customer.photoUrl}
                alt={customer.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>

        {/* Member Details or Fill-in Name Line */}
        <div className="col-span-4 space-y-1">
          {isOnboarding ? (
            <div className="space-y-1.5 text-[9px] text-slate-300 font-mono">
              <div>
                <span className="text-slate-500 uppercase text-[8px] block">PATRON NAME:</span>
                <span className="border-b border-slate-600 block w-24 h-4"></span>
              </div>
              <div>
                <span className="text-slate-500 uppercase text-[8px] block">STUDENT REG / ID:</span>
                <span className="border-b border-slate-600 block w-24 h-4"></span>
              </div>
            </div>
          ) : (
            <>
              <div className="text-[11px] font-bold text-white leading-tight">
                {customer.name}
              </div>
              <div className="text-[9px] text-slate-300 font-mono">
                {customer.phone}
              </div>
              {customer.isStudent && customer.studentProfile && (
                <div className="text-[8px] text-slate-400 leading-tight">
                  <div>{customer.studentProfile.programme}</div>
                  <div className="font-mono">Yr {customer.studentProfile.year} · {customer.studentProfile.registrationNumber}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Static Card QR (c1.RW01.<memberNo>.<ver>.<mac>) */}
        <div className="col-span-4 flex flex-col items-center justify-center">
          <div className="p-1 bg-white rounded-md shadow-xs">
            <QrCanvas value={cardToken} size={68} />
          </div>
          <div className="text-[7px] font-mono text-slate-400 mt-1 uppercase text-center">
            Tap at stand
          </div>
        </div>
      </div>

      {/* Card Footer: Terms Notice & Optional WhatsApp Invite Button in UI */}
      <div className="border-t border-slate-800/80 pt-1.5 flex items-center justify-between text-[8px] text-slate-400 font-mono relative z-10">
        <span>Non-transferable to outside · Unused plates never expire</span>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-slate-300">NO REFUNDS</span>
          {onCopyInvite && (
            <button
              onClick={onCopyInvite}
              title="Copy WhatsApp invite message"
              className="text-[9px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 print:hidden cursor-pointer ml-1"
            >
              {isCopied ? <Check className="w-2.5 h-2.5" /> : <Send className="w-2.5 h-2.5" />}
              <span>{isCopied ? 'Copied' : 'WhatsApp'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------------
// Onboarding QR Voucher / Slip Component (Compact 3-per-page grid)
// --------------------------------------------------------------------------------
interface OnboardingSlipItemProps {
  customer: Customer;
  restaurantName: string;
  onCopyInvite: () => void;
  isCopied: boolean;
}

const OnboardingSlipItem: React.FC<OnboardingSlipItemProps> = ({
  customer,
  restaurantName,
  onCopyInvite,
  isCopied,
}) => {
  const cardToken = restoStore.getCustomerCardQr(customer);

  return (
    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white space-y-2.5 shadow-md print:border-black print:text-black print:bg-white print:shadow-none break-inside-avoid">
      <div className="flex items-start justify-between border-b border-slate-800 pb-2">
        <div>
          <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
            {restaurantName}
          </div>
          <div className="text-[9px] text-slate-400 font-mono">
            Onboarding Pass · Member #{customer.memberNo}
          </div>
        </div>

        <div className="text-right">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 border border-emerald-800 text-emerald-400">
            DINING PASS · V{customer.cardVersion}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-1 bg-white rounded-md shrink-0">
          <QrCanvas value={cardToken} size={84} />
        </div>

        <div className="space-y-1 text-[10px] text-slate-300 font-mono">
          <div className="font-bold text-white">How to use:</div>
          <div>1. Show this QR at the food stand to eat.</div>
          <div>2. Check live plate balance anytime on your phone.</div>
          <div>3. Token: <strong className="text-emerald-400">{customer.onboardingToken}</strong></div>
        </div>
      </div>

      <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[8px] text-slate-500 font-mono">
        <span>Unused plates never expire · No refunds</span>
        <button
          onClick={onCopyInvite}
          className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 print:hidden cursor-pointer"
        >
          {isCopied ? <Check className="w-2.5 h-2.5" /> : <Send className="w-2.5 h-2.5" />}
          <span>{isCopied ? 'Invite Copied' : 'Send via WhatsApp'}</span>
        </button>
      </div>
    </div>
  );
};
