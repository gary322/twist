import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@project-serum/anchor';
import { PriceAggregator } from '../../sdk/src/oracles/price-aggregator';
import * as fs from 'fs';
import * as path from 'path';

export interface MarketData {
  currentPrice: number;
  floorPrice: number;
  priceRatio: number; // current / floor
  volume24h: number;
  volumeChange24h: number;
  liquidityDepth: number;
  oraclePrices: Array<{
    source: string;
    price: number;
    confidence: number;
  }>;
  lastUpdate: number;
  floorLiquidity: number;
  marketCap: number;
  circulatingSupply: number;
}

export class PriceMonitor {
  private connection: Connection;
  private program?: Program;
  private priceAggregator?: PriceAggregator;
  private priceHistory: Array<{ timestamp: number; price: number }> = [];
  private volumeHistory: Array<{ timestamp: number; volume: number }> = [];
  
  constructor(connection: Connection, programId: PublicKey) {
    this.connection = connection;
    this.loadProgram(programId);
  }
  
  private async loadProgram(programId: PublicKey) {
    try {
      const idlPath = path.join(__dirname, '../../target/idl/twist_token.json');
      const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
      
      const provider = new AnchorProvider(
        this.connection,
        {} as any, // Read-only
        { commitment: 'confirmed' }
      );
      
      this.program = new Program(idl, programId, provider);
      
      // Initialize price aggregator
      const [programState] = await PublicKey.findProgramAddress(
        [Buffer.from('program_state')],
        programId
      );
      
      const state = await this.program.account.programState.fetch(programState);
      
      this.priceAggregator = new PriceAggregator(
        this.connection,
        state.pythPriceFeed,
        state.switchboardFeed,
        state.chainlinkFeed
      );
    } catch (error) {
      console.error('Failed to load program for price monitor:', error);
    }
  }
  
  public async getMarketData(): Promise<MarketData> {
    if (!this.program) {
      // Return mock data if program not loaded
      return this.getMockMarketData();
    }
    
    try {
      // Fetch program state
      const [programState] = await PublicKey.findProgramAddress(
        [Buffer.from('program_state')],
        this.program.programId
      );
      
      const state = await this.program.account.programState.fetch(programState);
      
      // Get aggregated price
      const priceData = await this.priceAggregator!.getAggregatedPrice();
      
      // Calculate metrics
      const currentPrice = priceData.price;
      const floorPrice = state.floorPrice.toNumber() / 1e6;
      const priceRatio = currentPrice / floorPrice;
      
      // Get volume data (would fetch from actual DEX)
      const volume24h = await this.get24hVolume();
      const volumePrev24h = await this.get24hVolume(1); // 1 day ago
      const volumeChange24h = ((volume24h - volumePrev24h) / volumePrev24h) * 100;
      
      // Get liquidity depth
      const liquidityDepth = await this.getLiquidityDepth();
      
      // Update history
      this.updatePriceHistory(currentPrice);
      this.updateVolumeHistory(volume24h);
      
      return {
        currentPrice,
        floorPrice,
        priceRatio,
        volume24h,
        volumeChange24h,
        liquidityDepth,
        oraclePrices: priceData.sources.map(s => ({
          source: s.source,
          price: s.price,
          confidence: s.confidence,
        })),
        lastUpdate: Date.now(),
        floorLiquidity: state.floorLiquidity.toNumber() / 1e6,
        marketCap: 0, // Would calculate from supply
        circulatingSupply: 0, // Would fetch from mint
      };
    } catch (error) {
      console.error('Error fetching market data:', error);
      return this.getMockMarketData();
    }
  }
  
  private getMockMarketData(): MarketData {
    const currentPrice = 0.048;
    const floorPrice = 0.05;
    
    return {
      currentPrice,
      floorPrice,
      priceRatio: currentPrice / floorPrice,
      volume24h: 2500000,
      volumeChange24h: 15.5,
      liquidityDepth: 5000000,
      oraclePrices: [
        { source: 'pyth', price: 0.0482, confidence: 0.0001 },
        { source: 'switchboard', price: 0.0478, confidence: 0.0002 },
      ],
      lastUpdate: Date.now(),
      floorLiquidity: 2000000,
      marketCap: 48000000,
      circulatingSupply: 1000000000,
    };
  }
  
  private async get24hVolume(daysAgo: number = 0): Promise<number> {
    // In production, would fetch from DEX analytics
    return 2500000 + Math.random() * 500000;
  }
  
  private async getLiquidityDepth(): Promise<number> {
    // In production, would fetch from Orca pool
    return 5000000;
  }
  
  private updatePriceHistory(price: number) {
    this.priceHistory.push({
      timestamp: Date.now(),
      price,
    });
    
    // Keep only last 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.priceHistory = this.priceHistory.filter(p => p.timestamp > cutoff);
  }
  
  private updateVolumeHistory(volume: number) {
    this.volumeHistory.push({
      timestamp: Date.now(),
      volume,
    });
    
    // Keep only last 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.volumeHistory = this.volumeHistory.filter(v => v.timestamp > cutoff);
  }
  
  public getRecentPriceVolatility(): number {
    if (this.priceHistory.length < 2) return 0;
    
    const prices = this.priceHistory.map(p => p.price);
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    
    return (stdDev / mean) * 100; // Coefficient of variation as percentage
  }
  
  public getAverageVolume(days: number = 7): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const relevantVolumes = this.volumeHistory.filter(v => v.timestamp > cutoff);
    
    if (relevantVolumes.length === 0) return 0;
    
    return relevantVolumes.reduce((sum, v) => sum + v.volume, 0) / relevantVolumes.length;
  }
  
  public async checkOracleHealth(): Promise<{
    healthy: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      const priceData = await this.priceAggregator!.getAggregatedPrice();
      
      // Check confidence
      if (priceData.confidence > 0.01) {
        issues.push(`High price confidence: ${(priceData.confidence * 100).toFixed(2)}%`);
      }
      
      // Check divergence
      const prices = priceData.sources.map(s => s.price);
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const divergence = ((maxPrice - minPrice) / minPrice) * 100;
      
      if (divergence > 2) {
        issues.push(`Oracle divergence: ${divergence.toFixed(2)}%`);
      }
      
      // Check staleness
      const now = Date.now();
      for (const source of priceData.sources) {
        const age = now - source.timestamp;
        if (age > 60000) { // 1 minute
          issues.push(`${source.source} price stale: ${Math.floor(age / 1000)}s old`);
        }
      }
      
    } catch (error) {
      issues.push(`Oracle check failed: ${error.message}`);
    }
    
    return {
      healthy: issues.length === 0,
      issues,
    };
  }
  
  public async waitForPriceDrop(
    targetRatio: number,
    timeoutMs: number = 300000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const marketData = await this.getMarketData();
      
      if (marketData.priceRatio <= targetRatio) {
        return true;
      }
      
      // Wait 5 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    return false;
  }
}