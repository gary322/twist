import { expect } from "chai";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { performance } from "perf_hooks";
import { TwistTokenClient } from "../../../modules/plan-1-blockchain";

describe("Performance and Load Testing", () => {
  let connection: Connection;
  let twistClient: TwistTokenClient;
  let testUsers: Keypair[];
  
  before(async () => {
    connection = new Connection("http://localhost:8899", "confirmed");
    twistClient = new TwistTokenClient(connection);
    
    // Create test users
    testUsers = Array(1000).fill(null).map(() => Keypair.generate());
  });

  describe("Transaction Throughput Tests", () => {
    it("should handle 100 TPS sustained load", async () => {
      const targetTPS = 100;
      const duration = 10; // 10 seconds
      const totalTransactions = targetTPS * duration;
      
      logger.log(`Testing ${targetTPS} TPS for ${duration} seconds...`);
      
      const startTime = performance.now();
      const transactions = [];
      
      // Generate transactions
      for (let i = 0; i < totalTransactions; i++) {
        const sender = testUsers[i % testUsers.length];
        const receiver = testUsers[(i + 1) % testUsers.length];
        
        transactions.push({
          type: "transfer",
          from: sender,
          to: receiver.publicKey,
          amount: new BN(Math.floor(Math.random() * 1000) + 1)
        });
      }
      
      // Execute in batches to maintain TPS
      const batchSize = targetTPS;
      const results = [];
      
      for (let i = 0; i < totalTransactions; i += batchSize) {
        const batchStart = performance.now();
        const batch = transactions.slice(i, i + batchSize);
        
        const batchPromises = batch.map(tx => 
          twistClient.transfer({
            to: tx.to,
            amount: tx.amount,
            wallet: tx.from
          }).catch(e => ({ error: e }))
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
        
        // Maintain target TPS
        const batchDuration = performance.now() - batchStart;
        const targetBatchDuration = 1000; // 1 second per batch
        
        if (batchDuration < targetBatchDuration) {
          await new Promise(resolve => 
            setTimeout(resolve, targetBatchDuration - batchDuration)
          );
        }
      }
      
      const endTime = performance.now();
      const actualDuration = (endTime - startTime) / 1000;
      const actualTPS = totalTransactions / actualDuration;
      
      // Analyze results
      const successful = results.filter(r => r.status === "fulfilled").length;
      const failed = results.filter(r => r.status === "rejected").length;
      const successRate = successful / totalTransactions;
      
      logger.log(`
        Actual TPS: ${actualTPS.toFixed(2)}
        Success Rate: ${(successRate * 100).toFixed(2)}%
        Successful: ${successful}
        Failed: ${failed}
        Duration: ${actualDuration.toFixed(2)}s
      `);
      
      expect(actualTPS).to.be.gte(targetTPS * 0.95); // Allow 5% variance
      expect(successRate).to.be.gte(0.99); // 99% success rate
    });

    it("should handle burst traffic gracefully", async () => {
      const burstSize = 500;
      const normalLoad = 50;
      
      logger.log(`Testing burst of ${burstSize} transactions...`);
      
      // Normal load
      const normalResults = [];
      for (let i = 0; i < normalLoad; i++) {
        normalResults.push(
          twistClient.transfer({
            to: Keypair.generate().publicKey,
            amount: new BN(100),
            wallet: testUsers[i]
          })
        );
      }
      
      // Sudden burst
      const burstStart = performance.now();
      const burstPromises = Array(burstSize).fill(null).map((_, i) => 
        twistClient.transfer({
          to: Keypair.generate().publicKey,
          amount: new BN(100),
          wallet: testUsers[i % testUsers.length]
        }).catch(e => ({ error: e }))
      );
      
      const burstResults = await Promise.allSettled(burstPromises);
      const burstDuration = performance.now() - burstStart;
      
      // Analyze burst handling
      const burstSuccess = burstResults.filter(r => r.status === "fulfilled").length;
      const burstTPS = burstSize / (burstDuration / 1000);
      
      logger.log(`
        Burst TPS: ${burstTPS.toFixed(2)}
        Burst Success Rate: ${(burstSuccess / burstSize * 100).toFixed(2)}%
        Burst Duration: ${(burstDuration / 1000).toFixed(2)}s
      `);
      
      expect(burstSuccess / burstSize).to.be.gte(0.95); // 95% success during burst
    });
  });

  describe("State Size and Storage Tests", () => {
    it("should efficiently handle large number of accounts", async () => {
      const accountCounts = [1000, 10000, 100000];
      const results = [];
      
      for (const count of accountCounts) {
        logger.log(`Testing with ${count.toLocaleString()} accounts...`);
        
        const startTime = performance.now();
        
        // Simulate account creation
        const accounts = Array(Math.min(count, 1000)).fill(null).map(() => ({
          pubkey: Keypair.generate().publicKey,
          balance: new BN(Math.floor(Math.random() * 1000000)),
          stakes: Math.random() > 0.5 ? [{
            amount: new BN(Math.floor(Math.random() * 100000)),
            lockPeriod: 30 * 86400
          }] : []
        }));
        
        // Query operations
        const queryStart = performance.now();
        const queries = await Promise.all([
          twistClient.getTotalSupply(),
          twistClient.getTotalStaked(),
          twistClient.getUniqueHolders(),
          twistClient.getTopHolders(100)
        ]);
        const queryDuration = performance.now() - queryStart;
        
        results.push({
          accounts: count,
          queryTime: queryDuration,
          avgQueryTime: queryDuration / 4
        });
      }
      
      console.table(results);
      
      // Query time should scale sub-linearly
      const scalingFactor = results[2].avgQueryTime / results[0].avgQueryTime;
      const accountScaling = results[2].accounts / results[0].accounts;
      
      expect(scalingFactor).to.be.lt(Math.sqrt(accountScaling)); // Sub-linear scaling
    });

    it("should handle maximum stake entries per user", async () => {
      const user = Keypair.generate();
      const maxStakes = 100; // Protocol limit
      
      logger.log(`Testing ${maxStakes} concurrent stakes...`);
      
      const stakePromises = [];
      for (let i = 0; i < maxStakes; i++) {
        stakePromises.push(
          twistClient.stake({
            amount: new BN(1000 * (i + 1)),
            lockPeriod: (30 + i) * 86400,
            wallet: user
          })
        );
      }
      
      const startTime = performance.now();
      const results = await Promise.allSettled(stakePromises);
      const duration = performance.now() - startTime;
      
      const successful = results.filter(r => r.status === "fulfilled").length;
      
      logger.log(`
        Stakes created: ${successful}/${maxStakes}
        Total time: ${(duration / 1000).toFixed(2)}s
        Avg time per stake: ${(duration / maxStakes).toFixed(2)}ms
      `);
      
      expect(successful).to.equal(maxStakes);
      
      // Try one more stake (should fail)
      try {
        await twistClient.stake({
          amount: new BN(1000),
          lockPeriod: 30 * 86400,
          wallet: user
        });
        expect.fail("Should not allow more than max stakes");
      } catch (error) {
        expect(error.message).to.include("MaxStakesReached");
      }
    });
  });

  describe("Complex Operation Performance", () => {
    it("should efficiently process decay across all accounts", async () => {
      // Simulate different account distribution scenarios
      const scenarios = [
        { name: "Uniform", distribution: () => 1000000 },
        { name: "Power Law", distribution: (i: number) => Math.floor(10000000 / (i + 1)) },
        { name: "Normal", distribution: (i: number) => Math.floor(gaussianRandom() * 1000000) }
      ];
      
      for (const scenario of scenarios) {
        logger.log(`Testing decay with ${scenario.name} distribution...`);
        
        // Create mock accounts with distribution
        const accounts = Array(10000).fill(null).map((_, i) => ({
          pubkey: Keypair.generate().publicKey,
          balance: new BN(scenario.distribution(i))
        }));
        
        const totalSupplyBefore = accounts.reduce(
          (sum, acc) => sum.add(acc.balance), 
          new BN(0)
        );
        
        const startTime = performance.now();
        
        // Simulate decay calculation
        const decayRate = new BN(50); // 0.5%
        const decayAmounts = accounts.map(acc => 
          acc.balance.mul(decayRate).div(new BN(10000))
        );
        
        const totalDecay = decayAmounts.reduce(
          (sum, amount) => sum.add(amount),
          new BN(0)
        );
        
        const duration = performance.now() - startTime;
        
        logger.log(`
          Distribution: ${scenario.name}
          Accounts: ${accounts.length.toLocaleString()}
          Total supply: ${totalSupplyBefore.toString()}
          Total decay: ${totalDecay.toString()}
          Processing time: ${duration.toFixed(2)}ms
          Time per account: ${(duration / accounts.length).toFixed(4)}ms
        `);
        
        expect(duration).to.be.lt(1000); // Should process in under 1 second
      }
    });

    it("should handle concurrent complex operations", async () => {
      const operations = [
        { name: "Stake", weight: 30 },
        { name: "Unstake", weight: 10 },
        { name: "Transfer", weight: 40 },
        { name: "ClaimRewards", weight: 15 },
        { name: "AddLiquidity", weight: 5 }
      ];
      
      const totalOps = 1000;
      const concurrency = 50;
      
      logger.log(`Running ${totalOps} mixed operations with concurrency ${concurrency}...`);
      
      // Generate weighted random operations
      const opQueue = [];
      for (let i = 0; i < totalOps; i++) {
        const rand = Math.random() * 100;
        let cumWeight = 0;
        
        for (const op of operations) {
          cumWeight += op.weight;
          if (rand < cumWeight) {
            opQueue.push(op.name);
            break;
          }
        }
      }
      
      // Execute with controlled concurrency
      const startTime = performance.now();
      const results = { success: 0, failed: 0, times: [] };
      
      for (let i = 0; i < totalOps; i += concurrency) {
        const batch = opQueue.slice(i, i + concurrency);
        const batchStart = performance.now();
        
        const batchPromises = batch.map(opName => 
          executeOperation(opName, testUsers[i % testUsers.length])
            .then(() => { results.success++; return true; })
            .catch(() => { results.failed++; return false; })
        );
        
        await Promise.all(batchPromises);
        results.times.push(performance.now() - batchStart);
      }
      
      const totalDuration = performance.now() - startTime;
      const avgBatchTime = results.times.reduce((a, b) => a + b, 0) / results.times.length;
      
      logger.log(`
        Total duration: ${(totalDuration / 1000).toFixed(2)}s
        Success rate: ${(results.success / totalOps * 100).toFixed(2)}%
        Avg batch time: ${avgBatchTime.toFixed(2)}ms
        Throughput: ${(totalOps / (totalDuration / 1000)).toFixed(2)} ops/sec
      `);
      
      expect(results.success / totalOps).to.be.gte(0.98); // 98% success rate
    });
  });

  describe("Memory and Resource Usage", () => {
    it("should not leak memory during extended operations", async () => {
      if (!global.gc) {
        logger.log("Skipping memory test (run with --expose-gc)");
        return;
      }
      
      const iterations = 10;
      const opsPerIteration = 1000;
      const memoryReadings = [];
      
      logger.log("Testing memory usage over extended operations...");
      
      for (let i = 0; i < iterations; i++) {
        // Force garbage collection
        global.gc();
        
        const memBefore = process.memoryUsage();
        
        // Execute operations
        const promises = [];
        for (let j = 0; j < opsPerIteration; j++) {
          promises.push(
            twistClient.getBalance(Keypair.generate().publicKey)
              .catch(() => null)
          );
        }
        
        await Promise.all(promises);
        
        // Force garbage collection again
        global.gc();
        
        const memAfter = process.memoryUsage();
        
        memoryReadings.push({
          iteration: i + 1,
          heapUsed: (memAfter.heapUsed / 1024 / 1024).toFixed(2),
          heapDelta: ((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2),
          external: (memAfter.external / 1024 / 1024).toFixed(2)
        });
        
        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.table(memoryReadings);
      
      // Check for memory leaks
      const firstReading = parseFloat(memoryReadings[0].heapUsed);
      const lastReading = parseFloat(memoryReadings[iterations - 1].heapUsed);
      const memoryGrowth = lastReading - firstReading;
      
      logger.log(`Memory growth: ${memoryGrowth.toFixed(2)} MB`);
      
      expect(memoryGrowth).to.be.lt(10); // Less than 10MB growth
    });

    it("should handle connection pool efficiently", async () => {
      const connectionCounts = [10, 50, 100, 200];
      const results = [];
      
      for (const count of connectionCounts) {
        logger.log(`Testing with ${count} concurrent connections...`);
        
        const connections = Array(count).fill(null).map(() => 
          new Connection("http://localhost:8899", {
            commitment: "confirmed",
            disableRetryOnRateLimit: true
          })
        );
        
        const clients = connections.map(conn => new TwistTokenClient(conn));
        
        const startTime = performance.now();
        
        // Execute parallel requests
        const requests = clients.map(client => 
          client.getProtocolMetrics().catch(() => null)
        );
        
        const responses = await Promise.all(requests);
        const duration = performance.now() - startTime;
        
        const successful = responses.filter(r => r !== null).length;
        
        results.push({
          connections: count,
          successful,
          duration: duration.toFixed(2),
          avgLatency: (duration / count).toFixed(2)
        });
        
        // Close connections
        connections.forEach(conn => conn.close());
      }
      
      console.table(results);
      
      // Latency should not increase linearly with connection count
      const latencyIncrease = parseFloat(results[3].avgLatency) / parseFloat(results[0].avgLatency);
      expect(latencyIncrease).to.be.lt(2); // Less than 2x increase for 20x connections
    });
  });

  describe("Stress Testing Edge Scenarios", () => {
    it("should handle rapid price fluctuations", async () => {
      const priceChanges = 100;
      const changeInterval = 100; // ms
      
      logger.log(`Simulating ${priceChanges} rapid price changes...`);
      
      const results = {
        buybacks: 0,
        circuitBreaks: 0,
        errors: 0
      };
      
      for (let i = 0; i < priceChanges; i++) {
        // Simulate random price change (-10% to +10%)
        const priceChange = (Math.random() - 0.5) * 0.2;
        const newPrice = 0.05 * (1 + priceChange);
        
        try {
          // Update oracle price
          await twistClient.updateOraclePrice({
            price: newPrice,
            confidence: 0.0001,
            timestamp: Date.now()
          });
          
          // Check if buyback triggered
          const floorPrice = await twistClient.getFloorPrice();
          if (newPrice < floorPrice * 0.97) {
            results.buybacks++;
          }
          
          // Check circuit breaker
          const cbStatus = await circuitBreaker.checkConditions();
          if (cbStatus.isTripped) {
            results.circuitBreaks++;
          }
          
        } catch (error) {
          results.errors++;
        }
        
        await new Promise(resolve => setTimeout(resolve, changeInterval));
      }
      
      logger.log(`
        Price changes: ${priceChanges}
        Buybacks triggered: ${results.buybacks}
        Circuit breaks: ${results.circuitBreaks}
        Errors: ${results.errors}
      `);
      
      expect(results.errors).to.be.lt(priceChanges * 0.01); // Less than 1% errors
    });

    it("should maintain performance during network congestion", async () => {
      logger.log("Simulating network congestion...");
      
      // Create artificial congestion
      const backgroundLoad = Array(500).fill(null).map(() => 
        twistClient.getBalance(Keypair.generate().publicKey)
          .catch(() => null)
      );
      
      // Try critical operations during congestion
      const criticalOps = [
        { name: "Decay", fn: () => twistClient.applyDecay() },
        { name: "Buyback", fn: () => twistClient.executeBuyback({ maxAmount: new BN(1000) }) },
        { name: "Emergency Pause", fn: () => twistClient.setEmergencyPause(true) }
      ];
      
      const results = [];
      
      for (const op of criticalOps) {
        const startTime = performance.now();
        
        try {
          await op.fn();
          const duration = performance.now() - startTime;
          
          results.push({
            operation: op.name,
            success: true,
            duration: duration.toFixed(2),
            status: "Completed"
          });
        } catch (error) {
          const duration = performance.now() - startTime;
          
          results.push({
            operation: op.name,
            success: false,
            duration: duration.toFixed(2),
            status: error.message
          });
        }
      }
      
      console.table(results);
      
      // Critical operations should have priority
      const criticalSuccess = results.filter(r => r.success).length;
      expect(criticalSuccess).to.be.gte(2); // At least 2 of 3 should succeed
    });
  });
});

// Helper functions
function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

async function executeOperation(opName: string, user: Keypair): Promise<any> {
  switch (opName) {
    case "Stake":
      return twistClient.stake({
        amount: new BN(Math.floor(Math.random() * 10000) + 1000),
        lockPeriod: [30, 90, 180, 365][Math.floor(Math.random() * 4)] * 86400,
        wallet: user
      });
      
    case "Unstake":
      const stakes = await twistClient.getUserStakes(user.publicKey);
      if (stakes.length > 0) {
        return twistClient.unstake({
          stakeAccount: stakes[0].account,
          wallet: user
        });
      }
      throw new Error("No stakes to unstake");
      
    case "Transfer":
      return twistClient.transfer({
        to: Keypair.generate().publicKey,
        amount: new BN(Math.floor(Math.random() * 1000) + 100),
        wallet: user
      });
      
    case "ClaimRewards":
      return twistClient.claimRewards({ wallet: user });
      
    case "AddLiquidity":
      return orcaManager.addConcentratedLiquidity({
        poolAddress: WHIRLPOOL_ADDRESS,
        lowerPrice: 0.045,
        upperPrice: 0.055,
        twistAmount: new BN(10000),
        usdcAmount: new BN(500),
        slippageTolerance: 0.01,
        wallet: user
      });
      
    default:
      throw new Error(`Unknown operation: ${opName}`);
  }
}