/**
 * Mock Publisher API Client for simulation
 */

import { Widget, AdSlot } from '../types';

export class PublisherAPIClient {
  private widgets = new Map<string, Widget>();
  private adSlots = new Map<string, AdSlot>();
  private analytics = new Map<string, any>();

  async createWidget(params: {
    publisherId: string;
    type: 'reward_banner' | 'staking_widget' | 'leaderboard';
    config: any;
  }): Promise<Widget> {
    const widgetId = `widget_${this.widgets.size + 1}_${Date.now()}`;
    
    const widget: Widget = {
      id: widgetId,
      publisherId: params.publisherId,
      type: params.type,
      config: {
        position: params.config.position || 'bottom-right',
        theme: params.config.theme || 'light',
        showEarnings: params.config.showEarnings !== false,
        autoHide: params.config.autoHide || false
      },
      script: this.generateWidgetScript(widgetId, params.type),
      createdAt: Date.now()
    };
    
    this.widgets.set(widgetId, widget);
    return widget;
  }

  async createAdSlot(params: {
    publisherId: string;
    size: string;
    position: string;
    minBid: number;
  }): Promise<AdSlot> {
    const slotId = `slot_${this.adSlots.size + 1}_${Date.now()}`;
    
    const adSlot: AdSlot = {
      id: slotId,
      publisherId: params.publisherId,
      size: params.size,
      position: params.position,
      minBid: params.minBid,
      allowedFormats: ['display', 'native', 'video'],
      createdAt: Date.now()
    };
    
    this.adSlots.set(slotId, adSlot);
    return adSlot;
  }

  async getPublisherStats(publisherId: string): Promise<any> {
    const stats = this.analytics.get(publisherId) || {
      visits: 0,
      uniqueVisitors: 0,
      pageViews: 0,
      earnings: 0
    };
    
    // Simulate some activity
    stats.visits += Math.floor(Math.random() * 1000);
    stats.uniqueVisitors += Math.floor(Math.random() * 800);
    stats.pageViews += Math.floor(Math.random() * 2000);
    stats.earnings += Math.random() * 100;
    
    this.analytics.set(publisherId, stats);
    return stats;
  }

  async getWidgetPerformance(widgetId: string): Promise<any> {
    const widget = this.widgets.get(widgetId);
    if (!widget) {
      throw new Error('Widget not found');
    }
    
    return {
      impressions: 1000 + Math.floor(Math.random() * 9000),
      interactions: 50 + Math.floor(Math.random() * 450),
      conversions: 5 + Math.floor(Math.random() * 45),
      earnings: Math.random() * 50,
      ctr: 5 + Math.random() * 10,
      conversionRate: 1 + Math.random() * 5
    };
  }

  async updateWidgetConfig(widgetId: string, config: any): Promise<Widget> {
    const widget = this.widgets.get(widgetId);
    if (!widget) {
      throw new Error('Widget not found');
    }
    
    widget.config = { ...widget.config, ...config };
    return widget;
  }

  async trackPageView(params: {
    publisherId: string;
    pageUrl: string;
    userId?: string;
    referrer?: string;
  }): Promise<void> {
    const stats = this.analytics.get(params.publisherId) || {
      visits: 0,
      uniqueVisitors: 0,
      pageViews: 0,
      earnings: 0
    };
    
    stats.pageViews++;
    if (params.userId) {
      stats.uniqueVisitors++;
    }
    
    this.analytics.set(params.publisherId, stats);
  }

  async getAdSlotBids(slotId: string): Promise<any[]> {
    const slot = this.adSlots.get(slotId);
    if (!slot) {
      return [];
    }
    
    // Generate mock bids
    const numBids = Math.floor(Math.random() * 5);
    const bids = [];
    
    for (let i = 0; i < numBids; i++) {
      bids.push({
        advertiserId: `adv_${Math.floor(Math.random() * 100)}`,
        campaignId: `camp_${Math.floor(Math.random() * 100)}`,
        bid: slot.minBid + Math.random() * 5,
        creative: {
          type: 'display',
          url: `https://cdn.example.com/ad_${i}.jpg`
        }
      });
    }
    
    return bids.sort((a, b) => b.bid - a.bid);
  }

  private generateWidgetScript(widgetId: string, type: string): string {
    return `
(function() {
  var script = document.createElement('script');
  script.src = 'https://cdn.twist.com/widgets/${type}.js';
  script.setAttribute('data-widget-id', '${widgetId}');
  script.async = true;
  document.head.appendChild(script);
})();
    `.trim();
  }

  getWidgetCount(): number {
    return this.widgets.size;
  }

  getAdSlotCount(): number {
    return this.adSlots.size;
  }

  async registerPublisher(params: {
    publisherId: string;
    domain: string;
    category: string;
  }): Promise<{ success: boolean; verified: boolean }> {
    // Simulate publisher registration
    return {
      success: true,
      verified: Math.random() > 0.2 // 80% get verified
    };
  }

  async withdrawEarnings(params: {
    publisherId: string;
    amount: number;
    walletAddress: string;
  }): Promise<{ success: boolean; transactionId?: string }> {
    // Simulate withdrawal
    if (params.amount <= 0) {
      return { success: false };
    }
    
    return {
      success: true,
      transactionId: `withdrawal_${Date.now()}_${params.publisherId}`
    };
  }
}