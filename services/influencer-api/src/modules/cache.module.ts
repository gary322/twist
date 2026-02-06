import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheService } from '../services/cache.service';
import { InfluencerCacheService } from '../services/influencer-cache.service';
import { CacheController } from '../controllers/cache.controller';
import { CacheWarmupService } from '../services/cache-warmup.service';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    CacheService,
    InfluencerCacheService,
    CacheWarmupService,
  ],
  controllers: [CacheController],
  exports: [CacheService, InfluencerCacheService],
})
export class CacheModule {}