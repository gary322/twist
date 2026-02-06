import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TwistClient, PriceAggregator } from '@twist/sdk';
import { Wallet } from '@coral-xyz/anchor';
import * as dotenv from 'dotenv';
import { buybackLogger as logger } from '../../utils/logger';

dotenv.config();

const BUYBACK_CHECK_INTERVAL = 60000; // 1 minute
const FLOOR_PRICE_THRESHOLD = 0.97; // 97% of floor price

interface BuybackConfig {
  rpcUrl: string;
  walletPath: string;
  pythFeed: string;
  switchboardFeed: string;
  maxDailyBuyback: number;
  minBuybackAmount: number;
}

class BuybackBot {
  private client: TwistClient;
  private priceAggregator: PriceAggregator;
  private isRunning: boolean = false;
  private config: BuybackConfig;

  constructor(config: BuybackConfig) {
    this.config = config;
    const connection = new Connection(config.rpcUrl, 'confirmed');
    const wallet = new Wallet(Keypair.generate()); // In production, load from config.walletPath
    
    this.client = new TwistClient({
      connection,
      wallet,
    });

    this.priceAggregator = new PriceAggregator(
      connection,
      new PublicKey(config.pythFeed),
      new PublicKey(config.switchboardFeed)
    );
  }

  async start(): Promise<void> {
    logger.info('🤖 Starting TWIST Buyback Bot...');
    this.isRunning = true;

    while (this.isRunning) {
      try {
        await this.checkAndExecuteBuyback();
      } catch (error) {
        logger.error('Error in buyback loop:', error);
      }

      await this.sleep(BUYBACK_CHECK_INTERVAL);
    }
  }

  private async checkAndExecuteBuyback(): Promise<void> {
    logger.debug('Checking buyback conditions...');

    // Get program state
    const programState = await this.client.getProgramState();
    
    // Check if buyback is enabled
    if (!programState.buybackEnabled || programState.emergencyPause) {
      logger.info('Buyback disabled or emergency pause active');
      return;
    }

    // Get current price
    const priceData = await this.priceAggregator.getAggregatedPrice();
    const currentPrice = priceData.price;
    const floorPrice = programState.floorPrice;

    logger.info('Price check', {
      currentPrice: currentPrice.toFixed(4),
      floorPrice: floorPrice.toFixed(4)
    });

    // Check if price is below threshold
    const threshold = floorPrice * FLOOR_PRICE_THRESHOLD;
    if (currentPrice >= threshold) {
      logger.debug(`Price above threshold ($${threshold.toFixed(4)}), no buyback needed`);
      return;
    }

    // Calculate buyback amount
    const priceDiscount = (floorPrice - currentPrice) / floorPrice;
    const buybackMultiplier = Math.min(priceDiscount * 100 + 1, 3); // Max 3x
    const baseBuyback = programState.floorLiquidity * 0.02; // 2% of floor liquidity
    const buybackAmount = Math.min(
      baseBuyback * buybackMultiplier,
      programState.maxDailyBuyback - programState.dailyBuybackUsed
    );

    if (buybackAmount < this.config.minBuybackAmount) {
      logger.debug(`Buyback amount too small: $${buybackAmount.toFixed(2)}`);
      return;
    }

    logger.info(`Executing buyback for $${buybackAmount.toFixed(2)} USDC...`);

    try {
      // Execute buyback
      const tx = await this.client.executeBuyback(buybackAmount);
      logger.info('✅ Buyback executed', {
        transaction: tx,
        priceDiscount: `${(priceDiscount * 100).toFixed(2)}%`,
        buybackMultiplier: `${buybackMultiplier.toFixed(1)}x`
      });
    } catch (error) {
      logger.error('Failed to execute buyback', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop(): void {
    logger.info('Stopping buyback bot...');
    this.isRunning = false;
  }
}

// Load configuration
const config: BuybackConfig = {
  rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
  walletPath: process.env.WALLET_PATH || './wallet.json',
  pythFeed: process.env.PYTH_FEED || 'HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J',
  switchboardFeed: process.env.SWITCHBOARD_FEED || 'GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR',
  maxDailyBuyback: Number(process.env.MAX_DAILY_BUYBACK) || 50000,
  minBuybackAmount: Number(process.env.MIN_BUYBACK_AMOUNT) || 100,
};

// Start the bot
const bot = new BuybackBot(config);

// Handle graceful shutdown
process.on('SIGINT', () => {
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  bot.stop();
  process.exit(0);
});

// Start the bot
bot.start().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});