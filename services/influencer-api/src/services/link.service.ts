import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InfluencerLink, Influencer, InfluencerProfile } from '../entities';
import { TierManagementService, TierConfig } from './tier-management.service';
import * as QRCode from 'qrcode';
import * as sharp from 'sharp';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';

export interface CreateLinkParams {
  influencerId: string;
  productId: string;
  promoCode?: string;
  customUrl?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface LinkMetrics {
  clicks: number;
  conversions: number;
  earned: string;
  conversionRate: number;
  lastClickedAt?: Date;
}

@Injectable()
export class LinkService {
  private readonly logger = new Logger(LinkService.name);
  private readonly BASE_URL = process.env.BASE_URL || 'https://twist.to';
  private readonly LINK_PREFIX = 'r'; // r for referral

  constructor(
    @InjectRepository(InfluencerLink)
    private linkRepo: Repository<InfluencerLink>,
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
    @InjectRedis() private redis: Redis,
    @InjectQueue('analytics') private analyticsQueue: Queue,
    private tierManagementService: TierManagementService,
  ) {}

  async createLink(params: CreateLinkParams): Promise<InfluencerLink> {
    // Validate influencer
    const influencer = await this.influencerRepo.findOne({
      where: { id: params.influencerId },
      relations: ['profile'],
    });

    if (!influencer) {
      throw new NotFoundException('Influencer not found');
    }

    // Check tier limits
    const tierBenefits = this.tierManagementService.getTierBenefits(influencer.tier);
    const activeLinks = await this.linkRepo.count({
      where: { influencerId: params.influencerId, isActive: true },
    });

    const maxLinks = tierBenefits.linkLimit;
    if (maxLinks !== -1 && activeLinks >= maxLinks) {
      throw new BadRequestException(
        `You have reached the maximum number of active links (${maxLinks}) for your ${influencer.tier} tier`
      );
    }

    // Generate unique link code
    const linkCode = await this.generateUniqueLinkCode();

    // Create custom URL if not provided
    const customUrl = params.customUrl || `${this.BASE_URL}/${this.LINK_PREFIX}/${linkCode}`;

    // Generate QR code
    const qrCodeUrl = await this.generateQRCode(customUrl, influencer);

    // Create link
    const link = this.linkRepo.create({
      influencerId: params.influencerId,
      productId: params.productId,
      linkCode,
      promoCode: params.promoCode,
      customUrl,
      qrCodeUrl,
      clicks: 0,
      conversions: 0,
      earned: 0n,
      isActive: true,
      expiresAt: params.expiresAt,
      metadata: params.metadata || {},
    });

    const savedLink = await this.linkRepo.save(link);
    const linkResult = Array.isArray(savedLink) ? savedLink[0] : savedLink;

    // Cache link data for fast lookups
    await this.cacheLinkData(linkResult);

    // Emit event
    await this.analyticsQueue.add('link-created', {
      linkId: linkResult.id,
      influencerId: params.influencerId,
      productId: params.productId,
      timestamp: new Date(),
    });

    this.logger.log(`Link created for influencer ${influencer.username}: ${linkCode}`);

    return linkResult;
  }

  async getLink(linkCode: string): Promise<InfluencerLink | null> {
    // Try cache first
    const cached = await this.redis.get(`link:${linkCode}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fallback to database
    const link = await this.linkRepo.findOne({
      where: { linkCode, isActive: true },
      relations: ['influencer', 'influencer.profile'],
    });

    if (link) {
      await this.cacheLinkData(link);
    }

    return link;
  }

  async getLinkById(linkId: string): Promise<InfluencerLink> {
    const link = await this.linkRepo.findOne({
      where: { id: linkId },
      relations: ['influencer', 'influencer.profile'],
    });

    if (!link) {
      throw new NotFoundException('Link not found');
    }

    return link;
  }

  async getInfluencerLinks(influencerId: string, params?: {
    productId?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const query = this.linkRepo
      .createQueryBuilder('link')
      .where('link.influencerId = :influencerId', { influencerId });

    if (params?.productId) {
      query.andWhere('link.productId = :productId', { productId: params.productId });
    }

    if (params?.isActive !== undefined) {
      query.andWhere('link.isActive = :isActive', { isActive: params.isActive });
    }

    const [links, total] = await query
      .orderBy('link.createdAt', 'DESC')
      .limit(params?.limit || 20)
      .offset(params?.offset || 0)
      .getManyAndCount();

    // Enhance with metrics
    const enhancedLinks = await Promise.all(
      links.map(async (link) => {
        const metrics = await this.getLinkMetrics(link.id);
        return {
          ...link,
          metrics,
        };
      })
    );

    return {
      links: enhancedLinks,
      total,
      limit: params?.limit || 20,
      offset: params?.offset || 0,
    };
  }

  async updateLink(linkId: string, updates: {
    promoCode?: string;
    customUrl?: string;
    isActive?: boolean;
    expiresAt?: Date;
    metadata?: Record<string, any>;
  }) {
    const link = await this.linkRepo.findOne({ where: { id: linkId } });

    if (!link) {
      throw new NotFoundException('Link not found');
    }

    // Update fields
    if (updates.promoCode !== undefined) link.promoCode = updates.promoCode;
    if (updates.customUrl !== undefined) link.customUrl = updates.customUrl;
    if (updates.isActive !== undefined) link.isActive = updates.isActive;
    if (updates.expiresAt !== undefined) link.expiresAt = updates.expiresAt;
    if (updates.metadata !== undefined) {
      link.metadata = { ...(link.metadata || {}), ...updates.metadata };
    }

    const updatedLink = await this.linkRepo.save(link);

    // Update cache
    await this.cacheLinkData(updatedLink);

    return updatedLink;
  }

  async deactivateLink(linkId: string): Promise<void> {
    const result = await this.linkRepo.update(linkId, { isActive: false });

    if (result.affected === 0) {
      throw new NotFoundException('Link not found');
    }

    // Remove from cache
    const link = await this.linkRepo.findOne({ where: { id: linkId } });
    if (link) {
      await this.redis.del(`link:${link.linkCode}`);
    }
  }

  async trackClick(linkCode: string, clickData: {
    ip: string;
    userAgent: string;
    referrer?: string;
    country?: string;
    device?: string;
  }): Promise<{ redirectUrl: string; productId: string }> {
    const link = await this.getLink(linkCode);

    if (!link) {
      throw new NotFoundException('Invalid link');
    }

    // Check if link is expired
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new BadRequestException('Link has expired');
    }

    // Increment click counter
    await this.linkRepo.increment({ id: link.id }, 'clicks', 1);

    // Generate click ID for tracking
    const clickId = nanoid();

    // Store click data for analytics
    const clickRecord = {
      linkId: link.id,
      influencerId: link.influencerId,
      productId: link.productId,
      clickId,
      timestamp: new Date(),
      ...clickData,
    };

    // Queue for processing
    await this.analyticsQueue.add('click-tracked', clickRecord);

    // Store click ID in Redis for conversion attribution (expires in 30 days)
    await this.redis.setex(
      `click:${clickId}`,
      30 * 24 * 60 * 60,
      JSON.stringify({
        linkId: link.id,
        influencerId: link.influencerId,
        productId: link.productId,
        timestamp: clickRecord.timestamp,
      })
    );

    // Build redirect URL with tracking parameters
    const redirectUrl = this.buildRedirectUrl(link.productId, {
      ref: link.linkCode,
      click: clickId,
      promo: link.promoCode,
    });

    return {
      redirectUrl,
      productId: link.productId,
    };
  }

  async getLinkMetrics(linkId: string): Promise<LinkMetrics> {
    const cacheKey = `link:metrics:${linkId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const link = await this.linkRepo.findOne({ where: { id: linkId } });
    if (!link) {
      throw new NotFoundException('Link not found');
    }

    const metrics: LinkMetrics = {
      clicks: link.clicks,
      conversions: link.conversions,
      earned: link.earned.toString(),
      conversionRate: link.clicks > 0 ? (link.conversions / link.clicks) * 100 : 0,
      lastClickedAt: link.lastClickedAt,
    };

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(metrics));

    return metrics;
  }

  async generateBulkLinks(params: {
    influencerId: string;
    productIds: string[];
    promoCode?: string;
    expiresAt?: Date;
  }): Promise<InfluencerLink[]> {
    const links: InfluencerLink[] = [];

    for (const productId of params.productIds) {
      try {
        const link = await this.createLink({
          influencerId: params.influencerId,
          productId,
          promoCode: params.promoCode,
          expiresAt: params.expiresAt,
        });
        links.push(link);
      } catch (error) {
        this.logger.error(`Failed to create link for product ${productId}`, error);
      }
    }

    return links;
  }

  async getTopPerformingLinks(influencerId: string, limit: number = 10) {
    const links = await this.linkRepo
      .createQueryBuilder('link')
      .where('link.influencerId = :influencerId', { influencerId })
      .andWhere('link.isActive = true')
      .orderBy('link.earned', 'DESC')
      .addOrderBy('link.conversions', 'DESC')
      .limit(limit)
      .getMany();

    return Promise.all(
      links.map(async (link) => {
        const metrics = await this.getLinkMetrics(link.id);
        return {
          ...link,
          metrics,
        };
      })
    );
  }

  private async generateUniqueLinkCode(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      // Generate 8 character alphanumeric code
      const code = nanoid(8);
      
      // Check if it exists
      const existing = await this.linkRepo.findOne({ where: { linkCode: code } });
      if (!existing) {
        return code;
      }

      attempts++;
    }

    // Fallback to longer code if collision issues
    return nanoid(12);
  }

  private async generateQRCode(url: string, influencer: Influencer): Promise<string> {
    try {
      // Generate QR code as buffer
      const qrBuffer = await QRCode.toBuffer(url, {
        errorCorrectionLevel: 'M',
        type: 'png',
        width: 500,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // Add branding if influencer has avatar
      let finalBuffer = qrBuffer;
      if (influencer.profile?.avatar) {
        // In production, overlay influencer avatar or brand logo
        // For now, just use the plain QR code
        finalBuffer = qrBuffer;
      }

      // Upload to storage (mock for now)
      const filename = `qr_${influencer.id}_${nanoid(8)}.png`;
      const qrUrl = await this.uploadToStorage(finalBuffer, filename);

      return qrUrl;
    } catch (error) {
      this.logger.error('Failed to generate QR code', error);
      // Return a placeholder URL
      return `${this.BASE_URL}/qr-placeholder.png`;
    }
  }

  private async uploadToStorage(buffer: Buffer, filename: string): Promise<string> {
    // In production, upload to S3 or similar
    // For now, return a mock URL
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    return `${this.BASE_URL}/storage/qr/${hash}/${filename}`;
  }

  private async cacheLinkData(link: InfluencerLink): Promise<void> {
    const ttl = 3600; // 1 hour
    await this.redis.setex(
      `link:${link.linkCode}`,
      ttl,
      JSON.stringify({
        id: link.id,
        influencerId: link.influencerId,
        productId: link.productId,
        promoCode: link.promoCode,
        isActive: link.isActive,
        expiresAt: link.expiresAt,
      })
    );
  }

  private buildRedirectUrl(productId: string, params: Record<string, string | undefined>): string {
    // In production, this would look up the actual product URL
    const baseProductUrl = `${this.BASE_URL}/products/${productId}`;
    
    const url = new URL(baseProductUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.append(key, value);
      }
    });

    return url.toString();
  }

  async getLinkAnalytics(linkId: string, params: {
    startDate: Date;
    endDate: Date;
    groupBy: 'hour' | 'day' | 'week' | 'month';
  }) {
    // This would query analytics data from a time-series database
    // For now, return mock data structure
    return {
      linkId,
      period: {
        start: params.startDate,
        end: params.endDate,
      },
      summary: {
        totalClicks: 0,
        uniqueClicks: 0,
        conversions: 0,
        revenue: '0',
        conversionRate: 0,
      },
      timeSeries: [],
      topCountries: [],
      topDevices: [],
      topReferrers: [],
    };
  }
}