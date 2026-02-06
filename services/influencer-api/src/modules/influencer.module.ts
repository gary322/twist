import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { 
  Influencer, 
  InfluencerProfile, 
  InfluencerStakingPool,
  InfluencerLink,
} from '../entities';
import { InfluencerService } from '../services/influencer.service';
import { InfluencerController } from '../controllers/influencer.controller';
import { WalletValidationService } from '../services/wallet-validation.service';
import { EmailVerificationService } from '../services/email-verification.service';
import { EmailService } from '../services/email.service';
import { SolanaService } from '../services/solana.service';
import { TierManagementService } from '../services/tier-management.service';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { InfluencerQueueProcessor } from '../processors/influencer-queue.processor';
import { NotificationModule } from './notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Influencer, 
      InfluencerProfile,
      InfluencerStakingPool,
      InfluencerLink,
    ]),
    BullModule.registerQueue(
      { name: 'influencer' },
      { name: 'notifications' }
    ),
    NotificationModule,
  ],
  controllers: [InfluencerController],
  providers: [
    InfluencerService,
    WalletValidationService,
    EmailVerificationService,
    EmailService,
    SolanaService,
    TierManagementService,
    RateLimitGuard,
    InfluencerQueueProcessor,
  ],
  exports: [
    InfluencerService,
    WalletValidationService,
    EmailVerificationService,
    SolanaService,
  ],
})
export class InfluencerModule {}
