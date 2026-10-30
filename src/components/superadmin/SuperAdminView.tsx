import React, { useState } from 'react';
import { Restaurant, Plan, License, SubscriptionPayment, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import { KinyarwandaTranslationStudio } from './KinyarwandaTranslationStudio';
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
  Sliders,
  Settings,
  Edit,
} from 'lucide-react';

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

  // Global Student Fee State
  const [globalStudentFeeInput, setGlobalStudentFeeInput] = useState<number>(studentSubSettings.priceRwf || 500);
  const [feedbackToast, setFeedbackToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedbackToast({ message, type });
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  // Create Restaurant State (With Custom Stations & Pricing Overrides)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newCode, setNewCode] = useState('RW03');
  const [newName, setNewName] = useState('Butare University Cafeteria');
  const [newLegal, setNewLegal] = useState('Southern Province Food Ltd');
  const [newPhone, setNewPhone] = useState('+250 788 445 667');
  const [newEmail, setNewEmail] = useState('admin@butarefood.rw');
  const [newAddress, setNewAddress] = useState('Huye Campus Road, Huye, Rwanda');
  const [newPlanId, setNewPlanId] = useState('plan_high_volume');
  const [newMaxStations, setNewMaxStations] = useState(3);
  const [newBasePrice, setNewBasePrice] = useState(140000);
  const [newExtraScanFee, setNewExtraScanFee] = useState(15000);
  const [newStudentSubPrice, setNewStudentSubPrice] = useState(500);
  const [newSinglePlatePrice, setNewSinglePlatePrice] = useState(1200);

  // When selected plan changes during onboarding, sync baseline pricing defaults
  const handleOnboardPlanChange = (planId: string) => {
    setNewPlanId(planId);
    const plan = state.plans.find((p) => p.id === planId);
    if (plan) {
      setNewBasePrice(plan.terms.basePriceRwf);
      setNewExtraScanFee(plan.terms.pricePerExtraScanPointRwf);
      setNewMaxStations(Math.max(1, plan.terms.maxScanPointsIncluded));
    }
  };

  // Edit Plan Pricing & Terms State
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editPlanBasePrice, setEditPlanBasePrice] = useState(0);
  const [editPlanExtraScanFee, setEditPlanExtraScanFee] = useState(0);
  const [editPlanPlateLimit, setEditPlanPlateLimit] = useState(2);
  const [editPlanWindowMinutes, setEditPlanWindowMinutes] = useState(120);
  const [editPlanGraceDays, setEditPlanGraceDays] = useState(7);
  const [editPlanMaxScanPoints, setEditPlanMaxScanPoints] = useState(2);

  const handleOpenEditPlan = (plan: Plan) => {
    setEditingPlan(plan);
    setEditPlanBasePrice(plan.terms.basePriceRwf);
    setEditPlanExtraScanFee(plan.terms.pricePerExtraScanPointRwf);
    setEditPlanPlateLimit(plan.terms.plateLimitPerWindow);
    setEditPlanWindowMinutes(plan.terms.servingWindowMinutes);
    setEditPlanGraceDays(plan.terms.graceDays);
    setEditPlanMaxScanPoints(plan.terms.maxScanPointsIncluded);
  };

  const handleSavePlanTerms = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    const updated = restoStore.updatePlan(editingPlan.id, {
      basePriceRwf: Number(editPlanBasePrice),
      pricePerExtraScanPointRwf: Number(editPlanExtraScanFee),
      plateLimitPerWindow: Number(editPlanPlateLimit),
      servingWindowMinutes: Number(editPlanWindowMinutes),
      graceDays: Number(editPlanGraceDays),
      maxScanPointsIncluded: Number(editPlanMaxScanPoints),
    });
    if (updated) {
      showToast(`Updated pricing terms for ${updated.name}!`);
      setEditingPlan(null);
    }
  };

  // Edit Restaurant Terms & Pricing State (Per-Restaurant Customization)
  const [editingResto, setEditingResto] = useState<Restaurant | null>(null);
  const [editRestoMaxStations, setEditRestoMaxStations] = useState(2);
  const [editRestoBasePrice, setEditRestoBasePrice] = useState(140000);
  const [editRestoExtraScanFee, setEditRestoExtraScanFee] = useState(15000);
  const [editRestoStudentSubPrice, setEditRestoStudentSubPrice] = useState(500);
  const [editRestoPlatePrice, setEditRestoPlatePrice] = useState(1200);

  const handleOpenEditResto = (resto: Restaurant) => {
    setEditingResto(resto);
    const plan = state.plans.find((p) => p.id === resto.planId) || state.plans[0];
    const lic = restoStore.getRestaurantLicense(resto.code);
    const customStudentFee = resto.studentSubscriptionPriceRwf ?? resto.termsOverride?.studentSubscriptionPriceRwf ?? studentSubSettings.priceRwf ?? 500;

    setEditRestoMaxStations(lic?.maxScanPoints || resto.termsOverride?.maxScanPointsIncluded || plan.terms.maxScanPointsIncluded || 2);
    setEditRestoBasePrice(resto.termsOverride?.basePriceRwf || plan.terms.basePriceRwf);
    setEditRestoExtraScanFee(resto.termsOverride?.pricePerExtraScanPointRwf || plan.terms.pricePerExtraScanPointRwf);
    setEditRestoStudentSubPrice(customStudentFee);
    setEditRestoPlatePrice(resto.defaultPlatePriceRwf || 1200);
  };

  const handleSaveRestoPricing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResto) return;
    restoStore.updateRestaurantPricingAndTerms(editingResto.code, {
      basePriceRwf: Number(editRestoBasePrice),
      pricePerExtraScanPointRwf: Number(editRestoExtraScanFee),
      studentSubscriptionPriceRwf: Number(editRestoStudentSubPrice),
      defaultPlatePriceRwf: Number(editRestoPlatePrice),
      maxScanPoints: Number(editRestoMaxStations),
    });
    showToast(`Updated custom pricing & ${editRestoMaxStations} stations quota for ${editingResto.name}!`);
    setEditingResto(null);
  };

  // Issue License State
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [licRestaurantCode, setLicRestaurantCode] = useState('RW01');
  const [licPlanId, setLicPlanId] = useState('plan_high_volume');
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
      licensedScanPoints: Number(newMaxStations),
      basePriceRwf: Number(newBasePrice),
      pricePerExtraScanPointRwf: Number(newExtraScanFee),
      studentSubscriptionPriceRwf: Number(newStudentSubPrice),
      singlePlatePriceRwf: Number(newSinglePlatePrice),
    });
    showToast(`Onboarded ${newName} with ${newMaxStations} licensed stations and custom pricing!`);
    setCreateModalOpen(false);
  };

  const handleIssueLicense = (e: React.FormEvent) => {
    e.preventDefault();
    restoStore.issueLicense({
      restaurantCode: licRestaurantCode,
      planId: licPlanId,
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
    showToast(`Issued signed license for ${licRestaurantCode} with ${licMaxStations} stations!`);
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
  const pendingCoSigns = (state.pendingApprovals || []).filter(
    (a) => a.platesRequested > 120 || a.requiresSuperAdminCoSign
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Toast Notification */}
      {feedbackToast && (
        <div
          className={`p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold shadow-xl transition-all ${
            feedbackToast.type === 'success'
              ? 'bg-emerald-950 border border-emerald-700 text-emerald-200'
              : 'bg-rose-950 border border-rose-700 text-rose-200'
          }`}
        >
          {feedbackToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedbackToast.message}</span>
        </div>
      )}

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
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3 text-sm font-medium text-slate-300">
        {[
          { id: 'restaurants', label: 'Tenants & Health' },
          { id: 'kinyarwanda_cms', label: '🇷🇼 Kinyarwanda & Translations CMS' },
          { id: 'student_subs', label: 'Student Monetization (500 RWF)' },
          {
            id: 'cosign_desk',
            label: `Dual-Control Co-Sign Desk (>120p)${
              pendingCoSigns.filter((a) => a.coSignStatus === 'pending_super_admin').length > 0
                ? ` (${pendingCoSigns.filter((a) => a.coSignStatus === 'pending_super_admin').length} Action Req)`
                : ''
            }`,
          },
          { id: 'plans', label: 'B2B Subscriptions & Limits' },
          { id: 'licenses', label: 'Signed Licences (.lic)' },
          { id: 'revenue', label: 'Platform Revenue' },
          { id: 'audit', label: 'Platform Audit Log' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSubTabChange(tab.id)}
            className={`px-3.5 py-2 rounded-xl transition-colors cursor-pointer ${
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
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileKey className="w-4 h-4 text-emerald-400" />
                <span>Time-Dependent Monthly Restaurant Licensing &amp; 7-Day Expiry Sentinel</span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Licenses automatically expire when the monthly period ends. Restaurants receive an automatic warning <strong>7 days before expiry</strong>, and if expired, both Boss and Scanner portals are enforced to renew before continuing operation.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-300 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Restaurant</th>
                  <th className="py-3 px-4">Stations &amp; Pricing</th>
                  <th className="py-3 px-4">License &amp; Operational Status</th>
                  <th className="py-3 px-4">Time Remaining &amp; Expiry</th>
                  <th className="py-3 px-4">Super Admin License Control</th>
                  <th className="py-3 px-4 text-right">Target Scope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {state.restaurants.map((resto) => {
                  const licStatus = restoStore.getRestaurantLicenseStatus(resto.code);
                  const lic = licStatus.license;
                  const isCurrent = state.currentRestaurantCode === resto.code;
                  const customStudentFee = resto.studentSubscriptionPriceRwf ?? resto.termsOverride?.studentSubscriptionPriceRwf ?? studentSubSettings.priceRwf ?? 500;
                  const stationCount = lic?.maxScanPoints || resto.termsOverride?.maxScanPointsIncluded || 2;
                  return (
                    <tr key={resto.code} className="hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-sm">{resto.name}</div>
                        <div className="text-slate-400 font-mono text-[11px]">
                          Code: {resto.code} · {resto.phone}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-white">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{stationCount} Stations Licensed</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Student Sub: <strong className="text-emerald-400">{customStudentFee.toLocaleString()} RWF</strong>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Single Plate: <strong className="text-slate-300">{(resto.defaultPlatePriceRwf || 1200).toLocaleString()} RWF</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenEditResto(resto)}
                          className="mt-1.5 px-2.5 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900 border border-amber-700/80 text-amber-300 font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Sliders className="w-3 h-3 text-amber-400" />
                          <span>Customize Pricing &amp; Stations</span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            licStatus.status === 'active'
                              ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                              : licStatus.status === 'expiring_soon'
                              ? 'bg-amber-950 border-amber-600 text-amber-300 animate-pulse'
                              : 'bg-rose-950 border-rose-700 text-rose-300'
                          }`}
                        >
                          {licStatus.status === 'active'
                            ? 'ACTIVE · OPERATIONAL'
                            : licStatus.status === 'expiring_soon'
                            ? `WARNING · ${licStatus.daysRemaining}D LEFT`
                            : 'EXPIRED · LOCKED'}
                        </span>
                        <div className="text-slate-400 text-[11px] mt-1 capitalize">
                          {resto.planId.replace('_', ' ')}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {lic ? (
                          <div>
                            <div
                              className={`font-bold ${
                                licStatus.isExpired
                                  ? 'text-rose-400'
                                  : licStatus.isExpiringSoon
                                  ? 'text-amber-300'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {lic.id} ({licStatus.isExpired ? '0 days left' : `${licStatus.daysRemaining} days left`})
                            </div>
                            <div className="text-slate-400 text-[11px]">
                              Valid until {new Date(lic.validUntil).toLocaleDateString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-rose-400 font-bold">Unlicensed (Locked)</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              restoStore.renewRestaurantLicense({
                                restaurantCode: resto.code,
                                validDays: 30,
                              })
                            }
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>{licStatus.isExpired ? 'Activate 30d License' : 'Renew +30d'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => restoStore.setRestaurantLicenseRemainingDays(resto.code, 5)}
                            title="Set license to 5 days remaining to trigger 7-day renewal warning"
                            className="px-2.5 py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-700 text-amber-300 font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            Warn (5d left)
                          </button>

                          {!licStatus.isExpired && (
                            <button
                              type="button"
                              onClick={() => restoStore.setRestaurantLicenseRemainingDays(resto.code, -1)}
                              title="Immediately expire license and lock Boss & Scanner portals until renewed"
                              className="px-2.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold text-[11px] transition-colors cursor-pointer"
                            >
                              Expire Now
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => restoStore.setRestaurantCode(resto.code)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            isCurrent
                              ? 'bg-emerald-950 border border-emerald-600 text-emerald-400'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                        >
                          {isCurrent ? 'Active Scope' : 'Select Scope'}
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

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <span className="text-[11px] text-slate-400 font-mono">
                  Includes <strong>{p.terms.maxScanPointsIncluded}</strong> Station{p.terms.maxScanPointsIncluded === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenEditPlan(p)}
                  className="px-3 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900 border border-amber-700/80 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Plan Terms &amp; Pricing</span>
                </button>
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
                  Monetizes optional student digital customer features at <strong>{studentSubSettings.priceRwf.toLocaleString()} RWF / month</strong> via Mobile Money (MTN MoMo &amp; Airtel Money).
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

            {/* Global Pricing Configuration Card */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Platform-Wide Student Subscription Monthly Fee</span>
                </div>
                <p className="text-xs text-slate-400">
                  Default fee charged to students across cafeterias for optional digital pass access. Individual cafeterias can also be customized with specific per-restaurant rates.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={globalStudentFeeInput}
                    onChange={(e) => setGlobalStudentFeeInput(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-32 py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold text-sm focus:border-emerald-500 outline-hidden pr-12"
                  />
                  <span className="absolute right-2.5 top-2 text-[11px] text-slate-400 font-mono font-bold">RWF</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    restoStore.updateStudentSubscriptionSettings({ priceRwf: Number(globalStudentFeeInput) });
                    showToast(`Updated default student subscription fee to ${globalStudentFeeInput.toLocaleString()} RWF/mo!`);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
                >
                  Save Fee
                </button>
              </div>
            </div>

            {/* Policy & Architectural Safeguards Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Monthly Price</div>
                <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">{studentSubSettings.priceRwf.toLocaleString()} RWF</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Integer-safe RWF currency</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Grace Period</div>
                <div className="text-sm font-bold text-amber-400 font-mono mt-0.5">3 Days (72 Hours)</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Digital features preserved</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Enforced Scope</div>
                <div className="text-sm font-bold text-white font-mono mt-0.5">All Customer Portal Features</div>
                <div className="text-[10px] text-slate-500 mt-0.5">QR, Balance, Transfers, History &amp; Alerts</div>
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

      {/* 8. DUAL-CONTROL CRYPTOGRAPHIC CO-SIGNING DESK (> 120 PLATES / 2 MONTHS) */}
      {activeSubTab === 'cosign_desk' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-900 border border-indigo-500/40 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white tracking-tight">
                Dual-Control High-Liability Co-Signing Desk (&gt; 120 Plates / 2-Month Cap)
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase font-bold">
                Platform Security Policy
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              Meal balances exceeding <strong>120 plates</strong> represent substantial cafeteria liabilities (&gt; 130,000 RWF).
              To eliminate cashier collusion, fraudulent Mobile Money SMS entry, or rogue administrative adjustments,
              the ledger credit remains pending until <strong>both</strong> the Restaurant Admin and Super Admin cryptographically co-sign the entry.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  High-Value Patron Requests Awaiting / Requiring Dual Control
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Showing all patron top-ups &gt; 120 plates across all connected campus cafeterias.
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-indigo-300 font-bold">
                {pendingCoSigns.length} recorded
              </span>
            </div>

            {pendingCoSigns.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-white">All Clear — No High-Value Co-Signs Pending</div>
                <div className="text-xs text-slate-400 max-w-md mx-auto">
                  No top-ups exceeding 120 plates require cryptographic countersignature at this time.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-3">Cafeteria</th>
                      <th className="py-3 px-3">Patron &amp; Phone</th>
                      <th className="py-3 px-3">Volume &amp; Cash Intake</th>
                      <th className="py-3 px-3">MoMo Reference</th>
                      <th className="py-3 px-3">Status &amp; Verification</th>
                      <th className="py-3 px-3 text-right">Super Admin Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {pendingCoSigns.map((appr) => {
                      const isReadyForCoSign = appr.coSignStatus === 'pending_super_admin';
                      const isCoSigned = appr.coSignStatus === 'co_signed';
                      return (
                        <tr key={appr.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-3 text-white font-mono">{appr.restaurantCode}</td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-white">{appr.customerName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">#{appr.memberNo} · {appr.customerPhone}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-amber-400 font-mono font-bold text-sm">+{appr.platesRequested} plates</span>
                            <div className="text-slate-300 font-mono text-[11px]">{appr.amountRwf.toLocaleString()} RWF</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-mono text-emerald-400 text-xs font-bold">{appr.paymentReference}</div>
                            <div className="text-slate-400 text-[10px] uppercase">{appr.paymentMethod}</div>
                          </td>
                          <td className="py-3 px-3">
                            {isCoSigned ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" /> Co-Signed &amp; Committed
                              </span>
                            ) : isReadyForCoSign ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                                Verified by Boss · Awaiting Co-Sign
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                                Awaiting Boss Verification First
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {isReadyForCoSign ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const res = restoStore.coSignPendingRequest(appr.id);
                                  if (res.success) {
                                    alert(`Successfully cryptographically co-signed ${appr.platesRequested} plates for #${appr.memberNo}! Ledger credit committed.`);
                                  } else {
                                    alert(res.error || 'Failed to co-sign request.');
                                  }
                                }}
                                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
                              >
                                Cryptographically Co-Sign
                              </button>
                            ) : isCoSigned ? (
                              <span className="text-slate-500 font-mono text-[11px]">{appr.coSignature?.slice(0, 16)}...</span>
                            ) : (
                              <span className="text-slate-500 text-xs italic">Boss must approve first</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. KINYARWANDA & TRANSLATION STUDIO (CMS) */}
      {activeSubTab === 'kinyarwanda_cms' && (
        <KinyarwandaTranslationStudio currentLanguage={language} />
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
                    onChange={(e) => handleOnboardPlanChange(e.target.value)}
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

              {/* Customizable Pricing & Station Quota */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Licensed Stations &amp; Pricing Customization</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 block mb-1 font-semibold">
                      Licensed Stations *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      required
                      value={newMaxStations}
                      onChange={(e) => setNewMaxStations(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                    <span className="text-[10px] text-slate-500">1 station = 1 cashier account</span>
                  </div>

                  <div>
                    <label className="text-slate-300 block mb-1 font-semibold">
                      Monthly Base Price (RWF) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={5000}
                      required
                      value={newBasePrice}
                      onChange={(e) => setNewBasePrice(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                    <span className="text-[10px] text-slate-500">Base monthly fee</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-slate-300 block mb-1 font-semibold">
                      Extra Station
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={newExtraScanFee}
                      onChange={(e) => setNewExtraScanFee(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 block mb-1 font-semibold">
                      Student Sub
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={newStudentSubPrice}
                      onChange={(e) => setNewStudentSubPrice(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 block mb-1 font-semibold">
                      Single Plate
                    </label>
                    <input
                      type="number"
                      min={100}
                      step={50}
                      value={newSinglePlatePrice}
                      onChange={(e) => setNewSinglePlatePrice(Math.max(100, parseInt(e.target.value) || 1200))}
                      className="w-full p-2 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-colors shadow-sm mt-2 cursor-pointer"
              >
                Onboard Tenant &amp; Issue {newMaxStations}-Station License
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT RESTAURANT PRICING & STATIONS */}
      {editingResto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>Customize Pricing &amp; Stations for {editingResto.name}</span>
              </h3>
              <button onClick={() => setEditingResto(null)} className="text-slate-400 hover:text-white text-xs cursor-pointer">
                Close
              </button>
            </div>

            <form onSubmit={handleSaveRestoPricing} className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                <div className="font-mono text-xs font-bold text-white">Code: {editingResto.code} · Plan: {editingResto.planId}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Customize pricing overrides and licensed stations quota for this client.</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Licensed Stations Quota *</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={editRestoMaxStations}
                    onChange={(e) => setEditRestoMaxStations(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2.5 rounded bg-slate-950 border border-slate-700 text-white font-mono focus:border-amber-500 outline-hidden"
                  />
                  <span className="text-[10px] text-slate-500">1 station = 1 cashier POS</span>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Monthly Base Fee (RWF) *</label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    required
                    value={editRestoBasePrice}
                    onChange={(e) => setEditRestoBasePrice(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2.5 rounded bg-slate-950 border border-slate-700 text-white font-mono focus:border-amber-500 outline-hidden"
                  />
                  <span className="text-[10px] text-slate-500">Contract base rate</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Extra Station Fee</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={editRestoExtraScanFee}
                    onChange={(e) => setEditRestoExtraScanFee(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono focus:border-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Student Sub (RWF)</label>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={editRestoStudentSubPrice}
                    onChange={(e) => setEditRestoStudentSubPrice(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono focus:border-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Plate Price (RWF)</label>
                  <input
                    type="number"
                    min={100}
                    step={50}
                    value={editRestoPlatePrice}
                    onChange={(e) => setEditRestoPlatePrice(Math.max(100, parseInt(e.target.value) || 1200))}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono focus:border-amber-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingResto(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PLAN PRICING & TERMS */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit className="w-4 h-4 text-emerald-400" />
                <span>Edit Plan Terms &amp; Pricing: {editingPlan.name}</span>
              </h3>
              <button onClick={() => setEditingPlan(null)} className="text-slate-400 hover:text-white text-xs cursor-pointer">
                Close
              </button>
            </div>

            <form onSubmit={handleSavePlanTerms} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Monthly Base Price (RWF) *</label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    required
                    value={editPlanBasePrice}
                    onChange={(e) => setEditPlanBasePrice(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2.5 rounded bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Extra Station Fee (RWF) *</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    required
                    value={editPlanExtraScanFee}
                    onChange={(e) => setEditPlanExtraScanFee(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2.5 rounded bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Stations Included</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={editPlanMaxScanPoints}
                    onChange={(e) => setEditPlanMaxScanPoints(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Serving Window (min)</label>
                  <input
                    type="number"
                    min={10}
                    max={360}
                    required
                    value={editPlanWindowMinutes}
                    onChange={(e) => setEditPlanWindowMinutes(Math.max(10, parseInt(e.target.value) || 120))}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Plate Limit / Window</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={editPlanPlateLimit}
                    onChange={(e) => setEditPlanPlateLimit(Math.max(1, parseInt(e.target.value) || 2))}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md cursor-pointer"
                >
                  Save Plan Terms
                </button>
              </div>
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
              <button onClick={() => setLicenseModalOpen(false)} className="text-slate-400 hover:text-white text-xs cursor-pointer">
                Close
              </button>
            </div>

            <form onSubmit={handleIssueLicense} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
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
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Plan</label>
                  <select
                    value={licPlanId}
                    onChange={(e) => setLicPlanId(e.target.value)}
                    className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white"
                  >
                    {state.plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
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
