import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { WhirlpoolContext, buildWhirlpoolClient, WhirlpoolClient } from "@orca-so/whirlpools-sdk";
import { Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import * as cron from "node-cron";
import { config } from "dotenv";
import { logger } from "./logger";
import { LiquidityRebalancer } from "./rebalancer";
import { PositionManager } from "./position-manager";
import { PriceRangeCalculator } from "./range-calculator";
import { MetricsCollector } from "./metrics";

config();

export class LiquidityManager {
  private connection: Connection;
  private whirlpoolClient: WhirlpoolClient;
  private rebalancer: LiquidityRebalancer;
  private positionManager: PositionManager;
  private rangeCalculator: PriceRangeCalculator;
  private metrics: MetricsCollector;
  private isRunning: boolean = false;

  constructor() {
    this.connection = new Connection(
      process.env.RPC_ENDPOINT || "https://api.mainnet-beta.solana.com",
      { commitment: "confirmed" }
    );

    // Initialize wallet from environment
    const keypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.LIQUIDITY_MANAGER_KEYPAIR!))
    );
    const wallet = new Wallet(keypair);

    // Initialize Whirlpool client
    const ctx = WhirlpoolContext.from(
      this.connection,
      wallet,
      new PublicKey(process.env.ORCA_WHIRLPOOL_PROGRAM_ID!)
    );
    this.whirlpoolClient = buildWhirlpoolClient(ctx);

    // Initialize components
    this.rebalancer = new LiquidityRebalancer(this.whirlpoolClient);
    this.positionManager = new PositionManager(this.whirlpoolClient);
    this.rangeCalculator = new PriceRangeCalculator();
    this.metrics = new MetricsCollector();
  }

  async start() {
    if (this.isRunning) {
      logger.warn("Liquidity manager is already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting liquidity manager...");

    // Initial check
    await this.checkAndRebalance();

    // Schedule regular checks every 5 minutes
    cron.schedule("*/5 * * * *", async () => {
      if (this.isRunning) {
        await this.checkAndRebalance();
      }
    });

    // Schedule metrics collection every minute
    cron.schedule("* * * * *", async () => {
      if (this.isRunning) {
        await this.collectMetrics();
      }
    });

    logger.info("Liquidity manager started successfully");
  }

  async stop() {
    logger.info("Stopping liquidity manager...");
    this.isRunning = false;
  }

  private async checkAndRebalance() {
    try {
      logger.info("Checking liquidity positions...");

      const whirlpoolAddress = new PublicKey(process.env.TWIST_WHIRLPOOL_ADDRESS!);
      const whirlpool = await this.whirlpoolClient.getPool(whirlpoolAddress);
      
      // Get all our positions
      const positions = await this.positionManager.getActivePositions(whirlpoolAddress);
      
      for (const position of positions) {
        const shouldRebalance = await this.shouldRebalance(position, whirlpool);
        
        if (shouldRebalance) {
          logger.info(`Rebalancing position ${position.publicKey.toString()}`);
          await this.rebalancer.rebalancePosition(position, whirlpool);
        }
      }

      // Check if we need to add more liquidity
      const totalLiquidity = await this.positionManager.getTotalLiquidity(whirlpoolAddress);
      const targetLiquidity = new BN(process.env.TARGET_LIQUIDITY || "1000000000000");
      
      if (totalLiquidity.lt(targetLiquidity)) {
        logger.info("Adding additional liquidity to meet target");
        await this.addLiquidity(whirlpool, targetLiquidity.sub(totalLiquidity));
      }

    } catch (error) {
      logger.error("Error during rebalance check:", error);
      this.metrics.recordError("rebalance_check", error);
    }
  }

  private async shouldRebalance(position: any, whirlpool: any): Promise<boolean> {
    const poolData = whirlpool.getData();
    const currentTick = poolData.tickCurrentIndex;
    const positionData = position.getData();
    
    // Check if price has moved significantly outside our range
    const tickLower = positionData.tickLowerIndex;
    const tickUpper = positionData.tickUpperIndex;
    
    // Calculate price deviation
    const rangeCenter = (tickLower + tickUpper) / 2;
    const deviation = Math.abs(currentTick - rangeCenter) / (tickUpper - tickLower);
    
    // Rebalance if price has moved more than 40% from center
    const shouldRebalance = deviation > 0.4;
    
    if (shouldRebalance) {
      logger.info(`Position needs rebalancing. Deviation: ${(deviation * 100).toFixed(2)}%`);
    }
    
    return shouldRebalance;
  }

  private async addLiquidity(whirlpool: any, amount: BN) {
    try {
      const poolData = whirlpool.getData();
      
      // Calculate optimal price range
      const { lowerPrice, upperPrice } = await this.rangeCalculator.calculateOptimalRange(
        poolData.sqrtPrice,
        poolData.tokenMintA.decimals,
        poolData.tokenMintB.decimals
      );
      
      // Add concentrated liquidity
      await this.positionManager.openPosition(
        whirlpool,
        lowerPrice,
        upperPrice,
        amount
      );
      
      logger.info(`Added ${amount.toString()} liquidity to pool`);
      this.metrics.recordLiquidityAdded(amount);
      
    } catch (error) {
      logger.error("Error adding liquidity:", error);
      this.metrics.recordError("add_liquidity", error);
    }
  }

  private async collectMetrics() {
    try {
      const whirlpoolAddress = new PublicKey(process.env.TWIST_WHIRLPOOL_ADDRESS!);
      const whirlpool = await this.whirlpoolClient.getPool(whirlpoolAddress);
      const poolData = whirlpool.getData();
      
      // Collect various metrics
      this.metrics.recordPoolMetrics({
        tvl: await this.positionManager.getTotalLiquidity(whirlpoolAddress),
        price: poolData.sqrtPrice,
        volume24h: await this.getVolume24h(whirlpoolAddress),
        fees24h: await this.getFees24h(whirlpoolAddress),
        tickSpacing: poolData.tickSpacing,
        liquidity: poolData.liquidity,
      });
      
    } catch (error) {
      logger.error("Error collecting metrics:", error);
    }
  }

  private async getVolume24h(poolAddress: PublicKey): Promise<BN> {
    try {
      // Query transaction history for the past 24 hours
      const currentTime = Math.floor(Date.now() / 1000);
      const startTime = currentTime - 86400; // 24 hours ago
      
      // Get transaction signatures for the pool
      const signatures = await this.connection.getSignaturesForAddress(
        poolAddress,
        { limit: 1000 },
        'confirmed'
      );
      
      let totalVolume = new BN(0);
      
      // Filter transactions within 24h window and calculate volume
      for (const sig of signatures) {
        if (sig.blockTime && sig.blockTime >= startTime) {
          const tx = await this.connection.getParsedTransaction(
            sig.signature,
            { commitment: 'confirmed' }
          );
          
          if (tx?.meta && !tx.meta.err) {
            // Look for swap instructions in the transaction
            const instructions = tx.transaction.message.instructions;
            
            for (const inst of instructions) {
              if ('parsed' in inst && inst.parsed?.type === 'swap') {
                // Extract swap amount from instruction data
                const swapAmount = new BN(inst.parsed.info?.amountIn || 0);
                totalVolume = totalVolume.add(swapAmount);
              }
            }
          }
        }
      }
      
      return totalVolume;
    } catch (error) {
      logger.error("Error calculating 24h volume:", error);
      return new BN(0);
    }
  }

  private async getFees24h(poolAddress: PublicKey): Promise<BN> {
    try {
      const whirlpool = await this.whirlpoolClient.getPool(poolAddress);
      const poolData = whirlpool.getData();
      
      // Get fee rate from pool (in hundredths of a basis point)
      const feeRate = poolData.feeRate;
      
      // Calculate fees based on volume
      const volume24h = await this.getVolume24h(poolAddress);
      
      // fees = volume * feeRate / 1000000 (converting from hundredths of bps)
      const fees = volume24h.mul(new BN(feeRate)).div(new BN(1000000));
      
      return fees;
    } catch (error) {
      logger.error("Error calculating 24h fees:", error);
      return new BN(0);
    }
  }
}

// Start the liquidity manager
if (require.main === module) {
  const manager = new LiquidityManager();
  
  manager.start().catch((error) => {
    logger.error("Failed to start liquidity manager:", error);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    logger.info("Received SIGINT, shutting down gracefully...");
    await manager.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("Received SIGTERM, shutting down gracefully...");
    await manager.stop();
    process.exit(0);
  });
}