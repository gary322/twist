import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Influencer } from '../entities/influencer.entity';
import { Attribution } from '../entities/attribution.entity';
import { Payout } from '../entities/payout.entity';
import { RedisService } from './redis.service';
import { SolanaService } from './solana.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Influencer)
    private influencerRepository: Repository<Influencer>,
    @InjectRepository(Attribution)
    private attributionRepository: Repository<Attribution>,
    @InjectRepository(Payout)
    private payoutRepository: Repository<Payout>,
    private redisService: RedisService,
    private solanaService: SolanaService,
  ) {}

  async getInfluencerDashboardStats(influencerId: string): Promise<any> {
    // Check cache first
    const cacheKey = `dashboard:${influencerId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch influencer data
    const influencer = await this.influencerRepository.findOne({
      where: { id: influencerId },
      relations: ['stakingPool'],
    });

    if (!influencer) {
      throw new Error('Influencer not found');
    }

    // Get pool data from blockchain
    const poolData = await this.solanaService.getPoolData(influencer.stakingPool.poolAddress);

    // Calculate time-based metrics
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Aggregate attribution data
    const [
      totalAttributions,
      dailyAttributions,
      weeklyAttributions,
      monthlyAttributions,
    ] = await Promise.all([
      this.attributionRepository.count({ where: { influencerId } }),
      this.attributionRepository.count({
        where: { 
          influencerId,
          createdAt: { $gte: startOfDay } as any
        }
      }),
      this.attributionRepository.count({
        where: { 
          influencerId,
          createdAt: { $gte: startOfWeek } as any
        }
      }),
      this.attributionRepository.count({
        where: { 
          influencerId,
          createdAt: { $gte: startOfMonth } as any
        }
      }),
    ]);

    // Calculate earnings
    const [
      totalEarnings,
      dailyEarnings,
      weeklyEarnings,
      monthlyEarnings,
    ] = await Promise.all([
      this.calculateEarnings(influencerId),
      this.calculateEarnings(influencerId, startOfDay),
      this.calculateEarnings(influencerId, startOfWeek),
      this.calculateEarnings(influencerId, startOfMonth),
    ]);

    // Get payout history
    const recentPayouts = await this.payoutRepository.find({
      where: { influencerId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    // Calculate conversion metrics
    const conversionRate = await this.calculateConversionRate(influencerId);
    const avgRevenuePerUser = await this.calculateAvgRevenuePerUser(influencerId);

    // Build dashboard stats
    const stats = {
      overview: {
        tier: influencer.tier,
        totalStaked: poolData.totalStaked,
        stakerCount: poolData.stakerCount,
        apy: poolData.apy,
        revenueShare: poolData.revenueShare,
      },
      earnings: {
        total: totalEarnings,
        daily: dailyEarnings,
        weekly: weeklyEarnings,
        monthly: monthlyEarnings,
        pending: await this.calculatePendingEarnings(influencerId),
      },
      attributions: {
        total: totalAttributions,
        daily: dailyAttributions,
        weekly: weeklyAttributions,
        monthly: monthlyAttributions,
      },
      performance: {
        conversionRate,
        avgRevenuePerUser,
        engagementRate: await this.calculateEngagementRate(influencerId),
        growthRate: await this.calculateGrowthRate(influencerId),
      },
      payouts: {
        recent: recentPayouts,
        nextPayout: await this.getNextPayoutDate(influencerId),
        lifetime: await this.calculateLifetimePayouts(influencerId),
      },
      referrals: {
        total: await this.countReferrals(influencerId),
        active: await this.countActiveReferrals(influencerId),
        revenue: await this.calculateReferralRevenue(influencerId),
      },
    };

    // Cache for 5 minutes
    await this.redisService.set(cacheKey, JSON.stringify(stats), 300);

    return stats;
  }

  private async calculateEarnings(
    influencerId: string,
    startDate?: Date,
  ): Promise<number> {
    const query = this.attributionRepository
      .createQueryBuilder('attribution')
      .where('attribution.influencerId = :influencerId', { influencerId })
      .andWhere('attribution.status = :status', { status: 'completed' });

    if (startDate) {
      query.andWhere('attribution.createdAt >= :startDate', { startDate });
    }

    const result = await query
      .select('SUM(attribution.earnings)', 'total')
      .getRawOne();

    return result?.total || 0;
  }

  private async calculatePendingEarnings(influencerId: string): Promise<number> {
    const result = await this.attributionRepository
      .createQueryBuilder('attribution')
      .where('attribution.influencerId = :influencerId', { influencerId })
      .andWhere('attribution.status = :status', { status: 'pending' })
      .select('SUM(attribution.earnings)', 'total')
      .getRawOne();

    return result?.total || 0;
  }

  private async calculateConversionRate(influencerId: string): Promise<number> {
    const [clicks, conversions] = await Promise.all([
      this.attributionRepository.count({
        where: { influencerId, type: 'click' }
      }),
      this.attributionRepository.count({
        where: { influencerId, type: 'conversion' }
      }),
    ]);

    return clicks > 0 ? (conversions / clicks) * 100 : 0;
  }

  private async calculateAvgRevenuePerUser(influencerId: string): Promise<number> {
    const result = await this.attributionRepository
      .createQueryBuilder('attribution')
      .where('attribution.influencerId = :influencerId', { influencerId })
      .andWhere('attribution.status = :status', { status: 'completed' })
      .select('COUNT(DISTINCT attribution.userId)', 'users')
      .addSelect('SUM(attribution.earnings)', 'revenue')
      .getRawOne();

    return result?.users > 0 ? result.revenue / result.users : 0;
  }

  private async calculateEngagementRate(influencerId: string): Promise<number> {
    // Calculate based on clicks vs impressions
    const [impressions, clicks] = await Promise.all([
      this.attributionRepository.count({
        where: { influencerId, type: 'impression' }
      }),
      this.attributionRepository.count({
        where: { influencerId, type: 'click' }
      }),
    ]);

    return impressions > 0 ? (clicks / impressions) * 100 : 0;
  }

  private async calculateGrowthRate(influencerId: string): Promise<number> {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const [currentMonthEarnings, lastMonthEarnings] = await Promise.all([
      this.calculateEarnings(influencerId, lastMonth),
      this.calculateEarnings(influencerId, twoMonthsAgo),
    ]);

    if (lastMonthEarnings === 0) return 0;
    
    return ((currentMonthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100;
  }

  private async calculateLifetimePayouts(influencerId: string): Promise<number> {
    const result = await this.payoutRepository
      .createQueryBuilder('payout')
      .where('payout.influencerId = :influencerId', { influencerId })
      .andWhere('payout.status = :status', { status: 'completed' })
      .select('SUM(payout.amount)', 'total')
      .getRawOne();

    return result?.total || 0;
  }

  private async getNextPayoutDate(influencerId: string): Promise<Date> {
    // Calculate next payout date based on payout schedule
    const lastPayout = await this.payoutRepository.findOne({
      where: { influencerId, status: 'completed' },
      order: { createdAt: 'DESC' },
    });

    const nextDate = new Date();
    if (lastPayout) {
      nextDate.setDate(lastPayout.createdAt.getDate() + 30); // Monthly payouts
    } else {
      nextDate.setDate(nextDate.getDate() + 30);
    }

    return nextDate;
  }

  private async countReferrals(influencerId: string): Promise<number> {
    return this.attributionRepository.count({
      where: { referrerId: influencerId }
    });
  }

  private async countActiveReferrals(influencerId: string): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.attributionRepository.count({
      where: { 
        referrerId: influencerId,
        createdAt: { $gte: thirtyDaysAgo } as any
      }
    });
  }

  private async calculateReferralRevenue(influencerId: string): Promise<number> {
    const result = await this.attributionRepository
      .createQueryBuilder('attribution')
      .where('attribution.referrerId = :influencerId', { influencerId })
      .andWhere('attribution.status = :status', { status: 'completed' })
      .select('SUM(attribution.referralEarnings)', 'total')
      .getRawOne();

    return result?.total || 0;
  }
}
