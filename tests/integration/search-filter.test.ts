import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { StakingService } from '../../services/influencer-api/src/services/staking.service';
import { 
  Influencer,
  InfluencerProfile,
  InfluencerStakingPool,
  UserStake,
  StakingReward
} from '../../services/influencer-api/src/entities';
import { Repository } from 'typeorm';

describe('Influencer Search and Filter Integration Tests', () => {
  let module: TestingModule;
  let stakingService: StakingService;
  let influencerRepo: Repository<Influencer>;
  let poolRepo: Repository<InfluencerStakingPool>;
  let stakeRepo: Repository<UserStake>;
  
  // Test data
  const testInfluencers = [
    {
      id: 'inf-1',
      username: 'crypto_master',
      displayName: 'Crypto Master',
      tier: 'PLATINUM',
      totalStaked: 100000n * 10n ** 9n,
      stakerCount: 150,
      apy: 25.5,
      revenueShareBps: 2000,
    },
    {
      id: 'inf-2', 
      username: 'defi_queen',
      displayName: 'DeFi Queen',
      tier: 'GOLD',
      totalStaked: 25000n * 10n ** 9n,
      stakerCount: 75,
      apy: 18.3,
      revenueShareBps: 2500,
    },
    {
      id: 'inf-3',
      username: 'nft_artist',
      displayName: 'NFT Artist',
      tier: 'SILVER',
      totalStaked: 5000n * 10n ** 9n,
      stakerCount: 25,
      apy: 12.7,
      revenueShareBps: 3000,
    },
    {
      id: 'inf-4',
      username: 'web3_dev',
      displayName: 'Web3 Developer',
      tier: 'BRONZE',
      totalStaked: 800n * 10n ** 9n,
      stakerCount: 10,
      apy: 8.2,
      revenueShareBps: 1500,
    },
    {
      id: 'inf-5',
      username: 'blockchain_educator',
      displayName: 'Blockchain Educator',
      tier: 'GOLD',
      totalStaked: 30000n * 10n ** 9n,
      stakerCount: 90,
      apy: 22.1,
      revenueShareBps: 2000,
    },
  ];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          username: 'test',
          password: 'test',
          database: 'twist_test',
          entities: [Influencer, InfluencerProfile, InfluencerStakingPool, UserStake, StakingReward],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Influencer, InfluencerProfile, InfluencerStakingPool, UserStake, StakingReward]),
        RedisModule.forRoot({
          config: {
            host: 'localhost',
            port: 6379,
          },
        }),
      ],
      providers: [StakingService],
    }).compile();

    stakingService = module.get<StakingService>(StakingService);
    influencerRepo = module.get('InfluencerRepository');
    poolRepo = module.get('InfluencerStakingPoolRepository');
    stakeRepo = module.get('UserStakeRepository');

    // Seed test data
    await seedTestData();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    await module.close();
  });

  async function seedTestData() {
    for (const data of testInfluencers) {
      // Create influencer
      const influencer = influencerRepo.create({
        id: data.id,
        username: data.username,
        email: `${data.username}@test.com`,
        emailHash: `hash_${data.username}`,
        tier: data.tier,
        verified: true,
      });
      await influencerRepo.save(influencer);

      // Create profile
      const profile = {
        influencerId: data.id,
        displayName: data.displayName,
        bio: `Test bio for ${data.displayName}`,
        avatar: `/avatars/${data.username}.png`,
      };
      await influencerRepo.query(
        `INSERT INTO influencer_profiles (influencer_id, display_name, bio, avatar) VALUES ($1, $2, $3, $4)`,
        [profile.influencerId, profile.displayName, profile.bio, profile.avatar]
      );

      // Create staking pool
      const pool = poolRepo.create({
        influencerId: data.id,
        poolAddress: `pool_${data.username}`,
        totalStaked: data.totalStaked,
        stakerCount: data.stakerCount,
        revenueShareBps: data.revenueShareBps,
        currentApy: data.apy,
        isActive: true,
      });
      await poolRepo.save(pool);
    }
  }

  async function cleanupTestData() {
    await stakeRepo.delete({});
    await poolRepo.delete({});
    await influencerRepo.query('DELETE FROM influencer_profiles');
    await influencerRepo.delete({});
  }

  describe('Search Functionality', () => {
    it('should search influencers by username', async () => {
      const results = await stakingService.searchInfluencers({
        query: 'crypto',
        sortBy: 'totalStaked',
        limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].username).toBe('crypto_master');
    });

    it('should search influencers by display name', async () => {
      const results = await stakingService.searchInfluencers({
        query: 'Queen',
        sortBy: 'totalStaked',
        limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].displayName).toBe('DeFi Queen');
    });

    it('should search influencers by bio content', async () => {
      const results = await stakingService.searchInfluencers({
        query: 'Developer',
        sortBy: 'totalStaked',
        limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].username).toBe('web3_dev');
    });

    it('should return empty results for non-matching query', async () => {
      const results = await stakingService.searchInfluencers({
        query: 'nonexistent',
        sortBy: 'totalStaked',
        limit: 10,
      });

      expect(results).toHaveLength(0);
    });

    it('should handle case-insensitive search', async () => {
      const results = await stakingService.searchInfluencers({
        query: 'BLOCKCHAIN',
        sortBy: 'totalStaked',
        limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].username).toBe('blockchain_educator');
    });
  });

  describe('Sorting Functionality', () => {
    it('should sort by total staked (descending)', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      
      // Verify descending order
      for (let i = 1; i < results.length; i++) {
        const prevStaked = BigInt(results[i-1].metrics.totalStaked);
        const currStaked = BigInt(results[i].metrics.totalStaked);
        expect(prevStaked).toBeGreaterThanOrEqual(currStaked);
      }

      // Check top influencer
      expect(results[0].username).toBe('crypto_master');
    });

    it('should sort by staker count (descending)', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'stakerCount',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      
      // Verify descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i-1].metrics.stakerCount).toBeGreaterThanOrEqual(
          results[i].metrics.stakerCount
        );
      }

      // Check top influencer by staker count
      expect(results[0].username).toBe('crypto_master');
    });

    it('should sort by APY (descending)', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'apy',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      
      // Verify descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i-1].metrics.apy).toBeGreaterThanOrEqual(
          results[i].metrics.apy
        );
      }

      // Check highest APY
      expect(results[0].username).toBe('crypto_master');
    });

    it('should sort by tier then total staked', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'tier',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      
      // Group by tier and verify ordering
      const tierOrder = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'];
      let currentTierIndex = 0;
      
      for (const result of results) {
        const tierIndex = tierOrder.indexOf(result.tier);
        expect(tierIndex).toBeGreaterThanOrEqual(currentTierIndex);
        if (tierIndex > currentTierIndex) {
          currentTierIndex = tierIndex;
        }
      }
    });
  });

  describe('Filter Functionality', () => {
    it('should filter by minimum staked amount', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        filters: {
          minStaked: 10000, // 10K TWIST
        },
        limit: 10,
      });

      expect(results.length).toBe(3); // PLATINUM, both GOLD
      
      for (const result of results) {
        const staked = BigInt(result.metrics.totalStaked) / 10n ** 9n;
        expect(staked).toBeGreaterThanOrEqual(10000n);
      }
    });

    it('should filter by minimum APY', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'apy',
        filters: {
          minApy: 20,
        },
        limit: 10,
      });

      expect(results.length).toBe(2); // Only crypto_master and blockchain_educator
      
      for (const result of results) {
        expect(result.metrics.apy).toBeGreaterThanOrEqual(20);
      }
    });

    it('should filter by tiers', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        filters: {
          tiers: ['GOLD', 'PLATINUM'],
        },
        limit: 10,
      });

      expect(results.length).toBe(3);
      
      for (const result of results) {
        expect(['GOLD', 'PLATINUM']).toContain(result.tier);
      }
    });

    it('should combine multiple filters', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        filters: {
          minStaked: 5000,
          minApy: 15,
          tiers: ['GOLD', 'PLATINUM'],
        },
        limit: 10,
      });

      expect(results.length).toBe(2); // crypto_master and blockchain_educator
      
      for (const result of results) {
        const staked = BigInt(result.metrics.totalStaked) / 10n ** 9n;
        expect(staked).toBeGreaterThanOrEqual(5000n);
        expect(result.metrics.apy).toBeGreaterThanOrEqual(15);
        expect(['GOLD', 'PLATINUM']).toContain(result.tier);
      }
    });

    it('should return empty results when filters are too restrictive', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        filters: {
          minStaked: 1000000, // 1M TWIST (none have this much)
        },
        limit: 10,
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('Pagination', () => {
    it('should respect limit parameter', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        limit: 3,
      });

      expect(results).toHaveLength(3);
    });

    it('should handle offset correctly', async () => {
      const firstPage = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        limit: 2,
        offset: 0,
      });

      const secondPage = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        limit: 2,
        offset: 2,
      });

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      
      // Ensure no overlap
      const firstPageIds = firstPage.map(i => i.id);
      const secondPageIds = secondPage.map(i => i.id);
      
      for (const id of firstPageIds) {
        expect(secondPageIds).not.toContain(id);
      }
    });

    it('should handle offset beyond total results', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        limit: 10,
        offset: 100,
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('Combined Search, Filter, and Sort', () => {
    it('should search with filters and sorting', async () => {
      const results = await stakingService.searchInfluencers({
        query: 'e', // matches 'queen', 'developer', 'educator'
        sortBy: 'apy',
        filters: {
          minStaked: 1000,
          tiers: ['GOLD', 'SILVER'],
        },
        limit: 10,
      });

      expect(results.length).toBe(2); // DeFi Queen and Blockchain Educator
      
      // Verify APY sorting
      if (results.length > 1) {
        expect(results[0].metrics.apy).toBeGreaterThanOrEqual(results[1].metrics.apy);
      }
      
      // Verify tier filter
      for (const result of results) {
        expect(['GOLD', 'SILVER']).toContain(result.tier);
      }
    });
  });

  describe('Performance and Caching', () => {
    it('should cache search results', async () => {
      const params = {
        query: 'crypto',
        sortBy: 'totalStaked' as const,
        limit: 10,
      };

      // First call - cache miss
      const start1 = Date.now();
      const results1 = await stakingService.searchInfluencers(params);
      const time1 = Date.now() - start1;

      // Second call - cache hit
      const start2 = Date.now();
      const results2 = await stakingService.searchInfluencers(params);
      const time2 = Date.now() - start2;

      expect(results1).toEqual(results2);
      expect(time2).toBeLessThan(time1); // Cached response should be faster
    });

    it('should handle concurrent searches efficiently', async () => {
      const searches = Array(10).fill(null).map((_, i) => 
        stakingService.searchInfluencers({
          query: i % 2 === 0 ? 'crypto' : 'defi',
          sortBy: 'totalStaked',
          limit: 10,
        })
      );

      const start = Date.now();
      const results = await Promise.all(searches);
      const totalTime = Date.now() - start;

      expect(results).toHaveLength(10);
      expect(totalTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Real-time Updates', () => {
    it('should include recent stakers in results', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        limit: 5,
      });

      for (const result of results) {
        expect(result).toHaveProperty('recentStakers');
        expect(Array.isArray(result.recentStakers)).toBe(true);
      }
    });

    it('should include staking trend in results', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        limit: 5,
      });

      for (const result of results) {
        expect(result.metrics).toHaveProperty('stakingTrend');
        expect(['up', 'down', 'stable']).toContain(result.metrics.stakingTrend);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid sort parameter gracefully', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'invalid' as any,
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle negative limit', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        limit: -10,
      });

      expect(results.length).toBeGreaterThanOrEqual(0);
      expect(results.length).toBeLessThanOrEqual(20); // Default limit
    });

    it('should handle extremely large offset', async () => {
      const results = await stakingService.searchInfluencers({
        sortBy: 'totalStaked',
        limit: 10,
        offset: Number.MAX_SAFE_INTEGER,
      });

      expect(results).toHaveLength(0);
    });
  });
});