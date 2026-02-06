import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StakingReward, InfluencerStakingPool, UserStake } from '../entities';
import { NotificationService } from '../services/notification.service';
import { SolanaService } from '../services/solana.service';
import { PublicKey } from '@solana/web3.js';

@Processor('staking')
export class StakingQueueProcessor {
  private readonly logger = new Logger(StakingQueueProcessor.name);

  constructor(
    @InjectRepository(StakingReward)
    private rewardRepo: Repository<StakingReward>,
    @InjectRepository(InfluencerStakingPool)
    private poolRepo: Repository<InfluencerStakingPool>,
    @InjectRepository(UserStake)
    private stakeRepo: Repository<UserStake>,
    private notificationService: NotificationService,
    private solanaService: SolanaService,
  ) {}

  @Process('distribute-rewards')
  async handleDistributeRewards(job: Job<{
    poolId: string;
    earningAmount: string;
    conversionId: string;
  }>) {
    const { poolId, earningAmount, conversionId } = job.data;
    
    try {
      this.logger.log(`Distributing rewards for pool ${poolId}`);
      
      const pool = await this.poolRepo.findOne({
        where: { id: poolId },
        relations: ['influencer'],
      });
      
      if (!pool) {
        throw new Error('Pool not found');
      }
      
      // Calculate staker share
      const totalEarnings = BigInt(earningAmount);
      const stakerShare = (totalEarnings * BigInt(pool.revenueShareBps)) / 10000n;
      const influencerShare = totalEarnings - stakerShare;
      
      // In production, call Solana program to distribute rewards
      const transactionId = await this.simulateRewardDistribution(pool.poolAddress, totalEarnings);
      
      // Record reward distribution
      const reward = this.rewardRepo.create({
        poolId,
        earningAmount: totalEarnings,
        stakerShare,
        influencerShare,
        distributedAt: new Date(),
        transactionId,
      });
      
      await this.rewardRepo.save(reward);
      
      // Update pool metrics
      pool.totalRewardsDistributed = BigInt(pool.totalRewardsDistributed) + totalEarnings;
      pool.pendingRewards = BigInt(pool.pendingRewards) + stakerShare;
      await this.poolRepo.save(pool);
      
      // Notify stakers
      await this.notifyStakersOfRewards(pool, stakerShare);
      
      // Notify influencer
      await this.notificationService.sendNotification({
        userId: pool.influencer.id,
        type: 'REWARDS_DISTRIBUTED',
        title: 'Staking Rewards Distributed',
        message: `${influencerShare / 10n ** 9n} TWIST earned from conversion. ${stakerShare / 10n ** 9n} TWIST distributed to your stakers.`,
        data: {
          conversionId,
          totalEarnings: totalEarnings.toString(),
          influencerShare: influencerShare.toString(),
          stakerShare: stakerShare.toString(),
        },
      });
      
      this.logger.log(`Rewards distributed successfully for pool ${poolId}`);
    } catch (error) {
      this.logger.error(`Failed to distribute rewards for pool ${poolId}`, error);
      throw error;
    }
  }

  @Process('calculate-apy')
  async handleCalculateApy(job: Job<{ poolId: string }>) {
    const { poolId } = job.data;
    
    try {
      this.logger.log(`Calculating APY for pool ${poolId}`);
      
      const pool = await this.poolRepo.findOne({ where: { id: poolId } });
      if (!pool) {
        throw new Error('Pool not found');
      }
      
      // Get rewards from last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentRewards = await this.rewardRepo
        .createQueryBuilder('reward')
        .where('reward.poolId = :poolId', { poolId })
        .andWhere('reward.distributedAt > :date', { date: thirtyDaysAgo })
        .getMany();
      
      if (recentRewards.length === 0 || pool.totalStaked === 0n) {
        pool.currentApy = 0;
      } else {
        // Calculate total staker rewards
        const totalStakerRewards = recentRewards.reduce(
          (sum, r) => sum + BigInt(r.stakerShare),
          0n
        );
        
        // Calculate daily rate
        const dailyRate = Number(totalStakerRewards * 10000n / BigInt(pool.totalStaked)) / 30 / 10000;
        
        // Annualize
        const apy = (Math.pow(1 + dailyRate, 365) - 1) * 100;
        pool.currentApy = Math.round(apy * 100) / 100;
      }
      
      await this.poolRepo.save(pool);
      
      this.logger.log(`APY calculated for pool ${poolId}: ${pool.currentApy}%`);
    } catch (error) {
      this.logger.error(`Failed to calculate APY for pool ${poolId}`, error);
    }
  }

  @Process('sync-pool-data')
  async handleSyncPoolData(job: Job<{ poolAddress: string }>) {
    const { poolAddress } = job.data;
    
    try {
      this.logger.log(`Syncing pool data for ${poolAddress}`);
      
      // Get on-chain data
      const onChainData = await this.solanaService.getStakingPool(poolAddress);
      
      // Update database
      const pool = await this.poolRepo.findOne({ where: { poolAddress } });
      if (!pool) {
        throw new Error('Pool not found in database');
      }
      
      // Update if values differ
      if (onChainData.totalStaked !== pool.totalStaked.toString()) {
        pool.totalStaked = BigInt(onChainData.totalStaked);
      }
      
      if (onChainData.stakerCount !== pool.stakerCount) {
        pool.stakerCount = onChainData.stakerCount;
      }
      
      await this.poolRepo.save(pool);
      
      this.logger.log(`Pool data synced for ${poolAddress}`);
    } catch (error) {
      this.logger.error(`Failed to sync pool data for ${poolAddress}`, error);
    }
  }

  @Process('publish-event')
  async handlePublishEvent(job: Job<{
    topic: string;
    source: string;
    data: any;
  }>) {
    const { topic, source, data } = job.data;
    
    try {
      // In production, this would publish to a message broker
      this.logger.log(`Publishing event: ${topic}`, { source, data });
      
      // Handle specific event types
      switch (topic) {
        case 'influencer.staked':
          await this.handleStakedEvent(data);
          break;
        case 'influencer.tier.changed':
          await this.handleTierChangedEvent(data);
          break;
        default:
          // Generic event handling
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to publish event ${topic}`, error);
    }
  }

  private async handleStakedEvent(data: any) {
    // Send notification to influencer about new stake
    await this.notificationService.sendNotification({
      userId: data.influencerId,
      type: 'NEW_STAKER',
      title: 'New Staker!',
      message: `Someone just staked ${BigInt(data.amount) / 10n ** 9n} TWIST on you!`,
      data: {
        amount: data.amount,
        newTotalStaked: data.newTotalStaked,
        newStakerCount: data.newStakerCount,
      },
    });
  }

  private async handleTierChangedEvent(data: any) {
    // Tier change is handled by the TierManagementService
    this.logger.log(`Tier changed for influencer ${data.influencerId} to ${data.newTier}`);
  }

  private async notifyStakersOfRewards(pool: InfluencerStakingPool, totalRewards: bigint) {
    // Get all active stakers
    const stakers = await this.stakeRepo.find({
      where: { poolId: pool.id, isActive: true },
    });
    
    // Calculate each staker's share
    const totalStaked = BigInt(pool.totalStaked);
    
    for (const stake of stakers) {
      const stakeAmount = BigInt(stake.amount);
      const stakersReward = (stakeAmount * totalRewards) / totalStaked;
      
      // Update pending rewards
      stake.pendingRewards = BigInt(stake.pendingRewards) + stakersReward;
      await this.stakeRepo.save(stake);
      
      // Send notification
      await this.notificationService.sendNotification({
        userId: stake.userId,
        type: 'STAKING_REWARDS',
        title: 'Staking Rewards Earned!',
        message: `You earned ${stakersReward / 10n ** 9n} TWIST from staking on ${pool.influencer.username}`,
        data: {
          influencerId: pool.influencerId,
          rewardAmount: stakersReward.toString(),
          totalPending: stake.pendingRewards.toString(),
        },
      });
    }
  }

  private async simulateRewardDistribution(poolAddress: string, amount: bigint): Promise<string> {
    // In production, this would execute on-chain transaction
    // For now, return mock transaction ID
    return Buffer.from(poolAddress + amount.toString() + Date.now())
      .toString('base64')
      .replace(/[+/=]/g, '');
  }
}