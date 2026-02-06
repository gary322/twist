import { Registry, Gauge, Counter, Histogram } from "prom-client";
import BN from "bn.js";
import { logger } from "./logger";

export interface PoolMetrics {
  tvl: BN;
  price: BN;
  volume24h: BN;
  fees24h: BN;
  tickSpacing: number;
  liquidity: BN;
}

export class MetricsCollector {
  private registry: Registry;
  private gauges: Map<string, Gauge>;
  private counters: Map<string, Counter>;
  private histograms: Map<string, Histogram>;

  constructor() {
    this.registry = new Registry();
    this.gauges = new Map();
    this.counters = new Map();
    this.histograms = new Map();

    this.initializeMetrics();
  }

  private initializeMetrics() {
    // TVL Gauge
    this.gauges.set("tvl", new Gauge({
      name: "twist_liquidity_tvl",
      help: "Total value locked in liquidity positions",
      registers: [this.registry],
    }));

    // Price Gauge
    this.gauges.set("price", new Gauge({
      name: "twist_token_price",
      help: "Current TWIST token price",
      registers: [this.registry],
    }));

    // Liquidity Gauge
    this.gauges.set("liquidity", new Gauge({
      name: "twist_pool_liquidity",
      help: "Total liquidity in the pool",
      registers: [this.registry],
    }));

    // Position Count Gauge
    this.gauges.set("position_count", new Gauge({
      name: "twist_liquidity_position_count",
      help: "Number of active liquidity positions",
      registers: [this.registry],
    }));

    // Rebalance Counter
    this.counters.set("rebalances", new Counter({
      name: "twist_liquidity_rebalances_total",
      help: "Total number of position rebalances",
      labelNames: ["status"],
      registers: [this.registry],
    }));

    // Liquidity Added Counter
    this.counters.set("liquidity_added", new Counter({
      name: "twist_liquidity_added_total",
      help: "Total liquidity added",
      registers: [this.registry],
    }));

    // Error Counter
    this.counters.set("errors", new Counter({
      name: "twist_liquidity_errors_total",
      help: "Total number of errors",
      labelNames: ["operation"],
      registers: [this.registry],
    }));

    // Rebalance Duration Histogram
    this.histograms.set("rebalance_duration", new Histogram({
      name: "twist_liquidity_rebalance_duration_seconds",
      help: "Duration of rebalance operations",
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    }));

    // Gas Cost Histogram
    this.histograms.set("gas_cost", new Histogram({
      name: "twist_liquidity_gas_cost_sol",
      help: "Gas cost of operations in SOL",
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
      labelNames: ["operation"],
      registers: [this.registry],
    }));
  }

  recordPoolMetrics(metrics: PoolMetrics) {
    this.gauges.get("tvl")?.set(parseFloat(metrics.tvl.toString()) / 1e9);
    this.gauges.get("price")?.set(parseFloat(metrics.price.toString()) / 1e6);
    this.gauges.get("liquidity")?.set(parseFloat(metrics.liquidity.toString()));
    
    logger.debug("Recorded pool metrics", {
      tvl: metrics.tvl.toString(),
      price: metrics.price.toString(),
      liquidity: metrics.liquidity.toString(),
    });
  }

  recordRebalance(success: boolean, duration: number) {
    this.counters.get("rebalances")?.inc({ status: success ? "success" : "failed" });
    this.histograms.get("rebalance_duration")?.observe(duration);
    
    logger.info(`Rebalance ${success ? "succeeded" : "failed"} in ${duration}s`);
  }

  recordLiquidityAdded(amount: BN) {
    const amountFloat = parseFloat(amount.toString()) / 1e9;
    this.counters.get("liquidity_added")?.inc(amountFloat);
    
    logger.info(`Added ${amountFloat} liquidity`);
  }

  recordGasCost(operation: string, costInSol: number) {
    this.histograms.get("gas_cost")?.observe({ operation }, costInSol);
    
    logger.debug(`Gas cost for ${operation}: ${costInSol} SOL`);
  }

  recordError(operation: string, error: any) {
    this.counters.get("errors")?.inc({ operation });
    
    logger.error(`Error in ${operation}:`, error);
  }

  recordPositionCount(count: number) {
    this.gauges.get("position_count")?.set(count);
  }

  getMetrics(): string {
    return this.registry.metrics();
  }

  async collectAndExport(): Promise<void> {
    // In production, this would export to Prometheus/Grafana
    const metrics = await this.registry.metrics();
    logger.debug("Collected metrics for export");
  }
}