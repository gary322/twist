#!/usr/bin/env ts-node

import { Connection, PublicKey, ParsedTransactionWithMeta, ConfirmedSignatureInfo } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@project-serum/anchor';
import { TradeAnalyzer } from './trade-analyzer';
import { VolumeDatabase } from './volume-database';
import { MetricsExporter } from './metrics-exporter';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface VolumeTrackerConfig {
  rpcUrl: string;
  programId: PublicKey;
  dexPrograms: Array<{
    name: string;
    programId: PublicKey;
    poolAddress?: PublicKey;
  }>;
  trackingInterval: number;
  dbPath: string;
  metricsPort: number;
  webhookUrl?: string;
}

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
  largestTrade24h: Trade | null;
  buyVolume24h: number;
  sellVolume24h: number;
  buyPressure: number; // buy volume / total volume
}

interface Trade {
  signature: string;
  timestamp: number;
  trader: PublicKey;
  dex: string;
  side: 'buy' | 'sell';
  amountIn: number;
  amountOut: number;
  price: number;
  volumeUsd: number;
  fee: number;
}

export class VolumeTracker {
  private connection: Connection;
  private program?: Program;
  private tradeAnalyzer: TradeAnalyzer;
  private db: VolumeDatabase;
  private metricsExporter: MetricsExporter;
  private config: VolumeTrackerConfig;
  
  private isRunning: boolean = false;
  private lastProcessedSignature?: string;
  private recentTrades: Trade[] = [];
  
  constructor(config: VolumeTrackerConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: config.rpcUrl.replace('https', 'wss'),
    });
    
    this.tradeAnalyzer = new TradeAnalyzer(this.connection, config.dexPrograms);
    this.db = new VolumeDatabase(config.dbPath);
    this.metricsExporter = new MetricsExporter(config.metricsPort);
    
    this.loadProgram(config.programId);
  }
  
  private async loadProgram(programId: PublicKey) {
    try {
      const idlPath = path.join(__dirname, '../../target/idl/twist_token.json');
      const idl = JSON.parse(require('fs').readFileSync(idlPath, 'utf-8'));
      
      const provider = new AnchorProvider(
        this.connection,
        {} as any, // Read-only
        { commitment: 'confirmed' }
      );
      
      this.program = new Program(idl, programId, provider);
    } catch (error) {
      console.error('Failed to load program:', error);
    }
  }
  
  public async start() {
    logger.log('📊 Starting TWIST Volume Tracker...\n');
    logger.log('Configuration:');
    logger.log(`  Tracking ${this.config.dexPrograms.length} DEXes`);
    logger.log(`  Update interval: ${this.config.trackingInterval / 1000}s`);
    logger.log(`  Metrics port: ${this.config.metricsPort}`);
    logger.log('');
    
    // Initialize database
    await this.db.initialize();
    
    // Start metrics server
    this.metricsExporter.start();
    
    // Setup real-time monitoring
    await this.setupRealtimeMonitoring();
    
    this.isRunning = true;
    
    // Main loop
    while (this.isRunning) {
      try {
        await this.updateVolumeMetrics();
      } catch (error) {
        console.error('Error updating volume metrics:', error);
      }
      
      await this.sleep(this.config.trackingInterval);
    }
  }
  
  private async setupRealtimeMonitoring() {
    // Monitor each DEX for trades
    for (const dex of this.config.dexPrograms) {
      if (dex.poolAddress) {
        logger.log(`Setting up monitoring for ${dex.name}...`);
        
        // Subscribe to account changes
        this.connection.onAccountChange(
          dex.poolAddress,
          async (accountInfo, context) => {
            // Pool state changed, likely a trade
            await this.checkForNewTrades(dex);
          },
          'confirmed'
        );
      }
    }
    
    // Also monitor program logs
    if (this.program) {
      this.connection.onLogs(
        this.program.programId,
        async (logs, context) => {
          if (logs.err === null) {
            await this.processLogs(logs);
          }
        },
        'confirmed'
      );
    }
  }
  
  private async checkForNewTrades(dex: any) {
    try {
      // Get recent signatures for the pool
      const signatures = await this.connection.getSignaturesForAddress(
        dex.poolAddress,
        { limit: 10 }
      );
      
      // Process new signatures
      for (const sigInfo of signatures) {
        if (this.isNewSignature(sigInfo.signature)) {
          const trade = await this.analyzeTrade(sigInfo, dex);
          if (trade) {
            await this.recordTrade(trade);
          }
        }
      }
    } catch (error) {
      console.error(`Error checking trades for ${dex.name}:`, error);
    }
  }
  
  private async analyzeTrade(
    sigInfo: ConfirmedSignatureInfo,
    dex: any
  ): Promise<Trade | null> {
    try {
      const tx = await this.connection.getParsedTransaction(
        sigInfo.signature,
        { maxSupportedTransactionVersion: 0 }
      );
      
      if (!tx || !tx.meta || tx.meta.err !== null) {
        return null;
      }
      
      // Analyze transaction to extract trade details
      const tradeDetails = await this.tradeAnalyzer.analyzeTransaction(tx, dex);
      
      if (!tradeDetails) {
        return null;
      }
      
      // Get current price for volume calculation
      const price = await this.getCurrentPrice();
      
      // Determine trade side and volume
      let volumeUsd: number;
      let side: 'buy' | 'sell';
      
      if (tradeDetails.tokenA === 'TWIST') {
        // TWIST -> USDC = sell
        side = 'sell';
        volumeUsd = tradeDetails.amountA * price;
      } else {
        // USDC -> TWIST = buy
        side = 'buy';
        volumeUsd = tradeDetails.amountB;
      }
      
      return {
        signature: sigInfo.signature,
        timestamp: (sigInfo.blockTime || Date.now() / 1000) * 1000,
        trader: tradeDetails.trader,
        dex: dex.name,
        side,
        amountIn: tradeDetails.amountIn,
        amountOut: tradeDetails.amountOut,
        price: tradeDetails.executionPrice,
        volumeUsd,
        fee: tradeDetails.fee,
      };
    } catch (error) {
      console.error('Error analyzing trade:', error);
      return null;
    }
  }
  
  private async recordTrade(trade: Trade) {
    // Add to recent trades
    this.recentTrades.push(trade);
    
    // Keep only last 24h of trades in memory
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.recentTrades = this.recentTrades.filter(t => t.timestamp > cutoff);
    
    // Save to database
    await this.db.insertTrade(trade);
    
    // Update metrics
    this.metricsExporter.recordTrade(trade);
    
    // Log significant trades
    if (trade.volumeUsd > 10000) {
      logger.log(`\n🐋 Large trade detected!`);
      logger.log(`  DEX: ${trade.dex}`);
      logger.log(`  Side: ${trade.side.toUpperCase()}`);
      logger.log(`  Volume: $${trade.volumeUsd.toLocaleString()}`);
      logger.log(`  Price: $${trade.price.toFixed(4)}`);
      logger.log(`  Trader: ${trade.trader.toBase58().slice(0, 8)}...`);
    }
  }
  
  private async updateVolumeMetrics() {
    const now = Date.now();
    
    // Calculate volume for different time periods
    const metrics: VolumeMetrics = {
      timestamp: now,
      volume1m: await this.calculateVolume(now - 60 * 1000),
      volume5m: await this.calculateVolume(now - 5 * 60 * 1000),
      volume15m: await this.calculateVolume(now - 15 * 60 * 1000),
      volume1h: await this.calculateVolume(now - 60 * 60 * 1000),
      volume24h: await this.calculateVolume(now - 24 * 60 * 60 * 1000),
      volume7d: await this.calculateVolume(now - 7 * 24 * 60 * 60 * 1000),
      volume30d: await this.calculateVolume(now - 30 * 24 * 60 * 60 * 1000),
      tradeCount1h: await this.getTradeCount(now - 60 * 60 * 1000),
      tradeCount24h: await this.getTradeCount(now - 24 * 60 * 60 * 1000),
      uniqueTraders24h: await this.getUniqueTraders(now - 24 * 60 * 60 * 1000),
      avgTradeSize24h: await this.getAverageTradeSize(now - 24 * 60 * 60 * 1000),
      largestTrade24h: await this.getLargestTrade(now - 24 * 60 * 60 * 1000),
      buyVolume24h: await this.getVolumeByS

(now - 24 * 60 * 60 * 1000, 'buy'),
      sellVolume24h: await this.getVolumeBySide(now - 24 * 60 * 60 * 1000, 'sell'),
      buyPressure: 0, // Calculated below
    };
    
    // Calculate buy pressure
    const totalVolume24h = metrics.buyVolume24h + metrics.sellVolume24h;
    metrics.buyPressure = totalVolume24h > 0 ? metrics.buyVolume24h / totalVolume24h : 0.5;
    
    // Export metrics
    this.metricsExporter.updateMetrics(metrics);
    
    // Log summary
    logger.log(`\n📊 Volume Update at ${new Date().toISOString()}`);
    logger.log(`  24h Volume: $${metrics.volume24h.toLocaleString()}`);
    logger.log(`  24h Trades: ${metrics.tradeCount24h}`);
    logger.log(`  Unique Traders: ${metrics.uniqueTraders24h}`);
    logger.log(`  Buy Pressure: ${(metrics.buyPressure * 100).toFixed(1)}%`);
    
    // Send alerts for unusual activity
    await this.checkVolumeAlerts(metrics);
  }
  
  private async calculateVolume(since: number): Promise<number> {
    const trades = await this.db.getTradesSince(since);
    return trades.reduce((sum, trade) => sum + trade.volumeUsd, 0);
  }
  
  private async getTradeCount(since: number): Promise<number> {
    const trades = await this.db.getTradesSince(since);
    return trades.length;
  }
  
  private async getUniqueTraders(since: number): Promise<number> {
    const trades = await this.db.getTradesSince(since);
    const traders = new Set(trades.map(t => t.trader.toBase58()));
    return traders.size;
  }
  
  private async getAverageTradeSize(since: number): Promise<number> {
    const trades = await this.db.getTradesSince(since);
    if (trades.length === 0) return 0;
    
    const totalVolume = trades.reduce((sum, t) => sum + t.volumeUsd, 0);
    return totalVolume / trades.length;
  }
  
  private async getLargestTrade(since: number): Promise<Trade | null> {
    const trades = await this.db.getTradesSince(since);
    if (trades.length === 0) return null;
    
    return trades.reduce((largest, trade) => 
      trade.volumeUsd > (largest?.volumeUsd || 0) ? trade : largest
    );
  }
  
  private async getVolumeBySide(since: number, side: 'buy' | 'sell'): Promise<number> {
    const trades = await this.db.getTradesSince(since);
    return trades
      .filter(t => t.side === side)
      .reduce((sum, t) => sum + t.volumeUsd, 0);
  }
  
  private async checkVolumeAlerts(metrics: VolumeMetrics) {
    // Volume spike alert
    const avgDailyVolume = metrics.volume30d / 30;
    if (metrics.volume24h > avgDailyVolume * 3) {
      await this.sendAlert({
        type: 'volume_spike',
        severity: 'high',
        message: `Volume spike detected: ${(metrics.volume24h / avgDailyVolume).toFixed(1)}x average`,
        data: {
          current24h: metrics.volume24h,
          average24h: avgDailyVolume,
        },
      });
    }
    
    // Buy/sell imbalance alert
    if (metrics.buyPressure > 0.8 || metrics.buyPressure < 0.2) {
      await this.sendAlert({
        type: 'volume_imbalance',
        severity: 'medium',
        message: `Significant ${metrics.buyPressure > 0.5 ? 'buying' : 'selling'} pressure: ${(metrics.buyPressure * 100).toFixed(1)}%`,
        data: {
          buyVolume: metrics.buyVolume24h,
          sellVolume: metrics.sellVolume24h,
        },
      });
    }
    
    // Low volume alert
    if (metrics.volume24h < 50000) {
      await this.sendAlert({
        type: 'low_volume',
        severity: 'medium',
        message: `Low 24h volume: $${metrics.volume24h.toLocaleString()}`,
        data: metrics,
      });
    }
  }
  
  private async sendAlert(alert: any) {
    logger.log(`\n⚠️  Alert: ${alert.message}`);
    
    if (this.config.webhookUrl) {
      try {
        await fetch(this.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...alert,
            timestamp: Date.now(),
            source: 'volume-tracker',
          }),
        });
      } catch (error) {
        console.error('Failed to send alert:', error);
      }
    }
  }
  
  private async getCurrentPrice(): Promise<number> {
    // Get from program state or oracle
    if (this.program) {
      try {
        const state = await this.program.account.programState.fetch(
          await this.getProgramState()
        );
        return state.lastOraclePrice.toNumber() / 1e6;
      } catch {
        // Fallback
      }
    }
    return 0.05; // Fallback price
  }
  
  private async getProgramState(): Promise<PublicKey> {
    const [programState] = await PublicKey.findProgramAddress(
      [Buffer.from('program_state')],
      this.config.programId
    );
    return programState;
  }
  
  private async processLogs(logs: any) {
    // Process program logs for additional trade information
    if (logs.logs.some((log: string) => log.includes('TokensSwapped'))) {
      // Extract trade details from logs
      // This would parse the actual log format
    }
  }
  
  private isNewSignature(signature: string): boolean {
    if (!this.lastProcessedSignature) {
      this.lastProcessedSignature = signature;
      return true;
    }
    
    if (signature !== this.lastProcessedSignature) {
      this.lastProcessedSignature = signature;
      return true;
    }
    
    return false;
  }
  
  public async getHistoricalVolume(
    period: '1h' | '24h' | '7d' | '30d'
  ): Promise<Array<{ timestamp: number; volume: number }>> {
    const intervals = {
      '1h': { duration: 60 * 60 * 1000, step: 5 * 60 * 1000 }, // 5 min intervals
      '24h': { duration: 24 * 60 * 60 * 1000, step: 60 * 60 * 1000 }, // 1 hour intervals
      '7d': { duration: 7 * 24 * 60 * 60 * 1000, step: 6 * 60 * 60 * 1000 }, // 6 hour intervals
      '30d': { duration: 30 * 24 * 60 * 60 * 1000, step: 24 * 60 * 60 * 1000 }, // 1 day intervals
    };
    
    const { duration, step } = intervals[period];
    const now = Date.now();
    const start = now - duration;
    
    const dataPoints: Array<{ timestamp: number; volume: number }> = [];
    
    for (let time = start; time < now; time += step) {
      const volume = await this.calculateVolume(time);
      dataPoints.push({ timestamp: time, volume });
    }
    
    return dataPoints;
  }
  
  public getStats() {
    return {
      trackedDexes: this.config.dexPrograms.length,
      recentTradesCount: this.recentTrades.length,
      lastUpdate: new Date(),
    };
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  public stop() {
    logger.log('\n🛑 Stopping volume tracker...');
    this.isRunning = false;
    this.metricsExporter.stop();
    this.db.close();
  }
}

// Main entry point
async function main() {
  const config: VolumeTrackerConfig = {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    programId: new PublicKey(process.env.TWIST_PROGRAM_ID || 'TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    dexPrograms: [
      {
        name: 'Orca',
        programId: new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
        poolAddress: process.env.ORCA_POOL ? new PublicKey(process.env.ORCA_POOL) : undefined,
      },
      {
        name: 'Raydium',
        programId: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
        poolAddress: process.env.RAYDIUM_POOL ? new PublicKey(process.env.RAYDIUM_POOL) : undefined,
      },
    ],
    trackingInterval: parseInt(process.env.VOLUME_UPDATE_INTERVAL || '60000'), // 1 minute
    dbPath: process.env.VOLUME_DB_PATH || './data/volume.db',
    metricsPort: parseInt(process.env.VOLUME_METRICS_PORT || '9092'),
    webhookUrl: process.env.VOLUME_WEBHOOK_URL,
  };
  
  const tracker = new VolumeTracker(config);
  
  // Setup graceful shutdown
  process.on('SIGINT', () => {
    tracker.stop();
    process.exit(0);
  });
  
  // Start tracking
  await tracker.start();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}