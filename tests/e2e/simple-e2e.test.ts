import { describe, it, expect } from '@jest/globals';
import axios from 'axios';

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Simple E2E Tests', () => {
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await axios.get(`${API_URL}/health`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'ok');
      expect(response.data).toHaveProperty('timestamp');
    });
  });

  describe('API Documentation', () => {
    it('should serve API docs', async () => {
      const response = await axios.get(`${API_URL}/api-docs`);
      expect(response.status).toBe(200);
      expect(response.data).toContain('API Documentation');
    });
  });

  describe('Influencer Search', () => {
    it('should search for influencers', async () => {
      const response = await axios.get(`${API_URL}/api/staking/search`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      if (response.data.length > 0) {
        const influencer = response.data[0];
        expect(influencer).toHaveProperty('id');
        expect(influencer).toHaveProperty('username');
        expect(influencer).toHaveProperty('tier');
        expect(influencer).toHaveProperty('metrics');
        expect(influencer.metrics).toHaveProperty('totalStaked');
        expect(influencer.metrics).toHaveProperty('stakerCount');
        expect(influencer.metrics).toHaveProperty('apy');
      }
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      try {
        await axios.get(`${API_URL}/unknown-endpoint`);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data).toHaveProperty('error', 'Not found');
      }
    });
  });
});