import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InfluencerLink, InfluencerAnalyticsDaily, ClickEvent } from '../entities';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as geoip from 'geoip-lite';
import * as crypto from 'crypto';
import { UAParser } from 'ua-parser-js';
import { nanoid } from 'nanoid';

export interface ClickData {
  linkCode: string;
  ipAddress: string;
  userAgent: string;
  referrer?: string;
  country?: string;
  device?: string;
  timestamp: number;
  sessionId?: string;
  fingerprint?: string;
}

export interface ConversionData extends ClickData {
  orderId: string;
  amount: bigint;
  productId: string;
}

export interface ProcessedClickData extends ClickData {
  clickId: string;
  country?: string;
  region?: string;
  city?: string;
  device?: string;
  browser?: string;
  os?: string;
  isBot: boolean;
  isFraudulent: boolean;
}

@Injectable()
export class ClickTrackingService {
  private readonly logger = new Logger(ClickTrackingService.name);
  private readonly CLICK_PREFIX = 'click:';
  private readonly CONVERSION_PREFIX = 'conversion:';
  private readonly ANALYTICS_PREFIX = 'analytics:';
  private readonly TTL = 86400; // 24 hours
  private readonly CLICK_TTL = 30 * 24 * 60 * 60; // 30 days
  private readonly RATE_LIMIT_WINDOW = 60; // 1 minute
  private readonly RATE_LIMIT_MAX = 10; // max clicks per IP per minute

  constructor(
    @InjectRedis() private redis: Redis,
    @InjectRepository(InfluencerLink)
    private linkRepo: Repository<InfluencerLink>,
    @InjectRepository(ClickEvent)
    private clickRepo: Repository<ClickEvent>,
    @InjectRepository(InfluencerAnalyticsDaily)
    private analyticsRepo: Repository<InfluencerAnalyticsDaily>,
    @InjectQueue('analytics') private analyticsQueue: Queue,
  ) {}

  /**
   * Track link click with fraud detection and rate limiting
   */
  async trackClick(data: ClickData): Promise<ProcessedClickData> {
    // Rate limiting check
    const isRateLimited = await this.checkRateLimit(data.ipAddress);
    if (isRateLimited) {
      throw new Error('Rate limit exceeded');
    }

    // Process click data
    const processedData = await this.processClickData(data);

    // Fraud detection
    if (processedData.isFraudulent) {
      this.logger.warn(`Fraudulent click detected: ${processedData.clickId}`);
      // Store fraud data for analysis but don't count it
      await this.storeFraudulentClick(processedData);
      return processedData;
    }

    // Store click event in database
    const clickEvent = this.clickRepo.create({
      clickId: processedData.clickId,
      linkId: await this.getLinkIdByCode(data.linkCode),
      ipAddress: processedData.ipAddress,
      userAgent: processedData.userAgent,
      referrer: processedData.referrer,
      device: processedData.device,
      browser: processedData.browser,
      os: processedData.os,
      country: processedData.country,
      region: processedData.region,
      city: processedData.city,
      deviceType: processedData.device,
      sessionId: processedData.sessionId,
      fingerprint: processedData.fingerprint,
      isBot: processedData.isBot,
      isFraudulent: processedData.isFraudulent,
    });

    await this.clickRepo.save(clickEvent);

    // Store click data in Redis for real-time analytics
    const clickKey = `${this.CLICK_PREFIX}${data.linkCode}:${processedData.clickId}`;
    await this.redis.setex(
      clickKey,
      this.CLICK_TTL,
      JSON.stringify(processedData),
    );

    // Update real-time analytics
    await this.updateRealTimeAnalytics(data.linkCode, processedData);

    // Update link click count (eventual consistency)
    await this.linkRepo.increment(
      { linkCode: data.linkCode },
      'clicks',
      1,
    );

    // Queue for detailed analytics processing
    await this.analyticsQueue.add('process-click', processedData);

    // Track unique visitors
    await this.trackUniqueVisitor(data.linkCode, data.ipAddress);

    return processedData;
  }

  /**
   * Track conversion
   */
  async trackConversion(data: ConversionData): Promise<void> {
    const conversionKey = `${this.CONVERSION_PREFIX}${data.linkCode}:${data.orderId}`;
    
    // Prevent duplicate conversions
    const exists = await this.redis.exists(conversionKey);
    if (exists) {
      return;
    }

    // Store conversion data
    await this.redis.setex(
      conversionKey,
      this.TTL * 30, // 30 days
      JSON.stringify(data),
    );

    // Update analytics
    await this.redis.hincrby(
      `${this.ANALYTICS_PREFIX}${data.linkCode}`,
      'conversions',
      1,
    );
    await this.redis.hincrby(
      `${this.ANALYTICS_PREFIX}${data.linkCode}`,
      'revenue',
      Number(data.amount),
    );

    // Update link conversion count and earnings
    const link = await this.linkRepo.findOne({
      where: { linkCode: data.linkCode },
    });

    if (link) {
      link.conversions += 1;
      link.earned = BigInt(link.earned) + data.amount;
      await this.linkRepo.save(link);
    }

    // Queue for attribution processing
    await this.analyticsQueue.add('process-conversion', data);
  }

  /**
   * Get real-time analytics for a link
   */
  async getRealTimeAnalytics(linkCode: string) {
    const analyticsKey = `${this.ANALYTICS_PREFIX}${linkCode}`;
    const [clicks, conversions, revenue, uniqueVisitors] = await Promise.all([
      this.redis.hget(analyticsKey, 'clicks'),
      this.redis.hget(analyticsKey, 'conversions'),
      this.redis.hget(analyticsKey, 'revenue'),
      this.redis.scard(`unique:${linkCode}`),
    ]);

    const clickCount = parseInt(clicks || '0');
    const conversionCount = parseInt(conversions || '0');
    const conversionRate = clickCount > 0 
      ? (conversionCount / clickCount * 100).toFixed(2)
      : '0.00';

    return {
      clicks: clickCount,
      conversions: conversionCount,
      revenue: revenue || '0',
      uniqueVisitors,
      conversionRate: `${conversionRate}%`,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get click stream for a link
   */
  async getClickStream(linkCode: string, limit = 100): Promise<ClickData[]> {
    const pattern = `${this.CLICK_PREFIX}${linkCode}:*`;
    const keys = await this.redis.keys(pattern);
    
    // Get most recent clicks
    const recentKeys = keys
      .sort((a, b) => {
        const timestampA = parseInt(a.split(':').pop() || '0');
        const timestampB = parseInt(b.split(':').pop() || '0');
        return timestampB - timestampA;
      })
      .slice(0, limit);

    const clicks = await Promise.all(
      recentKeys.map(async (key) => {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );

    return clicks.filter(Boolean) as ClickData[];
  }

  /**
   * Track unique visitors
   */
  private async trackUniqueVisitor(linkCode: string, ipAddress: string) {
    const uniqueKey = `unique:${linkCode}`;
    await this.redis.sadd(uniqueKey, ipAddress);
    await this.redis.expire(uniqueKey, this.TTL * 7); // 7 days
  }

  /**
   * Get analytics by time period
   */
  async getAnalyticsByPeriod(
    linkCode: string,
    startDate: Date,
    endDate: Date,
  ) {
    const analytics = await this.analyticsRepo
      .createQueryBuilder('analytics')
      .innerJoin('analytics.influencer', 'influencer')
      .innerJoin('influencer.links', 'link')
      .where('link.linkCode = :linkCode', { linkCode })
      .andWhere('analytics.date >= :startDate', { startDate })
      .andWhere('analytics.date <= :endDate', { endDate })
      .select([
        'analytics.date',
        'analytics.clicks',
        'analytics.conversions',
        'analytics.earned',
      ])
      .orderBy('analytics.date', 'ASC')
      .getMany();

    return analytics;
  }

  /**
   * Get top performing links
   */
  async getTopPerformingLinks(influencerId: string, limit = 10) {
    const links = await this.linkRepo
      .createQueryBuilder('link')
      .where('link.influencerId = :influencerId', { influencerId })
      .andWhere('link.isActive = true')
      .orderBy('link.conversions', 'DESC')
      .limit(limit)
      .getMany();

    return Promise.all(
      links.map(async (link) => {
        const realTimeData = await this.getRealTimeAnalytics(link.linkCode);
        return {
          linkCode: link.linkCode,
          productId: link.productId,
          ...realTimeData,
        };
      })
    );
  }

  /**
   * Clear analytics cache for a link
   */
  async clearAnalyticsCache(linkCode: string) {
    const pattern = `*${linkCode}*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Process click data with enrichment
   */
  private async processClickData(data: ClickData): Promise<ProcessedClickData> {
    const clickId = nanoid(16);
    const ua = new UAParser(data.userAgent);
    const userAgentData = ua.getResult();
    const geo = geoip.lookup(data.ipAddress);

    // Generate fingerprint
    const fingerprint = this.generateFingerprint(data);

    // Detect bot
    const isBot = this.detectBot(data.userAgent, userAgentData);

    // Check for fraud patterns
    const isFraudulent = await this.detectFraud(data, fingerprint, isBot);

    return {
      ...data,
      clickId,
      country: geo?.country || data.country,
      region: geo?.region || undefined,
      city: geo?.city || undefined,
      device: userAgentData.device.model || userAgentData.device.type || 'unknown',
      browser: userAgentData.browser.name || 'unknown',
      os: userAgentData.os.name || 'unknown',
      isBot,
      isFraudulent,
    };
  }

  /**
   * Generate fingerprint for click tracking
   */
  private generateFingerprint(data: ClickData): string {
    const fingerprintData = [
      data.ipAddress,
      data.userAgent,
      data.sessionId || '',
      data.fingerprint || '',
    ].join('|');

    return crypto
      .createHash('sha256')
      .update(fingerprintData)
      .digest('hex');
  }

  /**
   * Detect bot traffic
   */
  private detectBot(userAgent: string, uaData: any): boolean {
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /headless/i,
      /phantom/i,
      /selenium/i,
      /puppeteer/i,
    ];

    // Check user agent patterns
    if (botPatterns.some(pattern => pattern.test(userAgent))) {
      return true;
    }

    // Check for missing browser info
    if (!uaData.browser.name || !uaData.os.name) {
      return true;
    }

    return false;
  }

  /**
   * Detect fraudulent clicks
   */
  private async detectFraud(
    data: ClickData,
    fingerprint: string,
    isBot: boolean
  ): Promise<boolean> {
    if (isBot) return true;

    // Check for rapid clicks from same fingerprint
    const recentClickKey = `recent:${fingerprint}`;
    const recentClicks = await this.redis.incr(recentClickKey);
    
    if (recentClicks === 1) {
      await this.redis.expire(recentClickKey, 60); // 1 minute window
    }

    if (recentClicks > 5) {
      return true; // More than 5 clicks in 1 minute from same fingerprint
    }

    // Check for click farms (many clicks from same IP range)
    const ipPrefix = data.ipAddress.split('.').slice(0, 3).join('.');
    const ipRangeKey = `iprange:${ipPrefix}`;
    const ipRangeClicks = await this.redis.incr(ipRangeKey);
    
    if (ipRangeClicks === 1) {
      await this.redis.expire(ipRangeKey, 300); // 5 minute window
    }

    if (ipRangeClicks > 50) {
      return true; // More than 50 clicks from same IP range in 5 minutes
    }

    // Check for suspicious referrers
    const suspiciousReferrers = [
      'porn',
      'spam',
      'bot',
      'click',
      'traffic',
    ];

    if (data.referrer && suspiciousReferrers.some(term => 
      data.referrer!.toLowerCase().includes(term)
    )) {
      return true;
    }

    return false;
  }

  /**
   * Check rate limit for IP
   */
  private async checkRateLimit(ipAddress: string): Promise<boolean> {
    const key = `ratelimit:${ipAddress}`;
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      await this.redis.expire(key, this.RATE_LIMIT_WINDOW);
    }

    return count > this.RATE_LIMIT_MAX;
  }

  /**
   * Get link ID by code
   */
  private async getLinkIdByCode(linkCode: string): Promise<string> {
    const link = await this.linkRepo.findOne({
      where: { linkCode },
      select: ['id'],
    });

    if (!link) {
      throw new Error(`Link not found: ${linkCode}`);
    }

    return link.id;
  }

  /**
   * Store fraudulent click for analysis
   */
  private async storeFraudulentClick(data: ProcessedClickData): Promise<void> {
    const fraudKey = `fraud:${data.linkCode}:${data.clickId}`;
    await this.redis.setex(
      fraudKey,
      this.CLICK_TTL * 3, // Keep fraud data longer
      JSON.stringify({
        ...data,
        detectedAt: new Date(),
      }),
    );

    // Increment fraud counter
    await this.redis.hincrby(
      `${this.ANALYTICS_PREFIX}${data.linkCode}`,
      'fraudulent_clicks',
      1,
    );
  }

  /**
   * Update real-time analytics
   */
  private async updateRealTimeAnalytics(
    linkCode: string,
    data: ProcessedClickData
  ): Promise<void> {
    const analyticsKey = `${this.ANALYTICS_PREFIX}${linkCode}`;
    const dayKey = `${this.ANALYTICS_PREFIX}${linkCode}:${new Date().toISOString().split('T')[0]}`;

    // Update total counters
    await this.redis.hincrby(analyticsKey, 'clicks', 1);
    
    if (!data.isBot && !data.isFraudulent) {
      await this.redis.hincrby(analyticsKey, 'valid_clicks', 1);
    }

    // Update daily counters
    await this.redis.hincrby(dayKey, 'clicks', 1);
    await this.redis.expire(dayKey, this.TTL * 7); // Keep daily data for 7 days

    // Update country stats
    if (data.country) {
      await this.redis.hincrby(
        `${analyticsKey}:countries`,
        data.country,
        1
      );
    }

    // Update device stats
    if (data.device) {
      await this.redis.hincrby(
        `${analyticsKey}:devices`,
        data.device,
        1
      );
    }

    // Update browser stats
    if (data.browser) {
      await this.redis.hincrby(
        `${analyticsKey}:browsers`,
        data.browser,
        1
      );
    }
  }
}