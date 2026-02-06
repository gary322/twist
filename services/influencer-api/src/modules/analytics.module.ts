import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { InfluencerAnalyticsDaily, InfluencerLink } from '../entities';
import { ClickTrackingService } from '../services/click-tracking.service';
import { AnalyticsProcessor } from '../processors/analytics.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([InfluencerAnalyticsDaily, InfluencerLink]),
    BullModule.registerQueue({
      name: 'analytics',
    }),
  ],
  controllers: [],
  providers: [ClickTrackingService, AnalyticsProcessor],
  exports: [ClickTrackingService],
})
export class AnalyticsModule {}