import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import {
  InfluencerStakingPool,
  UserStake,
  StakingReward,
  StakingHistory,
  Influencer,
  InfluencerProfile,
  InfluencerTier,
  StakingAction,
} from '../entities';
import { Connection, PublicKey } from '@solana/web3.js';
import * as crypto from 'crypto';
import { InfluencerCacheService } from './influencer-cache.service';
import { Cacheable, CacheEvict } from './cache.service';

export interface SearchInfluencersParams {
  query?: string;
  sortBy: 'totalStaked' | 'stakerCount' | 'apy' | 'tier';
  filters?: {
    minStaked?: number;
    minApy?: number;
    tiers?: string[];
  };
  limit?: number;
  offset?: number;
}

export interface StakeParams {
  userId: string;
  influencerId: string;
  amount: bigint;
  wallet: string;
}

export interface PoolMetrics {
  totalStaked: string;
  stakerCount: number;
  totalRewardsDistributed: string;
  pendingRewards: string;
  apy: number;
  lastRewardDistribution: Date | null;
}

@Injectable()
export class StakingService {
  private readonly logger = new Logger(StakingService.name);
  private solanaConnection: Connection;

  constructor(
    @InjectRepository(InfluencerStakingPool)
    private poolRepo: Repository<InfluencerStakingPool>,
    @InjectRepository(UserStake)
    private stakeRepo: Repository<UserStake>,
    @InjectRepository(StakingReward)
    private rewardRepo: Repository<StakingReward>,
    @InjectRepository(StakingHistory)
    private historyRepo: Repository<StakingHistory>,
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
    @InjectRedis() private redis: Redis,
    @InjectQueue('staking') private stakingQueue: Queue,
    private cacheService: InfluencerCacheService,
  ) {
    this.solanaConnection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    );
  }

  async searchInfluencers(params: SearchInfluencersParams) {
    // Try to get from cache first
    const cached = await this.cacheService.getStakingSearch(params);
    if (cached) {
      this.logger.debug('Returning cached staking search results');
      return cached;
    }

    const qb = this.poolRepo.createQueryBuilder('pool')
      .leftJoinAndSelect('pool.influencer', 'influencer')
      .leftJoinAndSelect('influencer.profile', 'profile')
      .where('pool.isActive = :active', { active: true });

    // Search query
    if (params.query) {
      qb.andWhere(
        `(
          influencer.username ILIKE :query OR 
          profile.displayName ILIKE :query OR
          profile.bio ILIKE :query
        )`,
        { query: `%${params.query}%` }
      );
    }

    // Filters
    if (params.filters) {
      if (params.filters.minStaked) {
        qb.andWhere('pool.totalStaked >= :minStaked', {
          minStaked: params.filters.minStaked * 10 ** 9,
        });
      }
      if (params.filters.minApy) {
        qb.andWhere('pool.currentApy >= :minApy', {
          minApy: params.filters.minApy,
        });
      }
      if (params.filters.tiers?.length) {
        qb.andWhere('influencer.tier IN (:...tiers)', {
          tiers: params.filters.tiers,
        });
      }
    }

    // Sorting
    switch (params.sortBy) {
      case 'totalStaked':
        qb.orderBy('pool.totalStaked', 'DESC');
        break;
      case 'stakerCount':
        qb.orderBy('pool.stakerCount', 'DESC');
        break;
      case 'apy':
        qb.orderBy('pool.currentApy', 'DESC');
        break;
      case 'tier':
        qb.orderBy('influencer.tier', 'DESC')
          .addOrderBy('pool.totalStaked', 'DESC');
        break;
    }

    qb.limit(params.limit || 20).offset(params.offset || 0);

    const results = await qb.getMany();

    // Enhance with real-time metrics
    const enhanced = await Promise.all(
      results.map(async (pool) => {
        const [metrics, recentStakers, trend] = await Promise.all([
          this.getPoolMetrics(pool.poolAddress),
          this.getRecentStakers(pool.id, 5),
          this.getStakingTrend(pool.id),
        ]);

        return {
          id: pool.influencer.id,
          username: pool.influencer.username,
          displayName: pool.influencer.profile?.displayName,
          avatar: pool.influencer.profile?.avatar,
          tier: pool.influencer.tier,
          verified: pool.influencer.verified,
          bio: pool.influencer.profile?.bio,
          poolAddress: pool.poolAddress,
          metrics: {
            totalStaked: pool.totalStaked.toString(),
            stakerCount: pool.stakerCount,
            revenueSharePercent: pool.revenueShareBps / 100,
            apy: metrics.apy,
            totalRewardsDistributed: metrics.totalRewardsDistributed,
            stakingTrend: trend,
          },
          recentStakers,
        };
      })
    );

    // Cache the results
    await this.cacheService.cacheStakingSearch(params, enhanced);
    return enhanced;
  }

  async stakeOnInfluencer(params: StakeParams) {
    // Validate pool exists
    const pool = await this.poolRepo.findOne({
      where: {
        influencerId: params.influencerId,
        isActive: true,
      },
      relations: ['influencer'],
    });

    if (!pool) {
      throw new NotFoundException('Staking pool not found or inactive');
    }

    // Check minimum stake
    if (params.amount < pool.minStake) {
      throw new BadRequestException(
        `Minimum stake is ${pool.minStake / 10n ** 9n} TWIST`
      );
    }

    try {
      // In production, execute on-chain staking here
      const tx = this.generateMockTransactionId();

      // Record in database
      let userStake = await this.stakeRepo.findOne({
        where: {
          userId: params.userId,
          poolId: pool.id,
        },
      });

      if (!userStake) {
        userStake = this.stakeRepo.create({
          userId: params.userId,
          poolId: pool.id,
          amount: params.amount,
          stakedAt: new Date(),
          lastClaim: new Date(),
          totalClaimed: 0n,
          pendingRewards: 0n,
          isActive: true,
        });
      } else {
        userStake.amount = BigInt(userStake.amount) + params.amount;
      }

      await this.stakeRepo.save(userStake);

      // Update pool stats
      pool.totalStaked = BigInt(pool.totalStaked) + params.amount;
      if (!userStake.id) {
        pool.stakerCount += 1;
      }
      await this.poolRepo.save(pool);

      // Record history
      await this.historyRepo.save({
        userId: params.userId,
        poolId: pool.id,
        action: StakingAction.STAKE,
        amount: params.amount,
        transactionId: tx,
      });

      // Update influencer tier
      const newTier = this.calculateTier(pool.totalStaked);
      if (newTier !== pool.influencer.tier) {
        await this.updateInfluencerTier(pool.influencer.id, newTier);
      }

      // Emit events
      await this.emitStakingEvent({
        type: 'stake',
        userId: params.userId,
        influencerId: params.influencerId,
        amount: params.amount.toString(),
        poolAddress: pool.poolAddress,
        transactionId: tx,
        newTotalStaked: pool.totalStaked.toString(),
        newStakerCount: pool.stakerCount,
        newTier,
      });

      // Invalidate caches
      await this.invalidateStakingCaches(params.influencerId);

      return {
        success: true,
        transactionId: tx,
        poolAddress: pool.poolAddress,
        newTotalStaked: pool.totalStaked.toString(),
        estimatedApy: await this.calculateApy(pool),
      };
    } catch (error) {
      this.logger.error('Staking failed', error);
      throw new BadRequestException('Staking transaction failed');
    }
  }

  async unstake(params: {
    userId: string;
    influencerId: string;
    amount: bigint;
    wallet: string;
  }) {
    const pool = await this.poolRepo.findOne({
      where: { influencerId: params.influencerId },
    });

    if (!pool) {
      throw new NotFoundException('Pool not found');
    }

    const userStake = await this.stakeRepo.findOne({
      where: {
        userId: params.userId,
        poolId: pool.id,
      },
    });

    if (!userStake || BigInt(userStake.amount) < params.amount) {
      throw new BadRequestException('Insufficient staked balance');
    }

    // In production, execute on-chain unstaking
    const tx = this.generateMockTransactionId();

    // Update database
    userStake.amount = BigInt(userStake.amount) - params.amount;
    if (userStake.amount === 0n) {
      userStake.isActive = false;
    }
    await this.stakeRepo.save(userStake);

    // Update pool stats
    pool.totalStaked = BigInt(pool.totalStaked) - params.amount;
    if (userStake.amount === 0n) {
      pool.stakerCount -= 1;
    }
    await this.poolRepo.save(pool);

    // Record history
    await this.historyRepo.save({
      userId: params.userId,
      poolId: pool.id,
      action: StakingAction.UNSTAKE,
      amount: params.amount,
      transactionId: tx,
    });

    return {
      success: true,
      transactionId: tx,
      remainingStake: userStake.amount.toString(),
    };
  }

  async claimRewards(params: {
    userId: string;
    influencerId: string;
    wallet: string;
  }) {
    const pool = await this.poolRepo.findOne({
      where: { influencerId: params.influencerId },
    });

    if (!pool) {
      throw new NotFoundException('Pool not found');
    }

    const userStake = await this.stakeRepo.findOne({
      where: {
        userId: params.userId,
        poolId: pool.id,
        isActive: true,
      },
    });

    if (!userStake) {
      throw new NotFoundException('No active stake found');
    }

    // Calculate pending rewards
    const pendingRewards = await this.calculatePendingRewards(userStake, pool);

    if (pendingRewards === 0n) {
      throw new BadRequestException('No rewards to claim');
    }

    // In production, execute on-chain claim
    const tx = this.generateMockTransactionId();

    // Update database
    userStake.totalClaimed = BigInt(userStake.totalClaimed) + pendingRewards;
    userStake.lastClaim = new Date();
    userStake.pendingRewards = 0n;
    await this.stakeRepo.save(userStake);

    // Record history
    await this.historyRepo.save({
      userId: params.userId,
      poolId: pool.id,
      action: StakingAction.CLAIM,
      amount: pendingRewards,
      transactionId: tx,
    });

    return {
      success: true,
      transactionId: tx,
      claimedAmount: pendingRewards.toString(),
      totalClaimed: userStake.totalClaimed.toString(),
    };
  }

  async getInfluencerStakingDetails(influencerId: string) {
    const pool = await this.poolRepo.findOne({
      where: { influencerId, isActive: true },
      relations: ['influencer', 'influencer.profile'],
    });

    if (!pool) {
      throw new NotFoundException('Staking pool not found');
    }

    const [
      metrics,
      topStakers,
      recentActivity,
      historicalApy,
    ] = await Promise.all([
      this.getPoolMetrics(pool.poolAddress),
      this.getTopStakers(pool.id, 10),
      this.getRecentActivity(pool.id, 20),
      this.getHistoricalApy(pool.id, 30),
    ]);

    return {
      influencer: {
        id: pool.influencer.id,
        username: pool.influencer.username,
        displayName: pool.influencer.profile?.displayName,
        avatar: pool.influencer.profile?.avatar,
        tier: pool.influencer.tier,
        bio: pool.influencer.profile?.bio,
        verified: pool.influencer.verified,
      },
      pool: {
        address: pool.poolAddress,
        totalStaked: pool.totalStaked.toString(),
        stakerCount: pool.stakerCount,
        revenueSharePercent: pool.revenueShareBps / 100,
        minStake: pool.minStake.toString(),
        createdAt: pool.createdAt,
      },
      metrics,
      topStakers,
      recentActivity,
      historicalApy,
    };
  }

  async getUserStakes(userId: string) {
    // Try to get from cache first
    const cached = await this.cacheService.getUserStakes(userId);
    if (cached) {
      this.logger.debug(`Returning cached user stakes for ${userId}`);
      return cached;
    }

    const stakes = await this.stakeRepo.find({
      where: { userId, isActive: true },
      relations: ['pool', 'pool.influencer', 'pool.influencer.profile'],
    });

    const result = await Promise.all(
      stakes.map(async (stake) => {
        const pendingRewards = await this.calculatePendingRewards(stake, stake.pool);
        const metrics = await this.getPoolMetrics(stake.pool.poolAddress);

        return {
          influencer: {
            id: stake.pool.influencer.id,
            username: stake.pool.influencer.username,
            displayName: stake.pool.influencer.profile?.displayName,
            avatar: stake.pool.influencer.profile?.avatar,
            tier: stake.pool.influencer.tier,
          },
          stake: {
            amount: stake.amount.toString(),
            stakedAt: stake.stakedAt,
            pendingRewards: pendingRewards.toString(),
            totalClaimed: stake.totalClaimed.toString(),
            apy: metrics.apy,
          },
          pool: {
            totalStaked: stake.pool.totalStaked.toString(),
            stakerCount: stake.pool.stakerCount,
            revenueSharePercent: stake.pool.revenueShareBps / 100,
          },
        };
      })
    );

    // Cache the results
    await this.cacheService.cacheUserStakes(userId, result);
    return result;
  }

  private async getPoolMetrics(poolAddress: string): Promise<PoolMetrics> {
    return this.cacheService.getCacheService().getOrSet(
      `metrics:${poolAddress}`,
      async () => {
        // In production, get on-chain data
        const pool = await this.poolRepo.findOne({ where: { poolAddress } });
        if (!pool) {
          throw new NotFoundException('Pool not found');
        }

        // Calculate APY from recent rewards
        const recentRewards = await this.rewardRepo
          .createQueryBuilder('reward')
          .where('reward.poolId = :poolId', { poolId: pool.id })
          .andWhere('reward.distributedAt > :date', {
            date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          })
          .orderBy('reward.distributedAt', 'DESC')
          .getMany();

        const apy = this.calculateApyFromRewards(recentRewards, pool.totalStaked);

        const metrics = {
          totalStaked: pool.totalStaked.toString(),
          stakerCount: pool.stakerCount,
          totalRewardsDistributed: pool.totalRewardsDistributed.toString(),
          pendingRewards: pool.pendingRewards.toString(),
          apy,
          lastRewardDistribution: recentRewards[0]?.distributedAt || null,
        };

        return metrics;
      },
      { prefix: 'pool', ttl: 300 }
    );
  }

  private async getRecentStakers(poolId: string, limit: number) {
    const recentStakes = await this.stakeRepo.find({
      where: { poolId, isActive: true },
      order: { stakedAt: 'DESC' },
      take: limit,
      select: ['userId', 'amount', 'stakedAt'],
    });

    return recentStakes.map(stake => ({
      userId: stake.userId.substring(0, 8) + '...',
      amount: stake.amount.toString(),
      stakedAt: stake.stakedAt,
    }));
  }

  private async getStakingTrend(poolId: string): Promise<'up' | 'down' | 'stable'> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

    const [firstHalf, secondHalf] = await Promise.all([
      this.historyRepo
        .createQueryBuilder('history')
        .where('history.poolId = :poolId', { poolId })
        .andWhere('history.action = :action', { action: StakingAction.STAKE })
        .andWhere('history.createdAt >= :start', { start: thirtyDaysAgo })
        .andWhere('history.createdAt < :end', { end: fifteenDaysAgo })
        .select('SUM(history.amount)', 'total')
        .getRawOne(),
      this.historyRepo
        .createQueryBuilder('history')
        .where('history.poolId = :poolId', { poolId })
        .andWhere('history.action = :action', { action: StakingAction.STAKE })
        .andWhere('history.createdAt >= :start', { start: fifteenDaysAgo })
        .select('SUM(history.amount)', 'total')
        .getRawOne(),
    ]);

    const firstTotal = BigInt(firstHalf?.total || 0);
    const secondTotal = BigInt(secondHalf?.total || 0);

    if (secondTotal > firstTotal * 110n / 100n) return 'up';
    if (secondTotal < firstTotal * 90n / 100n) return 'down';
    return 'stable';
  }

  private calculateTier(totalStaked: bigint): InfluencerTier {
    const staked = Number(totalStaked / 10n ** 9n);
    if (staked >= 50000) return InfluencerTier.PLATINUM;
    if (staked >= 10000) return InfluencerTier.GOLD;
    if (staked >= 1000) return InfluencerTier.SILVER;
    return InfluencerTier.BRONZE;
  }

  private calculateApyFromRewards(
    rewards: StakingReward[],
    totalStaked: bigint
  ): number {
    if (rewards.length === 0 || totalStaked === 0n) return 0;

    const totalRewards = rewards.reduce(
      (sum, r) => sum + BigInt(r.stakerShare),
      0n
    );

    const days = 30;
    const dailyRate = Number(totalRewards * 10000n / totalStaked) / days / 10000;
    const apy = (Math.pow(1 + dailyRate, 365) - 1) * 100;

    return Math.round(apy * 100) / 100;
  }

  private async calculatePendingRewards(
    stake: UserStake,
    pool: InfluencerStakingPool
  ): Promise<bigint> {
    if (pool.totalStaked === 0n || stake.amount === 0n) {
      return 0n;
    }

    // Calculate proportional share of pending rewards
    const poolPending = BigInt(pool.pendingRewards);
    const stakeAmount = BigInt(stake.amount);
    const totalStaked = BigInt(pool.totalStaked);

    const share = (stakeAmount * poolPending) / totalStaked;
    
    return share + BigInt(stake.pendingRewards);
  }

  private async calculateApy(pool: InfluencerStakingPool): Promise<number> {
    return Number(pool.currentApy);
  }

  private async invalidateStakingCaches(influencerId: string) {
    // Use cache service to invalidate all related caches
    await this.cacheService.invalidateInfluencer(influencerId);
    
    // Also invalidate staking search cache
    await this.cacheService.getCacheService().deleteByTag('staking-search');
  }

  private async emitStakingEvent(data: any) {
    await this.stakingQueue.add('publish-event', {
      topic: 'influencer.staked',
      source: 'influencer-service',
      data,
    });
  }

  private async updateInfluencerTier(
    influencerId: string,
    newTier: InfluencerTier
  ) {
    await this.influencerRepo.update(influencerId, { tier: newTier });
    
    await this.stakingQueue.add('publish-event', {
      topic: 'influencer.tier.changed',
      source: 'influencer-service',
      data: {
        influencerId,
        newTier,
      },
    });
  }

  private async getTopStakers(poolId: string, limit: number) {
    const stakes = await this.stakeRepo.find({
      where: { poolId, isActive: true },
      order: { amount: 'DESC' },
      take: limit,
    });

    if (stakes.length === 0) return [];

    return stakes.map((stake, index) => ({
      rank: index + 1,
      userId: stake.userId.substring(0, 8) + '...',
      amount: stake.amount.toString(),
      percentage: (Number(stake.amount) / Number(stakes[0].amount) * 100).toFixed(2),
    }));
  }

  private async getRecentActivity(poolId: string, limit: number) {
    const activities = await this.historyRepo.find({
      where: { poolId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return activities.map(activity => ({
      userId: activity.userId.substring(0, 8) + '...',
      action: activity.action,
      amount: activity.amount.toString(),
      transactionId: activity.transactionId,
      createdAt: activity.createdAt,
    }));
  }

  private async getHistoricalApy(poolId: string, days: number) {
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Get pool information
    const pool = await this.poolRepo.findOne({ where: { id: poolId } });
    if (!pool) {
      return [];
    }

    // Get daily reward distributions for the period
    const dailyRewards = await this.rewardRepo
      .createQueryBuilder('reward')
      .select('DATE(reward.distributedAt)', 'date')
      .addSelect('SUM(reward.stakerShare)', 'totalStakerShare')
      .addSelect('COUNT(*)', 'distributionCount')
      .where('reward.poolId = :poolId', { poolId })
      .andWhere('reward.distributedAt >= :startDate', { startDate })
      .andWhere('reward.distributedAt <= :endDate', { endDate })
      .groupBy('DATE(reward.distributedAt)')
      .orderBy('date', 'DESC')
      .getRawMany();

    // Get historical total staked amounts
    const historicalStakes = await this.historyRepo
      .createQueryBuilder('history')
      .select('DATE(history.createdAt)', 'date')
      .addSelect(
        `SUM(CASE 
          WHEN history.action = 'stake' THEN history.amount 
          WHEN history.action = 'unstake' THEN -history.amount 
          ELSE 0 
        END)`,
        'netChange'
      )
      .where('history.poolId = :poolId', { poolId })
      .andWhere('history.createdAt >= :startDate', { startDate })
      .andWhere('history.createdAt <= :endDate', { endDate })
      .groupBy('DATE(history.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    // Calculate running total staked for each day
    let runningTotal = BigInt(pool.totalStaked);
    const stakeTotals = new Map<string, bigint>();
    
    // Work backwards from current date
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      
      // Find net change for this date
      const dayData = historicalStakes.find(h => h.date === dateStr);
      if (dayData) {
        runningTotal -= BigInt(dayData.netChange);
      }
      
      stakeTotals.set(dateStr, runningTotal);
    }

    // Calculate APY for each day
    const apyData = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayRewards = dailyRewards.find(r => r.date === dateStr);
      const totalStaked = stakeTotals.get(dateStr) || BigInt(pool.totalStaked);
      
      let apy = 0;
      
      if (dayRewards && totalStaked > 0n) {
        // Calculate daily rate based on rewards distributed
        const stakerShare = BigInt(dayRewards.totalStakerShare);
        const dailyRate = Number(stakerShare * 10000n / totalStaked) / 10000;
        
        // Annualize the rate
        apy = (Math.pow(1 + dailyRate, 365) - 1) * 100;
        
        // Cap APY at reasonable maximum (1000%)
        apy = Math.min(apy, 1000);
      }
      
      apyData.push({
        date: date,
        apy: Math.round(apy * 100) / 100,
        totalStaked: totalStaked.toString(),
        rewardsDistributed: dayRewards?.totalStakerShare || '0',
        distributionCount: dayRewards?.distributionCount || 0,
      });
    }
    
    // Sort by date ascending (oldest first)
    apyData.reverse();
    
    return apyData;
  }

  private generateMockTransactionId(): string {
    return crypto.randomBytes(44).toString('base64').replace(/[+/=]/g, '');
  }
}