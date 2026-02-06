/**
 * Mock Analytics Client for simulation
 */

export class AnalyticsClient {
  private events: any[] = [];

  async trackEvent(event: {
    type: string;
    userId?: string;
    data: any;
  }): Promise<void> {
    this.events.push({
      ...event,
      timestamp: Date.now(),
      id: `event_${this.events.length + 1}`
    });
  }

  async batchTrackEvents(events: any[]): Promise<void> {
    for (const event of events) {
      await this.trackEvent(event);
    }
  }

  async getMetrics(params: {
    metric: string;
    timeframe: string;
    dimensions?: string[];
  }): Promise<any> {
    // Return mock metrics based on request
    switch (params.metric) {
      case 'active_users':
        return {
          value: 10000 + Math.floor(Math.random() * 5000),
          trend: Math.random() > 0.5 ? 'up' : 'down',
          change: (Math.random() * 20 - 10).toFixed(1)
        };
      
      case 'staking_volume':
        return {
          value: 1000000 + Math.floor(Math.random() * 500000),
          pools: 50 + Math.floor(Math.random() * 20),
          avgStake: 5000 + Math.floor(Math.random() * 2000)
        };
      
      case 'token_velocity':
        return {
          velocity: 0.5 + Math.random() * 0.3,
          transactions: 50000 + Math.floor(Math.random() * 20000),
          volume: 2000000 + Math.floor(Math.random() * 1000000)
        };
      
      default:
        return { value: Math.random() * 1000 };
    }
  }

  async getUserSegments(userId: string): Promise<string[]> {
    // Return mock user segments
    const allSegments = [
      'active_earner',
      'frequent_staker',
      'high_value',
      'early_adopter',
      'power_user',
      'casual_browser',
      'whale',
      'influencer_follower'
    ];
    
    const numSegments = 1 + Math.floor(Math.random() * 3);
    const segments = [];
    
    for (let i = 0; i < numSegments; i++) {
      const segment = allSegments[Math.floor(Math.random() * allSegments.length)];
      if (!segments.includes(segment)) {
        segments.push(segment);
      }
    }
    
    return segments;
  }

  async getInfluencerMetrics(influencerId: string): Promise<any> {
    return {
      totalStaked: 100000 + Math.floor(Math.random() * 900000),
      stakerCount: 10 + Math.floor(Math.random() * 190),
      avgStakeSize: 1000 + Math.floor(Math.random() * 9000),
      churnRate: Math.random() * 0.1,
      growthRate: Math.random() * 0.3 - 0.1,
      engagementScore: 0.5 + Math.random() * 0.5
    };
  }

  async getCampaignMetrics(campaignId: string): Promise<any> {
    return {
      impressions: 10000 + Math.floor(Math.random() * 90000),
      clicks: 100 + Math.floor(Math.random() * 900),
      conversions: 10 + Math.floor(Math.random() * 90),
      spend: 1000 + Math.floor(Math.random() * 9000),
      roi: Math.random() * 3 - 0.5,
      attributedInfluencers: Math.floor(Math.random() * 5)
    };
  }

  getEventCount(): number {
    return this.events.length;
  }

  clearEvents(): void {
    this.events = [];
  }
}