import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Query, 
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Ip,
  Headers,
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ClickTrackingService } from '../services/click-tracking.service';
import { 
  TrackClickDto, 
  TrackConversionDto, 
  GetAnalyticsDto 
} from '../dto/click-tracking.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../guards/optional-auth.guard';

@ApiTags('click-tracking')
@Controller('click-tracking')
export class ClickTrackingController {
  constructor(
    private readonly clickTrackingService: ClickTrackingService,
  ) {}

  @Post('track')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track a link click' })
  @ApiResponse({ status: 204, description: 'Click tracked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async trackClick(
    @Body() dto: TrackClickDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('referer') referer?: string,
  ) {
    // Override with actual request data
    const clickData = {
      ...dto,
      ipAddress: ip || dto.ipAddress,
      userAgent: userAgent || dto.userAgent,
      referrer: referer || dto.referrer,
      timestamp: Date.now(),
    };

    try {
      await this.clickTrackingService.trackClick(clickData);
    } catch (error: any) {
      if (error.message === 'Rate limit exceeded') {
        throw new Error('Too many requests');
      }
      throw error;
    }
  }

  @Post('conversion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track a conversion' })
  @ApiResponse({ status: 204, description: 'Conversion tracked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async trackConversion(
    @Body() dto: TrackConversionDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const conversionData = {
      ...dto,
      ipAddress: ip || dto.ipAddress,
      userAgent: userAgent || dto.userAgent,
      amount: BigInt(dto.amount),
      timestamp: Date.now(),
    };

    await this.clickTrackingService.trackConversion(conversionData);
  }

  @Get('analytics/:linkCode')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Get real-time analytics for a link' })
  @ApiParam({ name: 'linkCode', description: 'The link code to get analytics for' })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  async getRealTimeAnalytics(
    @Param('linkCode') linkCode: string,
  ) {
    return this.clickTrackingService.getRealTimeAnalytics(linkCode);
  }

  @Get('analytics/:linkCode/period')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get analytics for a specific period' })
  @ApiParam({ name: 'linkCode', description: 'The link code to get analytics for' })
  @ApiResponse({ status: 200, description: 'Period analytics retrieved successfully' })
  async getAnalyticsByPeriod(
    @Param('linkCode') linkCode: string,
    @Query() query: GetAnalyticsDto,
  ) {
    const startDate = query.startDate 
      ? new Date(query.startDate) 
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    const endDate = query.endDate 
      ? new Date(query.endDate) 
      : new Date();

    return this.clickTrackingService.getAnalyticsByPeriod(
      linkCode,
      startDate,
      endDate,
    );
  }

  @Get('stream/:linkCode')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get click stream for a link' })
  @ApiParam({ name: 'linkCode', description: 'The link code to get click stream for' })
  @ApiResponse({ status: 200, description: 'Click stream retrieved successfully' })
  async getClickStream(
    @Param('linkCode') linkCode: string,
    @Query('limit') limit?: number,
  ) {
    return this.clickTrackingService.getClickStream(
      linkCode,
      limit ? parseInt(limit.toString()) : 100,
    );
  }

  @Get('top-performing/:influencerId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get top performing links for an influencer' })
  @ApiParam({ name: 'influencerId', description: 'The influencer ID' })
  @ApiResponse({ status: 200, description: 'Top performing links retrieved successfully' })
  async getTopPerformingLinks(
    @Param('influencerId') influencerId: string,
    @Query('limit') limit?: number,
  ) {
    return this.clickTrackingService.getTopPerformingLinks(
      influencerId,
      limit ? parseInt(limit.toString()) : 10,
    );
  }

  @Post('clear-cache/:linkCode')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear analytics cache for a link' })
  @ApiParam({ name: 'linkCode', description: 'The link code to clear cache for' })
  @ApiResponse({ status: 204, description: 'Cache cleared successfully' })
  async clearAnalyticsCache(
    @Param('linkCode') linkCode: string,
  ) {
    await this.clickTrackingService.clearAnalyticsCache(linkCode);
  }
}