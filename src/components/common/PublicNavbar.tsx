import React, { useState, useRef, useEffect } from 'react';
import { Language, UserRole } from '../../types';
import { restoStore } from '../../store/restoStore';
import {
  QrCode,
  Building2,
  Layers,
  Utensils,
  Sun,
  Moon,
  ChevronDown,
  Smartphone,
  Server,
  UserPlus,
  LogIn,
  Menu,
  X,
  ShieldCheck,
  Check,
} from 'lucide-react';

interface PublicNavbarProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onNavigateHome: () => void;
  onNavigateDirectory: () => void;
  onNavigateHowItWorks: () => void;
  onNavigateBusiness: () => void;
  onSelectRolePortal: (role: UserRole, restoCode?: string) => void;
  onSelectRegister: (restoCode?: string) => void;
  activePath?: string;
}

export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  language,
  onLanguageChange,
  theme,
  onToggleTheme,
  onNavigateHome,
  onNavigateDirectory,
  onNavigateHowItWorks,
  onNavigateBusiness,
  onSelectRolePortal,
  onSelectRegister,
  activePath = 'home',
}) => {
  const [isSignInDropdownOpen, setIsSignInDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsSignInDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/80 text-slate-100 select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* ========================================================
            1. BRAND LOGO
           ======================================================== */}
        <div className="flex items-center gap-6 shrink-0">
          <button
            type="button"
            onClick={onNavigateHome}
            className="flex items-center gap-2.5 group cursor-pointer text-left focus:outline-hidden"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-white group-hover:text-emerald-400 transition-colors">
                  RestoPass
                </span>
                <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
                  RW
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium tracking-tight hidden sm:block">
                Digital Campus Dining
              </span>
            </div>
          </button>

          {/* ========================================================
              2. DESKTOP MARKETING LINKS
             ======================================================== */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-semibold text-slate-300">
            <button
              type="button"
              onClick={onNavigateDirectory}
              className="px-3 py-1.5 rounded-xl hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
            >
              Facilities
            </button>
            <button
              type="button"
              onClick={onNavigateHowItWorks}
              className="px-3 py-1.5 rounded-xl hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={onNavigateBusiness}
              className="px-3 py-1.5 rounded-xl hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
            >
              Partner With Us
            </button>
          </nav>
        </div>

        {/* ========================================================
            3. ACTIONS ZONE (Language, Theme, Diner Sign In, Register)
           ======================================================== */}
        <div className="flex items-center gap-2.5">
          {/* Language Switcher */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-0.5 text-[11px] font-bold">
            {(['en', 'rw', 'fr'] as Language[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => onLanguageChange(lang)}
                className={`px-2 py-1 rounded-lg uppercase transition-colors cursor-pointer ${
                  language === lang
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          {/* Theme Switcher */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          {/* Direct Student / Diner Pass Sign In (No admin or scanner exposure) */}
          <button
            type="button"
            onClick={() => onSelectRolePortal('customer')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700/80 text-xs font-bold text-slate-200 hover:text-white transition-all cursor-pointer shadow-xs"
          >
            <LogIn className="w-3.5 h-3.5 text-emerald-400" />
            <span>Diner Sign In</span>
          </button>

          {/* Primary CTA Button: Register for Pass */}
          <button
            type="button"
            onClick={() => onSelectRegister()}
            className="py-2 px-3.5 sm:px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/40 transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register for Pass</span>
          </button>

          {/* Mobile Menu Trigger */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950/98 p-4 space-y-3 animate-in slide-in-from-top-2">
          <div className="grid grid-cols-1 gap-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigateDirectory();
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900"
            >
              Dining Facilities
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigateHowItWorks();
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigateBusiness();
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900"
            >
              Partner With Us
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-2">
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onSelectRolePortal('customer');
              }}
              className="w-full text-center px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-400" />
              <span>Diner Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onSelectRegister();
              }}
              className="w-full text-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-xs font-black text-slate-950 flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register for Pass</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
