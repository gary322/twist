import '../jest.setup';

describe('Content Script v2.0', () => {
  let contentScript: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset DOM
    document.body.innerHTML = '';
    
    // Mock window location
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://example.com',
        hostname: 'example.com',
        pathname: '/',
        protocol: 'https:'
      },
      writable: true
    });
  });

  describe('Platform Detection', () => {
    const platforms = [
      { hostname: 'twitter.com', expected: 'twitter' },
      { hostname: 'x.com', expected: 'twitter' },
      { hostname: 'instagram.com', expected: 'instagram' },
      { hostname: 'youtube.com', expected: 'youtube' },
      { hostname: 'tiktok.com', expected: 'tiktok' },
      { hostname: 'example.com', expected: null }
    ];

    platforms.forEach(({ hostname, expected }) => {
      it(`should detect ${expected || 'no'} platform for ${hostname}`, () => {
        window.location.hostname = hostname;
        
        // Import fresh instance
        jest.isolateModules(() => {
          const { TwistContentScript } = require('../content/inject-v2');
          const script = new TwistContentScript();
          
          expect(script.detectPlatform()).toBe(expected);
        });
      });
    });
  });

  describe('Influencer Detection', () => {
    it('should detect Twitter influencer from profile URL', async () => {
      window.location.hostname = 'twitter.com';
      window.location.pathname = '/elonmusk';
      
      const mockResponse = jest.fn();
      chrome.runtime.sendMessage = jest.fn().mockImplementation((msg, callback) => {
        if (msg.type === 'GET_INFLUENCER_ON_PAGE') {
          callback({
            influencer: {
              id: 'inf123',
              username: 'elonmusk',
              displayName: 'Elon Musk',
              tier: 'PLATINUM',
              metrics: {
                totalStaked: '1000000000000',
                stakerCount: 10000,
                apy: 25
              }
            }
          });
        }
      });

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        new TwistContentScript();
      });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have checked for influencer
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'GET_INFLUENCER_ON_PAGE' },
        expect.any(Function)
      );

      // Should show influencer badge
      const badge = document.getElementById('twist-influencer-badge');
      expect(badge).toBeTruthy();
      expect(badge?.innerHTML).toContain('Elon Musk is on TWIST!');
      expect(badge?.innerHTML).toContain('10000 people staking');
      expect(badge?.innerHTML).toContain('25% APY');
    });

    it('should detect YouTube channel influencer', async () => {
      window.location.hostname = 'youtube.com';
      document.body.innerHTML = `
        <a class="ytd-video-owner-renderer" href="/@MrBeast">MrBeast</a>
      `;

      chrome.runtime.sendMessage = jest.fn().mockImplementation((msg, callback) => {
        if (msg.type === 'GET_INFLUENCER_ON_PAGE') {
          callback({
            influencer: {
              id: 'inf456',
              username: 'MrBeast',
              displayName: 'MrBeast',
              tier: 'PLATINUM',
              metrics: {
                totalStaked: '5000000000000',
                stakerCount: 50000,
                apy: 30
              }
            }
          });
        }
      });

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        new TwistContentScript();
      });

      // Trigger periodic check
      await new Promise(resolve => setTimeout(resolve, 2100));

      // Should detect from channel link
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'GET_INFLUENCER_ON_PAGE' },
        expect.any(Function)
      );
    });

    it('should handle stake button click in influencer badge', async () => {
      window.location.hostname = 'twitter.com';
      window.location.pathname = '/testuser';

      chrome.runtime.sendMessage = jest.fn().mockImplementation((msg, callback) => {
        if (msg.type === 'GET_INFLUENCER_ON_PAGE') {
          callback({
            influencer: {
              id: 'inf789',
              username: 'testuser',
              displayName: 'Test User',
              tier: 'GOLD',
              metrics: {
                totalStaked: '100000000000',
                stakerCount: 100,
                apy: 15
              }
            }
          });
        }
      });

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        new TwistContentScript();
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const stakeButton = document.getElementById('twist-stake-button');
      expect(stakeButton).toBeTruthy();

      // Click stake button
      stakeButton?.click();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'OPEN_POPUP_WITH_STAKING',
        influencer: expect.objectContaining({
          username: 'testuser'
        })
      });
    });

    it('should auto-hide influencer badge after timeout', async () => {
      window.location.hostname = 'twitter.com';
      window.location.pathname = '/testuser';

      chrome.runtime.sendMessage = jest.fn().mockImplementation((msg, callback) => {
        if (msg.type === 'GET_INFLUENCER_ON_PAGE') {
          callback({
            influencer: {
              id: 'inf999',
              username: 'testuser',
              displayName: 'Test User',
              tier: 'SILVER',
              metrics: {
                totalStaked: '50000000000',
                stakerCount: 50,
                apy: 10
              }
            }
          });
        }
      });

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        new TwistContentScript();
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const badge = document.getElementById('twist-influencer-badge');
      expect(badge).toBeTruthy();
      expect(badge?.style.opacity).toBe('');

      // Wait for auto-hide
      await new Promise(resolve => setTimeout(resolve, 10500));

      expect(badge?.style.opacity).toBe('0');
    });
  });

  describe('Publisher Tracking', () => {
    it('should show publisher widget on verified sites', async () => {
      chrome.runtime.sendMessage = jest.fn().mockImplementation((msg, callback) => {
        if (msg.type === 'CHECK_PUBLISHER') {
          callback({
            id: 'pub123',
            domain: 'example.com',
            verified: true,
            name: 'Example Publisher'
          });
        }
      });

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        new TwistContentScript();
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const widget = document.getElementById('twist-publisher-widget');
      expect(widget).toBeTruthy();
      expect(widget?.innerHTML).toContain('Earning TWIST tokens');
    });

    it('should track user activity on publisher sites', async () => {
      chrome.runtime.sendMessage = jest.fn().mockImplementation((msg, callback) => {
        if (msg.type === 'CHECK_PUBLISHER') {
          callback({ verified: true });
        }
      });

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        new TwistContentScript();
      });

      // Simulate user activities
      const events = ['click', 'scroll', 'keypress'];
      
      for (const eventType of events) {
        const event = new Event(eventType);
        document.dispatchEvent(event);
        
        // Wait for throttle
        await new Promise(resolve => setTimeout(resolve, 1100));
      }

      // Wait for activity buffer
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should have sent activity update
      const activityCalls = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .filter(call => call[0].type === 'USER_ACTIVITY');
      
      expect(activityCalls.length).toBeGreaterThan(0);
      expect(activityCalls[0][0].payload.activities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: expect.any(String) })
        ])
      );
    });

    it('should track viewport time for content elements', async () => {
      document.body.innerHTML = `
        <main>
          <article>Test content that user is reading</article>
        </main>
      `;

      chrome.runtime.sendMessage = jest.fn();

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        new TwistContentScript();
      });

      // Wait for observer setup
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Trigger intersection
      const observers = (IntersectionObserver as jest.Mock).mock.instances;
      const mockEntries = [{
        isIntersecting: true,
        target: document.querySelector('article')
      }];
      
      observers[0].callback(mockEntries);

      // Wait for tracking
      await new Promise(resolve => setTimeout(resolve, 11000));

      const engagementCalls = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .filter(call => call[0].type === 'CONTENT_ENGAGED');
      
      expect(engagementCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Security Features', () => {
    it('should not track on sensitive pages', async () => {
      window.location.hostname = 'mybank.com';
      window.location.pathname = '/account/login';

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        new TwistContentScript();
      });

      // Simulate activity
      document.dispatchEvent(new Event('click'));
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should not send activity updates
      const activityCalls = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .filter(call => call[0].type === 'USER_ACTIVITY');
      
      expect(activityCalls.length).toBe(0);
    });

    it('should not run on non-HTTP(S) protocols', () => {
      window.location.protocol = 'chrome-extension:';

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        new TwistContentScript();
      });

      // Should not initialize tracking
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    it('should handle CHECK_ACTIVITY message', async () => {
      const sendResponse = jest.fn();

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        const script = new TwistContentScript();
        
        // Get message listener
        const listener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0]?.[0];
        
        listener(
          { type: 'CHECK_ACTIVITY' },
          {},
          sendResponse
        );
      });

      expect(sendResponse).toHaveBeenCalledWith({
        isActive: true,
        lastActivity: expect.any(Number)
      });
    });

    it('should handle GET_PAGE_INFO message', async () => {
      document.title = 'Test Page';
      document.head.innerHTML = `
        <meta name="description" content="Test description">
        <meta name="author" content="Test Author">
      `;
      document.body.innerHTML = `
        <p>Some test content with multiple words to count properly.</p>
      `;

      const sendResponse = jest.fn();

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        const script = new TwistContentScript();
        
        const listener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0]?.[0];
        
        listener(
          { type: 'GET_PAGE_INFO' },
          {},
          sendResponse
        );
      });

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Page',
          description: 'Test description',
          author: 'Test Author',
          wordCount: expect.any(Number),
          hasVideo: false,
          hasPaywall: false
        })
      );
    });

    it('should handle INJECT_WALLET message', async () => {
      const sendResponse = jest.fn();

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        const script = new TwistContentScript();
        
        const listener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0]?.[0];
        
        listener(
          { type: 'INJECT_WALLET' },
          {},
          sendResponse
        );
      });

      // Check if TWIST wallet interface was injected
      expect(window.TWIST).toBeDefined();
      expect(window.TWIST.isAvailable).toBe(true);
      expect(typeof window.TWIST.connectWallet).toBe('function');
      expect(typeof window.TWIST.getBalance).toBe('function');
    });
  });

  describe('Performance', () => {
    it('should throttle activity events', async () => {
      chrome.runtime.sendMessage = jest.fn();

      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        new TwistContentScript();
      });

      // Rapid clicks
      for (let i = 0; i < 10; i++) {
        document.dispatchEvent(new Event('click'));
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Should throttle to ~1 per second
      await new Promise(resolve => setTimeout(resolve, 2000));

      const activityUpdates = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .filter(call => call[0].type === 'USER_ACTIVITY').length;
      
      expect(activityUpdates).toBeLessThan(10);
    });

    it('should limit activity buffer size', async () => {
      chrome.runtime.sendMessage = jest.fn();

      let contentScript: any;
      
      jest.isolateModules(() => {
        const { TwistContentScript } = require('../content/inject-v2');
        contentScript = new TwistContentScript();
      });

      // Generate many activities
      for (let i = 0; i < 150; i++) {
        contentScript.bufferActivity('test');
      }

      expect(contentScript.activityBuffer.length).toBeLessThanOrEqual(100);
    });
  });
});