// Deterministic tests for Bloom Filter implementation
import { BloomFilter, CohortTargeting, SaltRotator } from '../../workers/vau-processor/src/utils/bloom';

describe('BloomFilter with deterministic hashing', () => {
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
      const contains = await filter.contains(item);
      expect(contains).toBe(true);
    }

    // Check non-existent items
    const notExists = await filter.contains('nonexistent');
    expect(notExists).toBe(false);
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
      const contains = await deserialized.contains(item);
      expect(contains).toBe(true);
    }

    // Check non-existent item
    const notExists = await deserialized.contains('nonexistent');
    expect(notExists).toBe(false);
  });

  test('should handle union of filters correctly', async () => {
    // Need to create filters with same parameters
    const numElements = 1000;
    const falsePositiveRate = 0.01;
    
    const filter1 = new BloomFilter(numElements, falsePositiveRate);
    const filter2 = new BloomFilter(numElements, falsePositiveRate);

    // Ensure both filters have same size by checking their internal state
    expect(filter1['numBits']).toBe(filter2['numBits']);

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
    
    // Check non-existent item
    expect(await union.contains('nonexistent')).toBe(false);
  });

  test('bloom filter properties', async () => {
    // Test basic properties
    const testFilter = new BloomFilter(10000, 0.01);
    
    // Add many items
    const itemCount = 1000;
    for (let i = 0; i < itemCount; i++) {
      await testFilter.add(`test-item-${i}`);
    }
    
    // All added items should be found
    let found = 0;
    for (let i = 0; i < itemCount; i++) {
      if (await testFilter.contains(`test-item-${i}`)) {
        found++;
      }
    }
    expect(found).toBe(itemCount);
    
    // Test for false positives on non-added items
    let falsePositives = 0;
    const testNonExistent = 1000;
    for (let i = itemCount; i < itemCount + testNonExistent; i++) {
      if (await testFilter.contains(`test-item-${i}`)) {
        falsePositives++;
      }
    }
    
    // False positive rate should be reasonable (allowing for some variance)
    const fpRate = falsePositives / testNonExistent;
    expect(fpRate).toBeLessThan(0.05); // Should be close to 0.01 but allow some variance
  });
});

describe('CohortTargeting with deterministic hashing', () => {
  let cohortTargeting: CohortTargeting;
  let mockEnv: any;

  beforeEach(() => {
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

  test('should derive consistent cohorts for same user', async () => {
    const userId = 'test-user-123';
    
    // Get cohort multiple times
    const cohort1 = await cohortTargeting['getUserCohort'](userId);
    const cohort2 = await cohortTargeting['getUserCohort'](userId);
    const cohort3 = await cohortTargeting['getUserCohort'](userId);

    // Should always get same cohort for same user
    expect(cohort1).toBe(cohort2);
    expect(cohort2).toBe(cohort3);
    
    // Verify cohort format
    expect(cohort1).toMatch(/^(18-24|25-34|35-44|45-54|55\+):(gaming|fashion|tech|finance|sports):\d+$/);
  });

  test('should derive different cohorts for different users', async () => {
    const cohorts = new Set<string>();
    
    // Generate cohorts for multiple users
    for (let i = 0; i < 100; i++) {
      const cohort = await cohortTargeting['getUserCohort'](`user-${i}`);
      cohorts.add(cohort);
    }
    
    // Should have good distribution (at least 10 different cohorts from 100 users)
    expect(cohorts.size).toBeGreaterThan(10);
  });
});
