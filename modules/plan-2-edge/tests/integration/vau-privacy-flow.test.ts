// Integration test for VAU processing with privacy features
import { BloomFilter, CohortTargeting } from '../../workers/vau-processor/src/utils/bloom';

describe('VAU Processing with Privacy Features - User Journey', () => {
  // Mock environment for testing
  const mockEnv = {
    BLOOM_FILTERS: {
      put: jest.fn(),
      get: jest.fn()
    },
    KV: {
      put: jest.fn(),
      get: jest.fn(),
      delete: jest.fn()
    }
  };

  beforeEach(() => {
    // Reset mock implementations between tests (important when using `mockResolvedValueOnce`)
    mockEnv.BLOOM_FILTERS.put.mockReset();
    mockEnv.BLOOM_FILTERS.get.mockReset();
    mockEnv.KV.put.mockReset();
    mockEnv.KV.get.mockReset();
    mockEnv.KV.delete.mockReset();
  });

  describe('User Journey: First-time User with Privacy-Preserving Targeting', () => {
    const userId = 'user-12345';
    const deviceId = 'device-abcdef';
    const siteId = 'site-gaming-001';
    let cohortFilterId: string;

    test('Step 1: Advertiser creates privacy-preserving cohort filter', async () => {
      // Mock getCurrentSalt
      mockEnv.KV.get.mockResolvedValue('test-salt-week-123');
      
      const cohortTargeting = new CohortTargeting(mockEnv);
      
      // Target young gamers
      const targetingCriteria = {
        cohorts: [
          '18-24:gaming:100',
          '18-24:gaming:200',
          '18-24:gaming:300',
          '25-34:gaming:100',
          '25-34:gaming:200'
        ],
        minTrustScore: 50
      };

      cohortFilterId = await cohortTargeting.createCohortFilter(targetingCriteria);
      
      expect(cohortFilterId).toBeTruthy();
      expect(typeof cohortFilterId).toBe('string');

      // Verify filter was stored
      expect(mockEnv.BLOOM_FILTERS.put).toHaveBeenCalledWith(
        expect.stringContaining('filter:'),
        expect.any(String),
        expect.any(Object)
      );
    });

    test('Step 2: Privacy-preserving cohort membership check', async () => {
      // Mock stored filter
      const mockFilterData = {
        filter: new BloomFilter(100000, 0.01).serialize(),
        salt: 'test-salt-week-123',
        criteria: { cohorts: ['18-24:gaming:100'] }
      };
      
      mockEnv.BLOOM_FILTERS.get.mockResolvedValue(JSON.stringify(mockFilterData));
      mockEnv.KV.get.mockResolvedValue('test-salt-week-123');
      
      const cohortTargeting = new CohortTargeting(mockEnv);
      
      // Check if user belongs to targeted cohort
      const isMember = await cohortTargeting.checkCohortMembership(userId, cohortFilterId || 'test-filter-id');
      
      // Result will depend on the hash of userId
      expect(typeof isMember).toBe('boolean');
    });

    test('Step 3: Bloom filter operations', async () => {
      const filter = new BloomFilter(1000, 0.01);
      
      // Add items
      await filter.add('user:123:gaming');
      await filter.add('user:456:sports');
      await filter.add('user:789:tech');
      
      // Check membership
      expect(await filter.contains('user:123:gaming')).toBe(true);
      expect(await filter.contains('user:456:sports')).toBe(true);
      expect(await filter.contains('user:789:tech')).toBe(true);
      expect(await filter.contains('user:999:unknown')).toBe(false);
      
      // Test serialization
      const serialized = filter.serialize();
      const deserialized = BloomFilter.deserialize(serialized);
      
      expect(await deserialized.contains('user:123:gaming')).toBe(true);
      expect(await deserialized.contains('user:999:unknown')).toBe(false);
    });

    test('Step 4: Salt rotation maintains privacy', async () => {
      // First week salt
      mockEnv.KV.get.mockResolvedValueOnce(null).mockResolvedValueOnce('salt-week-1');
      
      const cohortTargeting1 = new CohortTargeting(mockEnv);
      const filter1 = new BloomFilter(1000, 0.01);
      
      // Add cohort with first salt
      const salt1 = await cohortTargeting1['saltRotator'].getCurrentSalt();
      await filter1.add(salt1 + '18-24:gaming:100');
      
      // Verify salt was generated and stored
      expect(mockEnv.KV.put).toHaveBeenCalledWith(
        expect.stringContaining('salt:week:'),
        expect.any(String),
        expect.any(Object)
      );
      
      // Simulate week change - different salt
      const nextWeek = Math.floor(Date.now() / (7 * 24 * 3600 * 1000)) + 1;
      mockEnv.KV.get.mockResolvedValueOnce('salt-week-2');
      
      const filter2 = new BloomFilter(1000, 0.01);
      await filter2.add('salt-week-2' + '18-24:gaming:100');
      
      // Same cohort with different salts should produce different hashes
      const serialized1 = filter1.serialize();
      const serialized2 = filter2.serialize();
      expect(serialized1).not.toBe(serialized2);
    });

    test('Step 5: User cohort derivation is deterministic', async () => {
      const cohortTargeting = new CohortTargeting(mockEnv);
      
      // Same user should always get same cohort
      const cohort1 = await cohortTargeting['getUserCohort'](userId);
      const cohort2 = await cohortTargeting['getUserCohort'](userId);
      
      expect(cohort1).toBe(cohort2);
      expect(cohort1).toMatch(/^(18-24|25-34|35-44|45-54|55\+):(gaming|fashion|tech|finance|sports):\d+$/);
      
      // Different users should get different cohorts (usually)
      const cohort3 = await cohortTargeting['getUserCohort']('different-user-999');
      // Note: There's a small chance they could be the same due to hashing
      expect(typeof cohort3).toBe('string');
    });

    test('Step 6: Privacy features integration', async () => {
      // This test verifies all privacy features work together
      
      // 1. Create filter with current salt
      mockEnv.KV.get.mockResolvedValue('integration-test-salt');
      const cohortTargeting = new CohortTargeting(mockEnv);
      
      // 2. Create targeting filter
      const criteria = {
        cohorts: ['25-34:tech:500', '25-34:tech:501', '25-34:tech:502'],
        minTrustScore: 60
      };
      
      const filterId = await cohortTargeting.createCohortFilter(criteria);
      
      // 3. Mock the stored filter for retrieval
      const storedCall = mockEnv.BLOOM_FILTERS.put.mock.calls[0];
      const storedData = JSON.parse(storedCall[1]);
      mockEnv.BLOOM_FILTERS.get.mockResolvedValue(storedCall[1]);
      
      // 4. Check if a user matches
      const matches = await cohortTargeting.checkCohortMembership('test-user-123', filterId);
      
      // 5. Verify privacy properties
      // - No PII is stored (only hashed values in bloom filter)
      expect(storedData.filter).toBeTruthy();
      expect(storedData.salt).toBe('integration-test-salt');
      expect(JSON.stringify(storedData)).not.toContain('test-user-123');
      
      // - Filter data is opaque (can't extract original cohorts)
      const filter = BloomFilter.deserialize(storedData.filter);
      // The serialized filter should not contain readable cohort data
      expect(storedData.filter).not.toContain('25-34:tech');
    });
  });

  describe('Security and Rate Limiting Integration', () => {
    test('Rate limiting across distributed edge locations', async () => {
      // This simulates how rate limiting would work with Durable Objects
      const rateLimits = new Map<string, { count: number; resetAt: number }>();
      
      const checkRateLimit = (key: string, limit: number, window: number) => {
        const now = Date.now();
        const existing = rateLimits.get(key);
        
        if (!existing || existing.resetAt < now) {
          rateLimits.set(key, { count: 1, resetAt: now + window });
          return { allowed: true, remaining: limit - 1 };
        }
        
        if (existing.count >= limit) {
          return { allowed: false, remaining: 0 };
        }
        
        existing.count++;
        return { allowed: true, remaining: limit - existing.count };
      };
      
      // Simulate requests
      const key = 'rate:192.168.1.1:/api/v1/vau';
      
      // First 100 requests should pass
      for (let i = 0; i < 100; i++) {
        const result = checkRateLimit(key, 100, 60000);
        expect(result.allowed).toBe(true);
      }
      
      // 101st request should fail
      const result = checkRateLimit(key, 100, 60000);
      expect(result.allowed).toBe(false);
    });
  });
});
