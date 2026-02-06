import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { BullModule } from '@nestjs/bull';
import productionConfig from './config/production.config';
import { CacheModule } from './modules/cache.module';
import { InfluencerModule } from './modules/influencer.module';
import { StakingModule } from './modules/staking.module';
import { LinkModule } from './modules/link.module';
import { ClickTrackingModule } from './modules/click-tracking.module';
import { PayoutModule } from './modules/payout.module';
import { AnalyticsModule } from './modules/analytics.module';
import { NotificationModule } from './modules/notification.module';
import { HealthController } from './controllers/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [productionConfig],
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'twist_influencer',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: false,
      logging: ['error', 'warn'],
    }),
    RedisModule.forRoot({
      type: 'single',
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`,
      options: {
        password: process.env.REDIS_PASSWORD,
      },
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
    }),
    CacheModule, // Import first as it's global
    InfluencerModule,
    StakingModule,
    LinkModule,
    ClickTrackingModule,
    PayoutModule,
    AnalyticsModule,
    NotificationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
