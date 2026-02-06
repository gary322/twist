import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan, LessThan } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  InfluencerPayout,
  InfluencerPayoutStatus,
  PayoutMethod,
  InfluencerPayoutItem,
  InfluencerPayoutItemType,
  InfluencerStakingPool,
  UserStake,
  StakingReward,
  Conversion,
  AttributionModel,
  Influencer,
} from '../entities';
import { TwistTokenClient } from '@twist/blockchain-sdk';
import { PublicKey } from '@solana/web3.js';
import { nanoid } from 'nanoid';

export interface PayoutCalculation {
  influencerId: string;
  period: {
    start: Date;
    end: Date;
  };
  earnings: {
    conversions: bigint;
    stakingRewards: bigint;
    bonuses: bigint;
    total: bigint;
  };
  deductions: {
    platformFee: bigint;
    processingFee: bigint;
    total: bigint;
  };
  netAmount: bigint;
  items: InfluencerPayoutItem[];
}

export interface PayoutProcessingResult {
  payoutId: string;
  status: InfluencerPayoutStatus;
  transactionId?: string;
  error?: string;
  processedAt: Date;
}

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);
  private readonly PLATFORM_FEE_PERCENT = 10; // 10% platform fee
  private readonly MIN_PAYOUT_AMOUNT = 10_000_000_000n; // 10 TWIST minimum
  private readonly PROCESSING_FEE = 100_000_000n; // 0.1 TWIST processing fee
  private tokenClient: TwistTokenClient;

  constructor(
    @InjectRepository(InfluencerPayout)
    private payoutRepo: Repository<InfluencerPayout>,
    @InjectRepository(InfluencerPayoutItem)
    private payoutItemRepo: Repository<InfluencerPayoutItem>,
    @InjectRepository(InfluencerStakingPool)
    private poolRepo: Repository<InfluencerStakingPool>,
    @InjectRepository(UserStake)
    private stakeRepo: Repository<UserStake>,
    @InjectRepository(StakingReward)
    private rewardRepo: Repository<StakingReward>,
    @InjectRepository(Conversion)
    private conversionRepo: Repository<Conversion>,
    @InjectRepository(AttributionModel)
    private attributionRepo: Repository<AttributionModel>,
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
    @InjectRedis() private redis: Redis,
    @InjectQueue('payout') private payoutQueue: Queue,
  ) {
    this.tokenClient = new TwistTokenClient();
  }

  /**
   * Calculate payout for an influencer for a given period
   */
  async calculatePayout(params: {
    influencerId: string;
    startDate: Date;
    endDate: Date;
    includeBonus?: boolean;
  }): Promise<PayoutCalculation> {
    const influencer = await this.influencerRepo.findOne({
      where: { id: params.influencerId },
      relations: ['stakingPool'],
    });

    if (!influencer) {
      throw new BadRequestException('Influencer not found');
    }

    // Get conversion earnings
    const conversionEarnings = await this.calculateConversionEarnings(
      params.influencerId,
      params.startDate,
      params.endDate,
    );

    // Get staking reward distributions
    const stakingRewards = await this.calculateStakingRewards(
      influencer.stakingPool?.id,
      params.startDate,
      params.endDate,
    );

    // Calculate bonuses
    const bonuses = params.includeBonus
      ? await this.calculateBonuses(params.influencerId, params.startDate, params.endDate)
      : 0n;

    // Calculate total earnings
    const totalEarnings = conversionEarnings + stakingRewards + bonuses;

    // Calculate deductions
    const platformFee = (totalEarnings * BigInt(this.PLATFORM_FEE_PERCENT)) / 100n;
    const processingFee = totalEarnings > 0n ? this.PROCESSING_FEE : 0n;
    const totalDeductions = platformFee + processingFee;

    // Calculate net amount
    const netAmount = totalEarnings - totalDeductions;

    // Get detailed payout items
    const items = await this.getPayoutItems(
      params.influencerId,
      params.startDate,
      params.endDate,
    );

    return {
      influencerId: params.influencerId,
      period: {
        start: params.startDate,
        end: params.endDate,
      },
      earnings: {
        conversions: conversionEarnings,
        stakingRewards,
        bonuses,
        total: totalEarnings,
      },
      deductions: {
        platformFee,
        processingFee,
        total: totalDeductions,
      },
      netAmount,
      items,
    };
  }

  /**
   * Create a payout request
   */
  async createPayout(params: {
    influencerId: string;
    amount: bigint;
    method: PayoutMethod;
    walletAddress?: string;
    bankDetails?: Record<string, string>;
  }): Promise<InfluencerPayout> {
    // Validate minimum amount
    if (params.amount < this.MIN_PAYOUT_AMOUNT) {
      throw new BadRequestException(
        `Minimum payout amount is ${this.MIN_PAYOUT_AMOUNT / 10n ** 9n} TWIST`
      );
    }

    // Check if influencer has pending payouts
    const pendingPayout = await this.payoutRepo.findOne({
      where: {
        influencerId: params.influencerId,
        status: InfluencerPayoutStatus.PENDING,
      },
    });

    if (pendingPayout) {
      throw new BadRequestException('You have a pending payout request');
    }

    // Calculate available balance
    const balance = await this.getAvailableBalance(params.influencerId);
    if (balance < params.amount) {
      throw new BadRequestException('Insufficient balance for payout');
    }

    // Create payout
    const payout = this.payoutRepo.create({
      id: nanoid(),
      influencerId: params.influencerId,
      amount: params.amount,
      currency: 'TWIST',
      method: params.method,
      status: InfluencerPayoutStatus.PENDING,
      walletAddress: params.walletAddress,
      bankDetails: params.bankDetails,
      requestedAt: new Date(),
    });

    const savedPayout = await this.payoutRepo.save(payout);

    // Queue for processing
    await this.payoutQueue.add('process-payout', {
      payoutId: savedPayout.id,
    });

    return savedPayout;
  }

  /**
   * Process a payout
   */
  async processPayout(payoutId: string): Promise<PayoutProcessingResult> {
    const payout = await this.payoutRepo.findOne({
      where: { id: payoutId },
      relations: ['influencer'],
    });

    if (!payout) {
      throw new Error('Payout not found');
    }

    if (payout.status !== InfluencerPayoutStatus.PENDING) {
      throw new Error('Payout is not in pending status');
    }

    try {
      // Update status to processing
      payout.status = InfluencerPayoutStatus.PROCESSING;
      await this.payoutRepo.save(payout);

      let transactionId: string;

      switch (payout.method) {
        case PayoutMethod.CRYPTO:
          transactionId = await this.processCryptoPayout(payout);
          break;
        case PayoutMethod.BANK:
          transactionId = await this.processBankPayout(payout);
          break;
        case PayoutMethod.PAYPAL:
          transactionId = await this.processPayPalPayout(payout);
          break;
        default:
          throw new Error(`Unsupported payout method: ${payout.method}`);
      }

      // Update payout status
      payout.status = InfluencerPayoutStatus.COMPLETED;
      payout.transactionId = transactionId;
      payout.processedAt = new Date();
      await this.payoutRepo.save(payout);

      // Create payout items for tracking
      await this.createPayoutItems(payout);

      // Update influencer balance
      await this.updateInfluencerBalance(payout.influencerId, -payout.amount);

      return {
        payoutId: payout.id,
        status: InfluencerPayoutStatus.COMPLETED,
        transactionId,
        processedAt: new Date(),
      };
    } catch (error: any) {
      // Update payout status to failed
      payout.status = InfluencerPayoutStatus.FAILED;
      payout.failureReason = error.message;
      await this.payoutRepo.save(payout);

      this.logger.error(`Payout processing failed for ${payoutId}`, error);

      return {
        payoutId: payout.id,
        status: InfluencerPayoutStatus.FAILED,
        error: error.message,
        processedAt: new Date(),
      };
    }
  }

  /**
   * Process crypto payout
   */
  private async processCryptoPayout(payout: InfluencerPayout): Promise<string> {
    if (!payout.walletAddress) {
      throw new Error('Wallet address is required for crypto payout');
    }

    // Transfer TWIST tokens
    const tx = await this.tokenClient.transfer({
      recipient: new PublicKey(payout.walletAddress),
      amount: payout.amount,
      memo: `Payout ${payout.id}`,
    });

    return tx;
  }

  /**
   * Process bank payout (mock)
   */
  private async processBankPayout(payout: InfluencerPayout): Promise<string> {
    // In production, integrate with banking API
    // For now, simulate processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return `BANK_TX_${nanoid()}`;
  }

  /**
   * Process PayPal payout (mock)
   */
  private async processPayPalPayout(payout: InfluencerPayout): Promise<string> {
    // In production, integrate with PayPal API
    // For now, simulate processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return `PAYPAL_TX_${nanoid()}`;
  }

  /**
   * Calculate conversion earnings
   */
  private async calculateConversionEarnings(
    influencerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<bigint> {
    const attributions = await this.attributionRepo.find({
      where: {
        influencerId,
        createdAt: Between(startDate, endDate),
      },
    });

    return attributions.reduce(
      (total, attr) => total + BigInt(attr.earnedAmount * 10 ** 9), // Convert to smallest unit
      0n
    );
  }

  /**
   * Calculate staking rewards
   */
  private async calculateStakingRewards(
    poolId: string | undefined,
    startDate: Date,
    endDate: Date,
  ): Promise<bigint> {
    if (!poolId) return 0n;

    const rewards = await this.rewardRepo.find({
      where: {
        poolId,
        distributedAt: Between(startDate, endDate),
      },
    });

    return rewards.reduce(
      (total, reward) => total + BigInt(reward.influencerShare),
      0n
    );
  }

  /**
   * Calculate bonuses based on performance
   */
  private async calculateBonuses(
    influencerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<bigint> {
    // Performance-based bonuses
    const conversions = await this.conversionRepo.count({
      where: {
        convertedAt: Between(startDate, endDate),
      },
    });

    let bonus = 0n;

    // Conversion milestones
    if (conversions >= 1000) {
      bonus += 1000_000_000_000n; // 1000 TWIST bonus
    } else if (conversions >= 500) {
      bonus += 500_000_000_000n; // 500 TWIST bonus
    } else if (conversions >= 100) {
      bonus += 100_000_000_000n; // 100 TWIST bonus
    }

    // Check for tier upgrade bonus
    const tierUpgrade = await this.checkTierUpgrade(influencerId, startDate, endDate);
    if (tierUpgrade) {
      bonus += 500_000_000_000n; // 500 TWIST tier upgrade bonus
    }

    return bonus;
  }

  /**
   * Check if influencer upgraded tier in period
   */
  private async checkTierUpgrade(
    influencerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<boolean> {
    // Check Redis for tier change events
    const tierChangeKey = `influencer:${influencerId}:tier_change`;
    const tierChanges = await this.redis.lrange(tierChangeKey, 0, -1);

    return tierChanges.some(change => {
      const changeData = JSON.parse(change);
      const changeDate = new Date(changeData.timestamp);
      return changeDate >= startDate && changeDate <= endDate;
    });
  }

  /**
   * Get detailed payout items
   */
  private async getPayoutItems(
    influencerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<InfluencerPayoutItem[]> {
    const items: InfluencerPayoutItem[] = [];

    // Conversion items
    const attributions = await this.attributionRepo.find({
      where: {
        influencerId,
        createdAt: Between(startDate, endDate),
      },
      relations: ['conversion'],
    });

    for (const attr of attributions) {
      items.push({
        type: InfluencerPayoutItemType.CONVERSION,
        amount: BigInt(attr.earnedAmount * 10 ** 9),
        description: `Conversion ${attr.conversion.orderId}`,
        referenceId: attr.conversion.id,
        createdAt: attr.createdAt,
      } as InfluencerPayoutItem);
    }

    // Staking reward items
    const pool = await this.poolRepo.findOne({
      where: { influencerId },
    });

    if (pool) {
      const rewards = await this.rewardRepo.find({
        where: {
          poolId: pool.id,
          distributedAt: Between(startDate, endDate),
        },
      });

      for (const reward of rewards) {
        items.push({
          type: InfluencerPayoutItemType.STAKING_REWARD,
          amount: BigInt(reward.influencerShare),
          description: 'Staking reward distribution',
          referenceId: reward.id,
          createdAt: reward.distributedAt,
        } as InfluencerPayoutItem);
      }
    }

    return items;
  }

  /**
   * Create payout items for tracking
   */
  private async createPayoutItems(payout: InfluencerPayout): Promise<void> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Last 30 days

    const items = await this.getPayoutItems(
      payout.influencerId,
      startDate,
      endDate,
    );

    for (const item of items) {
      const payoutItem = this.payoutItemRepo.create({
        ...item,
        payoutId: payout.id,
      });
      await this.payoutItemRepo.save(payoutItem);
    }
  }

  /**
   * Get available balance for influencer
   */
  async getAvailableBalance(influencerId: string): Promise<bigint> {
    const cacheKey = `balance:${influencerId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return BigInt(cached);
    }

    // Calculate total earnings
    const totalEarnings = await this.getTotalEarnings(influencerId);

    // Subtract completed payouts
    const completedPayouts = await this.payoutRepo.find({
      where: {
        influencerId,
        status: InfluencerPayoutStatus.COMPLETED,
      },
    });

    const totalPaidOut = completedPayouts.reduce(
      (total, payout) => total + BigInt(payout.amount),
      0n
    );

    const balance = totalEarnings - totalPaidOut;

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, balance.toString());

    return balance;
  }

  /**
   * Get total earnings for influencer
   */
  private async getTotalEarnings(influencerId: string): Promise<bigint> {
    // Conversion earnings
    const attributions = await this.attributionRepo.find({
      where: { influencerId },
    });

    const conversionEarnings = attributions.reduce(
      (total, attr) => total + BigInt(attr.earnedAmount * 10 ** 9),
      0n
    );

    // Staking rewards
    const pool = await this.poolRepo.findOne({
      where: { influencerId },
    });

    let stakingEarnings = 0n;
    if (pool) {
      const rewards = await this.rewardRepo.find({
        where: { poolId: pool.id },
      });

      stakingEarnings = rewards.reduce(
        (total, reward) => total + BigInt(reward.influencerShare),
        0n
      );
    }

    return conversionEarnings + stakingEarnings;
  }

  /**
   * Update influencer balance
   */
  private async updateInfluencerBalance(
    influencerId: string,
    amount: bigint,
  ): Promise<void> {
    // Clear cache
    await this.redis.del(`balance:${influencerId}`);

    // Update total earned if positive amount
    if (amount > 0n) {
      await this.influencerRepo.increment(
        { id: influencerId },
        'totalEarned',
        Number(amount / 10n ** 9n),
      );
    }
  }

  /**
   * Get payout history
   */
  async getPayoutHistory(params: {
    influencerId?: string;
    status?: InfluencerPayoutStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const query = this.payoutRepo.createQueryBuilder('payout');

    if (params.influencerId) {
      query.andWhere('payout.influencerId = :influencerId', {
        influencerId: params.influencerId,
      });
    }

    if (params.status) {
      query.andWhere('payout.status = :status', { status: params.status });
    }

    if (params.startDate) {
      query.andWhere('payout.requestedAt >= :startDate', {
        startDate: params.startDate,
      });
    }

    if (params.endDate) {
      query.andWhere('payout.requestedAt <= :endDate', {
        endDate: params.endDate,
      });
    }

    const [payouts, total] = await query
      .orderBy('payout.requestedAt', 'DESC')
      .limit(params.limit || 20)
      .offset(params.offset || 0)
      .getManyAndCount();

    return {
      payouts,
      total,
      limit: params.limit || 20,
      offset: params.offset || 0,
    };
  }

  /**
   * Schedule automatic payouts
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_NOON)
  async processAutomaticPayouts() {
    this.logger.log('Processing automatic payouts');

    // Get influencers with auto-payout enabled
    const influencers = await this.influencerRepo.find({
      where: { autoPayoutEnabled: true },
    });

    for (const influencer of influencers) {
      try {
        const balance = await this.getAvailableBalance(influencer.id);
        
        if (balance >= this.MIN_PAYOUT_AMOUNT) {
          await this.createPayout({
            influencerId: influencer.id,
            amount: balance,
            method: influencer.defaultPayoutMethod || PayoutMethod.CRYPTO,
            walletAddress: influencer.walletAddress,
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to create automatic payout for ${influencer.id}`,
          error
        );
      }
    }
  }

  /**
   * Get payout analytics
   */
  async getPayoutAnalytics(params: {
    startDate: Date;
    endDate: Date;
    groupBy: 'day' | 'week' | 'month';
  }) {
    const payouts = await this.payoutRepo.find({
      where: {
        processedAt: Between(params.startDate, params.endDate),
        status: InfluencerPayoutStatus.COMPLETED,
      },
    });

    // Group payouts by period
    const grouped = new Map<string, { count: number; amount: bigint }>();

    payouts.forEach(payout => {
      const key = this.getGroupKey(payout.processedAt!, params.groupBy);
      const current = grouped.get(key) || { count: 0, amount: 0n };
      
      grouped.set(key, {
        count: current.count + 1,
        amount: current.amount + BigInt(payout.amount),
      });
    });

    return {
      periods: Array.from(grouped.entries()).map(([period, data]) => ({
        period,
        count: data.count,
        amount: data.amount.toString(),
        average: (data.amount / BigInt(data.count)).toString(),
      })),
      summary: {
        totalPayouts: payouts.length,
        totalAmount: payouts.reduce(
          (sum, p) => sum + BigInt(p.amount),
          0n
        ).toString(),
        averageAmount: payouts.length > 0
          ? (
              payouts.reduce((sum, p) => sum + BigInt(p.amount), 0n) /
              BigInt(payouts.length)
            ).toString()
          : '0',
      },
    };
  }

  private getGroupKey(date: Date, groupBy: 'day' | 'week' | 'month'): string {
    switch (groupBy) {
      case 'day':
        return date.toISOString().split('T')[0];
      case 'week':
        const week = Math.floor(date.getDate() / 7);
        return `${date.getFullYear()}-W${week}`;
      case 'month':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
  }
}