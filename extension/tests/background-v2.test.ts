import { MessageType } from '../types';
import '../jest.setup';

// Mock modules
jest.mock('@twist/web-sdk');
jest.mock('@solana/web3.js');

describe('Background Service v2.0', () => {
  let mockSendResponse: jest.Mock;
  let backgroundService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendResponse = jest.fn();
    
    // Reset chrome mock
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
    (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);
  });

  describe('Message Handling', () => {
    it('should handle AUTHENTICATE message', async () => {
      const mockIdentity = {
        userId: 'test-user',
        email: 'test@example.com',
        deviceId: 'test-device',
        trustScore: 100,
        createdAt: new Date().toISOString(),
      };

      // Mock SDK response
      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.identify = jest.fn().mockResolvedValue(mockIdentity);

      // Import after mocks are set up
      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      await backgroundService.handleMessage(
        {
          type: MessageType.AUTHENTICATE,
          payload: { email: 'test@example.com' }
        },
        {}
      );

      expect(TwistWebSDK.prototype.identify).toHaveBeenCalledWith('test@example.com');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ identity: mockIdentity });
    });

    it('should handle SEARCH_INFLUENCERS message', async () => {
      const mockInfluencers = [
        {
          id: 'inf1',
          username: 'testuser',
          displayName: 'Test User',
          tier: 'GOLD',
          metrics: {
            totalStaked: '1000000000000',
            stakerCount: 100,
            apy: 15,
            volume24h: '500000000000',
            avgStakeAmount: '10000000000'
          }
        }
      ];

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.searchInfluencers = jest.fn().mockResolvedValue(mockInfluencers);

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      const result = await backgroundService.handleMessage(
        {
          type: MessageType.SEARCH_INFLUENCERS,
          params: { query: 'test', sortBy: 'apy' }
        },
        {}
      );

      expect(TwistWebSDK.prototype.searchInfluencers).toHaveBeenCalledWith({
        query: 'test',
        sortBy: 'apy'
      });
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('testuser');
    });

    it('should handle STAKE message', async () => {
      const mockStakeResult = {
        success: true,
        transactionId: 'tx123',
        stake: {
          amount: '100000000000',
          stakedAt: new Date().toISOString(),
          pendingRewards: '0',
          apy: 15
        }
      };

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        wallet: { publicKey: 'test-wallet' },
        identity: { userId: 'test-user' }
      });

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.stakeOnInfluencer = jest.fn().mockResolvedValue(mockStakeResult);

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      const result = await backgroundService.handleMessage(
        {
          type: MessageType.STAKE,
          params: {
            influencerId: 'inf1',
            amount: 100000000000
          }
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('tx123');
      expect(chrome.notifications.create).toHaveBeenCalled();
    });

    it('should handle GET_USER_STAKES message', async () => {
      const mockStakes = [
        {
          influencer: {
            id: 'inf1',
            username: 'testuser',
            displayName: 'Test User',
            tier: 'GOLD',
            metrics: {
              totalStaked: '1000000000000',
              stakerCount: 100,
              apy: 15,
              volume24h: '500000000000',
              avgStakeAmount: '10000000000'
            }
          },
          stake: {
            amount: '100000000000',
            stakedAt: new Date().toISOString(),
            pendingRewards: '5000000000',
            apy: 15
          }
        }
      ];

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' }
      });

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.getUserStakes = jest.fn().mockResolvedValue(mockStakes);

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      const result = await backgroundService.handleMessage(
        { type: MessageType.GET_USER_STAKES },
        {}
      );

      expect(result).toHaveLength(1);
      expect(result[0].stake.pendingRewards).toBe('5000000000');
    });

    it('should handle CLAIM_REWARDS message', async () => {
      const mockClaimResult = {
        success: true,
        transactionId: 'tx456',
        claimedAmount: '5000000000'
      };

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.claimRewards = jest.fn().mockResolvedValue(mockClaimResult);

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      const result = await backgroundService.handleMessage(
        {
          type: MessageType.CLAIM_REWARDS,
          influencerId: 'inf1'
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: 'Rewards Claimed!',
          message: 'Claimed 5 TWIST'
        }),
        expect.any(Function)
      );
    });

    it('should handle CHECK_PUBLISHER message', async () => {
      const mockPublisher = {
        id: 'pub1',
        domain: 'example.com',
        verified: true,
        name: 'Example Publisher'
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPublisher
      });

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      const result = await backgroundService.handleMessage(
        { type: MessageType.CHECK_PUBLISHER },
        { tab: { url: 'https://example.com/page' } }
      );

      expect(result).toEqual(mockPublisher);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/publishers/check'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ domain: 'example.com' })
        })
      );
    });

    it('should handle GET_INFLUENCER_ON_PAGE message', async () => {
      const mockInfluencer = {
        id: 'inf1',
        username: 'testuser',
        displayName: 'Test User',
        tier: 'GOLD',
        metrics: {
          totalStaked: '1000000000000',
          stakerCount: 100,
          apy: 15,
          volume24h: '500000000000',
          avgStakeAmount: '10000000000'
        }
      };

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.searchInfluencers = jest.fn().mockResolvedValue([mockInfluencer]);

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      const result = await backgroundService.handleMessage(
        { type: MessageType.GET_INFLUENCER_ON_PAGE },
        { tab: { url: 'https://twitter.com/testuser' } }
      );

      expect(result).toEqual({
        influencer: mockInfluencer,
        platform: 'twitter'
      });
    });
  });

  describe('Publisher Detection', () => {
    it('should cache publisher checks', async () => {
      const mockPublisher = {
        id: 'pub1',
        domain: 'example.com',
        verified: true
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPublisher
      });

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      // First call
      await backgroundService.checkPublisher('https://example.com');
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await backgroundService.checkPublisher('https://example.com');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle publisher check failures gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      const result = await backgroundService.checkPublisher('https://example.com');
      expect(result).toBeNull();
    });
  });

  describe('Influencer Detection', () => {
    const testCases = [
      {
        url: 'https://twitter.com/testuser',
        platform: 'twitter',
        username: 'testuser'
      },
      {
        url: 'https://instagram.com/testuser',
        platform: 'instagram',
        username: 'testuser'
      },
      {
        url: 'https://youtube.com/@testchannel',
        platform: 'youtube',
        username: 'testchannel'
      },
      {
        url: 'https://tiktok.com/@testuser',
        platform: 'tiktok',
        username: 'testuser'
      }
    ];

    testCases.forEach(({ url, platform, username }) => {
      it(`should detect ${platform} influencer from URL`, async () => {
        const mockInfluencer = {
          id: 'inf1',
          username,
          displayName: 'Test User',
          tier: 'GOLD',
          metrics: {
            totalStaked: '1000000000000',
            stakerCount: 100,
            apy: 15,
            volume24h: '500000000000',
            avgStakeAmount: '10000000000'
          }
        };

        const { TwistWebSDK } = require('@twist/web-sdk');
        TwistWebSDK.prototype.searchInfluencers = jest.fn().mockResolvedValue([mockInfluencer]);

        const { BackgroundService } = require('../background/service-worker-v2');
        backgroundService = new BackgroundService();

        const result = await backgroundService.detectInfluencerOnPage({ url });

        expect(result).toBeTruthy();
        expect(result.platform).toBe(platform);
        expect(result.influencer.username).toBe(username);
      });
    });

    it('should return null for non-social media URLs', async () => {
      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      const result = await backgroundService.detectInfluencerOnPage({
        url: 'https://example.com'
      });

      expect(result).toBeNull();
    });
  });

  describe('Staking Notifications', () => {
    it('should create notification when rewards exceed threshold', async () => {
      const mockStakes = [
        {
          influencer: {
            id: 'inf1',
            displayName: 'Test User',
            username: 'testuser',
            tier: 'GOLD',
            metrics: {
              totalStaked: '1000000000000',
              stakerCount: 100,
              apy: 15,
              volume24h: '500000000000',
              avgStakeAmount: '10000000000'
            }
          },
          stake: {
            amount: '100000000000',
            stakedAt: new Date().toISOString(),
            pendingRewards: '150000000000', // > 100 TWIST
            apy: 15
          }
        }
      ];

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' }
      });

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.getUserStakes = jest.fn().mockResolvedValue(mockStakes);

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      await backgroundService.checkAllStakingRewards();

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: 'Rewards Available!',
          message: expect.stringContaining('150 TWIST to claim')
        }),
        expect.any(Function)
      );
    });

    it('should alert on significant APY changes', async () => {
      const mockStakes = [
        {
          influencer: {
            id: 'inf1',
            displayName: 'Test User',
            username: 'testuser',
            tier: 'GOLD',
            metrics: {
              totalStaked: '1000000000000',
              stakerCount: 100,
              apy: 25, // Changed from 15
              volume24h: '500000000000',
              avgStakeAmount: '10000000000'
            }
          },
          stake: {
            amount: '100000000000',
            stakedAt: new Date().toISOString(),
            pendingRewards: '5000000000',
            apy: 25
          }
        }
      ];

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' }
      });

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.getUserStakes = jest.fn().mockResolvedValue(mockStakes);

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      // Set up previous APY
      backgroundService.stakingAlerts.set('inf1', {
        influencerId: 'inf1',
        lastCheck: Date.now(),
        lastApy: 15
      });

      await backgroundService.checkAllStakingRewards();

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: 'APY Change Alert',
          message: expect.stringContaining('APY changed from 15% to 25%')
        }),
        expect.any(Function)
      );
    });
  });

  describe('Data Synchronization', () => {
    it('should sync user data periodically', async () => {
      const mockBalance = BigInt(500000000000);
      const mockStakes = [];
      const mockMetrics = {
        price: 0.05,
        marketCap: '1000000000',
        volume24h: '50000000',
        totalSupply: '10000000000'
      };

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' },
        wallet: { publicKey: 'test-wallet' }
      });

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.getBalance = jest.fn().mockResolvedValue(mockBalance);
      TwistWebSDK.prototype.getUserStakes = jest.fn().mockResolvedValue(mockStakes);
      TwistWebSDK.prototype.getTokenMetrics = jest.fn().mockResolvedValue(mockMetrics);

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      await backgroundService.syncData();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        balance: mockBalance.toString(),
        stakes: mockStakes,
        tokenMetrics: mockMetrics,
        lastSync: expect.any(Number)
      });
    });
  });

  describe('Context Menu', () => {
    it('should create context menu for staking', async () => {
      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      await backgroundService.setupEventListeners();

      expect(chrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'stake-on-influencer',
        title: 'Stake on this influencer',
        contexts: ['page']
      });
    });

    it('should handle context menu click on influencer page', async () => {
      const mockInfluencer = {
        id: 'inf1',
        username: 'testuser',
        displayName: 'Test User',
        tier: 'GOLD',
        metrics: {
          totalStaked: '1000000000000',
          stakerCount: 100,
          apy: 15,
          volume24h: '500000000000',
          avgStakeAmount: '10000000000'
        }
      };

      const { TwistWebSDK } = require('@twist/web-sdk');
      TwistWebSDK.prototype.searchInfluencers = jest.fn().mockResolvedValue([mockInfluencer]);

      const { BackgroundService } = require('../background/service-worker-v2');
      backgroundService = new BackgroundService();

      await backgroundService.handleContextMenu(
        { menuItemId: 'stake-on-influencer' },
        { url: 'https://twitter.com/testuser' }
      );

      expect(chrome.action.openPopup).toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.OPEN_STAKING_MODAL,
        data: mockInfluencer
      });
    });
  });
});