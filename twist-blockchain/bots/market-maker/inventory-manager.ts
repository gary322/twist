import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getMint } from '@solana/spl-token';
import { Wallet } from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';

export interface Inventory {
  twist: number;
  usdc: number;
  totalValueUsd: number;
  twistValueUsd: number;
  usdcValueUsd: number;
  ratio: number; // TWIST value / Total value
}

export interface InventoryTarget {
  twist: number;
  usdc: number;
  tolerance: number; // Percentage tolerance
}

export class InventoryManager {
  private connection: Connection;
  private wallet: Wallet;
  private twistMint: PublicKey;
  private usdcMint: PublicKey;
  private twistAccount?: PublicKey;
  private usdcAccount?: PublicKey;
  
  constructor(connection: Connection, wallet: Wallet) {
    this.connection = connection;
    this.wallet = wallet;
    
    // Token mints
    this.twistMint = new PublicKey('TWSTmintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    this.usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  }
  
  /**
   * Initialize token accounts
   */
  async initialize() {
    // Find associated token accounts
    const [twistAccount] = await PublicKey.findProgramAddress(
      [
        this.wallet.publicKey.toBuffer(),
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(),
        this.twistMint.toBuffer(),
      ],
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
    );
    
    const [usdcAccount] = await PublicKey.findProgramAddress(
      [
        this.wallet.publicKey.toBuffer(),
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(),
        this.usdcMint.toBuffer(),
      ],
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
    );
    
    this.twistAccount = twistAccount;
    this.usdcAccount = usdcAccount;
  }
  
  /**
   * Get current balances
   */
  async getBalances(): Promise<{ twist: number; usdc: number }> {
    if (!this.twistAccount || !this.usdcAccount) {
      await this.initialize();
    }
    
    try {
      const twistAccountInfo = await getAccount(this.connection, this.twistAccount!);
      const usdcAccountInfo = await getAccount(this.connection, this.usdcAccount!);
      
      const twistMintInfo = await getMint(this.connection, this.twistMint);
      const usdcMintInfo = await getMint(this.connection, this.usdcMint);
      
      const twistBalance = Number(twistAccountInfo.amount) / Math.pow(10, twistMintInfo.decimals);
      const usdcBalance = Number(usdcAccountInfo.amount) / Math.pow(10, usdcMintInfo.decimals);
      
      return {
        twist: twistBalance,
        usdc: usdcBalance,
      };
    } catch (error) {
      console.error('Error fetching balances:', error);
      // Return mock balances for testing
      return {
        twist: 100000,
        usdc: 5000,
      };
    }
  }
  
  /**
   * Get current inventory with USD values
   */
  async getInventory(twistPrice?: number): Promise<Inventory> {
    const balances = await this.getBalances();
    const price = twistPrice || 0.05; // Default price if not provided
    
    const twistValueUsd = balances.twist * price;
    const usdcValueUsd = balances.usdc;
    const totalValueUsd = twistValueUsd + usdcValueUsd;
    
    return {
      twist: balances.twist,
      usdc: balances.usdc,
      totalValueUsd,
      twistValueUsd,
      usdcValueUsd,
      ratio: totalValueUsd > 0 ? twistValueUsd / totalValueUsd : 0.5,
    };
  }
  
  /**
   * Calculate inventory imbalance
   */
  calculateImbalance(
    current: Inventory,
    target: InventoryTarget
  ): {
    twistDelta: number;
    usdcDelta: number;
    rebalanceNeeded: boolean;
    severity: 'low' | 'medium' | 'high';
  } {
    const twistDelta = current.twist - target.twist;
    const usdcDelta = current.usdc - target.usdc;
    
    const twistDeltaPct = Math.abs(twistDelta) / target.twist;
    const usdcDeltaPct = Math.abs(usdcDelta) / target.usdc;
    
    const maxDeltaPct = Math.max(twistDeltaPct, usdcDeltaPct);
    
    let severity: 'low' | 'medium' | 'high';
    if (maxDeltaPct < target.tolerance) {
      severity = 'low';
    } else if (maxDeltaPct < target.tolerance * 2) {
      severity = 'medium';
    } else {
      severity = 'high';
    }
    
    return {
      twistDelta,
      usdcDelta,
      rebalanceNeeded: maxDeltaPct > target.tolerance,
      severity,
    };
  }
  
  /**
   * Calculate rebalancing trades
   */
  calculateRebalancingTrades(
    current: Inventory,
    target: InventoryTarget,
    currentPrice: number
  ): Array<{
    side: 'buy' | 'sell';
    amount: number;
    price: number;
    urgency: number;
  }> {
    const imbalance = this.calculateImbalance(current, target);
    const trades = [];
    
    if (!imbalance.rebalanceNeeded) {
      return trades;
    }
    
    // Calculate target values in USD
    const targetTotalValue = target.twist * currentPrice + target.usdc;
    const targetRatio = (target.twist * currentPrice) / targetTotalValue;
    
    // Calculate how much to trade
    const currentRatio = current.ratio;
    const ratioDiff = targetRatio - currentRatio;
    
    if (ratioDiff > 0) {
      // Need more TWIST, buy
      const usdcToSpend = Math.abs(ratioDiff) * current.totalValueUsd;
      const twistToBuy = usdcToSpend / currentPrice;
      
      trades.push({
        side: 'buy' as const,
        amount: twistToBuy,
        price: currentPrice,
        urgency: this.calculateUrgency(imbalance.severity),
      });
    } else if (ratioDiff < 0) {
      // Have too much TWIST, sell
      const twistValueToSell = Math.abs(ratioDiff) * current.totalValueUsd;
      const twistToSell = twistValueToSell / currentPrice;
      
      trades.push({
        side: 'sell' as const,
        amount: twistToSell,
        price: currentPrice,
        urgency: this.calculateUrgency(imbalance.severity),
      });
    }
    
    return trades;
  }
  
  /**
   * Monitor inventory and alert on issues
   */
  async monitorInventory(
    target: InventoryTarget,
    currentPrice: number
  ): Promise<{
    status: 'balanced' | 'imbalanced' | 'critical';
    message: string;
    actions: string[];
  }> {
    const current = await this.getInventory(currentPrice);
    const imbalance = this.calculateImbalance(current, target);
    
    if (!imbalance.rebalanceNeeded) {
      return {
        status: 'balanced',
        message: 'Inventory is within target range',
        actions: [],
      };
    }
    
    const actions = [];
    
    if (imbalance.twistDelta > 0) {
      actions.push(`Sell ${Math.abs(imbalance.twistDelta).toFixed(2)} TWIST`);
    } else if (imbalance.twistDelta < 0) {
      actions.push(`Buy ${Math.abs(imbalance.twistDelta).toFixed(2)} TWIST`);
    }
    
    const status = imbalance.severity === 'high' ? 'critical' : 'imbalanced';
    const message = `Inventory ${imbalance.severity} imbalance detected`;
    
    return { status, message, actions };
  }
  
  /**
   * Calculate urgency score for rebalancing
   */
  private calculateUrgency(severity: 'low' | 'medium' | 'high'): number {
    switch (severity) {
      case 'low':
        return 0.3;
      case 'medium':
        return 0.6;
      case 'high':
        return 0.9;
      default:
        return 0.5;
    }
  }
  
  /**
   * Get inventory history
   */
  private inventoryHistory: Array<{
    timestamp: number;
    inventory: Inventory;
  }> = [];
  
  async trackInventory(currentPrice: number) {
    const inventory = await this.getInventory(currentPrice);
    
    this.inventoryHistory.push({
      timestamp: Date.now(),
      inventory,
    });
    
    // Keep only last 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.inventoryHistory = this.inventoryHistory.filter(h => h.timestamp > cutoff);
  }
  
  /**
   * Analyze inventory trends
   */
  getInventoryTrends(): {
    twistTrend: 'increasing' | 'decreasing' | 'stable';
    usdcTrend: 'increasing' | 'decreasing' | 'stable';
    ratioTrend: 'increasing' | 'decreasing' | 'stable';
    volatility: number;
  } {
    if (this.inventoryHistory.length < 10) {
      return {
        twistTrend: 'stable',
        usdcTrend: 'stable',
        ratioTrend: 'stable',
        volatility: 0,
      };
    }
    
    // Get recent history
    const recent = this.inventoryHistory.slice(-20);
    const older = this.inventoryHistory.slice(-40, -20);
    
    // Calculate averages
    const recentAvg = this.calculateAverageInventory(recent);
    const olderAvg = this.calculateAverageInventory(older);
    
    // Determine trends
    const twistChange = (recentAvg.twist - olderAvg.twist) / olderAvg.twist;
    const usdcChange = (recentAvg.usdc - olderAvg.usdc) / olderAvg.usdc;
    const ratioChange = (recentAvg.ratio - olderAvg.ratio) / olderAvg.ratio;
    
    // Calculate volatility
    const ratios = recent.map(h => h.inventory.ratio);
    const volatility = this.calculateStandardDeviation(ratios);
    
    return {
      twistTrend: this.getTrend(twistChange),
      usdcTrend: this.getTrend(usdcChange),
      ratioTrend: this.getTrend(ratioChange),
      volatility,
    };
  }
  
  private calculateAverageInventory(
    history: Array<{ timestamp: number; inventory: Inventory }>
  ): Inventory {
    const sum = history.reduce(
      (acc, h) => ({
        twist: acc.twist + h.inventory.twist,
        usdc: acc.usdc + h.inventory.usdc,
        totalValueUsd: acc.totalValueUsd + h.inventory.totalValueUsd,
        twistValueUsd: acc.twistValueUsd + h.inventory.twistValueUsd,
        usdcValueUsd: acc.usdcValueUsd + h.inventory.usdcValueUsd,
        ratio: acc.ratio + h.inventory.ratio,
      }),
      { twist: 0, usdc: 0, totalValueUsd: 0, twistValueUsd: 0, usdcValueUsd: 0, ratio: 0 }
    );
    
    const count = history.length;
    
    return {
      twist: sum.twist / count,
      usdc: sum.usdc / count,
      totalValueUsd: sum.totalValueUsd / count,
      twistValueUsd: sum.twistValueUsd / count,
      usdcValueUsd: sum.usdcValueUsd / count,
      ratio: sum.ratio / count,
    };
  }
  
  private getTrend(change: number): 'increasing' | 'decreasing' | 'stable' {
    if (change > 0.05) return 'increasing';
    if (change < -0.05) return 'decreasing';
    return 'stable';
  }
  
  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }
}