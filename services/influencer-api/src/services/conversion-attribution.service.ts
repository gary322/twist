import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  Conversion,
  ConversionStatus,
  ClickEvent,
  AttributionModel,
  AttributionModelType,
  TouchPoint,
} from '../entities';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export interface ConversionData {
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  productId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AttributionResult {
  conversionId: string;
  influencers: Array<{
    influencerId: string;
    linkCode: string;
    attribution: number; // Percentage 0-100
    touchpoints: TouchPoint[];
    earnedAmount: number;
  }>;
  model: AttributionModelType;
}

@Injectable()
export class ConversionAttributionService {
  private readonly logger = new Logger(ConversionAttributionService.name);
  private readonly ATTRIBUTION_WINDOW_DAYS = 30;
  private readonly CLICK_SESSION_TTL = 86400; // 24 hours

  constructor(
    @InjectRepository(Conversion)
    private conversionRepo: Repository<Conversion>,
    @InjectRepository(ClickEvent)
    private clickRepo: Repository<ClickEvent>,
    @InjectRepository(AttributionModel)
    private attributionRepo: Repository<AttributionModel>,
    @InjectRedis() private redis: Redis,
    @InjectQueue('attribution') private attributionQueue: Queue,
  ) {}

  async trackConversion(data: ConversionData): Promise<AttributionResult> {
    try {
      // Create conversion record
      const conversion = this.conversionRepo.create({
        id: uuidv4(),
        orderId: data.orderId,
        userId: data.userId,
        amount: data.amount,
        currency: data.currency,
        productId: data.productId,
        convertedAt: data.timestamp,
        metadata: data.metadata,
        status: ConversionStatus.PENDING,
      });

      await this.conversionRepo.save(conversion);

      // Get user's click history
      const touchpoints = await this.getUserTouchpoints(
        data.userId,
        data.productId
      );

      if (touchpoints.length === 0) {
        // No attribution - direct conversion
        return {
          conversionId: conversion.id,
          influencers: [],
          model: AttributionModelType.LAST_CLICK,
        };
      }

      // Calculate attribution
      const attribution = await this.calculateAttribution(
        conversion,
        touchpoints
      );

      // Save attribution details
      await this.saveAttribution(conversion.id, attribution);

      // Queue payout calculation
      await this.attributionQueue.add('calculate-payouts', {
        conversionId: conversion.id,
        attribution,
      });

      return attribution;
    } catch (error) {
      this.logger.error('Failed to track conversion', error);
      throw error;
    }
  }

  private async getUserTouchpoints(
    userId: string,
    productId: string
  ): Promise<TouchPoint[]> {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - this.ATTRIBUTION_WINDOW_DAYS);

    // Get clicks from database
    const clicks = await this.clickRepo.find({
      where: {
        fingerprint: await this.getUserFingerprint(userId),
        createdAt: MoreThan(windowStart),
      },
      order: {
        createdAt: 'ASC',
      },
      relations: ['link', 'link.influencer'],
    });

    // Get session data from Redis
    const sessionKey = `user:${userId}:session`;
    const sessionData = await this.redis.get(sessionKey);
    
    const touchpoints: TouchPoint[] = clicks.map((click, index) => ({
      id: click.id,
      influencerId: click.link.influencerId,
      linkCode: click.link.linkCode,
      clickedAt: click.createdAt,
      position: index + 1,
      device: click.device || '',
      referrer: click.referrer || '',
      isFirstTouch: index === 0,
      isLastTouch: index === clicks.length - 1,
      sessionId: click.sessionId || '',
      timeSinceFirst: index === 0 ? 0 : 
        (click.createdAt.getTime() - clicks[0].createdAt.getTime()) / 1000,
    }));

    return touchpoints;
  }

  private async calculateAttribution(
    conversion: Conversion,
    touchpoints: TouchPoint[]
  ): Promise<AttributionResult> {
    // Get attribution model for the product/campaign
    const model = await this.getAttributionModel(conversion.productId);

    let attributions: Map<string, number>;

    switch (model) {
      case AttributionModelType.LAST_CLICK:
        attributions = this.lastClickAttribution(touchpoints);
        break;
      case AttributionModelType.FIRST_CLICK:
        attributions = this.firstClickAttribution(touchpoints);
        break;
      case AttributionModelType.LINEAR:
        attributions = this.linearAttribution(touchpoints);
        break;
      case AttributionModelType.TIME_DECAY:
        attributions = this.timeDecayAttribution(touchpoints, conversion.convertedAt);
        break;
      case AttributionModelType.POSITION_BASED:
        attributions = this.positionBasedAttribution(touchpoints);
        break;
      default:
        attributions = this.lastClickAttribution(touchpoints);
    }

    // Group touchpoints by influencer
    const influencerTouchpoints = new Map<string, TouchPoint[]>();
    touchpoints.forEach(tp => {
      const list = influencerTouchpoints.get(tp.influencerId) || [];
      list.push(tp);
      influencerTouchpoints.set(tp.influencerId, list);
    });

    // Calculate earned amounts
    const influencers = Array.from(attributions.entries()).map(([influencerId, attribution]) => {
      const earnedAmount = (conversion.amount * attribution) / 100;
      const tps = influencerTouchpoints.get(influencerId) || [];
      
      return {
        influencerId,
        linkCode: tps[tps.length - 1]?.linkCode || '',
        attribution,
        touchpoints: tps,
        earnedAmount,
      };
    });

    return {
      conversionId: conversion.id,
      influencers,
      model,
    };
  }

  private lastClickAttribution(touchpoints: TouchPoint[]): Map<string, number> {
    const attributions = new Map<string, number>();
    
    if (touchpoints.length > 0) {
      const lastTouch = touchpoints[touchpoints.length - 1];
      attributions.set(lastTouch.influencerId, 100);
    }
    
    return attributions;
  }

  private firstClickAttribution(touchpoints: TouchPoint[]): Map<string, number> {
    const attributions = new Map<string, number>();
    
    if (touchpoints.length > 0) {
      const firstTouch = touchpoints[0];
      attributions.set(firstTouch.influencerId, 100);
    }
    
    return attributions;
  }

  private linearAttribution(touchpoints: TouchPoint[]): Map<string, number> {
    const attributions = new Map<string, number>();
    
    if (touchpoints.length === 0) return attributions;
    
    const creditPerTouch = 100 / touchpoints.length;
    
    touchpoints.forEach(tp => {
      const current = attributions.get(tp.influencerId) || 0;
      attributions.set(tp.influencerId, current + creditPerTouch);
    });
    
    return attributions;
  }

  private timeDecayAttribution(
    touchpoints: TouchPoint[], 
    conversionTime: Date
  ): Map<string, number> {
    const attributions = new Map<string, number>();
    
    if (touchpoints.length === 0) return attributions;
    
    // Calculate weights based on time decay (half-life of 7 days)
    const halfLife = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    let totalWeight = 0;
    
    const weights = touchpoints.map(tp => {
      const timeDiff = conversionTime.getTime() - tp.clickedAt.getTime();
      const weight = Math.pow(0.5, timeDiff / halfLife);
      totalWeight += weight;
      return { influencerId: tp.influencerId, weight };
    });
    
    // Normalize weights to sum to 100
    weights.forEach(({ influencerId, weight }) => {
      const current = attributions.get(influencerId) || 0;
      const credit = (weight / totalWeight) * 100;
      attributions.set(influencerId, current + credit);
    });
    
    return attributions;
  }

  private positionBasedAttribution(touchpoints: TouchPoint[]): Map<string, number> {
    const attributions = new Map<string, number>();
    
    if (touchpoints.length === 0) return attributions;
    
    if (touchpoints.length === 1) {
      attributions.set(touchpoints[0].influencerId, 100);
      return attributions;
    }
    
    if (touchpoints.length === 2) {
      attributions.set(touchpoints[0].influencerId, 50);
      attributions.set(touchpoints[1].influencerId, 50);
      return attributions;
    }
    
    // 40% to first, 40% to last, 20% distributed among middle
    const firstCredit = 40;
    const lastCredit = 40;
    const middleCredit = 20;
    
    // First touch
    attributions.set(touchpoints[0].influencerId, firstCredit);
    
    // Last touch
    const lastTouch = touchpoints[touchpoints.length - 1];
    const lastCurrent = attributions.get(lastTouch.influencerId) || 0;
    attributions.set(lastTouch.influencerId, lastCurrent + lastCredit);
    
    // Middle touches
    const middleTouches = touchpoints.slice(1, -1);
    if (middleTouches.length > 0) {
      const creditPerMiddle = middleCredit / middleTouches.length;
      
      middleTouches.forEach(tp => {
        const current = attributions.get(tp.influencerId) || 0;
        attributions.set(tp.influencerId, current + creditPerMiddle);
      });
    }
    
    return attributions;
  }

  private async getAttributionModel(
    productId: string
  ): Promise<AttributionModelType> {
    // Check product-specific model
    const productModel = await this.redis.get(`attribution:model:${productId}`);
    if (productModel) {
      return productModel as AttributionModelType;
    }

    // Check global default
    const globalModel = await this.redis.get('attribution:model:default');
    if (globalModel) {
      return globalModel as AttributionModelType;
    }

    // Default to last click
    return AttributionModelType.LAST_CLICK;
  }

  private async saveAttribution(
    conversionId: string,
    attribution: AttributionResult
  ): Promise<void> {
    const records = attribution.influencers.map(inf => ({
      conversionId,
      influencerId: inf.influencerId,
      linkCode: inf.linkCode,
      attributionPercent: inf.attribution,
      earnedAmount: inf.earnedAmount,
      model: attribution.model,
      touchpointCount: inf.touchpoints.length,
      firstTouchAt: inf.touchpoints[0]?.clickedAt,
      lastTouchAt: inf.touchpoints[inf.touchpoints.length - 1]?.clickedAt,
    }));

    await this.attributionRepo.save(records);
  }

  async getConversionDetails(conversionId: string) {
    const conversion = await this.conversionRepo.findOne({
      where: { id: conversionId },
      relations: ['attributions', 'attributions.influencer'],
    });

    if (!conversion) {
      throw new Error('Conversion not found');
    }

    const touchpoints = await this.clickRepo.find({
      where: {
        fingerprint: await this.getUserFingerprint(conversion.userId),
      },
      order: {
        createdAt: 'ASC',
      },
      relations: ['link'],
    });

    return {
      conversion: {
        id: conversion.id,
        orderId: conversion.orderId,
        amount: conversion.amount,
        currency: conversion.currency,
        convertedAt: conversion.convertedAt,
        status: conversion.status,
      },
      attributions: conversion.attributions.map(attr => ({
        influencer: {
          id: attr.influencer.id,
          username: attr.influencer.username,
          displayName: attr.influencer.profile?.displayName,
        },
        attribution: attr.attributionPercent,
        earnedAmount: attr.earnedAmount,
        touchpoints: attr.touchpointCount,
      })),
      journey: touchpoints.map((click, index) => ({
        step: index + 1,
        influencer: click.link.influencerId,
        linkCode: click.link.linkCode,
        clickedAt: click.createdAt,
        device: click.device || '',
        source: click.referrer || '',
      })),
    };
  }

  async updateAttributionModel(
    productId: string,
    model: AttributionModelType
  ): Promise<void> {
    const key = productId === 'default' 
      ? 'attribution:model:default'
      : `attribution:model:${productId}`;
    
    await this.redis.set(key, model);
    
    this.logger.log(`Updated attribution model for ${productId} to ${model}`);
  }

  async getAttributionReport(params: {
    startDate: Date;
    endDate: Date;
    influencerId?: string;
    productId?: string;
  }) {
    const query = this.attributionRepo.createQueryBuilder('attr')
      .leftJoinAndSelect('attr.conversion', 'conversion')
      .leftJoinAndSelect('attr.influencer', 'influencer')
      .where('conversion.convertedAt BETWEEN :startDate AND :endDate', {
        startDate: params.startDate,
        endDate: params.endDate,
      });

    if (params.influencerId) {
      query.andWhere('attr.influencerId = :influencerId', {
        influencerId: params.influencerId,
      });
    }

    if (params.productId) {
      query.andWhere('conversion.productId = :productId', {
        productId: params.productId,
      });
    }

    const attributions = await query.getMany();

    // Calculate metrics
    const metrics = {
      totalConversions: new Set(attributions.map(a => a.conversionId)).size,
      totalRevenue: attributions.reduce((sum, a) => sum + a.earnedAmount, 0),
      averageAttribution: attributions.reduce((sum, a) => sum + a.attributionPercent, 0) / attributions.length,
      modelBreakdown: {} as Record<string, number>,
      influencerPerformance: [] as any[],
    };

    // Model breakdown
    attributions.forEach(attr => {
      metrics.modelBreakdown[attr.model] = (metrics.modelBreakdown[attr.model] || 0) + 1;
    });

    // Influencer performance
    const influencerMap = new Map<string, any>();
    attributions.forEach(attr => {
      const current = influencerMap.get(attr.influencerId) || {
        influencerId: attr.influencerId,
        username: attr.influencer.username,
        conversions: 0,
        revenue: 0,
        averageAttribution: 0,
      };
      
      current.conversions += 1;
      current.revenue += attr.earnedAmount;
      current.averageAttribution = 
        (current.averageAttribution * (current.conversions - 1) + attr.attributionPercent) / current.conversions;
      
      influencerMap.set(attr.influencerId, current);
    });

    metrics.influencerPerformance = Array.from(influencerMap.values())
      .sort((a, b) => b.revenue - a.revenue);

    return metrics;
  }

  private async getUserFingerprint(userId: string): Promise<string> {
    // Generate consistent fingerprint for user ID
    return crypto
      .createHash('sha256')
      .update(userId)
      .digest('hex');
  }
}