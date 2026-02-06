import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ClickTrackingService } from '../services/click-tracking.service';
import { ClickTrackingController } from '../controllers/click-tracking.controller';
import { InfluencerLink, InfluencerAnalyticsDaily, ClickEvent } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InfluencerLink,
      InfluencerAnalyticsDaily,
      ClickEvent,
    ]),
    BullModule.registerQueue({
      name: 'analytics',
    }),
  ],
  controllers: [ClickTrackingController],
  providers: [ClickTrackingService],
  exports: [ClickTrackingService],
})
export class ClickTrackingModule {}