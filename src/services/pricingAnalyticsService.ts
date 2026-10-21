import { MenuItem, MenuCategory } from '../types';
import { restoStore } from '../store/restoStore';

export interface DailyPricingTrendPoint {
  date: string;
  displayDate: string;
  dayOfWeek: string;
  isWeekend: boolean;
  totalPlates: number;
  totalRevenueRwf: number;
  weightedAvgPriceRwf: number;
  [key: string]: any; // dynamic keys for individual item volume/price
}

export interface MenuItemElasticityMetric {
  id: string;
  name: string;
  category: MenuCategory;
  priceRwf: number;
  costRwf: number;
  marginRwf: number;
  marginPercent: number;
  avgDailyVolume: number;
  avgDailyRevenueRwf: number;
  avgDailyProfitRwf: number;
  elasticityCoefficient: number;
  elasticityType: 'Inelastic' | 'Unit Elastic' | 'Elastic';
  volumeSensitivityDescription: string;
  optimalPriceRwf: number;
  optimalDailyRevenueRwf: number;
  optimalDailyVolume: number;
  color: string;
}

export interface DemandCurvePoint {
  priceRwf: number;
  projectedVolume: number;
  projectedRevenueRwf: number;
  isCurrentItemPrice?: boolean;
  itemName?: string;
}

export interface SimulationResult {
  item: MenuItem;
  currentPriceRwf: number;
  proposedPriceRwf: number;
  priceChangePercent: number;
  currentDailyVolume: number;
  projectedDailyVolume: number;
  volumeDeltaPlates: number;
  volumeChangePercent: number;
  currentDailyRevenueRwf: number;
  projectedDailyRevenueRwf: number;
  revenueDeltaRwf: number;
  revenueChangePercent: number;
  currentDailyProfitRwf: number;
  projectedDailyProfitRwf: number;
  profitDeltaRwf: number;
  elasticityCoefficient: number;
  verdict: 'optimal_increase' | 'safe_increase' | 'volume_loss_risk' | 'discount_stimulus' | 'neutral';
  insightMessage: string;
}

export interface CategoryPricingSummary {
  category: MenuCategory;
  label: string;
  itemCount: number;
  avgPriceRwf: number;
  totalDailyVolume: number;
  dailyRevenueRwf: number;
  volumeSharePercent: number;
  color: string;
}

// Category palette conforming to anti-slop guidelines
export const CATEGORY_COLORS: Record<MenuCategory, string> = {
  lunch: '#10b981', // emerald-500
  dinner: '#3b82f6', // blue-500
  breakfast: '#f59e0b', // amber-500
  special: '#8b5cf6', // violet-500
};

export const ITEM_PALETTE = [
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
];

class PricingAnalyticsService {
  /**
   * Deterministic pseudo-random number based on seed string to keep charts stable
   */
  private pseudoRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  }

  /**
   * Calculate daily consumption volume and weighted price trends over N days
   */
  public getDailyTrends(restaurantCode: string, days = 30): DailyPricingTrendPoint[] {
    const menuItems = restoStore.getRestaurantMenuItems(restaurantCode);
    const result: DailyPricingTrendPoint[] = [];

    const now = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Generate trend for each of the past N days (from oldest to newest)
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      const dayOfWeekNum = d.getDay();
      const isWeekend = dayOfWeekNum === 0 || dayOfWeekNum === 6;
      const dayOfWeek = dayNames[dayOfWeekNum];
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = `${monthNames[d.getMonth()]} ${d.getDate()}`;

      // Day factor: Campus cafeterias see peak volume Tue-Thu (~1.12), Mon/Fri (~0.98), Weekends (~0.62)
      const dayMultiplier = isWeekend ? 0.64 : dayOfWeekNum === 2 || dayOfWeekNum === 3 || dayOfWeekNum === 4 ? 1.14 : 0.96;

      let totalPlates = 0;
      let totalRevenue = 0;
      const point: DailyPricingTrendPoint = {
        date: dateStr,
        displayDate,
        dayOfWeek,
        isWeekend,
        totalPlates: 0,
        totalRevenueRwf: 0,
        weightedAvgPriceRwf: 0,
      };

      // Calculate each item's consumption volume on this day
      menuItems.forEach((item, idx) => {
        if (!item.isAvailable) return;

        const baseTarget = item.targetDailyVolume || 50;
        // Seeded variation (-15% to +15%)
        const noise = (this.pseudoRandom(`${restaurantCode}_${item.id}_${dateStr}`) - 0.5) * 0.3;
        // Price elasticity effect on daily consumption volume:
        // Items priced higher than 1200 RWF have lower volume variation; budget items fluctuate more
        const priceResistanceFactor = Math.max(0.7, 1 - (item.priceRwf - 1000) * 0.0003);
        const itemDailyPlates = Math.max(
          4,
          Math.round(baseTarget * dayMultiplier * (1 + noise) * priceResistanceFactor)
        );

        const itemRevenue = itemDailyPlates * item.priceRwf;
        totalPlates += itemDailyPlates;
        totalRevenue += itemRevenue;

        // Store item-specific volume and revenue
        point[`vol_${item.id}`] = itemDailyPlates;
        point[`rev_${item.id}`] = itemRevenue;
        point[`price_${item.id}`] = item.priceRwf;
      });

      point.totalPlates = totalPlates;
      point.totalRevenueRwf = totalRevenue;
      point.weightedAvgPriceRwf = totalPlates > 0 ? Math.round(totalRevenue / totalPlates) : 0;

      result.push(point);
    }

    return result;
  }

  /**
   * Computes menu item price elasticity metrics & optimal price points
   */
  public getMenuItemMetrics(restaurantCode: string, days = 30): MenuItemElasticityMetric[] {
    const menuItems = restoStore.getRestaurantMenuItems(restaurantCode);
    const dailyTrends = this.getDailyTrends(restaurantCode, days);

    return menuItems.map((item, idx) => {
      // Calculate avg daily volume over the period
      let volumeSum = 0;
      dailyTrends.forEach((day) => {
        volumeSum += day[`vol_${item.id}`] || 0;
      });
      const avgDailyVolume = Math.round(volumeSum / Math.max(1, dailyTrends.length));

      const priceRwf = item.priceRwf;
      const costRwf = item.costRwf || Math.round(priceRwf * 0.58);
      const marginRwf = priceRwf - costRwf;
      const marginPercent = Math.round((marginRwf / priceRwf) * 100);
      const avgDailyRevenueRwf = avgDailyVolume * priceRwf;
      const avgDailyProfitRwf = avgDailyVolume * marginRwf;

      // Price elasticity of demand (PED) in student campus cafeterias:
      // Breakfast and economy items are more price elastic (-1.1 to -1.35)
      // Core lunch buffet is moderately inelastic (-0.65 to -0.85) because it's a staple need
      // Specials and dinner have balanced elasticity (-0.8 to -1.05)
      let elasticityCoefficient = -0.75;
      if (item.category === 'breakfast' || item.name.toLowerCase().includes('economy')) {
        elasticityCoefficient = -1.22;
      } else if (item.category === 'lunch') {
        elasticityCoefficient = -0.68;
      } else if (item.category === 'dinner') {
        elasticityCoefficient = -0.85;
      } else if (item.category === 'special') {
        elasticityCoefficient = -1.15;
      }

      let elasticityType: 'Inelastic' | 'Unit Elastic' | 'Elastic' = 'Inelastic';
      let volumeSensitivityDescription = 'Volume is stable when price moves; staple cafeteria demand.';
      if (Math.abs(elasticityCoefficient) > 1.1) {
        elasticityType = 'Elastic';
        volumeSensitivityDescription = 'Highly price-sensitive; price hikes cause significant drop in volume.';
      } else if (Math.abs(elasticityCoefficient) >= 0.9 && Math.abs(elasticityCoefficient) <= 1.1) {
        elasticityType = 'Unit Elastic';
        volumeSensitivityDescription = 'Proportional volume reaction; revenue remains constant.';
      }

      // Derivation of optimal price point P* that maximizes revenue:
      // For demand curve Q = a - b*P:
      // Revenue R(P) = P * Q is maximized at the vertex.
      // In empirical campus pricing, optimal price balancing volume & revenue:
      const optimalPriceRwf = Math.round((priceRwf * (1 + (1 / Math.abs(elasticityCoefficient) - 1) * 0.15)) / 50) * 50;
      const priceRatio = optimalPriceRwf / priceRwf;
      const projectedVolumeFactor = Math.pow(priceRatio, elasticityCoefficient);
      const optimalDailyVolume = Math.round(avgDailyVolume * projectedVolumeFactor);
      const optimalDailyRevenueRwf = optimalDailyVolume * optimalPriceRwf;

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        priceRwf,
        costRwf,
        marginRwf,
        marginPercent,
        avgDailyVolume,
        avgDailyRevenueRwf,
        avgDailyProfitRwf,
        elasticityCoefficient,
        elasticityType,
        volumeSensitivityDescription,
        optimalPriceRwf,
        optimalDailyRevenueRwf,
        optimalDailyVolume,
        color: ITEM_PALETTE[idx % ITEM_PALETTE.length],
      };
    });
  }

  /**
   * Generates continuous Demand & Revenue curve points for price vs daily volume visualization
   */
  public getDemandCurvePoints(restaurantCode: string): DemandCurvePoint[] {
    const metrics = this.getMenuItemMetrics(restaurantCode, 30);
    const points: DemandCurvePoint[] = [];

    // Generate points from 600 RWF to 2000 RWF in 50 RWF steps
    for (let p = 600; p <= 2000; p += 50) {
      // Aggregate demand across all cafeteria items at benchmark price level
      let totalVolumeAtPrice = 0;

      metrics.forEach((m) => {
        const ratio = p / m.priceRwf;
        // Q = Q0 * (P / P0)^PED
        const estimatedItemVol = m.avgDailyVolume * Math.pow(ratio, m.elasticityCoefficient);
        totalVolumeAtPrice += Math.max(0, estimatedItemVol);
      });

      const avgItemVolume = Math.round(totalVolumeAtPrice / Math.max(1, metrics.length));
      const projectedRevenue = Math.round(avgItemVolume * p);

      const matchingItem = metrics.find((m) => Math.abs(m.priceRwf - p) < 25);

      points.push({
        priceRwf: p,
        projectedVolume: avgItemVolume,
        projectedRevenueRwf: projectedRevenue,
        isCurrentItemPrice: !!matchingItem,
        itemName: matchingItem?.name,
      });
    }

    return points;
  }

  /**
   * Interactive What-If Simulator: test a price change on any menu item
   */
  public simulatePriceChange(
    itemId: string,
    proposedPriceRwf: number,
    restaurantCode: string
  ): SimulationResult | null {
    const item = restoStore.getRestaurantMenuItems(restaurantCode).find((i) => i.id === itemId);
    if (!item) return null;

    const metrics = this.getMenuItemMetrics(restaurantCode, 30);
    const metric = metrics.find((m) => m.id === itemId);
    if (!metric) return null;

    const currentPriceRwf = item.priceRwf;
    const priceChangePercent = ((proposedPriceRwf - currentPriceRwf) / currentPriceRwf) * 100;

    // Use elasticity of demand to project volume change
    // %ΔQ = PED * %ΔP
    const volumeChangePercent = metric.elasticityCoefficient * priceChangePercent;
    const projectedDailyVolume = Math.max(1, Math.round(metric.avgDailyVolume * (1 + volumeChangePercent / 100)));
    const volumeDeltaPlates = projectedDailyVolume - metric.avgDailyVolume;

    const currentDailyRevenueRwf = metric.avgDailyRevenueRwf;
    const projectedDailyRevenueRwf = projectedDailyVolume * proposedPriceRwf;
    const revenueDeltaRwf = projectedDailyRevenueRwf - currentDailyRevenueRwf;
    const revenueChangePercent = currentDailyRevenueRwf > 0 ? (revenueDeltaRwf / currentDailyRevenueRwf) * 100 : 0;

    const costRwf = item.costRwf || Math.round(currentPriceRwf * 0.58);
    const currentDailyProfitRwf = metric.avgDailyVolume * (currentPriceRwf - costRwf);
    const projectedDailyProfitRwf = projectedDailyVolume * (proposedPriceRwf - costRwf);
    const profitDeltaRwf = projectedDailyProfitRwf - currentDailyProfitRwf;

    let verdict: SimulationResult['verdict'] = 'neutral';
    let insightMessage = '';

    if (revenueDeltaRwf > 0 && profitDeltaRwf > 0) {
      if (Math.abs(volumeChangePercent) < 15) {
        verdict = 'optimal_increase';
        insightMessage = `Optimal pricing window: Increases daily revenue by +${Math.round(revenueDeltaRwf).toLocaleString()} RWF with acceptable volume softening (${volumeDeltaPlates} plates/day).`;
      } else {
        verdict = 'safe_increase';
        insightMessage = `Revenue increases by +${Math.round(revenueDeltaRwf).toLocaleString()} RWF, but watch for member pushback due to a ${Math.round(Math.abs(volumeChangePercent))}% drop in daily consumption volume.`;
      }
    } else if (revenueDeltaRwf < 0 && priceChangePercent > 0) {
      verdict = 'volume_loss_risk';
      insightMessage = `Excessive price increase! Elasticity penalty (-${Math.round(Math.abs(volumeChangePercent))}%) outweighs the price hike, reducing overall cafeteria intake by ${Math.round(Math.abs(revenueDeltaRwf)).toLocaleString()} RWF/day.`;
    } else if (priceChangePercent < 0 && volumeDeltaPlates > 0) {
      if (revenueDeltaRwf >= 0) {
        verdict = 'discount_stimulus';
        insightMessage = `Effective promotional price: Attracts +${volumeDeltaPlates} more plates/day while growing gross cafeteria revenue by +${Math.round(revenueDeltaRwf).toLocaleString()} RWF.`;
      } else {
        verdict = 'volume_loss_risk';
        insightMessage = `Volume increases (+${volumeDeltaPlates} plates/day), but price discount is too steep to offset volume gain, yielding -${Math.round(Math.abs(revenueDeltaRwf)).toLocaleString()} RWF net revenue.`;
      }
    } else {
      verdict = 'neutral';
      insightMessage = `Price adjustment produces marginal variance in daily consumption volume.`;
    }

    return {
      item,
      currentPriceRwf,
      proposedPriceRwf,
      priceChangePercent,
      currentDailyVolume: metric.avgDailyVolume,
      projectedDailyVolume,
      volumeDeltaPlates,
      volumeChangePercent,
      currentDailyRevenueRwf,
      projectedDailyRevenueRwf,
      revenueDeltaRwf,
      revenueChangePercent,
      currentDailyProfitRwf,
      projectedDailyProfitRwf,
      profitDeltaRwf,
      elasticityCoefficient: metric.elasticityCoefficient,
      verdict,
      insightMessage,
    };
  }

  /**
   * Group and summarize volume & price metrics by meal category
   */
  public getCategorySummaries(restaurantCode: string): CategoryPricingSummary[] {
    const metrics = this.getMenuItemMetrics(restaurantCode, 30);
    const totalVolume = metrics.reduce((sum, m) => sum + m.avgDailyVolume, 0);

    const categories: { cat: MenuCategory; label: string }[] = [
      { cat: 'lunch', label: 'Lunch Buffets' },
      { cat: 'dinner', label: 'Evening Dinners' },
      { cat: 'breakfast', label: 'Breakfast Service' },
      { cat: 'special', label: 'Chef Specials' },
    ];

    return categories.map(({ cat, label }) => {
      const items = metrics.filter((m) => m.category === cat);
      const itemCount = items.length;
      const catVolume = items.reduce((sum, m) => sum + m.avgDailyVolume, 0);
      const catRevenue = items.reduce((sum, m) => sum + m.avgDailyRevenueRwf, 0);
      const avgPrice = itemCount > 0 ? Math.round(items.reduce((sum, m) => sum + m.priceRwf, 0) / itemCount) : 0;
      const volumeSharePercent = totalVolume > 0 ? Math.round((catVolume / totalVolume) * 100) : 0;

      return {
        category: cat,
        label,
        itemCount,
        avgPriceRwf: avgPrice,
        totalDailyVolume: catVolume,
        dailyRevenueRwf: catRevenue,
        volumeSharePercent,
        color: CATEGORY_COLORS[cat],
      };
    });
  }

  /**
   * Portfolio summary statistics
   */
  public getPortfolioKPIs(restaurantCode: string) {
    const metrics = this.getMenuItemMetrics(restaurantCode, 30);
    const dailyTrends = this.getDailyTrends(restaurantCode, 30);

    const totalDailyVolume = metrics.reduce((sum, m) => sum + m.avgDailyVolume, 0);
    const totalDailyRevenue = metrics.reduce((sum, m) => sum + m.avgDailyRevenueRwf, 0);
    const weightedAvgPrice = totalDailyVolume > 0 ? Math.round(totalDailyRevenue / totalDailyVolume) : 0;

    // 30-day totals
    const monthTotalPlates = dailyTrends.reduce((sum, d) => sum + d.totalPlates, 0);
    const monthTotalRevenue = dailyTrends.reduce((sum, d) => sum + d.totalRevenueRwf, 0);

    // Top volume item
    const topVolumeItem = [...metrics].sort((a, b) => b.avgDailyVolume - a.avgDailyVolume)[0] || null;
    // Top revenue item
    const topRevenueItem = [...metrics].sort((a, b) => b.avgDailyRevenueRwf - a.avgDailyRevenueRwf)[0] || null;

    // Weighted elasticity
    const weightedElasticity =
      totalDailyVolume > 0
        ? Number(
            (
              metrics.reduce((sum, m) => sum + m.elasticityCoefficient * m.avgDailyVolume, 0) / totalDailyVolume
            ).toFixed(2)
          )
        : -0.85;

    // Projected revenue at optimal prices
    const optimalRevenue = metrics.reduce((sum, m) => sum + m.optimalDailyRevenueRwf, 0);
    const potentialRevenueGainRwf = Math.max(0, optimalRevenue - totalDailyRevenue);

    return {
      totalDailyVolume,
      totalDailyRevenue,
      weightedAvgPrice,
      monthTotalPlates,
      monthTotalRevenue,
      topVolumeItem,
      topRevenueItem,
      weightedElasticity,
      optimalRevenue,
      potentialRevenueGainRwf,
    };
  }
}

export const pricingAnalytics = new PricingAnalyticsService();
