/**
 * Advertiser Actor - Represents an advertiser running campaigns
 * Creates campaigns, targets users/influencers, and tracks attribution
 */

import { AdvertiserProfile, Campaign, CampaignMetrics, Attribution } from '../types';
import { AdvertiserAPIClient } from '../clients/advertiser-api-client';
import { AnalyticsClient } from '../clients/analytics-client';

export class Advertiser {
  public id: string;
  public profile: AdvertiserProfile;
  public campaigns: Map<string, Campaign> = new Map();
  public totalSpent: number = 0;
  public balance: number = 0;
  public attributions: Attribution[] = [];

  private apiClient: AdvertiserAPIClient;
  private analyticsClient: AnalyticsClient;

  constructor(profile: AdvertiserProfile) {
    this.id = profile.id;
    this.profile = profile;
    this.apiClient = new AdvertiserAPIClient();
    this.analyticsClient = new AnalyticsClient();
  }

  async createAccount(): Promise<boolean> {
    try {
      const account = await this.apiClient.createAdvertiserAccount({
        advertiserId: this.id,
        company: this.profile.company,
        industry: this.profile.industry,
        website: this.profile.website
      });

      if (account.success) {
        // Initial budget deposit
        this.balance = 10000; // 10,000 TWIST initial budget
        
        await this.analyticsClient.trackEvent({
          type: 'advertiser.account.created',
          data: {
            advertiserId: this.id,
            company: this.profile.company,
            initialBudget: this.balance
          }
        });

        return true;
      }
    } catch (error) {
      console.error('Account creation failed:', error);
    }
    return false;
  }

  async createCampaign(config: any): Promise<Campaign | null> {
    if (config.budget > this.balance) {
      console.error('Insufficient balance for campaign');
      return null;
    }

    const campaign: Campaign = {
      id: `campaign_${Date.now()}`,
      advertiserId: this.id,
      name: config.name,
      type: config.type || 'performance',
      budget: config.budget,
      dailyBudget: config.budget / 30, // 30-day campaign
      spent: 0,
      status: 'active',
      targetingCriteria: {
        interests: config.targeting?.interests || [],
        demographics: config.targeting?.demographics || {},
        geoTargeting: config.targeting?.geo || [],
        minFollowers: config.targeting?.minFollowers || 0
      },
      creatives: config.creatives || [],
      conversionValue: config.conversionValue || 10,
      attributionWindow: config.attributionWindow || 7 * 24 * 60 * 60 * 1000, // 7 days
      metrics: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        spend: 0,
        ctr: 0,
        cvr: 0,
        cpa: 0,
        roi: 0
      },
      createdAt: Date.now()
    };

    this.campaigns.set(campaign.id, campaign);
    this.balance -= campaign.budget;

    await this.analyticsClient.trackEvent({
      type: 'advertiser.campaign.created',
      data: {
        advertiserId: this.id,
        campaignId: campaign.id,
        budget: campaign.budget,
        targeting: campaign.targetingCriteria
      }
    });

    return campaign;
  }

  async serveCampaignImpression(
    campaignId: string, 
    userId: string, 
    context: any
  ): Promise<{ served: boolean; bid: number }> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status !== 'active') {
      return { served: false, bid: 0 };
    }

    // Check daily budget
    if (campaign.spent >= campaign.dailyBudget) {
      return { served: false, bid: 0 };
    }

    // Calculate bid based on context
    const baseBid = 0.001; // Base CPM
    const qualityScore = this.calculateQualityScore(campaign, context);
    const bid = baseBid * qualityScore;

    campaign.metrics.impressions++;
    campaign.spent += bid;
    this.totalSpent += bid;

    await this.analyticsClient.trackEvent({
      type: 'advertiser.impression',
      data: {
        advertiserId: this.id,
        campaignId,
        userId,
        bid,
        context
      }
    });

    return { served: true, bid };
  }

  async trackClick(campaignId: string, userId: string, influencerId?: string): Promise<void> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;

    campaign.metrics.clicks++;
    campaign.metrics.ctr = (campaign.metrics.clicks / campaign.metrics.impressions) * 100;

    const clickCost = 0.1; // $0.10 CPC
    campaign.spent += clickCost;
    this.totalSpent += clickCost;

    // Track attribution
    const attribution: Attribution = {
      campaignId,
      userId,
      influencerId,
      event: 'click',
      timestamp: Date.now(),
      value: clickCost
    };
    this.attributions.push(attribution);

    await this.analyticsClient.trackEvent({
      type: 'advertiser.click',
      data: {
        advertiserId: this.id,
        campaignId,
        userId,
        influencerId,
        cost: clickCost
      }
    });
  }

  async trackConversion(
    campaignId: string, 
    userId: string, 
    value: number,
    influencerId?: string
  ): Promise<void> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;

    // Check attribution window
    const lastClick = this.attributions.find(
      a => a.campaignId === campaignId && 
           a.userId === userId && 
           a.event === 'click' &&
           Date.now() - a.timestamp <= campaign.attributionWindow
    );

    if (!lastClick) {
      return; // No valid attribution
    }

    campaign.metrics.conversions++;
    campaign.metrics.cvr = (campaign.metrics.conversions / campaign.metrics.clicks) * 100;
    
    const conversionCost = value * 0.1; // 10% of conversion value
    campaign.spent += conversionCost;
    this.totalSpent += conversionCost;

    // Calculate metrics
    campaign.metrics.cpa = campaign.spent / campaign.metrics.conversions;
    campaign.metrics.roi = ((value * campaign.metrics.conversions) - campaign.spent) / campaign.spent;

    // Pay influencer commission if applicable
    let influencerCommission = 0;
    if (influencerId) {
      influencerCommission = value * 0.05; // 5% to influencer
      await this.payInfluencerCommission(influencerId, influencerCommission);
    }

    await this.analyticsClient.trackEvent({
      type: 'advertiser.conversion',
      data: {
        advertiserId: this.id,
        campaignId,
        userId,
        influencerId,
        value,
        cost: conversionCost,
        influencerCommission
      }
    });
  }

  private async payInfluencerCommission(influencerId: string, amount: number): Promise<void> {
    // In real implementation, this would transfer TWIST to influencer
    await this.analyticsClient.trackEvent({
      type: 'advertiser.commission.paid',
      data: {
        advertiserId: this.id,
        influencerId,
        amount
      }
    });
  }

  private calculateQualityScore(campaign: Campaign, context: any): number {
    let score = 1.0;

    // Interest match
    if (context.userInterests) {
      const matchingInterests = campaign.targetingCriteria.interests.filter(
        i => context.userInterests.includes(i)
      ).length;
      score *= (1 + matchingInterests * 0.2);
    }

    // Historical performance
    if (campaign.metrics.ctr > 2) score *= 1.5;
    if (campaign.metrics.cvr > 1) score *= 2.0;

    return Math.min(score, 5.0); // Cap at 5x
  }

  async pauseCampaign(campaignId: string): Promise<boolean> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return false;

    campaign.status = 'paused';
    
    await this.analyticsClient.trackEvent({
      type: 'advertiser.campaign.paused',
      data: {
        advertiserId: this.id,
        campaignId,
        spent: campaign.spent,
        metrics: campaign.metrics
      }
    });

    return true;
  }

  async optimizeCampaigns(): Promise<void> {
    // Auto-optimize campaigns based on performance
    for (const [id, campaign] of this.campaigns) {
      if (campaign.status !== 'active') continue;

      // Pause underperforming campaigns
      if (campaign.metrics.roi < -0.5 && campaign.metrics.impressions > 1000) {
        await this.pauseCampaign(id);
        console.log(`Paused underperforming campaign: ${id}`);
      }

      // Increase budget for high performers
      if (campaign.metrics.roi > 2.0 && campaign.spent > campaign.budget * 0.5) {
        const additionalBudget = campaign.budget * 0.5;
        if (additionalBudget <= this.balance) {
          campaign.budget += additionalBudget;
          this.balance -= additionalBudget;
          console.log(`Increased budget for campaign: ${id}`);
        }
      }
    }
  }

  async trackCampaign(campaignId: string, action: string): Promise<void> {
    await this.analyticsClient.trackEvent({
      type: `advertiser.campaign.${action}`,
      data: {
        advertiserId: this.id,
        campaignId,
        action
      }
    });
  }

  getMetrics(): any {
    const activeCampaigns = Array.from(this.campaigns.values())
      .filter(c => c.status === 'active');

    const totalMetrics = activeCampaigns.reduce((acc, campaign) => ({
      impressions: acc.impressions + campaign.metrics.impressions,
      clicks: acc.clicks + campaign.metrics.clicks,
      conversions: acc.conversions + campaign.metrics.conversions,
      spend: acc.spend + campaign.spent
    }), { impressions: 0, clicks: 0, conversions: 0, spend: 0 });

    return {
      advertiserId: this.id,
      company: this.profile.company,
      balance: this.balance,
      totalSpent: this.totalSpent,
      activeCampaigns: activeCampaigns.length,
      totalCampaigns: this.campaigns.size,
      metrics: {
        ...totalMetrics,
        avgCTR: totalMetrics.impressions > 0 ? 
          (totalMetrics.clicks / totalMetrics.impressions * 100).toFixed(2) : 0,
        avgCVR: totalMetrics.clicks > 0 ? 
          (totalMetrics.conversions / totalMetrics.clicks * 100).toFixed(2) : 0,
        avgCPA: totalMetrics.conversions > 0 ? 
          (totalMetrics.spend / totalMetrics.conversions).toFixed(2) : 0
      }
    };
  }
}