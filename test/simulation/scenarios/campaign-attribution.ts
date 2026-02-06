/**
 * Campaign Attribution Scenario
 * Simulates advertiser campaigns, user interactions, and attribution tracking
 */

import { User } from '../actors/user';
import { Influencer } from '../actors/influencer';
import { Advertiser } from '../actors/advertiser';
import { SimulationMetrics } from '../utils/metrics';

export class CampaignAttributionScenario {
  constructor(
    private advertisers: Advertiser[],
    private users: User[],
    private influencers: Influencer[],
    private metrics: SimulationMetrics
  ) {}

  async run(): Promise<any> {
    const results = {
      activeCampaigns: 0,
      totalAdSpend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      cvr: 0,
      influencerCommissions: 0
    };

    // Create campaigns for each advertiser
    console.log('\n  Creating advertising campaigns...');
    for (const advertiser of this.advertisers) {
      await this.createCampaignsForAdvertiser(advertiser);
      results.activeCampaigns += Array.from(advertiser.campaigns.values())
        .filter(c => c.status === 'active').length;
    }

    // Run campaign interactions
    console.log('  Running campaign interactions...');
    
    // Simulate impressions
    const impressionResults = await this.simulateImpressions();
    results.impressions = impressionResults.total;

    // Simulate clicks (10-20% CTR for targeted campaigns)
    const clickResults = await this.simulateClicks(impressionResults.userImpressions);
    results.clicks = clickResults.total;
    results.ctr = (results.clicks / results.impressions) * 100;

    // Simulate conversions (2-5% CVR)
    const conversionResults = await this.simulateConversions(clickResults.userClicks);
    results.conversions = conversionResults.total;
    results.cvr = (results.conversions / results.clicks) * 100;
    results.influencerCommissions = conversionResults.influencerCommissions;

    // Calculate total ad spend
    for (const advertiser of this.advertisers) {
      results.totalAdSpend += advertiser.totalSpent;
    }

    return results;
  }

  private async createCampaignsForAdvertiser(advertiser: Advertiser): Promise<void> {
    // Create different types of campaigns
    const campaignTypes = [
      {
        name: 'Brand Awareness Campaign',
        type: 'awareness',
        budget: 5000,
        targeting: {
          interests: ['crypto', 'defi', 'blockchain'],
          minFollowers: 10000
        },
        conversionValue: 0
      },
      {
        name: 'User Acquisition Campaign',
        type: 'performance',
        budget: 10000,
        targeting: {
          interests: ['gaming', 'earning', 'rewards'],
          demographics: { age: '18-35' },
          minFollowers: 5000
        },
        conversionValue: 50
      },
      {
        name: 'Retargeting Campaign',
        type: 'retargeting',
        budget: 3000,
        targeting: {
          interests: ['crypto'],
          minFollowers: 1000
        },
        conversionValue: 100
      }
    ];

    // Create 1-2 campaigns per advertiser
    const numCampaigns = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < numCampaigns; i++) {
      const config = campaignTypes[i % campaignTypes.length];
      await advertiser.createCampaign(config);
    }
  }

  private async simulateImpressions(): Promise<{ total: number; userImpressions: Map<string, any[]> }> {
    const userImpressions = new Map<string, any[]>();
    let total = 0;

    // Each user sees 5-20 ads
    for (const user of this.users) {
      const numAds = Math.floor(Math.random() * 15) + 5;
      const impressions = [];

      for (let i = 0; i < numAds; i++) {
        // Select random advertiser and campaign
        const advertiser = this.advertisers[Math.floor(Math.random() * this.advertisers.length)];
        const campaigns = Array.from(advertiser.campaigns.values()).filter(c => c.status === 'active');
        
        if (campaigns.length === 0) continue;
        
        const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
        
        // Check if user matches targeting
        const context = {
          userInterests: user.profile.interests,
          demographics: user.profile.demographics
        };

        const result = await advertiser.serveCampaignImpression(campaign.id, user.id, context);
        
        if (result.served) {
          impressions.push({
            advertiserId: advertiser.id,
            campaignId: campaign.id,
            bid: result.bid,
            timestamp: Date.now()
          });
          total++;
        }
      }

      userImpressions.set(user.id, impressions);
    }

    return { total, userImpressions };
  }

  private async simulateClicks(userImpressions: Map<string, any[]>): Promise<{ total: number; userClicks: Map<string, any[]> }> {
    const userClicks = new Map<string, any[]>();
    let total = 0;

    for (const [userId, impressions] of userImpressions) {
      const clicks = [];
      
      for (const impression of impressions) {
        // Base CTR 2%, with modifications
        let ctr = 0.02;
        
        // Influencer promotion increases CTR
        const influencerPromotion = Math.random() < 0.3;
        if (influencerPromotion) {
          ctr *= 2.5; // 150% increase
        }

        if (Math.random() < ctr) {
          const advertiser = this.advertisers.find(a => a.id === impression.advertiserId);
          const influencer = influencerPromotion ? 
            this.influencers[Math.floor(Math.random() * this.influencers.length)] : null;

          if (advertiser) {
            await advertiser.trackClick(
              impression.campaignId, 
              userId, 
              influencer?.id
            );

            clicks.push({
              ...impression,
              influencerId: influencer?.id,
              clickTime: Date.now()
            });
            total++;
          }
        }
      }

      userClicks.set(userId, clicks);
    }

    return { total, userClicks };
  }

  private async simulateConversions(userClicks: Map<string, any[]>): Promise<{ total: number; influencerCommissions: number }> {
    let total = 0;
    let influencerCommissions = 0;

    for (const [userId, clicks] of userClicks) {
      for (const click of clicks) {
        // Base conversion rate 2%
        let cvr = 0.02;
        
        // Influencer referrals convert better
        if (click.influencerId) {
          cvr *= 3; // 200% increase
        }

        if (Math.random() < cvr) {
          const advertiser = this.advertisers.find(a => a.id === click.advertiserId);
          const campaign = advertiser?.campaigns.get(click.campaignId);
          
          if (advertiser && campaign) {
            const conversionValue = campaign.conversionValue || 50;
            
            await advertiser.trackConversion(
              click.campaignId,
              userId,
              conversionValue,
              click.influencerId
            );

            // Track influencer commission
            if (click.influencerId) {
              const commission = conversionValue * 0.05; // 5% to influencer
              influencerCommissions += commission;
              
              // Find influencer and credit them
              const influencer = this.influencers.find(i => i.id === click.influencerId);
              if (influencer) {
                await influencer.earnFromCampaign(click.campaignId, 'conversion', conversionValue);
              }
            }

            total++;
          }
        }
      }
    }

    return { total, influencerCommissions };
  }
}