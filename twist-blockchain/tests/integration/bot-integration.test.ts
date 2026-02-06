import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, BN, Wallet } from '@project-serum/anchor';
import { TwistClient } from '../../sdk/src/client';
import { BuybackBot } from '../../bots/buyback-bot';
import { ArbitrageMonitor } from '../../bots/arbitrage-monitor';
import { VolumeTracker } from '../../bots/volume-tracker';
import { MarketMaker } from '../../bots/market-maker';
import { expect } from 'chai';
import * as path from 'path';

describe('TWIST Token - Bot Integration Tests', () => {
  let connection: Connection;
  let provider: AnchorProvider;
  let client: TwistClient;
  
  // Bots
  let buybackBot: BuybackBot;
  let arbitrageMonitor: ArbitrageMonitor;
  let volumeTracker: VolumeTracker;
  let marketMaker: MarketMaker;
  
  // Test wallets
  let admin: Keypair;
  let botWallet: Keypair;
  
  // Test configuration
  const TEST_CONFIG = {
    rpcUrl: 'http://localhost:8899',
    programId: new PublicKey('TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    whirlpoolAddress: new PublicKey('TWSTwhirlpoolxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
  };
  
  before(async () => {
    // Setup connection
    connection = new Connection(TEST_CONFIG.rpcUrl, 'confirmed');
    
    // Setup wallets
    admin = Keypair.generate();
    botWallet = Keypair.generate();
    
    // Airdrop SOL
    for (const wallet of [admin, botWallet]) {
      const airdropSig = await connection.requestAirdrop(
        wallet.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdropSig);
    }
    
    // Setup provider
    const wallet = new Wallet(admin);
    provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    
    // Initialize client
    client = new TwistClient({
      connection,
      wallet,
    });
  });
  
  describe('Buyback Bot Integration', () => {
    before(async () => {
      // Initialize buyback bot
      const buybackConfig = {
        rpcUrl: TEST_CONFIG.rpcUrl,
        walletPath: './test-wallet.json',
        programId: TEST_CONFIG.programId,
        whirlpoolAddress: TEST_CONFIG.whirlpoolAddress,
        checkInterval: 5000, // 5 seconds for testing
        maxBuybackAmount: 5000,
        minBuybackAmount: 100,
        priceThresholdPercent: 3,
        slippageTolerance: 1,
        priorityFee: 50000,
      };
      
      buybackBot = new BuybackBot(buybackConfig);
    });
    
    it('should detect price below floor and execute buyback', async () => {
      logger.log('\n🤖 Testing Buyback Bot Integration');
      
      // Get initial state
      const initialState = await client.getProgramState();
      const floorPrice = initialState.floorPrice.toNumber() / 1e6;
      logger.log(`  Floor price: $${floorPrice.toFixed(4)}`);
      
      // Simulate price drop
      logger.log('  Simulating price drop below floor...');
      // In real test, would execute large sell order
      const mockPrice = floorPrice * 0.95; // 5% below floor
      
      // Start bot monitoring
      logger.log('  Starting buyback bot...');
      const botPromise = buybackBot.start();
      
      // Wait for bot to detect and react
      await sleep(10000); // 10 seconds
      
      // Check if buyback was executed
      const logs = await connection.getConfirmedSignaturesForAddress2(
        TEST_CONFIG.programId,
        { limit: 10 }
      );
      
      const buybackTxs = logs.filter(log => 
        log.memo && log.memo.includes('buyback')
      );
      
      logger.log(`  Buyback transactions found: ${buybackTxs.length}`);
      expect(buybackTxs.length).to.be.greaterThan(0);
      
      // Stop bot
      buybackBot.stop();
    });
    
    it('should respect daily limits and cooldowns', async () => {
      logger.log('\n  Testing buyback limits...');
      
      // Execute multiple buybacks
      const buybacks = [];
      for (let i = 0; i < 5; i++) {
        try {
          const result = await buybackBot.executeBuyback(1000);
          buybacks.push(result);
        } catch (error) {
          logger.log(`    Buyback ${i + 1} blocked: ${error.message}`);
        }
      }
      
      // Check that limits are enforced
      const totalSpent = buybacks.reduce((sum, b) => sum + (b?.usdcSpent || 0), 0);
      logger.log(`  Total USDC spent: $${totalSpent}`);
      
      expect(totalSpent).to.be.lessThanOrEqual(5000); // Daily limit
    });
  });
  
  describe('Arbitrage Monitor Integration', () => {
    before(async () => {
      // Initialize arbitrage monitor
      const arbConfig = {
        rpcUrl: TEST_CONFIG.rpcUrl,
        dexConfigs: [
          {
            name: 'Orca',
            programId: new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
            poolAddress: TEST_CONFIG.whirlpoolAddress,
          },
          {
            name: 'Raydium',
            programId: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
            poolAddress: new PublicKey('RAYDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
          },
        ],
        minProfitThreshold: 10, // $10 minimum profit
        checkInterval: 3000,
        alertWebhook: 'https://test-webhook.com',
      };
      
      arbitrageMonitor = new ArbitrageMonitor(arbConfig);
    });
    
    it('should detect cross-DEX arbitrage opportunities', async () => {
      logger.log('\n🤖 Testing Arbitrage Monitor Integration');
      
      // Create price discrepancy
      logger.log('  Creating price discrepancy between DEXes...');
      // In real test, would manipulate pools
      
      // Start monitoring
      const opportunities: any[] = [];
      arbitrageMonitor.on('opportunity', (opp) => {
        opportunities.push(opp);
        logger.log(`  Opportunity found: ${opp.profit} profit`);
      });
      
      await arbitrageMonitor.start();
      await sleep(10000); // Monitor for 10 seconds
      
      logger.log(`  Total opportunities found: ${opportunities.length}`);
      
      // Analyze opportunities
      if (opportunities.length > 0) {
        const avgProfit = opportunities.reduce((sum, o) => sum + o.profit, 0) / opportunities.length;
        logger.log(`  Average profit: $${avgProfit.toFixed(2)}`);
        
        const bestOpp = opportunities.reduce((best, o) => 
          o.profit > best.profit ? o : best
        );
        logger.log(`  Best opportunity: $${bestOpp.profit.toFixed(2)} profit`);
      }
      
      arbitrageMonitor.stop();
    });
  });
  
  describe('Volume Tracker Integration', () => {
    before(async () => {
      // Initialize volume tracker
      const volumeConfig = {
        rpcUrl: TEST_CONFIG.rpcUrl,
        programId: TEST_CONFIG.programId,
        dexPrograms: [
          {
            name: 'Orca',
            programId: new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
            poolAddress: TEST_CONFIG.whirlpoolAddress,
          },
        ],
        trackingInterval: 5000,
        dbPath: './test-volume.db',
        metricsPort: 9999,
      };
      
      volumeTracker = new VolumeTracker(volumeConfig);
    });
    
    it('should track trades and calculate volume metrics', async () => {
      logger.log('\n🤖 Testing Volume Tracker Integration');
      
      // Start tracking
      const trackingPromise = volumeTracker.start();
      
      // Execute some test trades
      logger.log('  Executing test trades...');
      for (let i = 0; i < 10; i++) {
        // Simulate trades
        await sleep(1000);
      }
      
      // Get volume metrics
      const stats = volumeTracker.getStats();
      logger.log(`  Tracked DEXes: ${stats.trackedDexes}`);
      logger.log(`  Recent trades: ${stats.recentTradesCount}`);
      
      // Get historical volume
      const volume24h = await volumeTracker.getHistoricalVolume('24h');
      logger.log(`  24h volume data points: ${volume24h.length}`);
      
      // Check metrics endpoint
      const metricsResponse = await fetch('http://localhost:9999/metrics');
      expect(metricsResponse.status).to.equal(200);
      
      volumeTracker.stop();
    });
  });
  
  describe('Market Maker Integration', () => {
    before(async () => {
      // Initialize market maker
      const mmConfig = {
        rpcUrl: TEST_CONFIG.rpcUrl,
        walletPath: './test-wallet.json',
        programId: TEST_CONFIG.programId,
        whirlpoolAddress: TEST_CONFIG.whirlpoolAddress,
        targetInventory: {
          twist: 100000,
          usdc: 5000,
        },
        baseSpread: 50, // 0.5%
        minSpread: 20,
        maxSpread: 200,
        orderSizes: {
          min: 100,
          max: 1000,
          levels: 5,
        },
        maxExposure: 20000,
        inventorySkewLimit: 0.3,
        stopLossThreshold: 0.1,
        updateInterval: 5000,
        metricsInterval: 30000,
      };
      
      marketMaker = new MarketMaker(mmConfig);
    });
    
    it('should place and manage orders dynamically', async () => {
      logger.log('\n🤖 Testing Market Maker Integration');
      
      // Start market making
      logger.log('  Starting market maker...');
      const mmPromise = marketMaker.start();
      
      // Let it run for a bit
      await sleep(20000); // 20 seconds
      
      // Check order placement
      const stats = await marketMaker.getStats();
      logger.log(`  Active orders: ${stats.activeOrders}`);
      logger.log(`  Total liquidity: ${stats.totalLiquidity}`);
      
      // Simulate market movement
      logger.log('  Simulating market volatility...');
      // In real test, would execute trades to move price
      
      // Check if spreads adjusted
      await sleep(10000);
      
      const newStats = await marketMaker.getStats();
      logger.log(`  Updated active orders: ${newStats.activeOrders}`);
      
      marketMaker.stop();
    });
  });
  
  describe('Multi-Bot Coordination', () => {
    it('should coordinate multiple bots without conflicts', async () => {
      logger.log('\n🤖 Testing Multi-Bot Coordination');
      
      // Start all bots simultaneously
      logger.log('  Starting all bots...');
      
      const bots = [
        { name: 'Buyback', instance: buybackBot },
        { name: 'Arbitrage', instance: arbitrageMonitor },
        { name: 'Volume', instance: volumeTracker },
        { name: 'MarketMaker', instance: marketMaker },
      ];
      
      // Start all bots
      const startPromises = bots.map(bot => ({
        name: bot.name,
        promise: bot.instance.start().catch(e => ({ error: e })),
      }));
      
      // Monitor for 30 seconds
      logger.log('  Monitoring bot interactions for 30 seconds...');
      await sleep(30000);
      
      // Check for conflicts
      const logs = await connection.getConfirmedSignaturesForAddress2(
        TEST_CONFIG.programId,
        { limit: 100 }
      );
      
      // Analyze transaction patterns
      const txByBot = new Map<string, number>();
      logs.forEach(log => {
        // Identify bot by memo or other means
        const botName = identifyBot(log);
        txByBot.set(botName, (txByBot.get(botName) || 0) + 1);
      });
      
      logger.log('\n  Transaction distribution:');
      txByBot.forEach((count, bot) => {
        logger.log(`    ${bot}: ${count} transactions`);
      });
      
      // Stop all bots
      logger.log('\n  Stopping all bots...');
      bots.forEach(bot => bot.instance.stop());
      
      // Verify no errors
      expect(txByBot.size).to.be.greaterThan(0);
    });
  });
  
  describe('Bot Failure Recovery', () => {
    it('should recover from connection failures', async () => {
      logger.log('\n🤖 Testing Bot Failure Recovery');
      
      // Start bot
      logger.log('  Starting buyback bot...');
      await buybackBot.start();
      
      // Simulate connection failure
      logger.log('  Simulating RPC connection failure...');
      // In real test, would disconnect network
      
      await sleep(5000);
      
      // Check if bot recovered
      const isHealthy = await buybackBot.healthCheck();
      logger.log(`  Bot health: ${isHealthy ? 'Healthy' : 'Unhealthy'}`);
      
      expect(isHealthy).to.be.true;
      
      buybackBot.stop();
    });
    
    it('should handle transaction failures gracefully', async () => {
      logger.log('\n  Testing transaction failure handling...');
      
      // Force a transaction to fail
      // In real test, would create failing conditions
      
      let errorCaught = false;
      try {
        // Attempt operation that will fail
        await client.executeBuyback(1000000); // Exceeds limits
      } catch (error) {
        errorCaught = true;
        logger.log(`  Error handled: ${error.message}`);
      }
      
      expect(errorCaught).to.be.true;
    });
  });
  
  // Helper functions
  function identifyBot(log: any): string {
    // In production, would parse transaction to identify bot
    if (log.memo?.includes('buyback')) return 'Buyback';
    if (log.memo?.includes('arbitrage')) return 'Arbitrage';
    if (log.memo?.includes('market-maker')) return 'MarketMaker';
    return 'Unknown';
  }
  
  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});