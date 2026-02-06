import { Injectable, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Influencer, InfluencerProfile, InfluencerStakingPool } from '../entities';
import { EmailVerificationService } from './email-verification.service';
import { SolanaService } from './solana.service';
import { RegisterInfluencerDto, UpdateInfluencerProfileDto } from '../dto/influencer.dto';
import { MessageFactory } from '@twist/messages';
import * as crypto from 'crypto';
import { PublicKey } from '@solana/web3.js';

@Injectable()
export class InfluencerService {
  private readonly logger = new Logger(InfluencerService.name);
  private readonly profanityList = ['admin', 'administrator', 'root', 'system', 'twist', 'official'];

  constructor(
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
    @InjectRepository(InfluencerProfile)
    private profileRepo: Repository<InfluencerProfile>,
    @InjectRepository(InfluencerStakingPool)
    private stakingPoolRepo: Repository<InfluencerStakingPool>,
    @InjectRedis() private redis: Redis,
    private emailVerificationService: EmailVerificationService,
    private solanaService: SolanaService,
    @InjectQueue('influencer') private influencerQueue: Queue,
  ) {}

  async register(dto: RegisterInfluencerDto) {
    try {
      // Validate terms acceptance
      if (!dto.acceptTerms) {
        throw new BadRequestException('You must accept the terms and conditions');
      }

      // Validate username
      await this.validateUsername(dto.username);

      // Check rate limit
      await this.checkRateLimit(dto.email);

      // Check email availability
      const emailAvailable = await this.emailVerificationService.checkEmailAvailable(dto.email);
      if (!emailAvailable) {
        throw new ConflictException('Email already registered');
      }

      // Validate wallet address if provided
      if (dto.walletAddress) {
        const isValid = await this.solanaService.validateWalletAddress(dto.walletAddress);
        if (!isValid) {
          throw new BadRequestException('Invalid Solana wallet address');
        }
      }

      // Create email hash
      const emailHash = crypto
        .createHash('sha256')
        .update(dto.email.toLowerCase())
        .digest('hex');

      // Create influencer
      const influencer = this.influencerRepo.create({
        username: dto.username.toLowerCase(),
        email: dto.email.toLowerCase(),
        emailHash,
        walletAddress: dto.walletAddress,
        emailVerified: false,
      });

      const saved = await this.influencerRepo.save(influencer);

      // Create profile
      const profile = this.profileRepo.create({
        influencerId: saved.id,
        displayName: dto.displayName || dto.username,
        bio: dto.bio,
      });
      await this.profileRepo.save(profile);

      // Initialize staking pool on Solana (async)
      if (dto.walletAddress) {
        await this.influencerQueue.add('create-staking-pool', {
          influencerId: saved.id,
          walletAddress: dto.walletAddress,
        });
      }

      // Send verification email
      await this.emailVerificationService.sendVerificationEmail(saved);

      // Emit registration event
      await this.emitRegistrationEvent(saved);

      this.logger.log(`Influencer registered: ${saved.username}`);

      return {
        id: saved.id,
        username: saved.username,
        email: saved.email,
        emailVerified: saved.emailVerified,
        message: 'Registration successful. Please check your email to verify your account.',
      };
    } catch (error) {
      this.logger.error('Registration failed', error);
      throw error;
    }
  }

  async findByUsername(username: string): Promise<Influencer | null> {
    return this.influencerRepo.findOne({
      where: { username },
      relations: ['profile', 'stakingPool'],
    });
  }

  async updateProfile(
    influencerId: string,
    dto: UpdateInfluencerProfileDto,
  ) {
    const influencer = await this.influencerRepo.findOne({
      where: { id: influencerId },
    });

    if (!influencer) {
      throw new BadRequestException('Influencer not found');
    }

    if (!influencer.emailVerified) {
      throw new BadRequestException('Please verify your email before updating profile');
    }

    const profile = await this.profileRepo.findOne({
      where: { influencerId },
    });

    if (!profile) {
      throw new BadRequestException('Profile not found');
    }

    // Validate social links
    if (dto.socialLinks) {
      this.validateSocialLinks(dto.socialLinks);
    }

    Object.assign(profile, dto);
    const updated = await this.profileRepo.save(profile);

    // Emit profile update event
    await this.emitProfileUpdateEvent(influencer, updated);

    return updated;
  }

  async connectWallet(influencerId: string, walletAddress: string, signature: string, message: string) {
    const influencer = await this.influencerRepo.findOne({
      where: { id: influencerId },
    });

    if (!influencer) {
      throw new BadRequestException('Influencer not found');
    }

    // Verify wallet ownership
    const isValid = await this.solanaService.verifyWalletSignature(
      walletAddress,
      message,
      signature,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid wallet signature');
    }

    // Check if wallet is already connected to another account
    const existing = await this.influencerRepo.findOne({
      where: { walletAddress },
    });

    if (existing && existing.id !== influencerId) {
      throw new ConflictException('Wallet already connected to another account');
    }

    // Update wallet address
    influencer.walletAddress = walletAddress;
    await this.influencerRepo.save(influencer);

    // Create staking pool if not exists
    const pool = await this.stakingPoolRepo.findOne({
      where: { influencerId },
    });

    if (!pool) {
      await this.influencerQueue.add('create-staking-pool', {
        influencerId,
        walletAddress,
      });
    }

    return {
      success: true,
      walletAddress,
      message: 'Wallet connected successfully',
    };
  }

  async createStakingPool(influencerId: string, revenueShareBps: number = 2000) {
    const influencer = await this.influencerRepo.findOne({
      where: { id: influencerId },
    });

    if (!influencer || !influencer.walletAddress) {
      throw new BadRequestException('Influencer wallet not found');
    }

    try {
      // Create on-chain staking pool
      const poolAddress = await this.solanaService.createStakingPool({
        influencer: new PublicKey(influencer.walletAddress),
        revenueShareBps,
        minStake: 1_000_000_000, // 1 TWIST minimum
      });

      // Save to database
      const pool = this.stakingPoolRepo.create({
        influencerId,
        poolAddress: poolAddress.toString(),
        revenueShareBps,
        minStake: 1_000_000_000n,
        isActive: true,
      });

      await this.stakingPoolRepo.save(pool);

      this.logger.log(`Staking pool created for ${influencer.username}: ${poolAddress}`);

      return pool;
    } catch (error) {
      this.logger.error('Failed to create staking pool', error);
      throw new BadRequestException('Failed to create staking pool');
    }
  }

  private async validateUsername(username: string) {
    // Check length and format
    if (username.length < 3 || username.length > 30) {
      throw new BadRequestException('Username must be between 3 and 30 characters');
    }

    // Check profanity
    const lowerUsername = username.toLowerCase();
    for (const word of this.profanityList) {
      if (lowerUsername.includes(word)) {
        throw new BadRequestException('Username contains restricted words');
      }
    }

    // Check availability
    const available = await this.emailVerificationService.checkUsernameAvailable(username);
    if (!available) {
      throw new ConflictException('Username already taken');
    }
  }

  private validateSocialLinks(links: any) {
    const validPlatforms = ['twitter', 'instagram', 'youtube', 'tiktok', 'website'];
    const urlPattern = /^https?:\/\/(www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/;

    for (const [platform, url] of Object.entries(links)) {
      if (!validPlatforms.includes(platform)) {
        throw new BadRequestException(`Invalid social platform: ${platform}`);
      }

      if (url && !urlPattern.test(url as string)) {
        throw new BadRequestException(`Invalid URL for ${platform}`);
      }
    }
  }

  private async emitRegistrationEvent(influencer: Influencer) {
    const message = MessageFactory.createMessage(
      'influencer.registered',
      'influencer-service',
      {
        influencerId: influencer.id,
        username: influencer.username,
        email: influencer.email,
        tier: influencer.tier,
        timestamp: new Date(),
      },
    );

    await this.influencerQueue.add('publish-event', message);
  }

  private async emitProfileUpdateEvent(influencer: Influencer, profile: InfluencerProfile) {
    const message = MessageFactory.createMessage(
      'influencer.profile.updated',
      'influencer-service',
      {
        influencerId: influencer.id,
        username: influencer.username,
        profile: {
          displayName: profile.displayName,
          bio: profile.bio,
          avatar: profile.avatar,
          categories: profile.categories,
        },
        timestamp: new Date(),
      },
    );

    await this.influencerQueue.add('publish-event', message);
  }

  async findById(id: string): Promise<Influencer | null> {
    return await this.influencerRepo.findOne({
      where: { id },
      relations: ['profile'],
    });
  }

  async findByEmail(email: string): Promise<Influencer | null> {
    return await this.influencerRepo.findOne({
      where: { email },
      relations: ['profile'],
    });
  }

  private async checkRateLimit(email: string) {
    const key = `register:ratelimit:${email}`;
    const attempts = await this.redis.get(key);
    
    if (attempts && parseInt(attempts) >= 3) {
      throw new BadRequestException('Too many registration attempts. Please try again later.');
    }

    await this.redis.incr(key);
    await this.redis.expire(key, 3600); // 1 hour expiry
  }
}