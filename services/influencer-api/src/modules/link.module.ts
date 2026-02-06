import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { InfluencerLink, Influencer, InfluencerProfile } from '../entities';
import { LinkService } from '../services/link.service';
import { LinkController } from '../controllers/link.controller';
import { TierManagementService } from '../services/tier-management.service';
import { RateLimitGuard } from '../guards/rate-limit.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([InfluencerLink, Influencer, InfluencerProfile]),
    BullModule.registerQueue({
      name: 'analytics',
    }),
  ],
  controllers: [LinkController],
  providers: [
    LinkService,
    TierManagementService,
    RateLimitGuard,
  ],
  exports: [LinkService],
})
export class LinkModule {}
