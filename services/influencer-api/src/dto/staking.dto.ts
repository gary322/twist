import { IsString, IsNumber, IsOptional, IsArray, IsEnum, Min, IsNotEmpty, Matches } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SortBy {
  TOTAL_STAKED = 'totalStaked',
  STAKER_COUNT = 'stakerCount',
  APY = 'apy',
  TIER = 'tier',
}

export class SearchInfluencersDto {
  @ApiPropertyOptional({ description: 'Search query for influencer name or bio' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ 
    enum: SortBy, 
    default: SortBy.TOTAL_STAKED,
    description: 'Sort criteria for results' 
  })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.TOTAL_STAKED;

  @ApiPropertyOptional({ description: 'Minimum staked amount in TWIST' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStaked?: number;

  @ApiPropertyOptional({ description: 'Minimum APY percentage' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minApy?: number;

  @ApiPropertyOptional({ 
    type: [String], 
    description: 'Filter by tiers',
    example: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(t => t.trim());
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  tiers?: string[];

  @ApiPropertyOptional({ default: 20, description: 'Number of results to return' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 0, description: 'Offset for pagination' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;
}

export class StakeOnInfluencerDto {
  @ApiProperty({ description: 'Influencer ID to stake on' })
  @IsNotEmpty()
  @IsString()
  influencerId: string;

  @ApiProperty({ description: 'Amount to stake in smallest unit (1 TWIST = 10^9)', example: '1000000000' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[0-9]+$/, { message: 'Amount must be a valid positive integer string' })
  amount: string;

  @ApiProperty({ description: 'Wallet address for the transaction' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, { message: 'Invalid Solana wallet address' })
  walletAddress: string;
}

export class UnstakeDto {
  @ApiProperty({ description: 'Influencer ID to unstake from' })
  @IsNotEmpty()
  @IsString()
  influencerId: string;

  @ApiProperty({ description: 'Amount to unstake in smallest unit', example: '1000000000' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[0-9]+$/, { message: 'Amount must be a valid positive integer string' })
  amount: string;

  @ApiProperty({ description: 'Wallet address for the transaction' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, { message: 'Invalid Solana wallet address' })
  walletAddress: string;
}

export class ClaimRewardsDto {
  @ApiProperty({ description: 'Influencer ID to claim rewards from' })
  @IsNotEmpty()
  @IsString()
  influencerId: string;

  @ApiProperty({ description: 'Wallet address for receiving rewards' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, { message: 'Invalid Solana wallet address' })
  walletAddress: string;
}

export class StakingResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  transactionId: string;

  @ApiProperty({ required: false })
  poolAddress?: string;

  @ApiProperty({ required: false })
  newTotalStaked?: string;

  @ApiProperty({ required: false })
  estimatedApy?: number;

  @ApiProperty({ required: false })
  remainingStake?: string;

  @ApiProperty({ required: false })
  claimedAmount?: string;

  @ApiProperty({ required: false })
  totalClaimed?: string;
}

export class InfluencerStakingDetailsDto {
  @ApiProperty()
  influencer: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
    tier: string;
    bio?: string;
    verified: boolean;
  };

  @ApiProperty()
  pool: {
    address: string;
    totalStaked: string;
    stakerCount: number;
    revenueSharePercent: number;
    minStake: string;
    createdAt: Date;
  };

  @ApiProperty()
  metrics: {
    totalStaked: string;
    stakerCount: number;
    totalRewardsDistributed: string;
    pendingRewards: string;
    apy: number;
    lastRewardDistribution: Date | null;
  };

  @ApiProperty()
  topStakers: Array<{
    rank: number;
    userId: string;
    amount: string;
    percentage: string;
  }>;

  @ApiProperty()
  recentActivity: Array<{
    userId: string;
    action: string;
    amount: string;
    transactionId: string;
    createdAt: Date;
  }>;

  @ApiProperty()
  historicalApy: Array<{
    date: Date;
    apy: number;
    totalStaked: string;
    rewardsDistributed: string;
    distributionCount: number;
  }>;
}

export class UserStakeDto {
  @ApiProperty()
  influencer: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
    tier: string;
  };

  @ApiProperty()
  stake: {
    amount: string;
    stakedAt: Date;
    pendingRewards: string;
    totalClaimed: string;
    apy: number;
  };

  @ApiProperty()
  pool: {
    totalStaked: string;
    stakerCount: number;
    revenueSharePercent: number;
  };
}