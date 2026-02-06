import axios, { AxiosInstance } from 'axios';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://${process.env.API_HOST}/api',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized access
          localStorage.removeItem('authToken');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Influencer Dashboard APIs
  async getInfluencerStats(influencerId: string, timeRange: string) {
    const { data } = await this.client.get(`/influencers/${influencerId}/stats`, {
      params: { timeRange },
    });
    return data;
  }

  async getInfluencerAnalytics(influencerId: string, timeRange: string) {
    const { data } = await this.client.get(`/influencers/${influencerId}/analytics`, {
      params: { timeRange },
    });
    return data;
  }

  async getInfluencerStakingPool(influencerId: string) {
    const { data } = await this.client.get(`/influencers/${influencerId}/staking-pool`);
    return data;
  }

  async getRecentActivity(influencerId: string, params: { limit?: number }) {
    const { data } = await this.client.get(`/influencers/${influencerId}/activity`, {
      params,
    });
    return data;
  }

  // Link Management APIs
  async getInfluencerLinks(influencerId: string) {
    const { data } = await this.client.get(`/influencers/${influencerId}/links`);
    return data;
  }

  async createInfluencerLink(params: {
    influencerId: string;
    productId: string;
    customUrl?: string;
    promoCode?: string;
    expiresIn?: string;
  }) {
    const { data } = await this.client.post('/links', params);
    return data;
  }

  async updateInfluencerLink(linkId: string, updates: { isActive?: boolean }) {
    const { data } = await this.client.patch(`/links/${linkId}`, updates);
    return data;
  }

  async deleteInfluencerLink(linkId: string) {
    await this.client.delete(`/links/${linkId}`);
  }

  // Staking APIs
  async getTopStakers(poolId: string, params: { limit?: number }) {
    const { data } = await this.client.get(`/staking/pools/${poolId}/stakers`, {
      params,
    });
    return data;
  }

  async getUserStakes(userId: string) {
    const { data } = await this.client.get(`/staking/user/${userId}/stakes`);
    return data;
  }

  async getInfluencerStakingDetails(influencerId: string) {
    const { data } = await this.client.get(`/staking/influencer/${influencerId}/details`);
    return data;
  }

  async searchInfluencers(params: {
    query?: string;
    sortBy?: string;
    filters?: any;
    limit?: number;
    offset?: number;
  }) {
    const { data } = await this.client.get('/staking/search', { params });
    return data;
  }

  async stakeOnInfluencer(params: {
    influencerId: string;
    amount: string;
    wallet: string;
  }) {
    const { data } = await this.client.post('/staking/stake', params);
    return data;
  }

  async unstake(params: {
    influencerId: string;
    amount: string;
    wallet: string;
  }) {
    const { data } = await this.client.post('/staking/unstake', params);
    return data;
  }

  async claimRewards(params: {
    influencerId: string;
    wallet: string;
  }) {
    const { data } = await this.client.post('/staking/claim', params);
    return data;
  }

  // Payout APIs
  async getPayoutBalance(influencerId: string) {
    const { data } = await this.client.get(`/payouts/balance/${influencerId}`);
    return data;
  }

  async getPayoutHistory(influencerId: string, params: { limit?: number }) {
    const { data } = await this.client.get(`/payouts/history`, {
      params: { influencerId, ...params },
    });
    return data;
  }

  async requestPayout(params: {
    influencerId: string;
    amount: string;
    method: string;
  }) {
    const { data } = await this.client.post('/payouts/request', params);
    return data;
  }

  // Notification APIs
  async getNotifications(params: { limit?: number; unreadOnly?: boolean }) {
    const { data } = await this.client.get('/notifications', { params });
    return data;
  }

  async markNotificationAsRead(notificationId: string) {
    await this.client.patch(`/notifications/${notificationId}/read`);
  }

  async markAllNotificationsAsRead() {
    await this.client.post('/notifications/read-all');
  }

  // Analytics APIs
  async getLinkAnalytics(linkId: string, timeRange: string) {
    const { data } = await this.client.get(`/analytics/links/${linkId}`, {
      params: { timeRange },
    });
    return data;
  }

  async exportAnalytics(params: {
    influencerId: string;
    startDate: string;
    endDate: string;
    format: 'csv' | 'xlsx';
  }) {
    const { data } = await this.client.post('/analytics/export', params, {
      responseType: 'blob',
    });
    return data;
  }

  // Portfolio APIs
  async getUserPortfolio(userId: string) {
    const { data } = await this.client.get(`/portfolio/${userId}`);
    return data;
  }

  async getPortfolioStats(userId: string) {
    const { data } = await this.client.get(`/portfolio/${userId}/stats`);
    return data;
  }

  async getStakingHistory(params?: { limit?: number; offset?: number }) {
    const { data } = await this.client.get('/staking/history', { params });
    return data;
  }

  async updatePortfolioSettings(settings: any) {
    const { data } = await this.client.patch('/portfolio/settings', settings);
    return data;
  }

  // Settings APIs
  async updateInfluencerProfile(influencerId: string, updates: any) {
    const { data } = await this.client.patch(`/influencers/${influencerId}/profile`, updates);
    return data;
  }

  async updateStakingPoolSettings(poolId: string, updates: {
    revenueSharePercent?: number;
    minStake?: string;
  }) {
    const { data } = await this.client.patch(`/staking/pools/${poolId}/settings`, updates);
    return data;
  }

  async updatePayoutSettings(influencerId: string, settings: {
    autoPayoutEnabled?: boolean;
    defaultPayoutMethod?: string;
    walletAddress?: string;
    bankDetails?: any;
  }) {
    const { data } = await this.client.patch(`/influencers/${influencerId}/payout-settings`, settings);
    return data;
  }

  // Content Management APIs
  async getInfluencerContent(influencerId?: string) {
    const { data } = await this.client.get('/content', {
      params: { influencerId },
    });
    return data;
  }

  async createContent(content: any) {
    const { data } = await this.client.post('/content', content);
    return data;
  }

  async updateContent(contentId: string, updates: any) {
    const { data } = await this.client.patch(`/content/${contentId}`, updates);
    return data;
  }

  async deleteContent(contentId: string) {
    await this.client.delete(`/content/${contentId}`);
  }

  async duplicateContent(contentId: string) {
    const { data } = await this.client.post(`/content/${contentId}/duplicate`);
    return data;
  }

  async toggleContentFavorite(contentId: string) {
    const { data } = await this.client.post(`/content/${contentId}/favorite`);
    return data;
  }

  async uploadContentMedia(formData: FormData, config?: any) {
    const { data } = await this.client.post('/content/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      ...config,
    });
    return data;
  }

  // Campaign APIs
  async getInfluencerCampaigns(influencerId?: string) {
    const { data } = await this.client.get('/campaigns', {
      params: { influencerId },
    });
    return data;
  }

  async createCampaign(campaign: any) {
    const { data } = await this.client.post('/campaigns', campaign);
    return data;
  }

  async updateCampaign(campaignId: string, updates: any) {
    const { data } = await this.client.patch(`/campaigns/${campaignId}`, updates);
    return data;
  }

  async deleteCampaign(campaignId: string) {
    await this.client.delete(`/campaigns/${campaignId}`);
  }

  async duplicateCampaign(campaignId: string) {
    const { data } = await this.client.post(`/campaigns/${campaignId}/duplicate`);
    return data;
  }

  async updateCampaignStatus(campaignId: string, status: string) {
    const { data } = await this.client.patch(`/campaigns/${campaignId}/status`, { status });
    return data;
  }

  // Product APIs
  async getProducts() {
    const { data } = await this.client.get('/products');
    return data;
  }

  // Analytics APIs (extended)
  async getAnalyticsOverview(userId?: string, dateRange?: any) {
    const { data } = await this.client.get('/analytics/overview', {
      params: { userId, ...dateRange },
    });
    return data;
  }

  async getPerformanceMetrics(userId?: string, dateRange?: any) {
    const { data } = await this.client.get('/analytics/performance', {
      params: { userId, ...dateRange },
    });
    return data;
  }

  async getConversionAnalytics(userId?: string, dateRange?: any) {
    const { data } = await this.client.get('/analytics/conversions', {
      params: { userId, ...dateRange },
    });
    return data;
  }

  async getStakingAnalytics(userId?: string, dateRange?: any) {
    const { data } = await this.client.get('/analytics/staking', {
      params: { userId, ...dateRange },
    });
    return data;
  }

  async getGeographicAnalytics(userId?: string, dateRange?: any) {
    const { data } = await this.client.get('/analytics/geographic', {
      params: { userId, ...dateRange },
    });
    return data;
  }

  async getRealtimeMetrics(userId?: string) {
    const { data } = await this.client.get('/analytics/realtime', {
      params: { userId },
    });
    return data;
  }
}

export const api = new ApiService();