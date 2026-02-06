import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import * as sharp from 'sharp';
import * as handlebars from 'handlebars';
import { S3 } from 'aws-sdk';
import {
  ContentTemplate,
  ContentAsset,
  GeneratedContent,
  Influencer,
} from '../entities';
import { SECRETS } from '../config/secrets';
import { v4 as uuidv4 } from 'uuid';

export interface ContentGenerationParams {
  influencerId: string;
  templateId: string;
  customization?: {
    text?: Record<string, string>;
    colors?: Record<string, string>;
    images?: Record<string, string>;
  };
}

export interface ContentTemplateData {
  id: string;
  name: string;
  type: 'banner' | 'social_post' | 'video_thumbnail' | 'qr_code' | 'story';
  category: string;
  dimensions: {
    width: number;
    height: number;
  };
  formats: string[];
  variables: Array<{
    name: string;
    type: 'text' | 'image' | 'color' | 'number';
    default?: any;
    required: boolean;
  }>;
  previewUrl: string;
}

@Injectable()
export class ContentHubService {
  private readonly logger = new Logger(ContentHubService.name);
  private s3: S3;
  private templates: Map<string, handlebars.TemplateDelegate> = new Map();

  constructor(
    @InjectRepository(ContentTemplate)
    private templateRepo: Repository<ContentTemplate>,
    @InjectRepository(ContentAsset)
    private assetRepo: Repository<ContentAsset>,
    @InjectRepository(GeneratedContent)
    private generatedRepo: Repository<GeneratedContent>,
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
    @InjectRedis() private redis: Redis,
  ) {
    this.s3 = new S3({
      accessKeyId: SECRETS.AWS.ACCESS_KEY_ID,
      secretAccessKey: SECRETS.AWS.SECRET_ACCESS_KEY,
      region: SECRETS.AWS.REGION,
    });

    this.initializeTemplates();
  }

  private async initializeTemplates() {
    // Register Handlebars helpers
    handlebars.registerHelper('formatNumber', (num: number) => {
      return new Intl.NumberFormat().format(num);
    });

    handlebars.registerHelper('formatPercent', (num: number) => {
      return `${num.toFixed(1)}%`;
    });

    handlebars.registerHelper('uppercase', (str: string) => {
      return str.toUpperCase();
    });
  }

  async getTemplates(params?: {
    type?: string;
    category?: string;
    influencerId?: string;
  }) {
    const cacheKey = `templates:${JSON.stringify(params || {})}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const query = this.templateRepo.createQueryBuilder('template')
      .where('template.isActive = :active', { active: true });

    if (params?.type) {
      query.andWhere('template.type = :type', { type: params.type });
    }

    if (params?.category) {
      query.andWhere('template.category = :category', { category: params.category });
    }

    if (params?.influencerId) {
      // Check if influencer has custom templates
      const influencer = await this.influencerRepo.findOne({
        where: { id: params.influencerId },
      });
      
      if (influencer?.tier === 'PLATINUM') {
        query.orWhere('template.tier = :tier', { tier: 'PLATINUM' });
      }
    }

    const templates = await query.getMany();

    // Enhance with preview URLs
    const enhanced = templates.map(template => ({
      ...template,
      previewUrl: this.getTemplatePreviewUrl(template.id),
      downloadUrl: this.getTemplateDownloadUrl(template.id),
    }));

    await this.redis.setex(cacheKey, 300, JSON.stringify(enhanced));
    return enhanced;
  }

  async generateContent(params: ContentGenerationParams) {
    const { influencerId, templateId, customization } = params;

    // Get template and influencer data
    const [template, influencer] = await Promise.all([
      this.templateRepo.findOne({ where: { id: templateId } }),
      this.influencerRepo.findOne({
        where: { id: influencerId },
        relations: ['profile', 'stakingPool'],
      }),
    ]);

    if (!template || !influencer) {
      throw new Error('Template or influencer not found');
    }

    // Prepare template variables
    const variables = await this.prepareTemplateVariables(
      influencer,
      template,
      customization
    );

    // Generate content based on type
    let generatedUrls: Record<string, string> = {};

    switch (template.type) {
      case 'banner':
        generatedUrls = await this.generateBanner(template, variables);
        break;
      case 'social_post':
        generatedUrls = await this.generateSocialPost(template, variables);
        break;
      case 'video_thumbnail':
        generatedUrls = await this.generateVideoThumbnail(template, variables);
        break;
      case 'qr_code':
        generatedUrls = await this.generateQRCode(template, variables);
        break;
      case 'story':
        generatedUrls = await this.generateStory(template, variables);
        break;
    }

    // Save generated content record
    const generated = this.generatedRepo.create({
      id: uuidv4(),
      influencerId,
      templateId,
      type: template.type,
      urls: generatedUrls,
      metadata: {
        variables,
        customization,
        generatedAt: new Date(),
      },
    });

    await this.generatedRepo.save(generated);

    return {
      id: generated.id,
      type: template.type,
      urls: generatedUrls,
      downloadUrl: await this.createDownloadBundle(generatedUrls),
    };
  }

  private async prepareTemplateVariables(
    influencer: any,
    template: any,
    customization?: any
  ) {
    const pool = influencer.stakingPool;
    
    const defaultVariables = {
      // Influencer data
      username: influencer.username,
      displayName: influencer.profile?.displayName || influencer.username,
      avatar: influencer.profile?.avatar || '/default-avatar.png',
      tier: influencer.tier,
      bio: influencer.profile?.bio || '',
      
      // Staking data
      totalStaked: pool?.totalStaked || '0',
      stakerCount: pool?.stakerCount || 0,
      apy: await this.getInfluencerAPY(influencer.id),
      revenueShare: pool?.revenueShareBps ? pool.revenueShareBps / 100 : 0,
      
      // Links
      stakingLink: `https://twist.to/stake/${influencer.id}`,
      profileLink: `https://twist.to/influencer/${influencer.username}`,
      qrCodeUrl: await this.getQRCodeUrl(`https://twist.to/stake/${influencer.id}`),
      
      // Branding
      primaryColor: '#8B5CF6',
      secondaryColor: '#7C3AED',
      accentColor: '#10B981',
      
      // Date
      currentDate: new Date().toLocaleDateString(),
      currentYear: new Date().getFullYear(),
    };

    // Merge with customization
    return {
      ...defaultVariables,
      ...customization?.text,
      colors: {
        ...defaultVariables,
        ...customization?.colors,
      },
      images: {
        avatar: defaultVariables.avatar,
        ...customization?.images,
      },
    };
  }

  private async generateBanner(template: any, variables: any): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};

    // Generate different sizes
    const sizes = [
      { name: 'twitter', width: 1500, height: 500 },
      { name: 'facebook', width: 1200, height: 630 },
      { name: 'instagram', width: 1080, height: 1080 },
      { name: 'linkedin', width: 1200, height: 627 },
    ];

    for (const size of sizes) {
      const svg = await this.renderSVGTemplate(template.svgTemplate, variables);
      
      const buffer = await sharp(Buffer.from(svg))
        .resize(size.width, size.height)
        .png()
        .toBuffer();

      const key = `content/${variables.username}/banners/${template.id}/${size.name}.png`;
      const url = await this.uploadToS3(key, buffer, 'image/png');
      
      urls[size.name] = url;
    }

    return urls;
  }

  private async generateSocialPost(template: any, variables: any): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};

    // Generate post text
    const postTemplate = handlebars.compile(template.textTemplate);
    const postText = postTemplate(variables);

    // Generate image if template includes one
    if (template.includesImage) {
      const svg = await this.renderSVGTemplate(template.svgTemplate, variables);
      
      const buffer = await sharp(Buffer.from(svg))
        .resize(1080, 1080)
        .png()
        .toBuffer();

      const key = `content/${variables.username}/posts/${template.id}/image.png`;
      const imageUrl = await this.uploadToS3(key, buffer, 'image/png');
      
      urls.image = imageUrl;
    }

    // Save post text
    const textKey = `content/${variables.username}/posts/${template.id}/text.txt`;
    const textUrl = await this.uploadToS3(textKey, Buffer.from(postText), 'text/plain');
    
    urls.text = textUrl;
    urls.preview = await this.generatePostPreview(postText, urls.image);

    return urls;
  }

  private async generateVideoThumbnail(template: any, variables: any): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};

    const svg = await this.renderSVGTemplate(template.svgTemplate, variables);
    
    // YouTube thumbnail size
    const buffer = await sharp(Buffer.from(svg))
      .resize(1280, 720)
      .png()
      .toBuffer();

    const key = `content/${variables.username}/thumbnails/${template.id}/thumbnail.png`;
    const url = await this.uploadToS3(key, buffer, 'image/png');
    
    urls.thumbnail = url;

    // Generate alternate sizes
    const altBuffer = await sharp(Buffer.from(svg))
      .resize(640, 360)
      .png()
      .toBuffer();

    const altKey = `content/${variables.username}/thumbnails/${template.id}/thumbnail_small.png`;
    const altUrl = await this.uploadToS3(altKey, altBuffer, 'image/png');
    
    urls.thumbnail_small = altUrl;

    return urls;
  }

  private async generateQRCode(template: any, variables: any): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};
    
    // Generate QR code with branding
    const qrSvg = await this.createBrandedQRCode(
      variables.stakingLink,
      {
        color: variables.colors.primaryColor,
        logo: variables.images.avatar,
      }
    );

    // Convert to different formats
    const formats = ['png', 'svg', 'pdf'];
    
    for (const format of formats) {
      let buffer: Buffer;
      let contentType: string;
      
      switch (format) {
        case 'png':
          buffer = await sharp(Buffer.from(qrSvg))
            .resize(1000, 1000)
            .png()
            .toBuffer();
          contentType = 'image/png';
          break;
        case 'svg':
          buffer = Buffer.from(qrSvg);
          contentType = 'image/svg+xml';
          break;
        case 'pdf':
          // Convert SVG to PDF (simplified for example)
          buffer = await this.convertSVGtoPDF(qrSvg);
          contentType = 'application/pdf';
          break;
      }

      const key = `content/${variables.username}/qrcodes/${template.id}/qrcode.${format}`;
      const url = await this.uploadToS3(key, buffer!, contentType);
      
      urls[format] = url;
    }

    return urls;
  }

  private async generateStory(template: any, variables: any): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};

    // Story dimensions (9:16 aspect ratio)
    const svg = await this.renderSVGTemplate(template.svgTemplate, variables);
    
    const buffer = await sharp(Buffer.from(svg))
      .resize(1080, 1920)
      .png()
      .toBuffer();

    const key = `content/${variables.username}/stories/${template.id}/story.png`;
    const url = await this.uploadToS3(key, buffer, 'image/png');
    
    urls.story = url;

    // Generate animated version if template supports it
    if (template.supportsAnimation) {
      const animatedUrl = await this.generateAnimatedStory(template, variables);
      urls.animated = animatedUrl;
    }

    return urls;
  }

  private async renderSVGTemplate(svgTemplate: string, variables: any): Promise<string> {
    const template = handlebars.compile(svgTemplate);
    return template(variables);
  }

  private async createBrandedQRCode(url: string, options: any): Promise<string> {
    // This would integrate with a QR code library to create branded QR codes
    // For now, returning a placeholder
    return `<svg><!-- QR Code for ${url} --></svg>`;
  }

  private async convertSVGtoPDF(svg: string): Promise<Buffer> {
    // This would use a library like puppeteer or svg2pdf
    // For now, returning a placeholder
    return Buffer.from('PDF content');
  }

  private async generatePostPreview(text: string, imageUrl?: string): Promise<string> {
    // Generate a preview image of the social post
    const previewSvg = `
      <svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
        <rect width="500" height="500" fill="#f9f9f9"/>
        <text x="20" y="40" font-family="Arial" font-size="16" fill="#333">
          ${text.substring(0, 100)}...
        </text>
      </svg>
    `;
    
    const buffer = await sharp(Buffer.from(previewSvg))
      .png()
      .toBuffer();

    const key = `content/previews/${uuidv4()}.png`;
    return await this.uploadToS3(key, buffer, 'image/png');
  }

  private async generateAnimatedStory(template: any, variables: any): Promise<string> {
    // This would generate an animated story (GIF or MP4)
    // For now, returning a placeholder URL
    return 'https://example.com/animated-story.mp4';
  }

  private async uploadToS3(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const params = {
      Bucket: SECRETS.AWS.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    };

    const result = await this.s3.upload(params).promise();
    return result.Location;
  }

  private getTemplatePreviewUrl(templateId: string): string {
    return `https://${SECRETS.AWS.S3_BUCKET}.s3.amazonaws.com/templates/${templateId}/preview.png`;
  }

  private getTemplateDownloadUrl(templateId: string): string {
    return `https://api.twist.to/v1/content/templates/${templateId}/download`;
  }

  private async getQRCodeUrl(url: string): Promise<string> {
    const encoded = encodeURIComponent(url);
    return `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encoded}`;
  }

  private async getInfluencerAPY(influencerId: string): Promise<number> {
    // Get from Redis cache or calculate
    const cached = await this.redis.get(`influencer:${influencerId}:apy`);
    return cached ? parseFloat(cached) : 0;
  }

  private async createDownloadBundle(urls: Record<string, string>): Promise<string> {
    // Create a signed URL for downloading all generated content as a ZIP
    const key = `content/downloads/${uuidv4()}.zip`;
    
    const params = {
      Bucket: SECRETS.AWS.S3_BUCKET,
      Key: key,
      Expires: 3600, // 1 hour
    };

    return this.s3.getSignedUrl('getObject', params);
  }

  async getGeneratedContent(params: {
    influencerId: string;
    type?: string;
    limit?: number;
    offset?: number;
  }) {
    const query = this.generatedRepo.createQueryBuilder('content')
      .where('content.influencerId = :influencerId', { influencerId: params.influencerId });

    if (params.type) {
      query.andWhere('content.type = :type', { type: params.type });
    }

    query.orderBy('content.createdAt', 'DESC')
      .limit(params.limit || 20)
      .offset(params.offset || 0);

    const [content, total] = await query.getManyAndCount();

    return {
      content,
      total,
      limit: params.limit || 20,
      offset: params.offset || 0,
    };
  }

  async createCustomTemplate(params: {
    influencerId: string;
    name: string;
    type: string;
    svgTemplate: string;
    variables: any[];
  }) {
    // Only PLATINUM influencers can create custom templates
    const influencer = await this.influencerRepo.findOne({
      where: { id: params.influencerId },
    });

    if (influencer?.tier !== 'PLATINUM') {
      throw new Error('Custom templates are only available for PLATINUM influencers');
    }

    const template = this.templateRepo.create({
      id: uuidv4(),
      name: params.name,
      type: params.type as any,
      category: 'custom',
      influencerId: params.influencerId,
      svgTemplate: params.svgTemplate,
      variables: params.variables,
      isActive: true,
      tier: 'PLATINUM',
    });

    await this.templateRepo.save(template);

    // Clear template cache
    const keys = await this.redis.keys('templates:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    return template;
  }
}
