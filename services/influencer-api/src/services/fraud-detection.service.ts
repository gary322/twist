import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  UserStake,
  StakingHistory,
  StakingAction,
  ClickEvent,
  Conversion,
  FraudAlert,
  FraudAlertType,
  FraudAlertSeverity,
  FraudAlertStatus,
  Influencer,
  InfluencerLink,
} from '../entities';
import { NotificationService } from './notification.service';
import { v4 as uuidv4 } from 'uuid';
import * as geoip from 'geoip-lite';

export interface FraudIndicator {
  type: 'stake_velocity' | 'click_pattern' | 'conversion_anomaly' | 
        'wallet_cycling' | 'geo_mismatch' | 'time_pattern' | 'amount_pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-100
  details: Record<string, any>;
}

export interface FraudAnalysis {
  userId?: string;
  influencerId?: string;
  riskScore: number; // 0-100
  indicators: FraudIndicator[];
  recommendation: 'allow' | 'review' | 'block';
  timestamp: Date;
}

@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);
  
  // Thresholds
  private readonly VELOCITY_THRESHOLD = 10; // Max stakes per hour
  private readonly CLICK_RATE_THRESHOLD = 100; // Max clicks per minute
  private readonly CONVERSION_RATE_THRESHOLD = 80; // Max conversion rate %
  private readonly WALLET_REUSE_THRESHOLD = 5; // Max wallets per IP
  private readonly RISK_SCORE_BLOCK_THRESHOLD = 80;
  private readonly RISK_SCORE_REVIEW_THRESHOLD = 50;

  constructor(
    @InjectRepository(UserStake)
    private stakeRepo: Repository<UserStake>,
    @InjectRepository(StakingHistory)
    private historyRepo: Repository<StakingHistory>,
    @InjectRepository(ClickEvent)
    private clickRepo: Repository<ClickEvent>,
    @InjectRepository(Conversion)
    private conversionRepo: Repository<Conversion>,
    @InjectRepository(FraudAlert)
    private alertRepo: Repository<FraudAlert>,
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
    @InjectRepository(InfluencerLink)
    private linkRepo: Repository<InfluencerLink>,
    @InjectRedis() private redis: Redis,
    @InjectQueue('fraud-detection') private fraudQueue: Queue,
    private notificationService: NotificationService,
  ) {
    this.setupRealtimeMonitoring();
  }

  private setupRealtimeMonitoring() {
    // Monitor Redis streams for suspicious patterns
    setInterval(() => {
      this.checkRealtimePatterns();
    }, 60000); // Every minute
  }

  async analyzeStakeTransaction(params: {
    userId: string;
    influencerId: string;
    amount: bigint;
    walletAddress: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<FraudAnalysis> {
    const indicators: FraudIndicator[] = [];
    
    // Check stake velocity
    const velocityIndicator = await this.checkStakeVelocity(params.userId);
    if (velocityIndicator) indicators.push(velocityIndicator);

    // Check wallet cycling
    const walletIndicator = await this.checkWalletCycling(
      params.userId,
      params.walletAddress,
      params.ipAddress
    );
    if (walletIndicator) indicators.push(walletIndicator);

    // Check amount patterns
    const amountIndicator = await this.checkAmountPatterns(
      params.userId,
      params.amount
    );
    if (amountIndicator) indicators.push(amountIndicator);

    // Check time patterns
    const timeIndicator = await this.checkTimePatterns(params.userId);
    if (timeIndicator) indicators.push(timeIndicator);

    // Check influencer-specific patterns
    const influencerIndicator = await this.checkInfluencerPatterns(
      params.influencerId,
      params.userId
    );
    if (influencerIndicator) indicators.push(influencerIndicator);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(indicators);

    // Determine recommendation
    let recommendation: FraudAnalysis['recommendation'] = 'allow';
    if (riskScore >= this.RISK_SCORE_BLOCK_THRESHOLD) {
      recommendation = 'block';
    } else if (riskScore >= this.RISK_SCORE_REVIEW_THRESHOLD) {
      recommendation = 'review';
    }

    const analysis: FraudAnalysis = {
      userId: params.userId,
      influencerId: params.influencerId,
      riskScore,
      indicators,
      recommendation,
      timestamp: new Date(),
    };

    // Store analysis
    await this.storeAnalysis(analysis);

    // Take action based on recommendation
    if (recommendation !== 'allow') {
      await this.handleSuspiciousActivity(analysis, params);
    }

    return analysis;
  }

  async analyzeClickPattern(params: {
    linkCode: string;
    userId: string;
    ipAddress: string;
    userAgent: string;
    referrer?: string;
  }): Promise<FraudAnalysis> {
    const indicators: FraudIndicator[] = [];

    // Check click rate
    const clickRateIndicator = await this.checkClickRate(
      params.linkCode,
      params.ipAddress
    );
    if (clickRateIndicator) indicators.push(clickRateIndicator);

    // Check geo patterns
    const geoIndicator = await this.checkGeoPatterns(
      params.linkCode,
      params.ipAddress
    );
    if (geoIndicator) indicators.push(geoIndicator);

    // Check user agent patterns
    const uaIndicator = await this.checkUserAgentPatterns(
      params.linkCode,
      params.userAgent
    );
    if (uaIndicator) indicators.push(uaIndicator);

    // Check referrer patterns
    if (params.referrer) {
      const referrerIndicator = await this.checkReferrerPatterns(
        params.linkCode,
        params.referrer
      );
      if (referrerIndicator) indicators.push(referrerIndicator);
    }

    const riskScore = this.calculateRiskScore(indicators);
    const recommendation = riskScore >= 50 ? 'block' : 'allow';

    const analysis: FraudAnalysis = {
      userId: params.userId,
      riskScore,
      indicators,
      recommendation,
      timestamp: new Date(),
    };

    if (recommendation === 'block') {
      // Block the click
      await this.blockClick(params.linkCode, params.ipAddress);
    }

    return analysis;
  }

  private async checkStakeVelocity(userId: string): Promise<FraudIndicator | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentStakes = await this.historyRepo.count({
      where: {
        userId,
        action: StakingAction.STAKE,
        createdAt: MoreThan(oneHourAgo),
      },
    });

    if (recentStakes > this.VELOCITY_THRESHOLD) {
      return {
        type: 'stake_velocity',
        severity: 'high',
        confidence: 90,
        details: {
          recentStakes,
          threshold: this.VELOCITY_THRESHOLD,
          timeWindow: '1 hour',
        },
      };
    }

    return null;
  }

  private async checkWalletCycling(
    userId: string,
    walletAddress: string,
    ipAddress?: string
  ): Promise<FraudIndicator | null> {
    if (!ipAddress) return null;

    // Check how many different wallets have been used from this IP
    const ipWalletKey = `fraud:ip:${ipAddress}:wallets`;
    await this.redis.sadd(ipWalletKey, walletAddress);
    await this.redis.expire(ipWalletKey, 86400); // 24 hours

    const walletCount = await this.redis.scard(ipWalletKey);

    if (walletCount > this.WALLET_REUSE_THRESHOLD) {
      return {
        type: 'wallet_cycling',
        severity: 'high',
        confidence: 85,
        details: {
          walletCount,
          threshold: this.WALLET_REUSE_THRESHOLD,
          ipAddress,
        },
      };
    }

    // Check if wallet has been used by multiple users
    const walletUserKey = `fraud:wallet:${walletAddress}:users`;
    await this.redis.sadd(walletUserKey, userId);
    await this.redis.expire(walletUserKey, 86400 * 7); // 7 days

    const userCount = await this.redis.scard(walletUserKey);

    if (userCount > 1) {
      return {
        type: 'wallet_cycling',
        severity: 'critical',
        confidence: 95,
        details: {
          userCount,
          walletAddress,
          message: 'Wallet used by multiple users',
        },
      };
    }

    return null;
  }

  private async checkAmountPatterns(
    userId: string,
    amount: bigint
  ): Promise<FraudIndicator | null> {
    // Get user's stake history
    const stakes = await this.stakeRepo.find({
      where: { userId },
      order: { stakedAt: 'DESC' },
      take: 10,
    });

    if (stakes.length < 3) return null;

    // Check for suspicious patterns
    const amounts = stakes.map(s => Number(s.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const currentAmount = Number(amount);

    // Sudden large increase
    if (currentAmount > avgAmount * 10) {
      return {
        type: 'amount_pattern',
        severity: 'medium',
        confidence: 70,
        details: {
          currentAmount,
          averageAmount: avgAmount,
          multiplier: currentAmount / avgAmount,
          pattern: 'sudden_increase',
        },
      };
    }

    // Repeating exact amounts
    const exactMatches = amounts.filter(a => a === currentAmount).length;
    if (exactMatches > 5) {
      return {
        type: 'amount_pattern',
        severity: 'medium',
        confidence: 75,
        details: {
          repeatedAmount: currentAmount,
          occurrences: exactMatches,
          pattern: 'repeated_exact',
        },
      };
    }

    return null;
  }

  private async checkTimePatterns(userId: string): Promise<FraudIndicator | null> {
    const stakes = await this.historyRepo.find({
      where: {
        userId,
        action: StakingAction.STAKE,
      },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    if (stakes.length < 5) return null;

    // Check for automated patterns (regular intervals)
    const intervals: number[] = [];
    for (let i = 1; i < stakes.length; i++) {
      const interval = stakes[i-1].createdAt.getTime() - stakes[i].createdAt.getTime();
      intervals.push(interval);
    }

    // Calculate standard deviation
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => {
      return sum + Math.pow(interval - avgInterval, 2);
    }, 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Low standard deviation indicates automated behavior
    if (stdDev < 5000 && avgInterval < 300000) { // Less than 5 seconds variance and avg < 5 minutes
      return {
        type: 'time_pattern',
        severity: 'high',
        confidence: 80,
        details: {
          averageInterval: avgInterval,
          standardDeviation: stdDev,
          pattern: 'automated_intervals',
        },
      };
    }

    return null;
  }

  private async checkInfluencerPatterns(
    influencerId: string,
    userId: string
  ): Promise<FraudIndicator | null> {
    // Check if there's a sudden spike in stakes for this influencer
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentStakes = await this.historyRepo.count({
      where: {
        poolId: influencerId,
        action: StakingAction.STAKE,
        createdAt: MoreThan(oneDayAgo),
      },
    });

    // Get historical average
    const historicalAvgKey = `fraud:influencer:${influencerId}:daily_avg`;
    const historicalAvg = await this.redis.get(historicalAvgKey);
    
    if (historicalAvg && recentStakes > parseInt(historicalAvg) * 5) {
      return {
        type: 'stake_velocity',
        severity: 'medium',
        confidence: 65,
        details: {
          recentStakes,
          historicalAverage: parseInt(historicalAvg),
          multiplier: recentStakes / parseInt(historicalAvg),
          pattern: 'influencer_spike',
        },
      };
    }

    return null;
  }

  private async checkClickRate(
    linkCode: string,
    ipAddress: string
  ): Promise<FraudIndicator | null> {
    const key = `fraud:clicks:${linkCode}:${ipAddress}`;
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      await this.redis.expire(key, 60); // 1 minute window
    }

    if (count > this.CLICK_RATE_THRESHOLD) {
      return {
        type: 'click_pattern',
        severity: 'critical',
        confidence: 95,
        details: {
          clicksPerMinute: count,
          threshold: this.CLICK_RATE_THRESHOLD,
          ipAddress,
          linkCode,
        },
      };
    }

    return null;
  }

  private async checkGeoPatterns(
    linkCode: string,
    ipAddress: string
  ): Promise<FraudIndicator | null> {
    const geo = geoip.lookup(ipAddress);
    if (!geo) return null;

    // Store geo data for pattern analysis
    const geoKey = `fraud:link:${linkCode}:geos`;
    await this.redis.sadd(geoKey, geo.country);
    await this.redis.expire(geoKey, 86400);

    // Check if clicks are coming from unusual locations
    const geoCount = await this.redis.scard(geoKey);
    
    if (geoCount > 20) { // Clicks from more than 20 countries
      const link = await this.linkRepo.findOne({ where: { linkCode } });
      const clickCount = link ? await this.clickRepo.count({
        where: { linkId: link.id },
      }) : 0;

      if (clickCount < 1000) { // Small campaign with global reach is suspicious
        return {
          type: 'geo_mismatch',
          severity: 'medium',
          confidence: 60,
          details: {
            uniqueCountries: geoCount,
            totalClicks: clickCount,
            pattern: 'unusual_geographic_distribution',
          },
        };
      }
    }

    return null;
  }

  private async checkUserAgentPatterns(
    linkCode: string,
    userAgent: string
  ): Promise<FraudIndicator | null> {
    // Check for bot user agents
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
    ];

    for (const pattern of botPatterns) {
      if (pattern.test(userAgent)) {
        return {
          type: 'click_pattern',
          severity: 'high',
          confidence: 90,
          details: {
            userAgent,
            pattern: 'bot_detected',
          },
        };
      }
    }

    // Check for missing or suspicious user agents
    if (!userAgent || userAgent.length < 10) {
      return {
        type: 'click_pattern',
        severity: 'medium',
        confidence: 70,
        details: {
          userAgent: userAgent || 'missing',
          pattern: 'suspicious_user_agent',
        },
      };
    }

    return null;
  }

  private async checkReferrerPatterns(
    linkCode: string,
    referrer: string
  ): Promise<FraudIndicator | null> {
    // Check for direct traffic on campaigns that should have referrers
    const link = await this.redis.get(`link:${linkCode}:source`);
    
    if (link === 'social' && !referrer) {
      return {
        type: 'click_pattern',
        severity: 'low',
        confidence: 50,
        details: {
          expectedSource: 'social',
          actualReferrer: 'direct',
          pattern: 'missing_expected_referrer',
        },
      };
    }

    // Check for suspicious referrers
    const suspiciousReferrers = [
      /proxy/i,
      /vpn/i,
      /anonymous/i,
    ];

    for (const pattern of suspiciousReferrers) {
      if (pattern.test(referrer)) {
        return {
          type: 'click_pattern',
          severity: 'medium',
          confidence: 65,
          details: {
            referrer,
            pattern: 'suspicious_referrer',
          },
        };
      }
    }

    return null;
  }

  private calculateRiskScore(indicators: FraudIndicator[]): number {
    if (indicators.length === 0) return 0;

    const weights = {
      low: 10,
      medium: 25,
      high: 50,
      critical: 100,
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const indicator of indicators) {
      const weight = weights[indicator.severity];
      const score = (weight * indicator.confidence) / 100;
      totalScore += score;
      totalWeight += weight;
    }

    // Normalize to 0-100
    return Math.min(100, (totalScore / totalWeight) * 100);
  }

  private async storeAnalysis(analysis: FraudAnalysis) {
    const key = `fraud:analysis:${analysis.userId || 'anonymous'}:${Date.now()}`;
    await this.redis.setex(key, 86400 * 7, JSON.stringify(analysis)); // 7 days

    // Update user risk score
    if (analysis.userId) {
      await this.redis.set(
        `fraud:risk:${analysis.userId}`,
        analysis.riskScore.toString(),
        'EX',
        86400
      );
    }
  }

  private async handleSuspiciousActivity(
    analysis: FraudAnalysis,
    params: any
  ) {
    // Create fraud alert
    const alert = this.alertRepo.create({
      id: uuidv4(),
      type: FraudAlertType.STAKE_FRAUD,
      severity: analysis.riskScore >= 80 ? FraudAlertSeverity.CRITICAL : FraudAlertSeverity.HIGH,
      userId: analysis.userId,
      influencerId: analysis.influencerId,
      indicators: analysis.indicators,
      riskScore: analysis.riskScore,
      status: FraudAlertStatus.OPEN,
      createdAt: new Date(),
    });

    await this.alertRepo.save(alert);

    // Queue for manual review
    if (analysis.recommendation === 'review') {
      await this.fraudQueue.add('manual-review', {
        alertId: alert.id,
        analysis,
        params,
      });
    }

    // Block transaction if needed
    if (analysis.recommendation === 'block') {
      await this.blockTransaction(params);
    }

    // Notify administrators
    await this.notifyAdministrators(alert, analysis);
  }

  private async blockTransaction(params: any) {
    // Add to blocklist
    await this.redis.setex(
      `fraud:blocked:${params.userId}`,
      86400,
      JSON.stringify({
        reason: 'fraud_detection',
        timestamp: new Date(),
        params,
      })
    );

    this.logger.warn(`Blocked transaction for user ${params.userId} due to fraud detection`);
  }

  private async blockClick(linkCode: string, ipAddress: string) {
    await this.redis.setex(
      `fraud:blocked:ip:${ipAddress}`,
      3600,
      'blocked'
    );

    this.logger.warn(`Blocked clicks from IP ${ipAddress} on link ${linkCode}`);
  }

  private async notifyAdministrators(alert: FraudAlert, analysis: FraudAnalysis) {
    // Send notification to admin dashboard
    await this.notificationService.sendAdminNotification({
      type: 'fraud_alert',
      priority: alert.severity,
      data: {
        alertId: alert.id,
        userId: alert.userId,
        influencerId: alert.influencerId,
        riskScore: analysis.riskScore,
        recommendation: analysis.recommendation,
        indicators: analysis.indicators.map(i => ({
          type: i.type,
          severity: i.severity,
          confidence: i.confidence,
        })),
      },
    });
  }

  private async checkRealtimePatterns() {
    // This runs periodically to check for broader patterns
    try {
      // Check for coordinated attacks
      await this.checkCoordinatedActivity();

      // Update historical averages
      await this.updateHistoricalAverages();

      // Check for anomalous conversion rates
      await this.checkConversionAnomalies();
    } catch (error) {
      this.logger.error('Error in real-time pattern checking', error);
    }
  }

  private async checkCoordinatedActivity() {
    // Look for multiple users staking on the same influencer at the same time
    const recentStakes = await this.historyRepo
      .createQueryBuilder('history')
      .where('history.action = :action', { action: 'stake' })
      .andWhere('history.createdAt > :time', {
        time: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
      })
      .groupBy('history.pool_id')
      .having('COUNT(DISTINCT history.user_id) > :count', { count: 10 })
      .getRawMany();

    for (const stake of recentStakes) {
      await this.fraudQueue.add('investigate-coordinated', {
        poolId: stake.pool_id,
        userCount: stake.count,
        timeWindow: '5 minutes',
      });
    }
  }

  private async updateHistoricalAverages() {
    // Update daily averages for each influencer
    const influencers = await this.influencerRepo.find();
    
    for (const influencer of influencers) {
      const dailyStakes = await this.historyRepo
        .createQueryBuilder('history')
        .where('history.pool_id = :poolId', { poolId: influencer.id })
        .andWhere('history.action = :action', { action: 'stake' })
        .andWhere('history.createdAt > :date', {
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        })
        .getCount();

      const dailyAvg = dailyStakes / 30;
      
      await this.redis.set(
        `fraud:influencer:${influencer.id}:daily_avg`,
        dailyAvg.toString(),
        'EX',
        86400
      );
    }
  }

  private async checkConversionAnomalies() {
    // Check for unusually high conversion rates
    const links = await this.redis.keys('link:*:metrics');
    
    for (const linkKey of links) {
      const metrics = await this.redis.hgetall(linkKey);
      const clicks = parseInt(metrics.clicks || '0');
      const conversions = parseInt(metrics.conversions || '0');
      
      if (clicks > 10 && conversions > 0) {
        const conversionRate = (conversions / clicks) * 100;
        
        if (conversionRate > this.CONVERSION_RATE_THRESHOLD) {
          const linkCode = linkKey.split(':')[1];
          
          await this.fraudQueue.add('investigate-conversion', {
            linkCode,
            clicks,
            conversions,
            conversionRate,
            threshold: this.CONVERSION_RATE_THRESHOLD,
          });
        }
      }
    }
  }

  // Public API for checking user risk
  async getUserRiskScore(userId: string): Promise<number> {
    const score = await this.redis.get(`fraud:risk:${userId}`);
    return score ? parseInt(score) : 0;
  }

  async isUserBlocked(userId: string): Promise<boolean> {
    const blocked = await this.redis.exists(`fraud:blocked:${userId}`);
    return blocked === 1;
  }

  async isIPBlocked(ipAddress: string): Promise<boolean> {
    const blocked = await this.redis.exists(`fraud:blocked:ip:${ipAddress}`);
    return blocked === 1;
  }
}