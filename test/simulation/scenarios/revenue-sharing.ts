/**
 * Revenue Sharing Scenario
 * Simulates revenue distribution between influencers, publishers, and the platform
 */

import { User } from '../actors/user';
import { Influencer } from '../actors/influencer';
import { Publisher } from '../actors/publisher';
import { Advertiser } from '../actors/advertiser';
import { Platform } from '../actors/platform';
import { SimulationMetrics } from '../utils/metrics';

export class RevenueSharingScenario {
  constructor(
    private users: User[],
    private influencers: Influencer[],
    private publishers: Publisher[],
    private advertisers: Advertiser[],
    private platform: Platform,
    private metrics: SimulationMetrics
  ) {}

  async run(): Promise<any> {
    const results = {
      totalRevenue: 0,
      platformShare: 0,
      influencerShare: 0,
      publisherShare: 0,
      userRewards: 0,
      revenueSplits: [] as any[],
      topEarners: {
        influencers: [] as any[],
        publishers: [] as any[]
      }
    };

    console.log('\n  Running revenue sharing simulation...');

    // Calculate ad revenue from campaigns
    const adRevenue = await this.calculateAdRevenue();
    results.totalRevenue = adRevenue.total;

    // Distribute revenue based on attribution
    console.log('  Distributing revenue shares...');
    
    // Process each attribution event
    for (const attribution of adRevenue.attributions) {
      const split = await this.distributeRevenue(attribution);
      results.revenueSplits.push(split);
      
      // Track totals
      results.platformShare += split.platform;
      results.influencerShare += split.influencer;
      results.publisherShare += split.publisher;
      results.userRewards += split.user;
    }

    // Calculate commission distributions
    await this.distributeCommissions();

    // Get top earners
    results.topEarners = await this.getTopEarners();

    // Platform treasury operations
    console.log('  Processing platform treasury operations...');
    await this.processTreasuryOperations(results.platformShare);

    return results;
  }

  private async calculateAdRevenue(): Promise<{ total: number; attributions: any[] }> {
    let total = 0;
    const attributions = [];

    for (const advertiser of this.advertisers) {
      for (const [campaignId, campaign] of advertiser.campaigns) {
        // Revenue from conversions
        const conversionRevenue = campaign.metrics.conversions * campaign.conversionValue;
        
        // Revenue from impressions/clicks (CPM/CPC campaigns)
        const impressionRevenue = (campaign.metrics.impressions / 1000) * 5; // $5 CPM
        const clickRevenue = campaign.metrics.clicks * 0.5; // $0.50 CPC
        
        const campaignRevenue = conversionRevenue + impressionRevenue + clickRevenue;
        total += campaignRevenue;

        // Create attribution records
        if (campaignRevenue > 0) {
          attributions.push({
            campaignId,
            advertiserId: advertiser.id,
            revenue: campaignRevenue,
            metrics: campaign.metrics,
            influencerAttributions: this.getInfluencerAttributions(campaign),
            publisherAttributions: this.getPublisherAttributions(campaign)
          });
        }
      }
    }

    return { total, attributions };
  }

  private async distributeRevenue(attribution: any): Promise<any> {
    const revenue = attribution.revenue;
    
    // Revenue split model
    const splits = {
      platform: 0,
      influencer: 0,
      publisher: 0,
      user: 0
    };

    // Base platform fee: 20%
    splits.platform = revenue * 0.2;
    
    // Remaining 80% to be distributed
    let remaining = revenue * 0.8;

    // Influencer commission (if attributed)
    if (attribution.influencerAttributions.length > 0) {
      const influencerShare = remaining * 0.3; // 30% of remaining
      splits.influencer = influencerShare;
      
      // Distribute among attributed influencers
      for (const infAttr of attribution.influencerAttributions) {
        const influencer = this.influencers.find(i => i.id === infAttr.influencerId);
        if (influencer) {
          const amount = influencerShare * infAttr.weight;
          await influencer.earnFromCampaign(
            attribution.campaignId,
            'revenue_share',
            amount
          );
        }
      }
      
      remaining -= influencerShare;
    }

    // Publisher commission
    if (attribution.publisherAttributions.length > 0) {
      const publisherShare = remaining * 0.4; // 40% of remaining
      splits.publisher = publisherShare;
      
      // Distribute among attributed publishers
      for (const pubAttr of attribution.publisherAttributions) {
        const publisher = this.publishers.find(p => p.id === pubAttr.publisherId);
        if (publisher) {
          const amount = publisherShare * pubAttr.weight;
          await publisher.earnRevenue(amount, 'ad_revenue');
        }
      }
      
      remaining -= publisherShare;
    }

    // User rewards (remaining goes to user reward pool)
    splits.user = remaining;

    return {
      campaignId: attribution.campaignId,
      totalRevenue: revenue,
      ...splits
    };
  }

  private async distributeCommissions(): Promise<void> {
    // Distribute staking commissions to influencers
    for (const influencer of this.influencers) {
      if (influencer.stakingPool.totalStaked > 0) {
        // Commission on staking rewards
        const stakingRewards = influencer.stakingPool.rewardsDistributed;
        const commission = stakingRewards * influencer.stakingPool.commissionRate;
        
        if (commission > 0) {
          await influencer.earnFromStaking(commission);
          
          this.metrics.recordTransaction({
            type: 'commission',
            from: 'staking_pool',
            to: influencer.id,
            amount: commission,
            category: 'staking_commission'
          });
        }
      }
    }

    // Distribute widget commissions to publishers
    for (const publisher of this.publishers) {
      const activeWidgets = Array.from(publisher.widgets.values())
        .filter(w => w.type === 'staking_widget');
      
      for (const widget of activeWidgets) {
        // Commission on stakes through their widget
        const widgetStakes = 50000 * Math.random(); // Simulated
        const commission = widgetStakes * 0.01; // 1% commission
        
        if (commission > 0) {
          await publisher.earnRevenue(commission, 'widget_commission');
        }
      }
    }
  }

  private async processTreasuryOperations(platformRevenue: number): Promise<void> {
    // Split platform revenue according to treasury config
    const floorAmount = platformRevenue * this.platform.config.treasurySplit.floor;
    const operationsAmount = platformRevenue * this.platform.config.treasurySplit.operations;

    // Update treasury balances
    await this.platform.updateTreasury('floor', floorAmount);
    await this.platform.updateTreasury('operations', operationsAmount);

    // Process any necessary burns from operations
    if (this.platform.treasury.operations > 1000000) {
      // Burn excess operations funds
      const burnAmount = this.platform.treasury.operations * 0.1;
      await this.platform.burnTokens(burnAmount, 'excess_operations');
    }
  }

  private getInfluencerAttributions(campaign: any): any[] {
    // Simulate attribution data
    const attributions = [];
    const numInfluencers = Math.floor(Math.random() * 3) + 1;
    
    for (let i = 0; i < numInfluencers; i++) {
      const influencer = this.influencers[Math.floor(Math.random() * this.influencers.length)];
      attributions.push({
        influencerId: influencer.id,
        conversions: Math.floor(campaign.metrics.conversions / numInfluencers),
        weight: 1 / numInfluencers
      });
    }
    
    return attributions;
  }

  private getPublisherAttributions(campaign: any): any[] {
    // Simulate attribution data
    const attributions = [];
    const numPublishers = Math.floor(Math.random() * 2) + 1;
    
    for (let i = 0; i < numPublishers; i++) {
      const publisher = this.publishers[Math.floor(Math.random() * this.publishers.length)];
      attributions.push({
        publisherId: publisher.id,
        impressions: Math.floor(campaign.metrics.impressions / numPublishers),
        weight: 1 / numPublishers
      });
    }
    
    return attributions;
  }

  private async getTopEarners(): Promise<any> {
    // Sort influencers by earnings
    const influencerEarnings = this.influencers.map(inf => ({
      id: inf.id,
      username: inf.profile.username,
      platform: inf.profile.platform,
      earnings: inf.totalEarnings,
      sources: {
        campaigns: inf.campaignEarnings,
        staking: inf.stakingCommissions,
        total: inf.totalEarnings
      }
    })).sort((a, b) => b.earnings - a.earnings);

    // Sort publishers by earnings
    const publisherEarnings = this.publishers.map(pub => ({
      id: pub.id,
      domain: pub.profile.domain,
      earnings: pub.totalEarnings,
      sources: {
        ads: pub.adRevenue,
        rewards: pub.rewardRevenue,
        commissions: pub.commissionRevenue,
        total: pub.totalEarnings
      }
    })).sort((a, b) => b.earnings - a.earnings);

    return {
      influencers: influencerEarnings.slice(0, 5),
      publishers: publisherEarnings.slice(0, 5)
    };
  }
}