/**
 * Campaign Attribution Tests
 * Tests multi-touch attribution and conversion tracking
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock Attribution Engine
class MockAttributionEngine {
  private touchpoints: Map<string, any[]> = new Map();
  private conversions: any[] = [];

  trackTouchpoint(userId: string, touchpoint: any) {
    if (!this.touchpoints.has(userId)) {
      this.touchpoints.set(userId, []);
    }
    
    this.touchpoints.get(userId)!.push({
      ...touchpoint,
      timestamp: Date.now(),
    });
  }

  attributeConversion(userId: string, value: number, model: string = 'last_click') {
    const userTouchpoints = this.touchpoints.get(userId) || [];
    if (userTouchpoints.length === 0) return null;

    let attribution;
    
    switch (model) {
      case 'last_click':
        attribution = this.lastClickAttribution(userTouchpoints);
        break;
      case 'first_click':
        attribution = this.firstClickAttribution(userTouchpoints);
        break;
      case 'linear':
        attribution = this.linearAttribution(userTouchpoints);
        break;
      case 'time_decay':
        attribution = this.timeDecayAttribution(userTouchpoints);
        break;
      case 'shapley':
        attribution = this.shapleyAttribution(userTouchpoints);
        break;
      default:
        attribution = this.lastClickAttribution(userTouchpoints);
    }

    const conversion = {
      userId,
      value,
      model,
      attribution,
      timestamp: Date.now(),
    };

    this.conversions.push(conversion);
    return conversion;
  }

  private lastClickAttribution(touchpoints: any[]) {
    const clicks = touchpoints.filter(t => t.type === 'click');
    const lastClick = clicks[clicks.length - 1] || touchpoints[touchpoints.length - 1];
    
    return [{
      campaignId: lastClick.campaignId,
      credit: 1.0,
    }];
  }

  private firstClickAttribution(touchpoints: any[]) {
    const clicks = touchpoints.filter(t => t.type === 'click');
    const firstClick = clicks[0] || touchpoints[0];
    
    return [{
      campaignId: firstClick.campaignId,
      credit: 1.0,
    }];
  }

  private linearAttribution(touchpoints: any[]) {
    const credit = 1.0 / touchpoints.length;
    
    return touchpoints.map(t => ({
      campaignId: t.campaignId,
      credit,
    }));
  }

  private timeDecayAttribution(touchpoints: any[], halfLife: number = 7 * 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let totalWeight = 0;
    
    const weights = touchpoints.map(t => {
      const age = now - t.timestamp;
      const weight = Math.pow(0.5, age / halfLife);
      totalWeight += weight;
      return weight;
    });

    return touchpoints.map((t, i) => ({
      campaignId: t.campaignId,
      credit: weights[i] / totalWeight,
    }));
  }

  private shapleyAttribution(touchpoints: any[]) {
    // Simplified Shapley value calculation
    const campaigns = [...new Set(touchpoints.map(t => t.campaignId))];
    const values: Record<string, number> = {};

    campaigns.forEach(campaign => {
      values[campaign] = 1.0 / campaigns.length; // Simplified
    });

    return Object.entries(values).map(([campaignId, credit]) => ({
      campaignId,
      credit,
    }));
  }

  getConversions() {
    return this.conversions;
  }

  getTouchpoints(userId: string) {
    return this.touchpoints.get(userId) || [];
  }
}

describe('Campaign Attribution Tests', () => {
  let attributionEngine: MockAttributionEngine;

  beforeEach(() => {
    attributionEngine = new MockAttributionEngine();
  });

  describe('Touchpoint Tracking', () => {
    it('should track multiple touchpoints for a user', () => {
      const userId = 'user_123';

      attributionEngine.trackTouchpoint(userId, {
        type: 'impression',
        campaignId: 'camp_1',
        publisherId: 'pub_1',
      });

      attributionEngine.trackTouchpoint(userId, {
        type: 'click',
        campaignId: 'camp_1',
        publisherId: 'pub_1',
      });

      attributionEngine.trackTouchpoint(userId, {
        type: 'impression',
        campaignId: 'camp_2',
        publisherId: 'pub_2',
      });

      const touchpoints = attributionEngine.getTouchpoints(userId);
      expect(touchpoints).toHaveLength(3);
      expect(touchpoints[0].type).toBe('impression');
      expect(touchpoints[1].type).toBe('click');
    });
  });

  describe('Attribution Models', () => {
    beforeEach(() => {
      // Setup user journey: 3 campaigns, multiple touchpoints
      const userId = 'user_test';
      
      attributionEngine.trackTouchpoint(userId, {
        type: 'impression',
        campaignId: 'camp_A',
      });
      
      attributionEngine.trackTouchpoint(userId, {
        type: 'click',
        campaignId: 'camp_A',
      });
      
      attributionEngine.trackTouchpoint(userId, {
        type: 'impression',
        campaignId: 'camp_B',
      });
      
      attributionEngine.trackTouchpoint(userId, {
        type: 'click',
        campaignId: 'camp_B',
      });
      
      attributionEngine.trackTouchpoint(userId, {
        type: 'impression',
        campaignId: 'camp_C',
      });
      
      attributionEngine.trackTouchpoint(userId, {
        type: 'click',
        campaignId: 'camp_C',
      });
    });

    it('should apply last-click attribution', () => {
      const conversion = attributionEngine.attributeConversion('user_test', 100, 'last_click');
      
      expect(conversion?.attribution).toHaveLength(1);
      expect(conversion?.attribution[0].campaignId).toBe('camp_C');
      expect(conversion?.attribution[0].credit).toBe(1.0);
    });

    it('should apply first-click attribution', () => {
      const conversion = attributionEngine.attributeConversion('user_test', 100, 'first_click');
      
      expect(conversion?.attribution).toHaveLength(1);
      expect(conversion?.attribution[0].campaignId).toBe('camp_A');
      expect(conversion?.attribution[0].credit).toBe(1.0);
    });

    it('should apply linear attribution', () => {
      const conversion = attributionEngine.attributeConversion('user_test', 100, 'linear');
      
      expect(conversion?.attribution).toHaveLength(6); // 6 touchpoints
      conversion?.attribution.forEach(attr => {
        expect(attr.credit).toBeCloseTo(1/6, 5);
      });
    });

    it('should apply time-decay attribution', () => {
      const conversion = attributionEngine.attributeConversion('user_test', 100, 'time_decay');
      
      expect(conversion?.attribution).toHaveLength(6);
      
      // More recent touchpoints should have higher credit
      const credits = conversion!.attribution.map(a => a.credit);
      expect(credits[5]).toBeGreaterThan(credits[0]); // Last > First
    });
  });

  describe('Conversion Tracking', () => {
    it('should track conversion values correctly', () => {
      const userId = 'user_123';
      
      attributionEngine.trackTouchpoint(userId, {
        type: 'click',
        campaignId: 'camp_1',
      });

      const conversion = attributionEngine.attributeConversion(userId, 50.00);
      
      expect(conversion).toBeDefined();
      expect(conversion?.value).toBe(50.00);
      expect(conversion?.model).toBe('last_click');
    });

    it('should handle multiple conversions', () => {
      const userId1 = 'user_1';
      const userId2 = 'user_2';

      attributionEngine.trackTouchpoint(userId1, { type: 'click', campaignId: 'camp_A' });
      attributionEngine.trackTouchpoint(userId2, { type: 'click', campaignId: 'camp_B' });

      attributionEngine.attributeConversion(userId1, 25.00);
      attributionEngine.attributeConversion(userId2, 75.00);

      const conversions = attributionEngine.getConversions();
      expect(conversions).toHaveLength(2);
      expect(conversions[0].value + conversions[1].value).toBe(100.00);
    });
  });

  describe('Cross-Device Attribution', () => {
    it('should handle cross-device user journeys', () => {
      const userId = 'user_123';

      // Mobile impression
      attributionEngine.trackTouchpoint(userId, {
        type: 'impression',
        campaignId: 'camp_1',
        device: 'mobile',
      });

      // Desktop click
      attributionEngine.trackTouchpoint(userId, {
        type: 'click',
        campaignId: 'camp_1',
        device: 'desktop',
      });

      // Mobile conversion
      const conversion = attributionEngine.attributeConversion(userId, 100);
      
      expect(conversion).toBeDefined();
      expect(attributionEngine.getTouchpoints(userId)).toHaveLength(2);
    });
  });
});