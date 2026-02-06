/**
 * Validators for simulation results
 */

export class SimulationValidator {
  private errors: string[] = [];
  private warnings: string[] = [];

  validateResults(results: any): { valid: boolean; errors: string[]; warnings: string[] } {
    this.errors = [];
    this.warnings = [];

    // Validate each scenario
    this.validateEarningFlow(results.scenario1_earnings);
    this.validateStakingFlow(results.scenario2_staking);
    this.validateCampaignAttribution(results.scenario3_campaigns);
    this.validateRevenueSharing(results.scenario4_revenue);
    this.validateTokenEconomics(results.scenario5_economics);

    // Cross-scenario validations
    this.validateCrossScenarioConsistency(results);

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  private validateEarningFlow(earnings: any): void {
    if (!earnings) {
      this.errors.push('Missing earnings scenario results');
      return;
    }

    // Check user participation
    if (earnings.usersWithExtension === 0) {
      this.errors.push('No users have browser extension');
    }

    if (earnings.totalEarned === 0) {
      this.errors.push('No tokens earned from browsing');
    }

    // Check earning rates
    const avgEarningPerUser = earnings.totalEarned / earnings.usersEarning;
    if (avgEarningPerUser < 0.1) {
      this.warnings.push('Average earning per user is very low');
    }

    // Check publisher integration
    if (earnings.publisherSites === 0) {
      this.warnings.push('No publisher sites integrated');
    }

    // Validate VAU processing
    if (earnings.vauProcessed === 0) {
      this.errors.push('No VAUs processed');
    }

    const vauSuccessRate = earnings.vauProcessed / earnings.vauSubmitted;
    if (vauSuccessRate < 0.9) {
      this.warnings.push(`Low VAU success rate: ${(vauSuccessRate * 100).toFixed(1)}%`);
    }
  }

  private validateStakingFlow(staking: any): void {
    if (!staking) {
      this.errors.push('Missing staking scenario results');
      return;
    }

    // Check staking participation
    if (staking.usersStaking === 0) {
      this.errors.push('No users are staking');
    }

    if (staking.totalStaked === 0) {
      this.errors.push('No tokens staked');
    }

    if (staking.activePools === 0) {
      this.errors.push('No active staking pools');
    }

    // Validate APY
    if (staking.avgAPY < 5) {
      this.warnings.push('Average APY is very low');
    }

    if (staking.avgAPY > 100) {
      this.warnings.push('Average APY seems unrealistically high');
    }

    // Check reward distribution
    if (staking.rewardsDistributed === 0 && staking.totalStaked > 0) {
      this.errors.push('No rewards distributed despite active stakes');
    }

    // Validate top influencers
    if (staking.topInfluencers.length === 0) {
      this.warnings.push('No influencer data available');
    } else {
      // Check tier distribution
      const tiers = staking.topInfluencers.map((i: any) => i.tier);
      if (!tiers.includes('PLATINUM') && !tiers.includes('GOLD')) {
        this.warnings.push('No high-tier influencers in the system');
      }
    }
  }

  private validateCampaignAttribution(campaigns: any): void {
    if (!campaigns) {
      this.errors.push('Missing campaign scenario results');
      return;
    }

    // Check campaign creation
    if (campaigns.activeCampaigns === 0) {
      this.errors.push('No active advertising campaigns');
    }

    if (campaigns.totalAdSpend === 0) {
      this.warnings.push('No advertising spend');
    }

    // Validate metrics
    if (campaigns.impressions === 0) {
      this.errors.push('No ad impressions served');
    }

    if (campaigns.clicks === 0 && campaigns.impressions > 0) {
      this.warnings.push('No clicks despite impressions');
    }

    // Check CTR
    if (campaigns.ctr < 0.5) {
      this.warnings.push(`Very low CTR: ${campaigns.ctr.toFixed(2)}%`);
    }

    if (campaigns.ctr > 50) {
      this.errors.push(`Unrealistic CTR: ${campaigns.ctr.toFixed(2)}%`);
    }

    // Check CVR
    if (campaigns.cvr === 0 && campaigns.clicks > 0) {
      this.warnings.push('No conversions despite clicks');
    }

    // Validate influencer commissions
    if (campaigns.influencerCommissions === 0 && campaigns.conversions > 0) {
      this.warnings.push('No influencer commissions despite conversions');
    }
  }

  private validateRevenueSharing(revenue: any): void {
    if (!revenue) {
      this.errors.push('Missing revenue sharing scenario results');
      return;
    }

    // Check revenue generation
    if (revenue.totalRevenue === 0) {
      this.errors.push('No revenue generated');
    }

    // Validate revenue splits
    const totalSplit = revenue.platformShare + revenue.influencerShare + 
                      revenue.publisherShare + revenue.userRewards;
    
    const diff = Math.abs(revenue.totalRevenue - totalSplit);
    if (diff > 1) { // Allow for rounding errors
      this.errors.push(`Revenue split mismatch: ${diff.toFixed(2)}`);
    }

    // Check distribution ratios
    if (revenue.platformShare === 0) {
      this.errors.push('Platform received no revenue share');
    }

    const platformRatio = revenue.platformShare / revenue.totalRevenue;
    if (platformRatio < 0.1 || platformRatio > 0.5) {
      this.warnings.push(`Unusual platform revenue ratio: ${(platformRatio * 100).toFixed(1)}%`);
    }

    // Validate top earners
    if (revenue.topEarners.influencers.length === 0) {
      this.warnings.push('No influencer earnings data');
    }

    if (revenue.topEarners.publishers.length === 0) {
      this.warnings.push('No publisher earnings data');
    }
  }

  private validateTokenEconomics(economics: any): void {
    if (!economics) {
      this.errors.push('Missing token economics scenario results');
      return;
    }

    // Check supply changes
    if (economics.finalSupply >= economics.initialSupply) {
      this.errors.push('Token supply did not decrease (no deflation)');
    }

    if (economics.totalBurned === 0 && economics.totalDecayed === 0) {
      this.errors.push('No tokens burned or decayed');
    }

    // Validate burn events
    if (economics.burnEvents.length === 0) {
      this.warnings.push('No burn events recorded');
    }

    // Check treasury
    if (economics.treasuryBalance.floor < 0) {
      this.errors.push('Treasury floor balance is negative');
    }

    if (economics.treasuryBalance.operations < 0) {
      this.errors.push('Treasury operations balance is negative');
    }

    // Validate supply metrics
    const totalTracked = economics.supplyMetrics.circulating + 
                        economics.supplyMetrics.staked + 
                        economics.supplyMetrics.locked;
    
    const supplyDiff = Math.abs(economics.finalSupply - totalTracked);
    if (supplyDiff > 1000) { // Allow for some discrepancy
      this.warnings.push(`Supply tracking mismatch: ${supplyDiff.toFixed(0)} TWIST`);
    }

    // Check deflation rate
    const deflationRate = ((economics.initialSupply - economics.finalSupply) / 
                          economics.initialSupply) * 100;
    
    if (deflationRate < 0.05) {
      this.warnings.push(`Very low deflation rate: ${deflationRate.toFixed(3)}%`);
    }

    if (deflationRate > 5) {
      this.warnings.push(`Very high deflation rate: ${deflationRate.toFixed(3)}%`);
    }
  }

  private validateCrossScenarioConsistency(results: any): void {
    // Check user consistency
    const earningUsers = results.scenario1_earnings?.usersEarning || 0;
    const stakingUsers = results.scenario2_staking?.usersStaking || 0;
    
    if (stakingUsers > earningUsers) {
      this.warnings.push('More users staking than earning (unusual)');
    }

    // Check token flow consistency
    const totalEarned = results.scenario1_earnings?.totalEarned || 0;
    const totalStaked = results.scenario2_staking?.totalStaked || 0;
    const totalBurned = results.scenario5_economics?.totalBurned || 0;
    
    if (totalStaked > totalEarned * 10) {
      this.warnings.push('Staking amount seems high compared to earnings');
    }

    // Check revenue vs spend
    const adSpend = results.scenario3_campaigns?.totalAdSpend || 0;
    const totalRevenue = results.scenario4_revenue?.totalRevenue || 0;
    
    if (totalRevenue > adSpend * 2) {
      this.warnings.push('Revenue seems high compared to ad spend');
    }

    // Validate influencer participation
    const activeInfluencerPools = results.scenario2_staking?.activePools || 0;
    const influencerEarnings = results.scenario4_revenue?.influencerShare || 0;
    
    if (activeInfluencerPools > 0 && influencerEarnings === 0) {
      this.warnings.push('Active influencer pools but no earnings');
    }

    // Check publisher integration
    const publisherSites = results.scenario1_earnings?.publisherSites || 0;
    const publisherRevenue = results.scenario4_revenue?.publisherShare || 0;
    
    if (publisherSites > 0 && publisherRevenue === 0) {
      this.warnings.push('Active publisher sites but no revenue');
    }
  }

  generateValidationReport(): string {
    const report = [];
    
    report.push('=== SIMULATION VALIDATION REPORT ===\n');
    
    if (this.errors.length === 0) {
      report.push('✅ All validations passed!\n');
    } else {
      report.push(`❌ ${this.errors.length} errors found:\n`);
      this.errors.forEach(error => {
        report.push(`  - ${error}`);
      });
      report.push('');
    }
    
    if (this.warnings.length > 0) {
      report.push(`⚠️  ${this.warnings.length} warnings:\n`);
      this.warnings.forEach(warning => {
        report.push(`  - ${warning}`);
      });
      report.push('');
    }
    
    report.push('=====================================');
    
    return report.join('\n');
  }
}