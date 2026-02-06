/**
 * Publisher Integration Tests
 * Tests the publisher-side ad serving and tracking
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock Publisher SDK
class MockPublisherSDK {
  private events: any[] = [];
  private adUnits: Map<string, any> = new Map();
  private earnings: number = 0;

  createAdUnit(config: any) {
    const adUnit = {
      id: `adunit_${Date.now()}`,
      ...config,
      impressions: 0,
      clicks: 0,
      revenue: 0,
    };
    
    this.adUnits.set(adUnit.id, adUnit);
    return adUnit;
  }

  trackImpression(adUnitId: string, data: any) {
    const adUnit = this.adUnits.get(adUnitId);
    if (!adUnit) throw new Error('Ad unit not found');

    adUnit.impressions++;
    adUnit.revenue += data.revenue || 0;
    this.earnings += data.revenue || 0;

    this.events.push({
      type: 'IMPRESSION',
      adUnitId,
      timestamp: Date.now(),
      ...data,
    });
  }

  trackClick(adUnitId: string, data: any) {
    const adUnit = this.adUnits.get(adUnitId);
    if (!adUnit) throw new Error('Ad unit not found');

    adUnit.clicks++;
    adUnit.revenue += data.revenue || 0;
    this.earnings += data.revenue || 0;

    this.events.push({
      type: 'CLICK',
      adUnitId,
      timestamp: Date.now(),
      ...data,
    });

    return data.rewardAmount || 0;
  }

  getAdUnit(adUnitId: string) {
    return this.adUnits.get(adUnitId);
  }

  getEarnings() {
    return this.earnings;
  }

  getEvents() {
    return this.events;
  }
}

describe('Publisher Integration Tests', () => {
  let sdk: MockPublisherSDK;

  beforeEach(() => {
    sdk = new MockPublisherSDK();
  });

  describe('Ad Unit Management', () => {
    it('should create ad unit with correct configuration', () => {
      const adUnit = sdk.createAdUnit({
        type: 'banner',
        size: '728x90',
        placement: 'header',
        rewardAmount: 0.1,
      });

      expect(adUnit).toBeDefined();
      expect(adUnit.type).toBe('banner');
      expect(adUnit.size).toBe('728x90');
      expect(adUnit.rewardAmount).toBe(0.1);
    });

    it('should track multiple ad units independently', () => {
      const adUnit1 = sdk.createAdUnit({ type: 'banner' });
      const adUnit2 = sdk.createAdUnit({ type: 'native' });

      sdk.trackImpression(adUnit1.id, { revenue: 0.005 });
      sdk.trackImpression(adUnit2.id, { revenue: 0.008 });

      expect(sdk.getAdUnit(adUnit1.id)?.impressions).toBe(1);
      expect(sdk.getAdUnit(adUnit2.id)?.impressions).toBe(1);
      expect(sdk.getEarnings()).toBe(0.013);
    });
  });

  describe('Impression Tracking', () => {
    it('should track impressions correctly', () => {
      const adUnit = sdk.createAdUnit({ type: 'banner' });
      
      sdk.trackImpression(adUnit.id, {
        userId: 'user_123',
        campaignId: 'camp_456',
        revenue: 0.005,
      });

      const unit = sdk.getAdUnit(adUnit.id);
      expect(unit?.impressions).toBe(1);
      expect(unit?.revenue).toBe(0.005);
    });

    it('should record impression events', () => {
      const adUnit = sdk.createAdUnit({ type: 'video' });
      
      sdk.trackImpression(adUnit.id, {
        userId: 'user_123',
        revenue: 0.01,
      });

      const events = sdk.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('IMPRESSION');
      expect(events[0].revenue).toBe(0.01);
    });
  });

  describe('Click Tracking', () => {
    it('should track clicks and distribute rewards', () => {
      const adUnit = sdk.createAdUnit({ 
        type: 'reward',
        rewardAmount: 0.2,
      });

      const reward = sdk.trackClick(adUnit.id, {
        userId: 'user_123',
        revenue: 0.05,
        rewardAmount: 0.2,
      });

      expect(reward).toBe(0.2);
      expect(sdk.getAdUnit(adUnit.id)?.clicks).toBe(1);
    });

    it('should calculate CTR correctly', () => {
      const adUnit = sdk.createAdUnit({ type: 'banner' });
      
      // 100 impressions
      for (let i = 0; i < 100; i++) {
        sdk.trackImpression(adUnit.id, { revenue: 0.001 });
      }
      
      // 2 clicks
      sdk.trackClick(adUnit.id, { revenue: 0.01 });
      sdk.trackClick(adUnit.id, { revenue: 0.01 });

      const unit = sdk.getAdUnit(adUnit.id);
      const ctr = (unit!.clicks / unit!.impressions) * 100;
      expect(ctr).toBe(2); // 2% CTR
    });
  });

  describe('Revenue Tracking', () => {
    it('should accumulate publisher earnings', () => {
      const adUnit = sdk.createAdUnit({ type: 'native' });
      
      sdk.trackImpression(adUnit.id, { revenue: 0.005 });
      sdk.trackClick(adUnit.id, { revenue: 0.05 });
      sdk.trackImpression(adUnit.id, { revenue: 0.005 });

      expect(sdk.getEarnings()).toBe(0.06);
      expect(sdk.getAdUnit(adUnit.id)?.revenue).toBe(0.06);
    });

    it('should handle revenue share correctly', () => {
      const adUnit = sdk.createAdUnit({ 
        type: 'banner',
        revenueShare: 0.7, // Publisher gets 70%
      });

      const totalRevenue = 1.0;
      const publisherShare = totalRevenue * 0.7;
      
      sdk.trackImpression(adUnit.id, { 
        revenue: publisherShare,
        totalRevenue: totalRevenue,
      });

      expect(sdk.getEarnings()).toBe(0.7);
    });
  });

  describe('Ad Types', () => {
    it('should support different ad types', () => {
      const types = ['banner', 'native', 'video', 'interactive', 'reward'];
      
      types.forEach(type => {
        const adUnit = sdk.createAdUnit({ type });
        expect(adUnit.type).toBe(type);
      });
    });

    it('should have different reward amounts by type', () => {
      const configs = [
        { type: 'banner', rewardAmount: 0.01 },
        { type: 'video', rewardAmount: 0.5 },
        { type: 'interactive', rewardAmount: 1.0 },
      ];

      configs.forEach(config => {
        const adUnit = sdk.createAdUnit(config);
        const reward = sdk.trackClick(adUnit.id, {
          rewardAmount: config.rewardAmount,
        });
        expect(reward).toBe(config.rewardAmount);
      });
    });
  });
});

// Integration with Ad Server
describe('Publisher-AdServer Integration', () => {
  it('should request ads from ad server', async () => {
    const mockAdServer = {
      async requestAd(params: any) {
        return {
          adId: 'ad_123',
          html: '<div class="twist-ad">Test Ad</div>',
          campaignId: 'camp_456',
          rewardAmount: 0.1,
        };
      }
    };

    const sdk = new MockPublisherSDK();
    const adUnit = sdk.createAdUnit({ type: 'banner' });

    // Request ad
    const ad = await mockAdServer.requestAd({
      adUnitId: adUnit.id,
      publisherId: 'pub_123',
    });

    expect(ad).toBeDefined();
    expect(ad.campaignId).toBe('camp_456');
  });
});