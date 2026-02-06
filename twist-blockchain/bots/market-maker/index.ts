#!/usr/bin/env ts-node

import { Connection, PublicKey, Keypair, Transaction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import { Program, AnchorProvider, BN, Wallet } from '@project-serum/anchor';
import { WhirlpoolContext, buildWhirlpoolClient, PDAUtil, PoolUtil, PriceMath, TickUtil, ORCA_WHIRLPOOL_PROGRAM_ID } from '@orca-so/whirlpools-sdk';
import { DecimalUtil, Percentage } from '@orca-so/common-sdk';
import { SpreadCalculator } from './spread-calculator';
import { OrderManager } from './order-manager';
import { InventoryManager } from './inventory-manager';
import { RiskManager } from './risk-manager';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface MarketMakerConfig {
  rpcUrl: string;
  walletPath: string;
  programId: PublicKey;
  whirlpoolAddress: PublicKey;
  
  // Market making parameters
  targetInventory: {
    twist: number;  // Target TWIST inventory
    usdc: number;   // Target USDC inventory
  };
  
  // Spread configuration
  baseSpread: number;         // Base spread in bps (e.g., 50 = 0.5%)
  minSpread: number;          // Minimum spread in bps
  maxSpread: number;          // Maximum spread in bps
  
  // Order configuration
  orderSizes: {
    min: number;              // Minimum order size in USDC
    max: number;              // Maximum order size in USDC
    levels: number;           // Number of order levels
  };
  
  // Risk parameters
  maxExposure: number;        // Maximum position exposure in USDC
  inventorySkewLimit: number; // Maximum inventory imbalance ratio
  stopLossThreshold: number;  // Stop loss threshold in %
  
  // Update intervals
  updateInterval: number;     // Order update interval in ms
  metricsInterval: number;    // Metrics reporting interval in ms
}

interface MarketState {
  midPrice: number;
  bidPrice: number;
  askPrice: number;
  spread: number;
  volume24h: number;
  volatility: number;
  inventorySkew: number;
  totalExposure: number;
}

export class MarketMaker {
  private connection: Connection;
  private wallet: Wallet;
  private program?: Program;
  private whirlpoolClient: any;
  private whirlpool: any;
  
  private spreadCalculator: SpreadCalculator;
  private orderManager: OrderManager;
  private inventoryManager: InventoryManager;
  private riskManager: RiskManager;
  
  private config: MarketMakerConfig;
  private isRunning: boolean = false;
  private currentPositions: Map<string, any> = new Map();
  
  constructor(config: MarketMakerConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: config.rpcUrl.replace('https', 'wss'),
    });
    
    // Load wallet
    const walletKeypair = this.loadWallet(config.walletPath);
    this.wallet = new Wallet(walletKeypair);
    
    // Initialize components
    this.spreadCalculator = new SpreadCalculator(config);
    this.orderManager = new OrderManager(this.connection, this.wallet);
    this.inventoryManager = new InventoryManager(this.connection, this.wallet);
    this.riskManager = new RiskManager(config);
    
    this.initializeWhirlpool();
  }
  
  private loadWallet(walletPath: string): Keypair {
    try {
      const walletData = fs.readFileSync(walletPath, 'utf-8');
      const walletJson = JSON.parse(walletData);
      return Keypair.fromSecretKey(Uint8Array.from(walletJson));
    } catch (error) {
      console.error('Failed to load wallet:', error);
      throw new Error('Invalid wallet file');
    }
  }
  
  private async initializeWhirlpool() {
    try {
      const ctx = WhirlpoolContext.from(
        this.connection,
        this.wallet,
        ORCA_WHIRLPOOL_PROGRAM_ID
      );
      
      this.whirlpoolClient = buildWhirlpoolClient(ctx);
      this.whirlpool = await this.whirlpoolClient.getPool(this.config.whirlpoolAddress);
      
      logger.log('✅ Whirlpool initialized');
      logger.log(`   Pool: ${this.config.whirlpoolAddress.toBase58()}`);
    } catch (error) {
      console.error('Failed to initialize Whirlpool:', error);
      throw error;
    }
  }
  
  public async start() {
    logger.log('🤖 Starting TWIST Market Maker Bot...\n');
    logger.log('Configuration:');
    logger.log(`  Base spread: ${this.config.baseSpread / 100}%`);
    logger.log(`  Order levels: ${this.config.orderSizes.levels}`);
    logger.log(`  Max exposure: $${this.config.maxExposure.toLocaleString()}`);
    logger.log('');
    
    // Check initial balances
    const balances = await this.inventoryManager.getBalances();
    logger.log('Initial inventory:');
    logger.log(`  TWIST: ${balances.twist.toLocaleString()}`);
    logger.log(`  USDC: $${balances.usdc.toLocaleString()}`);
    logger.log('');
    
    this.isRunning = true;
    
    // Start market making loop
    this.runMarketMakingLoop();
    
    // Start metrics reporting
    this.startMetricsReporting();
  }
  
  private async runMarketMakingLoop() {
    while (this.isRunning) {
      try {
        // Get current market state
        const marketState = await this.getMarketState();
        
        // Check risk limits
        const riskCheck = await this.riskManager.checkRiskLimits(marketState);
        if (!riskCheck.passed) {
          logger.log(`⚠️  Risk limit breached: ${riskCheck.reason}`);
          await this.handleRiskBreach(riskCheck);
          continue;
        }
        
        // Calculate optimal spread
        const optimalSpread = await this.spreadCalculator.calculateOptimalSpread(marketState);
        
        // Update orders
        await this.updateOrders(marketState, optimalSpread);
        
        // Log current state
        this.logMarketState(marketState, optimalSpread);
        
      } catch (error) {
        console.error('Error in market making loop:', error);
      }
      
      // Wait before next update
      await this.sleep(this.config.updateInterval);
    }
  }
  
  private async getMarketState(): Promise<MarketState> {
    // Get pool data
    const poolData = this.whirlpool.getData();
    const currentPrice = PriceMath.sqrtPriceX64ToPrice(
      poolData.sqrtPrice,
      poolData.tokenMintA.decimals,
      poolData.tokenMintB.decimals
    );
    
    // Get current inventory
    const inventory = await this.inventoryManager.getInventory();
    const inventoryValue = inventory.twist * currentPrice.toNumber() + inventory.usdc;
    const targetValue = this.config.targetInventory.twist * currentPrice.toNumber() + 
                       this.config.targetInventory.usdc;
    
    // Calculate inventory skew
    const twistValue = inventory.twist * currentPrice.toNumber();
    const totalValue = twistValue + inventory.usdc;
    const inventorySkew = totalValue > 0 ? (twistValue / totalValue - 0.5) * 2 : 0;
    
    // Get market metrics
    const volume24h = await this.getVolume24h();
    const volatility = await this.calculateVolatility();
    
    // Calculate bid/ask prices based on current positions
    const spread = this.config.baseSpread / 10000; // Convert from bps
    const bidPrice = currentPrice.toNumber() * (1 - spread / 2);
    const askPrice = currentPrice.toNumber() * (1 + spread / 2);
    
    return {
      midPrice: currentPrice.toNumber(),
      bidPrice,
      askPrice,
      spread: spread * 10000, // Back to bps
      volume24h,
      volatility,
      inventorySkew,
      totalExposure: totalValue,
    };
  }
  
  private async updateOrders(marketState: MarketState, optimalSpread: number) {
    // Cancel existing orders if spread changed significantly
    const currentSpread = marketState.spread;
    if (Math.abs(currentSpread - optimalSpread) > 10) { // 0.1% threshold
      await this.cancelAllOrders();
    }
    
    // Calculate order levels
    const orderLevels = this.calculateOrderLevels(marketState, optimalSpread);
    
    // Place new orders
    for (const level of orderLevels) {
      try {
        if (level.side === 'buy') {
          await this.placeBuyOrder(level);
        } else {
          await this.placeSellOrder(level);
        }
      } catch (error) {
        console.error(`Failed to place ${level.side} order:`, error);
      }
    }
  }
  
  private calculateOrderLevels(marketState: MarketState, spread: number): any[] {
    const levels = [];
    const { min, max, levels: numLevels } = this.config.orderSizes;
    
    // Calculate order size increment
    const sizeIncrement = (max - min) / (numLevels - 1);
    
    // Adjust for inventory skew
    const skewAdjustment = marketState.inventorySkew * 0.2; // 20% max adjustment
    
    for (let i = 0; i < numLevels; i++) {
      const distance = (i + 1) * (spread / 10000) / numLevels;
      const size = min + i * sizeIncrement;
      
      // Buy orders (more aggressive if inventory is low on TWIST)
      const buyPrice = marketState.midPrice * (1 - distance);
      const buySize = size * (1 - skewAdjustment);
      
      if (buySize > 0) {
        levels.push({
          side: 'buy',
          price: buyPrice,
          size: buySize,
          level: i,
        });
      }
      
      // Sell orders (more aggressive if inventory is high on TWIST)
      const sellPrice = marketState.midPrice * (1 + distance);
      const sellSize = size * (1 + skewAdjustment);
      
      if (sellSize > 0) {
        levels.push({
          side: 'sell',
          price: sellPrice,
          size: sellSize,
          level: i,
        });
      }
    }
    
    return levels;
  }
  
  private async placeBuyOrder(level: any) {
    // Convert price to tick
    const tick = PriceMath.priceToInitializableTickIndex(
      DecimalUtil.fromNumber(level.price),
      9, // TWIST decimals
      6, // USDC decimals
      this.whirlpool.getData().tickSpacing
    );
    
    // Create position if it doesn't exist
    const positionKey = `buy_${level.level}`;
    let position = this.currentPositions.get(positionKey);
    
    if (!position) {
      const { positionMint, tx } = await this.whirlpool.openPosition(
        tick,
        tick + this.whirlpool.getData().tickSpacing, // Single tick range
        this.wallet.publicKey
      );
      
      await this.connection.sendTransaction(tx, [this.wallet.payer]);
      position = await this.whirlpool.getPosition(positionMint);
      this.currentPositions.set(positionKey, position);
    }
    
    // Add liquidity
    const usdcAmount = new BN(level.size * 1e6); // Convert to USDC atomic units
    
    const quote = await this.whirlpool.getIncreaseLiquidityQuote({
      inputTokenMint: this.whirlpool.getData().tokenMintB, // USDC
      inputTokenAmount: usdcAmount,
      tickLower: tick,
      tickUpper: tick + this.whirlpool.getData().tickSpacing,
      slippageTolerance: Percentage.fromFraction(1, 100),
    });
    
    const tx = await position.increaseLiquidity(quote);
    await this.connection.sendTransaction(tx, [this.wallet.payer]);
    
    logger.log(`✅ Placed buy order: $${level.size.toFixed(2)} at $${level.price.toFixed(4)}`);
  }
  
  private async placeSellOrder(level: any) {
    // Similar to placeBuyOrder but with TWIST as input
    const tick = PriceMath.priceToInitializableTickIndex(
      DecimalUtil.fromNumber(level.price),
      9, // TWIST decimals
      6, // USDC decimals
      this.whirlpool.getData().tickSpacing
    );
    
    const positionKey = `sell_${level.level}`;
    let position = this.currentPositions.get(positionKey);
    
    if (!position) {
      const { positionMint, tx } = await this.whirlpool.openPosition(
        tick - this.whirlpool.getData().tickSpacing,
        tick,
        this.wallet.publicKey
      );
      
      await this.connection.sendTransaction(tx, [this.wallet.payer]);
      position = await this.whirlpool.getPosition(positionMint);
      this.currentPositions.set(positionKey, position);
    }
    
    // Add liquidity with TWIST
    const twistAmount = new BN((level.size / level.price) * 1e9); // Convert to TWIST atomic units
    
    const quote = await this.whirlpool.getIncreaseLiquidityQuote({
      inputTokenMint: this.whirlpool.getData().tokenMintA, // TWIST
      inputTokenAmount: twistAmount,
      tickLower: tick - this.whirlpool.getData().tickSpacing,
      tickUpper: tick,
      slippageTolerance: Percentage.fromFraction(1, 100),
    });
    
    const tx = await position.increaseLiquidity(quote);
    await this.connection.sendTransaction(tx, [this.wallet.payer]);
    
    logger.log(`✅ Placed sell order: ${(level.size / level.price).toFixed(2)} TWIST at $${level.price.toFixed(4)}`);
  }
  
  private async cancelAllOrders() {
    logger.log('🔄 Cancelling all orders...');
    
    for (const [key, position] of this.currentPositions) {
      try {
        // Remove all liquidity
        const positionData = position.getData();
        if (positionData.liquidity.gt(new BN(0))) {
          const quote = await this.whirlpool.getDecreaseLiquidityQuote({
            liquidity: positionData.liquidity,
            slippageTolerance: Percentage.fromFraction(1, 100),
          });
          
          const tx = await position.decreaseLiquidity(quote);
          await this.connection.sendTransaction(tx, [this.wallet.payer]);
        }
        
        // Close position
        const closeTx = await position.close();
        await this.connection.sendTransaction(closeTx, [this.wallet.payer]);
        
        this.currentPositions.delete(key);
      } catch (error) {
        console.error(`Failed to cancel order ${key}:`, error);
      }
    }
  }
  
  private async handleRiskBreach(riskCheck: any) {
    logger.log('⛔ Handling risk breach...');
    
    switch (riskCheck.severity) {
      case 'critical':
        // Emergency stop
        await this.emergencyStop();
        break;
        
      case 'high':
        // Cancel all orders and pause
        await this.cancelAllOrders();
        await this.sleep(60000); // Pause for 1 minute
        break;
        
      case 'medium':
        // Reduce position sizes
        this.config.orderSizes.max *= 0.5;
        break;
        
      default:
        // Just log and continue
        break;
    }
  }
  
  private async emergencyStop() {
    logger.log('🚨 EMERGENCY STOP TRIGGERED');
    
    // Cancel all orders
    await this.cancelAllOrders();
    
    // Stop the bot
    this.isRunning = false;
    
    // Send alert
    await this.sendAlert({
      type: 'emergency_stop',
      severity: 'critical',
      message: 'Market maker emergency stop triggered',
      timestamp: Date.now(),
    });
  }
  
  private async getVolume24h(): Promise<number> {
    // In production, would query actual volume data
    // For now, return mock value
    return 500000; // $500k
  }
  
  private async calculateVolatility(): Promise<number> {
    // In production, would calculate from price history
    // For now, return mock value
    return 0.02; // 2% volatility
  }
  
  private logMarketState(state: MarketState, optimalSpread: number) {
    logger.log(`\n📊 Market State at ${new Date().toISOString()}`);
    logger.log(`  Mid price: $${state.midPrice.toFixed(4)}`);
    logger.log(`  Spread: ${state.spread.toFixed(0)} bps → ${optimalSpread.toFixed(0)} bps`);
    logger.log(`  Inventory skew: ${(state.inventorySkew * 100).toFixed(1)}%`);
    logger.log(`  Total exposure: $${state.totalExposure.toLocaleString()}`);
    logger.log(`  24h volume: $${state.volume24h.toLocaleString()}`);
    logger.log(`  Volatility: ${(state.volatility * 100).toFixed(1)}%`);
  }
  
  private async startMetricsReporting() {
    setInterval(async () => {
      try {
        const metrics = await this.gatherMetrics();
        await this.reportMetrics(metrics);
      } catch (error) {
        console.error('Error reporting metrics:', error);
      }
    }, this.config.metricsInterval);
  }
  
  private async gatherMetrics(): Promise<any> {
    const balances = await this.inventoryManager.getBalances();
    const positions = Array.from(this.currentPositions.values());
    
    return {
      timestamp: Date.now(),
      inventory: balances,
      activeOrders: this.currentPositions.size,
      totalLiquidity: positions.reduce((sum, p) => sum + p.getData().liquidity.toNumber(), 0),
      // Add more metrics as needed
    };
  }
  
  private async reportMetrics(metrics: any) {
    // Log summary
    logger.log(`\n📈 Performance Metrics`);
    logger.log(`  Active orders: ${metrics.activeOrders}`);
    logger.log(`  Total liquidity: ${metrics.totalLiquidity}`);
    
    // In production, would send to monitoring system
  }
  
  private async sendAlert(alert: any) {
    logger.log(`\n🚨 Alert: ${alert.message}`);
    
    // In production, would send to webhook/notification service
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  public stop() {
    logger.log('\n🛑 Stopping market maker...');
    this.isRunning = false;
  }
}

// Main entry point
async function main() {
  const config: MarketMakerConfig = {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    walletPath: process.env.MARKET_MAKER_WALLET || './wallet.json',
    programId: new PublicKey(process.env.TWIST_PROGRAM_ID || 'TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    whirlpoolAddress: new PublicKey(process.env.ORCA_POOL || 'TWSTwhirlpoolxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    
    targetInventory: {
      twist: parseFloat(process.env.TARGET_TWIST_INVENTORY || '100000'),
      usdc: parseFloat(process.env.TARGET_USDC_INVENTORY || '5000'),
    },
    
    baseSpread: parseInt(process.env.BASE_SPREAD_BPS || '50'),
    minSpread: parseInt(process.env.MIN_SPREAD_BPS || '20'),
    maxSpread: parseInt(process.env.MAX_SPREAD_BPS || '200'),
    
    orderSizes: {
      min: parseFloat(process.env.MIN_ORDER_SIZE || '100'),
      max: parseFloat(process.env.MAX_ORDER_SIZE || '1000'),
      levels: parseInt(process.env.ORDER_LEVELS || '5'),
    },
    
    maxExposure: parseFloat(process.env.MAX_EXPOSURE || '20000'),
    inventorySkewLimit: parseFloat(process.env.INVENTORY_SKEW_LIMIT || '0.3'),
    stopLossThreshold: parseFloat(process.env.STOP_LOSS_THRESHOLD || '0.1'),
    
    updateInterval: parseInt(process.env.UPDATE_INTERVAL || '5000'),
    metricsInterval: parseInt(process.env.METRICS_INTERVAL || '60000'),
  };
  
  const marketMaker = new MarketMaker(config);
  
  // Setup graceful shutdown
  process.on('SIGINT', () => {
    marketMaker.stop();
    process.exit(0);
  });
  
  // Start market making
  await marketMaker.start();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}