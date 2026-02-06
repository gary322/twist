import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { 
  Influencer, 
  InfluencerStakingPool,
  InfluencerTier,
} from '../entities';
import { MessageFactory } from '@twist/messages';

export interface TierConfig {
  tier: InfluencerTier;
  minStaked: bigint;
  benefits: {
    revenueShareMax: number;
    linkLimit: number;
    maxActiveLinks: number;
    analyticsAccess: string;
    supportPriority: string;
    customBranding: boolean;
    apiAccess: boolean;
  };
}

@Injectable()
export class TierManagementService {
  private readonly logger = new Logger(TierManagementService.name);
  
  private readonly tierConfigs: TierConfig[] = [
    {
      tier: InfluencerTier.BRONZE,
      minStaked: 0n,
      benefits: {
        revenueShareMax: 20,
        linkLimit: 10,
        maxActiveLinks: 10,
        analyticsAccess: 'basic',
        supportPriority: 'standard',
        customBranding: false,
        apiAccess: false,
      },
    },
    {
      tier: InfluencerTier.SILVER,
      minStaked: 1_000_000_000_000n, // 1K TWIST
      benefits: {
        revenueShareMax: 30,
        linkLimit: 50,
        maxActiveLinks: 50,
        analyticsAccess: 'advanced',
        supportPriority: 'priority',
        customBranding: false,
        apiAccess: false,
      },
    },
    {
      tier: InfluencerTier.GOLD,
      minStaked: 10_000_000_000_000n, // 10K TWIST
      benefits: {
        revenueShareMax: 40,
        linkLimit: 200,
        maxActiveLinks: 200,
        analyticsAccess: 'premium',
        supportPriority: 'priority',
        customBranding: true,
        apiAccess: true,
      },
    },
    {
      tier: InfluencerTier.PLATINUM,
      minStaked: 50_000_000_000_000n, // 50K TWIST
      benefits: {
        revenueShareMax: 50,
        linkLimit: -1, // Unlimited
        maxActiveLinks: -1, // Unlimited
        analyticsAccess: 'enterprise',
        supportPriority: 'vip',
        customBranding: true,
        apiAccess: true,
      },
    },
  ];

  constructor(
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
    @InjectRepository(InfluencerStakingPool)
    private stakingPoolRepo: Repository<InfluencerStakingPool>,
    @InjectQueue('influencer') private influencerQueue: Queue,
  ) {}

  async calculateTier(totalStaked: bigint): Promise<InfluencerTier> {
    // Find the highest tier the influencer qualifies for
    for (let i = this.tierConfigs.length - 1; i >= 0; i--) {
      if (totalStaked >= this.tierConfigs[i].minStaked) {
        return this.tierConfigs[i].tier;
      }
    }
    return InfluencerTier.BRONZE;
  }

  async updateInfluencerTier(
    influencerId: string, 
    newTotalStaked: bigint
  ): Promise<{ oldTier: InfluencerTier; newTier: InfluencerTier; upgraded: boolean }> {
    const influencer = await this.influencerRepo.findOne({
      where: { id: influencerId },
    });

    if (!influencer) {
      throw new Error('Influencer not found');
    }

    const oldTier = influencer.tier;
    const newTier = await this.calculateTier(newTotalStaked);

    if (oldTier !== newTier) {
      influencer.tier = newTier;
      await this.influencerRepo.save(influencer);

      // Emit tier change event
      await this.emitTierChangeEvent(influencer, oldTier, newTier);

      // Send notification
      await this.influencerQueue.add('tier-change-notification', {
        influencerId,
        oldTier,
        newTier,
        benefits: this.getTierBenefits(newTier),
      });

      this.logger.log(
        `Influencer ${influencer.username} tier changed from ${oldTier} to ${newTier}`
      );

      return { oldTier, newTier, upgraded: true };
    }

    return { oldTier, newTier, upgraded: false };
  }

  getTierBenefits(tier: InfluencerTier) {
    const config = this.tierConfigs.find(c => c.tier === tier);
    return config?.benefits || this.tierConfigs[0].benefits;
  }

  async checkTierRequirements(influencerId: string): Promise<{
    currentTier: InfluencerTier;
    nextTier: InfluencerTier | null;
    currentStaked: string;
    requiredForNext: string;
    progress: number;
  }> {
    const influencer = await this.influencerRepo.findOne({
      where: { id: influencerId },
      relations: ['stakingPool'],
    });

    if (!influencer || !influencer.stakingPool) {
      throw new Error('Influencer or staking pool not found');
    }

    const currentTier = influencer.tier;
    const currentStaked = BigInt(influencer.stakingPool.totalStaked);
    
    // Find next tier
    const currentTierIndex = this.tierConfigs.findIndex(c => c.tier === currentTier);
    const nextTierConfig = this.tierConfigs[currentTierIndex + 1];

    if (!nextTierConfig) {
      return {
        currentTier,
        nextTier: null,
        currentStaked: currentStaked.toString(),
        requiredForNext: '0',
        progress: 100,
      };
    }

    const progress = Number(
      (currentStaked * 100n) / nextTierConfig.minStaked
    );

    return {
      currentTier,
      nextTier: nextTierConfig.tier,
      currentStaked: currentStaked.toString(),
      requiredForNext: nextTierConfig.minStaked.toString(),
      progress: Math.min(progress, 100),
    };
  }

  async getInfluencersByTier(tier: InfluencerTier, limit = 50): Promise<Influencer[]> {
    return this.influencerRepo.find({
      where: { tier },
      relations: ['profile', 'stakingPool'],
      order: { totalEarned: 'DESC' },
      take: limit,
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncTiersWithStakingPools() {
    this.logger.log('Starting tier synchronization');

    const pools = await this.stakingPoolRepo.find({
      where: { isActive: true },
      relations: ['influencer'],
    });

    let updated = 0;

    for (const pool of pools) {
      try {
        const result = await this.updateInfluencerTier(
          pool.influencer.id,
          BigInt(pool.totalStaked)
        );

        if (result.upgraded) {
          updated++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to update tier for influencer ${pool.influencer.id}`,
          error
        );
      }
    }

    this.logger.log(`Tier synchronization completed. Updated: ${updated}`);
  }

  async validateRevenueShare(
    influencerId: string, 
    requestedShareBps: number
  ): Promise<boolean> {
    const influencer = await this.influencerRepo.findOne({
      where: { id: influencerId },
    });

    if (!influencer) {
      return false;
    }

    const benefits = this.getTierBenefits(influencer.tier);
    const maxSharePercent = benefits.revenueShareMax;
    const maxShareBps = maxSharePercent * 100;

    return requestedShareBps <= maxShareBps;
  }

  async validateLinkCreation(influencerId: string): Promise<{
    allowed: boolean;
    currentCount: number;
    limit: number;
  }> {
    const influencer = await this.influencerRepo.findOne({
      where: { id: influencerId },
      relations: ['links'],
    });

    if (!influencer) {
      return { allowed: false, currentCount: 0, limit: 0 };
    }

    const benefits = this.getTierBenefits(influencer.tier);
    const linkLimit = benefits.linkLimit;
    const currentCount = influencer.links?.filter(link => link.isActive).length || 0;

    // -1 means unlimited
    const allowed = linkLimit === -1 || currentCount < linkLimit;

    return {
      allowed,
      currentCount,
      limit: linkLimit,
    };
  }

  private async emitTierChangeEvent(
    influencer: Influencer,
    oldTier: InfluencerTier,
    newTier: InfluencerTier
  ) {
    const message = MessageFactory.createMessage(
      'influencer.tier.changed',
      'tier-management-service',
      {
        influencerId: influencer.id,
        username: influencer.username,
        oldTier,
        newTier,
        timestamp: new Date(),
      }
    );

    await this.influencerQueue.add('publish-event', message);
  }

  async getTierDistribution(): Promise<Record<InfluencerTier, number>> {
    const result = await this.influencerRepo
      .createQueryBuilder('influencer')
      .select('influencer.tier', 'tier')
      .addSelect('COUNT(*)', 'count')
      .groupBy('influencer.tier')
      .getRawMany();

    const distribution: Record<InfluencerTier, number> = {
      [InfluencerTier.BRONZE]: 0,
      [InfluencerTier.SILVER]: 0,
      [InfluencerTier.GOLD]: 0,
      [InfluencerTier.PLATINUM]: 0,
    };

    result.forEach(row => {
      distribution[row.tier as InfluencerTier] = parseInt(row.count);
    });

    return distribution;
  }

  async getTierConfig(tier: InfluencerTier): Promise<TierConfig> {
    const config = this.tierConfigs.find(c => c.tier === tier);
    if (!config) {
      throw new NotFoundException(`Tier configuration not found for ${tier}`);
    }
    return config;
  }
}