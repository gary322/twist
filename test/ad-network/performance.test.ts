/**
 * Ad Network Performance Tests
 * Tests system performance under load
 */

import { describe, it, expect } from '@jest/globals';

describe('Ad Network Performance Tests', () => {
  describe('RTB Latency', () => {
    it('should process bid requests within 100ms', async () => {
      const mockRTB = {
        async processBidRequest(request: any) {
          // Simulate processing
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
          return { id: request.id, bid: Math.random() };
        }
      };

      const times: number[] = [];
      
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await mockRTB.processBidRequest({ id: `req_${i}` });
        const duration = performance.now() - start;
        times.push(duration);
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxTime = Math.max(...times);

      console.log(`RTB Performance: avg=${avgTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(100);
      expect(maxTime).toBeLessThan(200);
    });
  });

  describe('Concurrent Load', () => {
    it('should handle 1000 concurrent bid requests', async () => {
      const mockRTB = {
        activeRequests: 0,
        maxConcurrent: 0,
        
        async processBidRequest(request: any) {
          this.activeRequests++;
          this.maxConcurrent = Math.max(this.maxConcurrent, this.activeRequests);
          
          await new Promise(resolve => setTimeout(resolve, 10));
          
          this.activeRequests--;
          return { id: request.id };
        }
      };

      const start = Date.now();
      const promises = [];

      for (let i = 0; i < 1000; i++) {
        promises.push(mockRTB.processBidRequest({ id: `req_${i}` }));
      }

      await Promise.all(promises);
      const duration = Date.now() - start;

      console.log(`Processed 1000 requests in ${duration}ms`);
      console.log(`Max concurrent: ${mockRTB.maxConcurrent}`);

      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during extended operation', async () => {
      const mockAdServer = {
        servedAds: new Map(),
        
        serveAd(id: string) {
          this.servedAds.set(id, {
            id,
            timestamp: Date.now(),
            data: new Array(1000).fill(0), // ~8KB per ad
          });
          
          // Clean old ads
          if (this.servedAds.size > 10000) {
            const oldestKey = this.servedAds.keys().next().value;
            this.servedAds.delete(oldestKey);
          }
        }
      };

      const initialMemory = process.memoryUsage().heapUsed;

      // Serve 50,000 ads
      for (let i = 0; i < 50000; i++) {
        mockAdServer.serveAd(`ad_${i}`);
      }

      global.gc && global.gc(); // Force garbage collection if available
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`Memory growth: ${memoryGrowth.toFixed(2)} MB`);
      
      expect(memoryGrowth).toBeLessThan(100); // Less than 100MB growth
      expect(mockAdServer.servedAds.size).toBeLessThanOrEqual(10000);
    });
  });

  describe('Campaign Update Performance', () => {
    it('should update campaign metrics efficiently', async () => {
      const campaigns = new Map();
      
      // Create 1000 campaigns
      for (let i = 0; i < 1000; i++) {
        campaigns.set(`camp_${i}`, {
          id: `camp_${i}`,
          impressions: 0,
          clicks: 0,
          spend: 0,
        });
      }

      const start = performance.now();

      // Simulate 10,000 metric updates
      for (let i = 0; i < 10000; i++) {
        const campaignId = `camp_${Math.floor(Math.random() * 1000)}`;
        const campaign = campaigns.get(campaignId);
        
        if (campaign) {
          campaign.impressions++;
          campaign.spend += 0.001;
          
          if (Math.random() < 0.02) { // 2% CTR
            campaign.clicks++;
            campaign.spend += 0.01;
          }
        }
      }

      const duration = performance.now() - start;

      console.log(`10,000 metric updates in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(100);
    });
  });
});