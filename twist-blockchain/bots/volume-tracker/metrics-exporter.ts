import * as express from 'express';
import * as promClient from 'prom-client';
import { Server } from 'http';

interface VolumeMetrics {
  timestamp: number;
  volume1m: number;
  volume5m: number;
  volume15m: number;
  volume1h: number;
  volume24h: number;
  volume7d: number;
  volume30d: number;
  tradeCount1h: number;
  tradeCount24h: number;
  uniqueTraders24h: number;
  avgTradeSize24h: number;
  largestTrade24h: any | null;
  buyVolume24h: number;
  sellVolume24h: number;
  buyPressure: number;
}

interface Trade {
  signature: string;
  timestamp: number;
  trader: any;
  dex: string;
  side: 'buy' | 'sell';
  amountIn: number;
  amountOut: number;
  price: number;
  volumeUsd: number;
  fee: number;
}

export class MetricsExporter {
  private app: express.Application;
  private server?: Server;
  private registry: promClient.Registry;
  
  // Prometheus metrics
  private volumeMetrics: Map<string, promClient.Gauge>;
  private tradeCounters: Map<string, promClient.Counter>;
  private tradeHistograms: Map<string, promClient.Histogram>;
  
  constructor(private port: number = 9092) {
    this.app = express();
    this.registry = new promClient.Registry();
    
    // Initialize metrics
    this.volumeMetrics = new Map();
    this.tradeCounters = new Map();
    this.tradeHistograms = new Map();
    
    this.setupMetrics();
    this.setupRoutes();
  }
  
  private setupMetrics() {
    // Volume metrics for different time periods
    const volumePeriods = [
      { name: 'volume_1m', help: '1 minute trading volume in USD' },
      { name: 'volume_5m', help: '5 minute trading volume in USD' },
      { name: 'volume_15m', help: '15 minute trading volume in USD' },
      { name: 'volume_1h', help: '1 hour trading volume in USD' },
      { name: 'volume_24h', help: '24 hour trading volume in USD' },
      { name: 'volume_7d', help: '7 day trading volume in USD' },
      { name: 'volume_30d', help: '30 day trading volume in USD' },
    ];
    
    volumePeriods.forEach(({ name, help }) => {
      const gauge = new promClient.Gauge({
        name: `twist_${name}`,
        help,
        registers: [this.registry],
      });
      this.volumeMetrics.set(name, gauge);
    });
    
    // Trade counts
    this.volumeMetrics.set('trade_count_1h', new promClient.Gauge({
      name: 'twist_trade_count_1h',
      help: 'Number of trades in the last hour',
      registers: [this.registry],
    }));
    
    this.volumeMetrics.set('trade_count_24h', new promClient.Gauge({
      name: 'twist_trade_count_24h',
      help: 'Number of trades in the last 24 hours',
      registers: [this.registry],
    }));
    
    this.volumeMetrics.set('unique_traders_24h', new promClient.Gauge({
      name: 'twist_unique_traders_24h',
      help: 'Number of unique traders in the last 24 hours',
      registers: [this.registry],
    }));
    
    this.volumeMetrics.set('avg_trade_size_24h', new promClient.Gauge({
      name: 'twist_avg_trade_size_24h',
      help: 'Average trade size in USD over 24 hours',
      registers: [this.registry],
    }));
    
    // Buy/sell metrics
    this.volumeMetrics.set('buy_volume_24h', new promClient.Gauge({
      name: 'twist_buy_volume_24h',
      help: '24 hour buy volume in USD',
      registers: [this.registry],
    }));
    
    this.volumeMetrics.set('sell_volume_24h', new promClient.Gauge({
      name: 'twist_sell_volume_24h',
      help: '24 hour sell volume in USD',
      registers: [this.registry],
    }));
    
    this.volumeMetrics.set('buy_pressure', new promClient.Gauge({
      name: 'twist_buy_pressure',
      help: 'Buy pressure as ratio of buy volume to total volume',
      registers: [this.registry],
    }));
    
    // Trade counters by DEX
    ['Orca', 'Raydium'].forEach(dex => {
      this.tradeCounters.set(`trades_${dex.toLowerCase()}`, new promClient.Counter({
        name: `twist_trades_total_${dex.toLowerCase()}`,
        help: `Total number of trades on ${dex}`,
        labelNames: ['side'],
        registers: [this.registry],
      }));
      
      this.tradeCounters.set(`volume_${dex.toLowerCase()}`, new promClient.Counter({
        name: `twist_volume_total_${dex.toLowerCase()}`,
        help: `Total volume on ${dex} in USD`,
        labelNames: ['side'],
        registers: [this.registry],
      }));
    });
    
    // Trade size histogram
    this.tradeHistograms.set('trade_size', new promClient.Histogram({
      name: 'twist_trade_size_usd',
      help: 'Distribution of trade sizes in USD',
      labelNames: ['dex', 'side'],
      buckets: [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000],
      registers: [this.registry],
    }));
    
    // Trade execution price histogram
    this.tradeHistograms.set('execution_price', new promClient.Histogram({
      name: 'twist_execution_price',
      help: 'Distribution of trade execution prices',
      labelNames: ['dex'],
      buckets: [0.001, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.2, 0.5],
      registers: [this.registry],
    }));
    
    // Fee histogram
    this.tradeHistograms.set('trade_fee', new promClient.Histogram({
      name: 'twist_trade_fee_usd',
      help: 'Distribution of trade fees in USD',
      labelNames: ['dex'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 20, 50],
      registers: [this.registry],
    }));
    
    // System metrics
    this.volumeMetrics.set('last_update', new promClient.Gauge({
      name: 'twist_volume_tracker_last_update',
      help: 'Timestamp of last volume update',
      registers: [this.registry],
    }));
    
    // Default metrics (process, nodejs)
    promClient.collectDefaultMetrics({ register: this.registry });
  }
  
  private setupRoutes() {
    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      res.set('Content-Type', this.registry.contentType);
      this.registry.metrics().then(metrics => {
        res.end(metrics);
      }).catch(err => {
        res.status(500).end(err);
      });
    });
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: Date.now(),
      });
    });
    
    // Current metrics summary
    this.app.get('/summary', (req, res) => {
      const summary: any = {};
      
      this.volumeMetrics.forEach((gauge, name) => {
        const metric = this.registry.getSingleMetric(`twist_${name}`);
        if (metric && 'get' in metric) {
          const values = (metric as any).get().values;
          if (values && values.length > 0) {
            summary[name] = values[0].value;
          }
        }
      });
      
      res.json(summary);
    });
  }
  
  public start() {
    this.server = this.app.listen(this.port, () => {
      logger.log(`📊 Metrics exporter listening on port ${this.port}`);
      logger.log(`   Prometheus metrics: http://localhost:${this.port}/metrics`);
      logger.log(`   Health check: http://localhost:${this.port}/health`);
      logger.log(`   Summary: http://localhost:${this.port}/summary`);
    });
  }
  
  public stop() {
    if (this.server) {
      this.server.close();
    }
  }
  
  public updateMetrics(metrics: VolumeMetrics) {
    // Update volume gauges
    this.volumeMetrics.get('volume_1m')?.set(metrics.volume1m);
    this.volumeMetrics.get('volume_5m')?.set(metrics.volume5m);
    this.volumeMetrics.get('volume_15m')?.set(metrics.volume15m);
    this.volumeMetrics.get('volume_1h')?.set(metrics.volume1h);
    this.volumeMetrics.get('volume_24h')?.set(metrics.volume24h);
    this.volumeMetrics.get('volume_7d')?.set(metrics.volume7d);
    this.volumeMetrics.get('volume_30d')?.set(metrics.volume30d);
    
    // Update trade counts
    this.volumeMetrics.get('trade_count_1h')?.set(metrics.tradeCount1h);
    this.volumeMetrics.get('trade_count_24h')?.set(metrics.tradeCount24h);
    this.volumeMetrics.get('unique_traders_24h')?.set(metrics.uniqueTraders24h);
    this.volumeMetrics.get('avg_trade_size_24h')?.set(metrics.avgTradeSize24h);
    
    // Update buy/sell metrics
    this.volumeMetrics.get('buy_volume_24h')?.set(metrics.buyVolume24h);
    this.volumeMetrics.get('sell_volume_24h')?.set(metrics.sellVolume24h);
    this.volumeMetrics.get('buy_pressure')?.set(metrics.buyPressure);
    
    // Update last update timestamp
    this.volumeMetrics.get('last_update')?.set(metrics.timestamp);
  }
  
  public recordTrade(trade: Trade) {
    const dexLower = trade.dex.toLowerCase();
    
    // Increment trade counter
    const tradeCounter = this.tradeCounters.get(`trades_${dexLower}`);
    if (tradeCounter) {
      tradeCounter.inc({ side: trade.side });
    }
    
    // Increment volume counter
    const volumeCounter = this.tradeCounters.get(`volume_${dexLower}`);
    if (volumeCounter) {
      volumeCounter.inc({ side: trade.side }, trade.volumeUsd);
    }
    
    // Record trade size distribution
    const sizeHistogram = this.tradeHistograms.get('trade_size');
    if (sizeHistogram) {
      sizeHistogram.observe({ dex: trade.dex, side: trade.side }, trade.volumeUsd);
    }
    
    // Record execution price
    const priceHistogram = this.tradeHistograms.get('execution_price');
    if (priceHistogram) {
      priceHistogram.observe({ dex: trade.dex }, trade.price);
    }
    
    // Record fee
    const feeHistogram = this.tradeHistograms.get('trade_fee');
    if (feeHistogram) {
      feeHistogram.observe({ dex: trade.dex }, trade.fee);
    }
  }
  
  public getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
  
  public getSingleMetric(name: string): promClient.Metric<string> | undefined {
    return this.registry.getSingleMetric(name);
  }
  
  public clear() {
    this.registry.clear();
  }
}