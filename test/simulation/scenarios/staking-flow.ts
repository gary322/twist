/**
 * Staking Flow Scenario
 * Simulates users staking on influencers and earning rewards
 */

import { User } from '../actors/user';
import { Influencer } from '../actors/influencer';
import { SimulationMetrics } from '../utils/metrics';

export class StakingFlowScenario {
  constructor(
    private users: User[],
    private influencers: Influencer[],
    private metrics: SimulationMetrics
  ) {}

  async run(): Promise<any> {
    const results = {
      usersStaking: 0,
      totalStaked: 0,
      activePools: 0,
      avgAPY: 0,
      rewardsDistributed: 0,
      topInfluencers: [] as any[]
    };

    // Sort influencers by followers (popularity)
    const sortedInfluencers = [...this.influencers].sort((a, b) => b.followers - a.followers);

    // Simulate staking behavior
    console.log('\n  Simulating staking behavior...');

    // 40% of users will stake
    const stakingUsers = this.users.slice(0, 40);

    for (const user of stakingUsers) {
      // User chooses influencer based on various factors
      const influencer = this.selectInfluencer(sortedInfluencers, user);
      
      // Determine stake amount (10-50% of balance)
      const stakePercent = 0.1 + Math.random() * 0.4;
      const stakeAmount = Math.floor(user.balance * stakePercent);

      if (stakeAmount >= 10) { // Minimum stake
        const success = await user.stakeOnInfluencer(influencer, stakeAmount);
        
        if (success) {
          results.usersStaking++;
          results.totalStaked += stakeAmount;
          
          // Update influencer metrics
          await influencer.onUserStake(user.id, stakeAmount);
          
          this.metrics.recordStaking({
            userId: user.id,
            influencerId: influencer.id,
            amount: stakeAmount,
            apy: influencer.stakingPool.apy
          });
        }
      }
    }

    // Calculate pool metrics
    for (const influencer of this.influencers) {
      if (influencer.stakingPool.totalStaked > 0) {
        results.activePools++;
        results.avgAPY += influencer.stakingPool.apy;
      }
    }
    results.avgAPY = results.activePools > 0 ? results.avgAPY / results.activePools : 0;

    // Simulate reward distribution
    console.log('  Distributing staking rewards...');
    results.rewardsDistributed = await this.distributeRewards();

    // Get top influencers
    results.topInfluencers = sortedInfluencers.map(inf => ({
      name: inf.profile.username,
      platform: inf.profile.platform,
      followers: inf.followers,
      tier: inf.calculateTier(),
      totalStaked: inf.stakingPool.totalStaked,
      stakerCount: inf.stakingPool.stakerCount,
      apy: inf.stakingPool.apy
    }));

    return results;
  }

  private selectInfluencer(influencers: Influencer[], user: User): Influencer {
    // Users tend to stake on popular influencers, but some diversify
    const randomFactor = Math.random();
    
    if (randomFactor < 0.6) {
      // 60% stake on top 3 influencers
      return influencers[Math.floor(Math.random() * 3)];
    } else if (randomFactor < 0.9) {
      // 30% stake on mid-tier
      return influencers[3 + Math.floor(Math.random() * 4)];
    } else {
      // 10% stake on smaller influencers
      return influencers[7 + Math.floor(Math.random() * 3)];
    }
  }

  private async distributeRewards(): Promise<number> {
    let totalRewards = 0;

    for (const [userId, user] of this.users.entries()) {
      for (const [influencerId, position] of user.stakingPositions) {
        // Calculate rewards based on APY and time staked
        const timeDays = 1; // Simulate 1 day of rewards
        const dailyRate = position.apy / 365 / 100;
        const rewards = position.amount * dailyRate * timeDays;
        
        position.rewards += rewards;
        totalRewards += rewards;

        this.metrics.recordReward({
          userId: user.id,
          influencerId,
          amount: rewards,
          type: 'staking'
        });
      }
    }

    return totalRewards;
  }
}