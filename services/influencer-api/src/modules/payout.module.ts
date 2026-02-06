import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { PayoutService } from '../services/payout.service';
import { PayoutController } from '../controllers/payout.controller';
import {
  InfluencerPayout,
  InfluencerPayoutItem,
  InfluencerStakingPool,
  UserStake,
  StakingReward,
  Conversion,
  AttributionModel,
  Influencer,
} from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InfluencerPayout,
      InfluencerPayoutItem,
      InfluencerStakingPool,
      UserStake,
      StakingReward,
      Conversion,
      AttributionModel,
      Influencer,
    ]),
    BullModule.registerQueue({
      name: 'payout',
    }),
  ],
  controllers: [PayoutController],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutModule {}