import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolanaService } from '../services/solana.service';
import { EmailService } from '../services/email.service';
import { NotificationService } from '../services/notification.service';
import { InfluencerService } from '../services/influencer.service';
import { Message } from '@twist/messages';
import { PublicKey } from '@solana/web3.js';

@Processor('influencer')
export class InfluencerQueueProcessor {
  private readonly logger = new Logger(InfluencerQueueProcessor.name);

  constructor(
    private solanaService: SolanaService,
    private emailService: EmailService,
    private notificationService: NotificationService,
    private influencerService: InfluencerService,
  ) {}

  @Process('create-staking-pool')
  async handleCreateStakingPool(job: Job<{
    influencerId: string;
    walletAddress: string;
  }>) {
    const { influencerId, walletAddress } = job.data;
    
    try {
      this.logger.log(`Creating staking pool for influencer ${influencerId}`);
      
      await this.influencerService.createStakingPool(influencerId);
      
      // Send success notification
      await this.notificationService.sendNotification({
        userId: influencerId,
        type: 'STAKING_POOL_CREATED',
        title: 'Staking Pool Created',
        message: 'Your staking pool has been created successfully. Users can now stake on you!',
        data: { walletAddress },
      });
      
      this.logger.log(`Staking pool created successfully for ${influencerId}`);
    } catch (error) {
      this.logger.error(`Failed to create staking pool for ${influencerId}`, error);
      
      // Send failure notification
      await this.notificationService.sendNotification({
        userId: influencerId,
        type: 'STAKING_POOL_FAILED',
        title: 'Staking Pool Creation Failed',
        message: 'We encountered an error creating your staking pool. Please try again later.',
        data: { error: error.message },
      });
      
      throw error;
    }
  }

  @Process('tier-change-notification')
  async handleTierChangeNotification(job: Job<{
    influencerId: string;
    oldTier: string;
    newTier: string;
    benefits: any;
  }>) {
    const { influencerId, oldTier, newTier, benefits } = job.data;
    
    try {
      // Get influencer details
      const influencer = await this.influencerService.findById(influencerId);
      if (!influencer) {
        throw new Error('Influencer not found');
      }

      // Send email notification
      await this.emailService.sendEmail({
        to: influencer.email,
        subject: `Congratulations! You've been upgraded to ${newTier} tier`,
        template: 'tier-upgrade',
        context: {
          username: influencer.username,
          oldTier,
          newTier,
          benefits,
        },
      });

      // Send push notification
      await this.notificationService.sendNotification({
        userId: influencerId,
        type: 'TIER_UPGRADED',
        title: `You're now ${newTier} tier!`,
        message: `Congratulations on reaching ${newTier} tier. Check out your new benefits!`,
        data: { oldTier, newTier, benefits },
      });

      this.logger.log(`Tier change notification sent for ${influencer.username}`);
    } catch (error) {
      this.logger.error(`Failed to send tier change notification`, error);
    }
  }

  @Process('publish-event')
  async handlePublishEvent(job: Job<Message>) {
    const message = job.data;
    
    try {
      // Publish to event bus (could be Kafka, RabbitMQ, etc.)
      // For now, just log it
      this.logger.log(`Publishing event: ${message.type}`, message.data);
      
      // Here you would typically:
      // 1. Publish to a message broker
      // 2. Update analytics
      // 3. Trigger webhooks
      // 4. Update real-time dashboards via WebSocket
      
    } catch (error) {
      this.logger.error(`Failed to publish event ${message.type}`, error);
    }
  }

  @Process('process-staking-rewards')
  async handleProcessStakingRewards(job: Job<{
    poolAddress: string;
    earningAmount: string;
  }>) {
    const { poolAddress, earningAmount } = job.data;
    
    try {
      this.logger.log(`Processing staking rewards for pool ${poolAddress}`);
      
      // This would typically:
      // 1. Call the Solana program to distribute rewards
      // 2. Update database with reward distribution
      // 3. Send notifications to stakers
      
      // For now, just log
      this.logger.log(`Distributed ${earningAmount} rewards to pool ${poolAddress}`);
    } catch (error) {
      this.logger.error(`Failed to process staking rewards`, error);
      throw error;
    }
  }

  @Process('sync-on-chain-data')
  async handleSyncOnChainData(job: Job<{
    poolAddress: string;
  }>) {
    const { poolAddress } = job.data;
    
    try {
      this.logger.log(`Syncing on-chain data for pool ${poolAddress}`);
      
      // Get on-chain pool data
      const poolData = await this.solanaService.getStakingPool(poolAddress);
      
      // Update database with latest on-chain state
      // This ensures consistency between on-chain and off-chain data
      
      this.logger.log(`Synced data for pool ${poolAddress}`, poolData);
    } catch (error) {
      this.logger.error(`Failed to sync on-chain data`, error);
    }
  }

  @Process('welcome-email')
  async handleWelcomeEmail(job: Job<{
    influencerId: string;
  }>) {
    const { influencerId } = job.data;
    
    try {
      const influencer = await this.influencerService.findById(influencerId);
      if (!influencer) {
        throw new Error('Influencer not found');
      }

      await this.emailService.sendEmail({
        to: influencer.email,
        subject: 'Welcome to Twist Influencer Program!',
        template: 'influencer-welcome',
        context: {
          username: influencer.username,
          dashboardUrl: `https://twist.to/dashboard`,
          stakingUrl: `https://twist.to/staking`,
          supportUrl: `https://twist.to/support`,
        },
      });

      this.logger.log(`Welcome email sent to ${influencer.username}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email`, error);
    }
  }
}
