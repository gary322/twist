/**
 * Publisher Actor - Represents a website publisher
 * Integrates TWIST widgets and earns commission from user visits
 */

import { PublisherProfile, Widget, AdSlot } from '../types';
import { PublisherAPIClient } from '../clients/publisher-api-client';
import { AnalyticsClient } from '../clients/analytics-client';

export class Publisher {
  public id: string;
  public profile: PublisherProfile;
  public widgets: Map<string, Widget> = new Map();
  public adSlots: Map<string, AdSlot> = new Map();
  public totalEarnings: number = 0;
  public dailyVisitors: number = 0;
  public isVerified: boolean = false;
  public adRevenue: number = 0;
  public rewardRevenue: number = 0;
  public commissionRevenue: number = 0;
  public balance: number = 0;

  private apiClient: PublisherAPIClient;
  private analyticsClient: AnalyticsClient;

  constructor(profile: PublisherProfile) {
    this.id = profile.id;
    this.profile = profile;
    this.apiClient = new PublisherAPIClient();
    this.analyticsClient = new AnalyticsClient();
    this.balance = (profile as any).balance || 1000; // Initial balance
  }

  async registerDomain(): Promise<boolean> {
    try {
      const registration = await this.apiClient.registerPublisher({
        publisherId: this.id,
        domain: this.profile.domain,
        category: this.profile.category
      });

      if (registration.success) {
        this.isVerified = registration.verified;
        
        // Generate widget code
        await this.generateWidget();
        
        return true;
      }
    } catch (error) {
      console.error('Domain registration failed:', error);
    }
    return false;
  }

  private async generateWidget(): Promise<void> {
    const widget: Widget = {
      id: `widget_${this.id}`,
      publisherId: this.id,
      type: 'reward_banner',
      config: {
        position: 'bottom-right',
        theme: 'dark',
        showEarnings: true,
        autoHide: false
      },
      script: `<script src="https://cdn.twist.io/widget.js" data-publisher="${this.id}"></script>`,
      createdAt: Date.now()
    };

    this.widgets.set(widget.id, widget);
  }

  async integrateWidget(): Promise<boolean> {
    if (!this.isVerified) {
      console.error('Publisher not verified');
      return false;
    }

    // Simulate widget integration
    const widget = Array.from(this.widgets.values())[0];
    if (!widget) return false;

    await this.analyticsClient.trackEvent({
      type: 'publisher.widget.integrated',
      data: {
        publisherId: this.id,
        widgetId: widget.id,
        domain: this.profile.domain
      }
    });

    return true;
  }

  async onUserVisit(userId: string, timeSpent: number): Promise<number> {
    this.dailyVisitors++;

    // Calculate publisher commission (20% of user earnings)
    const userEarningRate = 0.1; // 0.1 TWIST per minute base rate
    const userEarned = (timeSpent / 60) * userEarningRate;
    const publisherCommission = userEarned * 0.2;

    this.totalEarnings += publisherCommission;

    await this.analyticsClient.trackEvent({
      type: 'publisher.user.visit',
      data: {
        publisherId: this.id,
        userId,
        timeSpent,
        userEarned,
        publisherCommission,
        domain: this.profile.domain
      }
    });

    return publisherCommission;
  }

  async createAdSlot(config: any): Promise<string> {
    const adSlot: AdSlot = {
      id: `slot_${Date.now()}`,
      publisherId: this.id,
      size: config.size || '300x250',
      position: config.position || 'sidebar',
      minBid: config.minBid || 0.1,
      allowedFormats: ['display', 'native'],
      createdAt: Date.now()
    };

    this.adSlots.set(adSlot.id, adSlot);

    await this.analyticsClient.trackEvent({
      type: 'publisher.adslot.created',
      data: {
        publisherId: this.id,
        adSlotId: adSlot.id,
        config: adSlot
      }
    });

    return adSlot.id;
  }

  async serveAd(adSlotId: string, campaign: any): Promise<{ served: boolean; revenue: number }> {
    const adSlot = this.adSlots.get(adSlotId);
    if (!adSlot) {
      return { served: false, revenue: 0 };
    }

    // Check if campaign bid meets minimum
    if (campaign.bid < adSlot.minBid) {
      return { served: false, revenue: 0 };
    }

    // Serve the ad
    const revenue = campaign.bid;
    this.totalEarnings += revenue;

    await this.analyticsClient.trackEvent({
      type: 'publisher.ad.served',
      data: {
        publisherId: this.id,
        adSlotId,
        campaignId: campaign.id,
        revenue,
        format: campaign.format
      }
    });

    return { served: true, revenue };
  }

  recordEarnings(amount: number): void {
    this.totalEarnings += amount;
  }

  getTotalEarnings(): number {
    return this.totalEarnings;
  }

  getMetrics(): any {
    return {
      publisherId: this.id,
      domain: this.profile.domain,
      category: this.profile.category,
      isVerified: this.isVerified,
      widgets: this.widgets.size,
      adSlots: this.adSlots.size,
      totalEarnings: this.totalEarnings,
      dailyVisitors: this.dailyVisitors,
      avgEarningPerVisitor: this.dailyVisitors > 0 ? this.totalEarnings / this.dailyVisitors : 0
    };
  }

  async withdrawEarnings(amount: number): Promise<boolean> {
    if (amount > this.totalEarnings) {
      return false;
    }

    try {
      const withdrawal = await this.apiClient.withdrawEarnings({
        publisherId: this.id,
        amount,
        walletAddress: this.profile.walletAddress
      });

      if (withdrawal.success) {
        this.totalEarnings -= amount;
        
        await this.analyticsClient.trackEvent({
          type: 'publisher.withdrawal',
          data: {
            publisherId: this.id,
            amount,
            remainingBalance: this.totalEarnings
          }
        });

        return true;
      }
    } catch (error) {
      console.error('Withdrawal failed:', error);
    }

    return false;
  }

  async earnRevenue(amount: number, type: 'ad_revenue' | 'widget_commission' | 'reward_revenue'): Promise<void> {
    this.totalEarnings += amount;
    
    switch (type) {
      case 'ad_revenue':
        this.adRevenue += amount;
        break;
      case 'widget_commission':
        this.commissionRevenue += amount;
        break;
      case 'reward_revenue':
        this.rewardRevenue += amount;
        break;
    }
  }
}