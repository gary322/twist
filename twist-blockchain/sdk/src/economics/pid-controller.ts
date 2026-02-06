import BN from "bn.js";

export interface PIDParams {
  kp: number; // Proportional gain
  ki: number; // Integral gain
  kd: number; // Derivative gain
}

export interface MintAdjustment {
  mintAmount: BN;
  adjustmentReason: string;
}

export class SupplyPIDController {
  protected kp: number;
  protected ki: number;
  protected kd: number;
  protected integral: number = 0;
  protected previousError: number = 0;
  protected lastUpdateTime: number = Date.now();

  constructor(params: PIDParams = { kp: 0.5, ki: 0.1, kd: 0.2 }) {
    this.kp = params.kp;
    this.ki = params.ki;
    this.kd = params.kd;
  }

  calculateMintAdjustment(params: {
    targetPrice: number;
    currentPrice: number;
    currentSupply: BN;
    maxMintRate: number; // Max % of supply that can be minted daily
  }): MintAdjustment {
    const currentTime = Date.now();
    const dt = (currentTime - this.lastUpdateTime) / 1000; // seconds

    // Calculate error (positive = price too low, need to reduce supply)
    const error = (params.targetPrice - params.currentPrice) / params.targetPrice;

    // Update integral (with anti-windup)
    this.integral += error * dt;
    this.integral = Math.max(-1, Math.min(1, this.integral)); // Clamp to [-1, 1]

    // Calculate derivative
    const derivative = dt > 0 ? (error - this.previousError) / dt : 0;

    // PID output
    const output = this.kp * error + this.ki * this.integral + this.kd * derivative;

    // Convert to mint adjustment (negative output = mint, positive = burn)
    const supplyAdjustmentPercent = -output * params.maxMintRate;
    const supplyAdjustment = params.currentSupply
      .mul(new BN(Math.abs(supplyAdjustmentPercent * 10000)))
      .div(new BN(10000));

    // Update state
    this.previousError = error;
    this.lastUpdateTime = currentTime;

    let adjustmentReason = "";
    if (supplyAdjustmentPercent > 0) {
      adjustmentReason = `Minting ${supplyAdjustmentPercent.toFixed(2)}% to increase supply (price ${((1 - error) * 100).toFixed(1)}% below target)`;
    } else if (supplyAdjustmentPercent < 0) {
      adjustmentReason = `Burning ${Math.abs(supplyAdjustmentPercent).toFixed(2)}% to decrease supply (price ${((error - 1) * 100).toFixed(1)}% above target)`;
    } else {
      adjustmentReason = "No adjustment needed";
    }

    return {
      mintAmount: supplyAdjustment,
      adjustmentReason,
    };
  }

  reset(): void {
    this.integral = 0;
    this.previousError = 0;
    this.lastUpdateTime = Date.now();
  }

  getState(): {
    kp: number;
    ki: number;
    kd: number;
    integral: number;
    previousError: number;
    lastUpdateTime: number;
  } {
    return {
      kp: this.kp,
      ki: this.ki,
      kd: this.kd,
      integral: this.integral,
      previousError: this.previousError,
      lastUpdateTime: this.lastUpdateTime,
    };
  }

  updateGains(params: PIDParams): void {
    this.kp = params.kp;
    this.ki = params.ki;
    this.kd = params.kd;
  }

  simulateAdjustments(
    currentPrice: number,
    targetPrice: number,
    currentSupply: BN,
    maxMintRate: number,
    days: number
  ): Array<{
    day: number;
    price: number;
    supply: string;
    adjustment: string;
  }> {
    const results = [];
    let price = currentPrice;
    let supply = currentSupply;

    // Save current state
    const savedState = this.getState();

    // Reset for simulation
    this.reset();

    for (let day = 0; day < days; day++) {
      const adjustment = this.calculateMintAdjustment({
        targetPrice,
        currentPrice: price,
        currentSupply: supply,
        maxMintRate,
      });

      // Apply adjustment to supply
      if (adjustment.adjustmentReason.includes("Minting")) {
        supply = supply.add(adjustment.mintAmount);
      } else if (adjustment.adjustmentReason.includes("Burning")) {
        supply = supply.sub(adjustment.mintAmount);
      }

      // Simulate price impact (simplified)
      // Price moves inversely to supply changes
      const supplyChange = adjustment.mintAmount.toNumber() / supply.toNumber();
      price = price * (1 - supplyChange * 0.5); // 50% price elasticity

      results.push({
        day,
        price,
        supply: supply.toString(),
        adjustment: adjustment.adjustmentReason,
      });
    }

    // Restore original state
    this.kp = savedState.kp;
    this.ki = savedState.ki;
    this.kd = savedState.kd;
    this.integral = savedState.integral;
    this.previousError = savedState.previousError;
    this.lastUpdateTime = savedState.lastUpdateTime;

    return results;
  }
}

export class AdaptivePIDController extends SupplyPIDController {
  private performanceHistory: Array<{ error: number; timestamp: number }> = [];
  private adaptationRate: number = 0.01;

  constructor(params: PIDParams = { kp: 0.5, ki: 0.1, kd: 0.2 }) {
    super(params);
  }

  override calculateMintAdjustment(params: {
    targetPrice: number;
    currentPrice: number;
    currentSupply: BN;
    maxMintRate: number;
  }): MintAdjustment {
    const result = super.calculateMintAdjustment(params);

    // Track performance
    const error = Math.abs((params.targetPrice - params.currentPrice) / params.targetPrice);
    this.performanceHistory.push({
      error,
      timestamp: Date.now(),
    });

    // Keep only recent history (last 100 measurements)
    if (this.performanceHistory.length > 100) {
      this.performanceHistory.shift();
    }

    // Adapt gains if performance is poor
    if (this.performanceHistory.length >= 10) {
      const recentErrors = this.performanceHistory.slice(-10);
      const avgError = recentErrors.reduce((sum, h) => sum + h.error, 0) / recentErrors.length;

      if (avgError > 0.05) { // More than 5% average error
        // Increase proportional gain
        this.updateGains({
          kp: Math.min(this.kp * (1 + this.adaptationRate), 2.0),
          ki: this.ki,
          kd: this.kd,
        });
      } else if (avgError < 0.01) { // Less than 1% average error
        // Decrease gains to prevent overshoot
        this.updateGains({
          kp: Math.max(this.kp * (1 - this.adaptationRate), 0.1),
          ki: this.ki,
          kd: this.kd,
        });
      }
    }

    return result;
  }

  getPerformanceMetrics(): {
    averageError: number;
    errorTrend: "improving" | "worsening" | "stable";
    adaptationCount: number;
  } {
    if (this.performanceHistory.length < 2) {
      return {
        averageError: 0,
        errorTrend: "stable",
        adaptationCount: 0,
      };
    }

    const avgError = this.performanceHistory.reduce((sum, h) => sum + h.error, 0) / this.performanceHistory.length;

    // Calculate trend
    const firstHalf = this.performanceHistory.slice(0, Math.floor(this.performanceHistory.length / 2));
    const secondHalf = this.performanceHistory.slice(Math.floor(this.performanceHistory.length / 2));

    const firstHalfAvg = firstHalf.reduce((sum, h) => sum + h.error, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, h) => sum + h.error, 0) / secondHalf.length;

    let errorTrend: "improving" | "worsening" | "stable";
    if (secondHalfAvg < firstHalfAvg * 0.9) {
      errorTrend = "improving";
    } else if (secondHalfAvg > firstHalfAvg * 1.1) {
      errorTrend = "worsening";
    } else {
      errorTrend = "stable";
    }

    return {
      averageError: avgError,
      errorTrend,
      adaptationCount: this.performanceHistory.length,
    };
  }
}