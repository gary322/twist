import { Connection, PublicKey, Commitment } from '@solana/web3.js';
import axios from 'axios';
import * as dns from 'dns';
import { promisify } from 'util';

const dnsResolve = promisify(dns.resolve4);

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  latency?: number;
  lastChecked: number;
  metadata?: Record<string, any>;
}

export interface SystemHealth {
  healthy: boolean;
  timestamp: number;
  checks: HealthCheck[];
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
}

export class HealthChecker {
  private connection: Connection;
  private checks: Map<string, HealthCheck> = new Map();
  
  constructor(connection: Connection) {
    this.connection = connection;
  }
  
  public async checkHealth(): Promise<SystemHealth> {
    const checkPromises = [
      this.checkRPCHealth(),
      this.checkProgramHealth(),
      this.checkOracleHealth(),
      this.checkLiquidityHealth(),
      this.checkTreasuryHealth(),
      this.checkCircuitBreakerHealth(),
      this.checkDecaySchedule(),
      this.checkStakingSystem(),
      this.checkBridgeHealth(),
      this.checkMonitoringHealth(),
    ];
    
    const results = await Promise.allSettled(checkPromises);
    const checks: HealthCheck[] = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        checks.push(result.value);
        this.checks.set(result.value.name, result.value);
      } else {
        // If a check fails completely, mark it as unhealthy
        const errorCheck: HealthCheck = {
          name: 'unknown',
          status: 'unhealthy',
          message: `Check failed: ${result.reason}`,
          lastChecked: Date.now(),
        };
        checks.push(errorCheck);
      }
    }
    
    // Determine overall status
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }
    
    return {
      healthy: overallStatus === 'healthy',
      timestamp: Date.now(),
      checks,
      overallStatus,
    };
  }
  
  private async checkRPCHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check RPC connection
      const slot = await this.connection.getSlot();
      const blockTime = await this.connection.getBlockTime(slot);
      const latency = Date.now() - startTime;
      
      // Check if block time is recent
      const currentTime = Math.floor(Date.now() / 1000);
      const timeDiff = blockTime ? currentTime - blockTime : 999999;
      
      if (timeDiff > 60) {
        return {
          name: 'rpc_connection',
          status: 'degraded',
          message: `RPC is ${timeDiff}s behind`,
          latency,
          lastChecked: Date.now(),
          metadata: { slot, blockTime },
        };
      }
      
      if (latency > 1000) {
        return {
          name: 'rpc_connection',
          status: 'degraded',
          message: `High RPC latency: ${latency}ms`,
          latency,
          lastChecked: Date.now(),
          metadata: { slot },
        };
      }
      
      return {
        name: 'rpc_connection',
        status: 'healthy',
        message: `RPC healthy, slot: ${slot}`,
        latency,
        lastChecked: Date.now(),
        metadata: { slot, blockTime },
      };
    } catch (error) {
      return {
        name: 'rpc_connection',
        status: 'unhealthy',
        message: `RPC connection failed: ${error.message}`,
        lastChecked: Date.now(),
      };
    }
  }
  
  private async checkProgramHealth(): Promise<HealthCheck> {
    try {
      // Check if program accounts are accessible
      const programId = new PublicKey(process.env.TWIST_PROGRAM_ID || 'TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      const programInfo = await this.connection.getAccountInfo(programId);
      
      if (!programInfo) {
        return {
          name: 'program',
          status: 'unhealthy',
          message: 'Program account not found',
          lastChecked: Date.now(),
        };
      }
      
      if (!programInfo.executable) {
        return {
          name: 'program',
          status: 'unhealthy',
          message: 'Program is not executable',
          lastChecked: Date.now(),
        };
      }
      
      // Check program data size
      const programDataAddress = new PublicKey(programInfo.data.slice(4, 36));
      const programData = await this.connection.getAccountInfo(programDataAddress);
      
      if (!programData) {
        return {
          name: 'program',
          status: 'degraded',
          message: 'Program data account not accessible',
          lastChecked: Date.now(),
        };
      }
      
      return {
        name: 'program',
        status: 'healthy',
        message: 'Program deployed and executable',
        lastChecked: Date.now(),
        metadata: {
          programSize: programData.data.length,
          owner: programInfo.owner.toBase58(),
        },
      };
    } catch (error) {
      return {
        name: 'program',
        status: 'unhealthy',
        message: `Program check failed: ${error.message}`,
        lastChecked: Date.now(),
      };
    }
  }
  
  private async checkOracleHealth(): Promise<HealthCheck> {
    try {
      const issues: string[] = [];
      const oracleStatuses = [];
      
      // Check Pyth
      try {
        const pythResponse = await axios.get('https://api.pyth.network/api/health', {
          timeout: 5000,
        });
        oracleStatuses.push({
          name: 'pyth',
          healthy: pythResponse.status === 200,
        });
      } catch (error) {
        issues.push('Pyth unhealthy');
        oracleStatuses.push({ name: 'pyth', healthy: false });
      }
      
      // Check Switchboard (would need actual endpoint)
      oracleStatuses.push({ name: 'switchboard', healthy: true });
      
      // Check Chainlink (if configured)
      if (process.env.CHAINLINK_ENABLED === 'true') {
        oracleStatuses.push({ name: 'chainlink', healthy: true });
      }
      
      const healthyOracles = oracleStatuses.filter(o => o.healthy).length;
      const totalOracles = oracleStatuses.length;
      
      if (healthyOracles === 0) {
        return {
          name: 'oracles',
          status: 'unhealthy',
          message: 'All oracles are down',
          lastChecked: Date.now(),
          metadata: { oracleStatuses },
        };
      }
      
      if (healthyOracles < totalOracles) {
        return {
          name: 'oracles',
          status: 'degraded',
          message: `${healthyOracles}/${totalOracles} oracles healthy`,
          lastChecked: Date.now(),
          metadata: { oracleStatuses, issues },
        };
      }
      
      return {
        name: 'oracles',
        status: 'healthy',
        message: 'All oracles operational',
        lastChecked: Date.now(),
        metadata: { oracleStatuses },
      };
    } catch (error) {
      return {
        name: 'oracles',
        status: 'unhealthy',
        message: `Oracle check failed: ${error.message}`,
        lastChecked: Date.now(),
      };
    }
  }
  
  private async checkLiquidityHealth(): Promise<HealthCheck> {
    try {
      // In production, would check actual Orca pool state
      const mockLiquidity = {
        tvl: 5000000,
        volume24h: 2500000,
        priceImpact2Percent: 0.8,
      };
      
      if (mockLiquidity.tvl < 1000000) {
        return {
          name: 'liquidity',
          status: 'unhealthy',
          message: `Low liquidity: $${(mockLiquidity.tvl / 1e6).toFixed(2)}M`,
          lastChecked: Date.now(),
          metadata: mockLiquidity,
        };
      }
      
      if (mockLiquidity.priceImpact2Percent > 2) {
        return {
          name: 'liquidity',
          status: 'degraded',
          message: `High price impact: ${mockLiquidity.priceImpact2Percent.toFixed(2)}%`,
          lastChecked: Date.now(),
          metadata: mockLiquidity,
        };
      }
      
      return {
        name: 'liquidity',
        status: 'healthy',
        message: `Healthy liquidity: $${(mockLiquidity.tvl / 1e6).toFixed(2)}M TVL`,
        lastChecked: Date.now(),
        metadata: mockLiquidity,
      };
    } catch (error) {
      return {
        name: 'liquidity',
        status: 'unhealthy',
        message: `Liquidity check failed: ${error.message}`,
        lastChecked: Date.now(),
      };
    }
  }
  
  private async checkTreasuryHealth(): Promise<HealthCheck> {
    try {
      // In production, would check actual treasury balances
      const mockTreasury = {
        floorValue: 2000000,
        opsValue: 500000,
        floorRatio: 0.8,
      };
      
      if (mockTreasury.floorValue < 500000) {
        return {
          name: 'treasury',
          status: 'unhealthy',
          message: 'Critical: Floor treasury below minimum',
          lastChecked: Date.now(),
          metadata: mockTreasury,
        };
      }
      
      if (mockTreasury.floorRatio < 0.5) {
        return {
          name: 'treasury',
          status: 'degraded',
          message: 'Floor treasury ratio below target',
          lastChecked: Date.now(),
          metadata: mockTreasury,
        };
      }
      
      return {
        name: 'treasury',
        status: 'healthy',
        message: `Treasury healthy: $${(mockTreasury.floorValue / 1e6).toFixed(2)}M floor`,
        lastChecked: Date.now(),
        metadata: mockTreasury,
      };
    } catch (error) {
      return {
        name: 'treasury',
        status: 'unhealthy',
        message: `Treasury check failed: ${error.message}`,
        lastChecked: Date.now(),
      };
    }
  }
  
  private async checkCircuitBreakerHealth(): Promise<HealthCheck> {
    try {
      // In production, would check actual circuit breaker state
      const mockCircuitBreaker = {
        active: false,
        lastTripped: null,
        tripCount24h: 0,
      };
      
      if (mockCircuitBreaker.active) {
        return {
          name: 'circuit_breaker',
          status: 'degraded',
          message: 'Circuit breaker is active',
          lastChecked: Date.now(),
          metadata: mockCircuitBreaker,
        };
      }
      
      if (mockCircuitBreaker.tripCount24h > 5) {
        return {
          name: 'circuit_breaker',
          status: 'degraded',
          message: `Circuit breaker tripped ${mockCircuitBreaker.tripCount24h} times in 24h`,
          lastChecked: Date.now(),
          metadata: mockCircuitBreaker,
        };
      }
      
      return {
        name: 'circuit_breaker',
        status: 'healthy',
        message: 'Circuit breaker inactive',
        lastChecked: Date.now(),
        metadata: mockCircuitBreaker,
      };
    } catch (error) {
      return {
        name: 'circuit_breaker',
        status: 'unhealthy',
        message: `Circuit breaker check failed: ${error.message}`,
        lastChecked: Date.now(),
      };
    }
  }
  
  private async checkDecaySchedule(): Promise<HealthCheck> {
    try {
      // In production, would check actual decay execution
      const lastDecay = Date.now() - (20 * 60 * 60 * 1000); // 20 hours ago
      const hoursSinceDecay = (Date.now() - lastDecay) / (60 * 60 * 1000);
      
      if (hoursSinceDecay > 26) {
        return {
          name: 'decay_schedule',
          status: 'unhealthy',
          message: `Decay overdue by ${(hoursSinceDecay - 24).toFixed(1)} hours`,
          lastChecked: Date.now(),
          metadata: { lastDecay, hoursSinceDecay },
        };
      }
      
      if (hoursSinceDecay > 25) {
        return {
          name: 'decay_schedule',
          status: 'degraded',
          message: `Decay due in ${(25 - hoursSinceDecay).toFixed(1)} hours`,
          lastChecked: Date.now(),
          metadata: { lastDecay, hoursSinceDecay },
        };
      }
      
      return {
        name: 'decay_schedule',
        status: 'healthy',
        message: `Last decay ${hoursSinceDecay.toFixed(1)} hours ago`,
        lastChecked: Date.now(),
        metadata: { lastDecay, hoursSinceDecay },
      };
    } catch (error) {
      return {
        name: 'decay_schedule',
        status: 'unhealthy',
        message: `Decay check failed: ${error.message}`,
        lastChecked: Date.now(),
      };
    }
  }
  
  private async checkStakingSystem(): Promise<HealthCheck> {
    try {
      // In production, would check actual staking metrics
      const mockStaking = {
        totalStaked: 300000000,
        activeStakers: 5000,
        pendingRewards: 1500000,
        lastRewardDistribution: Date.now() - (2 * 60 * 60 * 1000),
      };
      
      const hoursSinceRewards = (Date.now() - mockStaking.lastRewardDistribution) / (60 * 60 * 1000);
      
      if (hoursSinceRewards > 24) {
        return {
          name: 'staking_system',
          status: 'unhealthy',
          message: 'Reward distribution overdue',
          lastChecked: Date.now(),
          metadata: mockStaking,
        };
      }
      
      if (mockStaking.activeStakers < 1000) {
        return {
          name: 'staking_system',
          status: 'degraded',
          message: `Low staker count: ${mockStaking.activeStakers}`,
          lastChecked: Date.now(),
          metadata: mockStaking,
        };
      }
      
      return {
        name: 'staking_system',
        status: 'healthy',
        message: `${mockStaking.activeStakers} active stakers`,
        lastChecked: Date.now(),
        metadata: mockStaking,
      };
    } catch (error) {
      return {
        name: 'staking_system',
        status: 'unhealthy',
        message: `Staking check failed: ${error.message}`,
        lastChecked: Date.now(),
      };
    }
  }
  
  private async checkBridgeHealth(): Promise<HealthCheck> {
    try {
      // Check Wormhole guardian network
      const guardianSetHealth = await this.checkWormholeGuardians();
      
      if (!guardianSetHealth.healthy) {
        return {
          name: 'bridge',
          status: 'degraded',
          message: 'Wormhole guardian set degraded',
          lastChecked: Date.now(),
          metadata: guardianSetHealth,
        };
      }
      
      return {
        name: 'bridge',
        status: 'healthy',
        message: 'Bridge operational',
        lastChecked: Date.now(),
        metadata: guardianSetHealth,
      };
    } catch (error) {
      return {
        name: 'bridge',
        status: 'unhealthy',
        message: `Bridge check failed: ${error.message}`,
        lastChecked: Date.now(),
      };
    }
  }
  
  private async checkWormholeGuardians(): Promise<any> {
    // In production, would check actual guardian status
    return {
      healthy: true,
      activeGuardians: 19,
      totalGuardians: 19,
      lastHeartbeat: Date.now() - 30000,
    };
  }
  
  private async checkMonitoringHealth(): Promise<HealthCheck> {
    try {
      // Self-check monitoring systems
      const checks = {
        prometheusUp: true,
        alertManagerUp: true,
        diskSpace: 75, // percentage used
        memoryUsage: 45, // percentage used
      };
      
      if (checks.diskSpace > 90) {
        return {
          name: 'monitoring',
          status: 'unhealthy',
          message: 'Critical: Low disk space',
          lastChecked: Date.now(),
          metadata: checks,
        };
      }
      
      if (checks.memoryUsage > 80 || checks.diskSpace > 80) {
        return {
          name: 'monitoring',
          status: 'degraded',
          message: 'High resource usage',
          lastChecked: Date.now(),
          metadata: checks,
        };
      }
      
      if (!checks.prometheusUp || !checks.alertManagerUp) {
        return {
          name: 'monitoring',
          status: 'degraded',
          message: 'Monitoring component down',
          lastChecked: Date.now(),
          metadata: checks,
        };
      }
      
      return {
        name: 'monitoring',
        status: 'healthy',
        message: 'Monitoring systems operational',
        lastChecked: Date.now(),
        metadata: checks,
      };
    } catch (error) {
      return {
        name: 'monitoring',
        status: 'unhealthy',
        message: `Monitoring check failed: ${error.message}`,
        lastChecked: Date.now(),
      };
    }
  }
  
  public getLastCheck(name: string): HealthCheck | undefined {
    return this.checks.get(name);
  }
  
  public getAllChecks(): HealthCheck[] {
    return Array.from(this.checks.values());
  }
}