import React, { useState, useMemo } from 'react';
import { Restaurant } from '../../types';
import { restoStore } from '../../store/restoStore';
import { QrCanvas } from '../common/QrCanvas';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  QrCode,
  ArrowRight,
  UserPlus,
  LogIn,
  Search,
  Sparkles,
  Utensils,
  CreditCard,
  CheckCircle2,
  Clock,
  Download,
  Copy,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';

interface RestaurantDirectoryGridProps {
  restaurants: Restaurant[];
  onSelectRegister: (restoCode: string) => void;
  onSelectLogin: (restoCode: string) => void;
  initialSearch?: string;
}

type RegionFilter = 'all' | 'kigali' | 'south' | 'north' | 'east_west';
type SortOption = 'popular' | 'price_asc' | 'name_asc';

export const RestaurantDirectoryGrid: React.FC<RestaurantDirectoryGridProps> = ({
  restaurants,
  onSelectRegister,
  onSelectLogin,
  initialSearch = '',
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedRegion, setSelectedRegion] = useState<RegionFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [selectedQrResto, setSelectedQrResto] = useState<Restaurant | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Helper to determine region from restaurant address or name
  const getRestaurantRegion = (r: Restaurant): RegionFilter => {
    const text = `${r.address} ${r.name} ${r.legalEntity}`.toLowerCase();
    if (text.includes('huye') || text.includes('southern')) return 'south';
    if (text.includes('musanze') || text.includes('ruhengeri') || text.includes('northern')) return 'north';
    if (
      text.includes('rubavu') ||
      text.includes('gisenyi') ||
      text.includes('rwamagana') ||
      text.includes('nyagatare') ||
      text.includes('eastern') ||
      text.includes('western')
    ) {
      return 'east_west';
    }
    return 'kigali';
  };

  // Filter facilities by name, code, address, email, or region, and apply sort
  const filteredRestaurants = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = restaurants.filter((r) => {
      if (term) {
        const matches =
          r.name.toLowerCase().includes(term) ||
          r.code.toLowerCase().includes(term) ||
          r.address.toLowerCase().includes(term) ||
          r.legalEntity.toLowerCase().includes(term) ||
          (r.welcomeMessage && r.welcomeMessage.toLowerCase().includes(term));
        if (!matches) return false;
      }
      if (selectedRegion !== 'all') {
        if (getRestaurantRegion(r) !== selectedRegion) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'price_asc') {
        const pA = a.defaultPlatePriceRwf || 1200;
        const pB = b.defaultPlatePriceRwf || 1200;
        return pA - pB;
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      return a.code.localeCompare(b.code);
    });
  }, [restaurants, searchTerm, selectedRegion, sortBy]);

  const handleCopyQrLink = (resto: Restaurant) => {
    if (typeof window === 'undefined') return;
    const origin = window.location.origin;
    const directUrl = `${origin}/#/${resto.code.toLowerCase()}/register`;
    navigator.clipboard.writeText(directUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  return (
    <div className="w-full space-y-6">
      {/* Search and Facility Count Filter Bar */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-3.5 sm:p-5 rounded-3xl shadow-xl space-y-3.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search campus or cafeteria (e.g. Huye, Musanze, AUCA, CST, Rubavu, RW01)..."
              className="w-full bg-slate-950/90 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-12 py-2.5 text-white placeholder-slate-500 text-xs sm:text-sm outline-hidden transition-all shadow-inner"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white font-semibold"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-slate-300">
              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Showing <strong className="text-white font-mono">{filteredRestaurants.length}</strong> of{' '}
                <strong className="text-slate-400 font-mono">{restaurants.length}</strong> Campuses
              </span>
            </span>
          </div>
        </div>

        {/* Region Filter Chips & Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all' as RegionFilter, label: 'All Campuses' },
              { id: 'kigali' as RegionFilter, label: 'Kigali Campuses' },
              { id: 'south' as RegionFilter, label: 'Southern (Huye)' },
              { id: 'north' as RegionFilter, label: 'Northern (Musanze)' },
              { id: 'east_west' as RegionFilter, label: 'East & West' },
            ].map((tab) => {
              const isActive = selectedRegion === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedRegion(tab.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'bg-slate-950/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-slate-200 font-medium text-xs outline-hidden cursor-pointer"
            >
              <option value="popular">Recommended</option>
              <option value="price_asc">Lowest Meal Price</option>
              <option value="name_asc">Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Directory Grid */}
      {filteredRestaurants.length === 0 ? (
        <div className="p-10 text-center rounded-3xl bg-slate-900/50 border border-slate-800 space-y-3">
          <Utensils className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No dining facilities match your search</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Try searching for &quot;RW01&quot;, &quot;Kigali&quot;, or clear the search input to see all onboarded campus cafeterias.
          </p>
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all"
          >
            Reset Search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {filteredRestaurants.map((resto) => {
            const branches = restoStore.getRestaurantBranches(resto.code);
            const scanPoints = restoStore.getState().scanPoints.filter((sp) => sp.restaurantCode === resto.code);
            const singlePrice = resto.defaultPlatePriceRwf || 1200;
            const bundle30 = resto.bundlePricing?.bundle30PlatesPriceRwf || Math.round(singlePrice * 30 * 0.95);
            const bundle60 = resto.bundlePricing?.bundle60PlatesPriceRwf || Math.round(singlePrice * 60 * 0.9);

            return (
              <div
                key={resto.code}
                className="group relative bg-slate-900/90 backdrop-blur-2xl border border-slate-800 hover:border-emerald-500/50 rounded-3xl p-5 sm:p-6 shadow-xl hover:shadow-2xl hover:shadow-emerald-950/30 transition-all duration-300 flex flex-col justify-between"
              >
                {/* Top Badge Row */}
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-black text-sm shadow-inner shrink-0 group-hover:scale-105 transition-transform">
                        {resto.code}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active Partner
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-400">
                            {resto.currency || 'RWF'}
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-white group-hover:text-emerald-300 transition-colors mt-0.5">
                          {resto.name}
                        </h3>
                      </div>
                    </div>

                    {/* View In-Store QR Modal Trigger */}
                    <button
                      type="button"
                      onClick={() => setSelectedQrResto(resto)}
                      title="View In-Store Table / Entrance QR Code"
                      className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-emerald-300 transition-all cursor-pointer shrink-0"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Welcome Message / Slogan */}
                  {resto.welcomeMessage && (
                    <p className="text-xs text-slate-300 font-medium italic border-l-2 border-emerald-500/60 pl-3 py-0.5">
                      &ldquo;{resto.welcomeMessage}&rdquo;
                    </p>
                  )}

                  {/* Campus & Contact Info */}
                  <div className="space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{resto.address}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{resto.phone}</span>
                      </div>
                      <span className="text-slate-600">·</span>
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{resto.email}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pricing / Packages Showcase Pill */}
                  <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800/90 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <CreditCard className="w-3 h-3 text-emerald-400" />
                        Prepaid Meal Packages
                      </span>
                      <span className="text-emerald-400 font-mono">
                        From {singlePrice.toLocaleString()} {resto.currency}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                      <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-slate-400 font-medium">Standard</div>
                        <div className="font-mono font-bold text-white mt-0.5">
                          {singlePrice.toLocaleString()} {resto.currency}
                        </div>
                        <div className="text-[9px] text-slate-500">1 Plate</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-slate-400 font-medium">30 Plates</div>
                        <div className="font-mono font-bold text-emerald-300 mt-0.5">
                          {bundle30.toLocaleString()} {resto.currency}
                        </div>
                        <div className="text-[9px] text-emerald-400">Save 5%</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
                        <div className="text-emerald-300 font-medium">Month (60)</div>
                        <div className="font-mono font-bold text-emerald-200 mt-0.5">
                          {bundle60.toLocaleString()} {resto.currency}
                        </div>
                        <div className="text-[9px] text-emerald-400 font-bold">Best Value</div>
                      </div>
                    </div>
                  </div>

                  {/* Facility Stations & Reception Counters */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{branches.length || 1} Campus Location</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{scanPoints.length || 2} Active Scanners &amp; POS</span>
                    </span>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="pt-5 mt-4 border-t border-slate-800/80 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectRegister(resto.code)}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Register for Pass</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectLogin(resto.code)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Diner Sign In</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* In-Store Table / Reception QR Modal */}
      {selectedQrResto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-center">
            <button
              type="button"
              onClick={() => setSelectedQrResto(null)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                {selectedQrResto.code} · IN-STORE QR CODE
              </span>
              <h4 className="text-lg font-black text-white">{selectedQrResto.name}</h4>
              <p className="text-xs text-slate-400">
                Printed on cafeteria entrance posters and dining tables for instant phone scanning.
              </p>
            </div>

            {/* QR Code Canvas */}
            <div className="p-4 rounded-2xl bg-white mx-auto inline-block shadow-inner">
              <QrCanvas
                value={
                  typeof window !== 'undefined'
                    ? `${window.location.origin}/#/${selectedQrResto.code.toLowerCase()}/register`
                    : `https://restopass.rw/#/${selectedQrResto.code.toLowerCase()}/register`
                }
                size={180}
              />
            </div>

            <div className="text-[11px] font-mono text-emerald-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800 truncate">
              {typeof window !== 'undefined'
                ? `${window.location.origin}/#/${selectedQrResto.code.toLowerCase()}/register`
                : `https://restopass.rw/#/${selectedQrResto.code.toLowerCase()}/register`}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyQrLink(selectedQrResto)}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy Direct Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedQrResto(null);
                  onSelectRegister(selectedQrResto.code);
                }}
                className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs transition-all cursor-pointer"
              >
                Open Form &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
