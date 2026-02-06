/**
 * Mock Blockchain Client for simulation
 */

export class BlockchainClient {
  private transactionCount = 0;

  async createWallet(): Promise<string> {
    // Generate mock wallet address
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '';
    for (let i = 0; i < 44; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
  }

  async stake(params: {
    userId: string;
    influencerId: string;
    amount: number;
    poolAddress: string;
  }): Promise<{ success: boolean; transactionId: string }> {
    this.transactionCount++;
    return {
      success: true,
      transactionId: `tx_stake_${this.transactionCount}_${Date.now()}`
    };
  }

  async unstake(params: {
    userId: string;
    influencerId: string;
    amount: number;
  }): Promise<{ success: boolean; transactionId: string }> {
    this.transactionCount++;
    return {
      success: true,
      transactionId: `tx_unstake_${this.transactionCount}_${Date.now()}`
    };
  }

  async claimRewards(params: {
    userId: string;
    influencerId: string;
    amount: number;
  }): Promise<{ success: boolean; transactionId: string }> {
    this.transactionCount++;
    return {
      success: true,
      transactionId: `tx_claim_${this.transactionCount}_${Date.now()}`
    };
  }

  async burn(params: {
    userId?: string;
    amount: number;
    reason: string;
    authority?: string;
  }): Promise<{ success: boolean; transactionId: string }> {
    this.transactionCount++;
    return {
      success: true,
      transactionId: `tx_burn_${this.transactionCount}_${Date.now()}`
    };
  }

  async transfer(params: {
    from: string;
    to: string;
    amount: number;
  }): Promise<{ success: boolean; transactionId: string; fee: number }> {
    this.transactionCount++;
    const fee = params.amount * 0.003; // 0.3% fee
    return {
      success: true,
      transactionId: `tx_transfer_${this.transactionCount}_${Date.now()}`,
      fee
    };
  }

  async createStakingPool(params: {
    influencerId: string;
    tier: string;
    commissionRate: number;
    minStake: number;
    lockPeriod: number;
  }): Promise<{ success: boolean; poolAddress: string }> {
    return {
      success: true,
      poolAddress: `pool_${params.influencerId}_${Date.now()}`
    };
  }
}