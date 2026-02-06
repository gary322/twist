import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InfluencerLink, Influencer } from '../entities';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

@Injectable()
export class LinkGenerationService {
  private readonly BASE_URL = process.env.BASE_URL || 'https://twist.to';

  constructor(
    @InjectRepository(InfluencerLink)
    private linkRepo: Repository<InfluencerLink>,
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
  ) {}

  /**
   * Generate unique referral link for influencer
   */
  async generateReferralLink(params: {
    influencerId: string;
    productId: string;
    promoCode?: string;
    customUrl?: string;
    expiresAt?: Date;
  }): Promise<InfluencerLink> {
    // Validate influencer exists
    const influencer = await this.influencerRepo.findOne({
      where: { id: params.influencerId },
    });

    if (!influencer) {
      throw new BadRequestException('Influencer not found');
    }

    // Generate unique link code
    const linkCode = this.generateLinkCode(influencer.username);

    // Create referral URL
    const referralUrl = params.customUrl || 
      `${this.BASE_URL}/ref/${linkCode}`;

    // Generate QR code
    const qrCodeUrl = await this.generateQRCode(referralUrl);

    // Create link record
    const link = this.linkRepo.create({
      influencerId: params.influencerId,
      productId: params.productId,
      linkCode,
      promoCode: params.promoCode,
      customUrl: referralUrl,
      qrCodeUrl,
      isActive: true,
      expiresAt: params.expiresAt,
    });

    return this.linkRepo.save(link);
  }

  /**
   * Generate unique link code
   */
  private generateLinkCode(username: string): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    const prefix = username.substring(0, 3).toUpperCase();
    return `${prefix}${timestamp}${random}`.substring(0, 20);
  }

  /**
   * Generate QR code for referral link
   */
  private async generateQRCode(url: string): Promise<string> {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        width: 512,
      });

      // In production, upload to CDN and return URL
      // For now, return data URL
      return qrCodeDataUrl;
    } catch (error) {
      throw new BadRequestException('Failed to generate QR code');
    }
  }

  /**
   * Get all active links for influencer
   */
  async getInfluencerLinks(influencerId: string): Promise<InfluencerLink[]> {
    return this.linkRepo.find({
      where: {
        influencerId,
        isActive: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  /**
   * Update link statistics
   */
  async updateLinkStats(linkCode: string, type: 'click' | 'conversion') {
    const link = await this.linkRepo.findOne({
      where: { linkCode },
    });

    if (!link) {
      throw new BadRequestException('Invalid link code');
    }

    if (type === 'click') {
      link.clicks += 1;
    } else if (type === 'conversion') {
      link.conversions += 1;
    }

    return this.linkRepo.save(link);
  }

  /**
   * Deactivate link
   */
  async deactivateLink(linkId: string, influencerId: string) {
    const result = await this.linkRepo.update(
      { id: linkId, influencerId },
      { isActive: false },
    );

    if (result.affected === 0) {
      throw new BadRequestException('Link not found or unauthorized');
    }

    return { success: true };
  }

  /**
   * Get link analytics
   */
  async getLinkAnalytics(linkId: string, influencerId: string) {
    const link = await this.linkRepo.findOne({
      where: { id: linkId, influencerId },
    });

    if (!link) {
      throw new BadRequestException('Link not found');
    }

    const conversionRate = link.clicks > 0 
      ? (link.conversions / link.clicks * 100).toFixed(2)
      : '0.00';

    return {
      linkCode: link.linkCode,
      url: link.customUrl,
      clicks: link.clicks,
      conversions: link.conversions,
      conversionRate: `${conversionRate}%`,
      earned: link.earned.toString(),
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      isActive: link.isActive,
    };
  }

  /**
   * Bulk generate links for multiple products
   */
  async bulkGenerateLinks(params: {
    influencerId: string;
    productIds: string[];
    promoCode?: string;
    expiresAt?: Date;
  }) {
    const links = await Promise.all(
      params.productIds.map(productId => 
        this.generateReferralLink({
          influencerId: params.influencerId,
          productId,
          promoCode: params.promoCode,
          expiresAt: params.expiresAt,
        })
      )
    );

    return links;
  }

  /**
   * Generate shortened URL
   */
  async generateShortUrl(longUrl: string): Promise<string> {
    const shortCode = crypto
      .createHash('sha256')
      .update(longUrl)
      .digest('base64')
      .replace(/[+/=]/g, '')
      .substring(0, 8);

    return `${this.BASE_URL}/s/${shortCode}`;
  }
}