import BN from 'bn.js';

export interface RiskLimits {
  maxExposure: number;           // Maximum position exposure in USD
  maxOrderSize: number;          // Maximum single order size
  maxDailyLoss: number;         // Maximum daily loss allowed
  inventorySkewLimit: number;    // Maximum inventory imbalance
  stopLossThreshold: number;     // Stop loss percentage
  volatilityLimit: number;       // Maximum volatility tolerance
}

export interface RiskMetrics {
  currentExposure: number;
  dailyPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
  valueAtRisk: number;
  inventoryRisk: number;
}

export interface RiskCheck {
  passed: boolean;
  reason?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actions: string[];
}

export class RiskManager {
  private config: any;
  private riskLimits: RiskLimits;
  private pnlHistory: Array<{ timestamp: number; pnl: number }> = [];
  private exposureHistory: Array<{ timestamp: number; exposure: number }> = [];
  private incidentLog: Array<{ timestamp: number; type: string; details: any }> = [];
  
  constructor(config: any) {
    this.config = config;
    this.riskLimits = {
      maxExposure: config.maxExposure,
      maxOrderSize: config.orderSizes.max,
      maxDailyLoss: config.maxExposure * 0.05, // 5% of max exposure
      inventorySkewLimit: config.inventorySkewLimit,
      stopLossThreshold: config.stopLossThreshold,
      volatilityLimit: 0.05, // 5% volatility limit
    };
  }
  
  /**
   * Check all risk limits
   */
  async checkRiskLimits(marketState: any): Promise<RiskCheck> {
    const checks = [
      this.checkExposureLimit(marketState),
      this.checkInventorySkew(marketState),
      this.checkVolatility(marketState),
      this.checkDailyLoss(),
      this.checkMarketConditions(marketState),
    ];
    
    // Find the most severe failing check
    const failedChecks = checks.filter(c => !c.passed);
    
    if (failedChecks.length === 0) {
      return {
        passed: true,
        severity: 'low',
        actions: [],
      };
    }
    
    // Return the most severe check
    const severityOrder = ['critical', 'high', 'medium', 'low'];
    const mostSevere = failedChecks.reduce((prev, curr) => {
      const prevIndex = severityOrder.indexOf(prev.severity);
      const currIndex = severityOrder.indexOf(curr.severity);
      return currIndex < prevIndex ? curr : prev;
    });
    
    return mostSevere;
  }
  
  /**
   * Check exposure limit
   */
  private checkExposureLimit(marketState: any): RiskCheck {
    const currentExposure = marketState.totalExposure;
    const limit = this.riskLimits.maxExposure;
    
    if (currentExposure > limit * 1.2) {
      return {
        passed: false,
        reason: `Exposure ${currentExposure.toFixed(0)} exceeds limit by 20%`,
        severity: 'critical',
        actions: ['Cancel all orders', 'Reduce positions immediately'],
      };
    }
    
    if (currentExposure > limit) {
      return {
        passed: false,
        reason: `Exposure ${currentExposure.toFixed(0)} exceeds limit`,
        severity: 'high',
        actions: ['Reduce order sizes', 'Cancel furthest orders'],
      };
    }
    
    if (currentExposure > limit * 0.9) {
      return {
        passed: false,
        reason: `Exposure approaching limit (${(currentExposure/limit*100).toFixed(0)}%)`,
        severity: 'medium',
        actions: ['Monitor closely', 'Prepare to reduce'],
      };
    }
    
    return {
      passed: true,
      severity: 'low',
      actions: [],
    };
  }
  
  /**
   * Check inventory skew
   */
  private checkInventorySkew(marketState: any): RiskCheck {
    const skew = Math.abs(marketState.inventorySkew);
    const limit = this.riskLimits.inventorySkewLimit;
    
    if (skew > limit * 1.5) {
      return {
        passed: false,
        reason: `Inventory skew ${(skew*100).toFixed(1)}% critically high`,
        severity: 'critical',
        actions: ['Emergency rebalance required', 'Widen spreads significantly'],
      };
    }
    
    if (skew > limit) {
      return {
        passed: false,
        reason: `Inventory skew ${(skew*100).toFixed(1)}% exceeds limit`,
        severity: 'high',
        actions: ['Initiate rebalancing', 'Adjust spreads'],
      };
    }
    
    if (skew > limit * 0.8) {
      return {
        passed: false,
        reason: `Inventory skew approaching limit`,
        severity: 'medium',
        actions: ['Monitor inventory', 'Prepare rebalancing trades'],
      };
    }
    
    return {
      passed: true,
      severity: 'low',
      actions: [],
    };
  }
  
  /**
   * Check market volatility
   */
  private checkVolatility(marketState: any): RiskCheck {
    const volatility = marketState.volatility;
    const limit = this.riskLimits.volatilityLimit;
    
    if (volatility > limit * 2) {
      return {
        passed: false,
        reason: `Extreme volatility: ${(volatility*100).toFixed(1)}%`,
        severity: 'critical',
        actions: ['Pause trading', 'Cancel all orders'],
      };
    }
    
    if (volatility > limit) {
      return {
        passed: false,
        reason: `High volatility: ${(volatility*100).toFixed(1)}%`,
        severity: 'high',
        actions: ['Widen spreads', 'Reduce order sizes'],
      };
    }
    
    return {
      passed: true,
      severity: 'low',
      actions: [],
    };
  }
  
  /**
   * Check daily loss limit
   */
  private checkDailyLoss(): RiskCheck {
    const dailyPnL = this.calculateDailyPnL();
    const limit = -this.riskLimits.maxDailyLoss;
    
    if (dailyPnL < limit * 1.2) {
      return {
        passed: false,
        reason: `Daily loss $${Math.abs(dailyPnL).toFixed(0)} exceeds limit by 20%`,
        severity: 'critical',
        actions: ['Stop trading immediately', 'Close all positions'],
      };
    }
    
    if (dailyPnL < limit) {
      return {
        passed: false,
        reason: `Daily loss $${Math.abs(dailyPnL).toFixed(0)} exceeds limit`,
        severity: 'high',
        actions: ['Pause new orders', 'Reduce exposure'],
      };
    }
    
    if (dailyPnL < limit * 0.8) {
      return {
        passed: false,
        reason: `Approaching daily loss limit (${(dailyPnL/limit*100).toFixed(0)}%)`,
        severity: 'medium',
        actions: ['Trade cautiously', 'Tighten risk controls'],
      };
    }
    
    return {
      passed: true,
      severity: 'low',
      actions: [],
    };
  }
  
  /**
   * Check overall market conditions
   */
  private checkMarketConditions(marketState: any): RiskCheck {
    // Check for abnormal conditions
    const checks = [];
    
    // Extremely low volume
    if (marketState.volume24h < 50000) {
      checks.push({
        issue: 'Very low volume',
        severity: 'high' as const,
        action: 'Reduce activity',
      });
    }
    
    // Wide spread indicating low liquidity
    if (marketState.spread > 200) { // 2%
      checks.push({
        issue: 'Wide market spread',
        severity: 'medium' as const,
        action: 'Increase caution',
      });
    }
    
    // Check for price anomalies
    const priceChange24h = this.calculate24hPriceChange(marketState.midPrice);
    if (Math.abs(priceChange24h) > 0.2) { // 20% change
      checks.push({
        issue: `Large price movement: ${(priceChange24h*100).toFixed(1)}%`,
        severity: 'high' as const,
        action: 'Review positions',
      });
    }
    
    if (checks.length === 0) {
      return {
        passed: true,
        severity: 'low',
        actions: [],
      };
    }
    
    const mostSevere = checks.reduce((prev, curr) => 
      curr.severity === 'critical' || (curr.severity === 'high' && prev.severity !== 'critical') 
        ? curr : prev
    );
    
    return {
      passed: false,
      reason: mostSevere.issue,
      severity: mostSevere.severity,
      actions: checks.map(c => c.action),
    };
  }
  
  /**
   * Calculate daily P&L
   */
  private calculateDailyPnL(): number {
    const now = Date.now();
    const dayStart = new Date().setHours(0, 0, 0, 0);
    
    const todaysPnL = this.pnlHistory
      .filter(p => p.timestamp > dayStart)
      .reduce((sum, p) => sum + p.pnl, 0);
    
    return todaysPnL;
  }
  
  /**
   * Calculate 24h price change
   */
  private priceHistory: Array<{ timestamp: number; price: number }> = [];
  
  private calculate24hPriceChange(currentPrice: number): number {
    // Add current price to history
    this.priceHistory.push({ timestamp: Date.now(), price: currentPrice });
    
    // Clean old entries
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.priceHistory = this.priceHistory.filter(p => p.timestamp > cutoff);
    
    if (this.priceHistory.length < 2) {
      return 0;
    }
    
    const oldestPrice = this.priceHistory[0].price;
    return (currentPrice - oldestPrice) / oldestPrice;
  }
  
  /**
   * Record P&L
   */
  recordPnL(pnl: number) {
    this.pnlHistory.push({
      timestamp: Date.now(),
      pnl,
    });
    
    // Keep only last 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.pnlHistory = this.pnlHistory.filter(p => p.timestamp > cutoff);
  }
  
  /**
   * Calculate risk metrics
   */
  calculateRiskMetrics(currentExposure: number): RiskMetrics {
    const dailyPnL = this.calculateDailyPnL();
    const returns = this.calculateReturns();
    
    return {
      currentExposure,
      dailyPnL,
      maxDrawdown: this.calculateMaxDrawdown(),
      sharpeRatio: this.calculateSharpeRatio(returns),
      valueAtRisk: this.calculateVaR(returns, 0.95),
      inventoryRisk: this.calculateInventoryRisk(),
    };
  }
  
  /**
   * Calculate returns for risk metrics
   */
  private calculateReturns(): number[] {
    if (this.pnlHistory.length < 2) return [];
    
    const returns = [];
    for (let i = 1; i < this.pnlHistory.length; i++) {
      const prevPnL = this.pnlHistory[i - 1].pnl;
      const currPnL = this.pnlHistory[i].pnl;
      if (prevPnL !== 0) {
        returns.push((currPnL - prevPnL) / Math.abs(prevPnL));
      }
    }
    
    return returns;
  }
  
  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(): number {
    if (this.pnlHistory.length < 2) return 0;
    
    let peak = 0;
    let maxDrawdown = 0;
    let cumulativePnL = 0;
    
    for (const entry of this.pnlHistory) {
      cumulativePnL += entry.pnl;
      
      if (cumulativePnL > peak) {
        peak = cumulativePnL;
      } else {
        const drawdown = (peak - cumulativePnL) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }
    
    return maxDrawdown;
  }
  
  /**
   * Calculate Sharpe ratio
   */
  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 20) return 0;
    
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    // Annualized Sharpe ratio (assuming daily returns)
    return (avgReturn * 252) / (stdDev * Math.sqrt(252));
  }
  
  /**
   * Calculate Value at Risk
   */
  private calculateVaR(returns: number[], confidence: number): number {
    if (returns.length < 20) return 0;
    
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);
    
    return Math.abs(sortedReturns[index]) * this.riskLimits.maxExposure;
  }
  
  /**
   * Calculate inventory risk
   */
  private calculateInventoryRisk(): number {
    // Simplified inventory risk based on concentration
    // In production, would use more sophisticated models
    return 0.1; // 10% inventory risk
  }
  
  /**
   * Log risk incident
   */
  logIncident(type: string, details: any) {
    this.incidentLog.push({
      timestamp: Date.now(),
      type,
      details,
    });
    
    // Keep only last 100 incidents
    if (this.incidentLog.length > 100) {
      this.incidentLog.shift();
    }
  }
  
  /**
   * Get risk report
   */
  generateRiskReport(): {
    metrics: RiskMetrics;
    limits: RiskLimits;
    incidents: any[];
    recommendations: string[];
  } {
    const metrics = this.calculateRiskMetrics(0); // Current exposure would come from market state
    
    const recommendations = [];
    
    if (metrics.sharpeRatio < 1) {
      recommendations.push('Consider improving strategy parameters for better risk-adjusted returns');
    }
    
    if (metrics.maxDrawdown > 0.1) {
      recommendations.push('High drawdown detected - review risk management rules');
    }
    
    if (this.incidentLog.length > 10) {
      recommendations.push('Frequent risk incidents - consider tightening limits');
    }
    
    return {
      metrics,
      limits: this.riskLimits,
      incidents: this.incidentLog.slice(-10), // Last 10 incidents
      recommendations,
    };
  }
}