import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { 
  InfluencerStakingPool, 
  UserStake, 
  StakingReward, 
  StakingHistory,
  Influencer,
  InfluencerProfile 
} from '../entities';
import { StakingService } from '../services/staking.service';
import { StakingController } from '../controllers/staking.controller';
import { StakingQueueProcessor } from '../processors/staking-queue.processor';
import { NotificationModule } from './notification.module';
import { SolanaService } from '../services/solana.service';
import { AuthGuard } from '../guards/auth.guard';
import { RateLimitGuard } from '../guards/rate-limit.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InfluencerStakingPool,
      UserStake,
      StakingReward,
      StakingHistory,
      Influencer,
      InfluencerProfile,
    ]),
    BullModule.registerQueue({
      name: 'staking',
    }),
    NotificationModule,
  ],
  controllers: [StakingController],
  providers: [
    StakingService, 
    StakingQueueProcessor,
    SolanaService,
    AuthGuard,
    RateLimitGuard,
  ],
  exports: [StakingService],
})
export class StakingModule {}