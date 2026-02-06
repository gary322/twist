import { 
  TwistWebSDK,
  UserIdentity as SDKUserIdentity,
  Influencer as SDKInfluencer,
  UserStake as SDKUserStake
} from '@twist/web-sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import { 
  Platform, 
  UserSession, 
  TabState, 
  ExtensionState,
  VAUData,
  VAUResponse,
  AuthPayload,
  AuthResponse,
  WalletPayload,
  ExtensionMessage,
  MessageType,
  ActivityPayload,
  RecentSite,
  ExtensionConfig,
  // v2.0 types
  UserIdentity,
  Influencer,
  InfluencerSearchParams,
  UserStake,
  StakingParams,
  Publisher,
  StakingAlert,
  TabInfo
} from '../types';
import { ExtensionUpdater } from '../update/updater';

// Configuration
const config: ExtensionConfig = {
  API_ENDPOINT: 'https://api.twist.io',
  VAU_ENDPOINT: 'https://vau.twist.io',
  UPDATE_INTERVAL: 5 * 60 * 1000, // 5 minutes
  MIN_TIME_ON_PAGE: 30000, // 30 seconds
  VAU_SUBMISSION_INTERVAL: 5 * 60 * 1000 // 5 minutes
};

class BackgroundService {
  private sdk: TwistWebSDK | null = null;
  private connection: Connection;
  private userIdentity: UserIdentity | null = null;
  private activeTabs: Map<number, TabInfo> = new Map();
  private stakingAlerts: Map<string, StakingAlert> = new Map();
  private publishers: Map<string, Publisher> = new Map();
  
  // Core state
  private state: ExtensionState = {
    session: {
      isAuthenticated: false,
      deviceId: crypto.randomUUID(),
      trustScore: 100
    },
    tabs: new Map(),
    totalEarnings: 0,
    dailyEarnings: 0,
    lastResetDate: new Date().toISOString().split('T')[0]
  };
  
  // Initialize update system
  private updater = new ExtensionUpdater();
  
  // Security tracking
  private securityAlerts: Array<{ timestamp: number; type: string; details: any }> = [];

  constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com');
    this.initialize();
  }

  private async initialize() {
    // Load stored API key
    const { apiKey } = await chrome.storage.local.get('apiKey');
    
    if (apiKey) {
      this.sdk = new TwistWebSDK({
        apiKey,
        environment: 'production',
      });
      
      // Load user identity
      const { identity } = await chrome.storage.local.get('identity');
      if (identity) {
        this.userIdentity = identity;
      }
    }
    
    // Load saved state
    const saved = await chrome.storage.local.get(['session', 'totalEarnings', 'dailyEarnings', 'lastResetDate', 'publishers']);
    if (saved.session) {
      this.state.session = saved.session;
    }
    if (saved.totalEarnings) {
      this.state.totalEarnings = saved.totalEarnings;
    }
    if (saved.dailyEarnings) {
      this.state.dailyEarnings = saved.dailyEarnings;
    }
    if (saved.lastResetDate) {
      this.state.lastResetDate = saved.lastResetDate;
    }
    if (saved.publishers) {
      this.publishers = new Map(Object.entries(saved.publishers));
    }
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Set up alarms for periodic tasks
    chrome.alarms.create('checkStakingRewards', { periodInMinutes: 30 });
    chrome.alarms.create('syncData', { periodInMinutes: 5 });
    chrome.alarms.create('vauSubmission', { periodInMinutes: 5 });
    chrome.alarms.create('dailyReset', {
      when: this.getNextMidnight(),
      periodInMinutes: 24 * 60
    });
    
    chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
  }

  private setupEventListeners() {
    // Tab tracking
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url) {
        this.updateTabState(activeInfo.tabId, tab.url, true);
        this.handleTabChange(tab);
      }
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.updateTabState(tabId, tab.url, tab.active || false);
        this.handleTabChange(tab);
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      const tabState = this.state.tabs.get(tabId);
      if (tabState && tabState.isActive) {
        this.submitVAU(tabId);
      }
      this.state.tabs.delete(tabId);
      this.activeTabs.delete(tabId);
    });

    // Message handling
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));
      return true; // Keep channel open for async response
    });

    // Context menu
    chrome.contextMenus.create({
      id: 'stake-on-influencer',
      title: 'Stake on this influencer',
      contexts: ['page'],
    });

    chrome.contextMenus.create({
      id: 'twist-verify-site',
      title: 'Verify this site with TWIST',
      contexts: ['page']
    });

    chrome.contextMenus.onClicked.addListener(this.handleContextMenu.bind(this));

    // Notification clicks
    chrome.notifications.onClicked.addListener(this.handleNotificationClick.bind(this));
    chrome.notifications.onButtonClicked.addListener(this.handleNotificationButton.bind(this));

    // Command shortcuts
    chrome.commands.onCommand.addListener((command) => {
      switch (command) {
        case 'open_popup':
          chrome.action.openPopup();
          break;
        case 'quick_stake':
          this.handleQuickStake();
          break;
      }
    });
  }

  private async handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<any> {
    switch (message.type) {
      case MessageType.AUTHENTICATE:
        return this.handleAuthentication(message.payload as AuthPayload);

      case MessageType.GET_STATE:
        return {
          session: this.state.session,
          earnings: {
            total: this.state.totalEarnings,
            daily: this.state.dailyEarnings
          }
        };

      case MessageType.SUBMIT_VAU:
        if (sender.tab?.id) {
          return this.submitVAU(sender.tab.id);
        }
        break;

      case MessageType.CONNECT_WALLET:
        return this.connectWallet(message.payload as WalletPayload);

      case MessageType.USER_ACTIVITY:
        if (sender.tab?.id) {
          this.handleUserActivity(sender.tab.id, message.payload as ActivityPayload);
        }
        break;

      case MessageType.LOGOUT:
        return this.handleLogout();

      case MessageType.GET_RECENT_SITES:
        return this.getRecentSites();

      case MessageType.SECURITY_ALERT:
        return this.handleSecurityAlert(message.payload);

      // v2.0 Features
      case MessageType.SEARCH_INFLUENCERS:
        return this.searchInfluencers(message.payload as InfluencerSearchParams);

      case MessageType.STAKE:
        return this.stakeOnInfluencer(message.payload as StakingParams);

      case MessageType.GET_USER_STAKES:
        return this.getUserStakes();

      case MessageType.CLAIM_REWARDS:
        return this.claimRewards(message.payload.influencerId);

      case MessageType.CHECK_PUBLISHER:
        return this.checkPublisher(sender.tab?.url);

      case MessageType.GET_BALANCE:
        return this.getBalance();

      case MessageType.GET_INFLUENCER_ON_PAGE:
        return this.detectInfluencerOnPage(sender.tab);

      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  private async identify(email: string): Promise<UserIdentity> {
    if (!this.sdk) {
      throw new Error('SDK not initialized');
    }

    const sdkIdentity = await this.sdk.identify(email);
    
    // Convert SDK identity to local identity
    const identity: UserIdentity = {
      userId: sdkIdentity.userId,
      email: sdkIdentity.email,
      deviceId: sdkIdentity.deviceId,
      trustScore: sdkIdentity.trustScore,
      createdAt: sdkIdentity.createdAt
    };
    
    this.userIdentity = identity;

    // Store identity
    await chrome.storage.local.set({ identity });

    // Update badge
    this.updateExtensionBadge();

    return identity;
  }

  private async searchInfluencers(params: InfluencerSearchParams): Promise<Influencer[]> {
    if (!this.sdk) {
      throw new Error('SDK not initialized');
    }

    const sdkResults = await this.sdk.searchInfluencers(params);
    
    // Convert SDK influencers to local influencers
    const results: Influencer[] = sdkResults.map((inf: SDKInfluencer) => ({
      id: inf.id,
      username: inf.username,
      displayName: inf.displayName,
      avatar: inf.avatar,
      tier: inf.tier,
      metrics: {
        totalStaked: inf.metrics.totalStaked,
        stakerCount: inf.metrics.stakerCount,
        apy: inf.metrics.apy,
        volume24h: inf.metrics.volume24h,
        avgStakeAmount: inf.metrics.avgStakeAmount
      }
    }));

    // Cache recent searches
    const { recentSearches = [] } = await chrome.storage.local.get('recentSearches');
    recentSearches.unshift({ params, timestamp: Date.now() });
    await chrome.storage.local.set({
      recentSearches: recentSearches.slice(0, 10)
    });

    return results;
  }

  private async stakeOnInfluencer(params: StakingParams) {
    if (!this.sdk) {
      throw new Error('SDK not initialized');
    }

    // Check wallet connection
    const { wallet } = await chrome.storage.local.get('wallet');
    if (!wallet) {
      throw new Error('Wallet not connected');
    }

    const result = await this.sdk.stakeOnInfluencer({
      ...params,
      wallet: wallet.publicKey,
    });

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
      title: 'Staking Successful!',
      message: `Staked ${params.amount / 10 ** 9} TWIST on ${params.influencerId}`,
      buttons: [
        { title: 'View Details' },
        { title: 'Share' }
      ]
    });

    // Update staking alerts
    this.setupStakingAlert(params.influencerId);

    return result;
  }

  private async getUserStakes(): Promise<UserStake[]> {
    if (!this.sdk || !this.userIdentity) {
      throw new Error('User not identified');
    }

    const sdkStakes = await this.sdk.getUserStakes();
    
    // Convert SDK stakes to local stakes
    const stakes: UserStake[] = sdkStakes.map((stake: SDKUserStake) => ({
      influencer: {
        id: stake.influencer.id,
        username: stake.influencer.username,
        displayName: stake.influencer.displayName,
        avatar: stake.influencer.avatar,
        tier: stake.influencer.tier,
        metrics: {
          totalStaked: stake.influencer.metrics.totalStaked,
          stakerCount: stake.influencer.metrics.stakerCount,
          apy: stake.influencer.metrics.apy,
          volume24h: stake.influencer.metrics.volume24h,
          avgStakeAmount: stake.influencer.metrics.avgStakeAmount
        }
      },
      stake: {
        amount: stake.stake.amount,
        stakedAt: new Date(stake.stake.stakedAt).getTime(),
        pendingRewards: stake.stake.pendingRewards,
        apy: stake.stake.apy
      }
    }));

    // Calculate total pending rewards
    const totalPending = stakes.reduce(
      (sum: bigint, stake: UserStake) => sum + BigInt(stake.stake.pendingRewards),
      BigInt(0)
    );

    // Update badge if significant rewards
    if (totalPending > BigInt(10 * 10 ** 9)) { // > 10 TWIST
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
    }

    return stakes;
  }

  private async claimRewards(influencerId: string) {
    if (!this.sdk) {
      throw new Error('SDK not initialized');
    }

    const result = await this.sdk.claimRewards(influencerId);

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
      title: 'Rewards Claimed!',
      message: `Claimed ${Number(result.claimedAmount) / 10 ** 9} TWIST`,
      buttons: [{ title: 'View Transaction' }]
    });

    return result;
  }

  private async checkPublisher(url?: string): Promise<Publisher | null> {
    if (!url) return null;

    const domain = new URL(url).hostname;
    
    // Check cache
    if (this.publishers.has(domain)) {
      return this.publishers.get(domain)!;
    }

    // Check with API
    try {
      const response = await fetch(`${config.API_ENDPOINT}/api/v1/publishers/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });

      if (response.ok) {
        const publisher = await response.json();
        this.publishers.set(domain, publisher);
        
        // Save to storage
        const publishersObj = Object.fromEntries(this.publishers);
        await chrome.storage.local.set({ publishers: publishersObj });
        
        return publisher;
      }
    } catch (error) {
      console.error('Failed to check publisher:', error);
    }

    return null;
  }

  private async detectInfluencerOnPage(tab?: chrome.tabs.Tab) {
    if (!tab?.url || !this.sdk) return null;

    // Check social media platforms
    const patterns = [
      { regex: /twitter\.com\/(\w+)/, platform: 'twitter' },
      { regex: /x\.com\/(\w+)/, platform: 'twitter' },
      { regex: /instagram\.com\/(\w+)/, platform: 'instagram' },
      { regex: /youtube\.com\/@(\w+)/, platform: 'youtube' },
      { regex: /tiktok\.com\/@(\w+)/, platform: 'tiktok' },
      { regex: /twitch\.tv\/(\w+)/, platform: 'twitch' },
    ];

    for (const pattern of patterns) {
      const match = tab.url.match(pattern.regex);
      if (match) {
        const username = match[1];
        
        // Skip common non-profile pages
        const skipList = ['home', 'explore', 'notifications', 'messages', 'settings'];
        if (skipList.includes(username.toLowerCase())) {
          continue;
        }

        // Search for influencer
        const results = await this.sdk.searchInfluencers({
          query: username,
          limit: 1,
        });

        if (results.length > 0 && results[0].username.toLowerCase() === username.toLowerCase()) {
          return {
            influencer: results[0],
            platform: pattern.platform,
          };
        }
      }
    }

    return null;
  }

  private async getBalance(): Promise<bigint> {
    const { wallet } = await chrome.storage.local.get('wallet');
    if (!wallet || !this.sdk) return BigInt(0);

    return this.sdk.getBalance(wallet.publicKey);
  }

  private setupStakingAlert(influencerId: string) {
    // Set up monitoring for this influencer
    this.stakingAlerts.set(influencerId, {
      influencerId,
      lastCheck: Date.now(),
      lastApy: 0,
    });
  }

  private async handleAlarm(alarm: chrome.alarms.Alarm) {
    switch (alarm.name) {
      case 'checkStakingRewards':
        await this.checkAllStakingRewards();
        break;
      case 'syncData':
        await this.syncData();
        break;
      case 'vauSubmission':
        await this.submitPendingVAUs();
        break;
      case 'dailyReset':
        this.resetDailyStats();
        break;
    }
  }

  private async checkAllStakingRewards() {
    try {
      const stakes = await this.getUserStakes();

      for (const stake of stakes) {
        const pendingRewards = BigInt(stake.stake.pendingRewards);

        // Alert if rewards > 100 TWIST
        if (pendingRewards > BigInt(100 * 10 ** 9)) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
            title: 'Rewards Available!',
            message: `You have ${pendingRewards / BigInt(10 ** 9)} TWIST to claim from ${stake.influencer.displayName}`,
            buttons: [{ title: 'Claim Now' }]
          });
        }

        // Check APY changes
        const alert = this.stakingAlerts.get(stake.influencer.id);
        if (alert && Math.abs(stake.stake.apy - alert.lastApy) > 5) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
            title: 'APY Change Alert',
            message: `${stake.influencer.displayName} APY changed from ${alert.lastApy}% to ${stake.stake.apy}%`,
          });

          alert.lastApy = stake.stake.apy;
        }
      }
    } catch (error) {
      console.error('Failed to check staking rewards:', error);
    }
  }

  private async syncData() {
    if (!this.userIdentity || !this.sdk) return;

    try {
      // Sync user data
      const [balance, stakes, metrics] = await Promise.all([
        this.getBalance(),
        this.getUserStakes(),
        this.sdk.getTokenMetrics(),
      ]);

      await chrome.storage.local.set({
        balance: balance.toString(),
        stakes,
        tokenMetrics: metrics,
        lastSync: Date.now(),
      });
    } catch (error) {
      console.error('Failed to sync data:', error);
    }
  }

  private async handleTabChange(tab: chrome.tabs.Tab) {
    // Check for influencer on page
    const detected = await this.detectInfluencerOnPage(tab);
    if (detected) {
      // Update popup with detected influencer
      chrome.runtime.sendMessage({
        type: MessageType.INFLUENCER_DETECTED,
        data: detected,
      }).catch(() => {
        // Ignore errors if popup is not open
      });
    }

    // Track active time
    this.activeTabs.set(tab.id!, {
      url: tab.url!,
      startTime: Date.now(),
      publisher: await this.checkPublisher(tab.url),
    });
  }

  private async handleContextMenu(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
    if (info.menuItemId === 'stake-on-influencer' && tab) {
      const detected = await this.detectInfluencerOnPage(tab);
      if (detected) {
        // Open popup with staking modal
        chrome.action.openPopup();
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: MessageType.OPEN_STAKING_MODAL,
            data: detected.influencer,
          }).catch(() => {
            // Ignore if popup not open
          });
        }, 100);
      }
    } else if (info.menuItemId === 'twist-verify-site' && tab?.url) {
      // Open verification page
      chrome.tabs.create({ 
        url: `${config.API_ENDPOINT}/verify?url=${encodeURIComponent(tab.url)}` 
      });
    }
  }

  private handleNotificationClick(notificationId: string) {
    // Open relevant page based on notification
    chrome.tabs.create({ url: 'https://twist.to/dashboard' });
  }

  private handleNotificationButton(notificationId: string, buttonIndex: number) {
    // Handle notification button clicks
    if (notificationId.includes('staking')) {
      if (buttonIndex === 0) {
        chrome.tabs.create({ url: 'https://twist.to/dashboard/stakes' });
      }
    }
  }

  private async handleQuickStake() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const detected = await this.detectInfluencerOnPage(tab);
      if (detected) {
        chrome.action.openPopup();
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: MessageType.OPEN_STAKING_MODAL,
            data: detected.influencer,
          }).catch(() => {});
        }, 100);
      }
    }
  }

  // Core functionality from v1.0
  private updateTabState(tabId: number, url: string, isActive: boolean) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Skip chrome:// and other special URLs
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return;
      }

      const existing = this.state.tabs.get(tabId);
      this.state.tabs.set(tabId, {
        url,
        domain,
        startTime: existing?.startTime || Date.now(),
        isActive,
        vauSubmitted: false,
        earnings: existing?.earnings || 0
      });

      // Check if site is verified
      this.checkSiteVerification(domain);
    } catch (error) {
      console.error('[TWIST] Invalid URL:', url);
    }
  }

  private async handleAuthentication(payload: AuthPayload): Promise<AuthResponse> {
    try {
      const response = await fetch(`${config.API_ENDPOINT}/api/v1/auth/extension-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Extension-Version': chrome.runtime.getManifest().version
        },
        body: JSON.stringify({
          ...payload,
          deviceId: this.state.session.deviceId,
          platform: Platform.WEB
        })
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const data = await response.json();

      this.state.session = {
        email: data.email,
        walletAddress: data.walletAddress,
        isAuthenticated: true,
        deviceId: this.state.session.deviceId,
        trustScore: data.trustScore || 100
      };

      // Save session
      await chrome.storage.local.set({ session: this.state.session });

      // Initialize SDK with API key if provided
      if (data.apiKey) {
        await chrome.storage.local.set({ apiKey: data.apiKey });
        this.sdk = new TwistWebSDK({
          apiKey: data.apiKey,
          environment: 'production',
        });
      }

      // Identify user
      await this.identify(data.email);

      // Update extension icon
      this.updateExtensionBadge();

      return { success: true, email: data.email, walletAddress: data.walletAddress };
    } catch (error: any) {
      console.error('[TWIST] Authentication error:', error);
      return { success: false, error: error.message };
    }
  }

  private async submitVAU(tabId: number): Promise<VAUResponse | null> {
    const tabState = this.state.tabs.get(tabId);
    if (!tabState || !this.state.session.isAuthenticated || tabState.vauSubmitted) {
      return null;
    }

    const timeSpent = Date.now() - tabState.startTime;

    // Require minimum time on page
    if (timeSpent < config.MIN_TIME_ON_PAGE) {
      return null;
    }

    try {
      const vauData: VAUData = {
        userId: this.state.session.email || '',
        deviceId: this.state.session.deviceId,
        siteId: tabState.domain,
        platform: Platform.WEB,
        timeSpent,
        attestation: {
          source: 'browser_extension',
          version: chrome.runtime.getManifest().version,
          trustScore: this.state.session.trustScore
        }
      };

      const response = await fetch(`${config.API_ENDPOINT}/api/v1/vau/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Extension-Version': chrome.runtime.getManifest().version
        },
        body: JSON.stringify(vauData)
      });

      if (response.ok) {
        const vau: VAUResponse = await response.json();

        // Update earnings
        this.state.totalEarnings += vau.earned;
        this.state.dailyEarnings += vau.earned;
        tabState.earnings += vau.earned;
        tabState.vauSubmitted = true;

        // Save state
        await chrome.storage.local.set({
          totalEarnings: this.state.totalEarnings,
          dailyEarnings: this.state.dailyEarnings
        });

        // Update recent sites
        await this.updateRecentSites(tabState.domain, vau.earned);

        // Update badge
        this.updateExtensionBadge();

        // Show notification
        if (vau.earned > 0) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
            title: 'TWIST Earned!',
            message: `+${vau.earned} TWIST from ${tabState.domain}`,
            priority: 1
          });
        }

        return vau;
      }
    } catch (error) {
      console.error('[TWIST] VAU submission error:', error);
    }

    return null;
  }

  private async submitPendingVAUs() {
    const activeTabs = Array.from(this.state.tabs.entries())
      .filter(([_, tabState]) => tabState.isActive && !tabState.vauSubmitted);

    for (const [tabId, _] of activeTabs) {
      await this.submitVAU(tabId);
    }
  }

  private async connectWallet(payload: WalletPayload): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${config.API_ENDPOINT}/api/v1/wallet/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: this.state.session.email,
          walletAddress: payload.address,
          signature: payload.signature,
          platform: Platform.WEB
        })
      });

      if (response.ok) {
        this.state.session.walletAddress = payload.address;
        await chrome.storage.local.set({ session: this.state.session });
        
        // Link wallet with SDK
        if (this.sdk && this.userIdentity) {
          await this.sdk.linkWallet(this.userIdentity.userId, payload.address);
        }
        
        return { success: true };
      }

      throw new Error('Failed to connect wallet');
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async checkSiteVerification(domain: string) {
    try {
      const response = await fetch(`${config.API_ENDPOINT}/api/v1/sites/verify/${domain}`);
      const data = await response.json();

      if (data.verified) {
        // Inject VAU detector into verified sites
        chrome.tabs.query({ url: `*://${domain}/*` }, (tabs) => {
          tabs.forEach(tab => {
            if (tab.id) {
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['inject/vau-detector.js']
              });
            }
          });
        });
      }
    } catch (error) {
      console.error('[TWIST] Site verification check failed:', error);
    }
  }

  private updateExtensionBadge() {
    if (this.state.dailyEarnings > 0) {
      chrome.action.setBadgeText({ text: `${this.state.dailyEarnings}` });
      chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }

  private resetDailyStats() {
    this.state.dailyEarnings = 0;
    this.state.lastResetDate = new Date().toISOString().split('T')[0];
    chrome.storage.local.set({ 
      dailyEarnings: 0, 
      lastResetDate: this.state.lastResetDate 
    });
    this.updateExtensionBadge();
  }

  private getNextMidnight(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  private handleUserActivity(tabId: number, activity: ActivityPayload) {
    const tabState = this.state.tabs.get(tabId);
    if (!tabState) return;

    // Update last activity time
    tabState.lastActivity = Date.now();
    
    // Track engagement for better VAU calculation
    if (activity.activities.length > 0) {
      // Activity detected, tab is active
      tabState.isActive = true;
    }
  }

  private async handleLogout(): Promise<{ success: boolean }> {
    // Clear session
    this.state.session = {
      isAuthenticated: false,
      deviceId: this.state.session.deviceId,
      trustScore: 100
    };

    // Clear SDK
    this.sdk = null;
    this.userIdentity = null;

    // Clear stored data
    await chrome.storage.local.remove(['session', 'totalEarnings', 'dailyEarnings', 'identity', 'apiKey']);

    // Reset badge
    chrome.action.setBadgeText({ text: '' });

    // Reset state
    this.state.totalEarnings = 0;
    this.state.dailyEarnings = 0;
    this.state.tabs.clear();

    return { success: true };
  }

  private async getRecentSites(): Promise<RecentSite[]> {
    const stored = await chrome.storage.local.get('recentSites');
    return stored.recentSites || [];
  }

  private async updateRecentSites(domain: string, earned: number) {
    const recentSites = await this.getRecentSites();
    
    // Find existing site or create new entry
    const existingIndex = recentSites.findIndex(site => site.domain === domain);
    
    if (existingIndex >= 0) {
      recentSites[existingIndex].earned += earned;
      recentSites[existingIndex].lastVisit = Date.now();
    } else {
      recentSites.push({
        domain,
        earned,
        lastVisit: Date.now()
      });
    }

    // Keep only the 10 most recent sites
    recentSites.sort((a, b) => b.lastVisit - a.lastVisit);
    const topSites = recentSites.slice(0, 10);

    await chrome.storage.local.set({ recentSites: topSites });
    return topSites;
  }

  private async handleSecurityAlert(alert: any): Promise<{ success: boolean }> {
    // Log security alert
    this.securityAlerts.push({
      timestamp: Date.now(),
      type: alert.type,
      details: alert.details
    });

    // Keep only last 100 alerts
    if (this.securityAlerts.length > 100) {
      this.securityAlerts.splice(0, this.securityAlerts.length - 100);
    }

    // Store alerts
    await chrome.storage.local.set({ securityAlerts: this.securityAlerts });

    // Notify user for critical alerts
    if (alert.type === 'suspicious_script' || alert.type === 'unauthorized_script') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
        title: 'Security Alert',
        message: `Blocked suspicious activity on ${alert.details.url}`,
        priority: 2
      });
    }

    // Report to server for analysis
    try {
      await fetch(`${config.API_ENDPOINT}/api/v1/security/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Extension-Version': chrome.runtime.getManifest().version
        },
        body: JSON.stringify({
          alert,
          deviceId: this.state.session.deviceId,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.error('[TWIST] Failed to report security alert:', error);
    }

    return { success: true };
  }
}

// Initialize background service
new BackgroundService();

// Export for testing
export { BackgroundService };