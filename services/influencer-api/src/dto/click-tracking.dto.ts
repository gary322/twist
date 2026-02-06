import { IsString, IsOptional, IsIP, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackClickDto {
  @ApiProperty({ description: 'Link code to track' })
  @IsString()
  @IsNotEmpty()
  linkCode: string;

  @ApiProperty({ description: 'IP address of the clicker' })
  @IsIP()
  ipAddress: string;

  @ApiProperty({ description: 'User agent string' })
  @IsString()
  @IsNotEmpty()
  userAgent: string;

  @ApiPropertyOptional({ description: 'Referrer URL' })
  @IsOptional()
  @IsString()
  referrer?: string;

  @ApiPropertyOptional({ description: 'Country code' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Device type' })
  @IsOptional()
  @IsString()
  device?: string;

  @ApiPropertyOptional({ description: 'Session ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Browser fingerprint' })
  @IsOptional()
  @IsString()
  fingerprint?: string;
}

export class TrackConversionDto extends TrackClickDto {
  @ApiProperty({ description: 'Order ID for conversion tracking' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({ description: 'Order amount in smallest currency unit' })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({ description: 'Product ID' })
  @IsString()
  @IsNotEmpty()
  productId: string;
}

export class GetAnalyticsDto {
  @ApiPropertyOptional({ description: 'Start date for analytics' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for analytics' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Group by period' })
  @IsOptional()
  @IsString()
  groupBy?: 'hour' | 'day' | 'week' | 'month';
}