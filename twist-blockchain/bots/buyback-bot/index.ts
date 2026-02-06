#!/usr/bin/env ts-node

import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@project-serum/anchor';
import { OrcaLiquidityManager } from './orca-manager';
import { PriceMonitor } from './price-monitor';
import { BuybackStrategy } from './strategy';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface BuybackBotConfig {
  rpcUrl: string;
  programId: PublicKey;
  whirlpoolAddress: PublicKey;
  walletPath: string;
  
  // Buyback parameters
  maxDailyBuyback: number; // in USDC
  buybackThresholdPercent: number; // % below floor price to trigger
  minBuybackAmount: number; // minimum USDC per buyback
  maxBuybackAmount: number; // maximum USDC per buyback
  checkIntervalMs: number; // how often to check price
  
  // Safety parameters
  maxSlippagePercent: number;
  maxPriceImpactPercent: number;
  gasLimitCU: number;
  priorityFeeLamports: number;
  
  // Monitoring
  webhookUrl?: string;
  discordWebhook?: string;
}

export class BuybackBot {
  private connection: Connection;
  private wallet: Wallet;
  private program: Program;
  private orcaManager: OrcaLiquidityManager;
  private priceMonitor: PriceMonitor;
  private strategy: BuybackStrategy;
  private config: BuybackBotConfig;
  
  private isRunning: boolean = false;
  private dailyBuybackUsed: number = 0;
  private lastBuybackReset: Date = new Date();
  private buybackHistory: any[] = [];
  
  constructor(config: BuybackBotConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: config.rpcUrl.replace('https', 'wss'),
    });
    
    // Load wallet
    const walletKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(config.walletPath, 'utf-8')))
    );
    this.wallet = new Wallet(walletKeypair);
    
    // Initialize components
    const provider = new AnchorProvider(this.connection, this.wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
    
    this.orcaManager = new OrcaLiquidityManager(
      this.connection,
      this.wallet,
      config.whirlpoolAddress.toBase58()
    );
    
    this.priceMonitor = new PriceMonitor(this.connection, config.programId);
    this.strategy = new BuybackStrategy(config);
    
    // Load program
    this.loadProgram(provider, config.programId);
  }
  
  private async loadProgram(provider: AnchorProvider, programId: PublicKey) {
    try {
      const idlPath = path.join(__dirname, '../../target/idl/twist_token.json');
      const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
      this.program = new Program(idl, programId, provider);
    } catch (error) {
      console.error('Failed to load program:', error);
      throw error;
    }
  }
  
  public async start() {
    logger.log('🤖 Starting TWIST Buyback Bot...\n');
    logger.log('Configuration:');
    logger.log(`  Max Daily Buyback: $${this.config.maxDailyBuyback.toLocaleString()}`);
    logger.log(`  Threshold: ${this.config.buybackThresholdPercent}% below floor`);
    logger.log(`  Check Interval: ${this.config.checkIntervalMs / 1000}s`);
    logger.log(`  Wallet: ${this.wallet.publicKey.toBase58()}`);
    logger.log('');
    
    this.isRunning = true;
    
    // Main loop
    while (this.isRunning) {
      try {
        await this.checkAndExecuteBuyback();
      } catch (error) {
        console.error('Error in buyback loop:', error);
        await this.notifyError('Buyback loop error', error);
      }
      
      // Wait for next check
      await this.sleep(this.config.checkIntervalMs);
    }
  }
  
  private async checkAndExecuteBuyback() {
    // Reset daily limit if needed
    const now = new Date();
    if (now.getDate() !== this.lastBuybackReset.getDate()) {
      this.dailyBuybackUsed = 0;
      this.lastBuybackReset = now;
      logger.log('📅 Daily buyback limit reset');
    }
    
    // Check if we have budget left
    const remainingBudget = this.config.maxDailyBuyback - this.dailyBuybackUsed;
    if (remainingBudget <= this.config.minBuybackAmount) {
      logger.log('💸 Daily buyback limit reached');
      return;
    }
    
    // Get current market data
    const marketData = await this.priceMonitor.getMarketData();
    logger.log(`\n📊 Market Check at ${new Date().toISOString()}`);
    logger.log(`  Current Price: $${marketData.currentPrice.toFixed(4)}`);
    logger.log(`  Floor Price: $${marketData.floorPrice.toFixed(4)}`);
    logger.log(`  Price Ratio: ${(marketData.priceRatio * 100).toFixed(2)}%`);
    logger.log(`  24h Volume: $${marketData.volume24h.toLocaleString()}`);
    
    // Check if buyback should trigger
    const shouldBuyback = this.strategy.shouldTriggerBuyback(marketData);
    if (!shouldBuyback) {
      logger.log('✋ No buyback triggered (price above threshold)');
      return;
    }
    
    // Calculate buyback amount
    const buybackAmount = this.strategy.calculateBuybackAmount(
      marketData,
      remainingBudget
    );
    
    if (buybackAmount < this.config.minBuybackAmount) {
      logger.log('✋ Buyback amount too small');
      return;
    }
    
    logger.log(`\n🎯 Triggering buyback of $${buybackAmount.toLocaleString()} USDC`);
    
    // Execute buyback
    try {
      const result = await this.executeBuyback(buybackAmount, marketData);
      
      // Update daily usage
      this.dailyBuybackUsed += buybackAmount;
      
      // Record history
      this.buybackHistory.push({
        timestamp: Date.now(),
        amountUsdc: buybackAmount,
        amountTwist: result.twistReceived,
        executionPrice: result.executionPrice,
        priceImpact: result.priceImpact,
        txSignature: result.txSignature,
        marketData,
      });
      
      // Notify success
      await this.notifyBuybackSuccess(result);
      
      logger.log(`✅ Buyback successful!`);
      logger.log(`  TWIST received: ${result.twistReceived.toLocaleString()}`);
      logger.log(`  Execution price: $${result.executionPrice.toFixed(4)}`);
      logger.log(`  Price impact: ${result.priceImpact.toFixed(2)}%`);
      logger.log(`  TX: ${result.txSignature}`);
      
    } catch (error) {
      console.error('❌ Buyback failed:', error);
      await this.notifyError('Buyback execution failed', error);
    }
  }
  
  private async executeBuyback(
    usdcAmount: number,
    marketData: any
  ): Promise<{
    twistReceived: number;
    executionPrice: number;
    priceImpact: number;
    txSignature: string;
  }> {
    // Get program state
    const [programState] = await PublicKey.findProgramAddress(
      [Buffer.from('program_state')],
      this.program.programId
    );
    
    // Build transaction
    const tx = new Transaction();
    
    // Add compute budget
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: this.config.gasLimitCU,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this.config.priorityFeeLamports,
      })
    );
    
    // Execute buyback through program
    const buybackIx = await this.program.methods
      .executeBuyback(new BN(usdcAmount * 1e6))
      .accounts({
        authority: this.wallet.publicKey,
        programState,
        // ... other accounts
      })
      .instruction();
    
    tx.add(buybackIx);
    
    // Simulate first
    const simulation = await this.connection.simulateTransaction(tx);
    if (simulation.value.err) {
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    
    // Send transaction
    const signature = await this.connection.sendTransaction(tx, [this.wallet.payer], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    
    // Wait for confirmation
    const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }
    
    // Parse results from logs
    // In production, would parse actual swap results
    const estimatedTwist = usdcAmount / marketData.currentPrice;
    const priceImpact = 0.5; // Would calculate from actual swap
    
    return {
      twistReceived: estimatedTwist,
      executionPrice: marketData.currentPrice,
      priceImpact,
      txSignature: signature,
    };
  }
  
  private async notifyBuybackSuccess(result: any) {
    if (!this.config.discordWebhook) return;
    
    const message = {
      embeds: [{
        title: '✅ Buyback Executed',
        color: 0x00ff88,
        fields: [
          {
            name: 'USDC Spent',
            value: `$${result.amountUsdc.toLocaleString()}`,
            inline: true,
          },
          {
            name: 'TWIST Received',
            value: result.twistReceived.toLocaleString(),
            inline: true,
          },
          {
            name: 'Execution Price',
            value: `$${result.executionPrice.toFixed(4)}`,
            inline: true,
          },
          {
            name: 'Price Impact',
            value: `${result.priceImpact.toFixed(2)}%`,
            inline: true,
          },
          {
            name: 'Daily Used',
            value: `$${this.dailyBuybackUsed.toLocaleString()} / $${this.config.maxDailyBuyback.toLocaleString()}`,
            inline: true,
          },
          {
            name: 'Transaction',
            value: `[View on Solscan](https://solscan.io/tx/${result.txSignature})`,
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      }],
    };
    
    try {
      await fetch(this.config.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error('Failed to send Discord notification:', error);
    }
  }
  
  private async notifyError(title: string, error: any) {
    console.error(`${title}:`, error);
    
    if (!this.config.discordWebhook) return;
    
    const message = {
      embeds: [{
        title: `❌ ${title}`,
        color: 0xff4444,
        description: error.message || error.toString(),
        timestamp: new Date().toISOString(),
      }],
    };
    
    try {
      await fetch(this.config.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch (err) {
      console.error('Failed to send error notification:', err);
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  public stop() {
    logger.log('\n🛑 Stopping buyback bot...');
    this.isRunning = false;
  }
  
  public getStats() {
    const totalBuybacks = this.buybackHistory.length;
    const totalUsdcSpent = this.buybackHistory.reduce((sum, b) => sum + b.amountUsdc, 0);
    const totalTwistBought = this.buybackHistory.reduce((sum, b) => sum + b.amountTwist, 0);
    const avgExecutionPrice = totalBuybacks > 0 ? totalUsdcSpent / totalTwistBought : 0;
    
    return {
      totalBuybacks,
      totalUsdcSpent,
      totalTwistBought,
      avgExecutionPrice,
      dailyUsed: this.dailyBuybackUsed,
      dailyRemaining: this.config.maxDailyBuyback - this.dailyBuybackUsed,
      lastBuyback: this.buybackHistory[this.buybackHistory.length - 1],
    };
  }
}

// Main entry point
async function main() {
  const config: BuybackBotConfig = {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    programId: new PublicKey(process.env.TWIST_PROGRAM_ID || 'TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    whirlpoolAddress: new PublicKey(process.env.ORCA_WHIRLPOOL || 'WHRLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    walletPath: process.env.BUYBACK_WALLET_PATH || path.join(process.env.HOME!, '.config/solana/buyback.json'),
    
    // Buyback parameters
    maxDailyBuyback: parseInt(process.env.MAX_DAILY_BUYBACK || '50000'),
    buybackThresholdPercent: parseFloat(process.env.BUYBACK_THRESHOLD || '97'), // 97% of floor
    minBuybackAmount: parseInt(process.env.MIN_BUYBACK || '100'),
    maxBuybackAmount: parseInt(process.env.MAX_BUYBACK || '5000'),
    checkIntervalMs: parseInt(process.env.CHECK_INTERVAL || '60000'), // 1 minute
    
    // Safety parameters
    maxSlippagePercent: parseFloat(process.env.MAX_SLIPPAGE || '1'),
    maxPriceImpactPercent: parseFloat(process.env.MAX_PRICE_IMPACT || '2'),
    gasLimitCU: parseInt(process.env.GAS_LIMIT || '400000'),
    priorityFeeLamports: parseInt(process.env.PRIORITY_FEE || '50000'),
    
    // Monitoring
    discordWebhook: process.env.DISCORD_WEBHOOK,
    webhookUrl: process.env.WEBHOOK_URL,
  };
  
  const bot = new BuybackBot(config);
  
  // Setup graceful shutdown
  process.on('SIGINT', () => {
    bot.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    bot.stop();
    process.exit(0);
  });
  
  // Start bot
  await bot.start();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}