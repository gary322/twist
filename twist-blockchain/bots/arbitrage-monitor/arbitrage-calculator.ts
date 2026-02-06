import { DexPrice } from './dex-monitor';

export interface ArbitrageOpportunity {
  id: string;
  timestamp: number;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  profitPercent: number;
  profitUsd: number;
  volumeAvailable: number;
  estimatedGas: number;
  netProfit: number;
  confidence: 'high' | 'medium' | 'low';
  ttl: number;
  route?: string[];
}

export interface CalculatorConfig {
  minProfitPercent: number;
  minProfitUsd: number;
  maxPositionSize: number;
  maxSlippagePercent: number;
}

export class ArbitrageCalculator {
  constructor(private config: CalculatorConfig) {}
  
  /**
   * Find all profitable arbitrage opportunities from price data
   */
  public findOpportunities(prices: DexPrice[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Check all pairs of DEXes
    for (let i = 0; i < prices.length; i++) {
      for (let j = i + 1; j < prices.length; j++) {
        const opportunity = this.checkPair(prices[i], prices[j]);
        if (opportunity) {
          opportunities.push(opportunity);
        }
        
        // Check reverse direction
        const reverseOpportunity = this.checkPair(prices[j], prices[i]);
        if (reverseOpportunity) {
          opportunities.push(reverseOpportunity);
        }
      }
    }
    
    // Check triangular arbitrage if we have 3+ DEXes
    if (prices.length >= 3) {
      const triangularOpps = this.findTriangularArbitrage(prices);
      opportunities.push(...triangularOpps);
    }
    
    // Sort by profit
    return opportunities.sort((a, b) => b.netProfit - a.netProfit);
  }
  
  /**
   * Check if arbitrage exists between two DEXes
   */
  private checkPair(buyDex: DexPrice, sellDex: DexPrice): ArbitrageOpportunity | null {
    // Calculate profit from buying on one DEX and selling on another
    const buyPrice = buyDex.ask;
    const sellPrice = sellDex.bid;
    
    // Skip if not profitable
    if (sellPrice <= buyPrice) {
      return null;
    }
    
    // Calculate profit percentage
    const profitPercent = ((sellPrice - buyPrice) / buyPrice) * 100;
    
    // Apply fees
    const buyFee = 0.3; // 0.3% typical DEX fee
    const sellFee = 0.3;
    const totalFeePercent = buyFee + sellFee;
    const netProfitPercent = profitPercent - totalFeePercent;
    
    // Check if meets minimum threshold
    if (netProfitPercent < this.config.minProfitPercent) {
      return null;
    }
    
    // Calculate optimal position size
    const maxVolume = Math.min(
      buyDex.liquidityDepth * 0.1, // Don't use more than 10% of liquidity
      sellDex.liquidityDepth * 0.1,
      this.config.maxPositionSize
    );
    
    // Estimate profit in USD
    const profitUsd = maxVolume * (netProfitPercent / 100);
    
    // Estimate gas costs
    const estimatedGas = 20; // $20 for two transactions
    const netProfit = profitUsd - estimatedGas;
    
    // Check if still profitable after gas
    if (netProfit < this.config.minProfitUsd) {
      return null;
    }
    
    // Calculate confidence based on liquidity and spread
    const avgLiquidity = (buyDex.liquidityDepth + sellDex.liquidityDepth) / 2;
    const avgSpread = (buyDex.spread + sellDex.spread) / 2;
    
    let confidence: 'high' | 'medium' | 'low';
    if (avgLiquidity > 200000 && avgSpread < 0.5) {
      confidence = 'high';
    } else if (avgLiquidity > 100000 && avgSpread < 1) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
    
    // Time to live based on spread and volatility
    const ttl = confidence === 'high' ? 30000 : confidence === 'medium' ? 15000 : 5000;
    
    return {
      id: `${buyDex.dex}-${sellDex.dex}-${Date.now()}`,
      timestamp: Date.now(),
      buyDex: buyDex.dex,
      sellDex: sellDex.dex,
      buyPrice,
      sellPrice,
      profitPercent: netProfitPercent,
      profitUsd,
      volumeAvailable: maxVolume,
      estimatedGas,
      netProfit,
      confidence,
      ttl,
    };
  }
  
  /**
   * Find triangular arbitrage opportunities (A->B->C->A)
   */
  private findTriangularArbitrage(prices: DexPrice[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // For TWIST, we'd need prices for TWIST/USDC, TWIST/SOL, SOL/USDC
    // This is simplified - in production would handle multiple pairs
    
    // Example: USDC -> TWIST (DEX1) -> SOL (DEX2) -> USDC (DEX3)
    // Would need to track multiple token pairs per DEX
    
    return opportunities;
  }
  
  /**
   * Calculate optimal execution path for arbitrage
   */
  public calculateOptimalPath(
    opportunity: ArbitrageOpportunity,
    availableCapital: number
  ): {
    path: string[];
    optimalSize: number;
    expectedProfit: number;
    risks: string[];
  } {
    const risks: string[] = [];
    
    // Calculate optimal size considering:
    // 1. Available capital
    // 2. Liquidity constraints
    // 3. Price impact
    // 4. Gas costs
    
    let optimalSize = Math.min(availableCapital, opportunity.volumeAvailable);
    
    // Reduce size if low confidence
    if (opportunity.confidence === 'low') {
      optimalSize *= 0.5;
      risks.push('Low confidence - reduced position size');
    }
    
    // Check price impact
    const priceImpact = this.estimatePriceImpact(optimalSize, opportunity);
    if (priceImpact > this.config.maxSlippagePercent) {
      optimalSize *= this.config.maxSlippagePercent / priceImpact;
      risks.push(`High price impact - reduced to maintain ${this.config.maxSlippagePercent}% max slippage`);
    }
    
    // Calculate expected profit with reduced size
    const expectedProfit = optimalSize * (opportunity.profitPercent / 100) - opportunity.estimatedGas;
    
    // Build execution path
    const path = [
      `1. Buy ${optimalSize.toFixed(2)} USDC worth of TWIST on ${opportunity.buyDex}`,
      `2. Sell TWIST for USDC on ${opportunity.sellDex}`,
      `3. Expected profit: $${expectedProfit.toFixed(2)}`,
    ];
    
    // Add risks
    if (opportunity.ttl < 10000) {
      risks.push('Short time window - execute quickly');
    }
    
    return {
      path,
      optimalSize,
      expectedProfit,
      risks,
    };
  }
  
  /**
   * Estimate price impact for a given trade size
   */
  private estimatePriceImpact(
    tradeSize: number,
    opportunity: ArbitrageOpportunity
  ): number {
    // Simplified model - in production would use actual liquidity curves
    const avgLiquidity = opportunity.volumeAvailable * 10; // Assume 10x depth
    const impact = (tradeSize / avgLiquidity) * 100;
    
    return impact;
  }
  
  /**
   * Analyze historical arbitrage performance
   */
  public analyzeHistoricalPerformance(
    executedArbs: Array<{
      opportunity: ArbitrageOpportunity;
      actualProfit: number;
      executionTime: number;
      success: boolean;
    }>
  ): {
    successRate: number;
    avgProfit: number;
    avgExecutionTime: number;
    profitByDexPair: Map<string, number>;
    recommendations: string[];
  } {
    if (executedArbs.length === 0) {
      return {
        successRate: 0,
        avgProfit: 0,
        avgExecutionTime: 0,
        profitByDexPair: new Map(),
        recommendations: ['No historical data available'],
      };
    }
    
    const successful = executedArbs.filter(a => a.success);
    const successRate = (successful.length / executedArbs.length) * 100;
    
    const totalProfit = successful.reduce((sum, a) => sum + a.actualProfit, 0);
    const avgProfit = totalProfit / successful.length;
    
    const avgExecutionTime = successful.reduce((sum, a) => sum + a.executionTime, 0) / successful.length;
    
    // Analyze by DEX pair
    const profitByDexPair = new Map<string, number>();
    successful.forEach(arb => {
      const pair = `${arb.opportunity.buyDex}-${arb.opportunity.sellDex}`;
      const current = profitByDexPair.get(pair) || 0;
      profitByDexPair.set(pair, current + arb.actualProfit);
    });
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (successRate < 80) {
      recommendations.push('Success rate below 80% - consider tighter opportunity filters');
    }
    
    if (avgExecutionTime > 5000) {
      recommendations.push('Slow execution times - consider optimizing transaction submission');
    }
    
    // Find best performing pairs
    const sortedPairs = Array.from(profitByDexPair.entries())
      .sort((a, b) => b[1] - a[1]);
    
    if (sortedPairs.length > 0) {
      recommendations.push(`Focus on ${sortedPairs[0][0]} - highest profit pair`);
    }
    
    return {
      successRate,
      avgProfit,
      avgExecutionTime,
      profitByDexPair,
      recommendations,
    };
  }
}