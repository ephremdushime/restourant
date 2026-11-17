import React from 'react';

/**
 * ScanningPersonBackground
 * 
 * An immersive, high-tech animated backdrop featuring a patron scanning their 
 * digital dining meal pass / phone at a RestoPass cafeteria buffet scanner terminal.
 * Includes dynamic sweeping laser beams, optical QR target reticles, pulse confirmation waves,
 * and ambient atmospheric campus cafeteria lighting.
 */
export const ScanningPersonBackground: React.FC = () => {
  return (
    <div 
      className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0"
      aria-hidden="true"
    >
      {/* 1. Deep Ambient Atmospheric Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(2,6,23,0.95))]" />
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />

      {/* 2. Cyber-Cafeteria Isometric Floor Grid */}
      <div 
        className="absolute inset-0 opacity-[0.07]" 
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(52, 211, 153, 0.4) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(52, 211, 153, 0.4) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 80%)'
        }}
      />

      {/* 3. The Animated Person & Scanner Stand Illustration (SVG Scene) */}
      <div className="absolute inset-0 flex items-center justify-center opacity-70 lg:opacity-85 transition-opacity">
        <svg 
          viewBox="0 0 1200 800" 
          className="w-full h-full max-w-7xl max-h-[900px] object-contain"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Laser Beam Gradient */}
            <linearGradient id="laserBeamGrad" x1="0%" y1="0%" x2="100%" y2="80%">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
              <stop offset="40%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.02" />
            </linearGradient>

            {/* Glowing Laser Line Gradient */}
            <linearGradient id="laserLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#6ee7b7" stopOpacity="1" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0.1" />
            </linearGradient>

            {/* Phone Screen Glow */}
            <linearGradient id="screenGlow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#064e3b" stopOpacity="0.4" />
            </linearGradient>

            {/* Person Silhouette Gradient */}
            <linearGradient id="personGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#334155" stopOpacity="0.85" />
              <stop offset="60%" stopColor="#1e293b" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
            </linearGradient>

            {/* Kiosk Metal Shading */}
            <linearGradient id="kioskGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            {/* Scanner Head Glow Filter */}
            <filter id="emeraldGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            <filter id="intenseLaserGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* =============================================================== */}
          {/* A. LEFT / CENTER-LEFT: THE RESTOPASS SCANNER TERMINAL STAND    */}
          {/* =============================================================== */}
          <g className="kiosk-station">
            {/* Kiosk Base Pedestal */}
            <ellipse cx="380" cy="690" rx="90" ry="16" fill="#090d16" stroke="#1e293b" strokeWidth="2" />
            <path d="M 330 690 L 350 480 L 410 480 L 430 690 Z" fill="url(#kioskGrad)" stroke="#334155" strokeWidth="1.5" />
            
            {/* Terminal Main Stem Neck */}
            <rect x="362" y="320" width="36" height="165" rx="4" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
            {/* LED Status strip on neck */}
            <rect x="377" y="340" width="6" height="120" rx="3" fill="#10b981" opacity="0.6">
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
            </rect>

            {/* Kiosk Optical Terminal Head (Angled toward the right at 35 degrees) */}
            <g transform="translate(380, 310)">
              {/* Terminal Head Enclosure */}
              <path 
                d="M -45 -40 L 45 -40 L 60 45 L -35 45 Z" 
                fill="#0f172a" 
                stroke="#38bdf8" 
                strokeWidth="1.5" 
                strokeOpacity="0.4" 
              />
              {/* Terminal Screen / Glass Scanner Window */}
              <path 
                d="M -30 -30 L 35 -30 L 48 35 L -20 35 Z" 
                fill="#022c22" 
                stroke="#10b981" 
                strokeWidth="2" 
              />

              {/* High-Tech Optical Lens / Sensor Aperture */}
              <circle cx="15" cy="5" r="14" fill="#064e3b" stroke="#34d399" strokeWidth="2" />
              <circle cx="15" cy="5" r="7" fill="#10b981" filter="url(#emeraldGlow)">
                <animate attributeName="r" values="6;8;6" dur="1.8s" repeatCount="indefinite" />
              </circle>
              {/* Camera Reflection Highlights */}
              <circle cx="12" cy="2" r="2.5" fill="#ffffff" opacity="0.8" />

              {/* Status LED Beacon on Head */}
              <circle cx="48" cy="-32" r="4" fill="#10b981" filter="url(#intenseLaserGlow)">
                <animate attributeName="fill" values="#10b981;#34d399;#10b981" dur="1s" repeatCount="indefinite" />
              </circle>
            </g>

            {/* Kiosk Floor Shadow */}
            <ellipse cx="380" cy="700" rx="110" ry="18" fill="#000000" opacity="0.5" />
          </g>

          {/* =============================================================== */}
          {/* B. CENTER-RIGHT: PATRON HOLDING PHONE (SILHOUETTE WITH RIM LIGHT)*/}
          {/* =============================================================== */}
          <g className="scanning-patron" transform="translate(50, 0)">
            {/* Natural Body Floating / Idle Breathing */}
            <g>
              <animateTransform 
                attributeName="transform" 
                type="translate" 
                values="0 0; 0 -4; 0 0" 
                dur="4s" 
                repeatCount="indefinite" 
              />

              {/* Torso & Shoulders Silhouette */}
              <path 
                d="M 690 700 
                   L 710 520 
                   C 715 470, 740 430, 770 410 
                   C 810 385, 870 395, 895 440 
                   L 925 700 Z" 
                fill="url(#personGrad)" 
                stroke="#475569" 
                strokeWidth="1.5" 
                strokeOpacity="0.4" 
              />

              {/* Collar / Jacket Rim Highlight */}
              <path 
                d="M 770 410 C 790 435, 830 435, 850 410" 
                fill="none" 
                stroke="#34d399" 
                strokeWidth="1.5" 
                strokeOpacity="0.4" 
              />

              {/* Head & Neck Profile */}
              <path 
                d="M 785 410 L 785 350 C 785 340, 775 320, 785 280 C 795 240, 845 240, 855 280 C 865 320, 855 340, 845 350 L 845 410 Z" 
                fill="url(#personGrad)" 
                stroke="#64748b" 
                strokeWidth="1" 
                strokeOpacity="0.3" 
              />
              {/* Modern Hairstyle / Cap Contour */}
              <path 
                d="M 775 285 C 770 250, 810 230, 855 245 C 870 255, 875 275, 870 295 C 850 280, 800 280, 775 285 Z" 
                fill="#0f172a" 
              />

              {/* Extended Left Arm & Hand Holding Phone towards the Scanner */}
              {/* Upper Arm */}
              <path 
                d="M 740 435 C 700 460, 640 450, 600 410" 
                fill="none" 
                stroke="url(#personGrad)" 
                strokeWidth="48" 
                strokeLinecap="round" 
              />
              {/* Forearm angled upwards toward scanner */}
              <path 
                d="M 610 420 L 525 355" 
                fill="none" 
                stroke="url(#personGrad)" 
                strokeWidth="38" 
                strokeLinecap="round" 
              />
              {/* Hand clasping smartphone */}
              <circle cx="515" cy="350" r="16" fill="#1e293b" stroke="#34d399" strokeWidth="1" strokeOpacity="0.3" />

              {/* The Smartphone (Tilted at 45 degrees towards the terminal optic) */}
              <g transform="translate(505, 340) rotate(-28)">
                {/* Phone Body Frame */}
                <rect x="-14" y="-38" width="30" height="64" rx="6" fill="#090d16" stroke="#475569" strokeWidth="2" />
                {/* Glowing Screen Display */}
                <rect x="-11" y="-34" width="24" height="54" rx="3" fill="url(#screenGlow)" />
                
                {/* Digital Meal Card QR Code Pattern on Screen */}
                <g transform="translate(-7, -22) scale(0.65)">
                  {/* QR Position Squares */}
                  <rect x="0" y="0" width="7" height="7" fill="#ffffff" />
                  <rect x="1" y="1" width="5" height="5" fill="#064e3b" />
                  <rect x="2" y="2" width="3" height="3" fill="#ffffff" />

                  <rect x="16" y="0" width="7" height="7" fill="#ffffff" />
                  <rect x="17" y="1" width="5" height="5" fill="#064e3b" />
                  <rect x="18" y="2" width="3" height="3" fill="#ffffff" />

                  <rect x="0" y="16" width="7" height="7" fill="#ffffff" />
                  <rect x="1" y="17" width="5" height="5" fill="#064e3b" />
                  <rect x="2" y="18" width="3" height="3" fill="#ffffff" />

                  {/* QR Data Matrix Dots */}
                  <rect x="9" y="2" width="2" height="4" fill="#ffffff" />
                  <rect x="13" y="2" width="2" height="2" fill="#ffffff" />
                  <rect x="9" y="8" width="5" height="2" fill="#ffffff" />
                  <rect x="2" y="9" width="3" height="3" fill="#ffffff" />
                  <rect x="18" y="9" width="4" height="2" fill="#ffffff" />
                  <rect x="9" y="13" width="2" height="6" fill="#ffffff" />
                  <rect x="14" y="14" width="5" height="3" fill="#ffffff" />
                </g>

                {/* Floating Laser Scan Line sweeping on Phone Screen */}
                <line x1="-12" y1="-30" x2="14" y2="-30" stroke="#a7f3d0" strokeWidth="2.5" filter="url(#intenseLaserGlow)">
                  <animate 
                    attributeName="y1" 
                    values="-30;18;-30" 
                    dur="1.8s" 
                    repeatCount="indefinite" 
                  />
                  <animate 
                    attributeName="y2" 
                    values="-30;18;-30" 
                    dur="1.8s" 
                    repeatCount="indefinite" 
                  />
                </line>
              </g>
            </g>
          </g>

          {/* =============================================================== */}
          {/* C. THE ACTIVE SCANNING CONE & OPTICAL LASER BEAMS               */}
          {/* =============================================================== */}
          <g className="laser-beam-system">
            {/* Volumetric Laser Cone from Scanner Lens to Phone Screen */}
            <polygon 
              points="395,315 490,305 520,365" 
              fill="url(#laserBeamGrad)" 
              opacity="0.8"
            >
              <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.8s" repeatCount="indefinite" />
            </polygon>

            {/* Central Precision Emerald Laser Line */}
            <line 
              x1="395" y1="315" 
              x2="505" y2="335" 
              stroke="url(#laserLineGrad)" 
              strokeWidth="2.5" 
              filter="url(#intenseLaserGlow)"
            >
              <animate 
                attributeName="x2" 
                values="495;515;495" 
                dur="1.8s" 
                repeatCount="indefinite" 
              />
              <animate 
                attributeName="y2" 
                values="320;350;320" 
                dur="1.8s" 
                repeatCount="indefinite" 
              />
            </line>

            {/* Concentric Verification Pulse Waves expanding from the scan point */}
            <circle cx="505" cy="335" r="8" fill="none" stroke="#34d399" strokeWidth="1.5" opacity="0.9">
              <animate attributeName="r" values="8;55" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="505" cy="335" r="8" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.9">
              <animate attributeName="r" values="8;85" dur="2s" begin="0.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7;0" dur="2s" begin="0.6s" repeatCount="indefinite" />
            </circle>

            {/* Holographic Verification Reticle / Targeting Corners */}
            <g transform="translate(505, 335) scale(0.9)">
              <animateTransform 
                attributeName="transform" 
                type="rotate" 
                from="0 505 335" 
                to="360 505 335" 
                dur="16s" 
                repeatCount="indefinite" 
              />
              {/* Corner Reticles */}
              <path d="M -24 -14 L -24 -24 L -14 -24" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
              <path d="M 14 -24 L 24 -24 L 24 -14" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
              <path d="M 24 14 L 24 24 L 14 24" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
              <path d="M -14 24 L -24 24 L -24 14" fill="none" stroke="#6ee7b7" strokeWidth="1.5" />
            </g>
          </g>

          {/* =============================================================== */}
          {/* D. FLOATING HUD TELEMETRY & DIGITAL STATUS BADGES               */}
          {/* =============================================================== */}
          <g className="hud-telemetry" opacity="0.85">
            {/* Terminal Live Status Chip */}
            <g transform="translate(280, 210)">
              <rect x="0" y="0" width="165" height="34" rx="10" fill="#020617" stroke="#10b981" strokeWidth="1" strokeOpacity="0.4" />
              <circle cx="16" cy="17" r="4.5" fill="#10b981" filter="url(#intenseLaserGlow)">
                <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
              </circle>
              <text x="30" y="15" fill="#6ee7b7" fontSize="9" fontWeight="700" fontFamily="monospace" letterSpacing="0.5">
                TERMINAL RW01 · STAND 1
              </text>
              <text x="30" y="26" fill="#94a3b8" fontSize="8" fontWeight="500" fontFamily="sans-serif">
                HIGH SPEED OPTICAL SCANNER
              </text>
            </g>

            {/* Instant Verification Tag */}
            <g transform="translate(560, 270)">
              <rect x="0" y="0" width="150" height="28" rx="8" fill="#020617" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.3" />
              <text x="12" y="18" fill="#38bdf8" fontSize="9" fontWeight="800" fontFamily="monospace" letterSpacing="0.8">
                FAST PASS · 256-BIT
              </text>
            </g>

            {/* Floating Bokeh / Data Nodes */}
            <circle cx="240" cy="420" r="2" fill="#34d399" opacity="0.4">
              <animate attributeName="cy" values="420;400;420" dur="5s" repeatCount="indefinite" />
            </circle>
            <circle cx="310" cy="560" r="1.5" fill="#38bdf8" opacity="0.3">
              <animate attributeName="cy" values="560;535;560" dur="4s" repeatCount="indefinite" />
            </circle>
            <circle cx="680" cy="310" r="2.5" fill="#10b981" opacity="0.5">
              <animate attributeName="cy" values="310;280;310" dur="6s" repeatCount="indefinite" />
            </circle>
            <circle cx="940" cy="460" r="2" fill="#34d399" opacity="0.3">
              <animate attributeName="cy" values="460;440;460" dur="5s" repeatCount="indefinite" />
            </circle>
          </g>
        </svg>
      </div>

      {/* 4. Soft Vignette to blend perfectly into page borders */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/80 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-transparent to-slate-950/90 pointer-events-none" />
    </div>
  );
};
