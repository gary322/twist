import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InfluencerAnalyticsDaily, InfluencerLink } from '../entities';

@Processor('analytics')
export class AnalyticsProcessor {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(
    @InjectRepository(InfluencerAnalyticsDaily)
    private analyticsRepo: Repository<InfluencerAnalyticsDaily>,
    @InjectRepository(InfluencerLink)
    private linkRepo: Repository<InfluencerLink>,
  ) {}

  @Process('process-click')
  async processClick(job: Job<any>) {
    const { linkCode, timestamp } = job.data;
    this.logger.log(`Processing click for link: ${linkCode}`);

    try {
      // Get link details
      const link = await this.linkRepo.findOne({
        where: { linkCode },
        relations: ['influencer'],
      });

      if (!link) {
        throw new Error(`Link not found: ${linkCode}`);
      }

      // Update daily analytics
      const date = new Date(timestamp);
      date.setHours(0, 0, 0, 0);

      let dailyAnalytics = await this.analyticsRepo.findOne({
        where: {
          influencerId: link.influencer.id,
          date,
        },
      });

      if (!dailyAnalytics) {
        dailyAnalytics = this.analyticsRepo.create({
          influencerId: link.influencer.id,
          date,
          clicks: 0,
          conversions: 0,
          earned: 0n,
          newStakers: 0,
          totalStakedChange: 0n,
        });
      }

      dailyAnalytics.clicks += 1;
      await this.analyticsRepo.save(dailyAnalytics);

      this.logger.log(`Click processed for influencer: ${link.influencer.id}`);
    } catch (error) {
      this.logger.error(`Failed to process click:`, error);
      throw error;
    }
  }

  @Process('process-conversion')
  async processConversion(job: Job<any>) {
    const { linkCode, amount, timestamp } = job.data;
    this.logger.log(`Processing conversion for link: ${linkCode}`);

    try {
      // Get link details
      const link = await this.linkRepo.findOne({
        where: { linkCode },
        relations: ['influencer'],
      });

      if (!link) {
        throw new Error(`Link not found: ${linkCode}`);
      }

      // Update daily analytics
      const date = new Date(timestamp);
      date.setHours(0, 0, 0, 0);

      let dailyAnalytics = await this.analyticsRepo.findOne({
        where: {
          influencerId: link.influencer.id,
          date,
        },
      });

      if (!dailyAnalytics) {
        dailyAnalytics = this.analyticsRepo.create({
          influencerId: link.influencer.id,
          date,
          clicks: 0,
          conversions: 0,
          earned: 0n,
          newStakers: 0,
          totalStakedChange: 0n,
        });
      }

      dailyAnalytics.conversions += 1;
      dailyAnalytics.earned = BigInt(dailyAnalytics.earned) + BigInt(amount);
      await this.analyticsRepo.save(dailyAnalytics);

      this.logger.log(`Conversion processed for influencer: ${link.influencer.id}`);
    } catch (error) {
      this.logger.error(`Failed to process conversion:`, error);
      throw error;
    }
  }

  @Process('aggregate-daily-analytics')
  async aggregateDailyAnalytics(job: Job<{ date: string }>) {
    const { date } = job.data;
    this.logger.log(`Aggregating analytics for date: ${date}`);

    try {
      // Aggregate analytics for all influencers for the given date
      // This would run as a scheduled job at the end of each day
      
      const analyticsDate = new Date(date);
      
      // Get all influencers with activity on this date
      const analytics = await this.analyticsRepo.find({
        where: { date: analyticsDate },
        relations: ['influencer'],
      });

      for (const dailyAnalytic of analytics) {
        // Calculate additional metrics
        const conversionRate = dailyAnalytic.clicks > 0
          ? (dailyAnalytic.conversions / dailyAnalytic.clicks * 100)
          : 0;

        // Update influencer's total earned
        await this.analyticsRepo
          .createQueryBuilder()
          .update('influencers')
          .set({
            totalEarned: () => `total_earned + ${dailyAnalytic.earned}`,
            totalConversions: () => `total_conversions + ${dailyAnalytic.conversions}`,
          })
          .where('id = :id', { id: dailyAnalytic.influencer.id })
          .execute();

        this.logger.log(
          `Daily analytics aggregated for influencer ${dailyAnalytic.influencer.id}: ` +
          `${dailyAnalytic.clicks} clicks, ${dailyAnalytic.conversions} conversions, ` +
          `${conversionRate.toFixed(2)}% conversion rate`
        );
      }

      this.logger.log(`Daily aggregation completed for ${analytics.length} influencers`);
    } catch (error) {
      this.logger.error(`Failed to aggregate daily analytics:`, error);
      throw error;
    }
  }
}