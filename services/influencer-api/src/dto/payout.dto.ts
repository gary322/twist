import { IsString, IsNumber, IsEnum, IsOptional, IsDateString, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutMethod, InfluencerPayoutStatus } from '../entities';
import { Transform } from 'class-transformer';

export class CalculatePayoutDto {
  @ApiProperty({ description: 'Influencer ID' })
  @IsString()
  influencerId: string;

  @ApiProperty({ description: 'Start date for payout calculation' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date for payout calculation' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Include performance bonuses' })
  @IsOptional()
  @IsBoolean()
  includeBonus?: boolean;
}

export class CreatePayoutDto {
  @ApiProperty({ description: 'Amount in smallest unit (e.g., 10000000000 = 10 TWIST)' })
  @IsString()
  amount: string;

  @ApiProperty({ 
    description: 'Payout method',
    enum: PayoutMethod,
  })
  @IsEnum(PayoutMethod)
  method: PayoutMethod;

  @ApiPropertyOptional({ description: 'Wallet address for crypto payouts' })
  @IsOptional()
  @IsString()
  walletAddress?: string;

  @ApiPropertyOptional({ description: 'Bank details for bank payouts' })
  @IsOptional()
  bankDetails?: Record<string, string>;
}

export class GetPayoutHistoryDto {
  @ApiPropertyOptional({ description: 'Filter by influencer ID' })
  @IsOptional()
  @IsString()
  influencerId?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by status',
    enum: InfluencerPayoutStatus,
  })
  @IsOptional()
  @IsEnum(InfluencerPayoutStatus)
  status?: InfluencerPayoutStatus;

  @ApiPropertyOptional({ description: 'Start date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Number of results to return' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Number of results to skip' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0)
  offset?: number;
}

export class PayoutAnalyticsDto {
  @ApiProperty({ description: 'Start date for analytics' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date for analytics' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ 
    description: 'Group results by period',
    enum: ['day', 'week', 'month'],
  })
  @IsOptional()
  @IsString()
  groupBy?: 'day' | 'week' | 'month';
}

export class PayoutCalculationResponse {
  @ApiProperty()
  influencerId: string;

  @ApiProperty()
  period: {
    start: Date;
    end: Date;
  };

  @ApiProperty()
  earnings: {
    conversions: string;
    stakingRewards: string;
    bonuses: string;
    total: string;
  };

  @ApiProperty()
  deductions: {
    platformFee: string;
    processingFee: string;
    total: string;
  };

  @ApiProperty()
  netAmount: string;

  @ApiProperty()
  items: Array<{
    type: string;
    amount: string;
    description: string;
    referenceId: string;
    createdAt: Date;
  }>;
}

export class BalanceResponse {
  @ApiProperty({ description: 'Available balance in smallest unit' })
  balance: string;

  @ApiProperty({ description: 'Currency' })
  currency: string;

  @ApiProperty({ description: 'Last updated timestamp' })
  lastUpdated: Date;
}