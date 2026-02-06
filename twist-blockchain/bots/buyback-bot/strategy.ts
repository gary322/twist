import { MarketData } from './price-monitor';

export interface BuybackStrategyConfig {
  buybackThresholdPercent: number; // e.g., 97 = trigger at 97% of floor
  minBuybackAmount: number;
  maxBuybackAmount: number;
  maxDailyBuyback: number;
  
  // Advanced parameters
  volumeMultiplier: number; // Scale buyback size based on volume
  volatilityMultiplier: number; // Scale based on volatility
  liquidityThreshold: number; // Minimum liquidity required
  
  // Dynamic adjustments
  aggressiveMode: boolean; // More aggressive when far below floor
  adaptiveSizing: boolean; // Adjust size based on market conditions
}

export class BuybackStrategy {
  constructor(private config: BuybackStrategyConfig) {}
  
  /**
   * Determines if a buyback should be triggered based on market conditions
   */
  public shouldTriggerBuyback(marketData: MarketData): boolean {
    // Basic threshold check
    const thresholdRatio = this.config.buybackThresholdPercent / 100;
    if (marketData.priceRatio > thresholdRatio) {
      return false;
    }
    
    // Additional safety checks
    
    // 1. Ensure sufficient liquidity
    if (marketData.liquidityDepth < this.config.liquidityThreshold) {
      logger.log('⚠️  Insufficient liquidity for buyback');
      return false;
    }
    
    // 2. Check oracle health
    const maxOracleDeviation = this.getMaxOracleDeviation(marketData);
    if (maxOracleDeviation > 5) { // 5% max deviation
      logger.log('⚠️  Oracle prices diverging too much');
      return false;
    }
    
    // 3. Avoid buying during extreme volatility spikes
    // (Would calculate from recent price history)
    
    return true;
  }
  
  /**
   * Calculates optimal buyback amount based on market conditions
   */
  public calculateBuybackAmount(
    marketData: MarketData,
    remainingDailyBudget: number
  ): number {
    let baseAmount = this.config.minBuybackAmount;
    
    // 1. Scale based on how far below floor we are
    const discount = 1 - marketData.priceRatio;
    const discountMultiplier = 1 + (discount * 10); // e.g., 3% discount = 1.3x
    baseAmount *= discountMultiplier;
    
    // 2. Scale based on volume (higher volume = larger buybacks)
    if (this.config.adaptiveSizing && marketData.volume24h > 0) {
      const avgVolume = marketData.volume24h; // Would use historical average
      const volumeRatio = marketData.volume24h / avgVolume;
      const volumeMultiplier = Math.sqrt(volumeRatio); // Square root to dampen effect
      baseAmount *= volumeMultiplier * this.config.volumeMultiplier;
    }
    
    // 3. Scale based on available floor liquidity
    const floorUtilization = baseAmount / marketData.floorLiquidity;
    if (floorUtilization > 0.02) { // Don't use more than 2% of floor in one buyback
      baseAmount = marketData.floorLiquidity * 0.02;
    }
    
    // 4. Aggressive mode - increase size when significantly below floor
    if (this.config.aggressiveMode && marketData.priceRatio < 0.95) {
      const aggressiveness = (0.95 - marketData.priceRatio) / 0.05; // 0-1 scale
      baseAmount *= (1 + aggressiveness); // Up to 2x when at 90% of floor
    }
    
    // 5. Apply limits
    baseAmount = Math.max(this.config.minBuybackAmount, baseAmount);
    baseAmount = Math.min(this.config.maxBuybackAmount, baseAmount);
    baseAmount = Math.min(remainingDailyBudget, baseAmount);
    
    // 6. Round to nice number
    baseAmount = Math.floor(baseAmount / 100) * 100; // Round to nearest $100
    
    return baseAmount;
  }
  
  /**
   * Calculates maximum acceptable slippage based on conditions
   */
  public calculateMaxSlippage(marketData: MarketData): number {
    // Base slippage
    let maxSlippage = 1.0; // 1%
    
    // Increase tolerance if we're far below floor (worth paying more)
    const discount = 1 - marketData.priceRatio;
    maxSlippage += discount * 2; // Up to 3% if at 95% of floor
    
    // Decrease if liquidity is low
    if (marketData.liquidityDepth < 1000000) {
      maxSlippage *= 0.5;
    }
    
    return Math.min(maxSlippage, 3.0); // Cap at 3%
  }
  
  /**
   * Determines if market conditions are favorable for buyback
   */
  public isMarketFavorable(marketData: MarketData): boolean {
    // Check for unusual conditions that might indicate manipulation
    
    // 1. Sudden volume spike might indicate wash trading
    if (marketData.volumeChange24h > 500) { // 500% increase
      return false;
    }
    
    // 2. Very low volume might mean easy manipulation
    if (marketData.volume24h < 10000) {
      return false;
    }
    
    // 3. Check time of day (avoid low liquidity hours)
    const hour = new Date().getUTCHours();
    if (hour >= 0 && hour < 6) { // 00:00 - 06:00 UTC
      return false;
    }
    
    return true;
  }
  
  /**
   * Suggests optimal timing for buyback execution
   */
  public getOptimalExecutionDelay(marketData: MarketData): number {
    // Random delay to avoid predictability (MEV protection)
    const baseDelay = Math.random() * 30000; // 0-30 seconds
    
    // Add more delay during high volatility
    // (Would calculate from actual volatility metrics)
    
    return baseDelay;
  }
  
  /**
   * Analyzes buyback performance and suggests strategy adjustments
   */
  public analyzePerformance(
    buybackHistory: Array<{
      timestamp: number;
      amountUsdc: number;
      amountTwist: number;
      executionPrice: number;
      marketPrice: number;
    }>
  ): {
    avgExecutionPrice: number;
    avgMarketPrice: number;
    totalSaved: number;
    performanceRatio: number;
    suggestions: string[];
  } {
    if (buybackHistory.length === 0) {
      return {
        avgExecutionPrice: 0,
        avgMarketPrice: 0,
        totalSaved: 0,
        performanceRatio: 0,
        suggestions: ['No buyback history to analyze'],
      };
    }
    
    // Calculate metrics
    const totalUsdc = buybackHistory.reduce((sum, b) => sum + b.amountUsdc, 0);
    const totalTwist = buybackHistory.reduce((sum, b) => sum + b.amountTwist, 0);
    const avgExecutionPrice = totalUsdc / totalTwist;
    
    const avgMarketPrice = buybackHistory.reduce((sum, b) => sum + b.marketPrice, 0) / buybackHistory.length;
    const totalSaved = totalTwist * (avgMarketPrice - avgExecutionPrice);
    const performanceRatio = avgExecutionPrice / avgMarketPrice;
    
    // Generate suggestions
    const suggestions: string[] = [];
    
    if (performanceRatio > 0.98) {
      suggestions.push('Consider lowering threshold to capture better discounts');
    }
    
    if (performanceRatio < 0.95) {
      suggestions.push('Excellent performance - capturing good discounts');
    }
    
    // Analyze timing
    const hourlyDistribution = new Array(24).fill(0);
    buybackHistory.forEach(b => {
      const hour = new Date(b.timestamp).getUTCHours();
      hourlyDistribution[hour]++;
    });
    
    const bestHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution));
    suggestions.push(`Most buybacks occur at ${bestHour}:00 UTC`);
    
    return {
      avgExecutionPrice,
      avgMarketPrice,
      totalSaved,
      performanceRatio,
      suggestions,
    };
  }
  
  private getMaxOracleDeviation(marketData: MarketData): number {
    if (marketData.oraclePrices.length < 2) return 0;
    
    const prices = marketData.oraclePrices.map(o => o.price);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    
    return ((maxPrice - minPrice) / minPrice) * 100;
  }
}