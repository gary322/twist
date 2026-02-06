/**
 * Simulation Metrics Tracking
 */

export class SimulationMetrics {
  private metrics = {
    vauEvents: [] as any[],
    stakingEvents: [] as any[],
    rewardEvents: [] as any[],
    transactions: [] as any[],
    errors: [] as any[],
    summary: {
      totalUsers: 0,
      totalInfluencers: 0,
      totalPublishers: 0,
      totalAdvertisers: 0,
      totalVAUs: 0,
      totalStaked: 0,
      totalBurned: 0,
      totalTransactions: 0,
      totalRevenue: 0
    }
  };

  constructor() {
    this.reset();
  }

  reset(): void {
    this.metrics = {
      vauEvents: [],
      stakingEvents: [],
      rewardEvents: [],
      transactions: [],
      errors: [],
      summary: {
        totalUsers: 0,
        totalInfluencers: 0,
        totalPublishers: 0,
        totalAdvertisers: 0,
        totalVAUs: 0,
        totalStaked: 0,
        totalBurned: 0,
        totalTransactions: 0,
        totalRevenue: 0
      }
    };
  }

  recordVAU(event: any): void {
    this.metrics.vauEvents.push({
      ...event,
      timestamp: Date.now()
    });
    this.metrics.summary.totalVAUs++;
  }

  recordStaking(event: any): void {
    this.metrics.stakingEvents.push({
      ...event,
      timestamp: Date.now()
    });
    this.metrics.summary.totalStaked += event.amount;
  }

  recordReward(event: any): void {
    this.metrics.rewardEvents.push({
      ...event,
      timestamp: Date.now()
    });
  }

  recordTransaction(transaction: any): void {
    this.metrics.transactions.push({
      ...transaction,
      timestamp: Date.now()
    });
    this.metrics.summary.totalTransactions++;
    
    if (transaction.type === 'burn') {
      this.metrics.summary.totalBurned += transaction.amount;
    }
  }

  recordError(error: any): void {
    this.metrics.errors.push({
      ...error,
      timestamp: Date.now()
    });
  }

  updateSummary(data: Partial<typeof this.metrics.summary>): void {
    Object.assign(this.metrics.summary, data);
  }

  getMetrics(): any {
    return { ...this.metrics };
  }

  generateReport(): string {
    const summary = this.metrics.summary;
    const vauStats = this.calculateVAUStats();
    const stakingStats = this.calculateStakingStats();
    const economicsStats = this.calculateEconomicsStats();

    return `
=== SIMULATION METRICS REPORT ===

PARTICIPANTS:
- Users: ${summary.totalUsers}
- Influencers: ${summary.totalInfluencers}
- Publishers: ${summary.totalPublishers}
- Advertisers: ${summary.totalAdvertisers}

VAU ACTIVITY:
- Total VAUs: ${summary.totalVAUs}
- Avg VAUs per User: ${vauStats.avgPerUser.toFixed(1)}
- Total Earned: ${vauStats.totalEarned.toFixed(2)} TWIST
- Avg Earning per VAU: ${vauStats.avgEarningPerVAU.toFixed(3)} TWIST

STAKING:
- Total Staked: ${(summary.totalStaked / 1000).toFixed(1)}K TWIST
- Active Positions: ${stakingStats.activePositions}
- Avg Stake Size: ${stakingStats.avgStakeSize.toFixed(1)} TWIST
- Total Rewards: ${stakingStats.totalRewards.toFixed(1)} TWIST

TOKEN ECONOMICS:
- Total Burned: ${(summary.totalBurned / 1000).toFixed(1)}K TWIST
- Burn Rate: ${economicsStats.burnRate.toFixed(2)}%
- Transfer Volume: ${economicsStats.transferVolume.toFixed(1)} TWIST
- Avg Transaction Size: ${economicsStats.avgTransactionSize.toFixed(1)} TWIST

REVENUE:
- Total Platform Revenue: $${(summary.totalRevenue / 100).toFixed(2)}
- Revenue per User: $${(summary.totalRevenue / summary.totalUsers / 100).toFixed(2)}

ERRORS: ${this.metrics.errors.length}
${this.metrics.errors.map(e => `- ${e.type}: ${e.message}`).join('\n')}

SIMULATION DURATION: ${this.getSimulationDuration()}
================================
    `;
  }

  private calculateVAUStats(): any {
    const vauEvents = this.metrics.vauEvents;
    const totalEarned = vauEvents.reduce((sum, e) => sum + (e.earned || 0), 0);
    
    return {
      avgPerUser: this.metrics.summary.totalUsers > 0 
        ? vauEvents.length / this.metrics.summary.totalUsers 
        : 0,
      totalEarned,
      avgEarningPerVAU: vauEvents.length > 0 
        ? totalEarned / vauEvents.length 
        : 0
    };
  }

  private calculateStakingStats(): any {
    const stakingEvents = this.metrics.stakingEvents;
    const rewardEvents = this.metrics.rewardEvents.filter(e => e.type === 'staking');
    
    return {
      activePositions: stakingEvents.length,
      avgStakeSize: stakingEvents.length > 0 
        ? this.metrics.summary.totalStaked / stakingEvents.length 
        : 0,
      totalRewards: rewardEvents.reduce((sum, e) => sum + e.amount, 0)
    };
  }

  private calculateEconomicsStats(): any {
    const transactions = this.metrics.transactions;
    const transfers = transactions.filter(t => t.type === 'transfer');
    const burns = transactions.filter(t => t.type === 'burn');
    
    const transferVolume = transfers.reduce((sum, t) => sum + t.amount, 0);
    
    return {
      burnRate: this.metrics.summary.totalBurned / (this.metrics.summary.totalStaked || 1) * 100,
      transferVolume,
      avgTransactionSize: transactions.length > 0
        ? transactions.reduce((sum, t) => sum + (t.amount || 0), 0) / transactions.length
        : 0
    };
  }

  private getSimulationDuration(): string {
    if (this.metrics.vauEvents.length === 0) return 'N/A';
    
    const firstEvent = Math.min(
      ...this.metrics.vauEvents.map(e => e.timestamp),
      ...this.metrics.transactions.map(t => t.timestamp)
    );
    
    const lastEvent = Math.max(
      ...this.metrics.vauEvents.map(e => e.timestamp),
      ...this.metrics.transactions.map(t => t.timestamp)
    );
    
    const duration = lastEvent - firstEvent;
    return `${(duration / 1000).toFixed(1)}s`;
  }

  exportToJSON(): string {
    return JSON.stringify(this.metrics, null, 2);
  }

  exportToCSV(): string {
    // Export key metrics as CSV
    const rows = [
      ['Metric', 'Value'],
      ['Total Users', this.metrics.summary.totalUsers],
      ['Total Influencers', this.metrics.summary.totalInfluencers],
      ['Total Publishers', this.metrics.summary.totalPublishers],
      ['Total Advertisers', this.metrics.summary.totalAdvertisers],
      ['Total VAUs', this.metrics.summary.totalVAUs],
      ['Total Staked', this.metrics.summary.totalStaked],
      ['Total Burned', this.metrics.summary.totalBurned],
      ['Total Transactions', this.metrics.summary.totalTransactions],
      ['Total Revenue', this.metrics.summary.totalRevenue]
    ];
    
    return rows.map(row => row.join(',')).join('\n');
  }

  snapshot(): any {
    return {
      ...this.metrics.summary,
      vauCount: this.metrics.vauEvents.length,
      stakingCount: this.metrics.stakingEvents.length,
      transactionCount: this.metrics.transactions.length,
      timestamp: Date.now()
    };
  }

  calculateDailyStats(startMetrics: any, endMetrics: any): any {
    return {
      newVAUs: endMetrics.vauCount - startMetrics.vauCount,
      newStakes: endMetrics.stakingCount - startMetrics.stakingCount,
      newTransactions: endMetrics.transactionCount - startMetrics.transactionCount,
      stakedGrowth: endMetrics.totalStaked - startMetrics.totalStaked,
      burnedGrowth: endMetrics.totalBurned - startMetrics.totalBurned,
      revenueGrowth: endMetrics.totalRevenue - startMetrics.totalRevenue
    };
  }

  generateFinalReport(): string {
    return this.generateReport();
  }

  getTotalVAUs(): number {
    return this.metrics.summary.totalVAUs;
  }
}