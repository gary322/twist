import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Query, 
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { StakingService } from '../services/staking.service';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    wallet: string;
  };
}

@Controller('staking')
export class StakingController {
  constructor(private readonly stakingService: StakingService) {}

  @Get('search')
  async searchInfluencers(
    @Query('query') query?: string,
    @Query('sortBy') sortBy: 'totalStaked' | 'stakerCount' | 'apy' | 'tier' = 'totalStaked',
    @Query('minStaked') minStaked?: number,
    @Query('minApy') minApy?: number,
    @Query('tiers') tiers?: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.stakingService.searchInfluencers({
      query,
      sortBy,
      filters: {
        minStaked: minStaked ? Number(minStaked) : undefined,
        minApy: minApy ? Number(minApy) : undefined,
        tiers: tiers ? tiers.split(',') : undefined,
      },
      limit: Number(limit),
      offset: Number(offset),
    });
  }

  @Get('influencer/:influencerId')
  async getInfluencerStakingDetails(@Param('influencerId') influencerId: string) {
    return this.stakingService.getInfluencerStakingDetails(influencerId);
  }

  @Get('user/:userId/stakes')
  async getUserStakes(@Param('userId') userId: string) {
    return this.stakingService.getUserStakes(userId);
  }

  @Post('stake')
  async stakeOnInfluencer(
    @Body() body: {
      influencerId: string;
      amount: string;
      userId: string;
      wallet: string;
    },
  ) {
    if (!body.influencerId || !body.amount || !body.userId || !body.wallet) {
      throw new BadRequestException('Missing required fields');
    }

    const amount = BigInt(body.amount);
    if (amount <= 0n) {
      throw new BadRequestException('Invalid stake amount');
    }

    return this.stakingService.stakeOnInfluencer({
      userId: body.userId,
      influencerId: body.influencerId,
      amount,
      wallet: body.wallet,
    });
  }

  @Post('unstake')
  async unstake(
    @Body() body: {
      influencerId: string;
      amount: string;
      userId: string;
      wallet: string;
    },
  ) {
    if (!body.influencerId || !body.amount || !body.userId || !body.wallet) {
      throw new BadRequestException('Missing required fields');
    }

    const amount = BigInt(body.amount);
    if (amount <= 0n) {
      throw new BadRequestException('Invalid unstake amount');
    }

    return this.stakingService.unstake({
      userId: body.userId,
      influencerId: body.influencerId,
      amount,
      wallet: body.wallet,
    });
  }

  @Post('claim')
  async claimRewards(
    @Body() body: {
      influencerId: string;
      userId: string;
      wallet: string;
    },
  ) {
    if (!body.influencerId || !body.userId || !body.wallet) {
      throw new BadRequestException('Missing required fields');
    }

    return this.stakingService.claimRewards({
      userId: body.userId,
      influencerId: body.influencerId,
      wallet: body.wallet,
    });
  }
}