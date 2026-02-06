import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attribution } from '../entities/attribution.entity';
import { Payout } from '../entities/payout.entity';
import { Influencer } from '../entities/influencer.entity';
import { SolanaService } from '../services/solana.service';
import { NotificationService } from '../services/notification.service';

@Processor('payouts')
@Injectable()
export class PayoutProcessor {
  private readonly logger = new Logger(PayoutProcessor.name);

  constructor(
    @InjectRepository(Attribution)
    private attributionRepository: Repository<Attribution>,
    @InjectRepository(Payout)
    private payoutRepository: Repository<Payout>,
    @InjectRepository(Influencer)
    private influencerRepository: Repository<Influencer>,
    private solanaService: SolanaService,
    private notificationService: NotificationService,
  ) {}

  @Process('calculate-batch-payouts')
  async calculateBatchPayouts(job: Job) {
    const { startDate, endDate } = job.data;
    
    this.logger.log(`Calculating batch payouts from ${startDate} to ${endDate}`);

    try {
      // Get all influencers eligible for payouts
      const influencers = await this.influencerRepository.find({
        where: { status: 'active' },
        relations: ['stakingPool'],
      });

      const payouts = [];

      for (const influencer of influencers) {
        const payoutAmount = await this.calculateInfluencerPayout(
          influencer.id,
          startDate,
          endDate
        );

        if (payoutAmount > 0) {
          // Check minimum payout threshold
          const minPayout = parseFloat(process.env.MIN_PAYOUT_AMOUNT || '10');
          
          if (payoutAmount >= minPayout) {
            const payout = await this.createPayout(
              influencer,
              payoutAmount,
              startDate,
              endDate
            );
            payouts.push(payout);
          } else {
            // Carry forward to next payout cycle
            await this.carryForwardBalance(influencer.id, payoutAmount);
          }
        }
      }

      this.logger.log(`Created ${payouts.length} payouts for batch`);
      
      // Process payouts
      for (const payout of payouts) {
        await this.processPayout(payout);
      }

      return {
        success: true,
        payoutsCreated: payouts.length,
        totalAmount: payouts.reduce((sum, p) => sum + p.amount, 0),
      };
    } catch (error) {
      this.logger.error(`Batch payout calculation failed: ${error.message}`);
      throw error;
    }
  }

  private async calculateInfluencerPayout(
    influencerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    // Get pending attributions for the period
    const attributions = await this.attributionRepository
      .createQueryBuilder('attribution')
      .where('attribution.influencerId = :influencerId', { influencerId })
      .andWhere('attribution.status = :status', { status: 'pending' })
      .andWhere('attribution.createdAt >= :startDate', { startDate })
      .andWhere('attribution.createdAt <= :endDate', { endDate })
      .getMany();

    let totalEarnings = 0;
    const processedAttributions = [];

    for (const attribution of attributions) {
      // Validate attribution
      if (await this.validateAttribution(attribution)) {
        totalEarnings += attribution.earnings;
        processedAttributions.push(attribution);
      }
    }

    // Add any carried forward balance
    const carriedForward = await this.getCarriedForwardBalance(influencerId);
    totalEarnings += carriedForward;

    // Mark attributions as processed
    for (const attribution of processedAttributions) {
      attribution.status = 'processed';
      attribution.payoutDate = new Date();
      await this.attributionRepository.save(attribution);
    }

    return totalEarnings;
  }

  private async validateAttribution(attribution: Attribution): Promise<boolean> {
    // Implement fraud detection and validation logic
    const fraudChecks = [
      this.checkDuplicateAttribution(attribution),
      this.checkVelocityLimits(attribution),
      this.checkUserQuality(attribution),
      this.checkConversionValidity(attribution),
    ];

    const results = await Promise.all(fraudChecks);
    return results.every(result => result === true);
  }

  private async checkDuplicateAttribution(attribution: Attribution): Promise<boolean> {
    const duplicate = await this.attributionRepository.findOne({
      where: {
        userId: attribution.userId,
        campaignId: attribution.campaignId,
        type: attribution.type,
        id: { $ne: attribution.id } as any,
      }
    });

    return !duplicate;
  }

  private async checkVelocityLimits(attribution: Attribution): Promise<boolean> {
    const hourAgo = new Date();
    hourAgo.setHours(hourAgo.getHours() - 1);

    const recentCount = await this.attributionRepository.count({
      where: {
        userId: attribution.userId,
        createdAt: { $gte: hourAgo } as any,
      }
    });

    return recentCount < 10; // Max 10 actions per hour
  }

  private async checkUserQuality(attribution: Attribution): Promise<boolean> {
    // Check user history for quality signals
    const userHistory = await this.attributionRepository.find({
      where: { userId: attribution.userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    if (userHistory.length === 0) return true; // New user

    const conversionRate = userHistory.filter(a => a.type === 'conversion').length / userHistory.length;
    return conversionRate > 0.01; // At least 1% conversion rate
  }

  private async checkConversionValidity(attribution: Attribution): Promise<boolean> {
    if (attribution.type !== 'conversion') return true;

    // Check if there was a preceding click
    const click = await this.attributionRepository.findOne({
      where: {
        userId: attribution.userId,
        campaignId: attribution.campaignId,
        type: 'click',
        createdAt: { $lt: attribution.createdAt } as any,
      }
    });

    return !!click;
  }

  private async createPayout(
    influencer: Influencer,
    amount: number,
    startDate: Date,
    endDate: Date
  ): Promise<Payout> {
    const payout = this.payoutRepository.create({
      influencerId: influencer.id,
      amount,
      currency: 'TWIST',
      status: 'pending',
      method: 'blockchain',
      walletAddress: influencer.walletAddress,
      periodStart: startDate,
      periodEnd: endDate,
      metadata: {
        poolAddress: influencer.stakingPool.poolAddress,
        tier: influencer.tier,
      }
    });

    return this.payoutRepository.save(payout);
  }

  private async processPayout(payout: Payout) {
    try {
      // Execute blockchain transaction
      const txId = await this.solanaService.distributeRewards(
        payout.metadata.poolAddress,
        payout.amount.toString()
      );

      // Update payout status
      payout.status = 'completed';
      payout.transactionId = txId;
      payout.processedAt = new Date();
      await this.payoutRepository.save(payout);

      // Send notification
      await this.notificationService.notifyPayoutCompleted(payout);

      this.logger.log(`Payout ${payout.id} completed with tx: ${txId}`);
    } catch (error) {
      this.logger.error(`Payout ${payout.id} failed: ${error.message}`);
      
      payout.status = 'failed';
      payout.errorMessage = error.message;
      await this.payoutRepository.save(payout);

      throw error;
    }
  }

  private async getCarriedForwardBalance(influencerId: string): Promise<number> {
    // Get balance from Redis or database
    const balance = await this.attributionRepository
      .createQueryBuilder('attribution')
      .where('attribution.influencerId = :influencerId', { influencerId })
      .andWhere('attribution.status = :status', { status: 'carried_forward' })
      .select('SUM(attribution.earnings)', 'total')
      .getRawOne();

    return balance?.total || 0;
  }

  private async carryForwardBalance(influencerId: string, amount: number) {
    // Create a carried forward attribution
    const attribution = this.attributionRepository.create({
      influencerId,
      type: 'carried_forward',
      status: 'carried_forward',
      earnings: amount,
      metadata: {
        reason: 'Below minimum payout threshold',
        carriedAt: new Date().toISOString(),
      }
    });

    await this.attributionRepository.save(attribution);
  }

  @Process('process-single-payout')
  async processSinglePayout(job: Job) {
    const { payoutId } = job.data;
    
    const payout = await this.payoutRepository.findOne({
      where: { id: payoutId }
    });

    if (!payout) {
      throw new Error(`Payout ${payoutId} not found`);
    }

    await this.processPayout(payout);
  }
}
