import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const searchLatency = new Trend('search_latency');
const stakingLatency = new Trend('staking_latency');
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  scenarios: {
    // Scenario 1: Search and browse influencers
    search_browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 1000 }, // Ramp up to 1000 users
        { duration: '5m', target: 1000 }, // Stay at 1000 users
        { duration: '2m', target: 2000 }, // Ramp up to 2000 users
        { duration: '5m', target: 2000 }, // Stay at 2000 users
        { duration: '2m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
      tags: { scenario: 'search_browse' },
    },
    
    // Scenario 2: Staking operations
    staking_operations: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 1000,
      stages: [
        { duration: '2m', target: 50 },   // 50 stakes per second
        { duration: '5m', target: 100 },  // 100 stakes per second
        { duration: '5m', target: 200 },  // 200 stakes per second
        { duration: '2m', target: 0 },
      ],
      tags: { scenario: 'staking' },
    },
    
    // Scenario 3: Real-time updates via WebSocket
    websocket_connections: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 500 },  // 500 concurrent WebSocket connections
        { duration: '10m', target: 500 }, // Maintain connections
        { duration: '2m', target: 0 },
      ],
      tags: { scenario: 'websocket' },
    },
    
    // Scenario 4: API stress test
    api_stress: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 2000,
      maxVUs: 5000,
      tags: { scenario: 'stress' },
    },
  },
  
  thresholds: {
    // API response time thresholds
    'http_req_duration{scenario:search_browse}': ['p(95)<1000'], // 95% under 1s
    'http_req_duration{scenario:staking}': ['p(95)<2000'],       // 95% under 2s
    'http_req_duration{scenario:stress}': ['p(95)<3000'],         // 95% under 3s
    
    // Error rate thresholds
    'errors': ['rate<0.01'], // Less than 1% error rate
    'http_req_failed': ['rate<0.02'], // Less than 2% failed requests
    
    // Custom metric thresholds
    'search_latency': ['p(95)<800'], // 95% of searches under 800ms
    'staking_latency': ['p(95)<1500'], // 95% of stakes under 1.5s
    
    // WebSocket thresholds
    'ws_connecting': ['p(95)<1000'], // 95% connect under 1s
    'ws_msgs_received': ['rate>10'], // At least 10 messages/s
  },
};

// Test data
const testUsers = new SharedArray('users', function () {
  const users = [];
  for (let i = 0; i < 10000; i++) {
    users.push({
      id: `user-${i}`,
      wallet: `wallet-${i}`,
      token: generateMockToken(`user-${i}`),
    });
  }
  return users;
});

const testInfluencers = new SharedArray('influencers', function () {
  return [
    { id: 'inf-1', username: 'crypto_master' },
    { id: 'inf-2', username: 'defi_queen' },
    { id: 'inf-3', username: 'nft_artist' },
    { id: 'inf-4', username: 'web3_dev' },
    { id: 'inf-5', username: 'blockchain_educator' },
  ];
});

const searchQueries = ['crypto', 'defi', 'nft', 'blockchain', 'web3', 'staking', 'yield'];
const sortOptions = ['totalStaked', 'stakerCount', 'apy'];
const tiers = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

// Base configuration
const BASE_URL = __ENV.BASE_URL || 'https://api.twist.to/v1';
const WS_URL = __ENV.WS_URL || 'wss://api.twist.to/staking';

export function setup() {
  // Warm up the system with a few requests
  logger.log('Warming up the system...');
  
  for (let i = 0; i < 10; i++) {
    http.get(`${BASE_URL}/health`);
    sleep(0.1);
  }
  
  return { startTime: new Date().toISOString() };
}

export default function (data) {
  const scenario = __ENV.scenario || 'search_browse';
  
  switch (scenario) {
    case 'search_browse':
      searchBrowseScenario();
      break;
    case 'staking':
      stakingScenario();
      break;
    case 'websocket':
      websocketScenario();
      break;
    case 'stress':
      stressTestScenario();
      break;
  }
}

function searchBrowseScenario() {
  const user = randomItem(testUsers);
  const headers = {
    'Authorization': `Bearer ${user.token}`,
    'Content-Type': 'application/json',
  };
  
  // Search influencers
  const searchQuery = randomItem(searchQueries);
  const sortBy = randomItem(sortOptions);
  const selectedTiers = randomItem([
    null,
    [randomItem(tiers)],
    [randomItem(tiers), randomItem(tiers)],
  ]);
  
  let url = `${BASE_URL}/influencers/search?q=${searchQuery}&sort=${sortBy}&limit=20`;
  if (selectedTiers) {
    url += `&tiers=${selectedTiers.join(',')}`;
  }
  
  const searchStart = new Date();
  const searchRes = http.get(url, { headers });
  const searchDuration = new Date() - searchStart;
  
  searchLatency.add(searchDuration);
  
  check(searchRes, {
    'search status is 200': (r) => r.status === 200,
    'search returns results': (r) => {
      const body = JSON.parse(r.body);
      return Array.isArray(body) && body.length > 0;
    },
    'search response time < 1s': (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);
  
  sleep(randomIntBetween(1, 3));
  
  // View influencer details
  if (searchRes.status === 200) {
    const results = JSON.parse(searchRes.body);
    if (results.length > 0) {
      const influencer = randomItem(results);
      const detailsRes = http.get(
        `${BASE_URL}/influencers/${influencer.id}/staking`,
        { headers }
      );
      
      check(detailsRes, {
        'details status is 200': (r) => r.status === 200,
        'details has required fields': (r) => {
          const body = JSON.parse(r.body);
          return body.influencer && body.pool && body.metrics;
        },
      }) || errorRate.add(1);
    }
  }
  
  sleep(randomIntBetween(2, 5));
}

function stakingScenario() {
  const user = randomItem(testUsers);
  const influencer = randomItem(testInfluencers);
  const headers = {
    'Authorization': `Bearer ${user.token}`,
    'Content-Type': 'application/json',
  };
  
  // Get current stakes
  const portfolioRes = http.get(`${BASE_URL}/user/stakes`, { headers });
  
  check(portfolioRes, {
    'portfolio status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  // Perform staking operation
  const stakeAmount = randomIntBetween(1000, 10000) * 10 ** 9; // 1000-10000 TWIST
  const payload = JSON.stringify({
    influencerId: influencer.id,
    amount: stakeAmount.toString(),
    wallet: user.wallet,
  });
  
  const stakingStart = new Date();
  const stakeRes = http.post(`${BASE_URL}/staking/stake`, payload, { headers });
  const stakingDuration = new Date() - stakingStart;
  
  stakingLatency.add(stakingDuration);
  
  check(stakeRes, {
    'stake status is 200': (r) => r.status === 200,
    'stake returns transaction': (r) => {
      const body = JSON.parse(r.body);
      return body.success && body.transactionId;
    },
    'staking response time < 2s': (r) => r.timings.duration < 2000,
  }) || errorRate.add(1);
  
  sleep(randomIntBetween(5, 10));
  
  // Sometimes check rewards
  if (Math.random() < 0.3) {
    const claimRes = http.post(
      `${BASE_URL}/staking/claim`,
      JSON.stringify({
        influencerId: influencer.id,
        wallet: user.wallet,
      }),
      { headers }
    );
    
    check(claimRes, {
      'claim status is 200 or 400': (r) => r.status === 200 || r.status === 400,
    }) || errorRate.add(1);
  }
}

function websocketScenario() {
  const user = randomItem(testUsers);
  const influencer = randomItem(testInfluencers);
  
  const ws = new WebSocket(`${WS_URL}?token=${user.token}`);
  
  ws.onopen = () => {
    logger.log('WebSocket connected');
    
    // Subscribe to influencer updates
    ws.send(JSON.stringify({
      event: 'subscribe:influencer',
      data: { influencerId: influencer.id },
    }));
    
    // Subscribe to portfolio updates
    ws.send(JSON.stringify({
      event: 'subscribe:portfolio',
    }));
  };
  
  let messageCount = 0;
  ws.onmessage = (e) => {
    messageCount++;
    const message = JSON.parse(e.data);
    
    check(message, {
      'ws message has type': (m) => m.type !== undefined,
      'ws message has data': (m) => m.data !== undefined,
    });
  };
  
  ws.onerror = (e) => {
    console.error('WebSocket error:', e);
    errorRate.add(1);
  };
  
  // Keep connection alive for duration
  sleep(60);
  
  ws.close();
  
  check(messageCount, {
    'received ws messages': (count) => count > 0,
  });
}

function stressTestScenario() {
  const user = randomItem(testUsers);
  const headers = {
    'Authorization': `Bearer ${user.token}`,
    'Content-Type': 'application/json',
  };
  
  // Random API endpoint
  const endpoints = [
    { method: 'GET', path: '/influencers/search?q=test' },
    { method: 'GET', path: '/user/stakes' },
    { method: 'GET', path: '/user/portfolio/stats' },
    { method: 'GET', path: `/influencers/${randomItem(testInfluencers).id}/staking` },
    { method: 'GET', path: '/notifications?limit=10' },
  ];
  
  const endpoint = randomItem(endpoints);
  const res = http[endpoint.method.toLowerCase()](
    `${BASE_URL}${endpoint.path}`,
    null,
    { headers }
  );
  
  check(res, {
    'stress test status < 500': (r) => r.status < 500,
    'stress test response time < 3s': (r) => r.timings.duration < 3000,
  }) || errorRate.add(1);
  
  sleep(randomFloatBetween(0.1, 0.5));
}

export function teardown(data) {
  logger.log(`Load test completed. Started at: ${data.startTime}`);
  
  // Summary metrics
  logger.log('Test Summary:');
  logger.log(`- Total requests: ${__ITER}`);
  logger.log(`- Error rate: ${errorRate.rate * 100}%`);
  logger.log(`- Search latency (p95): ${searchLatency.p(0.95)}ms`);
  logger.log(`- Staking latency (p95): ${stakingLatency.p(0.95)}ms`);
}

// Helper functions
function generateMockToken(userId) {
  // In real test, this would generate valid JWTs
  return `mock-token-${userId}`;
}

function randomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloatBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// Run with:
// k6 run --vus 10000 --duration 30m load-test.ts
// k6 run --out influxdb=http://localhost:8086/k6 load-test.ts
// k6 cloud load-test.ts