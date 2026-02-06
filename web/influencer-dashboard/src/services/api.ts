import axios from 'axios';

const API_BASE_URL = '/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  // Staking endpoints
  searchInfluencers: async (params: {
    query?: string;
    sortBy?: string;
    filters?: any;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get('/staking/search', { params });
    return response.data;
  },

  getInfluencerDetails: async (influencerId: string) => {
    const response = await apiClient.get(`/staking/influencer/${influencerId}`);
    return response.data;
  },

  getUserStakes: async () => {
    const userId = localStorage.getItem('user_id');
    if (!userId) return [];
    const response = await apiClient.get(`/staking/user/${userId}/stakes`);
    return response.data;
  },

  stakeOnInfluencer: async (params: {
    influencerId: string;
    amount: string;
    wallet: string;
  }) => {
    const userId = localStorage.getItem('user_id');
    const response = await apiClient.post('/staking/stake', {
      ...params,
      userId,
    });
    return response.data;
  },

  unstake: async (params: {
    influencerId: string;
    amount: string;
    wallet: string;
  }) => {
    const userId = localStorage.getItem('user_id');
    const response = await apiClient.post('/staking/unstake', {
      ...params,
      userId,
    });
    return response.data;
  },

  claimRewards: async (params: {
    influencerId: string;
    wallet: string;
  }) => {
    const userId = localStorage.getItem('user_id');
    const response = await apiClient.post('/staking/claim', {
      ...params,
      userId,
    });
    return response.data;
  },

  // Link endpoints
  generateLink: async (params: {
    influencerId: string;
    productId: string;
    promoCode?: string;
  }) => {
    const response = await apiClient.post('/links/generate', params);
    return response.data;
  },

  getInfluencerLinks: async (influencerId: string) => {
    const response = await apiClient.get(`/links/influencer/${influencerId}`);
    return response.data;
  },

  getLinkAnalytics: async (linkId: string, influencerId: string) => {
    const response = await apiClient.get(`/links/${linkId}/analytics`, {
      params: { influencerId },
    });
    return response.data;
  },

  // Auth endpoints
  connectWallet: async (wallet: string, signature: string) => {
    const response = await apiClient.post('/auth/connect', {
      wallet,
      signature,
    });
    const { token, userId } = response.data;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_id', userId);
    return response.data;
  },

  // Mock function for development
  generateMockUserId: () => {
    const mockUserId = `user_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('user_id', mockUserId);
    return mockUserId;
  },
};