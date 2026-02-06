// Unit tests for Bloom Filter implementation
import { BloomFilter, CohortTargeting } from '../../workers/vau-processor/src/utils/bloom';

describe('BloomFilter', () => {
  let filter: BloomFilter;

  beforeEach(() => {
    filter = new BloomFilter(1000, 0.01);
  });

  test('should add and check items correctly', async () => {
    const items = ['user1', 'user2', 'user3', 'test@example.com'];
    
    // Add items
    for (const item of items) {
      await filter.add(item);
    }

    // Check items exist
    for (const item of items) {
      expect(await filter.contains(item)).toBe(true);
    }

    // Check non-existent items
    expect(await filter.contains('nonexistent')).toBe(false);
    expect(await filter.contains('random-user')).toBe(false);
  });

  test('should calculate optimal parameters', () => {
    // Test different configurations
    const configs = [
      { elements: 1000, falsePositive: 0.01 },
      { elements: 10000, falsePositive: 0.001 },
      { elements: 100000, falsePositive: 0.0001 }
    ];

    for (const config of configs) {
      const testFilter = new BloomFilter(config.elements, config.falsePositive);
      
      // Check that parameters are reasonable
      expect(testFilter['numBits']).toBeGreaterThan(config.elements);
      expect(testFilter['numHashes']).toBeGreaterThan(0);
      expect(testFilter['numHashes']).toBeLessThan(20); // Reasonable upper bound
    }
  });

  test('should serialize and deserialize correctly', async () => {
    const items = ['item1', 'item2', 'item3'];
    
    // Add items to original filter
    for (const item of items) {
      await filter.add(item);
    }

    // Serialize
    const serialized = filter.serialize();
    expect(typeof serialized).toBe('string');

    // Deserialize
    const deserialized = BloomFilter.deserialize(serialized);

    // Check all items still exist
    for (const item of items) {
      expect(await deserialized.contains(item)).toBe(true);
    }

    // Check non-existent item
    expect(await deserialized.contains('nonexistent')).toBe(false);
  });

  test('should handle union of filters', async () => {
    const filter1 = new BloomFilter(1000, 0.01);
    const filter2 = new BloomFilter(1000, 0.01);

    // Add different items to each filter
    await filter1.add('item1');
    await filter1.add('item2');
    
    await filter2.add('item3');
    await filter2.add('item4');

    // Create union
    const union = filter1.union(filter2);

    // Check all items exist in union
    expect(await union.contains('item1')).toBe(true);
    expect(await union.contains('item2')).toBe(true);
    expect(await union.contains('item3')).toBe(true);
    expect(await union.contains('item4')).toBe(true);
  });

  test('should throw error for union of different sized filters', () => {
    const filter1 = new BloomFilter(1000, 0.01);
    const filter2 = new BloomFilter(2000, 0.01);

    expect(() => filter1.union(filter2)).toThrow('Bloom filters must have same size');
  });

  test('should have acceptable false positive rate', async () => {
    const targetFPR = 0.01;
    const numElements = 1000;
    const testFilter = new BloomFilter(numElements, targetFPR);

    // Add elements
    for (let i = 0; i < numElements; i++) {
      await testFilter.add(`element-${i}`);
    }

    // Test false positives
    let falsePositives = 0;
    const testCount = 10000;

    for (let i = numElements; i < numElements + testCount; i++) {
      if (await testFilter.contains(`element-${i}`)) {
        falsePositives++;
      }
    }

    const actualFPR = falsePositives / testCount;
    
    // Allow some variance but should be close to target
    expect(actualFPR).toBeLessThan(targetFPR * 2);
    expect(actualFPR).toBeGreaterThan(0); // Some false positives are expected
  });
});

describe('CohortTargeting', () => {
  let cohortTargeting: CohortTargeting;
  let mockEnv: any;

  beforeEach(() => {
    // Mock environment with KV storage
    mockEnv = {
      BLOOM_FILTERS: {
        put: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(null)
      },
      KV: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined)
      }
    };

    cohortTargeting = new CohortTargeting(mockEnv);
  });

  test('should create cohort filter with targeting criteria', async () => {
    const criteria = {
      cohorts: ['18-24:gaming:100', '25-34:tech:200', '35-44:finance:300']
    };

    const filterId = await cohortTargeting.createCohortFilter(criteria);

    expect(typeof filterId).toBe('string');
    expect(mockEnv.BLOOM_FILTERS.put).toHaveBeenCalledWith(
      expect.stringContaining('filter:'),
      expect.any(String),
      expect.objectContaining({ expirationTtl: 7 * 24 * 3600 })
    );

    // Verify stored data structure
    const storedData = JSON.parse(mockEnv.BLOOM_FILTERS.put.mock.calls[0][1]);
    expect(storedData).toHaveProperty('filter');
    expect(storedData).toHaveProperty('criteria');
    expect(storedData).toHaveProperty('created');
    expect(storedData).toHaveProperty('salt');
  });

  test('should check cohort membership correctly', async () => {
    // Mock stored filter data
    const mockFilterData = {
      filter: new BloomFilter(100000, 0.01).serialize(),
      salt: 'test-salt-123',
      criteria: { cohorts: ['25-34:tech:200'] }
    };

    mockEnv.BLOOM_FILTERS.get.mockResolvedValueOnce(JSON.stringify(mockFilterData));

    // Create filter first
    const criteria = { cohorts: ['25-34:tech:200'] };
    const filterId = await cohortTargeting.createCohortFilter(criteria);

    // Mock the stored filter for retrieval
    mockEnv.BLOOM_FILTERS.get.mockResolvedValueOnce(JSON.stringify({
      ...mockFilterData,
      filter: mockEnv.BLOOM_FILTERS.put.mock.calls[0][1].filter
    }));

    // Check membership
    const isMember = await cohortTargeting.checkCohortMembership('user123', filterId);
    
    expect(typeof isMember).toBe('boolean');
    expect(mockEnv.BLOOM_FILTERS.get).toHaveBeenCalledWith(`filter:${filterId}`);
  });

  test('should return false for non-existent filter', async () => {
    mockEnv.BLOOM_FILTERS.get.mockResolvedValueOnce(null);

    const isMember = await cohortTargeting.checkCohortMembership('user123', 'nonexistent-filter');
    
    expect(isMember).toBe(false);
  });

  test('should derive consistent cohorts for users', async () => {
    // Test that same user always gets same cohort
    const userId = 'test-user-123';
    
    // Create a new instance to ensure no caching
    const targeting1 = new CohortTargeting(mockEnv);
    const targeting2 = new CohortTargeting(mockEnv);

    const cohort1 = await targeting1['getUserCohort'](userId);
    const cohort2 = await targeting2['getUserCohort'](userId);

    expect(cohort1).toBe(cohort2);
    
    // Verify cohort format
    expect(cohort1).toMatch(/^(18-24|25-34|35-44|45-54|55\+):(gaming|fashion|tech|finance|sports):\d+$/);
  });
});

describe('SaltRotator', () => {
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = {
      KV: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined)
      }
    };
  });

  test('should generate new salt if none exists', async () => {
    const { SaltRotator } = require('../../workers/vau-processor/src/utils/bloom');
    const saltRotator = new (SaltRotator as any)(mockEnv);

    const salt = await saltRotator.getCurrentSalt();

    expect(typeof salt).toBe('string');
    expect(salt).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(mockEnv.KV.put).toHaveBeenCalled();
  });

  test('should reuse existing salt for same week', async () => {
    const existingSalt = 'existing-salt-123';
    mockEnv.KV.get.mockResolvedValueOnce(existingSalt);

    const { SaltRotator } = require('../../workers/vau-processor/src/utils/bloom');
    const saltRotator = new (SaltRotator as any)(mockEnv);

    const salt = await saltRotator.getCurrentSalt();

    expect(salt).toBe(existingSalt);
    expect(mockEnv.KV.put).not.toHaveBeenCalled();
  });

  test('should rotate salts weekly', async () => {
    const { SaltRotator } = require('../../workers/vau-processor/src/utils/bloom');
    const saltRotator = new (SaltRotator as any)(mockEnv);

    await saltRotator.rotateSalts();

    const currentWeek = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
    
    // Should create new salt for next week
    expect(mockEnv.KV.put).toHaveBeenCalledWith(
      `salt:week:${currentWeek + 1}`,
      expect.any(String),
      expect.objectContaining({ expirationTtl: 8 * 24 * 3600 })
    );

    // Should delete old salt
    expect(mockEnv.KV.delete).toHaveBeenCalledWith(`salt:week:${currentWeek - 2}`);
  });
});