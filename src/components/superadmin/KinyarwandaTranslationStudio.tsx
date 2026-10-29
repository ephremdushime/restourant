import React, { useState, useMemo } from 'react';
import { Language } from '../../types';
import { restoStore } from '../../store/restoStore';
import {
  translations,
  flattenTranslations,
  unflattenTranslations,
} from '../../services/i18n';
import {
  Languages,
  Search,
  Save,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Filter,
  Sparkles,
  Globe,
  FileText,
  BookOpen,
  ArrowRight,
  Eye,
} from 'lucide-react';

interface Props {
  currentLanguage: Language;
}

interface TranslationItem {
  key: string;
  domain: string;
  enText: string;
  defaultVal: string;
  currentVal: string;
  isModified: boolean;
}

const DOMAINS: { id: string; label: string; prefix?: string[] }[] = [
  { id: 'all', label: 'All System Phrases' },
  { id: 'scanner', label: 'Scanner Stand POS', prefix: ['scanner', 'roles'] },
  { id: 'customer', label: 'Customer Web Portal', prefix: ['customer', 'customerApp'] },
  { id: 'boss', label: 'Restaurant Boss & Admin', prefix: ['admin', 'approvals', 'reconciliation', 'branches', 'stationUsers', 'pricing', 'reports', 'appearance'] },
  { id: 'auth', label: 'Auth & Security', prefix: ['auth', 'security'] },
  { id: 'nav', label: 'Navigation & Common', prefix: ['nav', 'common', 'notifications', 'errors', 'cardStudio'] },
];

export const KinyarwandaTranslationStudio: React.FC<Props> = ({ currentLanguage }) => {
  const [selectedLang, setSelectedLang] = useState<Language>('rw');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Retrieve baseline and active translations
  const baseEnFlat = useMemo(() => flattenTranslations(translations.en), []);
  const baseSelectedFlat = useMemo(() => flattenTranslations(translations[selectedLang] || {}), [selectedLang]);
  const customSavedFlat = useMemo(() => {
    const custom = restoStore.getState().customTranslations?.[selectedLang] || {};
    return flattenTranslations(custom);
  }, [selectedLang]);

  // Combine into structured list of items
  const allItems: TranslationItem[] = useMemo(() => {
    const keys = Object.keys(baseEnFlat);
    return keys.map((key) => {
      const parts = key.split('.');
      const domain = parts[0] || 'general';
      const enText = baseEnFlat[key] || '';
      const defaultVal = baseSelectedFlat[key] || enText;
      const currentVal =
        editedValues[key] !== undefined
          ? editedValues[key]
          : customSavedFlat[key] !== undefined
          ? customSavedFlat[key]
          : defaultVal;

      const isModified = currentVal !== defaultVal;

      return {
        key,
        domain,
        enText,
        defaultVal,
        currentVal,
        isModified,
      };
    });
  }, [baseEnFlat, baseSelectedFlat, customSavedFlat, editedValues]);

  // Filter items by domain and search query
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const domainObj = DOMAINS.find((d) => d.id === selectedDomain);

    return allItems.filter((item) => {
      // Domain filter
      if (domainObj && domainObj.prefix && domainObj.prefix.length > 0) {
        const matchesDomain = domainObj.prefix.some((p) => item.key.startsWith(`${p}.`) || item.key === p);
        if (!matchesDomain) return false;
      }

      // Search filter
      if (!query) return true;
      return (
        item.key.toLowerCase().includes(query) ||
        item.enText.toLowerCase().includes(query) ||
        item.currentVal.toLowerCase().includes(query)
      );
    });
  }, [allItems, selectedDomain, searchQuery]);

  const modifiedCount = useMemo(() => {
    return allItems.filter((item) => item.isModified).length;
  }, [allItems]);

  const handleFieldChange = (key: string, value: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetSingle = (key: string, defaultVal: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [key]: defaultVal,
    }));
  };

  const handleSaveAll = () => {
    // Unflatten all current values into a nested dictionary
    const flatToSave: Record<string, string> = {};
    for (const item of allItems) {
      if (item.isModified) {
        flatToSave[item.key] = item.currentVal;
      }
    }

    const unflattened = unflattenTranslations(flatToSave);
    restoStore.saveCustomTranslations(selectedLang, unflattened);

    setSaveSuccessNotice(
      `Successfully applied live ${
        selectedLang === 'rw' ? 'Kinyarwanda' : selectedLang.toUpperCase()
      } translations! All screens will reflect changes immediately.`
    );
    setTimeout(() => setSaveSuccessNotice(null), 6000);
  };

  const handleResetToFactoryDefaults = () => {
    if (
      window.confirm(
        `Are you sure you want to reset all custom translations for ${selectedLang.toUpperCase()} to factory defaults? This cannot be undone.`
      )
    ) {
      restoStore.resetCustomTranslations(selectedLang);
      setEditedValues({});
      setSaveSuccessNotice('Reset to factory defaults completed.');
      setTimeout(() => setSaveSuccessNotice(null), 5000);
    }
  };

  const handleExportJson = () => {
    const flatExport: Record<string, string> = {};
    for (const item of allItems) {
      flatExport[item.key] = item.currentVal;
    }
    const unflattened = unflattenTranslations(flatExport);
    const jsonStr = JSON.stringify(unflattened, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restopass_${selectedLang}_translations_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      const flattened = flattenTranslations(parsed);
      const newEdited = { ...editedValues };
      let count = 0;
      for (const [k, v] of Object.entries(flattened)) {
        if (baseEnFlat[k] !== undefined) {
          newEdited[k] = v;
          count++;
        }
      }
      setEditedValues(newEdited);
      setImportModalOpen(false);
      setImportJsonText('');
      setImportError(null);
      setSaveSuccessNotice(`Imported ${count} phrases successfully! Tap "Save & Apply Live Translations" to activate.`);
      setTimeout(() => setSaveSuccessNotice(null), 6000);
    } catch (err: any) {
      setImportError(`Invalid JSON format: ${err.message || 'Could not parse'}`);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in">
      {/* Top Banner & Overview */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-950 to-blue-950/80 border border-slate-800 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">🇷🇼</span>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <span>Full Fluent Kinyarwanda &amp; System Translation CMS</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold border border-emerald-500/30">
                Live Studio
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Customize and refine every word across the Customer Portal, Scanner Stand, and Restaurant Admin into natural, fluent Kinyarwanda without touching source code. All changes propagate in real time and persist permanently.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportJson}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Download full JSON dictionary backup"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={() => setImportModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Import or paste JSON translations dictionary"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Import JSON</span>
          </button>

          <button
            onClick={handleResetToFactoryDefaults}
            className="px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-bold border border-rose-800/60 flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Revert back to default translations"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            onClick={handleSaveAll}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg flex items-center gap-2 cursor-pointer transition-transform active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>Save &amp; Apply Live Translations</span>
          </button>
        </div>
      </div>

      {saveSuccessNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold">{saveSuccessNotice}</span>
          </div>
          <span className="text-[10px] text-emerald-400/80 font-mono">Live Sync Active</span>
        </div>
      )}

      {/* Language Switcher, Metrics & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
        {/* Language Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setSelectedLang('rw')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedLang === 'rw'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🇷🇼</span>
            <span>Ikinyarwanda (Default)</span>
          </button>
          <button
            onClick={() => setSelectedLang('fr')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedLang === 'fr'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🇫🇷</span>
            <span>Français</span>
          </button>
          <button
            onClick={() => setSelectedLang('en')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedLang === 'en'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🇬🇧</span>
            <span>English (Baseline)</span>
          </button>
        </div>

        {/* Live Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search English key, English phrase, or translation..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Stats Pill */}
        <div className="flex items-center gap-2 text-xs font-mono shrink-0">
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            Showing: <strong>{filteredItems.length}</strong> of {allItems.length}
          </span>
          {modifiedCount > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/80 text-emerald-300 font-bold">
              {modifiedCount} Modified
            </span>
          )}
        </div>
      </div>

      {/* Domain Navigation Pills */}
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {DOMAINS.map((dom) => (
          <button
            key={dom.id}
            onClick={() => setSelectedDomain(dom.id)}
            className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
              selectedDomain === dom.id
                ? 'bg-sky-600 border-sky-500 text-white shadow-xs font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {dom.label}
          </button>
        ))}
      </div>

      {/* Translation Dictionary Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4 w-[28%]">System Key &amp; Domain</th>
                <th className="py-3 px-4 w-[34%]">English Reference (Original)</th>
                <th className="py-3 px-4 w-[38%]">
                  <div className="flex items-center justify-between">
                    <span>
                      {selectedLang === 'rw'
                        ? '🇷🇼 Kinyarwanda Translation (Editable)'
                        : `${selectedLang.toUpperCase()} Translation`}
                    </span>
                    <span className="text-[10px] lowercase font-normal text-slate-500">
                      Live Editable
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-slate-500">
                    No matching phrases found for "{searchQuery}".
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isLong = item.enText.length > 60 || item.currentVal.length > 60;
                  return (
                    <tr
                      key={item.key}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        item.isModified ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      {/* Key & Category */}
                      <td className="py-3 px-4 align-top space-y-1">
                        <div className="flex items-center gap-2">
                          {item.isModified && (
                            <span
                              className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                              title="Customized by Super Admin"
                            />
                          )}
                          <span className="font-mono text-[11px] font-bold text-amber-400 break-all">
                            {item.key}
                          </span>
                        </div>
                        <div className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">
                          {item.domain}
                        </div>
                      </td>

                      {/* English Baseline Reference */}
                      <td className="py-3 px-4 align-top text-slate-300 leading-relaxed font-sans select-text">
                        {item.enText}
                      </td>

                      {/* Editable Kinyarwanda Field */}
                      <td className="py-3 px-4 align-top space-y-1.5">
                        <div className="relative">
                          {isLong ? (
                            <textarea
                              rows={2}
                              value={item.currentVal}
                              onChange={(e) => handleFieldChange(item.key, e.target.value)}
                              className={`w-full p-2.5 rounded-xl text-xs bg-slate-950 border transition-all focus:outline-none leading-relaxed ${
                                item.isModified
                                  ? 'border-emerald-500 text-white font-medium bg-emerald-950/10 focus:border-emerald-400'
                                  : 'border-slate-800 text-slate-200 focus:border-amber-500'
                              }`}
                            />
                          ) : (
                            <input
                              type="text"
                              value={item.currentVal}
                              onChange={(e) => handleFieldChange(item.key, e.target.value)}
                              className={`w-full px-3 py-2 rounded-xl text-xs bg-slate-950 border transition-all focus:outline-none ${
                                item.isModified
                                  ? 'border-emerald-500 text-white font-medium bg-emerald-950/10 focus:border-emerald-400'
                                  : 'border-slate-800 text-slate-200 focus:border-amber-500'
                              }`}
                            />
                          )}
                        </div>

                        {item.isModified && (
                          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                              <Sparkles className="w-3 h-3" />
                              Custom wording active
                            </span>
                            <button
                              type="button"
                              onClick={() => handleResetSingle(item.key, item.defaultVal)}
                              className="text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            >
                              Revert to default
                            </button>
                          </div>
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

      {/* Floating Bottom Quick-Save bar if modifications exist */}
      {modifiedCount > 0 && (
        <div className="sticky bottom-4 p-4 rounded-2xl bg-slate-900 border-2 border-emerald-500/80 shadow-2xl flex items-center justify-between z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <div className="text-xs font-bold text-white">
                You have {modifiedCount} custom translations ready to apply.
              </div>
              <div className="text-[11px] text-slate-400">
                Saving will update the live Kinyarwanda system dictionary across all customer, scanner, and boss dashboards.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAll}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg transition-transform active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save &amp; Apply Live</span>
            </button>
          </div>
        </div>
      )}

      {/* JSON Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-400" />
                <span>Import JSON Translations</span>
              </h3>
              <button
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Paste a valid translations JSON object below. Keys matching existing system phrases will be applied into the editor.
            </p>

            <textarea
              rows={10}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder={`{\n  "scanner": {\n    "readyToScan": "Tegereza gukoresha ikarita..."\n  }\n}`}
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
            />

            {importError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportJson}
                disabled={!importJsonText.trim()}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer"
              >
                Apply Imported JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
