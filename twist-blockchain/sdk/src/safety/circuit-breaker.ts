import BN from "bn.js";

export interface TripCondition {
  name: string;
  check: () => Promise<TripResult>;
}

export interface TripResult {
  shouldTrip: boolean;
  severity: Severity;
  message: string;
}

export type Severity = "low" | "medium" | "high" | "critical";

export interface TripEvent {
  timestamp: number;
  conditions: string[];
  severity: Severity;
  autoResetAfter: number;
}

export interface CircuitBreakerStatus {
  isTripped: boolean;
  severity: Severity | null;
  conditions: Array<{ condition: string } & TripResult>;
  canReset: boolean;
}

export interface TwistTokenClient {
  getPriceHistory(seconds: number): Promise<Array<{ price: number; timestamp: number }>>;
  get24hVolume(): Promise<BN>;
  get7dAverageVolume(): Promise<BN>;
  getSupplyAt(timestamp: number): Promise<BN>;
  getCurrentSupply(): Promise<BN>;
  getAllOraclePrices(): Promise<Array<{ price: number; source: string }>>;
  setEmergencyPause(paused: boolean): Promise<void>;
  disableBuyback(): Promise<void>;
  disableStaking(): Promise<void>;
  setMaxTransactionSize(size: BN): Promise<void>;
  enableEnhancedMonitoring(): Promise<void>;
}

export class CircuitBreaker {
  private tripConditions: TripCondition[] = [];
  private tripHistory: TripEvent[] = [];

  constructor(private client: TwistTokenClient) {
    this.initializeConditions();
  }

  private initializeConditions(): void {
    // Price volatility breaker
    this.tripConditions.push({
      name: "PriceVolatility",
      check: async () => {
        const priceHistory = await this.client.getPriceHistory(3600); // 1 hour
        const volatility = this.calculateVolatility(priceHistory);
        return {
          shouldTrip: volatility > 0.5, // 50% volatility
          severity: "high" as Severity,
          message: `Price volatility at ${(volatility * 100).toFixed(1)}%`,
        };
      },
    });

    // Volume spike breaker
    this.tripConditions.push({
      name: "VolumeSpike",
      check: async () => {
        const currentVolume = await this.client.get24hVolume();
        const avgVolume = await this.client.get7dAverageVolume();
        const spike = currentVolume.div(avgVolume);
        return {
          shouldTrip: spike.gt(new BN(10)), // 10x normal volume
          severity: "medium" as Severity,
          message: `Volume spike: ${spike.toString()}x normal`,
        };
      },
    });

    // Rapid supply change breaker
    this.tripConditions.push({
      name: "SupplyChange",
      check: async () => {
        const supply24hAgo = await this.client.getSupplyAt(Date.now() - 86400000);
        const currentSupply = await this.client.getCurrentSupply();
        const change = currentSupply.sub(supply24hAgo).abs();
        const changePercent = change.mul(new BN(10000)).div(supply24hAgo);
        return {
          shouldTrip: changePercent.gt(new BN(200)), // 2% daily change
          severity: "high" as Severity,
          message: `Supply changed by ${changePercent.toNumber() / 100}% in 24h`,
        };
      },
    });

    // Oracle divergence breaker
    this.tripConditions.push({
      name: "OracleDivergence",
      check: async () => {
        const prices = await this.client.getAllOraclePrices();
        const maxPrice = Math.max(...prices.map(p => p.price));
        const minPrice = Math.min(...prices.map(p => p.price));
        const divergence = (maxPrice - minPrice) / minPrice;
        return {
          shouldTrip: divergence > 0.05, // 5% divergence
          severity: "critical" as Severity,
          message: `Oracle divergence: ${(divergence * 100).toFixed(1)}%`,
        };
      },
    });
  }

  async checkConditions(): Promise<CircuitBreakerStatus> {
    const results = await Promise.all(
      this.tripConditions.map(async (condition) => {
        try {
          const result = await condition.check();
          return { condition: condition.name, ...result };
        } catch (error) {
          return {
            condition: condition.name,
            shouldTrip: false,
            severity: "low" as Severity,
            message: `Check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          };
        }
      })
    );

    const trippedConditions = results.filter(r => r.shouldTrip);
    const maxSeverity = this.getMaxSeverity(trippedConditions);

    if (trippedConditions.length > 0 && maxSeverity) {
      await this.handleTrip(trippedConditions, maxSeverity);
    }

    return {
      isTripped: trippedConditions.length > 0,
      severity: maxSeverity,
      conditions: results,
      canReset: await this.canReset(),
    };
  }

  private async handleTrip(
    conditions: Array<{ condition: string } & TripResult>,
    severity: Severity
  ): Promise<void> {
    const tripEvent: TripEvent = {
      timestamp: Date.now(),
      conditions: conditions.map(c => c.condition),
      severity,
      autoResetAfter: this.getAutoResetDuration(severity),
    };

    this.tripHistory.push(tripEvent);

    // Execute trip based on severity
    switch (severity) {
      case "critical":
        // Full emergency pause
        await this.client.setEmergencyPause(true);
        await this.client.disableBuyback();
        await this.client.disableStaking();
        break;

      case "high":
        // Partial restrictions
        await this.client.disableBuyback();
        await this.client.setMaxTransactionSize(new BN(10000)); // Limit tx size
        break;

      case "medium":
        // Monitoring mode
        await this.client.enableEnhancedMonitoring();
        break;

      case "low":
        // Alert only
        break;
    }

    // Notify operators
    await this.notifyOperators(tripEvent);
  }

  private getAutoResetDuration(severity: Severity): number {
    switch (severity) {
      case "critical": return 24 * 3600 * 1000; // 24 hours
      case "high": return 4 * 3600 * 1000; // 4 hours
      case "medium": return 3600 * 1000; // 1 hour
      case "low": return 900 * 1000; // 15 minutes
    }
  }

  private getMaxSeverity(conditions: Array<{ severity: Severity }>): Severity | null {
    if (conditions.length === 0) return null;

    const severityOrder: Severity[] = ["critical", "high", "medium", "low"];
    
    for (const severity of severityOrder) {
      if (conditions.some(c => c.severity === severity)) {
        return severity;
      }
    }

    return "low";
  }

  private calculateVolatility(priceHistory: Array<{ price: number; timestamp: number }>): number {
    if (priceHistory.length < 2) return 0;

    const prices = priceHistory.map(p => p.price);
    const returns = [];

    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i]! - prices[i - 1]!) / prices[i - 1]!);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  private async canReset(): Promise<boolean> {
    if (this.tripHistory.length === 0) return true;

    const lastTrip = this.tripHistory[this.tripHistory.length - 1];
    if (!lastTrip) return true;

    const timeSinceTrip = Date.now() - lastTrip.timestamp;
    return timeSinceTrip >= lastTrip.autoResetAfter;
  }

  private async notifyOperators(event: TripEvent): Promise<void> {
    // In production, this would send alerts via PagerDuty, email, etc.
    console.error(`[CIRCUIT BREAKER] Tripped with severity: ${event.severity}`);
    console.error(`Conditions: ${event.conditions.join(", ")}`);
  }

  async reset(): Promise<void> {
    if (!await this.canReset()) {
      throw new Error("Cannot reset circuit breaker yet");
    }

    // Reset all restrictions
    await this.client.setEmergencyPause(false);
    // Note: Re-enabling features would typically require additional checks
    
    // Clear trip history
    this.tripHistory = [];
  }

  getHistory(): TripEvent[] {
    return [...this.tripHistory];
  }

  addCustomCondition(condition: TripCondition): void {
    this.tripConditions.push(condition);
  }

  removeCondition(name: string): void {
    this.tripConditions = this.tripConditions.filter(c => c.name !== name);
  }
}