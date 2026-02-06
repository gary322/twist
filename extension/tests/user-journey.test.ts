import { MessageType } from '../types';
import '../jest.setup';

describe('User Journey Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset chrome storage
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
    (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);
  });

  describe('New User Onboarding Journey', () => {
    it('should complete full onboarding flow', async () => {
      // 1. Extension installed
      const onInstalledListener = (chrome.runtime.onInstalled.addListener as jest.Mock).mock.calls[0]?.[0];
      expect(onInstalledListener).toBeDefined();

      await onInstalledListener({ reason: 'install' });
      
      // Should create onboarding tab
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'onboarding/index.html'
      });

      // 2. User enters email for authentication
      const mockIdentity = {
        userId: 'new-user-123',
        email: 'newuser@example.com',
        deviceId: 'device-123',
        trustScore: 100,
        createdAt: new Date().toISOString()
      };

      // Mock successful authentication
      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.identify = jest.fn().mockResolvedValue(mockIdentity);

      // 3. Verify alarms are set up
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'vauSubmission',
        { periodInMinutes: 5 }
      );
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'checkStakingRewards',
        { periodInMinutes: 30 }
      );

      // 4. Verify context menus created
      expect(chrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'stake-on-influencer',
        title: 'Stake on this influencer',
        contexts: ['page']
      });

      // 5. Verify user identity stored
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          identity: expect.any(Object)
        })
      );
    });
  });

  describe('VAU Tracking and Submission Journey', () => {
    it('should track user activity and submit VAU', async () => {
      // Setup authenticated user
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: {
          userId: 'test-user',
          email: 'test@example.com'
        }
      });

      // 1. User visits a TWIST-enabled publisher site
      const publisherTab = {
        id: 1,
        url: 'https://publisher.com/article',
        title: 'Test Article'
      };

      // Mock publisher verification
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'pub123',
          domain: 'publisher.com',
          verified: true
        })
      });

      // 2. Tab activation triggers monitoring
      const onActivatedListener = (chrome.tabs.onActivated.addListener as jest.Mock).mock.calls[0]?.[0];
      (chrome.tabs.get as jest.Mock).mockResolvedValue(publisherTab);
      
      await onActivatedListener({ tabId: 1 });

      // 3. Content script reports activity
      const messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0]?.[0];
      
      await messageListener(
        {
          type: MessageType.USER_ACTIVITY,
          payload: {
            activities: [
              { type: 'scroll', timestamp: Date.now() },
              { type: 'click', timestamp: Date.now() }
            ],
            pageTime: 45000, // 45 seconds
            isVisible: true
          }
        },
        { tab: publisherTab },
        jest.fn()
      );

      // 4. VAU submission on alarm
      const alarmListener = (chrome.alarms.onAlarm.addListener as jest.Mock).mock.calls[0]?.[0];
      
      // Mock VAU submission endpoint
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          vauId: 'vau123',
          earned: 5,
          totalEarned: 100
        })
      });

      await alarmListener({ name: 'vauSubmission' });

      // Verify VAU was submitted
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/vau/submit'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('publisher.com')
        })
      );

      // 5. Verify earnings notification shown
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: 'TWIST Earned!',
          message: expect.stringContaining('+5 TWIST')
        }),
        expect.any(Function)
      );

      // 6. Verify badge updated
      expect(chrome.action.setBadgeText).toHaveBeenCalled();
    });
  });

  describe('Influencer Discovery and Staking Journey', () => {
    it('should discover influencer and complete staking', async () => {
      // Setup authenticated user with wallet
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' },
        wallet: { publicKey: 'test-wallet-address' },
        balance: '1000000000000' // 1000 TWIST
      });

      // 1. User visits Twitter profile
      const twitterTab = {
        id: 2,
        url: 'https://twitter.com/cryptoinfluencer',
        title: 'Crypto Influencer (@cryptoinfluencer) / Twitter'
      };

      // Mock influencer search
      const mockInfluencer = {
        id: 'inf123',
        username: 'cryptoinfluencer',
        displayName: 'Crypto Influencer',
        avatar: 'https://example.com/avatar.jpg',
        tier: 'PLATINUM',
        metrics: {
          totalStaked: '50000000000000', // 50K TWIST
          stakerCount: 1500,
          apy: 18,
          volume24h: '1000000000000',
          avgStakeAmount: '33333333333'
        }
      };

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.searchInfluencers = jest.fn().mockResolvedValue([mockInfluencer]);

      // 2. Background detects influencer
      const onUpdatedListener = (chrome.tabs.onUpdated.addListener as jest.Mock).mock.calls[0]?.[0];
      await onUpdatedListener(2, { status: 'complete' }, twitterTab);

      // 3. Content script shows influencer badge
      const messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0]?.[0];
      
      // Verify influencer detection message sent
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.INFLUENCER_DETECTED,
        data: expect.objectContaining({
          influencer: mockInfluencer,
          platform: 'twitter'
        })
      });

      // 4. User clicks stake button in popup
      const stakeMessage = {
        type: MessageType.STAKE,
        params: {
          influencerId: 'inf123',
          amount: 100000000000 // 100 TWIST
        }
      };

      // Mock staking result
      TwistWebSDK.prototype.stakeOnInfluencer = jest.fn().mockResolvedValue({
        success: true,
        transactionId: 'tx789',
        stake: {
          amount: '100000000000',
          stakedAt: new Date().toISOString(),
          pendingRewards: '0',
          apy: 18
        }
      });

      await messageListener(stakeMessage, {}, jest.fn());

      // 5. Verify staking completed
      expect(TwistWebSDK.prototype.stakeOnInfluencer).toHaveBeenCalledWith({
        influencerId: 'inf123',
        amount: 100000000000,
        wallet: 'test-wallet-address'
      });

      // 6. Verify success notification
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: 'Staking Successful!',
          message: 'Staked 100 TWIST on cryptoinfluencer'
        }),
        expect.any(Function)
      );

      // 7. Verify staking alert set up for monitoring
      // This would track APY changes and reward accumulation
    });
  });

  describe('Rewards Claiming Journey', () => {
    it('should notify user and allow claiming rewards', async () => {
      // Setup user with existing stakes
      const mockStakes = [
        {
          influencer: {
            id: 'inf123',
            displayName: 'Top Influencer',
            username: 'topinfluencer',
            tier: 'GOLD',
            metrics: {
              totalStaked: '10000000000000',
              stakerCount: 500,
              apy: 20,
              volume24h: '500000000000',
              avgStakeAmount: '20000000000'
            }
          },
          stake: {
            amount: '500000000000', // 500 TWIST
            stakedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
            pendingRewards: '250000000000', // 250 TWIST rewards
            apy: 20
          }
        }
      ];

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' },
        wallet: { publicKey: 'test-wallet' },
        stakes: mockStakes
      });

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.getUserStakes = jest.fn().mockResolvedValue(mockStakes);

      // 1. Periodic check finds high rewards
      const alarmListener = (chrome.alarms.onAlarm.addListener as jest.Mock).mock.calls[0]?.[0];
      await alarmListener({ name: 'checkStakingRewards' });

      // Should show notification for high rewards
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: 'Rewards Available!',
          message: expect.stringContaining('250 TWIST to claim')
        }),
        expect.any(Function)
      );

      // 2. User clicks notification to claim
      const notificationListener = (chrome.notifications.onClicked.addListener as jest.Mock).mock.calls[0]?.[0];
      await notificationListener('rewards-notification');

      // Should open extension to rewards page
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('dashboard')
      });

      // 3. User claims rewards
      TwistWebSDK.prototype.claimRewards = jest.fn().mockResolvedValue({
        success: true,
        transactionId: 'claim-tx-123',
        claimedAmount: '250000000000'
      });

      const messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0]?.[0];
      await messageListener(
        {
          type: MessageType.CLAIM_REWARDS,
          influencerId: 'inf123'
        },
        {},
        jest.fn()
      );

      // 4. Verify claim success
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: 'Rewards Claimed!',
          message: 'Claimed 250 TWIST'
        }),
        expect.any(Function)
      );
    });
  });

  describe('Multi-Tab Publisher Tracking Journey', () => {
    it('should track activity across multiple publisher tabs', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' }
      });

      // Mock multiple publisher sites
      const publishers = [
        { domain: 'news.com', id: 'pub1' },
        { domain: 'blog.io', id: 'pub2' },
        { domain: 'media.net', id: 'pub3' }
      ];

      global.fetch = jest.fn().mockImplementation((url) => {
        const body = JSON.parse((url as any).body || '{}');
        const publisher = publishers.find(p => p.domain === body.domain);
        return Promise.resolve({
          ok: true,
          json: async () => publisher ? { ...publisher, verified: true } : null
        });
      });

      // 1. User opens multiple tabs
      const tabs = [
        { id: 1, url: 'https://news.com/article1', active: true },
        { id: 2, url: 'https://blog.io/post1', active: false },
        { id: 3, url: 'https://media.net/video1', active: false }
      ];

      // Simulate tab activations
      for (const tab of tabs) {
        const onUpdatedListener = (chrome.tabs.onUpdated.addListener as jest.Mock).mock.calls[0]?.[0];
        await onUpdatedListener(tab.id, { status: 'complete' }, tab);
      }

      // 2. Activity reported from all tabs
      const messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0]?.[0];
      
      for (const tab of tabs) {
        await messageListener(
          {
            type: MessageType.USER_ACTIVITY,
            payload: {
              activities: [{ type: 'scroll', timestamp: Date.now() }],
              pageTime: 60000,
              isVisible: tab.active
            }
          },
          { tab },
          jest.fn()
        );
      }

      // 3. VAU submission includes all active tabs
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          earned: 15, // 5 TWIST per site
          details: tabs.map(t => ({ siteId: t.url, earned: 5 }))
        })
      });

      const alarmListener = (chrome.alarms.onAlarm.addListener as jest.Mock).mock.calls[0]?.[0];
      await alarmListener({ name: 'vauSubmission' });

      // Should have submitted VAU for all active publisher tabs
      const fetchCalls = (fetch as jest.Mock).mock.calls;
      expect(fetchCalls.some(call => 
        call[1]?.body?.includes('news.com')
      )).toBeTruthy();
    });
  });

  describe('Security and Privacy Journey', () => {
    it('should respect privacy settings and block sensitive sites', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' },
        privacyMode: 'strict'
      });

      // 1. User visits banking site
      const bankingTab = {
        id: 4,
        url: 'https://mybank.com/account',
        title: 'My Bank - Account'
      };

      const onUpdatedListener = (chrome.tabs.onUpdated.addListener as jest.Mock).mock.calls[0]?.[0];
      await onUpdatedListener(4, { status: 'complete' }, bankingTab);

      // Should NOT track activity on sensitive sites
      const messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0]?.[0];
      
      await messageListener(
        {
          type: MessageType.USER_ACTIVITY,
          payload: { activities: [], pageTime: 0 }
        },
        { tab: bankingTab },
        jest.fn()
      );

      // Verify no VAU submission for banking site
      const alarmListener = (chrome.alarms.onAlarm.addListener as jest.Mock).mock.calls[0]?.[0];
      
      global.fetch = jest.fn();
      await alarmListener({ name: 'vauSubmission' });
      
      expect(fetch).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('mybank.com')
        })
      );

      // 2. Content script should detect and skip sensitive pages
      // This would be handled by the SecuritySandbox class
    });
  });

  describe('Extension Update Journey', () => {
    it('should check for updates and notify user', async () => {
      // Mock current version
      (chrome.runtime.getManifest as jest.Mock).mockReturnValue({
        version: '2.0.0'
      });

      // 1. Update check finds new version
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          available: true,
          version: '2.1.0',
          features: 'Bug fixes and performance improvements',
          updateUrl: 'https://chrome.google.com/webstore/detail/twist/update'
        })
      });

      // Trigger update check
      const alarmListener = (chrome.alarms.onAlarm.addListener as jest.Mock).mock.calls[0]?.[0];
      await alarmListener({ name: 'checkUpdates' });

      // 2. Should show update notification
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        'extension-update',
        expect.objectContaining({
          title: 'TWIST Extension Update Available',
          message: expect.stringContaining('Version 2.1.0'),
          buttons: [
            { title: 'Update Now' },
            { title: 'Later' }
          ]
        }),
        expect.any(Function)
      );

      // 3. User clicks update button
      const buttonListener = (chrome.notifications.onButtonClicked.addListener as jest.Mock).mock.calls[0]?.[0];
      await buttonListener('extension-update', 0);

      // Should open update URL
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://chrome.google.com/webstore/detail/twist/update'
      });
    });
  });

  describe('Error Recovery Journey', () => {
    it('should handle network errors gracefully', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' }
      });

      // 1. Network error during VAU submission
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const alarmListener = (chrome.alarms.onAlarm.addListener as jest.Mock).mock.calls[0]?.[0];
      await alarmListener({ name: 'vauSubmission' });

      // Should not crash, should queue for retry
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingVAUs: expect.any(Array)
        })
      );

      // 2. Retry on next alarm
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ earned: 5 })
      });

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' },
        pendingVAUs: [{ /* VAU data */ }]
      });

      await alarmListener({ name: 'vauSubmission' });

      // Should submit pending VAUs
      expect(fetch).toHaveBeenCalled();
      
      // Should clear pending queue on success
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingVAUs: []
        })
      );
    });

    it('should handle SDK initialization errors', async () => {
      // Mock SDK initialization failure
      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.mockImplementation(() => {
        throw new Error('Invalid API key');
      });

      // Should handle gracefully and show appropriate error
      const messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0]?.[0];
      
      const response = await messageListener(
        { type: MessageType.SEARCH_INFLUENCERS },
        {},
        jest.fn()
      );

      expect(response.error).toBeDefined();
      expect(response.error).toContain('SDK not initialized');
    });
  });
});