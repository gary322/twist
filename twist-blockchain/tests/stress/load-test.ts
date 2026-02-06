import { Connection, Keypair } from "@solana/web3.js";
import { TwistTokenClient } from "../../sdk/src/client";
import BN from "bn.js";
import { performance } from "perf_hooks";

interface LoadTestMetrics {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  throughput: number; // TPS
}

export class LoadTester {
  private metrics: LoadTestMetrics = {
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    averageLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
    throughput: 0,
  };

  constructor(
    private connection: Connection,
    private client: TwistTokenClient,
    private users: Keypair[]
  ) {}

  async runLoadTest(durationSeconds: number, targetTPS: number) {
    logger.log(`Starting load test: ${durationSeconds}s at ${targetTPS} TPS`);
    
    const startTime = performance.now();
    const endTime = startTime + durationSeconds * 1000;
    const delayBetweenTx = 1000 / targetTPS;

    const promises: Promise<void>[] = [];

    while (performance.now() < endTime) {
      const txPromise = this.executeRandomTransaction();
      promises.push(txPromise);
      
      await this.sleep(delayBetweenTx);
    }

    // Wait for all transactions to complete
    await Promise.allSettled(promises);

    const totalTime = (performance.now() - startTime) / 1000;
    this.metrics.throughput = this.metrics.successfulTransactions / totalTime;

    return this.metrics;
  }

  private async executeRandomTransaction(): Promise<void> {
    const txType = Math.floor(Math.random() * 5);
    const user = this.users[Math.floor(Math.random() * this.users.length)];
    const startTime = performance.now();

    try {
      switch (txType) {
        case 0: // Transfer
          await this.executeTransfer(user);
          break;
        case 1: // Stake
          await this.executeStake(user);
          break;
        case 2: // Swap
          await this.executeSwap(user);
          break;
        case 3: // Add Liquidity
          await this.executeAddLiquidity(user);
          break;
        case 4: // Claim Rewards
          await this.executeClaimRewards(user);
          break;
      }

      const latency = performance.now() - startTime;
      this.recordSuccess(latency);
    } catch (error) {
      this.recordFailure();
      console.error("Transaction failed:", error);
    }
  }

  private async executeTransfer(user: Keypair): Promise<void> {
    const recipient = this.users[Math.floor(Math.random() * this.users.length)];
    const amount = new BN(Math.floor(Math.random() * 1000) * 1e9);
    
    await this.client.transfer(
      user.publicKey,
      recipient.publicKey,
      amount
    );
  }

  private async executeStake(user: Keypair): Promise<void> {
    const amount = new BN(Math.floor(Math.random() * 10000 + 1000) * 1e9);
    const lockPeriod = [30, 90, 180, 365][Math.floor(Math.random() * 4)] * 86400;
    
    await this.client.stake(user.publicKey, amount, lockPeriod);
  }

  private async executeSwap(user: Keypair): Promise<void> {
    const amount = new BN(Math.floor(Math.random() * 100 + 10) * 1e9);
    const inputToken = Math.random() > 0.5 ? "TWIST" : "USDC";
    
    await this.client.swap({
      user: user.publicKey,
      inputToken,
      inputAmount: amount,
      minOutputAmount: new BN(0), // Accept any output for stress test
    });
  }

  private async executeAddLiquidity(user: Keypair): Promise<void> {
    const twistAmount = new BN(Math.floor(Math.random() * 5000 + 1000) * 1e9);
    const usdcAmount = new BN(Math.floor(Math.random() * 250 + 50) * 1e6);
    
    await this.client.addLiquidity({
      user: user.publicKey,
      twistAmount,
      usdcAmount,
      slippageTolerance: 5, // 5% for stress test
    });
  }

  private async executeClaimRewards(user: Keypair): Promise<void> {
    await this.client.claimRewards(user.publicKey);
  }

  private recordSuccess(latency: number) {
    this.metrics.totalTransactions++;
    this.metrics.successfulTransactions++;
    
    // Update latency metrics
    const totalLatency = this.metrics.averageLatency * (this.metrics.totalTransactions - 1);
    this.metrics.averageLatency = (totalLatency + latency) / this.metrics.totalTransactions;
    this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency);
    this.metrics.minLatency = Math.min(this.metrics.minLatency, latency);
  }

  private recordFailure() {
    this.metrics.totalTransactions++;
    this.metrics.failedTransactions++;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run load test if called directly
if (require.main === module) {
  async function main() {
    const connection = new Connection(
      process.env.RPC_ENDPOINT || "http://localhost:8899",
      "confirmed"
    );

    // Generate test users
    const users = Array.from({ length: 100 }, () => Keypair.generate());
    
    // Initialize client
    const payer = Keypair.generate();
    const client = new TwistTokenClient(connection, payer);

    // Run tests with increasing load
    const tester = new LoadTester(connection, client, users);
    
    logger.log("Running load tests...\n");
    
    // Test 1: Light load
    logger.log("Test 1: Light load (10 TPS for 60s)");
    const metrics1 = await tester.runLoadTest(60, 10);
    logger.log(metrics1);
    
    // Test 2: Medium load
    logger.log("\nTest 2: Medium load (50 TPS for 60s)");
    const metrics2 = await tester.runLoadTest(60, 50);
    logger.log(metrics2);
    
    // Test 3: Heavy load
    logger.log("\nTest 3: Heavy load (100 TPS for 60s)");
    const metrics3 = await tester.runLoadTest(60, 100);
    logger.log(metrics3);
    
    // Test 4: Stress test
    logger.log("\nTest 4: Stress test (200 TPS for 30s)");
    const metrics4 = await tester.runLoadTest(30, 200);
    logger.log(metrics4);
  }

  main().catch(console.error);
}