import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StakingHistory, StakingReward } from '../entities';

interface StakingEventData {
  topic: string;
  source: string;
  data: any;
}

@Processor('staking')
export class StakingProcessor {
  private readonly logger = new Logger(StakingProcessor.name);

  constructor(
    @InjectRepository(StakingHistory)
    private historyRepo: Repository<StakingHistory>,
    @InjectRepository(StakingReward)
    private rewardRepo: Repository<StakingReward>,
  ) {}

  @Process('publish-event')
  async handleStakingEvent(job: Job<StakingEventData>) {
    const { topic, data } = job.data;
    this.logger.log(`Processing event: ${topic}`);

    try {
      switch (topic) {
        case 'influencer.staked':
          await this.handleStakeEvent(data);
          break;
        case 'influencer.unstaked':
          await this.handleUnstakeEvent(data);
          break;
        case 'influencer.rewards.distributed':
          await this.handleRewardsDistributed(data);
          break;
        case 'influencer.rewards.claimed':
          await this.handleRewardsClaimed(data);
          break;
        case 'influencer.tier.changed':
          await this.handleTierChange(data);
          break;
        default:
          this.logger.warn(`Unknown event topic: ${topic}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process event ${topic}:`, error);
      throw error; // Let Bull handle retry logic
    }
  }

  @Process('calculate-apy')
  async calculatePoolApy(job: Job<{ poolId: string }>) {
    const { poolId } = job.data;
    this.logger.log(`Calculating APY for pool: ${poolId}`);

    try {
      // Get rewards from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const rewards = await this.rewardRepo
        .createQueryBuilder('reward')
        .where('reward.poolId = :poolId', { poolId })
        .andWhere('reward.distributedAt > :date', { date: thirtyDaysAgo })
        .select('SUM(reward.stakerShare)', 'totalRewards')
        .addSelect('AVG(reward.earningAmount)', 'avgEarnings')
        .getRawOne();

      // Calculate and update APY in database
      // This would be used by the search API for real-time APY display
      
      this.logger.log(`APY calculation completed for pool ${poolId}`);
    } catch (error) {
      this.logger.error(`Failed to calculate APY for pool ${poolId}:`, error);
      throw error;
    }
  }

  @Process('send-notification')
  async sendNotification(job: Job<{ type: string; userId: string; data: any }>) {
    const { type, userId, data } = job.data;
    this.logger.log(`Sending ${type} notification to user ${userId}`);

    try {
      // In production, integrate with notification service
      switch (type) {
        case 'stake-confirmed':
          // Send stake confirmation email/push
          break;
        case 'rewards-available':
          // Notify user about claimable rewards
          break;
        case 'tier-upgraded':
          // Congratulate on tier progression
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to send notification:`, error);
      throw error;
    }
  }

  private async handleStakeEvent(data: any) {
    // Process stake event
    // Update analytics, send notifications, etc.
    this.logger.log(`Stake event processed for user ${data.userId}`);
  }

  private async handleUnstakeEvent(data: any) {
    // Process unstake event
    this.logger.log(`Unstake event processed for user ${data.userId}`);
  }

  private async handleRewardsDistributed(data: any) {
    // Update reward distribution records
    this.logger.log(`Rewards distributed for pool ${data.poolAddress}`);
  }

  private async handleRewardsClaimed(data: any) {
    // Process reward claim
    this.logger.log(`Rewards claimed by user ${data.userId}`);
  }

  private async handleTierChange(data: any) {
    // Handle influencer tier change
    this.logger.log(`Tier changed for influencer ${data.influencerId} to ${data.newTier}`);
  }
}