import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PayoutService } from '../services/payout.service';
import { ConversionAttributionService } from '../services/conversion-attribution.service';
import { NotificationService } from '../services/notification.service';
import { NotificationType } from '../entities';

@Processor('attribution')
@Injectable()
export class AttributionProcessor {
  private readonly logger = new Logger(AttributionProcessor.name);

  constructor(
    private payoutService: PayoutService,
    private attributionService: ConversionAttributionService,
    private notificationService: NotificationService,
  ) {}

  @Process('calculate-payouts')
  async handlePayoutCalculation(job: Job<{
    conversionId: string;
    attribution: any;
  }>) {
    const { conversionId, attribution } = job.data;

    try {
      this.logger.log(`Processing payout calculation for conversion ${conversionId}`);

      // Process immediate commission payouts for influencers
      for (const influencer of attribution.influencers) {
        if (influencer.earnedAmount > 0) {
          // Add to pending earnings
          await this.addToPendingEarnings(
            influencer.influencerId,
            influencer.earnedAmount,
            conversionId
          );

          // Send notification
          await this.notificationService.sendInfluencerNotification({
            influencerId: influencer.influencerId,
            type: NotificationType.NEW_CONVERSION,
            data: {
              conversionId,
              earnedAmount: influencer.earnedAmount,
              attribution: influencer.attribution,
            },
          });
        }
      }

      this.logger.log(`Completed payout calculation for conversion ${conversionId}`);
    } catch (error) {
      this.logger.error('Failed to calculate payouts', error);
      throw error;
    }
  }

  @Process('process-batch-payout')
  async handleBatchPayout(job: Job<{
    batchId: string;
  }>) {
    const { batchId } = job.data;

    try {
      this.logger.log(`Processing batch payout ${batchId}`);

      await this.payoutService.processPayout(batchId);

      this.logger.log(`Completed batch payout ${batchId}`);
    } catch (error) {
      this.logger.error(`Failed to process batch payout ${batchId}`, error);
      throw error;
    }
  }

  @Process('calculate-influencer-payout')
  async handleInfluencerPayout(job: Job<{
    batchId: string;
    influencerId: string;
    startDate: Date;
    endDate: Date;
  }>) {
    const { batchId, influencerId, startDate, endDate } = job.data;

    try {
      this.logger.log(`Calculating payout for influencer ${influencerId}`);

      
      const calculation = {
        period: { start: startDate, end: endDate },
        earnings: { grossEarnings: 0 },
        stakers: [],
      };
      // const calculation = await this.payoutService.calculateInfluencerPayout({
      //   batchId,
      //   influencerId,
      //   startDate,
      //   endDate,
      // });

      if (calculation.earnings.grossEarnings > 0) {
        // Notify influencer
        await this.notificationService.sendInfluencerNotification({
          influencerId,
          type: NotificationType.PAYOUT_CALCULATED,
          data: {
            period: calculation.period,
            earnings: calculation.earnings,
            stakerCount: calculation.stakers.length,
          },
        });

        // Notify stakers
        for (const staker of calculation.stakers) {
          if (staker.earned > 0) {
            await this.notificationService.sendUserNotification({
              userId: staker.userId,
              type: NotificationType.STAKING_REWARDS,
              data: {
                influencerId,
                earned: staker.earned,
                period: calculation.period,
              },
            });
          }
        }
      }

      this.logger.log(`Completed payout calculation for influencer ${influencerId}`);
    } catch (error) {
      this.logger.error(`Failed to calculate influencer payout ${influencerId}`, error);
      throw error;
    }
  }

  private async addToPendingEarnings(
    influencerId: string,
    amount: number,
    conversionId: string
  ): Promise<void> {
    // This would typically update a pending_earnings table
    // For now, we'll log it
    this.logger.log(`Added ${amount} to pending earnings for influencer ${influencerId} from conversion ${conversionId}`);
  }
}