import { IsString, IsOptional, IsNumber, IsArray, IsBoolean, IsDate, IsObject, Min, IsNotEmpty } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLinkDto {
  @ApiPropertyOptional({ description: 'Influencer ID (if not using auth token)' })
  @IsOptional()
  @IsString()
  influencerId?: string;

  @ApiProperty({ description: 'Product ID to link to' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiPropertyOptional({ description: 'Promo code to apply' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiPropertyOptional({ description: 'Custom URL for the link' })
  @IsOptional()
  @IsString()
  customUrl?: string;

  @ApiPropertyOptional({ description: 'Number of days until link expires' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  expiresInDays?: number;

  @ApiPropertyOptional({ description: 'Additional metadata for the link' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class BulkCreateLinksDto {
  @ApiPropertyOptional({ description: 'Influencer ID (if not using auth token)' })
  @IsOptional()
  @IsString()
  influencerId?: string;

  @ApiProperty({ description: 'Array of product IDs to create links for', type: [String] })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  productIds: string[];

  @ApiPropertyOptional({ description: 'Promo code to apply to all links' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiPropertyOptional({ description: 'Number of days until links expire' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  expiresInDays?: number;
}

export class UpdateLinkDto {
  @ApiPropertyOptional({ description: 'Updated promo code' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiPropertyOptional({ description: 'Updated custom URL' })
  @IsOptional()
  @IsString()
  customUrl?: string;

  @ApiPropertyOptional({ description: 'Whether the link is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Updated expiration date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;

  @ApiPropertyOptional({ description: 'Updated metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class LinkResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  influencerId: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  linkCode: string;

  @ApiProperty({ required: false })
  promoCode?: string;

  @ApiProperty()
  customUrl: string;

  @ApiProperty()
  qrCodeUrl: string;

  @ApiProperty()
  clicks: number;

  @ApiProperty()
  conversions: number;

  @ApiProperty()
  earned: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ required: false })
  expiresAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ required: false })
  metrics?: {
    clicks: number;
    conversions: number;
    earned: string;
    conversionRate: number;
    lastClickedAt?: Date;
  };
}

export class LinkAnalyticsDto {
  @ApiProperty()
  linkId: string;

  @ApiProperty()
  period: {
    start: Date;
    end: Date;
  };

  @ApiProperty()
  summary: {
    totalClicks: number;
    uniqueClicks: number;
    conversions: number;
    revenue: string;
    conversionRate: number;
  };

  @ApiProperty()
  timeSeries: Array<{
    date: Date;
    clicks: number;
    conversions: number;
    revenue: string;
  }>;

  @ApiProperty()
  topCountries: Array<{
    country: string;
    clicks: number;
    conversions: number;
  }>;

  @ApiProperty()
  topDevices: Array<{
    device: string;
    clicks: number;
    conversions: number;
  }>;

  @ApiProperty()
  topReferrers: Array<{
    referrer: string;
    clicks: number;
    conversions: number;
  }>;
}

export class TrackClickDto {
  @ApiProperty()
  ip: string;

  @ApiProperty()
  userAgent: string;

  @ApiPropertyOptional()
  referrer?: string;

  @ApiPropertyOptional()
  country?: string;

  @ApiPropertyOptional()
  device?: string;
}