import React from 'react';
import { 
  ShieldCheck, 
  Zap, 
  QrCode, 
  CheckCircle2, 
  Clock, 
  WifiOff, 
  Sparkles, 
  Smartphone 
} from 'lucide-react';

export interface ScannerHeroStageProps {
  title?: string;
  subtitle?: string;
  facilityName?: string;
  facilityCode?: string;
}

export const ScannerHeroStage: React.FC<ScannerHeroStageProps> = ({
  title = "Fast-Pass Campus Dining",
  subtitle = "Register your profile, confirm your meal plan at reception, and tap your phone or PVC card to dine in seconds.",
  facilityName = "Kigali Campus Resto",
  facilityCode = "RW01"
}) => {
  return (
    <div className="relative w-full h-full flex flex-col justify-between p-6 sm:p-8 lg:p-10 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/40 border border-slate-800/80 shadow-2xl overflow-hidden min-h-[520px] lg:min-h-[640px]">
      {/* 1. Ambient Background Glows */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div 
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(52, 211, 153, 0.4) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(52, 211, 153, 0.4) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px'
        }}
      />

      {/* 2. Top Header Branding & Facility Badge */}
      <div className="relative z-10 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[11px] font-bold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            OPTICAL SCANNER TERMINAL
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 font-mono text-[11px] font-bold">
            {facilityCode}
          </span>
        </div>

        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
          {title}
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
          {subtitle}
        </p>
      </div>

      {/* 3. The Animated Scanner & Person Visual Centerpiece */}
      <div className="relative z-10 my-4 sm:my-6 flex flex-col items-center justify-center">
        {/* Responsive Vector Illustration Canvas */}
        <div className="relative w-full max-w-[460px] aspect-[16/11]">
          <svg 
            viewBox="0 0 540 360" 
            className="w-full h-full drop-shadow-2xl"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="heroLaserGrad" x1="0%" y1="0%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
                <stop offset="60%" stopColor="#10b981" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.01" />
              </linearGradient>

              <linearGradient id="heroLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#a7f3d0" stopOpacity="1" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.2" />
              </linearGradient>

              <linearGradient id="patronSkinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#475569" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>

              <filter id="heroGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* A. Scanner Station Pedestal on Left */}
            <g className="scanner-kiosk">
              {/* Floor Shadow */}
              <ellipse cx="140" cy="320" rx="65" ry="12" fill="#000000" opacity="0.6" />
              
              {/* Stand Base */}
              <ellipse cx="140" cy="315" rx="55" ry="10" fill="#0f172a" stroke="#334155" strokeWidth="2" />
              <path d="M 115 315 L 125 180 L 155 180 L 165 315 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
              
              {/* Stem LED accent strip */}
              <rect x="138" y="200" width="4" height="90" rx="2" fill="#10b981" opacity="0.7">
                <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2s" repeatCount="indefinite" />
              </rect>

              {/* Angled Scanner Head Unit */}
              <g transform="translate(140, 160)">
                <path d="M -30 -25 L 30 -25 L 42 28 L -20 28 Z" fill="#090d16" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.4" />
                {/* Scanner Optical Glass */}
                <path d="M -18 -18 L 22 -18 L 32 20 L -10 20 Z" fill="#022c22" stroke="#10b981" strokeWidth="2" />
                
                {/* Camera Lens */}
                <circle cx="10" cy="2" r="10" fill="#064e3b" stroke="#34d399" strokeWidth="1.5" />
                <circle cx="10" cy="2" r="5" fill="#10b981" filter="url(#heroGlow)">
                  <animate attributeName="r" values="4;6;4" dur="1.8s" repeatCount="indefinite" />
                </circle>

                {/* Status LED Beacon */}
                <circle cx="30" cy="-18" r="3.5" fill="#10b981" filter="url(#heroGlow)">
                  <animate attributeName="fill" values="#10b981;#34d399;#10b981" dur="1s" repeatCount="indefinite" />
                </circle>
              </g>
            </g>

            {/* B. Patron Holding Smartphone on Right */}
            <g className="patron-silhouette">
              {/* Subtle Natural Breathing Motion */}
              <g>
                <animateTransform attributeName="transform" type="translate" values="0 0; 0 -3; 0 0" dur="3.5s" repeatCount="indefinite" />
                
                {/* Floor Shadow */}
                <ellipse cx="380" cy="320" rx="80" ry="14" fill="#000000" opacity="0.6" />

                {/* Torso & Shoulder Profile */}
                <path 
                  d="M 330 320 
                     L 345 220 
                     C 350 190, 370 170, 395 160 
                     C 430 145, 470 155, 485 190 
                     L 505 320 Z" 
                  fill="url(#patronSkinGrad)" 
                  stroke="#475569" 
                  strokeWidth="1.5" 
                  strokeOpacity="0.4" 
                />

                {/* Head & Neck */}
                <path 
                  d="M 405 160 L 405 125 C 405 110, 400 95, 410 75 C 420 50, 450 50, 460 75 C 468 95, 462 110, 455 125 L 455 160 Z" 
                  fill="url(#patronSkinGrad)" 
                  stroke="#64748b" 
                  strokeWidth="1" 
                  strokeOpacity="0.3" 
                />

                {/* Arm Reaching Forward Holding Phone */}
                <path d="M 370 185 C 330 205, 290 195, 260 170" fill="none" stroke="url(#patronSkinGrad)" strokeWidth="32" strokeLinecap="round" />
                <path d="M 270 175 L 225 135" fill="none" stroke="url(#patronSkinGrad)" strokeWidth="24" strokeLinecap="round" />

                {/* The Smartphone with glowing screen angled towards scanner */}
                <g transform="translate(210, 125) rotate(-28)">
                  <rect x="-10" y="-28" width="22" height="48" rx="4" fill="#020617" stroke="#64748b" strokeWidth="1.5" />
                  <rect x="-8" y="-25" width="18" height="42" rx="2" fill="#064e3b" />
                  
                  {/* Miniature Animated QR Code Graphics */}
                  <g transform="translate(-5, -16) scale(0.48)">
                    <rect x="0" y="0" width="7" height="7" fill="#ffffff" />
                    <rect x="1" y="1" width="5" height="5" fill="#064e3b" />
                    <rect x="2" y="2" width="3" height="3" fill="#ffffff" />

                    <rect x="14" y="0" width="7" height="7" fill="#ffffff" />
                    <rect x="15" y="1" width="5" height="5" fill="#064e3b" />
                    <rect x="16" y="2" width="3" height="3" fill="#ffffff" />

                    <rect x="0" y="14" width="7" height="7" fill="#ffffff" />
                    <rect x="1" y="15" width="5" height="5" fill="#064e3b" />
                    <rect x="2" y="16" width="3" height="3" fill="#ffffff" />

                    <rect x="8" y="2" width="3" height="4" fill="#ffffff" />
                    <rect x="8" y="8" width="4" height="2" fill="#ffffff" />
                    <rect x="14" y="9" width="3" height="5" fill="#ffffff" />
                  </g>

                  {/* Sweeping Laser Line on Phone Screen */}
                  <line x1="-8" y1="-22" x2="10" y2="-22" stroke="#6ee7b7" strokeWidth="2" filter="url(#heroGlow)">
                    <animate attributeName="y1" values="-22;14;-22" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="y2" values="-22;14;-22" dur="1.8s" repeatCount="indefinite" />
                  </line>
                </g>
              </g>
            </g>

            {/* C. The Laser Projection Cone */}
            <polygon points="152,162 200,105 225,145" fill="url(#heroLaserGrad)" opacity="0.85">
              <animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.8s" repeatCount="indefinite" />
            </polygon>

            {/* Central Precision Scanning Beam */}
            <line x1="152" y1="162" x2="212" y2="125" stroke="url(#heroLineGrad)" strokeWidth="2.5" filter="url(#heroGlow)">
              <animate attributeName="x2" values="202;218;202" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="y2" values="115;135;115" dur="1.8s" repeatCount="indefinite" />
            </line>

            {/* Verification Ripple Circles Expanding Upon Contact */}
            <circle cx="212" cy="125" r="6" fill="none" stroke="#34d399" strokeWidth="1.5" opacity="0.9">
              <animate attributeName="r" values="6;42" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="212" cy="125" r="6" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.9">
              <animate attributeName="r" values="6;65" dur="2s" begin="0.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7;0" dur="2s" begin="0.6s" repeatCount="indefinite" />
            </circle>

            {/* Rotating Targeting Corner Brackets */}
            <g transform="translate(212, 125)">
              <animateTransform attributeName="transform" type="rotate" from="0 212 125" to="360 212 125" dur="14s" repeatCount="indefinite" />
              <path d="M -16 -10 L -16 -16 L -10 -16" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
              <path d="M 10 -16 L 16 -16 L 16 -10" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
              <path d="M 16 10 L 16 16 L 10 16" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
              <path d="M -10 16 L -16 16 L -16 10" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
            </g>
          </svg>
        </div>

        {/* Live Simulated Scan Receipt Card */}
        <div className="w-full max-w-sm mt-3 p-3.5 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-emerald-500/30 shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-black text-white flex items-center gap-1.5">
                <span>Fast Pass Verified</span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                  Stand 1
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">1 Meal Plate Redeemed · Balance Synced</div>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-400 shrink-0">
            &lt; 0.3s
          </span>
        </div>
      </div>

      {/* 4. Bottom Feature Pillars */}
      <div className="relative z-10 grid grid-cols-3 gap-2 pt-4 border-t border-slate-800/80">
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1 p-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
          <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="text-[11px] font-bold text-white leading-tight">Instant Scan</div>
          <div className="text-[9px] text-slate-400 hidden sm:block">No waiting in lines</div>
        </div>
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1 p-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
          <div className="text-[11px] font-bold text-white leading-tight">Anti-Fraud</div>
          <div className="text-[9px] text-slate-400 hidden sm:block">Encrypted single-use QR</div>
        </div>
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1 p-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
          <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="text-[11px] font-bold text-white leading-tight">Phone & Card</div>
          <div className="text-[9px] text-slate-400 hidden sm:block">Works with offline PVC</div>
        </div>
      </div>
    </div>
  );
};
