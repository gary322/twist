// K6 Load Test Configuration for TWIST Platform

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 1000 },  // Ramp up to 1000 users
    { duration: '10m', target: 10000 }, // Ramp up to 10000 users
    { duration: '5m', target: 10000 },  // Stay at 10000 users
    { duration: '2m', target: 0 },      // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.1'],    // Error rate must be below 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // User journey simulation
  const responses = {
    // Plan 3: Authentication
    auth: http.post(`${BASE_URL}:3001/auth/login`, {
      email: `user${Math.random()}@test.com`,
      password: 'testpass123'
    }),
    
    // Plan 6: Publisher interaction
    viewAd: http.get(`${BASE_URL}:3006/api/ads/view`),
    
    // Plan 7: Advertiser metrics
    metrics: http.get(`${BASE_URL}:3007/api/campaigns/metrics`),
    
    // Plan 8: Influencer stats
    influencer: http.get(`${BASE_URL}:3008/api/influencer/stats`),
    
    // Plan 10: Analytics
    analytics: http.get(`${BASE_URL}:3010/api/analytics/dashboard`)
  };
  
  // Check responses
  for (const [name, response] of Object.entries(responses)) {
    check(response, {
      [`${name} status is 200`]: (r) => r.status === 200,
      [`${name} response time < 500ms`]: (r) => r.timings.duration < 500,
    });
  }
  
  sleep(1);
}
