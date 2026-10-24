import React, { useState } from 'react';
import { restoStore } from '../../store/restoStore';
import {
  Server,
  Cloud,
  Laptop,
  Smartphone,
  ShieldCheck,
  Wifi,
  Copy,
  Check,
  Download,
  Terminal,
  ExternalLink,
  DollarSign,
  TrendingUp,
  Cpu,
  Layers,
  Globe,
  Lock,
  ArrowRight,
  Database,
  Radio,
  FileCode,
  ShieldAlert,
} from 'lucide-react';

export const DeploymentBlueprintView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'architecture' | 'economics' | 'docker' | 'nginx' | 'offline_install' | 'dns'>('architecture');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Economics Calculator state
  const [restaurantCount, setRestaurantCount] = useState<number>(12);
  const [avgPlanPriceRwf, setAvgPlanPriceRwf] = useState<number>(65000);
  const [extraStationsPerResto, setExtraStationsPerResto] = useState<number>(1);
  const [extraStationPriceRwf] = useState<number>(15000);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Financial calculations
  const monthlyB2BRevenueRwf =
    restaurantCount * (avgPlanPriceRwf + extraStationsPerResto * extraStationPriceRwf);
  const vpsMonthlyCostUsd = 6; // $6/month VPS (e.g. Hetzner CX22 / DigitalOcean Droplet)
  const vpsMonthlyCostRwf = vpsMonthlyCostUsd * 1400; // ~8,400 RwF/month
  const monthlyProfitRwf = monthlyB2BRevenueRwf - vpsMonthlyCostRwf;
  const marginPercent = ((monthlyProfitRwf / monthlyB2BRevenueRwf) * 100).toFixed(1);

  // Configuration Snippets
  const dockerComposeCode = `# ==============================================================================
# RestoPass Cloud Master Server — Production docker-compose.yml
# Host on a $6/mo Linux VPS (Hetzner, DigitalOcean, or Linode)
# ==============================================================================
version: '3.8'

services:
  # Wildcard Reverse Proxy & Automated SSL
  nginx-proxy:
    image: nginx:alpine
    container_name: restopass_proxy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - restopass_app

  # Automated Let's Encrypt Wildcard SSL Renewal
  certbot:
    image: certbot/certbot
    container_name: restopass_certbot
    restart: unless-stopped
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait; done;'"

  # Central RestoPass Master Application
  restopass_app:
    image: restopass/core:latest
    container_name: restopass_master
    restart: always
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DOMAIN=restopass.rw
      - MASTER_PRIVATE_KEY=\${MASTER_ED25519_PRIVATE_KEY}
      - DATABASE_URL=file:/data/restopass_master.sqlite
      - SYNC_AUTH_SECRET=\${SYNC_AUTH_SECRET}
    volumes:
      - master_data:/data
    networks:
      - restopass_net

volumes:
  master_data:
    driver: local

networks:
  restopass_net:
    driver: bridge`;

  const nginxConfCode = `# ==============================================================================
# Nginx Reverse Proxy with Dynamic Restaurant Subdomains (*.restopass.rw)
# Handles: resto1.restopass.rw, resto2.restopass.rw, portal.restopass.rw
# ==============================================================================
events { worker_connections 1024; }

http {
    include /etc/nginx/mime.types;
    sendfile on;

    # Redirect all HTTP traffic to secure HTTPS
    server {
        listen 80;
        server_name restopass.rw *.restopass.rw;
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # Secure HTTPS Gateway for All Subdomains
    server {
        listen 443 ssl http2;
        server_name restopass.rw *.restopass.rw;

        ssl_certificate /etc/letsencrypt/live/restopass.rw/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/restopass.rw/privkey.pem;

        # Forward restaurant subdomain in headers
        location / {
            proxy_pass http://restopass_app:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Restaurant-Subdomain $host;

            # WebSocket support for instant real-time sync
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}`;

  const offlineInstallCommand = `# ==============================================================================
# 1-Click On-Premises Installation on Restaurant Office PC / Laptop
# Run this in the cafeteria manager's terminal (Linux, Mac, or Windows WSL2)
# ==============================================================================
curl -sSL https://get.restopass.rw/install-cafeteria.sh | bash -s -- \\
  --code RW01 \\
  --server-ip 192.168.1.100 \\
  --license-file ./LIC-RW01-2026.lic`;

  return (
    <div className="space-y-6">
      {/* Blueprint Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Production Deployment &amp; Hosting Architecture
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
              Senior Dev Blueprint
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Scalable multi-tenant architecture designed for Rwanda. Combines a <strong>$6/month Central Cloud VPS</strong> with <strong>Zero-Downtime Offline On-Premises Cafeteria Servers</strong> and <strong>Cryptographic Wi-Fi Station Pairing</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-right">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Host Cost
            </span>
            <span className="text-base font-black text-emerald-400 font-mono">
              $6 – $10 / month
            </span>
          </div>
        </div>
      </div>

      {/* Role & Responsibility Boundary Warning Banner */}
      <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200 flex items-start gap-3">
        <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-white block">
            Strict Separation of Roles &amp; Pricing Authority:
          </span>
          <p className="text-slate-300 leading-relaxed">
            <strong>Super Admin (You):</strong> Charges restaurants B2B monthly subscription fees (e.g. 45,000–85,000 RwF/mo) and extra scan point license seats (+15,000 RwF/mo). You host the master sync server and issue signed licenses.
          </p>
          <p className="text-slate-300 leading-relaxed">
            <strong>Restaurant Admin (The Boss):</strong> Exclusively sets meal plate prices (e.g. 1,150 RwF/plate), food recipes, and patron meal bundles (10, 30, 60 plates). Super Admin does not set or tamper with cafeteria food prices.
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs font-semibold overflow-x-auto">
        {[
          { id: 'architecture', label: '3-Tier Network Canvas', icon: Layers },
          { id: 'economics', label: 'B2B Revenue & Hosting Margin', icon: TrendingUp },
          { id: 'docker', label: 'docker-compose.yml', icon: FileCode },
          { id: 'nginx', label: 'nginx.conf (Wildcard Subdomains)', icon: Globe },
          { id: 'offline_install', label: 'On-Premises Cafeteria Setup', icon: Terminal },
          { id: 'dns', label: 'Domain & Subdomain Map', icon: Radio },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-amber-600 text-white font-bold shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: 3-TIER ARCHITECTURE TOPOLOGY CANVAS */}
      {activeTab === 'architecture' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* TIER 1: Master Cloud Server */}
            <div className="p-5 rounded-2xl bg-slate-900 border-2 border-indigo-500/30 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Tier 1 · Central Cloud
                </span>
                <span className="text-xs font-mono text-emerald-400 font-bold">$6 / mo</span>
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-indigo-400" />
                  <span>Master Cloud VPS</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Hetzner CX22 / DigitalOcean Droplet
                </p>
              </div>

              <ul className="text-xs text-slate-300 space-y-2 font-mono">
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Wildcard Router (*.restopass.rw)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Ed25519 Cryptographic Master Key</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Multi-Tenant DB (All Restaurants)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Super Admin Global Dashboard</span>
                </li>
              </ul>

              <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                Maintains bi-directional state sync with each cafeteria&apos;s local office station.
              </div>
            </div>

            {/* TIER 2: On-Premises Office Laptop / PC */}
            <div className="p-5 rounded-2xl bg-slate-900 border-2 border-emerald-500/30 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Tier 2 · Cafeteria Office
                </span>
                <span className="text-xs font-mono text-emerald-400 font-bold">$0 Extra Hardware</span>
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Laptop className="w-5 h-5 text-emerald-400" />
                  <span>On-Premises Cafeteria PC</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Manager Office PC / Laptop (`192.168.1.100`)
                </p>
              </div>

              <ul className="text-xs text-slate-300 space-y-2 font-mono">
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Runs 100% Offline (No Internet Needed)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Local SQLite &amp; Append-Only Outbox</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Wi-Fi Pairing Authority Hub</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Syncs to Master VPS when online</span>
                </li>
              </ul>

              <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                Any office PC or laptop can serve as the cafeteria local server with 1-click Docker.
              </div>
            </div>

            {/* TIER 3: Local Floor Stations & Wi-Fi Isolation */}
            <div className="p-5 rounded-2xl bg-slate-900 border-2 border-amber-500/30 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-950 text-amber-300 border border-amber-800">
                  Tier 3 · Cafeteria Floor
                </span>
                <span className="text-xs font-mono text-amber-400 font-bold">1:1 Cashier Quota</span>
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-amber-400" />
                  <span>Cashiers on Local Wi-Fi</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Phones, Tablets &amp; USB Barcode Laptops
                </p>
              </div>

              <ul className="text-xs text-slate-300 space-y-2 font-mono">
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Paired via Boss QR or 6-char Key</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Hardware Cert in Local Browser Store</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <span className="text-rose-300">Rogue Wi-Fi Phones Blocked</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Instant &lt;50ms Offline Plate Deduction</span>
                </li>
              </ul>

              <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                1 Cashier Account = 1 Scan Point seat. Limited by restaurant subscription plan.
              </div>
            </div>
          </div>

          {/* Sync Lifecycle Diagram */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <span>Offline-First Bi-Directional Synchronization Flow</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-bold text-emerald-400">1. Instant Offline Scan</div>
                <p className="text-slate-400 text-[11px]">
                  Student scans QR. Station verifies Ed25519 card signature locally in &lt;50ms. No cloud lookup needed.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-bold text-emerald-400">2. Local Append Outbox</div>
                <p className="text-slate-400 text-[11px]">
                  Transaction appended to local SQLite ledger and memory cache. Balance decrements immediately.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-bold text-emerald-400">3. Background Sync</div>
                <p className="text-slate-400 text-[11px]">
                  When cafeteria PC detects internet connectivity (fiber or 4G modem), it flushes the outbox to Master Cloud.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-bold text-emerald-400">4. Master Reconciliation</div>
                <p className="text-slate-400 text-[11px]">
                  Master server confirms receipt, merges ledger idempotently by UUID, and updates patron web portals.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: B2B REVENUE & HOSTING MARGIN CALCULATOR */}
      {activeTab === 'economics' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span>Interactive B2B SaaS Profit Margin Calculator</span>
              </h3>
              <p className="text-xs text-slate-400">
                Model your gross revenue and hosting expenses across multiple cafeteria client locations.
              </p>
            </div>

            {/* Slider Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="font-medium">Active Restaurants:</span>
                  <span className="font-mono font-bold text-white text-sm">{restaurantCount}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={restaurantCount}
                  onChange={(e) => setRestaurantCount(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">
                  e.g. University dining halls, high schools, corporate cafeterias
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="font-medium">Avg B2B Subscription Fee:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {avgPlanPriceRwf.toLocaleString()} RWF/mo
                  </span>
                </div>
                <input
                  type="range"
                  min="35000"
                  max="120000"
                  step="5000"
                  value={avgPlanPriceRwf}
                  onChange={(e) => setAvgPlanPriceRwf(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">
                  What you charge the restaurant owner monthly
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="font-medium">Avg Extra Scan Points:</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {extraStationsPerResto} station (+{(extraStationsPerResto * extraStationPriceRwf).toLocaleString()} RWF)
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="6"
                  value={extraStationsPerResto}
                  onChange={(e) => setExtraStationsPerResto(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">
                  Extra cashier stand licenses (+15,000 RwF/station/mo)
                </span>
              </div>
            </div>

            {/* Financial Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Monthly B2B Revenue
                </span>
                <span className="text-xl font-black text-white font-mono">
                  {monthlyB2BRevenueRwf.toLocaleString()} RWF
                </span>
                <span className="text-[10px] text-emerald-400 block">
                  ~${(monthlyB2BRevenueRwf / 1400).toFixed(0)} USD / month
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  VPS Infrastructure Cost
                </span>
                <span className="text-xl font-black text-rose-400 font-mono">
                  {vpsMonthlyCostRwf.toLocaleString()} RWF
                </span>
                <span className="text-[10px] text-slate-400 block">
                  $6.00 USD / month VPS
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Net Monthly Profit
                </span>
                <span className="text-xl font-black text-emerald-400 font-mono">
                  {monthlyProfitRwf.toLocaleString()} RWF
                </span>
                <span className="text-[10px] text-emerald-300 block">
                  ~${(monthlyProfitRwf / 1400).toFixed(0)} USD / month
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Gross Profit Margin
                </span>
                <span className="text-xl font-black text-emerald-400 font-mono">
                  {marginPercent}%
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Near zero per-client marginal server cost
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DOCKER COMPOSE CONFIG */}
      {activeTab === 'docker' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-300">
              Drop this on your central Linux VPS inside <code>/opt/restopass/docker-compose.yml</code> and run <code>docker compose up -d</code>.
            </div>
            <button
              type="button"
              onClick={() => handleCopy(dockerComposeCode, 'docker')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedId === 'docker' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === 'docker' ? 'Copied YAML!' : 'Copy docker-compose.yml'}</span>
            </button>
          </div>

          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs overflow-x-auto max-h-[460px] leading-relaxed">
            {dockerComposeCode}
          </pre>
        </div>
      )}

      {/* TAB 4: NGINX CONFIG */}
      {activeTab === 'nginx' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-300">
              Production Nginx wildcard reverse proxy mapping <code>*.restopass.rw</code> to individual tenant dashboards.
            </div>
            <button
              type="button"
              onClick={() => handleCopy(nginxConfCode, 'nginx')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedId === 'nginx' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === 'nginx' ? 'Copied Nginx Conf!' : 'Copy nginx.conf'}</span>
            </button>
          </div>

          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs overflow-x-auto max-h-[460px] leading-relaxed">
            {nginxConfCode}
          </pre>
        </div>
      )}

      {/* TAB 5: ON-PREMISES INSTALL COMMAND */}
      {activeTab === 'offline_install' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>1-Click Cafeteria Manager Setup Script</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              When onboarding a new restaurant with an on-premises setup, open the manager&apos;s office PC or laptop, open Terminal / PowerShell, and paste this command:
            </p>

            <div className="relative">
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono text-xs overflow-x-auto">
                {offlineInstallCommand}
              </pre>
              <button
                type="button"
                onClick={() => handleCopy(offlineInstallCommand, 'curl')}
                className="absolute top-3 right-3 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                {copiedId === 'curl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedId === 'curl' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="text-xs text-slate-400 space-y-1 pt-1">
              <div>✓ Automatically reserves static local IP <code>192.168.1.100</code> on the cafeteria router.</div>
              <div>✓ Starts local edge SQLite container listening on port <code>3000</code>.</div>
              <div>✓ Verifies cryptographic signature in <code>LIC-RW01-2026.lic</code> against your public key.</div>
              <div>✓ Generates station pairing codes for the cashier devices.</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: DOMAIN & SUBDOMAIN MAP */}
      {activeTab === 'dns' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
                <tr>
                  <th className="py-3 px-4">DNS Record Type</th>
                  <th className="py-3 px-4">Host / Subdomain</th>
                  <th className="py-3 px-4">Points To (Target)</th>
                  <th className="py-3 px-4">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                <tr className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-bold text-amber-400">A Record</td>
                  <td className="py-3 px-4 text-white">restopass.rw</td>
                  <td className="py-3 px-4 text-emerald-400">YOUR_VPS_PUBLIC_IP</td>
                  <td className="py-3 px-4 font-sans text-slate-300">Public marketing &amp; platform login</td>
                </tr>
                <tr className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-bold text-amber-400">CNAME (Wildcard)</td>
                  <td className="py-3 px-4 text-white">*.restopass.rw</td>
                  <td className="py-3 px-4 text-emerald-400">restopass.rw</td>
                  <td className="py-3 px-4 font-sans text-slate-300">Dynamic tenant subdomains (resto1, resto2, etc.)</td>
                </tr>
                <tr className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-bold text-indigo-400">Subdomain</td>
                  <td className="py-3 px-4 text-white">admin.restopass.rw</td>
                  <td className="py-3 px-4 text-emerald-400">restopass.rw</td>
                  <td className="py-3 px-4 font-sans text-slate-300">Super Admin master console for Ephrem</td>
                </tr>
                <tr className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-bold text-indigo-400">Subdomain</td>
                  <td className="py-3 px-4 text-white">kigali-buffet.restopass.rw</td>
                  <td className="py-3 px-4 text-emerald-400">restopass.rw</td>
                  <td className="py-3 px-4 font-sans text-slate-300">Kigali Buffet Boss &amp; Cashier Dashboard</td>
                </tr>
                <tr className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-bold text-indigo-400">Subdomain</td>
                  <td className="py-3 px-4 text-white">portal.restopass.rw</td>
                  <td className="py-3 px-4 text-emerald-400">restopass.rw</td>
                  <td className="py-3 px-4 font-sans text-slate-300">Customer PWA &amp; balance management</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
            <span className="font-bold text-white block">Rwanda Domain Registry (.rw):</span>
            <p>
              Purchase your <code>.rw</code> domain via RICTA accredited registrars (e.g. BSC, Airtel, or Africa Registry) for ~$15/year. Point the nameservers to Cloudflare or your VPS DNS provider for free wildcard SSL.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
