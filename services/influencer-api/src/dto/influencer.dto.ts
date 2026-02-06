import { IsEmail, IsString, IsOptional, Length, Matches, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterInfluencerDto {
  @ApiProperty({ description: 'Unique username for the influencer' })
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens',
  })
  username: string;

  @ApiProperty({ description: 'Email address for the influencer' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiPropertyOptional({ description: 'Solana wallet address' })
  @IsOptional()
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, {
    message: 'Invalid Solana wallet address format',
  })
  walletAddress?: string;

  @ApiPropertyOptional({ description: 'Display name for the influencer' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Bio or description' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;

  @ApiPropertyOptional({ description: 'Accept terms and conditions' })
  @IsBoolean()
  acceptTerms: boolean;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Email verification token' })
  @IsString()
  token: string;
}

export class UpdateInfluencerProfileDto {
  @ApiPropertyOptional({ description: 'Display name' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Bio or description' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ description: 'Cover image URL' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ description: 'Categories of content' })
  @IsOptional()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ description: 'Social media links' })
  @IsOptional()
  socialLinks?: {
    twitter?: string;
    instagram?: string;
    youtube?: string;
    tiktok?: string;
    website?: string;
  };
}

export class ConnectWalletDto {
  @ApiProperty({ description: 'Solana wallet address' })
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, {
    message: 'Invalid Solana wallet address format',
  })
  walletAddress: string;

  @ApiProperty({ description: 'Message signed by the wallet' })
  @IsString()
  signature: string;

  @ApiProperty({ description: 'Message that was signed' })
  @IsString()
  message: string;
}

export class InfluencerResponseDto {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  walletAddress?: string;
  tier: string;
  verified: boolean;
  totalConversions: number;
  totalEarned: string;
  createdAt: Date;
  profile?: {
    displayName?: string;
    bio?: string;
    avatar?: string;
    coverImage?: string;
    categories?: string[];
    socialLinks?: any;
  };
  stakingPool?: {
    poolAddress: string;
    totalStaked: string;
    stakerCount: number;
    revenueSharePercent: number;
    apy: number;
  };
}