/**
 * Mock Advertiser API Client for simulation
 */

import { Campaign, CampaignMetrics, Attribution } from '../types';

export class AdvertiserAPIClient {
  private campaigns = new Map<string, Campaign>();
  private attributions: Attribution[] = [];
  private campaignCounter = 0;

  async createCampaign(params: {
    advertiserId: string;
    name: string;
    type: 'awareness' | 'performance' | 'retargeting';
    budget: number;
    targetingCriteria: any;
    conversionValue?: number;
  }): Promise<Campaign> {
    const campaignId = `camp_${++this.campaignCounter}_${Date.now()}`;
    
    const campaign: Campaign = {
      id: campaignId,
      advertiserId: params.advertiserId,
      name: params.name,
      type: params.type,
      budget: params.budget,
      dailyBudget: params.budget / 30, // 30 day campaign
      spent: 0,
      status: 'active',
      targetingCriteria: params.targetingCriteria,
      creatives: this.generateCreatives(params.type),
      conversionValue: params.conversionValue || 50,
      attributionWindow: 24 * 60 * 60 * 1000, // 24 hours
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
    
    this.campaigns.set(campaignId, campaign);
    return campaign;
  }

  async serveBid(params: {
    campaignId: string;
    slotId: string;
    publisherId: string;
    context: any;
  }): Promise<{ served: boolean; bid: number; creative?: any }> {
    const campaign = this.campaigns.get(params.campaignId);
    if (!campaign || campaign.status !== 'active') {
      return { served: false, bid: 0 };
    }
    
    // Check budget
    if (campaign.spent >= campaign.budget) {
      campaign.status = 'completed';
      return { served: false, bid: 0 };
    }
    
    // Check targeting
    if (!this.matchesTargeting(params.context, campaign.targetingCriteria)) {
      return { served: false, bid: 0 };
    }
    
    // Calculate bid (simplified)
    const baseBid = campaign.type === 'performance' ? 2.0 : 1.0;
    const bid = baseBid + Math.random();
    
    return {
      served: true,
      bid,
      creative: campaign.creatives[Math.floor(Math.random() * campaign.creatives.length)]
    };
  }

  async recordImpression(params: {
    campaignId: string;
    userId: string;
    publisherId: string;
    bid: number;
  }): Promise<void> {
    const campaign = this.campaigns.get(params.campaignId);
    if (!campaign) return;
    
    campaign.metrics.impressions++;
    campaign.spent += params.bid;
    campaign.metrics.spend = campaign.spent;
    
    this.attributions.push({
      campaignId: params.campaignId,
      userId: params.userId,
      event: 'impression',
      timestamp: Date.now(),
      value: params.bid
    });
  }

  async recordClick(params: {
    campaignId: string;
    userId: string;
    influencerId?: string;
  }): Promise<void> {
    const campaign = this.campaigns.get(params.campaignId);
    if (!campaign) return;
    
    campaign.metrics.clicks++;
    campaign.metrics.ctr = (campaign.metrics.clicks / campaign.metrics.impressions) * 100;
    
    this.attributions.push({
      campaignId: params.campaignId,
      userId: params.userId,
      influencerId: params.influencerId,
      event: 'click',
      timestamp: Date.now(),
      value: 0
    });
  }

  async recordConversion(params: {
    campaignId: string;
    userId: string;
    value: number;
    influencerId?: string;
  }): Promise<void> {
    const campaign = this.campaigns.get(params.campaignId);
    if (!campaign) return;
    
    // Check attribution window
    const lastClick = this.attributions
      .filter(a => a.campaignId === params.campaignId && 
                   a.userId === params.userId && 
                   a.event === 'click')
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    
    if (!lastClick || Date.now() - lastClick.timestamp > campaign.attributionWindow) {
      return; // Outside attribution window
    }
    
    campaign.metrics.conversions++;
    campaign.metrics.cvr = (campaign.metrics.conversions / campaign.metrics.clicks) * 100;
    campaign.metrics.cpa = campaign.metrics.spend / campaign.metrics.conversions;
    
    const revenue = campaign.metrics.conversions * campaign.conversionValue;
    campaign.metrics.roi = ((revenue - campaign.metrics.spend) / campaign.metrics.spend) * 100;
    
    this.attributions.push({
      campaignId: params.campaignId,
      userId: params.userId,
      influencerId: params.influencerId || lastClick.influencerId,
      event: 'conversion',
      timestamp: Date.now(),
      value: params.value
    });
  }

  async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics | null> {
    const campaign = this.campaigns.get(campaignId);
    return campaign ? campaign.metrics : null;
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    const campaign = this.campaigns.get(campaignId);
    if (campaign) {
      campaign.status = 'paused';
    }
  }

  async resumeCampaign(campaignId: string): Promise<void> {
    const campaign = this.campaigns.get(campaignId);
    if (campaign && campaign.spent < campaign.budget) {
      campaign.status = 'active';
    }
  }

  async getAttributions(campaignId: string): Promise<Attribution[]> {
    return this.attributions.filter(a => a.campaignId === campaignId);
  }

  private matchesTargeting(context: any, criteria: any): boolean {
    // Simple targeting match
    if (criteria.interests && context.userInterests) {
      const hasMatchingInterest = criteria.interests.some((interest: string) =>
        context.userInterests.includes(interest)
      );
      if (!hasMatchingInterest) return false;
    }
    
    if (criteria.demographics && context.demographics) {
      if (criteria.demographics.age) {
        const [minAge, maxAge] = criteria.demographics.age.split('-').map(Number);
        if (context.demographics.age < minAge || context.demographics.age > maxAge) {
          return false;
        }
      }
    }
    
    return true;
  }

  private generateCreatives(type: string): any[] {
    const creatives = [];
    const numCreatives = 2 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < numCreatives; i++) {
      creatives.push({
        id: `creative_${i + 1}`,
        type: type === 'awareness' ? 'display' : 'native',
        headline: `${type} Campaign Creative ${i + 1}`,
        description: 'Earn rewards while browsing with TWIST',
        cta: type === 'performance' ? 'Sign Up Now' : 'Learn More',
        image: `https://cdn.example.com/creative_${type}_${i}.jpg`
      });
    }
    
    return creatives;
  }

  getCampaignCount(): number {
    return this.campaigns.size;
  }

  getActiveCampaigns(): Campaign[] {
    return Array.from(this.campaigns.values()).filter(c => c.status === 'active');
  }

  async createAdvertiserAccount(params: {
    advertiserId: string;
    company: string;
    industry: string;
    website: string;
  }): Promise<{ success: boolean; accountId?: string }> {
    // Simulate account creation
    return {
      success: true,
      accountId: `account_${params.advertiserId}_${Date.now()}`
    };
  }
}