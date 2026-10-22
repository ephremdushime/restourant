import React, { useState, useEffect } from 'react';
import { Restaurant, Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import { translations } from '../../services/i18n';
import { sound } from '../../services/audioService';
import {
  Palette,
  Image as ImageIcon,
  CheckCircle2,
  Building2,
  Phone,
  Mail,
  MapPin,
  Sparkles,
  Printer,
  CreditCard,
  QrCode,
  ShieldCheck,
  Eye,
} from 'lucide-react';

interface RestaurantAppearanceManagerProps {
  restaurantCode: string;
  language: Language;
  onOpenCardStudio?: () => void;
}

const THEME_COLORS = [
  { id: 'emerald', label: 'Campus Emerald', hex: '#10b981', class: 'bg-emerald-500' },
  { id: 'blue', label: 'Sapphire Blue', hex: '#2563eb', class: 'bg-blue-600' },
  { id: 'amber', label: 'Golden Amber', hex: '#d97706', class: 'bg-amber-500' },
  { id: 'purple', label: 'Royal Purple', hex: '#9333ea', class: 'bg-purple-600' },
  { id: 'rose', label: 'Crimson Red', hex: '#e11d48', class: 'bg-rose-500' },
];

const LOGO_PRESETS = [
  {
    id: 'campus',
    label: 'Campus Hall',
    url: '/src/assets/images/logo_resto_01_1790979383823.png',
  },
  {
    id: 'bistro',
    label: 'Modern Bistro',
    url: '/src/assets/images/logo_resto_02_1790979391039.png',
  },
  {
    id: 'buffet',
    label: 'Buffet Feast',
    url: '/src/assets/images/hero_dining_hall_1790979374020.jpg',
  },
];

export const RestaurantAppearanceManager: React.FC<RestaurantAppearanceManagerProps> = ({
  restaurantCode,
  language,
  onOpenCardStudio,
}) => {
  const t = translations[language] || translations.en;
  const currentResto = restoStore.getState().restaurants.find((r) => r.code === restaurantCode) || restoStore.getCurrentRestaurant();

  const [name, setName] = useState(currentResto?.name || 'Kigali Campus Resto');
  const [legalEntity, setLegalEntity] = useState(currentResto?.legalEntity || 'Campus Food Services Ltd');
  const [phone, setPhone] = useState(currentResto?.phone || '+250 788 123 456');
  const [email, setEmail] = useState(currentResto?.email || 'manager@kigalicampusresto.rw');
  const [address, setAddress] = useState(currentResto?.address || 'University Boulevard, Kigali, Rwanda');
  const [currency, setCurrency] = useState(currentResto?.currency || 'RWF');
  const [logoUrl, setLogoUrl] = useState(currentResto?.logoUrl || LOGO_PRESETS[0].url);
  const [primaryColor, setPrimaryColor] = useState(currentResto?.primaryColor || 'emerald');
  const [welcomeMessage, setWelcomeMessage] = useState(
    currentResto?.welcomeMessage || 'Murakaza neza! Fresh healthy buffet dining every day.'
  );
  const [badgeStyle, setBadgeStyle] = useState<'gold' | 'emerald' | 'blue' | 'dark'>(
    (currentResto?.badgeStyle as any) || 'emerald'
  );

  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (currentResto) {
      setName(currentResto.name);
      setLegalEntity(currentResto.legalEntity || '');
      setPhone(currentResto.phone || '');
      setEmail(currentResto.email || '');
      setAddress(currentResto.address || '');
      setCurrency(currentResto.currency || 'RWF');
      if (currentResto.logoUrl) setLogoUrl(currentResto.logoUrl);
      if (currentResto.primaryColor) setPrimaryColor(currentResto.primaryColor);
      if (currentResto.welcomeMessage) setWelcomeMessage(currentResto.welcomeMessage);
      if (currentResto.badgeStyle) setBadgeStyle(currentResto.badgeStyle);
    }
  }, [currentResto, restaurantCode]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    restoStore.updateRestaurantProfile(restaurantCode, {
      name: name.trim(),
      legalEntity: legalEntity.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      currency: currency.trim(),
      logoUrl: logoUrl.trim(),
      primaryColor,
      welcomeMessage: welcomeMessage.trim(),
      badgeStyle,
    });

    sound.playSuccessBeep();
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {savedToast && (
        <div className="p-4 rounded-2xl bg-emerald-950 border border-emerald-600 text-emerald-200 text-xs font-semibold flex items-center gap-2 shadow-2xl animate-in slide-in-from-top">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{t.appearance?.changesSavedToast || 'Restaurant appearance and branding updated successfully!'}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              {t.appearance?.title || 'Restaurant Identity & Appearance'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t.appearance?.subtitle || 'Customize cafeteria name, visual theme color, card badge styling, and patron welcome message.'}
            </p>
          </div>
        </div>

        {onOpenCardStudio && (
          <button
            type="button"
            onClick={onOpenCardStudio}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer border border-slate-700"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>{t.appearance?.openCardStudio || 'Card Print Studio'}</span>
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 & 2: Form Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Basic Identity */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-md">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span>Cafeteria Brand Identity</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-semibold text-slate-300">
                    {t.appearance?.restoName || 'Restaurant Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-sm focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">
                    {t.appearance?.legalEntity || 'Legal Entity'}
                  </label>
                  <input
                    type="text"
                    value={legalEntity}
                    onChange={(e) => setLegalEntity(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">
                    {t.appearance?.phone || 'Contact Phone'}
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">
                    {t.appearance?.email || 'Contact Email'}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">
                    {t.appearance?.address || 'Physical Address'}
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* 2. Visual Theme & Color */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-md">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Palette className="w-4 h-4 text-emerald-400" />
                <span>{t.appearance?.brandColor || 'Brand Accent Color'}</span>
              </h3>

              <div className="flex flex-wrap gap-3">
                {THEME_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPrimaryColor(c.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      primaryColor === c.id
                        ? 'bg-slate-800 text-white border-white shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full ${c.class}`} />
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>

              {/* Customer App Welcome Slogan */}
              <div className="space-y-1 pt-2">
                <label className="font-semibold text-slate-300 text-xs block">
                  {t.appearance?.welcomeBanner || 'Customer Mobile App Welcome Slogan'}
                </label>
                <input
                  type="text"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  placeholder={t.appearance?.welcomeBannerPlaceholder || 'e.g. Welcome to Kigali Campus Resto!'}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-emerald-500 outline-hidden"
                />
              </div>
            </div>

            {/* 3. Badge Style Options */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-md">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>{t.appearance?.badgeStyle || 'Member Card Badge Style'}</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  { id: 'emerald', label: t.appearance?.badgeEmerald || 'Cyber Emerald', accent: 'border-emerald-500 bg-emerald-950/40 text-emerald-300' },
                  { id: 'gold', label: t.appearance?.badgeGold || 'Classic Gold', accent: 'border-amber-500 bg-amber-950/40 text-amber-300' },
                  { id: 'blue', label: t.appearance?.badgeBlue || 'Campus Blue', accent: 'border-blue-500 bg-blue-950/40 text-blue-300' },
                  { id: 'dark', label: t.appearance?.badgeDark || 'Executive Midnight', accent: 'border-slate-600 bg-slate-950 text-slate-300' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setBadgeStyle(s.id as any)}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer font-bold ${
                      badgeStyle === s.id
                        ? `${s.accent} ring-2 ring-emerald-500 shadow-md`
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Column 3: Live Visual Card Badge Preview */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-md sticky top-24">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span>{t.appearance?.previewCardBadge || 'Live Badge Preview'}</span>
                </h3>
                <span className="text-[10px] font-mono text-slate-500">ISO/IEC 7810 ID-1</span>
              </div>

              {/* Physical PVC Card Badge Preview Widget */}
              <div
                className={`w-full aspect-[1.586/1] rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden shadow-2xl transition-all ${
                  badgeStyle === 'emerald'
                    ? 'bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 border-2 border-emerald-500/80 text-white'
                    : badgeStyle === 'gold'
                    ? 'bg-gradient-to-br from-slate-900 via-amber-950 to-black border-2 border-amber-500/80 text-white'
                    : badgeStyle === 'blue'
                    ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-black border-2 border-blue-500/80 text-white'
                    : 'bg-gradient-to-br from-slate-900 via-black to-slate-950 border-2 border-slate-700 text-white'
                }`}
              >
                {/* Header of Badge */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono font-bold tracking-widest uppercase opacity-70">
                      RESTOPASS BADGE · {restaurantCode}
                    </div>
                    <div className="text-sm font-black truncate max-w-[180px] leading-tight">
                      {name}
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-black/60 border border-white/20 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                </div>

                {/* Body of Badge */}
                <div className="flex items-center gap-3">
                  <img
                    src="/src/assets/images/avatar_student_male_1790979380050.jpg"
                    alt="Sample Student"
                    className="w-12 h-14 rounded-lg object-cover border border-white/20 shrink-0"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-bold truncate">Jean-Paul Habimana</div>
                    <div className="text-[10px] font-mono opacity-80">Member #28491</div>
                    <div className="text-[9px] opacity-70">University of Rwanda</div>
                    <span className="inline-block px-1.5 py-0.2 rounded text-[8px] font-bold uppercase bg-emerald-500/20 text-emerald-300">
                      Active Pass
                    </span>
                  </div>
                </div>

                {/* Footer of Badge with barcode lines */}
                <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[9px] font-mono opacity-70">
                  <span>c1.28491.1.AUTH</span>
                  <span>PREPAID MEAL AUTHORITY</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 leading-relaxed">
                This badge template will be used when printing physical PVC cards at the cashier desk and in Card Studio.
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t.appearance?.saveChanges || 'Save Appearance & Identity'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
