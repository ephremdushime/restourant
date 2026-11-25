import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant } from '../../types';
import { restoStore } from '../../store/restoStore';
import {
  Building2,
  Search,
  X,
  MapPin,
  LogIn,
  UserPlus,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Check,
  ChevronDown,
  Filter,
  CreditCard,
  Utensils,
} from 'lucide-react';

interface CafeteriaSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCafeteria: (restoCode: string, mode: 'login' | 'register') => void;
  currentSelectedCode?: string;
}

type RegionFilter = 'all' | 'kigali' | 'south' | 'north' | 'east_west';
type SortOption = 'popular' | 'price_asc' | 'name_asc';

export const CafeteriaSelectorModal: React.FC<CafeteriaSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectCafeteria,
  currentSelectedCode,
}) => {
  const state = restoStore.getState();
  const restaurants = state.restaurants;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<RegionFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [rememberPreference, setRememberPreference] = useState(true);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 80);
    }
  }, [isOpen]);

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

  // Filter and sort facilities
  const filteredAndSortedRestaurants = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const filtered = restaurants.filter((r) => {
      // 1. Text Search matching name, code, address, legal entity
      if (term) {
        const match =
          r.name.toLowerCase().includes(term) ||
          r.code.toLowerCase().includes(term) ||
          r.address.toLowerCase().includes(term) ||
          r.legalEntity.toLowerCase().includes(term) ||
          (r.welcomeMessage && r.welcomeMessage.toLowerCase().includes(term));
        if (!match) return false;
      }

      // 2. Region Filter
      if (selectedRegion !== 'all') {
        const reg = getRestaurantRegion(r);
        if (reg !== selectedRegion) return false;
      }

      return true;
    });

    // Sort options
    return filtered.sort((a, b) => {
      if (sortBy === 'price_asc') {
        const priceA = a.defaultPlatePriceRwf || 1200;
        const priceB = b.defaultPlatePriceRwf || 1200;
        return priceA - priceB;
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      // 'popular': prioritize selected code, then by code order
      if (a.code === currentSelectedCode) return -1;
      if (b.code === currentSelectedCode) return 1;
      return a.code.localeCompare(b.code);
    });
  }, [restaurants, searchTerm, selectedRegion, sortBy, currentSelectedCode]);

  const handleSelect = (restoCode: string, mode: 'login' | 'register') => {
    if (rememberPreference && typeof window !== 'undefined') {
      try {
        localStorage.setItem('restopass_remembered_resto', restoCode);
      } catch {}
    }
    onSelectCafeteria(restoCode, mode);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                <span>Select Your Campus Cafeteria</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold border border-emerald-500/20">
                  {restaurants.length} Partnered
                </span>
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Choose where you eat to check meal plate balance or sign in to your pass
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Region Filter Bar */}
        <div className="p-4 bg-slate-900 border-b border-slate-800/80 space-y-3 shrink-0">
          {/* Live Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by campus, university, or cafeteria name (e.g. Huye, CST, AUCA, Musanze)..."
              className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-9 py-2.5 text-white placeholder-slate-500 text-xs sm:text-sm outline-hidden transition-all shadow-inner"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs font-semibold"
              >
                Clear
              </button>
            )}
          </div>

          {/* Region Tabs & Sort Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Regional Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all' as RegionFilter, label: 'All Campuses' },
                { id: 'kigali' as RegionFilter, label: 'Kigali' },
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
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer text-[11px] ${
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

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="hidden sm:inline">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-medium text-[11px] outline-hidden cursor-pointer"
              >
                <option value="popular">Recommended</option>
                <option value="price_asc">Lowest Meal Price</option>
                <option value="name_asc">Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scrollable Cafeteria Cards List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-slate-800/40">
          {filteredAndSortedRestaurants.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-slate-400 flex items-center justify-center mx-auto">
                <Utensils className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-white">No Cafeterias Found</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No onboarded dining facility matches &ldquo;{searchTerm}&rdquo;. Try another campus or search term.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedRegion('all');
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredAndSortedRestaurants.map((resto) => {
              const isSelected = resto.code === currentSelectedCode;
              const platePrice = resto.defaultPlatePriceRwf || 1150;

              return (
                <div
                  key={resto.code}
                  className={`pt-3 first:pt-0 p-3.5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-emerald-950/20 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20'
                      : 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800/80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Facility Info */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/80 text-emerald-400 font-mono text-xs font-black flex items-center justify-center shrink-0 shadow-inner mt-0.5">
                        {resto.code}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xs sm:text-sm font-black text-white truncate">
                            {resto.name}
                          </h3>
                          {isSelected && (
                            <span className="px-2 py-0.2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>Active</span>
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{resto.address}</span>
                        </div>

                        {/* Price & Package Tag */}
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-mono font-bold text-emerald-400">
                            {platePrice.toLocaleString()} RWF
                          </span>
                          <span className="text-slate-500">/ plate</span>
                          <span className="text-slate-600">&bull;</span>
                          <span className="text-slate-400">
                            30-Plate Pack: {(platePrice * 30 * 0.95).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} RWF
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSelect(resto.code, 'login')}
                        className="py-1.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Sign In &rarr;</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelect(resto.code, 'register')}
                        className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white font-semibold text-xs flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="hidden sm:inline">Register</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Bar: Remember Choice & Quick Help */}
        <div className="p-3.5 sm:p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shrink-0">
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberPreference}
              onChange={(e) => setRememberPreference(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500/20"
            />
            <span className="text-[11px]">Remember my campus cafeteria on this device</span>
          </label>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Dining in-store? Scan your cafeteria table QR for instant access.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
