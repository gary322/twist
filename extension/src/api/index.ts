interface SearchParams {
  query?: string;
  sortBy?: string;
  filters?: any;
  limit?: number;
  offset?: number;
}

interface StakeParams {
  influencerId: string;
  amount: string;
  wallet: string;
}

class ExtensionAPI {
  private baseURL: string;
  private token: string | null = null;

  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'https://api.twist.to';
    this.loadAuthToken();
  }

  private async loadAuthToken() {
    // Get auth token from extension storage
    chrome.storage.local.get(['authToken'], (result) => {
      this.token = result.authToken || null;
    });
  }

  private async getHeaders() {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const headers = await this.getHeaders();
    
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
  }

  // Authentication
  async authenticate(token: string) {
    this.token = token;
    await chrome.storage.local.set({ authToken: token });
  }

  async logout() {
    this.token = null;
    await chrome.storage.local.remove('authToken');
  }

  async isAuthenticated(): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['authToken'], (result) => {
        resolve(!!result.authToken);
      });
    });
  }

  // Staking APIs
  async searchInfluencers(params: SearchParams) {
    const queryParams = new URLSearchParams();
    
    if (params.query) queryParams.append('query', params.query);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    
    if (params.filters) {
      Object.entries(params.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(`filters[${key}]`, value.toString());
        }
      });
    }

    return this.request(`/api/staking/search?${queryParams.toString()}`);
  }

  async getUserStakes() {
    return this.request('/api/staking/user/stakes');
  }

  async getInfluencerDetails(influencerId: string) {
    return this.request(`/api/staking/influencer/${influencerId}/details`);
  }

  async stakeOnInfluencer(params: StakeParams) {
    return this.request('/api/staking/stake', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async unstake(params: { influencerId: string; amount: string; wallet: string }) {
    return this.request('/api/staking/unstake', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async claimRewards(params: { influencerId: string; wallet: string }) {
    return this.request('/api/staking/claim', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Portfolio APIs
  async getPortfolioStats() {
    return this.request('/api/portfolio/stats');
  }

  async getStakingHistory(limit: number = 10) {
    return this.request(`/api/staking/history?limit=${limit}`);
  }

  // Notification APIs
  async getNotifications(unreadOnly: boolean = false) {
    return this.request(`/api/notifications?unreadOnly=${unreadOnly}`);
  }

  async markNotificationAsRead(notificationId: string) {
    return this.request(`/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
    });
  }

  async getUnreadCount(): Promise<number> {
    const notifications = await this.getNotifications(true);
    return notifications.length;
  }

  // Quick Actions
  async getTopInfluencers(limit: number = 10) {
    return this.searchInfluencers({
      sortBy: 'totalStaked',
      limit,
    });
  }

  async getTrendingInfluencers(limit: number = 10) {
    return this.searchInfluencers({
      sortBy: 'trending',
      limit,
    });
  }

  async getInfluencersByAPY(minAPY: number = 10, limit: number = 10) {
    return this.searchInfluencers({
      sortBy: 'apy',
      filters: { minApy: minAPY },
      limit,
    });
  }

  // User Settings
  async getUserSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['settings'], (result) => {
        resolve(result.settings || {
          notifications: true,
          autoRefresh: true,
          refreshInterval: 60000, // 1 minute
          theme: 'light',
        });
      });
    });
  }

  async updateUserSettings(settings: any) {
    await chrome.storage.sync.set({ settings });
  }

  // Badge Management
  async updateBadge() {
    try {
      const unreadCount = await this.getUnreadCount();
      
      if (unreadCount > 0) {
        chrome.action.setBadgeText({ text: unreadCount.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#805ad5' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
    } catch (error) {
      console.error('Failed to update badge:', error);
    }
  }

  // Context Menu Actions
  async createContextMenus() {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'stake-on-influencer',
        title: 'Stake on this influencer',
        contexts: ['link'],
        targetUrlPatterns: ['*://twitter.com/*', '*://x.com/*', '*://instagram.com/*'],
      });

      chrome.contextMenus.create({
        id: 'search-influencer',
        title: 'Search "%s" on Twist',
        contexts: ['selection'],
      });
    });
  }

  // Background sync
  async syncData() {
    if (!(await this.isAuthenticated())) return;

    try {
      // Sync portfolio data
      const stakes = await this.getUserStakes();
      await chrome.storage.local.set({ 
        portfolio: stakes,
        lastSync: Date.now(),
      });

      // Update badge with notifications
      await this.updateBadge();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }
}

export const extensionApi = new ExtensionAPI();