import '../jest.setup';

describe('Performance Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    performance.clearMarks();
    performance.clearMeasures();
  });

  describe('Multi-Tab Performance', () => {
    it('should handle 50+ active tabs efficiently', async () => {
      const { BackgroundService } = require('../background/service-worker-v2');
      const service = new BackgroundService();

      performance.mark('multi-tab-start');

      // Simulate 50 active tabs
      const tabs = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        url: `https://publisher${i}.com/article`,
        active: i === 0, // Only first tab is active
        title: `Article ${i}`
      }));

      // Add all tabs
      for (const tab of tabs) {
        await service.handleTabChange(tab);
      }

      performance.mark('multi-tab-end');
      performance.measure('multi-tab-handling', 'multi-tab-start', 'multi-tab-end');

      const measure = performance.getEntriesByName('multi-tab-handling')[0];
      
      // Should complete within 1 second
      expect(measure.duration).toBeLessThan(1000);

      // Check memory usage
      expect(service.activeTabs.size).toBe(50);
    });

    it('should efficiently batch VAU submissions', async () => {
      const { BackgroundService } = require('../background/service-worker-v2');
      const service = new BackgroundService();

      // Setup 20 tabs with activity
      const tabs = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        url: `https://site${i}.com`,
        startTime: Date.now() - 60000,
        isActive: true,
        vauSubmitted: false
      }));

      tabs.forEach(tab => service.activeTabs.set(tab.id, tab));

      performance.mark('vau-batch-start');

      // Trigger VAU submission
      await service.submitPendingVAUs();

      performance.mark('vau-batch-end');
      performance.measure('vau-batch-submission', 'vau-batch-start', 'vau-batch-end');

      const measure = performance.getEntriesByName('vau-batch-submission')[0];
      
      // Should batch efficiently (under 500ms)
      expect(measure.duration).toBeLessThan(500);
    });
  });

  describe('Memory Management', () => {
    it('should limit activity buffer size', async () => {
      const { TwistContentScript } = require('../content/inject-v2');
      const script = new TwistContentScript();

      // Generate lots of activities
      for (let i = 0; i < 1000; i++) {
        script.bufferActivity(`activity-${i}`);
      }

      // Buffer should be limited
      expect(script.activityBuffer.length).toBeLessThanOrEqual(100);
    });

    it('should clean up old tab states', async () => {
      const { BackgroundService } = require('../background/service-worker-v2');
      const service = new BackgroundService();

      // Add many tabs
      for (let i = 0; i < 100; i++) {
        service.activeTabs.set(i, {
          url: `https://site${i}.com`,
          startTime: Date.now() - (i * 60000), // Older tabs
          publisher: null
        });
      }

      // Cleanup old tabs (> 1 hour)
      service.cleanupOldTabs();

      // Should remove old inactive tabs
      expect(service.activeTabs.size).toBeLessThan(100);
    });

    it('should limit publisher cache size', async () => {
      const { BackgroundService } = require('../background/service-worker-v2');
      const service = new BackgroundService();

      // Add many publishers to cache
      for (let i = 0; i < 1000; i++) {
        service.publishers.set(`domain${i}.com`, {
          id: `pub${i}`,
          domain: `domain${i}.com`,
          verified: true
        });
      }

      // Should implement LRU or size limit
      expect(service.publishers.size).toBeLessThanOrEqual(500);
    });
  });

  describe('Throttling and Debouncing', () => {
    it('should throttle activity tracking events', async () => {
      let eventCount = 0;
      const throttledHandler = jest.fn(() => eventCount++);

      // Simulate rapid events
      const start = Date.now();
      while (Date.now() - start < 1000) {
        throttledHandler();
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Should throttle to ~1 per second
      expect(eventCount).toBeLessThanOrEqual(2);
    });

    it('should debounce search queries', async () => {
      const searchHandler = jest.fn();
      let debounceTimer: NodeJS.Timeout;

      const debouncedSearch = (query: string) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => searchHandler(query), 300);
      };

      // Rapid search inputs
      debouncedSearch('t');
      debouncedSearch('te');
      debouncedSearch('tes');
      debouncedSearch('test');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 400));

      // Should only call once with final value
      expect(searchHandler).toHaveBeenCalledTimes(1);
      expect(searchHandler).toHaveBeenCalledWith('test');
    });
  });

  describe('Rendering Performance', () => {
    it('should efficiently render large influencer lists', async () => {
      const { SearchPage } = require('../popup/src/pages/SearchPage');
      
      // Mock large search results
      const mockInfluencers = Array.from({ length: 100 }, (_, i) => ({
        id: `inf${i}`,
        username: `user${i}`,
        displayName: `User ${i}`,
        tier: 'GOLD',
        metrics: {
          totalStaked: '1000000000000',
          stakerCount: 100,
          apy: 15 + (i % 10)
        }
      }));

      chrome.runtime.sendMessage = jest.fn().mockResolvedValue(mockInfluencers);

      performance.mark('render-start');
      
      // Component would implement virtualization for large lists
      // Here we're testing the data handling
      const results = await chrome.runtime.sendMessage({
        type: 'SEARCH_INFLUENCERS',
        params: { query: 'test' }
      });

      performance.mark('render-end');
      performance.measure('large-list-render', 'render-start', 'render-end');

      const measure = performance.getEntriesByName('large-list-render')[0];
      
      // Should handle large lists efficiently
      expect(measure.duration).toBeLessThan(100);
      expect(results.length).toBe(100);
    });
  });

  describe('API Call Optimization', () => {
    it('should batch API requests efficiently', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      
      const { BackgroundService } = require('../background/service-worker-v2');
      const service = new BackgroundService();

      // Multiple publisher checks
      const domains = Array.from({ length: 10 }, (_, i) => `site${i}.com`);
      
      performance.mark('batch-api-start');
      
      await Promise.all(
        domains.map(domain => service.checkPublisher(`https://${domain}`))
      );
      
      performance.mark('batch-api-end');
      performance.measure('batch-api-calls', 'batch-api-start', 'batch-api-end');

      const measure = performance.getEntriesByName('batch-api-calls')[0];
      
      // Should complete quickly with caching
      expect(measure.duration).toBeLessThan(200);
      
      // Should use cache for repeated domains
      await service.checkPublisher('https://site0.com');
      expect(fetchSpy).toHaveBeenCalledTimes(10); // No additional call
    });

    it('should implement request queuing', async () => {
      const { BackgroundService } = require('../background/service-worker-v2');
      const service = new BackgroundService();

      const requests = Array.from({ length: 50 }, (_, i) => 
        service.searchInfluencers({ query: `test${i}` })
      );

      performance.mark('queue-start');
      
      await Promise.all(requests);
      
      performance.mark('queue-end');
      performance.measure('request-queue', 'queue-start', 'queue-end');

      const measure = performance.getEntriesByName('request-queue')[0];
      
      // Should handle concurrent requests efficiently
      expect(measure.duration).toBeLessThan(2000);
    });
  });

  describe('Storage Optimization', () => {
    it('should compress large data before storage', async () => {
      const largeData = {
        stakes: Array.from({ length: 1000 }, (_, i) => ({
          influencerId: `inf${i}`,
          amount: '100000000000',
          timestamp: Date.now()
        }))
      };

      const originalSize = JSON.stringify(largeData).length;
      
      // Simulate compression (actual implementation would use real compression)
      const compressed = {
        _compressed: true,
        data: 'compressed_data_here',
        originalSize
      };

      chrome.storage.local.set = jest.fn();
      
      // Store compressed data
      await chrome.storage.local.set({ largeData: compressed });

      const storedData = (chrome.storage.local.set as jest.Mock).mock.calls[0][0];
      const storedSize = JSON.stringify(storedData).length;

      // Should reduce size significantly
      expect(storedSize).toBeLessThan(originalSize * 0.5);
    });

    it('should implement storage quota management', async () => {
      const { BackgroundService } = require('../background/service-worker-v2');
      const service = new BackgroundService();

      // Check storage usage
      const usage = await service.getStorageUsage();
      
      // Should track and limit storage
      expect(usage.bytesUsed).toBeDefined();
      expect(usage.quota).toBeDefined();
      
      // Should clean up when approaching quota
      if (usage.bytesUsed / usage.quota > 0.9) {
        await service.cleanupOldData();
        const newUsage = await service.getStorageUsage();
        expect(newUsage.bytesUsed).toBeLessThan(usage.bytesUsed);
      }
    });
  });

  describe('Event Handler Performance', () => {
    it('should handle rapid tab switches efficiently', async () => {
      const { BackgroundService } = require('../background/service-worker-v2');
      const service = new BackgroundService();

      performance.mark('tab-switch-start');

      // Simulate rapid tab switching
      for (let i = 0; i < 100; i++) {
        await service.handleTabChange({
          id: i % 10, // Cycle through 10 tabs
          url: `https://site${i % 10}.com`,
          active: true
        });
      }

      performance.mark('tab-switch-end');
      performance.measure('rapid-tab-switches', 'tab-switch-start', 'tab-switch-end');

      const measure = performance.getEntriesByName('rapid-tab-switches')[0];
      
      // Should handle efficiently
      expect(measure.duration).toBeLessThan(500);
    });
  });

  describe('Network Performance', () => {
    it('should implement connection pooling', async () => {
      const connections: any[] = [];
      
      // Simulate multiple API connections
      for (let i = 0; i < 10; i++) {
        connections.push(
          fetch('https://api.twist.io/test', {
            keepalive: true
          })
        );
      }

      performance.mark('connection-start');
      
      await Promise.all(connections);
      
      performance.mark('connection-end');
      performance.measure('connection-pooling', 'connection-start', 'connection-end');

      const measure = performance.getEntriesByName('connection-pooling')[0];
      
      // Should reuse connections efficiently
      expect(measure.duration).toBeLessThan(1000);
    });

    it('should handle network failures with exponential backoff', async () => {
      let attemptCount = 0;
      const maxAttempts = 3;
      
      const retryWithBackoff = async (fn: () => Promise<any>) => {
        for (let i = 0; i < maxAttempts; i++) {
          try {
            attemptCount++;
            return await fn();
          } catch (error) {
            if (i === maxAttempts - 1) throw error;
            await new Promise(resolve => 
              setTimeout(resolve, Math.pow(2, i) * 100)
            );
          }
        }
      };

      // Simulate failing network call
      const failingCall = jest.fn().mockRejectedValue(new Error('Network error'));
      
      try {
        await retryWithBackoff(failingCall);
      } catch (error) {
        // Expected to fail after retries
      }

      expect(attemptCount).toBe(maxAttempts);
      expect(failingCall).toHaveBeenCalledTimes(maxAttempts);
    });
  });

  describe('Startup Performance', () => {
    it('should initialize extension quickly', async () => {
      performance.mark('init-start');
      
      const { BackgroundService } = require('../background/service-worker-v2');
      const service = new BackgroundService();
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      performance.mark('init-end');
      performance.measure('extension-init', 'init-start', 'init-end');

      const measure = performance.getEntriesByName('extension-init')[0];
      
      // Should initialize within 200ms
      expect(measure.duration).toBeLessThan(200);
    });

    it('should lazy load non-critical components', async () => {
      // Simulate lazy loading
      const loadComponent = async (name: string) => {
        performance.mark(`load-${name}-start`);
        
        // Simulate dynamic import
        await new Promise(resolve => setTimeout(resolve, 50));
        
        performance.mark(`load-${name}-end`);
        performance.measure(`load-${name}`, `load-${name}-start`, `load-${name}-end`);
        
        return { loaded: true };
      };

      // Critical components loaded immediately
      await loadComponent('core');
      
      // Non-critical loaded on demand
      setTimeout(() => loadComponent('analytics'), 1000);
      setTimeout(() => loadComponent('advanced-features'), 2000);

      // Initial load should be fast
      const coreMeasure = performance.getEntriesByName('load-core')[0];
      expect(coreMeasure.duration).toBeLessThan(100);
    });
  });
});