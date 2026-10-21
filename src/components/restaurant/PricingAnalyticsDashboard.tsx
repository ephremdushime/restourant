import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  BarChart,
  ScatterChart,
  Line,
  Bar,
  Area,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Utensils,
  Plus,
  Edit2,
  Trash2,
  Sliders,
  Check,
  X,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Sparkles,
  BarChart3,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import { MenuItem, MenuCategory } from '../../types';
import { restoStore } from '../../store/restoStore';
import {
  pricingAnalytics,
  DailyPricingTrendPoint,
  MenuItemElasticityMetric,
  CATEGORY_COLORS,
  ITEM_PALETTE,
} from '../../services/pricingAnalyticsService';

interface PricingAnalyticsDashboardProps {
  restaurantCode: string;
}

type TimeframeOption = 7 | 14 | 30;
type ChartViewTab = 'dual_trend' | 'elasticity_scatter' | 'item_comparison' | 'category_breakdown';

export const PricingAnalyticsDashboard: React.FC<PricingAnalyticsDashboardProps> = ({
  restaurantCode,
}) => {
  // State
  const [timeframe, setTimeframe] = useState<TimeframeOption>(30);
  const [activeChartTab, setActiveChartTab] = useState<ChartViewTab>('dual_trend');
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'all'>('all');
  const [showItemLines, setShowItemLines] = useState<boolean>(true);

  // What-If Simulator State
  const [simulatorItemId, setSimulatorItemId] = useState<string>('');
  const [simulatorPriceInput, setSimulatorPriceInput] = useState<number>(1200);

  // Edit / Create Menu Item Modal State
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemName, setItemName] = useState<string>('');
  const [itemCategory, setItemCategory] = useState<MenuCategory>('lunch');
  const [itemPrice, setItemPrice] = useState<number>(1150);
  const [itemCost, setItemCost] = useState<number>(680);
  const [itemDescription, setItemDescription] = useState<string>('');
  const [itemTargetVolume, setItemTargetVolume] = useState<number>(100);
  const [itemAvailable, setItemAvailable] = useState<boolean>(true);

  // Inline Quick Price Edit State
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlinePriceValue, setInlinePriceValue] = useState<number>(0);

  // Notification / Toast
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Get current menu items from store
  const menuItems = restoStore.getRestaurantMenuItems(restaurantCode);
  const currentResto = restoStore.getCurrentRestaurant();

  // If simulatorItemId is unset, pick first menu item
  React.useEffect(() => {
    if ((!simulatorItemId || !menuItems.find((i) => i.id === simulatorItemId)) && menuItems.length > 0) {
      setSimulatorItemId(menuItems[0].id);
      setSimulatorPriceInput(menuItems[0].priceRwf);
    }
  }, [menuItems, simulatorItemId]);

  // Compute metrics and trends via PricingAnalyticsService
  const dailyTrends = useMemo(() => {
    return pricingAnalytics.getDailyTrends(restaurantCode, timeframe);
  }, [restaurantCode, timeframe, menuItems]);

  const itemMetrics = useMemo(() => {
    return pricingAnalytics.getMenuItemMetrics(restaurantCode, timeframe);
  }, [restaurantCode, timeframe, menuItems]);

  const demandCurvePoints = useMemo(() => {
    return pricingAnalytics.getDemandCurvePoints(restaurantCode);
  }, [restaurantCode, menuItems]);

  const categorySummaries = useMemo(() => {
    return pricingAnalytics.getCategorySummaries(restaurantCode);
  }, [restaurantCode, menuItems]);

  const kpis = useMemo(() => {
    return pricingAnalytics.getPortfolioKPIs(restaurantCode);
  }, [restaurantCode, menuItems]);

  // Simulator calculation
  const simulationResult = useMemo(() => {
    if (!simulatorItemId) return null;
    return pricingAnalytics.simulatePriceChange(simulatorItemId, simulatorPriceInput, restaurantCode);
  }, [simulatorItemId, simulatorPriceInput, restaurantCode, menuItems]);

  // Filtered menu items for table
  const filteredMetrics = useMemo(() => {
    if (selectedCategory === 'all') return itemMetrics;
    return itemMetrics.filter((m) => m.category === selectedCategory);
  }, [itemMetrics, selectedCategory]);

  // Handle open modal for create
  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setItemName('');
    setItemCategory('lunch');
    setItemPrice(1150);
    setItemCost(680);
    setItemDescription('');
    setItemTargetVolume(90);
    setItemAvailable(true);
    setEditModalOpen(true);
  };

  // Handle open modal for edit
  const handleOpenEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemCategory(item.category);
    setItemPrice(item.priceRwf);
    setItemCost(item.costRwf || Math.round(item.priceRwf * 0.58));
    setItemDescription(item.description);
    setItemTargetVolume(item.targetDailyVolume || 80);
    setItemAvailable(item.isAvailable);
    setEditModalOpen(true);
  };

  // Handle save menu item (create or update)
  const handleSaveMenuItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      showToast('Please enter a menu item name', 'error');
      return;
    }
    if (itemPrice < 100) {
      showToast('Price must be at least 100 RWF', 'error');
      return;
    }

    if (editingItem) {
      restoStore.updateMenuItem(
        editingItem.id,
        {
          name: itemName.trim(),
          category: itemCategory,
          priceRwf: itemPrice,
          costRwf: itemCost,
          description: itemDescription.trim(),
          targetDailyVolume: itemTargetVolume,
          isAvailable: itemAvailable,
        },
        'Manager'
      );
      showToast(`Updated "${itemName}" settings and price`);
    } else {
      restoStore.addMenuItem(
        {
          restaurantCode,
          name: itemName.trim(),
          category: itemCategory,
          priceRwf: itemPrice,
          costRwf: itemCost,
          description: itemDescription.trim(),
          targetDailyVolume: itemTargetVolume,
          isAvailable: itemAvailable,
        },
        'Manager'
      );
      showToast(`Added new menu item "${itemName}"`);
    }

    setEditModalOpen(false);
  };

  // Handle inline price update
  const handleSaveInlinePrice = (itemId: string) => {
    if (inlinePriceValue < 100) {
      showToast('Price must be at least 100 RWF', 'error');
      return;
    }
    restoStore.updateMenuItem(itemId, { priceRwf: inlinePriceValue }, 'Manager');
    setInlineEditingId(null);
    showToast(`Updated price to ${inlinePriceValue.toLocaleString()} RWF`);
  };

  // Handle delete item
  const handleDeleteItem = (item: MenuItem) => {
    if (confirm(`Are you sure you want to remove "${item.name}" from the menu?`)) {
      restoStore.deleteMenuItem(item.id, restaurantCode, 'Manager');
      showToast(`Removed "${item.name}"`);
    }
  };

  // Apply simulated price directly to menu item
  const handleApplySimulatedPrice = () => {
    if (!simulationResult) return;
    restoStore.updateMenuItem(simulationResult.item.id, { priceRwf: simulationResult.proposedPriceRwf }, 'Manager');
    showToast(
      `Applied new price of ${simulationResult.proposedPriceRwf.toLocaleString()} RWF to ${simulationResult.item.name}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium transition-all shadow-lg ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-800'
              : 'bg-rose-950/90 text-rose-300 border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-white p-1 rounded-sm"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Menu Item Pricing &amp; Consumption Volume Trends
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span>{currentResto?.name || restaurantCode}</span>
                <span aria-hidden="true">·</span>
                <span>Demand elasticity &amp; daily plate volume analytics</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeframe Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            {([7, 14, 30] as TimeframeOption[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setTimeframe(d)}
                className={`px-3 py-1.5 font-mono font-bold rounded-lg transition-colors cursor-pointer ${
                  timeframe === d
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>

          {/* Add Menu Item Button */}
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Menu Item</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* KPI 1: Daily Consumption Volume */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider flex items-center justify-between">
            <span>Daily Consumption Volume</span>
            <Utensils className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {kpis.totalDailyVolume.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">plates/day</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {kpis.monthTotalPlates.toLocaleString()} meals in {timeframe} days
          </div>
        </div>

        {/* KPI 2: Weighted Average Meal Price */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider flex items-center justify-between">
            <span>Avg Plate Price</span>
            <DollarSign className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {kpis.weightedAvgPrice.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">RWF</span>
          </div>
          <div className="text-[11px] text-slate-400">Weighted by consumption mix</div>
        </div>

        {/* KPI 3: Daily Cafeteria Revenue */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider flex items-center justify-between">
            <span>Daily Gross Revenue</span>
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {Math.round(kpis.totalDailyRevenue / 1000).toLocaleString()}k
            <span className="text-xs font-normal text-slate-400 ml-1">RWF/day</span>
          </div>
          <div className="text-[11px] text-slate-400">
            ~{Math.round(kpis.monthTotalRevenue / 1000000 * 10) / 10}M RWF / month
          </div>
        </div>

        {/* KPI 4: Price Elasticity Index */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider flex items-center justify-between">
            <span>Elasticity Index ($E_d$)</span>
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {kpis.weightedElasticity}
          </div>
          <div className="text-[11px] text-slate-400">
            {Math.abs(kpis.weightedElasticity) < 1 ? 'Moderately Inelastic' : 'Price Sensitive'}
          </div>
        </div>

        {/* KPI 5: Revenue Opportunity */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1 col-span-2 lg:col-span-1">
          <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider flex items-center justify-between">
            <span>Optimized Target</span>
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="text-2xl font-black text-violet-300 font-mono">
            +{Math.round(kpis.potentialRevenueGainRwf).toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">RWF</span>
          </div>
          <div className="text-[11px] text-emerald-400">Potential daily uplift</div>
        </div>
      </div>

      {/* Chart Section Header & Navigation Tabs */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setActiveChartTab('dual_trend')}
              className={`px-3 py-1.5 font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeChartTab === 'dual_trend'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Timeline (Price vs Volume)
            </button>

            <button
              type="button"
              onClick={() => setActiveChartTab('elasticity_scatter')}
              className={`px-3 py-1.5 font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeChartTab === 'elasticity_scatter'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Price Elasticity &amp; Demand Curve
            </button>

            <button
              type="button"
              onClick={() => setActiveChartTab('item_comparison')}
              className={`px-3 py-1.5 font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeChartTab === 'item_comparison'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Menu Items Comparison
            </button>

            <button
              type="button"
              onClick={() => setActiveChartTab('category_breakdown')}
              className={`px-3 py-1.5 font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeChartTab === 'category_breakdown'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Meal Window Breakdown
            </button>
          </div>

          {activeChartTab === 'dual_trend' && (
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showItemLines}
                onChange={(e) => setShowItemLines(e.target.checked)}
                className="w-4 h-4 rounded-sm bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0"
              />
              <span>Show individual menu item lines</span>
            </label>
          )}
        </div>

        {/* TAB 1: DUAL-AXIS TIMELINE CHART (Daily Plates Volume vs Price) */}
        {activeChartTab === 'dual_trend' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
                  <span>Daily Meal Volume (Plates Served)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-xs bg-amber-400 inline-block" />
                  <span>Weighted Average Meal Price (RWF)</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {timeframe} days historical pattern
              </div>
            </div>

            <div className="w-full h-80 sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTrends} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="displayDate"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                  />
                  {/* Left Y Axis: Volume */}
                  <YAxis
                    yAxisId="left"
                    stroke="#10b981"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                    tickFormatter={(v) => `${v}p`}
                  />
                  {/* Right Y Axis: Price */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#f59e0b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                    tickFormatter={(v) => `${v} RWF`}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                    formatter={(value: any, name: any) => {
                      if (name === 'totalPlates') return [`${value} plates`, 'Total Meal Volume'];
                      if (name === 'weightedAvgPriceRwf') return [`${value.toLocaleString()} RWF`, 'Weighted Avg Price'];
                      if (name === 'totalRevenueRwf') return [`${value.toLocaleString()} RWF`, 'Daily Revenue'];
                      // Item specific keys
                      if (typeof name === 'string' && name.startsWith('vol_')) {
                        const itemId = name.replace('vol_', '');
                        const itm = menuItems.find((i) => i.id === itemId);
                        return [`${value} plates`, itm?.name || 'Item Volume'];
                      }
                      return [value, name || ''];
                    }}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) {
                        const day = payload[0].payload as DailyPricingTrendPoint;
                        return `${day.displayDate} (${day.dayOfWeek}) · Revenue: ${day.totalRevenueRwf.toLocaleString()} RWF`;
                      }
                      return label;
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(val) => {
                      if (val === 'totalPlates') return 'Total Daily Volume (Plates)';
                      if (val === 'weightedAvgPriceRwf') return 'Weighted Avg Price (RWF)';
                      if (val.startsWith('vol_')) {
                        const itm = menuItems.find((i) => i.id === val.replace('vol_', ''));
                        return itm ? itm.name : val;
                      }
                      return val;
                    }}
                  />

                  {/* Volume Bar */}
                  <Bar
                    yAxisId="left"
                    dataKey="totalPlates"
                    fill="#10b981"
                    opacity={0.8}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />

                  {/* Weighted Price Line */}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="weightedAvgPriceRwf"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#f59e0b' }}
                    activeDot={{ r: 6 }}
                  />

                  {/* Optional item volume lines */}
                  {showItemLines &&
                    menuItems.slice(0, 4).map((item, idx) => (
                      <Line
                        key={item.id}
                        yAxisId="left"
                        type="monotone"
                        dataKey={`vol_${item.id}`}
                        stroke={ITEM_PALETTE[(idx + 2) % ITEM_PALETTE.length]}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">Observation:</strong> Higher daily consumption volume is recorded on weekdays (Tue–Thu), where average plate prices remain between 1,100 RWF and 1,200 RWF. On weekends, lower student footfall reduces volume while higher-priced specials increase the weighted average price per meal.
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRICE ELASTICITY & DEMAND CURVE (Price vs Daily Volume Scatter & Trend) */}
        {activeChartTab === 'elasticity_scatter' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div>
                <strong>Downard-Sloping Demand Curve:</strong> Plotting menu item prices (X-axis, RWF) against daily meal consumption volume (Y-axis, plates/day).
              </div>
              <div className="text-[11px] text-emerald-400 font-mono">
                Optimal Peak: ~1,150–1,250 RWF
              </div>
            </div>

            <div className="w-full h-80 sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={demandCurvePoints} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="priceRwf"
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `${v} RWF`}
                    label={{ value: 'Menu Item Price (RWF)', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 12 }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `${v}p`}
                    label={{ value: 'Daily Meal Volume (Plates/Day)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                    formatter={(v: any, name: any) => {
                      if (name === 'projectedVolume') return [`${v} plates/day`, 'Estimated Daily Volume'];
                      if (name === 'projectedRevenueRwf') return [`${v.toLocaleString()} RWF`, 'Projected Daily Revenue'];
                      return [v, name || ''];
                    }}
                    labelFormatter={(v) => `Price: ${v} RWF`}
                  />

                  {/* Reference line for cafeteria weighted average price */}
                  <ReferenceLine
                    x={kpis.weightedAvgPrice}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{ value: `Avg Price (${kpis.weightedAvgPrice} RWF)`, fill: '#10b981', fontSize: 11, position: 'top' }}
                  />

                  {/* Projected Demand Curve Line */}
                  <Area
                    type="monotone"
                    dataKey="projectedVolume"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="#3b82f6"
                    fillOpacity={0.1}
                  />

                  {/* Scatter dots for actual menu items */}
                  {itemMetrics.map((item) => (
                    <ReferenceLine
                      key={item.id}
                      x={item.priceRwf}
                      stroke="#475569"
                      strokeDasharray="2 2"
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Menu Item Bubble Badges */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 pt-2">
              {itemMetrics.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 hover:border-slate-700 transition-colors"
                >
                  <div className="text-[11px] font-bold text-white truncate" title={item.name}>
                    {item.name}
                  </div>
                  <div className="flex items-baseline justify-between font-mono">
                    <span className="text-emerald-400 font-bold text-xs">{item.priceRwf} RWF</span>
                    <span className="text-slate-400 text-[11px]">{item.avgDailyVolume}p/day</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    $E_d$: <span className="font-mono text-slate-300">{item.elasticityCoefficient}</span> · {item.elasticityType}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: MENU ITEMS COMPARISON (Bar / Volume & Revenue Side-by-Side) */}
        {activeChartTab === 'item_comparison' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div>
                Compare current menu items by <strong>Daily Plates Consumed</strong> versus <strong>Daily Revenue Contribution (RWF)</strong>.
              </div>
            </div>

            <div className="w-full h-80 sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={itemMetrics} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={11}
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#10b981"
                    fontSize={11}
                    tickFormatter={(v) => `${v}p`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#3b82f6"
                    fontSize={11}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                    formatter={(v: any, name: any) => {
                      if (name === 'avgDailyVolume') return [`${v} plates/day`, 'Avg Daily Consumption'];
                      if (name === 'avgDailyRevenueRwf') return [`${v.toLocaleString()} RWF`, 'Daily Revenue'];
                      if (name === 'priceRwf') return [`${v.toLocaleString()} RWF`, 'Item Price'];
                      return [v, name || ''];
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />

                  <Bar
                    yAxisId="left"
                    dataKey="avgDailyVolume"
                    name="Daily Volume (Plates)"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="avgDailyRevenueRwf"
                    name="Daily Revenue (RWF)"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* TAB 4: MEAL WINDOW BREAKDOWN */}
        {activeChartTab === 'category_breakdown' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {categorySummaries.map((cat) => (
                <div
                  key={cat.category}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 relative overflow-hidden"
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: cat.color }}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold text-xs">{cat.label}</span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {cat.volumeSharePercent}% volume
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xl font-black text-white font-mono">
                      {cat.totalDailyVolume.toLocaleString()}
                      <span className="text-xs font-normal text-slate-400 ml-1">plates/day</span>
                    </div>
                    <div className="text-xs text-emerald-400 font-mono">
                      {cat.dailyRevenueRwf.toLocaleString()} RWF daily gross
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-850 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Avg Price Point:</span>
                    <span className="font-mono text-white font-semibold">
                      {cat.avgPriceRwf.toLocaleString()} RWF
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categorySummaries} layout="vertical" margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={11} tickFormatter={(v) => `${v}p`} />
                  <YAxis type="category" dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                    formatter={(v: any, name: any) => {
                      if (name === 'totalDailyVolume') return [`${v} plates/day`, 'Total Daily Volume'];
                      if (name === 'dailyRevenueRwf') return [`${v.toLocaleString()} RWF`, 'Daily Revenue'];
                      return [v, name || ''];
                    }}
                  />
                  <Bar dataKey="totalDailyVolume" name="Daily Plates" fill="#10b981" radius={[0, 4, 4, 0]}>
                    {categorySummaries.map((cat) => (
                      <Cell key={cat.category} fill={cat.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Interactive What-If Price Elasticity Simulator */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                What-If Price Elasticity &amp; Consumption Volume Simulator
              </h3>
              <p className="text-xs text-slate-400">
                Test how increasing or lowering a menu item's price will dynamically impact daily plate volume and total cafeteria revenue.
              </p>
            </div>
          </div>

          {/* Quick preset price buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            {[-15, -10, 0, 10, 15, 25].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  const currentItem = menuItems.find((i) => i.id === simulatorItemId);
                  if (currentItem) {
                    const newP = Math.round((currentItem.priceRwf * (1 + pct / 100)) / 50) * 50;
                    setSimulatorPriceInput(newP);
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold transition-colors cursor-pointer"
              >
                {pct > 0 ? `+${pct}%` : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div>
            <label className="text-xs text-slate-400 font-semibold block mb-1">Target Menu Item:</label>
            <select
              value={simulatorItemId}
              onChange={(e) => {
                const id = e.target.value;
                setSimulatorItemId(id);
                const item = menuItems.find((i) => i.id === id);
                if (item) setSimulatorPriceInput(item.priceRwf);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium text-xs focus:border-emerald-500 outline-hidden"
            >
              {menuItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.priceRwf.toLocaleString()} RWF)
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold">Simulated Price (RWF):</span>
              <span className="font-mono text-emerald-400 font-bold">
                {simulatorPriceInput.toLocaleString()} RWF
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={2500}
              step={50}
              value={simulatorPriceInput}
              onChange={(e) => setSimulatorPriceInput(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min={100}
                step={50}
                value={simulatorPriceInput}
                onChange={(e) => setSimulatorPriceInput(Math.max(100, Number(e.target.value)))}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold text-xs focus:border-emerald-500 outline-hidden pr-12"
              />
              <span className="absolute right-3 top-2 text-[11px] font-mono text-slate-500">RWF</span>
            </div>

            {simulationResult && simulationResult.proposedPriceRwf !== simulationResult.currentPriceRwf && (
              <button
                type="button"
                onClick={handleApplySimulatedPrice}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs whitespace-nowrap transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply to Menu</span>
              </button>
            )}
          </div>
        </div>

        {/* Simulator Results Cards */}
        {simulationResult && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {/* Metric 1: Price Shift */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Price Adjustment</div>
              <div className="flex items-baseline gap-2 mt-1 font-mono">
                <span className="text-lg font-black text-white">
                  {simulationResult.proposedPriceRwf.toLocaleString()} RWF
                </span>
                <span
                  className={`text-xs font-bold ${
                    simulationResult.priceChangePercent > 0
                      ? 'text-emerald-400'
                      : simulationResult.priceChangePercent < 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  }`}
                >
                  {simulationResult.priceChangePercent > 0
                    ? `+${Math.round(simulationResult.priceChangePercent)}%`
                    : `${Math.round(simulationResult.priceChangePercent)}%`}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Baseline: {simulationResult.currentPriceRwf.toLocaleString()} RWF
              </div>
            </div>

            {/* Metric 2: Projected Volume */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Projected Daily Volume</div>
              <div className="flex items-baseline gap-2 mt-1 font-mono">
                <span className="text-lg font-black text-emerald-400">
                  {simulationResult.projectedDailyVolume} plates
                </span>
                <span
                  className={`text-xs font-bold flex items-center ${
                    simulationResult.volumeDeltaPlates >= 0 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {simulationResult.volumeDeltaPlates >= 0 ? (
                    <ArrowUpRight className="w-3 h-3 inline mr-0.5" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 inline mr-0.5" />
                  )}
                  {simulationResult.volumeDeltaPlates > 0
                    ? `+${simulationResult.volumeDeltaPlates}`
                    : simulationResult.volumeDeltaPlates}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Baseline: {simulationResult.currentDailyVolume} plates/day
              </div>
            </div>

            {/* Metric 3: Projected Daily Revenue */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Projected Daily Revenue</div>
              <div className="flex items-baseline gap-2 mt-1 font-mono">
                <span className="text-lg font-black text-white">
                  {simulationResult.projectedDailyRevenueRwf.toLocaleString()} RWF
                </span>
                <span
                  className={`text-xs font-bold ${
                    simulationResult.revenueDeltaRwf >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {simulationResult.revenueDeltaRwf >= 0
                    ? `+${Math.round(simulationResult.revenueDeltaRwf).toLocaleString()}`
                    : Math.round(simulationResult.revenueDeltaRwf).toLocaleString()}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Baseline: {simulationResult.currentDailyRevenueRwf.toLocaleString()} RWF
              </div>
            </div>

            {/* Metric 4: Projected Gross Profit */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Projected Gross Profit</div>
              <div className="flex items-baseline gap-2 mt-1 font-mono">
                <span className="text-lg font-black text-emerald-300">
                  {simulationResult.projectedDailyProfitRwf.toLocaleString()} RWF
                </span>
                <span
                  className={`text-xs font-bold ${
                    simulationResult.profitDeltaRwf >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {simulationResult.profitDeltaRwf >= 0
                    ? `+${Math.round(simulationResult.profitDeltaRwf).toLocaleString()}`
                    : Math.round(simulationResult.profitDeltaRwf).toLocaleString()}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Daily food margin contribution
              </div>
            </div>
          </div>
        )}

        {/* Insight message */}
        {simulationResult && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
              simulationResult.verdict === 'optimal_increase' || simulationResult.verdict === 'discount_stimulus'
                ? 'bg-emerald-950/70 border border-emerald-800/80 text-emerald-300'
                : simulationResult.verdict === 'safe_increase'
                ? 'bg-blue-950/70 border border-blue-800/80 text-blue-300'
                : simulationResult.verdict === 'volume_loss_risk'
                ? 'bg-rose-950/70 border border-rose-800/80 text-rose-300'
                : 'bg-slate-950 border border-slate-800 text-slate-300'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0 text-emerald-400" />
            <div>
              <strong className="font-semibold">Economic Insight:</strong> {simulationResult.insightMessage}
            </div>
          </div>
        )}
      </div>

      {/* Menu Item Price Management Table */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Menu Item Pricing &amp; Consumption Master Registry
            </h3>
            <p className="text-xs text-slate-400">
              Manage live price points, margins, and target volumes across all cafeteria meal offerings.
            </p>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            {(['all', 'lunch', 'dinner', 'breakfast', 'special'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 font-medium rounded-lg transition-colors cursor-pointer capitalize ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/50 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Menu Item</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Price (RWF)</th>
                <th className="py-3 px-4 text-right">Cost &amp; Margin</th>
                <th className="py-3 px-4 text-right">Daily Volume</th>
                <th className="py-3 px-4 text-right">Daily Revenue</th>
                <th className="py-3 px-4 text-center">Elasticity ($E_d$)</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-sans">
              {filteredMetrics.map((item) => {
                const isEditingInline = inlineEditingId === item.id;

                return (
                  <tr key={item.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-xs">{item.name}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        {menuItems.find((i) => i.id === item.id)?.description || 'Cafeteria offering'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 capitalize text-slate-400">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
                      />
                      {item.category}
                    </td>

                    {/* Price with inline editor */}
                    <td className="py-3.5 px-4 text-right">
                      {isEditingInline ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            type="number"
                            min={100}
                            step={50}
                            value={inlinePriceValue}
                            onChange={(e) => setInlinePriceValue(Number(e.target.value))}
                            className="w-24 px-2 py-1 rounded-lg bg-slate-950 border border-emerald-500 text-white font-mono font-bold text-xs text-right outline-hidden"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveInlinePrice(item.id)}
                            className="p-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                            title="Save price"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setInlineEditingId(null)}
                            className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="group flex items-center justify-end gap-1.5">
                          <span className="font-mono font-bold text-white text-sm">
                            {item.priceRwf.toLocaleString()}{' '}
                            <span className="text-[11px] font-normal text-slate-400">RWF</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setInlineEditingId(item.id);
                              setInlinePriceValue(item.priceRwf);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-opacity cursor-pointer"
                            title="Quick edit price"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono text-[11px]">
                      <div className="text-slate-300">
                        {item.marginPercent}% margin
                      </div>
                      <div className="text-slate-500 text-[10px]">
                        Cost: {item.costRwf.toLocaleString()} RWF
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                      {item.avgDailyVolume} <span className="text-[11px] font-normal text-slate-400">plates</span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono text-white font-bold">
                      {item.avgDailyRevenueRwf.toLocaleString()}{' '}
                      <span className="text-[11px] font-normal text-slate-400">RWF</span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <div className="font-mono text-xs font-semibold text-slate-300">
                        {item.elasticityCoefficient}
                      </div>
                      <div className="text-[10px] text-slate-400">{item.elasticityType}</div>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSimulatorItemId(item.id);
                            setSimulatorPriceInput(item.priceRwf);
                            window.scrollTo({ top: 400, behavior: 'smooth' });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-[11px] transition-colors cursor-pointer"
                          title="Simulate price changes"
                        >
                          Simulate
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const raw = menuItems.find((i) => i.id === item.id);
                            if (raw) handleOpenEditModal(raw);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title="Edit full details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const raw = menuItems.find((i) => i.id === item.id);
                            if (raw) handleDeleteItem(raw);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete menu item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Menu Item Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
              </h3>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMenuItem} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Standard Campus Lunch Buffet"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-emerald-500 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Meal Category</label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value as MenuCategory)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-emerald-500 outline-hidden capitalize"
                  >
                    <option value="lunch">Lunch Buffet</option>
                    <option value="dinner">Evening Dinner</option>
                    <option value="breakfast">Breakfast</option>
                    <option value="special">Chef Special</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Target Daily Plates</label>
                  <input
                    type="number"
                    min={1}
                    value={itemTargetVolume}
                    onChange={(e) => setItemTargetVolume(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Serving Price (RWF) *</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={100}
                      step={50}
                      value={itemPrice}
                      onChange={(e) => setItemPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold text-xs focus:border-emerald-500 outline-hidden pr-12"
                    />
                    <span className="absolute right-3 top-2 text-[11px] font-mono text-slate-500">RWF</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Food Cost per Plate (RWF)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={itemCost}
                      onChange={(e) => setItemCost(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-emerald-500 outline-hidden pr-12"
                    />
                    <span className="absolute right-3 top-2 text-[11px] font-mono text-slate-500">RWF</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Description / Ingredients</label>
                <textarea
                  rows={2}
                  placeholder="Ingredients, sides, dietary allergens..."
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-emerald-500 outline-hidden resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="itemAvailableCheckbox"
                  checked={itemAvailable}
                  onChange={(e) => setItemAvailable(e.target.checked)}
                  className="w-4 h-4 rounded-sm bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0"
                />
                <label htmlFor="itemAvailableCheckbox" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Available on current daily serving line
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-md"
                >
                  {editingItem ? 'Save Changes' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
