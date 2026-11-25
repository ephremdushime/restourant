import React, { useState } from 'react';
import { Restaurant, UserRole, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { RestaurantDirectoryGrid } from './RestaurantDirectoryGrid';
import { ScannerHeroStage } from '../common/ScannerHeroStage';
import { ScanningPersonBackground } from '../common/ScanningPersonBackground';
import {
  Utensils,
  ShieldCheck,
  Zap,
  Smartphone,
  CreditCard,
  Building2,
  Users,
  QrCode,
  ArrowRight,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  Lock,
  Phone,
  Mail,
  Clock,
  ShieldAlert,
  Server,
  UserPlus,
  LogIn,
  Layers,
  Search,
  ExternalLink,
  MessageSquare,
  X,
  Check,
} from 'lucide-react';

interface LandingPageViewProps {
  onSelectRolePortal: (role: UserRole, restoCode?: string) => void;
  onSelectRegister: (restoCode?: string) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  onSelectRolePortal,
  onSelectRegister,
  language,
  onLanguageChange,
  theme,
  onToggleTheme,
}) => {
  const state = restoStore.getState();
  const restaurants = state.restaurants;
  const currentResto = restoStore.getCurrentRestaurant() || restaurants[0];

  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [partnerFormData, setPartnerFormData] = useState({
    canteenName: '',
    contactPerson: '',
    phone: '',
    email: '',
    cityCampus: '',
    estimatedDiners: '500-1000',
  });
  const [partnerSubmitted, setPartnerSubmitted] = useState(false);

  const handlePartnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPartnerSubmitted(true);
    setTimeout(() => {
      setPartnerSubmitted(false);
      setIsPartnerModalOpen(false);
      setPartnerFormData({
        canteenName: '',
        contactPerson: '',
        phone: '',
        email: '',
        cityCampus: '',
        estimatedDiners: '500-1000',
      });
    }, 2800);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white font-sans overflow-x-hidden">
      {/* 1. COMMERCIAL HERO SECTION */}
      <section className="relative pt-6 pb-16 sm:pb-24 px-4 sm:px-6 lg:px-8 border-b border-slate-800/80 overflow-hidden">
        {/* Subtle Animated Scanner Light Backdrop */}
        <ScanningPersonBackground />

        <div className="relative z-10 max-w-7xl mx-auto space-y-12">
          {/* Top Pill & Announcement */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>THE SMART CAMPUS &amp; CORPORATE DINING PLATFORM</span>
              <span className="hidden sm:inline text-slate-500">|</span>
              <span className="hidden sm:inline font-mono text-[11px] text-slate-300">RWANDA 🇷🇼</span>
            </div>

            {/* Quick Portal Switcher Pills */}
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectRolePortal('customer')}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Student Portal</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectRolePortal('restaurant_admin')}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span>Restaurant Boss</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectRolePortal('stand_staff')}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                <span>Buffet Scanner POS</span>
              </button>
            </div>
          </div>

          {/* Main Hero Split Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Column: Value Proposition & CTAs */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1]">
                Dine in <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">0.3 Seconds.</span>
                <br />
                Zero Queues. Zero Cash Leakage.
              </h1>

              <p className="text-sm sm:text-base lg:text-lg text-slate-300 max-w-2xl leading-relaxed">
                RestoPass replaces manual paper tickets and slow cash handling with optical, tamper-proof prepaid meal passes. Students tap and eat; university canteen managers track every single plate, payment, and Mobile Money reconciliation in real time.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
                <a
                  href="#directory"
                  className="py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-950/40 cursor-pointer"
                >
                  <Building2 className="w-4 h-4" />
                  <span>Find Your Campus Cafeteria</span>
                  <ArrowRight className="w-4 h-4" />
                </a>

                <button
                  type="button"
                  onClick={() => onSelectRegister(currentResto?.code)}
                  className="py-3.5 px-6 rounded-2xl bg-slate-900 hover:bg-slate-850 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all border border-slate-700/80 shadow-md cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-emerald-400" />
                  <span>Register for Meal Pass</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPartnerModalOpen(true)}
                  className="py-3.5 px-5 rounded-2xl bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all border border-slate-800 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Onboard Your Canteen</span>
                </button>
              </div>

              {/* Trust Metric Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-slate-800/80">
                <div className="space-y-0.5">
                  <div className="text-xl sm:text-2xl font-black text-white font-mono flex items-center gap-1">
                    <span>&lt;0.3s</span>
                    <Zap className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-[11px] text-slate-400">Scan-to-Dine Speed</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xl sm:text-2xl font-black text-emerald-300 font-mono">100%</div>
                  <div className="text-[11px] text-slate-400">Anti-Fraud HMAC</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xl sm:text-2xl font-black text-white font-mono">0 SMS</div>
                  <div className="text-[11px] text-slate-400">Zero Telecom Costs</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xl sm:text-2xl font-black text-teal-300 font-mono">Offline</div>
                  <div className="text-[11px] text-slate-400">Buffet Resiliency</div>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Scanner Hero Stage Showcase */}
            <div className="lg:col-span-5 flex flex-col justify-center">
              <ScannerHeroStage
                title="Optical Pass Verification"
                subtitle="Students show their phone QR or tap their PVC card. The scanner verifies cryptographic signatures in under 300 milliseconds."
                facilityName={currentResto?.name || 'Kigali Campus Resto'}
                facilityCode={currentResto?.code || 'RW01'}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. LIVE DINING FACILITY DIRECTORY SECTION */}
      <section id="directory" className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
            <Building2 className="w-3.5 h-3.5" />
            <span>CAMPUS DINING DIRECTORY</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Find Your Campus Cafeteria
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Select your university restaurant or partner dining facility below to register for a prepaid meal pass, view daily package rates, or log in to your dining dashboard.
          </p>
        </div>

        {/* Live Restaurant Directory Component */}
        <RestaurantDirectoryGrid
          restaurants={restaurants}
          onSelectRegister={(code) => onSelectRegister(code)}
          onSelectLogin={(code) => onSelectRolePortal('customer', code)}
        />
      </section>

      {/* 3. HOW IT WORKS 4-STEP WALKTHROUGH */}
      <section id="how-it-works" className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/60 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-400 text-xs font-bold">
              <Layers className="w-3.5 h-3.5" />
              <span>THE 4-STEP PASS LIFECYCLE</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Simple for Students. Ironclad for Managers.
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              From online registration to the first hot meal in under 3 minutes with zero SMS reliance.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 hover:border-emerald-500/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-mono font-black text-base shadow-inner">
                01
              </div>
              <h3 className="text-base font-bold text-white">Register Online</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Choose your campus facility from the directory or scan the table QR code. Fill in your name, student ID, and phone number in 30 seconds.
              </p>
              <div className="text-[10px] font-mono text-emerald-400 font-semibold bg-slate-950 p-2 rounded-xl border border-slate-800">
                Status: Pending Reception Payment
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 hover:border-teal-500/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center font-mono font-black text-base shadow-inner">
                02
              </div>
              <h3 className="text-base font-bold text-white">Visit Reception Desk</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pick your meal pack (30, 60, or 120 plates). Pay via Cash or MTN Mobile Money. Receptionist snaps your photo and issues 3 immediate grace plates.
              </p>
              <div className="text-[10px] font-mono text-teal-300 font-semibold bg-slate-950 p-2 rounded-xl border border-slate-800">
                Bonus: 3 Instant Grace Plates
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 hover:border-cyan-500/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-mono font-black text-base shadow-inner">
                03
              </div>
              <h3 className="text-base font-bold text-white">Set Your Private PIN</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Reception gives you a single-use 6-digit code. Enter it at sign in to establish your confidential 6-digit PIN. No SMS fees or SIM-swap risks.
              </p>
              <div className="text-[10px] font-mono text-cyan-300 font-semibold bg-slate-950 p-2 rounded-xl border border-slate-800">
                Scrypt N=16384 Encryption
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 hover:border-emerald-500/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-mono font-black text-base shadow-inner">
                04
              </div>
              <h3 className="text-base font-bold text-white">Tap &amp; Dine in 0.3s</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Show your optical QR pass on your phone screen or tap your physical printed PVC badge at the buffet scanner. Eat without waiting in lines.
              </p>
              <div className="text-[10px] font-mono text-emerald-300 font-semibold bg-slate-950 p-2 rounded-xl border border-slate-800">
                HMAC-SHA256 Token Verifier
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FOR RESTAURANT & CANTEEN OPERATORS */}
      <section id="business" className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
              <Utensils className="w-3.5 h-3.5" />
              <span>FOR CANTEENS &amp; UNIVERSITY OPERATORS</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Transform Your Cafeteria into a High-Velocity, Cashless Hub.
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Traditional paper meal cards and cash queues lead to lost revenue, counterfeit cards, and long waiting lines. RestoPass gives dining operators complete operational control.
            </p>

            <div className="space-y-3.5">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">Zero Food &amp; Cash Leakage</h4>
                  <p className="text-xs text-slate-400">
                    Double-entry ledger records every single plate deduction atomically. Staff cannot issue unrecorded plates.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">Two-Person Control for Bulk Credits</h4>
                  <p className="text-xs text-slate-400">
                    High-volume package purchases (&gt; 120 plates) require dual authorization from the Restaurant Boss and Super Admin co-signer.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">Works 100% Offline When Wi-Fi Drops</h4>
                  <p className="text-xs text-slate-400">
                    Scanners verify offline HMAC signatures and securely queue scans in IndexedDB, syncing automatically when connection returns.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPartnerModalOpen(true)}
              className="py-3 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm transition-all shadow-lg cursor-pointer"
            >
              Request Onboarding Demo for Your Facility &rarr;
            </button>
          </div>

          {/* Right Card: Executive Dashboard Snapshot */}
          <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold font-mono">
                  RP
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Executive Sales &amp; Plate Audit</div>
                  <div className="text-[10px] text-slate-400">Real-Time Multi-Stand Telemetry</div>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/20">
                LIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80">
                <div className="text-xs text-slate-400">Today&apos;s Plates Served</div>
                <div className="text-2xl font-black text-white font-mono mt-1">1,482</div>
                <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">+14% vs yesterday</div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80">
                <div className="text-xs text-slate-400">MoMo &amp; Cash Collected</div>
                <div className="text-2xl font-black text-emerald-300 font-mono mt-1">1,704,300</div>
                <div className="text-[10px] text-slate-400 font-mono">RWF Net Revenue</div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-white">
                <span>Active Scanner Terminals</span>
                <span className="text-emerald-400 font-mono">4 Online</span>
              </div>
              <div className="text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Stand #1 (Main Buffet Hall)</span>
                  <span className="font-mono text-slate-300">620 scans · 0.26s avg</span>
                </div>
                <div className="flex justify-between">
                  <span>Stand #2 (Express Counter)</span>
                  <span className="font-mono text-slate-300">485 scans · 0.28s avg</span>
                </div>
                <div className="flex justify-between">
                  <span>Stand #3 (Faculty Annex)</span>
                  <span className="font-mono text-slate-300">377 scans · 0.31s avg</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectRolePortal('restaurant_admin')}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all border border-slate-700 cursor-pointer flex items-center justify-center gap-2"
            >
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>Open Restaurant Boss Management Portal</span>
            </button>
          </div>
        </div>
      </section>

      {/* 5. COMMERCIAL FOOTER */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-800 bg-slate-950 text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white font-black text-base">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs font-mono">
                RP
              </div>
              <span>RestoPass</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                OS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Engineered by <strong>BESTIE COMPANIES LTD</strong>. High-speed digital meal pass infrastructure for institutions, universities, and commercial cafeterias in Rwanda.
            </p>
          </div>

          <div className="space-y-2">
            <div className="font-bold text-white text-xs uppercase tracking-wider">Dining Facilities</div>
            <ul className="space-y-1.5 text-[11px]">
              {restaurants.map((r) => (
                <li key={r.code}>
                  <button
                    type="button"
                    onClick={() => onSelectRegister(r.code)}
                    className="hover:text-emerald-300 transition-colors cursor-pointer text-left"
                  >
                    {r.name} ({r.code})
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <div className="font-bold text-white text-xs uppercase tracking-wider">Security &amp; Standards</div>
            <ul className="space-y-1.5 text-[11px]">
              <li>HMAC-SHA256 Token Signing</li>
              <li>Scrypt N=16384 PIN Storage</li>
              <li>Encrypted Google Drive Backups</li>
              <li>Offline Replay Guard Protected</li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="font-bold text-white text-xs uppercase tracking-wider">Authorized Portals</div>
            <div className="flex flex-col gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => onSelectRolePortal('customer')}
                className="hover:text-emerald-300 text-left transition-colors cursor-pointer"
              >
                &bull; Student / Diner Portal
              </button>
              <button
                type="button"
                onClick={() => onSelectRolePortal('restaurant_admin')}
                className="hover:text-emerald-300 text-left transition-colors cursor-pointer"
              >
                &bull; Restaurant Boss Admin
              </button>
              <button
                type="button"
                onClick={() => onSelectRolePortal('stand_staff')}
                className="hover:text-emerald-300 text-left transition-colors cursor-pointer"
              >
                &bull; Scanner POS Station
              </button>
              <button
                type="button"
                onClick={() => onSelectRolePortal('super_admin')}
                className="hover:text-emerald-300 text-left transition-colors cursor-pointer"
              >
                &bull; Super Admin Console
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
          <div>&copy; {new Date().getFullYear()} BESTIE COMPANIES LTD · All Rights Reserved.</div>
          <div className="flex items-center gap-4 text-slate-500">
            <span>Kigali, Rwanda</span>
            <span>·</span>
            <span>contact@restopass.rw</span>
          </div>
        </div>
      </footer>

      {/* 6. PARTNER ONBOARDING DEMO REQUEST MODAL */}
      {isPartnerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
            <button
              type="button"
              onClick={() => setIsPartnerModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {partnerSubmitted ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-white">Inquiry Received!</h3>
                <p className="text-xs text-slate-300 max-w-sm mx-auto">
                  Thank you! Our operations team at Bestie Companies Ltd will contact you within 24 hours to schedule your cafeteria onboarding and scanner deployment.
                </p>
              </div>
            ) : (
              <form onSubmit={handlePartnerSubmit} className="space-y-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                    CANTEEN ONBOARDING INQUIRY
                  </div>
                  <h3 className="text-lg font-black text-white">Deploy RestoPass in Your Canteen</h3>
                  <p className="text-xs text-slate-400">
                    Join university cafeterias across Rwanda eliminating food lines and cash leakage.
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Cafeteria / Dining Hall Name *
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. University Campus Canteen"
                      value={partnerFormData.canteenName}
                      onChange={(e) => setPartnerFormData({ ...partnerFormData, canteenName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-white outline-hidden"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Contact Name *</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. Jean Damascene"
                        value={partnerFormData.contactPerson}
                        onChange={(e) => setPartnerFormData({ ...partnerFormData, contactPerson: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-white outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Phone Number *</label>
                      <input
                        required
                        type="tel"
                        placeholder="e.g. 0788 123 456"
                        value={partnerFormData.phone}
                        onChange={(e) => setPartnerFormData({ ...partnerFormData, phone: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-white outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">City or Campus *</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. Huye / Kigali"
                        value={partnerFormData.cityCampus}
                        onChange={(e) => setPartnerFormData({ ...partnerFormData, cityCampus: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-white outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Estimated Daily Diners</label>
                      <select
                        value={partnerFormData.estimatedDiners}
                        onChange={(e) => setPartnerFormData({ ...partnerFormData, estimatedDiners: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-white outline-hidden"
                      >
                        <option value="100-500">100 - 500 Diners</option>
                        <option value="500-1000">500 - 1,000 Diners</option>
                        <option value="1000-2500">1,000 - 2,500 Diners</option>
                        <option value="2500+">2,500+ Large Campus</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPartnerModalOpen(false)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs transition-all shadow-md cursor-pointer"
                  >
                    Submit Request &rarr;
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
