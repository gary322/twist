import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StakingService } from './staking.service';
import {
  InfluencerStakingPool,
  UserStake,
  StakingReward,
  StakingHistory,
  Influencer,
  InfluencerTier,
} from '../entities';

describe('StakingService', () => {
  let service: StakingService;
  let mockPoolRepo: any;
  let mockStakeRepo: any;
  let mockRedis: any;

  beforeEach(async () => {
    mockPoolRepo = {
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockStakeRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(data => data),
    };

    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StakingService,
        {
          provide: getRepositoryToken(InfluencerStakingPool),
          useValue: mockPoolRepo,
        },
        {
          provide: getRepositoryToken(UserStake),
          useValue: mockStakeRepo,
        },
        {
          provide: getRepositoryToken(StakingReward),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(StakingHistory),
          useValue: { save: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Influencer),
          useValue: { update: jest.fn() },
        },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
        {
          provide: 'BullQueue_staking',
          useValue: { add: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<StakingService>(StakingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchInfluencers', () => {
    it('should return cached results if available', async () => {
      const cachedData = JSON.stringify([{ id: '1', username: 'test' }]);
      mockRedis.get.mockResolvedValue(cachedData);

      const result = await service.searchInfluencers({
        sortBy: 'totalStaked',
      });

      expect(mockRedis.get).toHaveBeenCalled();
      expect(result).toEqual(JSON.parse(cachedData));
    });

    it('should query database if no cache', async () => {
      mockRedis.get.mockResolvedValue(null);

      await service.searchInfluencers({
        query: 'test',
        sortBy: 'apy',
        filters: { minStaked: 100 },
      });

      expect(mockPoolRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('stakeOnInfluencer', () => {
    it('should reject if pool not found', async () => {
      mockPoolRepo.findOne.mockResolvedValue(null);

      await expect(
        service.stakeOnInfluencer({
          userId: 'user1',
          influencerId: 'inf1',
          amount: 1000n,
          wallet: 'wallet1',
        })
      ).rejects.toThrow('Staking pool not found or inactive');
    });

    it('should reject if below minimum stake', async () => {
      mockPoolRepo.findOne.mockResolvedValue({
        id: 'pool1',
        minStake: 10000n,
        influencer: { id: 'inf1', tier: InfluencerTier.BRONZE },
      });

      await expect(
        service.stakeOnInfluencer({
          userId: 'user1',
          influencerId: 'inf1',
          amount: 1000n,
          wallet: 'wallet1',
        })
      ).rejects.toThrow('Minimum stake is');
    });
  });

  describe('calculateTier', () => {
    it('should calculate correct tier based on staked amount', () => {
      const testCases = [
        { staked: 500n * 10n**9n, expected: InfluencerTier.BRONZE },
        { staked: 1500n * 10n**9n, expected: InfluencerTier.SILVER },
        { staked: 15000n * 10n**9n, expected: InfluencerTier.GOLD },
        { staked: 60000n * 10n**9n, expected: InfluencerTier.PLATINUM },
      ];

      testCases.forEach(({ staked, expected }) => {
        const tier = service['calculateTier'](staked);
        expect(tier).toBe(expected);
      });
    });
  });
});