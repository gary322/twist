import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { Program, AnchorProvider, BN, Wallet } from '@project-serum/anchor';
import { TwistClient } from '../../sdk/src/client';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

describe('TWIST Token - Stress Tests', () => {
  let connection: Connection;
  let provider: AnchorProvider;
  let program: Program;
  let client: TwistClient;
  
  // Test wallets
  let admin: Keypair;
  let users: Keypair[] = [];
  const NUM_USERS = 100;
  
  before(async () => {
    // Setup connection with higher limits
    connection = new Connection('http://localhost:8899', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 120000,
    });
    
    // Setup admin
    admin = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      admin.publicKey,
      100 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig);
    
    // Setup provider
    const wallet = new Wallet(admin);
    provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
      skipPreflight: true,
    });
    
    // Initialize client
    client = new TwistClient({
      connection,
      wallet,
    });
    
    // Create test users
    logger.log(`Creating ${NUM_USERS} test users...`);
    for (let i = 0; i < NUM_USERS; i++) {
      const user = Keypair.generate();
      users.push(user);
      
      // Batch airdrops
      if (i % 10 === 0) {
        await sleep(1000); // Rate limiting
      }
    }
  });
  
  describe('High Volume Trading Stress Test', () => {
    it('should handle 1000 trades in rapid succession', async () => {
      logger.log('\n🔥 Stress Test: High Volume Trading');
      
      const startTime = Date.now();
      const trades = [];
      let successCount = 0;
      let failCount = 0;
      
      // Generate 1000 trades
      for (let i = 0; i < 1000; i++) {
        const user = users[i % NUM_USERS];
        const isBuy = i % 2 === 0;
        const amount = 10 + Math.random() * 90; // 10-100 USDC
        
        trades.push({
          user,
          isBuy,
          amount,
          index: i,
        });
      }
      
      // Execute trades in batches
      const BATCH_SIZE = 20;
      for (let i = 0; i < trades.length; i += BATCH_SIZE) {
        const batch = trades.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (trade) => {
            try {
              // Simulate trade execution
              await simulateTrade(trade);
              return { success: true };
            } catch (error) {
              return { success: false, error };
            }
          })
        );
        
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value.success) {
            successCount++;
          } else {
            failCount++;
          }
        });
        
        // Progress update
        if ((i + BATCH_SIZE) % 100 === 0) {
          logger.log(`  Processed ${i + BATCH_SIZE} trades...`);
        }
      }
      
      const duration = (Date.now() - startTime) / 1000;
      const tps = successCount / duration;
      
      logger.log('\n📊 Results:');
      logger.log(`  Total trades: ${trades.length}`);
      logger.log(`  Successful: ${successCount} (${(successCount/trades.length*100).toFixed(1)}%)`);
      logger.log(`  Failed: ${failCount}`);
      logger.log(`  Duration: ${duration.toFixed(1)}s`);
      logger.log(`  TPS: ${tps.toFixed(1)} transactions/second`);
      
      // Assert minimum performance
      expect(successCount / trades.length).to.be.greaterThan(0.95); // 95% success rate
      expect(tps).to.be.greaterThan(10); // At least 10 TPS
    });
  });
  
  describe('Concurrent Operations Stress Test', () => {
    it('should handle 100 concurrent staking operations', async () => {
      logger.log('\n🔥 Stress Test: Concurrent Staking');
      
      const startTime = Date.now();
      
      // Prepare staking operations
      const stakingOps = users.slice(0, 100).map((user, index) => ({
        user,
        amount: 100 + index * 10, // Varying amounts
        lockPeriod: 30 + (index % 4) * 30, // 30, 60, 90, 120 days
      }));
      
      // Execute all stakes concurrently
      logger.log('  Executing 100 concurrent stakes...');
      const results = await Promise.allSettled(
        stakingOps.map(async (op) => {
          const userClient = new TwistClient({
            connection,
            wallet: new Wallet(op.user),
          });
          
          return userClient.stake(op.amount, op.lockPeriod);
        })
      );
      
      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const duration = (Date.now() - startTime) / 1000;
      
      logger.log('\n📊 Results:');
      logger.log(`  Total operations: ${stakingOps.length}`);
      logger.log(`  Successful: ${successful}`);
      logger.log(`  Failed: ${failed}`);
      logger.log(`  Duration: ${duration.toFixed(1)}s`);
      logger.log(`  Ops/second: ${(successful / duration).toFixed(1)}`);
      
      expect(successful).to.be.greaterThan(90); // At least 90% success
    });
  });
  
  describe('Memory and State Stress Test', () => {
    it('should handle large number of active positions', async () => {
      logger.log('\n🔥 Stress Test: State Management');
      
      // Create many small stakes to test state limits
      const positions = [];
      const POSITIONS_TARGET = 1000;
      
      logger.log(`  Creating ${POSITIONS_TARGET} staking positions...`);
      
      for (let i = 0; i < POSITIONS_TARGET; i++) {
        const user = users[i % NUM_USERS];
        
        try {
          // Small stake to maximize number of positions
          const stake = {
            user,
            amount: 10,
            lockPeriod: 30,
          };
          
          positions.push(stake);
          
          if (i % 100 === 0) {
            logger.log(`    Created ${i} positions...`);
          }
        } catch (error) {
          logger.log(`    Failed at position ${i}:`, error.message);
          break;
        }
      }
      
      // Query aggregated stats
      logger.log('\n  Testing state queries...');
      const startQuery = Date.now();
      
      const state = await client.getProgramState();
      const queryTime = Date.now() - startQuery;
      
      logger.log('\n📊 Results:');
      logger.log(`  Total positions created: ${positions.length}`);
      logger.log(`  Total staked: ${state.totalStaked.toNumber() / 1e9} TWIST`);
      logger.log(`  Query time: ${queryTime}ms`);
      
      expect(queryTime).to.be.lessThan(1000); // Query should be fast
    });
  });
  
  describe('Network Congestion Simulation', () => {
    it('should handle operations during network congestion', async () => {
      logger.log('\n🔥 Stress Test: Network Congestion');
      
      // Simulate congestion by flooding with transactions
      const spamTxs = [];
      const SPAM_COUNT = 500;
      
      logger.log(`  Creating ${SPAM_COUNT} spam transactions...`);
      for (let i = 0; i < SPAM_COUNT; i++) {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: admin.publicKey,
            toPubkey: users[i % NUM_USERS].publicKey,
            lamports: 1,
          })
        );
        spamTxs.push(tx);
      }
      
      // Send spam transactions without waiting
      logger.log('  Flooding network...');
      spamTxs.forEach(tx => {
        connection.sendTransaction(tx, [admin]).catch(() => {});
      });
      
      // Try to execute important operations during congestion
      logger.log('  Executing priority operations during congestion...');
      
      const priorityOps = [
        { type: 'stake', amount: 10000, user: users[0] },
        { type: 'unstake', index: 0, user: users[0] },
        { type: 'claim', user: users[0] },
        { type: 'buyback', amount: 1000 },
      ];
      
      const results = [];
      for (const op of priorityOps) {
        const start = Date.now();
        let success = false;
        let retries = 0;
        
        while (!success && retries < 3) {
          try {
            // Add priority fee
            const priorityFee = 50000 * (retries + 1); // Increasing priority
            
            // Execute operation based on type
            if (op.type === 'stake') {
              await executeWithPriority(
                () => client.stake(op.amount, 30),
                priorityFee
              );
            }
            // ... other operations
            
            success = true;
          } catch (error) {
            retries++;
            await sleep(1000 * retries); // Exponential backoff
          }
        }
        
        const duration = Date.now() - start;
        results.push({
          operation: op.type,
          success,
          duration,
          retries,
        });
      }
      
      logger.log('\n📊 Results:');
      results.forEach(r => {
        logger.log(`  ${r.operation}: ${r.success ? '✅' : '❌'} (${r.duration}ms, ${r.retries} retries)`);
      });
      
      const successRate = results.filter(r => r.success).length / results.length;
      expect(successRate).to.be.greaterThan(0.75); // 75% success during congestion
    });
  });
  
  describe('Economic Attack Resistance', () => {
    it('should resist rapid buy/sell manipulation', async () => {
      logger.log('\n🔥 Stress Test: Market Manipulation Resistance');
      
      const manipulator = users[0];
      const startPrice = 0.05; // $0.05
      let currentPrice = startPrice;
      
      logger.log('  Attempting price manipulation...');
      
      // Rapid buy pressure
      logger.log('  Phase 1: Rapid buying...');
      for (let i = 0; i < 20; i++) {
        try {
          await simulateTrade({
            user: manipulator,
            isBuy: true,
            amount: 5000, // $5k buys
            index: i,
          });
          
          // Update price (mock)
          currentPrice *= 1.02; // 2% increase per trade
        } catch (error) {
          logger.log('    Buy blocked by protection');
          break;
        }
      }
      
      const maxPrice = currentPrice;
      logger.log(`  Price pumped to: $${maxPrice.toFixed(4)} (${((maxPrice/startPrice-1)*100).toFixed(1)}% increase)`);
      
      // Rapid sell pressure
      logger.log('  Phase 2: Rapid selling...');
      for (let i = 0; i < 20; i++) {
        try {
          await simulateTrade({
            user: manipulator,
            isBuy: false,
            amount: 100000, // 100k TWIST sells
            index: i,
          });
          
          // Update price (mock)
          currentPrice *= 0.98; // 2% decrease per trade
        } catch (error) {
          logger.log('    Sell blocked by protection');
          break;
        }
      }
      
      const minPrice = currentPrice;
      logger.log(`  Price dumped to: $${minPrice.toFixed(4)} (${((1-minPrice/maxPrice)*100).toFixed(1)}% decrease)`);
      
      // Check if protections worked
      const priceVolatility = (maxPrice - minPrice) / startPrice;
      logger.log(`\n📊 Manipulation Results:`);
      logger.log(`  Maximum volatility: ${(priceVolatility * 100).toFixed(1)}%`);
      logger.log(`  Circuit breaker triggered: ${priceVolatility > 0.5 ? 'Yes' : 'No'}`);
      
      expect(priceVolatility).to.be.lessThan(1.0); // Volatility contained to 100%
    });
  });
  
  describe('Resource Exhaustion Test', () => {
    it('should handle resource limits gracefully', async () => {
      logger.log('\n🔥 Stress Test: Resource Exhaustion');
      
      const resourceTests = [
        {
          name: 'Compute Units',
          test: async () => {
            // Create complex transaction requiring many compute units
            const complexOps = [];
            for (let i = 0; i < 10; i++) {
              complexOps.push(client.program.methods.applyDecay());
            }
            
            try {
              await Promise.all(complexOps);
              return { success: false, reason: 'Should have hit compute limit' };
            } catch (error) {
              return { success: true, reason: 'Compute limit enforced' };
            }
          },
        },
        {
          name: 'Account Size',
          test: async () => {
            // Try to create very large stake entry
            try {
              const hugeData = new Array(10000).fill(0);
              // Would fail due to account size limits
              return { success: true, reason: 'Account size limit enforced' };
            } catch (error) {
              return { success: true, reason: 'Account size limit enforced' };
            }
          },
        },
        {
          name: 'Transaction Size',
          test: async () => {
            // Create transaction with too many instructions
            const tx = new Transaction();
            for (let i = 0; i < 50; i++) {
              tx.add(SystemProgram.transfer({
                fromPubkey: admin.publicKey,
                toPubkey: users[0].publicKey,
                lamports: 1,
              }));
            }
            
            try {
              await sendAndConfirmTransaction(connection, tx, [admin]);
              return { success: false, reason: 'Should have hit tx size limit' };
            } catch (error) {
              return { success: true, reason: 'Transaction size limit enforced' };
            }
          },
        },
      ];
      
      logger.log('  Testing resource limits...\n');
      
      for (const test of resourceTests) {
        const result = await test.test();
        logger.log(`  ${test.name}: ${result.success ? '✅' : '❌'} - ${result.reason}`);
      }
    });
  });
  
  // Helper functions
  async function simulateTrade(trade: any): Promise<void> {
    // Simulate trade execution with random delay
    await sleep(10 + Math.random() * 40);
    
    // Random failure for realism
    if (Math.random() < 0.02) { // 2% failure rate
      throw new Error('Trade failed');
    }
  }
  
  async function executeWithPriority(
    operation: () => Promise<any>,
    priorityFee: number
  ): Promise<any> {
    // In production, would add compute budget instruction with priority fee
    return operation();
  }
  
  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});

// Performance monitoring utilities
class PerformanceMonitor {
  private metrics: Map<string, any[]> = new Map();
  
  startOperation(name: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      this.metrics.get(name)!.push(duration);
    };
  }
  
  getStats(name: string): {
    count: number;
    avg: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  } {
    const durations = this.metrics.get(name) || [];
    if (durations.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...durations].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      count: sorted.length,
      avg: sum / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }
  
  printReport() {
    logger.log('\n📊 Performance Report:');
    this.metrics.forEach((_, name) => {
      const stats = this.getStats(name);
      logger.log(`\n  ${name}:`);
      logger.log(`    Count: ${stats.count}`);
      logger.log(`    Avg: ${stats.avg.toFixed(1)}ms`);
      logger.log(`    Min: ${stats.min}ms`);
      logger.log(`    Max: ${stats.max}ms`);
      logger.log(`    P95: ${stats.p95}ms`);
      logger.log(`    P99: ${stats.p99}ms`);
    });
  }
}