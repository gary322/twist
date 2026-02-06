/**
 * Influencer Actor - Represents an influencer with a staking pool
 * Earns commission from campaigns and shares revenue with stakers
 */

import { InfluencerProfile, StakingPool, Campaign } from '../types';
import { BlockchainClient } from '../clients/blockchain-client';
import { AnalyticsClient } from '../clients/analytics-client';

export class Influencer {
  public id: string;
  public profile: InfluencerProfile;
  public stakingPool: StakingPool;
  public campaigns: Map<string, Campaign> = new Map();
  public totalEarned: number = 0;
  public followers: number;
  public totalEarnings: number = 0;
  public campaignEarnings: number = 0;
  public stakingCommissions: number = 0;
  public balance: number = 0;

  private blockchainClient: BlockchainClient;
  private analyticsClient: AnalyticsClient;

  constructor(profile: InfluencerProfile) {
    this.id = profile.id;
    this.profile = profile;
    this.followers = profile.followers;
    this.blockchainClient = new BlockchainClient();
    this.analyticsClient = new AnalyticsClient();
  }

  async createStakingPool(): Promise<boolean> {
    try {
      // Create on-chain staking pool
      const poolData = {
        influencerId: this.id,
        tier: this.calculateTier(),
        commissionRate: this.getCommissionRate(),
        minStake: 10, // 10 TWIST minimum
        lockPeriod: 7 * 24 * 60 * 60 // 7 days
      };

      const tx = await this.blockchainClient.createStakingPool(poolData);

      if (tx.success) {
        this.stakingPool = {
          address: tx.poolAddress,
          influencerId: this.id,
          totalStaked: 0,
          stakerCount: 0,
          apy: this.calculateAPY(),
          tier: poolData.tier,
          commissionRate: poolData.commissionRate,
          rewardsDistributed: 0,
          createdAt: Date.now()
        };
        return true;
      }
    } catch (error) {
      console.error('Failed to create staking pool:', error);
    }
    return false;
  }

  calculateTier(): 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' {
    if (this.followers >= 1000000) return 'PLATINUM';
    if (this.followers >= 100000) return 'GOLD';
    if (this.followers >= 10000) return 'SILVER';
    return 'BRONZE';
  }

  private getCommissionRate(): number {
    // Commission rate based on tier
    const tier = this.calculateTier();
    switch (tier) {
      case 'PLATINUM': return 0.4; // 40%
      case 'GOLD': return 0.3; // 30%
      case 'SILVER': return 0.2; // 20%
      case 'BRONZE': return 0.15; // 15%
      default: return 0.1;
    }
  }

  private calculateAPY(): number {
    // Base APY + tier bonus
    const baseAPY = 10;
    const tierBonus = {
      'PLATINUM': 15,
      'GOLD': 10,
      'SILVER': 5,
      'BRONZE': 0
    };
    
    return baseAPY + tierBonus[this.calculateTier()];
  }

  async onUserStake(userId: string, amount: number): Promise<void> {
    this.stakingPool.totalStaked += amount;
    this.stakingPool.stakerCount++;
    
    // Update pool metrics
    await this.analyticsClient.trackEvent({
      type: 'influencer.stake',
      data: {
        influencerId: this.id,
        userId,
        amount,
        poolMetrics: {
          totalStaked: this.stakingPool.totalStaked,
          stakerCount: this.stakingPool.stakerCount,
          apy: this.stakingPool.apy
        }
      }
    });
  }

  async onUserUnstake(userId: string, amount: number): Promise<void> {
    this.stakingPool.totalStaked -= amount;
    this.stakingPool.stakerCount--;
    
    await this.analyticsClient.trackEvent({
      type: 'influencer.unstake',
      data: {
        influencerId: this.id,
        userId,
        amount,
        poolMetrics: {
          totalStaked: this.stakingPool.totalStaked,
          stakerCount: this.stakingPool.stakerCount
        }
      }
    });
  }

  async earnFromCampaign(campaignId: string, eventType: string, value: number): Promise<number> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return 0;

    let earnings = 0;
    
    switch (eventType) {
      case 'impression':
        earnings = value * 0.001; // $0.001 per impression
        break;
      case 'click':
        earnings = value * 0.1; // $0.10 per click
        break;
      case 'conversion':
        earnings = value * campaign.conversionValue * this.stakingPool.commissionRate;
        break;
    }

    this.totalEarned += earnings;
    this.campaignEarnings += earnings;
    this.totalEarnings += earnings;
    this.balance += earnings * 0.3; // Influencer keeps 30%

    // Distribute to stakers
    if (this.stakingPool.totalStaked > 0) {
      const stakerShare = earnings * 0.7; // 70% to stakers, 30% to influencer
      await this.distributeRewards(stakerShare);
    }

    return earnings;
  }

  private async distributeRewards(amount: number): Promise<void> {
    // In real implementation, this would distribute proportionally to all stakers
    this.stakingPool.rewardsDistributed += amount;
    
    await this.analyticsClient.trackEvent({
      type: 'influencer.rewards.distributed',
      data: {
        influencerId: this.id,
        amount,
        stakerCount: this.stakingPool.stakerCount,
        totalStaked: this.stakingPool.totalStaked
      }
    });
  }

  async promoteContent(content: any): Promise<{ impressions: number; clicks: number }> {
    // Simulate content promotion to followers
    const reachRate = 0.3; // 30% of followers see the content
    const engagementRate = this.getEngagementRate();
    
    const impressions = Math.floor(this.followers * reachRate);
    const clicks = Math.floor(impressions * engagementRate);

    await this.analyticsClient.trackEvent({
      type: 'influencer.content.promoted',
      data: {
        influencerId: this.id,
        contentId: content.id,
        impressions,
        clicks,
        followers: this.followers
      }
    });

    return { impressions, clicks };
  }

  async earnFromStaking(commission: number): Promise<void> {
    this.balance += commission;
    this.stakingCommissions += commission;
    this.totalEarnings += commission;
  }

  private getEngagementRate(): number {
    // Engagement rate based on tier
    const tier = this.calculateTier();
    const baseRate = 0.02; // 2% base
    const tierMultiplier = {
      'PLATINUM': 2.5,
      'GOLD': 2.0,
      'SILVER': 1.5,
      'BRONZE': 1.0
    };
    
    return baseRate * tierMultiplier[tier];
  }

  async joinCampaign(campaign: Campaign): Promise<boolean> {
    if (campaign.targetingCriteria.minFollowers > this.followers) {
      return false; // Doesn't meet criteria
    }

    this.campaigns.set(campaign.id, campaign);
    
    await this.analyticsClient.trackEvent({
      type: 'influencer.campaign.joined',
      data: {
        influencerId: this.id,
        campaignId: campaign.id,
        followers: this.followers,
        tier: this.calculateTier()
      }
    });

    return true;
  }

  getMetrics(): any {
    return {
      influencerId: this.id,
      username: this.profile.username,
      platform: this.profile.platform,
      followers: this.followers,
      tier: this.calculateTier(),
      stakingPool: {
        totalStaked: this.stakingPool.totalStaked,
        stakerCount: this.stakingPool.stakerCount,
        apy: this.stakingPool.apy,
        rewardsDistributed: this.stakingPool.rewardsDistributed
      },
      totalEarned: this.totalEarned,
      activeCampaigns: this.campaigns.size
    };
  }
}