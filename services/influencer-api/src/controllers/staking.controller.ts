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
  ForbiddenException,
} from '@nestjs/common';
import { StakingService } from '../services/staking.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

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
  @UseGuards(JwtAuthGuard)
  async getUserStakes(
    @Request() req: any,
    @Param('userId') userId: string,
  ) {
    if (!req.user?.isAdmin && req.user?.userId !== userId) {
      throw new ForbiddenException('You can only view your own stakes');
    }
    return this.stakingService.getUserStakes(userId);
  }

  @Post('stake')
  @UseGuards(JwtAuthGuard)
  async stakeOnInfluencer(
    @Request() req: any,
    @Body() body: {
      influencerId: string;
      amount: string;
    },
  ) {
    if (!body.influencerId || !body.amount) {
      throw new BadRequestException('Missing required fields');
    }

    const amount = BigInt(body.amount);
    if (amount <= 0n) {
      throw new BadRequestException('Invalid stake amount');
    }

    return this.stakingService.stakeOnInfluencer({
      userId: req.user.userId,
      influencerId: body.influencerId,
      amount,
      wallet: req.user.walletAddress,
    });
  }

  @Post('unstake')
  @UseGuards(JwtAuthGuard)
  async unstake(
    @Request() req: any,
    @Body() body: {
      influencerId: string;
      amount: string;
    },
  ) {
    if (!body.influencerId || !body.amount) {
      throw new BadRequestException('Missing required fields');
    }

    const amount = BigInt(body.amount);
    if (amount <= 0n) {
      throw new BadRequestException('Invalid unstake amount');
    }

    return this.stakingService.unstake({
      userId: req.user.userId,
      influencerId: body.influencerId,
      amount,
      wallet: req.user.walletAddress,
    });
  }

  @Post('claim')
  @UseGuards(JwtAuthGuard)
  async claimRewards(
    @Request() req: any,
    @Body() body: {
      influencerId: string;
    },
  ) {
    if (!body.influencerId) {
      throw new BadRequestException('Missing required fields');
    }

    return this.stakingService.claimRewards({
      userId: req.user.userId,
      influencerId: body.influencerId,
      wallet: req.user.walletAddress,
    });
  }
}
