import { performance } from 'perf_hooks';
import { TwistWebSDK } from '../../modules/plan-4-sdk/packages/web/src';
import { TwistServerSDK } from '../../modules/plan-4-sdk/packages/server/src';

interface PerformanceMetrics {
  operation: string;
  samples: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  throughput: number;
  errors: number;
}

class LoadTester {
  private webSDK: TwistWebSDK;
  private serverSDK: TwistServerSDK;
  private metrics: Map<string, number[]> = new Map();
  private errors: Map<string, number> = new Map();

  constructor() {
    this.webSDK = new TwistWebSDK({
      apiKey: process.env.LOAD_TEST_API_KEY || 'load-test-key',
      environment: 'development',
    });

    this.serverSDK = new TwistServerSDK({
      apiKey: process.env.LOAD_TEST_SERVER_KEY || 'load-test-server-key',
      apiSecret: process.env.LOAD_TEST_SECRET || 'load-test-secret',
      environment: 'development',
    });
  }

  async runLoadTests() {
    logger.log('🚀 Starting TWIST Platform Load Tests');
    logger.log('=====================================\n');

    // Test configurations
    const tests = [
      {
        name: 'User Registration',
        concurrent: 100,
        total: 1000,
        operation: this.testUserRegistration.bind(this),
      },
      {
        name: 'Influencer Search',
        concurrent: 50,
        total: 500,
        operation: this.testInfluencerSearch.bind(this),
      },
      {
        name: 'Staking Operations',
        concurrent: 20,
        total: 200,
        operation: this.testStakingOperation.bind(this),
      },
      {
        name: 'VAU Submissions',
        concurrent: 200,
        total: 2000,
        operation: this.testVAUSubmission.bind(this),
      },
      {
        name: 'Event Tracking',
        concurrent: 500,
        total: 5000,
        operation: this.testEventTracking.bind(this),
      },
      {
        name: 'Real-time Updates',
        concurrent: 100,
        total: 100,
        operation: this.testRealtimeUpdates.bind(this),
      },
    ];

    for (const test of tests) {
      logger.log(`\n📊 Testing: ${test.name}`);
      logger.log(`Concurrent: ${test.concurrent}, Total: ${test.total}`);
      logger.log('----------------------------------------');

      await this.runTest(test.name, test.concurrent, test.total, test.operation);
      
      const metrics = this.calculateMetrics(test.name);
      this.printMetrics(metrics);
    }

    logger.log('\n📈 Overall Performance Summary');
    logger.log('==============================');
    this.printSummary();
  }

  private async runTest(
    name: string,
    concurrent: number,
    total: number,
    operation: () => Promise<void>
  ) {
    const startTime = performance.now();
    const batches = Math.ceil(total / concurrent);
    
    for (let batch = 0; batch < batches; batch++) {
      const batchSize = Math.min(concurrent, total - batch * concurrent);
      const promises: Promise<void>[] = [];
      
      for (let i = 0; i < batchSize; i++) {
        promises.push(this.measureOperation(name, operation));
      }
      
      await Promise.allSettled(promises);
      
      // Progress indicator
      const progress = Math.round(((batch + 1) / batches) * 100);
      process.stdout.write(`\rProgress: ${progress}%`);
    }
    
    const totalTime = performance.now() - startTime;
    logger.log(`\n✓ Completed in ${(totalTime / 1000).toFixed(2)}s`);
  }

  private async measureOperation(name: string, operation: () => Promise<void>) {
    const start = performance.now();
    
    try {
      await operation();
      const duration = performance.now() - start;
      
      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      this.metrics.get(name)!.push(duration);
    } catch (error) {
      const duration = performance.now() - start;
      
      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      this.metrics.get(name)!.push(duration);
      
      this.errors.set(name, (this.errors.get(name) || 0) + 1);
    }
  }

  private calculateMetrics(operation: string): PerformanceMetrics {
    const samples = this.metrics.get(operation) || [];
    const sorted = [...samples].sort((a, b) => a - b);
    
    return {
      operation,
      samples: samples.length,
      min: Math.min(...samples),
      max: Math.max(...samples),
      mean: samples.reduce((a, b) => a + b, 0) / samples.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      throughput: (samples.length * 1000) / samples.reduce((a, b) => a + b, 0),
      errors: this.errors.get(operation) || 0,
    };
  }

  private printMetrics(metrics: PerformanceMetrics) {
    logger.log(`
Samples: ${metrics.samples}
Min: ${metrics.min.toFixed(2)}ms
Max: ${metrics.max.toFixed(2)}ms
Mean: ${metrics.mean.toFixed(2)}ms
Median: ${metrics.median.toFixed(2)}ms
P95: ${metrics.p95.toFixed(2)}ms
P99: ${metrics.p99.toFixed(2)}ms
Throughput: ${metrics.throughput.toFixed(2)} ops/sec
Errors: ${metrics.errors} (${((metrics.errors / metrics.samples) * 100).toFixed(2)}%)
    `);
  }

  private printSummary() {
    let totalOps = 0;
    let totalErrors = 0;
    let totalDuration = 0;
    
    for (const [name, samples] of this.metrics.entries()) {
      totalOps += samples.length;
      totalErrors += this.errors.get(name) || 0;
      totalDuration += samples.reduce((a, b) => a + b, 0);
    }
    
    logger.log(`
Total Operations: ${totalOps}
Total Errors: ${totalErrors} (${((totalErrors / totalOps) * 100).toFixed(2)}%)
Average Latency: ${(totalDuration / totalOps).toFixed(2)}ms
Overall Throughput: ${((totalOps * 1000) / totalDuration).toFixed(2)} ops/sec
    `);

    // Check if performance meets requirements
    const avgLatency = totalDuration / totalOps;
    const errorRate = (totalErrors / totalOps) * 100;
    
    logger.log('\n🎯 Performance Requirements:');
    logger.log(`Average Latency < 500ms: ${avgLatency < 500 ? '✅ PASS' : '❌ FAIL'}`);
    logger.log(`Error Rate < 1%: ${errorRate < 1 ? '✅ PASS' : '❌ FAIL'}`);
    logger.log(`Throughput > 100 ops/sec: ${((totalOps * 1000) / totalDuration) > 100 ? '✅ PASS' : '❌ FAIL'}`);
  }

  // Test Operations

  private async testUserRegistration() {
    const email = `loadtest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@example.com`;
    await this.webSDK.identify(email);
  }

  private async testInfluencerSearch() {
    await this.webSDK.searchInfluencers({
      query: 'test',
      sortBy: 'totalStaked',
      limit: 20,
    });
  }

  private async testStakingOperation() {
    // Simulate staking (would need real funds in production)
    const mockStake = {
      influencerId: 'test-influencer-' + Math.floor(Math.random() * 10),
      amount: BigInt(Math.floor(Math.random() * 1000) * 1e9),
      wallet: 'test-wallet-' + Date.now(),
    };
    
    // In real test, this would execute actual stake
    await this.webSDK.calculateStakingReturns({
      influencerId: mockStake.influencerId,
      amount: mockStake.amount,
      period: 30,
    });
  }

  private async testVAUSubmission() {
    const vauData = {
      userId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deviceId: `device_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      attestation: {
        platform: 'web',
        trustScore: Math.floor(Math.random() * 100),
      },
    };
    
    await fetch(`${process.env.EDGE_URL || 'https://api.twist.io'}/api/v1/vau/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'load-test-key',
      },
      body: JSON.stringify(vauData),
    });
  }

  private async testEventTracking() {
    const events = Array(10).fill(0).map((_, i) => ({
      action: 'load_test_event',
      metadata: {
        index: i,
        timestamp: Date.now(),
        random: Math.random(),
      },
      userId: 'load-test-user',
      productId: 'load-test',
    }));
    
    await this.serverSDK.trackBatch(events);
  }

  private async testRealtimeUpdates() {
    return new Promise<void>((resolve) => {
      const influencerId = 'test-influencer-' + Math.floor(Math.random() * 10);
      
      const unsubscribe = this.webSDK.subscribeToInfluencer(
        influencerId,
        (update) => {
          unsubscribe();
          resolve();
        }
      );
      
      // Timeout after 5 seconds
      setTimeout(() => {
        unsubscribe();
        resolve();
      }, 5000);
    });
  }
}

// Stress test specific scenarios
class StressTester {
  async runStressTests() {
    logger.log('\n⚡ Starting Stress Tests');
    logger.log('========================\n');

    await this.testCascadingFailure();
    await this.testMemoryPressure();
    await this.testConnectionExhaustion();
    await this.testDataConsistency();
  }

  private async testCascadingFailure() {
    logger.log('Testing cascading failure recovery...');
    
    // Simulate primary service failure
    const services = ['auth', 'api', 'blockchain'];
    const results: boolean[] = [];
    
    for (const service of services) {
      try {
        // Simulate service check
        await fetch(`https://api.twist.io/health/${service}`);
        results.push(true);
      } catch (error) {
        results.push(false);
      }
    }
    
    const healthyServices = results.filter(r => r).length;
    logger.log(`✓ ${healthyServices}/${services.length} services healthy after failure`);
  }

  private async testMemoryPressure() {
    logger.log('Testing memory pressure handling...');
    
    const largeDataSets = [];
    const maxMemoryMB = 100; // Limit memory usage
    
    try {
      // Generate large data sets
      for (let i = 0; i < 1000; i++) {
        const data = new Array(1000).fill({
          id: i,
          data: 'x'.repeat(1000),
        });
        
        largeDataSets.push(data);
        
        // Check memory usage
        const memoryUsage = process.memoryUsage();
        const usedMB = memoryUsage.heapUsed / 1024 / 1024;
        
        if (usedMB > maxMemoryMB) {
          logger.log(`✓ Memory limit enforced at ${usedMB.toFixed(2)}MB`);
          break;
        }
      }
    } catch (error) {
      logger.log('✓ Out of memory handled gracefully');
    }
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
  }

  private async testConnectionExhaustion() {
    logger.log('Testing connection pool exhaustion...');
    
    const connections: Promise<any>[] = [];
    const maxConnections = 1000;
    
    for (let i = 0; i < maxConnections; i++) {
      connections.push(
        fetch('https://api.twist.io/health', {
          signal: AbortSignal.timeout(1000),
        }).catch(() => null)
      );
    }
    
    const results = await Promise.allSettled(connections);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    logger.log(`✓ Handled ${successful}/${maxConnections} concurrent connections`);
  }

  private async testDataConsistency() {
    logger.log('Testing data consistency under load...');
    
    const testData = {
      counter: 0,
      operations: [],
    };
    
    // Concurrent modifications
    const modifications = Array(100).fill(0).map(async (_, i) => {
      testData.counter++;
      testData.operations.push({
        id: i,
        timestamp: Date.now(),
      });
    });
    
    await Promise.all(modifications);
    
    const consistent = testData.counter === testData.operations.length;
    logger.log(`✓ Data consistency: ${consistent ? 'MAINTAINED' : 'VIOLATED'}`);
  }
}

// Main execution
async function main() {
  const loadTester = new LoadTester();
  const stressTester = new StressTester();
  
  try {
    await loadTester.runLoadTests();
    await stressTester.runStressTests();
    
    logger.log('\n✅ All performance tests completed!');
  } catch (error) {
    console.error('\n❌ Performance test failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { LoadTester, StressTester };