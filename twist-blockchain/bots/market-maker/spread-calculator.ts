import BN from 'bn.js';

export interface SpreadParams {
  baseSpread: number;
  minSpread: number;
  maxSpread: number;
}

export interface MarketConditions {
  volatility: number;
  volume24h: number;
  inventorySkew: number;
  competitorSpread?: number;
  recentTrades: number;
}

export class SpreadCalculator {
  private config: any;
  private historicalSpreads: Array<{ timestamp: number; spread: number }> = [];
  
  constructor(config: any) {
    this.config = config;
  }
  
  /**
   * Calculate optimal spread based on market conditions
   */
  async calculateOptimalSpread(marketState: any): Promise<number> {
    const conditions: MarketConditions = {
      volatility: marketState.volatility,
      volume24h: marketState.volume24h,
      inventorySkew: marketState.inventorySkew,
      competitorSpread: await this.getCompetitorSpread(),
      recentTrades: await this.getRecentTradeCount(),
    };
    
    // Start with base spread
    let spread = this.config.baseSpread;
    
    // Adjust for volatility (wider spread in volatile markets)
    const volatilityMultiplier = 1 + (conditions.volatility * 2);
    spread *= volatilityMultiplier;
    
    // Adjust for volume (tighter spread in high volume)
    const volumeMultiplier = this.calculateVolumeMultiplier(conditions.volume24h);
    spread *= volumeMultiplier;
    
    // Adjust for inventory skew
    const skewAdjustment = this.calculateSkewAdjustment(conditions.inventorySkew);
    spread *= skewAdjustment;
    
    // Adjust for competition
    if (conditions.competitorSpread) {
      spread = this.adjustForCompetition(spread, conditions.competitorSpread);
    }
    
    // Apply bounds
    spread = Math.max(this.config.minSpread, Math.min(this.config.maxSpread, spread));
    
    // Store for analysis
    this.historicalSpreads.push({ timestamp: Date.now(), spread });
    if (this.historicalSpreads.length > 1000) {
      this.historicalSpreads.shift();
    }
    
    return spread;
  }
  
  /**
   * Calculate spread multiplier based on volume
   */
  private calculateVolumeMultiplier(volume24h: number): number {
    // Higher volume = tighter spreads
    const targetVolume = 1000000; // $1M daily volume
    const volumeRatio = volume24h / targetVolume;
    
    if (volumeRatio > 2) {
      return 0.7; // 30% tighter spread for very high volume
    } else if (volumeRatio > 1) {
      return 0.85; // 15% tighter spread for high volume
    } else if (volumeRatio < 0.1) {
      return 1.5; // 50% wider spread for very low volume
    } else if (volumeRatio < 0.5) {
      return 1.2; // 20% wider spread for low volume
    }
    
    return 1.0; // Normal spread
  }
  
  /**
   * Calculate adjustment based on inventory skew
   */
  private calculateSkewAdjustment(inventorySkew: number): number {
    // Positive skew = too much TWIST, negative = too little
    // Adjust spread to encourage rebalancing
    
    const absSkew = Math.abs(inventorySkew);
    
    if (absSkew < 0.1) {
      return 1.0; // Balanced inventory, no adjustment
    } else if (absSkew < 0.3) {
      return 1.0 + (absSkew * 0.5); // Slight widening
    } else {
      return 1.0 + (absSkew * 1.0); // Significant widening
    }
  }
  
  /**
   * Adjust spread based on competition
   */
  private adjustForCompetition(
    ourSpread: number,
    competitorSpread: number
  ): number {
    // Be competitive but maintain profitability
    const minProfitableSpread = this.config.minSpread * 1.2;
    
    if (competitorSpread < minProfitableSpread) {
      // Competitor is likely losing money, don't match
      return ourSpread;
    }
    
    // Match competitor within reason
    const targetSpread = competitorSpread * 0.95; // Slightly better than competitor
    
    return Math.max(minProfitableSpread, Math.min(ourSpread, targetSpread));
  }
  
  /**
   * Get competitor spread from other market makers
   */
  private async getCompetitorSpread(): Promise<number | undefined> {
    // In production, would analyze order book for other MMs
    // For now, return undefined
    return undefined;
  }
  
  /**
   * Get recent trade count for activity assessment
   */
  private async getRecentTradeCount(): Promise<number> {
    // In production, would query recent trades
    // For now, return mock value
    return 50;
  }
  
  /**
   * Calculate dynamic spread for a specific order
   */
  calculateOrderSpread(
    side: 'buy' | 'sell',
    size: number,
    baseSpread: number,
    marketState: any
  ): number {
    let spread = baseSpread;
    
    // Larger orders get wider spreads
    const sizeMultiplier = 1 + (size / 10000) * 0.1; // 0.1% per $10k
    spread *= sizeMultiplier;
    
    // Adjust based on side and inventory
    if (side === 'buy' && marketState.inventorySkew < -0.2) {
      // Need more TWIST, tighten buy spread
      spread *= 0.9;
    } else if (side === 'sell' && marketState.inventorySkew > 0.2) {
      // Have too much TWIST, tighten sell spread
      spread *= 0.9;
    }
    
    return spread;
  }
  
  /**
   * Get spread statistics
   */
  getSpreadStats(): {
    average: number;
    min: number;
    max: number;
    current: number;
  } {
    if (this.historicalSpreads.length === 0) {
      return {
        average: this.config.baseSpread,
        min: this.config.baseSpread,
        max: this.config.baseSpread,
        current: this.config.baseSpread,
      };
    }
    
    const spreads = this.historicalSpreads.map(s => s.spread);
    const sum = spreads.reduce((a, b) => a + b, 0);
    
    return {
      average: sum / spreads.length,
      min: Math.min(...spreads),
      max: Math.max(...spreads),
      current: spreads[spreads.length - 1],
    };
  }
  
  /**
   * Analyze spread efficiency
   */
  analyzeSpreadEfficiency(
    fills: Array<{ spread: number; profit: number; timestamp: number }>
  ): {
    profitableRatio: number;
    averageProfit: number;
    optimalSpread: number;
  } {
    if (fills.length === 0) {
      return {
        profitableRatio: 0,
        averageProfit: 0,
        optimalSpread: this.config.baseSpread,
      };
    }
    
    const profitableFills = fills.filter(f => f.profit > 0);
    const profitableRatio = profitableFills.length / fills.length;
    
    const totalProfit = fills.reduce((sum, f) => sum + f.profit, 0);
    const averageProfit = totalProfit / fills.length;
    
    // Find spread with highest average profit
    const spreadProfits = new Map<number, { total: number; count: number }>();
    
    fills.forEach(fill => {
      const roundedSpread = Math.round(fill.spread / 10) * 10; // Round to nearest 10 bps
      const current = spreadProfits.get(roundedSpread) || { total: 0, count: 0 };
      current.total += fill.profit;
      current.count += 1;
      spreadProfits.set(roundedSpread, current);
    });
    
    let optimalSpread = this.config.baseSpread;
    let maxAvgProfit = 0;
    
    spreadProfits.forEach((data, spread) => {
      const avgProfit = data.total / data.count;
      if (avgProfit > maxAvgProfit) {
        maxAvgProfit = avgProfit;
        optimalSpread = spread;
      }
    });
    
    return {
      profitableRatio,
      averageProfit,
      optimalSpread,
    };
  }
}