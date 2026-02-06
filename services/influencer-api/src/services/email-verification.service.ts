import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { EmailService } from './email.service';
import { Influencer } from '../entities/influencer.entity';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours in seconds
  private readonly VERIFICATION_PREFIX = 'email:verify:';

  constructor(
    @InjectRepository(Influencer)
    private influencerRepo: Repository<Influencer>,
    @InjectRedis() private redis: Redis,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  async sendVerificationEmail(influencer: Influencer): Promise<void> {
    try {
      // Generate verification token
      const token = this.generateVerificationToken();
      
      // Store token in Redis with expiry
      const key = `${this.VERIFICATION_PREFIX}${token}`;
      await this.redis.setex(key, this.TOKEN_EXPIRY, influencer.id);

      // Generate verification URL
      const baseUrl = this.configService.get('APP_URL', 'https://twist.to');
      const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

      // Send email
      await this.emailService.sendEmail({
        to: influencer.email,
        subject: 'Verify Your Twist Influencer Account',
        template: 'influencer-verification',
        context: {
          username: influencer.username,
          verificationUrl,
          expiryHours: 24,
        },
      });

      this.logger.log(`Verification email sent to ${influencer.email}`);
    } catch (error) {
      this.logger.error('Failed to send verification email', error);
      throw new Error('Failed to send verification email');
    }
  }

  async verifyEmail(token: string): Promise<Influencer> {
    try {
      // Get influencer ID from Redis
      const key = `${this.VERIFICATION_PREFIX}${token}`;
      const influencerId = await this.redis.get(key);

      if (!influencerId) {
        throw new Error('Invalid or expired verification token');
      }

      // Find and update influencer
      const influencer = await this.influencerRepo.findOne({
        where: { id: influencerId },
      });

      if (!influencer) {
        throw new Error('Influencer not found');
      }

      if (influencer.emailVerified) {
        throw new Error('Email already verified');
      }

      // Update email verification status
      influencer.emailVerified = true;
      influencer.emailVerifiedAt = new Date();
      await this.influencerRepo.save(influencer);

      // Delete token from Redis
      await this.redis.del(key);

      // Send welcome email
      await this.sendWelcomeEmail(influencer);

      this.logger.log(`Email verified for influencer ${influencer.username}`);
      return influencer;
    } catch (error) {
      this.logger.error('Email verification failed', error);
      throw error;
    }
  }

  async resendVerificationEmail(email: string): Promise<void> {
    const influencer = await this.influencerRepo.findOne({
      where: { email },
    });

    if (!influencer) {
      throw new Error('Influencer not found');
    }

    if (influencer.emailVerified) {
      throw new Error('Email already verified');
    }

    // Check rate limiting
    const rateLimitKey = `email:verify:ratelimit:${influencer.id}`;
    const attempts = await this.redis.get(rateLimitKey);
    
    if (attempts && parseInt(attempts) >= 3) {
      throw new Error('Too many verification attempts. Please try again later.');
    }

    // Increment rate limit counter
    await this.redis.incr(rateLimitKey);
    await this.redis.expire(rateLimitKey, 3600); // 1 hour expiry

    // Send new verification email
    await this.sendVerificationEmail(influencer);
  }

  private async sendWelcomeEmail(influencer: Influencer): Promise<void> {
    try {
      await this.emailService.sendEmail({
        to: influencer.email,
        subject: 'Welcome to Twist Influencer Program!',
        template: 'influencer-welcome',
        context: {
          username: influencer.username,
          dashboardUrl: `${this.configService.get('APP_URL')}/dashboard`,
          stakingUrl: `${this.configService.get('APP_URL')}/staking`,
          supportUrl: `${this.configService.get('APP_URL')}/support`,
        },
      });
    } catch (error) {
      this.logger.error('Failed to send welcome email', error);
      // Don't throw - welcome email is not critical
    }
  }

  private generateVerificationToken(): string {
    return randomBytes(32).toString('hex');
  }

  async checkEmailAvailable(email: string): Promise<boolean> {
    const existing = await this.influencerRepo.findOne({
      where: { email },
    });
    return !existing;
  }

  async checkUsernameAvailable(username: string): Promise<boolean> {
    const existing = await this.influencerRepo.findOne({
      where: { username },
    });
    return !existing;
  }
}