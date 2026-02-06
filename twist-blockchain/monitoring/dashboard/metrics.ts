import { Connection, PublicKey, ParsedAccountData } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

export interface TokenMetrics {
  price: number;
  totalSupply: number;
  circulatingSupply: number;
  floorPrice: number;
  volume24h: number;
  volumeChange24h: number;
  averageVolume: number;
  totalStaked: number;
  stakingApys: {
    '30d': number;
    '90d': number;
    '180d': number;
    '365d': number;
  };
  treasuryValues: {
    floor: number;
    ops: number;
    total: number;
  };
  oraclePrices: Array<{
    name: string;
    price: number;
    confidence: number;
    lastUpdate: number;
  }>;
  circuitBreakerActive: boolean;
  emergencyPauseActive: boolean;
  dailyDecayAmount: number;
  liquidityDepth: {
    '1%': number;
    '2%': number;
    '5%': number;
    '10%': number;
  };
  uniqueHolders: number;
  marketCap: number;
  fdv: number; // Fully Diluted Valuation
  tvl: number; // Total Value Locked
  lastDecayTimestamp: number;
  pidControllerStatus: {
    lastAdjustment: number;
    integral: number;
    targetPrice: number;
  };
}

interface HistoricalDataPoint {
  timestamp: number;
  price: number;
  volume: number;
  tvl: number;
  holders: number;
}

export class MetricsCollector {
  private connection: Connection;
  private program?: Program;
  private historicalData: HistoricalDataPoint[] = [];
  private metricsCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5000; // 5 seconds
  private readonly HISTORICAL_DATA_LIMIT = 10080; // 7 days of minute data
  
  constructor(connection: Connection, programId?: PublicKey) {
    this.connection = connection;
    
    if (programId) {
      this.loadProgram(programId);
    }
  }
  
  private async loadProgram(programId: PublicKey) {
    try {
      const idlPath = path.join(__dirname, '../../target/idl/twist_token.json');
      const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
      
      const provider = new AnchorProvider(
        this.connection,
        {} as any, // Read-only, no wallet needed
        { commitment: 'confirmed' }
      );
      
      this.program = new Program(idl, programId, provider);
    } catch (error) {
      console.error('Failed to load program:', error);
    }
  }
  
  public async getCurrentMetrics(): Promise<TokenMetrics> {
    // Check cache first
    const cached = this.getFromCache('current_metrics');
    if (cached) return cached;
    
    // Fetch all metrics in parallel
    const [
      programState,
      tokenSupply,
      stakingInfo,
      oracleData,
      volumeData,
      liquidityData,
      holderCount,
    ] = await Promise.all([
      this.getProgramState(),
      this.getTokenSupply(),
      this.getStakingInfo(),
      this.getOracleData(),
      this.getVolumeData(),
      this.getLiquidityDepth(),
      this.getUniqueHolders(),
    ]);
    
    // Calculate derived metrics
    const circulatingSupply = tokenSupply.total - tokenSupply.locked - tokenSupply.staked;
    const marketCap = programState.currentPrice * circulatingSupply;
    const fdv = programState.currentPrice * tokenSupply.total;
    const tvl = stakingInfo.totalStaked * programState.currentPrice + liquidityData.totalLiquidity;
    
    const metrics: TokenMetrics = {
      price: programState.currentPrice,
      totalSupply: tokenSupply.total,
      circulatingSupply,
      floorPrice: programState.floorPrice,
      volume24h: volumeData.volume24h,
      volumeChange24h: volumeData.change24h,
      averageVolume: volumeData.averageVolume,
      totalStaked: stakingInfo.totalStaked,
      stakingApys: stakingInfo.apys,
      treasuryValues: {
        floor: programState.floorTreasuryValue,
        ops: programState.opsTreasuryValue,
        total: programState.floorTreasuryValue + programState.opsTreasuryValue,
      },
      oraclePrices: oracleData,
      circuitBreakerActive: programState.circuitBreakerActive,
      emergencyPauseActive: programState.emergencyPause,
      dailyDecayAmount: programState.dailyDecayAmount,
      liquidityDepth: liquidityData.depth,
      uniqueHolders: holderCount,
      marketCap,
      fdv,
      tvl,
      lastDecayTimestamp: programState.lastDecayTimestamp,
      pidControllerStatus: programState.pidStatus,
    };
    
    this.setCache('current_metrics', metrics);
    return metrics;
  }
  
  private async getProgramState(): Promise<any> {
    if (!this.program) {
      // Return mock data if program not loaded
      return {
        currentPrice: 0.05,
        floorPrice: 0.045,
        floorTreasuryValue: 2000000,
        opsTreasuryValue: 500000,
        circuitBreakerActive: false,
        emergencyPause: false,
        dailyDecayAmount: 50000,
        lastDecayTimestamp: Date.now() - 3600000,
        pidStatus: {
          lastAdjustment: 0,
          integral: 0,
          targetPrice: 0.05,
        },
      };
    }
    
    const [programState] = await PublicKey.findProgramAddress(
      [Buffer.from('program_state')],
      this.program.programId
    );
    
    const state = await this.program.account.programState.fetch(programState);
    
    return {
      currentPrice: state.lastOraclePrice.toNumber() / 1e6,
      floorPrice: state.floorPrice.toNumber() / 1e6,
      floorTreasuryValue: state.floorLiquidity.toNumber() / 1e6,
      opsTreasuryValue: 0, // Would need to fetch treasury account
      circuitBreakerActive: state.circuitBreakerActive,
      emergencyPause: state.emergencyPause,
      dailyDecayAmount: state.totalDecayed.toNumber() / 1e9,
      lastDecayTimestamp: state.lastDecayTimestamp.toNumber() * 1000,
      pidStatus: {
        lastAdjustment: 0,
        integral: 0,
        targetPrice: state.floorPrice.toNumber() / 1e6,
      },
    };
  }
  
  private async getTokenSupply(): Promise<any> {
    if (!this.program) {
      return {
        total: 1000000000,
        locked: 200000000,
        staked: 300000000,
      };
    }
    
    const [programState] = await PublicKey.findProgramAddress(
      [Buffer.from('program_state')],
      this.program.programId
    );
    
    const state = await this.program.account.programState.fetch(programState);
    const mintInfo = await this.connection.getParsedAccountInfo(state.mint);
    
    if (mintInfo.value && 'parsed' in mintInfo.value.data) {
      const supply = (mintInfo.value.data as ParsedAccountData).parsed.info.supply;
      return {
        total: parseInt(supply) / 1e9,
        locked: 0, // Would need to calculate from vesting accounts
        staked: state.totalStaked.toNumber() / 1e9,
      };
    }
    
    return {
      total: 0,
      locked: 0,
      staked: 0,
    };
  }
  
  private async getStakingInfo(): Promise<any> {
    if (!this.program) {
      return {
        totalStaked: 300000000,
        apys: {
          '30d': 10,
          '90d': 20,
          '180d': 35,
          '365d': 67,
        },
      };
    }
    
    const [programState] = await PublicKey.findProgramAddress(
      [Buffer.from('program_state')],
      this.program.programId
    );
    
    const state = await this.program.account.programState.fetch(programState);
    
    return {
      totalStaked: state.totalStaked.toNumber() / 1e9,
      apys: {
        '30d': 10,
        '90d': 20,
        '180d': 35,
        '365d': 67,
      },
    };
  }
  
  private async getOracleData(): Promise<any[]> {
    // In production, would fetch from actual oracle accounts
    return [
      {
        name: 'pyth',
        price: 0.0502,
        confidence: 0.0001,
        lastUpdate: Date.now() - 5000,
      },
      {
        name: 'switchboard',
        price: 0.0498,
        confidence: 0.0002,
        lastUpdate: Date.now() - 8000,
      },
      {
        name: 'chainlink',
        price: 0.0501,
        confidence: 0.0001,
        lastUpdate: Date.now() - 12000,
      },
    ];
  }
  
  private async getVolumeData(): Promise<any> {
    // In production, would aggregate from DEX transactions
    const volume24h = 2500000;
    const volumePrev24h = 2000000;
    const change24h = ((volume24h - volumePrev24h) / volumePrev24h) * 100;
    
    return {
      volume24h,
      change24h,
      averageVolume: 2200000,
    };
  }
  
  private async getLiquidityDepth(): Promise<any> {
    // In production, would fetch from Orca pools
    return {
      depth: {
        '1%': 500000,
        '2%': 800000,
        '5%': 1500000,
        '10%': 2500000,
      },
      totalLiquidity: 5000000,
    };
  }
  
  private async getUniqueHolders(): Promise<number> {
    if (!this.program) return 15000;
    
    // In production, would use getProgramAccounts with filters
    // For now, return estimated value
    return 15000;
  }
  
  public async getHistoricalMetrics(period: string): Promise<HistoricalDataPoint[]> {
    const now = Date.now();
    let startTime: number;
    let interval: number;
    
    switch (period) {
      case '1h':
        startTime = now - 60 * 60 * 1000;
        interval = 60 * 1000; // 1 minute
        break;
      case '24h':
        startTime = now - 24 * 60 * 60 * 1000;
        interval = 5 * 60 * 1000; // 5 minutes
        break;
      case '7d':
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        interval = 60 * 60 * 1000; // 1 hour
        break;
      case '30d':
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        interval = 4 * 60 * 60 * 1000; // 4 hours
        break;
      default:
        startTime = now - 24 * 60 * 60 * 1000;
        interval = 5 * 60 * 1000;
    }
    
    // Filter and aggregate historical data
    return this.historicalData
      .filter(point => point.timestamp >= startTime)
      .filter((point, index, array) => {
        if (index === 0) return true;
        return point.timestamp - array[index - 1].timestamp >= interval;
      });
  }
  
  public async updateHistoricalData(): Promise<void> {
    const metrics = await this.getCurrentMetrics();
    
    this.historicalData.push({
      timestamp: Date.now(),
      price: metrics.price,
      volume: metrics.volume24h,
      tvl: metrics.tvl,
      holders: metrics.uniqueHolders,
    });
    
    // Trim old data
    if (this.historicalData.length > this.HISTORICAL_DATA_LIMIT) {
      this.historicalData = this.historicalData.slice(-this.HISTORICAL_DATA_LIMIT);
    }
    
    // Save to disk for persistence
    this.saveHistoricalData();
  }
  
  private saveHistoricalData(): void {
    try {
      const dataPath = path.join(__dirname, '../../data/historical_metrics.json');
      fs.mkdirSync(path.dirname(dataPath), { recursive: true });
      fs.writeFileSync(dataPath, JSON.stringify(this.historicalData));
    } catch (error) {
      console.error('Failed to save historical data:', error);
    }
  }
  
  private loadHistoricalData(): void {
    try {
      const dataPath = path.join(__dirname, '../../data/historical_metrics.json');
      if (fs.existsSync(dataPath)) {
        this.historicalData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      }
    } catch (error) {
      console.error('Failed to load historical data:', error);
    }
  }
  
  private getFromCache(key: string): any | null {
    const cached = this.metricsCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    return null;
  }
  
  private setCache(key: string, data: any): void {
    this.metricsCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }
  
  public async getPriceHistory(seconds: number): Promise<number[]> {
    const cutoff = Date.now() - (seconds * 1000);
    return this.historicalData
      .filter(point => point.timestamp >= cutoff)
      .map(point => point.price);
  }
  
  public async get24hVolume(): Promise<BN> {
    const metrics = await this.getCurrentMetrics();
    return new BN(metrics.volume24h * 1e6); // Convert to USDC atomic units
  }
  
  public async get7dAverageVolume(): Promise<BN> {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const relevantData = this.historicalData.filter(point => point.timestamp >= sevenDaysAgo);
    
    if (relevantData.length === 0) {
      return new BN(2000000 * 1e6); // Default 2M USDC
    }
    
    const avgVolume = relevantData.reduce((sum, point) => sum + point.volume, 0) / relevantData.length;
    return new BN(avgVolume * 1e6);
  }
}