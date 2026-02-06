import BN from "bn.js";
import { logger } from "./logger";

export interface PriceRange {
  lowerPrice: number;
  upperPrice: number;
  lowerTick: number;
  upperTick: number;
}

export class PriceRangeCalculator {
  private readonly CONSERVATIVE_RANGE = 0.15; // 15% range
  private readonly NORMAL_RANGE = 0.25; // 25% range
  private readonly AGGRESSIVE_RANGE = 0.40; // 40% range

  async calculateOptimalRange(
    currentSqrtPrice: BN,
    decimalsA: number,
    decimalsB: number,
    volatility?: number
  ): Promise<PriceRange> {
    try {
      // Convert sqrt price to actual price
      const currentPrice = this.sqrtPriceToPrice(currentSqrtPrice, decimalsA, decimalsB);
      
      // Determine range based on volatility
      const rangePercent = this.getRangePercent(volatility);
      
      // Calculate price bounds
      const lowerPrice = currentPrice * (1 - rangePercent);
      const upperPrice = currentPrice * (1 + rangePercent);
      
      // Convert to ticks
      const lowerTick = this.priceToTick(lowerPrice, decimalsA, decimalsB);
      const upperTick = this.priceToTick(upperPrice, decimalsA, decimalsB);
      
      logger.info(`Calculated range: ${lowerPrice.toFixed(6)} - ${upperPrice.toFixed(6)} (${(rangePercent * 100).toFixed(1)}% range)`);
      
      return {
        lowerPrice,
        upperPrice,
        lowerTick,
        upperTick,
      };
      
    } catch (error) {
      logger.error("Error calculating optimal range:", error);
      throw error;
    }
  }

  calculateConcentratedRange(
    currentPrice: number,
    targetLiquidity: BN,
    availableCapital: BN
  ): PriceRange {
    // Calculate range that maximizes capital efficiency
    // Tighter range = more concentrated liquidity = higher fees
    // But also higher impermanent loss risk
    
    const capitalEfficiency = availableCapital.div(targetLiquidity);
    let rangePercent: number;
    
    if (capitalEfficiency.gt(new BN(10))) {
      // High capital efficiency - use tighter range
      rangePercent = 0.10; // 10%
    } else if (capitalEfficiency.gt(new BN(5))) {
      // Medium capital efficiency
      rangePercent = 0.20; // 20%
    } else {
      // Low capital efficiency - use wider range
      rangePercent = 0.30; // 30%
    }
    
    const lowerPrice = currentPrice * (1 - rangePercent);
    const upperPrice = currentPrice * (1 + rangePercent);
    
    return {
      lowerPrice,
      upperPrice,
      lowerTick: this.priceToTick(lowerPrice, 9, 6), // TWIST/USDC decimals
      upperTick: this.priceToTick(upperPrice, 9, 6),
    };
  }

  adjustRangeForVolatility(
    baseRange: PriceRange,
    recentVolatility: number,
    volume24h: BN
  ): PriceRange {
    // Adjust range based on recent volatility and volume
    let adjustment = 1.0;
    
    // High volatility = wider range
    if (recentVolatility > 0.05) { // 5% daily volatility
      adjustment *= 1.5;
    } else if (recentVolatility > 0.03) { // 3% daily volatility
      adjustment *= 1.2;
    }
    
    // High volume = tighter range (more fees to capture)
    const volumeThreshold = new BN("1000000000000"); // $1M
    if (volume24h.gt(volumeThreshold)) {
      adjustment *= 0.8;
    }
    
    const rangeWidth = baseRange.upperPrice - baseRange.lowerPrice;
    const centerPrice = (baseRange.upperPrice + baseRange.lowerPrice) / 2;
    const adjustedWidth = rangeWidth * adjustment;
    
    return {
      lowerPrice: centerPrice - adjustedWidth / 2,
      upperPrice: centerPrice + adjustedWidth / 2,
      lowerTick: this.priceToTick(centerPrice - adjustedWidth / 2, 9, 6),
      upperTick: this.priceToTick(centerPrice + adjustedWidth / 2, 9, 6),
    };
  }

  private getRangePercent(volatility?: number): number {
    if (!volatility) return this.NORMAL_RANGE;
    
    if (volatility < 0.02) { // Low volatility
      return this.CONSERVATIVE_RANGE;
    } else if (volatility < 0.05) { // Normal volatility
      return this.NORMAL_RANGE;
    } else { // High volatility
      return this.AGGRESSIVE_RANGE;
    }
  }

  private sqrtPriceToPrice(sqrtPrice: BN, decimalsA: number, decimalsB: number): number {
    // Convert sqrt price X64 to actual price
    const price = sqrtPrice.mul(sqrtPrice).div(new BN(2).pow(new BN(64)));
    const decimalAdjustment = Math.pow(10, decimalsB - decimalsA);
    return price.toNumber() * decimalAdjustment / Math.pow(2, 64);
  }

  private priceToTick(price: number, decimalsA: number, decimalsB: number): number {
    const adjustedPrice = price * Math.pow(10, decimalsA - decimalsB);
    return Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));
  }
}