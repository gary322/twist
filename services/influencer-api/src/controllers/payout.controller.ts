import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Query, 
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PayoutService } from '../services/payout.service';
import { 
  CalculatePayoutDto,
  CreatePayoutDto,
  GetPayoutHistoryDto,
  PayoutAnalyticsDto,
  PayoutCalculationResponse,
  BalanceResponse,
} from '../dto/payout.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@ApiTags('payouts')
@Controller('payouts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PayoutController {
  constructor(
    private readonly payoutService: PayoutService,
  ) {}

  @Post('calculate')
  @ApiOperation({ summary: 'Calculate payout for a period' })
  @ApiResponse({ 
    status: 200, 
    description: 'Payout calculation completed',
    type: PayoutCalculationResponse,
  })
  async calculatePayout(
    @Body() dto: CalculatePayoutDto,
  ): Promise<PayoutCalculationResponse> {
    const result = await this.payoutService.calculatePayout({
      influencerId: dto.influencerId,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      includeBonus: dto.includeBonus,
    });

    return {
      influencerId: result.influencerId,
      period: result.period,
      earnings: {
        conversions: result.earnings.conversions.toString(),
        stakingRewards: result.earnings.stakingRewards.toString(),
        bonuses: result.earnings.bonuses.toString(),
        total: result.earnings.total.toString(),
      },
      deductions: {
        platformFee: result.deductions.platformFee.toString(),
        processingFee: result.deductions.processingFee.toString(),
        total: result.deductions.total.toString(),
      },
      netAmount: result.netAmount.toString(),
      items: result.items.map(item => ({
        type: item.type,
        amount: item.amount.toString(),
        description: item.description,
        referenceId: item.referenceId,
        createdAt: item.createdAt,
      })),
    };
  }

  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a payout' })
  @ApiResponse({ status: 201, description: 'Payout request created' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async createPayout(
    @Request() req: any,
    @Body() dto: CreatePayoutDto,
  ) {
    const influencerId = req.user.influencerId;
    
    if (!influencerId) {
      throw new Error('User is not an influencer');
    }

    return this.payoutService.createPayout({
      influencerId,
      amount: BigInt(dto.amount),
      method: dto.method,
      walletAddress: dto.walletAddress,
      bankDetails: dto.bankDetails,
    });
  }

  @Get('balance')
  @ApiOperation({ summary: 'Get available balance' })
  @ApiResponse({ 
    status: 200, 
    description: 'Balance retrieved',
    type: BalanceResponse,
  })
  async getBalance(
    @Request() req: any,
  ): Promise<BalanceResponse> {
    const influencerId = req.user.influencerId;
    
    if (!influencerId) {
      throw new Error('User is not an influencer');
    }

    const balance = await this.payoutService.getAvailableBalance(influencerId);

    return {
      balance: balance.toString(),
      currency: 'TWIST',
      lastUpdated: new Date(),
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get payout history' })
  @ApiResponse({ status: 200, description: 'Payout history retrieved' })
  async getPayoutHistory(
    @Request() req: any,
    @Query() query: GetPayoutHistoryDto,
  ) {
    const influencerId = req.user.isAdmin 
      ? query.influencerId 
      : req.user.influencerId;

    return this.payoutService.getPayoutHistory({
      influencerId,
      status: query.status,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get payout analytics' })
  @ApiResponse({ status: 200, description: 'Payout analytics retrieved' })
  async getPayoutAnalytics(
    @Query() query: PayoutAnalyticsDto,
  ) {
    return this.payoutService.getPayoutAnalytics({
      startDate: new Date(query.startDate),
      endDate: new Date(query.endDate),
      groupBy: query.groupBy || 'month',
    });
  }

  @Post(':id/process')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Process a pending payout (admin only)' })
  @ApiResponse({ status: 204, description: 'Payout processed' })
  async processPayout(
    @Request() req: any,
    @Param('id') payoutId: string,
  ) {
    if (!req.user.isAdmin) {
      throw new Error('Unauthorized');
    }

    await this.payoutService.processPayout(payoutId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payout details' })
  @ApiResponse({ status: 200, description: 'Payout details retrieved' })
  async getPayoutDetails(
    @Request() req: any,
    @Param('id') payoutId: string,
  ) {
    // Implementation would check if user has access to this payout
    // For now, return mock data
    return {
      id: payoutId,
      status: 'pending',
      amount: '100000000000',
      currency: 'TWIST',
      method: 'crypto',
      requestedAt: new Date(),
    };
  }
}