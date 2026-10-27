import React, { useState } from 'react';
import { Restaurant, Plan, License, SubscriptionPayment, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import {
  Building2,
  FileKey,
  ShieldCheck,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Download,
  AlertCircle,
  ExternalLink,
  DollarSign,
  TrendingUp,
  Activity,
  Award,
  Server,
  Layers,
  Smartphone,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  Clock,
  Gift,
  ShieldAlert,
} from 'lucide-react';
import { DeploymentBlueprintView } from './DeploymentBlueprintView';

interface SuperAdminViewProps {
  language: Language;
  activeSubTab: string;
  onSubTabChange: (tab: string) => void;
}

export const SuperAdminView: React.FC<SuperAdminViewProps> = ({
  language,
  activeSubTab,
  onSubTabChange,
}) => {
  const t = translations[language];
  const state = restoStore.getState();

  // Student Subscription Admin Controls
  const studentSubSettings = restoStore.getStudentSubscriptionSettings();
  const [complimentaryModalOpen, setComplimentaryModalOpen] = useState(false);
  const [compCustomerId, setCompCustomerId] = useState('');
  const [compReason, setCompReason] = useState('');
  const [compDays, setCompDays] = useState(30);
  const [compError, setCompError] = useState('');

  // Create Restaurant State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newCode, setNewCode] = useState('RW03');
  const [newName, setNewName] = useState('Butare University Cafeteria');
  const [newLegal, setNewLegal] = useState('Southern Province Food Ltd');
  const [newPhone, setNewPhone] = useState('+250 788 445 667');
  const [newEmail, setNewEmail] = useState('admin@butarefood.rw');
  const [newAddress, setNewAddress] = useState('Huye Campus Road, Huye, Rwanda');
  const [newPlanId, setNewPlanId] = useState('plan_high_volume');

  // Issue License State
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [licRestaurantCode, setLicRestaurantCode] = useState('RW01');
  const [licMaxStations, setLicMaxStations] = useState(4);
  const [licValidDays, setLicValidDays] = useState(30);
  const [licGraceDays, setLicGraceDays] = useState(14);

  // Copy Feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateRestaurant = (e: React.FormEvent) => {
    e.preventDefault();
    restoStore.createRestaurant({
      code: newCode,
      name: newName,
      legalEntity: newLegal,
      phone: newPhone,
      email: newEmail,
      address: newAddress,
      currency: 'RWF',
      planId: newPlanId,
    });
    setCreateModalOpen(false);
  };

  const handleIssueLicense = (e: React.FormEvent) => {
    e.preventDefault();
    restoStore.issueLicense({
      restaurantCode: licRestaurantCode,
      planId: 'plan_high_volume',
      maxScanPoints: Number(licMaxStations),
      validDays: Number(licValidDays),
      graceDays: Number(licGraceDays),
      featureFlags: {
        spotChecksEnabled: true,
        multiStationEnabled: true,
        secondPlateAllowed: true,
        customerTransfersEnabled: true,
      },
    });
    setLicenseModalOpen(false);
  };

  // Download .lic file for offline WhatsApp transmission (Masterplan Section 5)
  const handleDownloadLicFile = (license: License) => {
    const content = JSON.stringify(license, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${license.restaurantCode}_${license.id}.lic`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Metrics
  const totalSubRevenue = state.subscriptionPayments.reduce((sum, p) => sum + p.amountRwf, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Console Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border border-amber-900/60">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              RestoPass Master Control
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Ephrem (Founder &amp; Super Admin)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Global tenancy, signed Ed25519 offline license issuer, subscription terms overrides, and platform health.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Onboard Restaurant</span>
          </button>

          <button
            onClick={() => setLicenseModalOpen(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
          >
            <FileKey className="w-4 h-4 text-emerald-400" />
            <span>Issue Signed License</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2 text-xs font-medium text-slate-400">
        {[
          { id: 'restaurants', label: 'Tenants & Health' },
          { id: 'student_subs', label: 'Student Monetization (500 RWF)' },
          { id: 'plans', label: 'B2B Subscriptions & Limits' },
          { id: 'licenses', label: 'Signed Licences (.lic)' },
          { id: 'revenue', label: 'Platform Revenue' },
          { id: 'deployment', label: 'Hosting & Deployment Blueprint' },
          { id: 'audit', label: 'Platform Audit Log' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSubTabChange(tab.id)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeSubTab === tab.id
                ? 'bg-amber-600 text-white font-bold shadow-xs'
                : 'hover:text-white hover:bg-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. RESTAURANTS TENANCY & HEALTH */}
      {activeSubTab === 'restaurants' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Restaurant</th>
                  <th className="py-3 px-4">Status &amp; Plan</th>
                  <th className="py-3 px-4">Active License</th>
                  <th className="py-3 px-4">Software Version</th>
                  <th className="py-3 px-4">Last Sync</th>
                  <th className="py-3 px-4 text-right">Switch Authority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {state.restaurants.map((resto) => {
                  const lic = state.licenses.find((l) => l.id === resto.currentLicenseId);
                  const isCurrent = state.currentRestaurantCode === resto.code;
                  return (
                    <tr key={resto.code} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{resto.name}</div>
                        <div className="text-slate-400 font-mono text-[11px]">
                          Code: {resto.code} · {resto.phone}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-950 border border-emerald-800 text-emerald-400">
                          {resto.status}
                        </span>
                        <div className="text-slate-400 text-[11px] mt-0.5 capitalize">
                          {resto.planId.replace('_', ' ')}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        {lic ? (
                          <div>
                            <div className="text-emerald-400 font-bold">{lic.id}</div>
                            <div className="text-slate-500 text-[10px]">
                              Valid until {new Date(lic.validUntil).toLocaleDateString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-amber-400">Unlicensed</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {resto.softwareVersion}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {new Date(resto.lastSyncAt).toLocaleTimeString()}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => restoStore.setRestaurantCode(resto.code)}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            isCurrent
                              ? 'bg-emerald-950 border border-emerald-600 text-emerald-400'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                        >
                          {isCurrent ? 'Current Local Authority' : 'Switch Context'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. PLANS & TERMS TEMPLATES */}
      {activeSubTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {state.plans.map((p) => (
            <div key={p.id} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">{p.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-500 text-[10px] uppercase">Base Monthly Price</div>
                  <div className="font-mono font-bold text-white text-base mt-0.5">
                    {p.terms.basePriceRwf.toLocaleString()} RWF
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 text-[10px] uppercase">Extra Scan Point Fee</div>
                  <div className="font-mono font-bold text-white text-base mt-0.5">
                    {p.terms.pricePerExtraScanPointRwf.toLocaleString()} RWF
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 text-[10px] uppercase">Serving Window &amp; Limit</div>
                  <div className="text-slate-300 font-mono mt-0.5">
                    {p.terms.servingWindowMinutes}m / {p.terms.plateLimitPerWindow} plates max
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 text-[10px] uppercase">Grace Period</div>
                  <div className="text-slate-300 font-mono mt-0.5">
                    {p.terms.graceDays} days
                  </div>
                </div>
              </div>

              <div className="text-slate-400 text-xs leading-relaxed">
                Terms are carried inside each client's signed cryptographic license, so terms can be customized per restaurant without a software update!
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. SIGNED LICENSES (.LIC) */}
      {activeSubTab === 'licenses' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <h2 className="text-base font-bold text-white">Cryptographic Ed25519 Licenses</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Signed by Ephrem with Master Key. Local servers verify offline using public key. Exportable as .lic file for WhatsApp transfer.
            </p>
          </div>

          <div className="space-y-3">
            {state.licenses.map((lic) => (
              <div key={lic.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <div className="text-sm font-bold text-white font-mono">{lic.id}</div>
                    <div className="text-xs text-slate-400 font-mono">
                      Restaurant: <strong>{lic.restaurantCode}</strong> · Stations: {lic.maxScanPoints} max · Grace: {lic.graceDays} days
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadLicFile(lic)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .lic</span>
                    </button>

                    <button
                      onClick={() => handleCopy(JSON.stringify(lic), lic.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5"
                    >
                      {copiedKey === lic.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copy for WhatsApp</span>
                    </button>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-[11px] text-slate-400 truncate">
                  Signature: <span className="text-emerald-400">{lic.signature}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. SUBSCRIPTION REVENUE */}
      {activeSubTab === 'revenue' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase">RestoPass Platform Subscription Revenue</div>
              <div className="text-3xl font-black text-emerald-400 font-mono tabular-nums mt-1">
                {totalSubRevenue.toLocaleString()} RWF
              </div>
              <div className="text-xs text-slate-500 mt-1">Collected from partner restaurants</div>
            </div>
            <DollarSign className="w-12 h-12 text-emerald-500/20" />
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Restaurant</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Method &amp; Ref</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {state.subscriptionPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 px-4 font-bold text-white">{p.restaurantName}</td>
                    <td className="py-3 px-4 text-slate-300 font-mono">{p.periodCovered}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono">{p.paymentMethod} ({p.reference})</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      {p.amountRwf.toLocaleString()} RWF
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. PLATFORM AUDIT LOG */}
      {activeSubTab === 'audit' && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Immutable Platform Security Audit Trail
            </h3>
            <span className="text-xs font-mono text-slate-400">
              {state.auditLogs.length} logged entries
            </span>
          </div>

          <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto font-mono text-xs">
            {state.auditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                      {log.actorRole}
                    </span>
                    <span className="font-semibold text-white">{log.action}</span>
                    <span className="text-slate-500 text-[11px]">by {log.actorName}</span>
                  </div>
                  <div className="text-slate-400 text-[11px] mt-0.5">{log.details}</div>
                </div>

                <div className="text-slate-500 text-[10px] whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. HOSTING & DEPLOYMENT BLUEPRINT */}
      {activeSubTab === 'deployment' && (
        <DeploymentBlueprintView />
      )}

      {/* 7. STUDENT MONETIZATION (500 RWF / MONTH) - DEVELOPER SPEC */}
      {activeSubTab === 'student_subs' && (
        <div className="space-y-6">
          {/* Master Control Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Student Digital Subscription Monetization
                  </h3>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
                    studentSubSettings.enabled
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  }`}>
                    {studentSubSettings.enabled ? 'Active & Enforced' : 'Disabled at Launch (Safe)'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                  Monetizes optional student digital customer features at <strong>500 RWF / month</strong> via Mobile Money (MTN MoMo &amp; Airtel Money).
                  Activation is controlled entirely by this platform feature flag without requiring a code release.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    restoStore.updateStudentSubscriptionSettings({
                      enabled: !studentSubSettings.enabled,
                    });
                  }}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer ${
                    studentSubSettings.enabled
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {studentSubSettings.enabled ? (
                    <>
                      <ToggleRight className="w-4 h-4" />
                      <span>Disable Student Monetization</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-4 h-4" />
                      <span>Activate Student Monetization</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setComplimentaryModalOpen(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Gift className="w-4 h-4" />
                  <span>Grant Complimentary</span>
                </button>
              </div>
            </div>

            {/* Policy & Architectural Safeguards Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Monthly Price</div>
                <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">500 RWF</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Integer-safe RWF currency</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Grace Period</div>
                <div className="text-sm font-bold text-amber-400 font-mono mt-0.5">3 Days (72 Hours)</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Digital features preserved</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Enforced Feature</div>
                <div className="text-sm font-bold text-white font-mono mt-0.5">Digital Plate Transfer</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Requires active / grace entitlement</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Physical Card Fallback</div>
                <div className="text-sm font-bold text-emerald-300 font-mono mt-0.5">100% Guaranteed</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Never blocked by subscription</div>
              </div>
            </div>
          </div>

          {/* Revenue & Subscription KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Total Subscriptions</div>
              <div className="text-xl font-bold text-white font-mono mt-1">
                {(state.customerSubscriptions || []).length}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Active / Complimentary</div>
              <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                {(state.customerSubscriptions || []).filter(
                  (s) => s.status === 'active' || s.status === 'complimentary'
                ).length}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-mono">In Grace Period</div>
              <div className="text-xl font-bold text-amber-400 font-mono mt-1">
                {(state.customerSubscriptions || []).filter((s) => s.status === 'grace_period').length}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Student MoMo Revenue</div>
              <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                {(state.studentSubscriptionPayments || [])
                  .filter((p) => p.status === 'verified')
                  .reduce((sum, p) => sum + p.amountRwf, 0)
                  .toLocaleString()}{' '}
                RWF
              </div>
            </div>
          </div>

          {/* Customer Subscriptions Ledger */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Customer Subscriptions &amp; Entitlements
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Authoritative record of student digital pass access, expiration dates, and grace periods.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {(state.customerSubscriptions || []).length} records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Member / Customer</th>
                    <th className="py-2.5 px-3">Restaurant</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Period End</th>
                    <th className="py-2.5 px-3">Grace End (+72h)</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {(state.customerSubscriptions || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                        No customer subscriptions recorded yet. Use &quot;Grant Complimentary&quot; or initiate a Mobile Money checkout to test.
                      </td>
                    </tr>
                  ) : (
                    (state.customerSubscriptions || []).map((sub) => {
                      const cust = state.customers.find((c) => c.id === sub.customerId);
                      return (
                        <tr key={sub.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-bold text-white">#{sub.memberNo} {cust?.name ? `(${cust.name})` : ''}</div>
                            <div className="text-[10px] font-mono text-slate-500">{sub.customerId}</div>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-400">{sub.restaurantCode}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              sub.status === 'active'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : sub.status === 'grace_period'
                                ? 'bg-amber-500/20 text-amber-400'
                                : sub.status === 'complimentary'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {sub.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-300">
                            {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-400">
                            {sub.gracePeriodEnd ? new Date(sub.gracePeriodEnd).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-400 capitalize">
                            {sub.paymentMethod || 'momo'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {sub.status === 'complimentary' && (
                              <button
                                onClick={() => {
                                  if (confirm(`Revoke complimentary access for #${sub.memberNo}?`)) {
                                    restoStore.revokeComplimentarySubscription(
                                      sub.customerId,
                                      'Revoked by Ephrem (Super Admin)',
                                      'Ephrem (Super Admin)'
                                    );
                                  }
                                }}
                                className="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Mobile Money Subscription Payments */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Mobile Money Verification &amp; Webhook Audit Log
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Idempotent payment records verified against MTN MoMo and Airtel Money callbacks.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {(state.studentSubscriptionPayments || []).length} transactions
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Internal Reference</th>
                    <th className="py-2.5 px-3">Provider</th>
                    <th className="py-2.5 px-3">Phone</th>
                    <th className="py-2.5 px-3">Member</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {(state.studentSubscriptionPayments || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                        No mobile money subscription checkout requests recorded.
                      </td>
                    </tr>
                  ) : (
                    (state.studentSubscriptionPayments || []).map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-800/40 transition-colors font-mono text-[11px]">
                        <td className="py-2.5 px-3 text-amber-300 font-bold">{pay.internalReference}</td>
                        <td className="py-2.5 px-3 text-slate-300 uppercase">{pay.provider}</td>
                        <td className="py-2.5 px-3 text-slate-300">{pay.phoneNumber}</td>
                        <td className="py-2.5 px-3 text-white font-bold">#{pay.memberNo}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-bold">{pay.amountRwf} RWF</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            pay.status === 'verified'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : pay.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {pay.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">
                          {new Date(pay.initiatedAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* COMPLIMENTARY STUDENT ACCESS MODAL */}
      {complimentaryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <Gift className="w-4 h-4" />
                <h3 className="text-sm font-bold text-white">Grant Complimentary Access</h3>
              </div>
              <button
                onClick={() => setComplimentaryModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <p className="text-slate-300 text-[11px] leading-relaxed">
              Grants temporary or permanent student digital subscription access with a mandatory audited reason.
              Does not create fabricated payment records.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCompError('');
                if (!compCustomerId) {
                  setCompError('Please select a student customer');
                  return;
                }
                if (!compReason.trim()) {
                  setCompError('A mandatory reason is required by platform policy');
                  return;
                }
                const res = restoStore.grantComplimentarySubscription({
                  customerId: compCustomerId,
                  reason: compReason.trim(),
                  durationDays: Number(compDays) || 30,
                  grantedBy: 'Ephrem (Super Admin)',
                });
                if (res.success) {
                  setComplimentaryModalOpen(false);
                  setCompCustomerId('');
                  setCompReason('');
                  setCompDays(30);
                } else {
                  setCompError(res.error || 'Failed to grant complimentary entitlement');
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Select Student Customer</label>
                <select
                  value={compCustomerId}
                  onChange={(e) => setCompCustomerId(e.target.value)}
                  required
                  className="w-full p-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-amber-500 outline-hidden"
                >
                  <option value="">-- Choose student customer --</option>
                  {state.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.memberNo} - {c.name} ({c.restaurantCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Duration (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={compDays}
                  onChange={(e) => setCompDays(parseInt(e.target.value) || 30)}
                  className="w-full p-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-amber-500 outline-hidden"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Mandatory Reason / Justification</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Student Guild President sponsorship, hardship scholarship waiver..."
                  value={compReason}
                  onChange={(e) => setCompReason(e.target.value)}
                  required
                  className="w-full p-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-amber-500 outline-hidden"
                />
              </div>

              {compError && (
                <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs">
                  {compError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors shadow-md cursor-pointer"
              >
                Grant Entitlement
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ONBOARD RESTAURANT MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Onboard New Restaurant</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-white text-xs">
                Close
              </button>
            </div>

            <form onSubmit={handleCreateRestaurant} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Restaurant Code</label>
                  <input
                    type="text"
                    required
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Plan</label>
                  <select
                    value={newPlanId}
                    onChange={(e) => setNewPlanId(e.target.value)}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white"
                  >
                    {state.plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Restaurant Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Legal Entity</label>
                <input
                  type="text"
                  required
                  value={newLegal}
                  onChange={(e) => setNewLegal(e.target.value)}
                  className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Phone</label>
                  <input
                    type="text"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Email</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-colors shadow-sm mt-2"
              >
                Create Tenant &amp; Generate Activation Code
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ISSUE LICENSE MODAL */}
      {licenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Issue Signed Ed25519 License</h3>
              <button onClick={() => setLicenseModalOpen(false)} className="text-slate-400 hover:text-white text-xs">
                Close
              </button>
            </div>

            <form onSubmit={handleIssueLicense} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Restaurant</label>
                <select
                  value={licRestaurantCode}
                  onChange={(e) => setLicRestaurantCode(e.target.value)}
                  className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white"
                >
                  {state.restaurants.map((r) => (
                    <option key={r.code} value={r.code}>{r.code} - {r.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Max Stations</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={licMaxStations}
                    onChange={(e) => setLicMaxStations(parseInt(e.target.value) || 1)}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Valid Days</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={licValidDays}
                    onChange={(e) => setLicValidDays(parseInt(e.target.value) || 30)}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Grace Days</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={licGraceDays}
                    onChange={(e) => setLicGraceDays(parseInt(e.target.value) || 7)}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm mt-2"
              >
                Sign &amp; Issue License
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
