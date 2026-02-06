#!/usr/bin/env ts-node

import { Connection, PublicKey } from '@solana/web3.js';
import { DexMonitor } from './dex-monitor';
import { ArbitrageCalculator } from './arbitrage-calculator';
import { AlertManager } from './alert-manager';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface ArbitrageOpportunity {
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
  ttl: number; // Time to live in ms
}

interface ArbitrageMonitorConfig {
  rpcUrl: string;
  checkIntervalMs: number;
  minProfitPercent: number;
  minProfitUsd: number;
  maxPositionSize: number;
  
  // DEX configurations
  dexes: Array<{
    name: string;
    programId: string;
    poolAddress?: string;
    feePercent: number;
  }>;
  
  // Alert configuration
  alertWebhook?: string;
  alertThresholdUsd: number;
  
  // Safety
  maxSlippagePercent: number;
  requireMultipleDexes: boolean;
  simulateBeforeAlert: boolean;
}

export class ArbitrageMonitor {
  private connection: Connection;
  private dexMonitor: DexMonitor;
  private calculator: ArbitrageCalculator;
  private alertManager: AlertManager;
  private config: ArbitrageMonitorConfig;
  
  private isRunning: boolean = false;
  private opportunities: Map<string, ArbitrageOpportunity> = new Map();
  private executedArbs: Array<any> = [];
  
  constructor(config: ArbitrageMonitorConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: config.rpcUrl.replace('https', 'wss'),
    });
    
    this.dexMonitor = new DexMonitor(this.connection, config.dexes);
    this.calculator = new ArbitrageCalculator(config);
    this.alertManager = new AlertManager(config.alertWebhook);
  }
  
  public async start() {
    logger.log('🔍 Starting TWIST Arbitrage Monitor...\n');
    logger.log('Configuration:');
    logger.log(`  Monitoring ${this.config.dexes.length} DEXes`);
    logger.log(`  Min Profit: ${this.config.minProfitPercent}% or $${this.config.minProfitUsd}`);
    logger.log(`  Check Interval: ${this.config.checkIntervalMs / 1000}s`);
    logger.log('');
    
    this.isRunning = true;
    
    // Start monitoring
    await this.initializeDexMonitoring();
    
    // Main loop
    while (this.isRunning) {
      try {
        await this.checkForArbitrage();
        await this.cleanupExpiredOpportunities();
      } catch (error) {
        console.error('Error in arbitrage monitor loop:', error);
      }
      
      await this.sleep(this.config.checkIntervalMs);
    }
  }
  
  private async initializeDexMonitoring() {
    logger.log('🔌 Connecting to DEXes...');
    
    for (const dex of this.config.dexes) {
      try {
        await this.dexMonitor.connectToDex(dex);
        logger.log(`  ✅ Connected to ${dex.name}`);
      } catch (error) {
        console.error(`  ❌ Failed to connect to ${dex.name}:`, error.message);
      }
    }
    
    logger.log('');
  }
  
  private async checkForArbitrage() {
    // Get prices from all DEXes
    const prices = await this.dexMonitor.getAllPrices();
    
    if (prices.length < 2) {
      return; // Need at least 2 DEXes for arbitrage
    }
    
    // Log current prices
    logger.log(`\n📊 Price Check at ${new Date().toISOString()}`);
    prices.forEach(p => {
      logger.log(`  ${p.dex}: $${p.price.toFixed(4)} (depth: $${(p.liquidityDepth / 1000).toFixed(1)}k)`);
    });
    
    // Find arbitrage opportunities
    const opportunities = this.calculator.findOpportunities(prices);
    
    // Filter and process opportunities
    for (const opp of opportunities) {
      if (this.isValidOpportunity(opp)) {
        await this.processOpportunity(opp);
      }
    }
    
    // Display summary
    const activeOpps = Array.from(this.opportunities.values())
      .filter(o => o.ttl > 0);
    
    if (activeOpps.length > 0) {
      logger.log(`\n💰 Active Opportunities: ${activeOpps.length}`);
      activeOpps.forEach(o => {
        logger.log(`  ${o.buyDex} → ${o.sellDex}: ${o.profitPercent.toFixed(2)}% ($${o.netProfit.toFixed(2)})`);
      });
    } else {
      logger.log('\n✋ No arbitrage opportunities found');
    }
  }
  
  private isValidOpportunity(opp: ArbitrageOpportunity): boolean {
    // Check profit thresholds
    if (opp.profitPercent < this.config.minProfitPercent) {
      return false;
    }
    
    if (opp.netProfit < this.config.minProfitUsd) {
      return false;
    }
    
    // Check if we've already seen this opportunity
    const existingOpp = this.opportunities.get(opp.id);
    if (existingOpp && existingOpp.timestamp > Date.now() - 5000) {
      return false; // Skip if seen in last 5 seconds
    }
    
    return true;
  }
  
  private async processOpportunity(opp: ArbitrageOpportunity) {
    // Add to tracking
    this.opportunities.set(opp.id, opp);
    
    // Alert if significant
    if (opp.netProfit >= this.config.alertThresholdUsd) {
      await this.alertManager.sendArbitrageAlert(opp);
    }
    
    // Simulate if configured
    if (this.config.simulateBeforeAlert) {
      const simulation = await this.simulateArbitrage(opp);
      if (!simulation.success) {
        logger.log(`  ⚠️  Simulation failed for ${opp.id}: ${simulation.reason}`);
        opp.confidence = 'low';
      }
    }
    
    // Log high-value opportunities
    if (opp.netProfit > 100) {
      logger.log(`\n🎯 HIGH VALUE ARBITRAGE FOUND!`);
      logger.log(`  Buy on ${opp.buyDex} at $${opp.buyPrice.toFixed(4)}`);
      logger.log(`  Sell on ${opp.sellDex} at $${opp.sellPrice.toFixed(4)}`);
      logger.log(`  Profit: ${opp.profitPercent.toFixed(2)}% = $${opp.netProfit.toFixed(2)}`);
      logger.log(`  Volume available: $${opp.volumeAvailable.toFixed(2)}`);
      logger.log(`  Confidence: ${opp.confidence}`);
    }
  }
  
  private async simulateArbitrage(opp: ArbitrageOpportunity): Promise<{
    success: boolean;
    reason?: string;
    estimatedProfit?: number;
  }> {
    try {
      // Simulate buy transaction
      const buySimulation = await this.dexMonitor.simulateSwap(
        opp.buyDex,
        'USDC',
        'TWIST',
        opp.volumeAvailable
      );
      
      if (!buySimulation.success) {
        return { success: false, reason: 'Buy simulation failed' };
      }
      
      // Simulate sell transaction
      const sellSimulation = await this.dexMonitor.simulateSwap(
        opp.sellDex,
        'TWIST',
        'USDC',
        buySimulation.outputAmount
      );
      
      if (!sellSimulation.success) {
        return { success: false, reason: 'Sell simulation failed' };
      }
      
      // Calculate actual profit
      const totalIn = opp.volumeAvailable;
      const totalOut = sellSimulation.outputAmount;
      const profit = totalOut - totalIn - buySimulation.gasCost - sellSimulation.gasCost;
      
      if (profit < this.config.minProfitUsd) {
        return { success: false, reason: 'Profit too low after gas' };
      }
      
      return {
        success: true,
        estimatedProfit: profit,
      };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }
  
  private async cleanupExpiredOpportunities() {
    const now = Date.now();
    
    for (const [id, opp] of this.opportunities.entries()) {
      if (now > opp.timestamp + opp.ttl) {
        this.opportunities.delete(id);
      }
    }
  }
  
  public getStats() {
    const activeOpportunities = Array.from(this.opportunities.values())
      .filter(o => o.ttl > 0);
    
    const totalPotentialProfit = activeOpportunities
      .reduce((sum, o) => sum + o.netProfit, 0);
    
    const avgProfitPercent = activeOpportunities.length > 0
      ? activeOpportunities.reduce((sum, o) => sum + o.profitPercent, 0) / activeOpportunities.length
      : 0;
    
    return {
      monitoringDexes: this.config.dexes.length,
      activeOpportunities: activeOpportunities.length,
      totalPotentialProfit,
      avgProfitPercent,
      executedCount: this.executedArbs.length,
      topOpportunity: activeOpportunities.sort((a, b) => b.netProfit - a.netProfit)[0],
    };
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  public stop() {
    logger.log('\n🛑 Stopping arbitrage monitor...');
    this.isRunning = false;
  }
}

// Main entry point
async function main() {
  const config: ArbitrageMonitorConfig = {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    checkIntervalMs: parseInt(process.env.ARB_CHECK_INTERVAL || '5000'), // 5 seconds
    minProfitPercent: parseFloat(process.env.ARB_MIN_PROFIT_PERCENT || '0.5'), // 0.5%
    minProfitUsd: parseFloat(process.env.ARB_MIN_PROFIT_USD || '10'), // $10
    maxPositionSize: parseFloat(process.env.ARB_MAX_POSITION || '10000'), // $10k
    
    dexes: [
      {
        name: 'Orca',
        programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
        poolAddress: process.env.ORCA_POOL,
        feePercent: 0.3,
      },
      {
        name: 'Raydium',
        programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
        poolAddress: process.env.RAYDIUM_POOL,
        feePercent: 0.25,
      },
      {
        name: 'Jupiter',
        programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
        feePercent: 0.3,
      },
    ],
    
    alertWebhook: process.env.ARB_ALERT_WEBHOOK,
    alertThresholdUsd: parseFloat(process.env.ARB_ALERT_THRESHOLD || '100'), // Alert on $100+ opportunities
    
    maxSlippagePercent: 1.0,
    requireMultipleDexes: true,
    simulateBeforeAlert: true,
  };
  
  const monitor = new ArbitrageMonitor(config);
  
  // Setup graceful shutdown
  process.on('SIGINT', () => {
    monitor.stop();
    
    // Display final stats
    const stats = monitor.getStats();
    logger.log('\n📊 Final Statistics:');
    logger.log(`  Opportunities found: ${stats.activeOpportunities}`);
    logger.log(`  Total potential profit: $${stats.totalPotentialProfit.toFixed(2)}`);
    logger.log(`  Average profit: ${stats.avgProfitPercent.toFixed(2)}%`);
    
    process.exit(0);
  });
  
  // Start monitoring
  await monitor.start();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}