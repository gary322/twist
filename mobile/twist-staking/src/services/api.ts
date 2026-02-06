import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://api.twist.to/v1';

interface ApiConfig {
  baseURL: string;
  headers: Record<string, string>;
}

class ApiService {
  private config: ApiConfig = {
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  private async getAuthToken(): Promise<string | null> {
    return await AsyncStorage.getItem('auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAuthToken();
    
    const headers = {
      ...this.config.headers,
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${this.config.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  // Platform Stats
  async getPlatformStats() {
    return this.request<{
      totalStaked: string;
      totalStakers: number;
      averageApy: number;
    }>('/stats/platform');
  }

  // Influencer Search
  async searchInfluencers(params: {
    query?: string;
    sortBy?: 'totalStaked' | 'stakerCount' | 'apy';
    filters?: {
      minStaked?: number;
      minApy?: number;
      tiers?: string[];
    };
    limit?: number;
    offset?: number;
  }) {
    const queryParams = new URLSearchParams();
    
    if (params.query) queryParams.append('q', params.query);
    if (params.sortBy) queryParams.append('sort', params.sortBy);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    
    if (params.filters) {
      if (params.filters.minStaked) {
        queryParams.append('minStaked', params.filters.minStaked.toString());
      }
      if (params.filters.minApy) {
        queryParams.append('minApy', params.filters.minApy.toString());
      }
      if (params.filters.tiers?.length) {
        queryParams.append('tiers', params.filters.tiers.join(','));
      }
    }

    return this.request<any[]>(`/influencers/search?${queryParams}`);
  }

  // Get specific influencer details
  async getInfluencerDetails(influencerId: string) {
    return this.request<any>(`/influencers/${influencerId}/staking`);
  }

  // Staking Operations
  async stakeOnInfluencer(params: {
    influencerId: string;
    amount: string;
    wallet: string;
  }) {
    return this.request('/staking/stake', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async unstake(params: {
    influencerId: string;
    amount: string;
    wallet: string;
  }) {
    return this.request('/staking/unstake', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async claimRewards(params: {
    influencerId: string;
    wallet: string;
  }) {
    return this.request('/staking/claim', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // User Portfolio
  async getUserStakes() {
    return this.request<any[]>('/user/stakes');
  }

  async getPortfolioStats() {
    return this.request<{
      totalStaked: string;
      totalPendingRewards: string;
      totalClaimed: string;
      activeStakes: number;
    }>('/user/portfolio/stats');
  }

  // Authentication
  async connectWallet(params: {
    walletAddress: string;
    signature: string;
    message: string;
  }) {
    const response = await this.request<{ token: string }>('/auth/connect', {
      method: 'POST',
      body: JSON.stringify(params),
    });

    await AsyncStorage.setItem('auth_token', response.token);
    return response;
  }

  async disconnectWallet() {
    await AsyncStorage.removeItem('auth_token');
  }

  // Analytics
  async getInfluencerAnalytics(influencerId: string, days: number = 30) {
    return this.request<{
      stakingHistory: Array<{ date: string; totalStaked: string }>;
      apyHistory: Array<{ date: string; apy: number }>;
      rewardsDistributed: string;
    }>(`/influencers/${influencerId}/analytics?days=${days}`);
  }

  // Notifications
  async registerPushToken(token: string) {
    return this.request('/notifications/register', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async updateNotificationPreferences(preferences: {
    stakingAlerts: boolean;
    rewardAlerts: boolean;
    priceAlerts: boolean;
  }) {
    return this.request('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  }
}

export const api = new ApiService();