import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Headers,
  Ip,
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { LinkService } from '../services/link.service';
import { AuthGuard } from '../guards/auth.guard';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { CreateLinkDto, UpdateLinkDto, BulkCreateLinksDto } from '../dto/link.dto';

@ApiTags('links')
@Controller('links')
@UseGuards(RateLimitGuard)
export class LinkController {
  constructor(private readonly linkService: LinkService) {}

  @Post('generate')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a new referral link' })
  @ApiResponse({ status: 201, description: 'Link created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or tier limit reached' })
  async generateLink(
    @Request() req,
    @Body() dto: CreateLinkDto,
  ) {
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    return await this.linkService.createLink({
      influencerId: req.user.influencerId || dto.influencerId,
      productId: dto.productId,
      promoCode: dto.promoCode,
      customUrl: dto.customUrl,
      expiresAt,
      metadata: dto.metadata,
    });
  }

  @Post('bulk-generate')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate multiple referral links at once' })
  @ApiResponse({ status: 201, description: 'Links created successfully' })
  async bulkGenerateLinks(
    @Request() req,
    @Body() dto: BulkCreateLinksDto,
  ) {
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    return await this.linkService.generateBulkLinks({
      influencerId: req.user.influencerId || dto.influencerId,
      productIds: dto.productIds,
      promoCode: dto.promoCode,
      expiresAt,
    });
  }

  @Get('influencer/:influencerId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all links for an influencer' })
  @ApiParam({ name: 'influencerId', description: 'Influencer ID' })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getInfluencerLinks(
    @Param('influencerId') influencerId: string,
    @Query('productId') productId?: string,
    @Query('isActive') isActive?: boolean,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return await this.linkService.getInfluencerLinks(influencerId, {
      productId,
      isActive,
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    });
  }

  @Get(':linkId/analytics')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get analytics for a specific link' })
  @ApiParam({ name: 'linkId', description: 'Link ID' })
  @ApiQuery({ name: 'startDate', required: true, type: Date })
  @ApiQuery({ name: 'endDate', required: true, type: Date })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['hour', 'day', 'week', 'month'] })
  async getLinkAnalytics(
    @Param('linkId') linkId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('groupBy') groupBy: 'hour' | 'day' | 'week' | 'month' = 'day',
  ) {
    return await this.linkService.getLinkAnalytics(linkId, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      groupBy,
    });
  }

  @Get('track/:linkCode')
  @ApiOperation({ summary: 'Track link click and redirect' })
  @ApiParam({ name: 'linkCode', description: 'Link code to track' })
  @ApiResponse({ status: 302, description: 'Redirect to product page' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  async trackClick(
    @Param('linkCode') linkCode: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('referer') referrer?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ) {
    const result = await this.linkService.trackClick(linkCode, {
      ip: forwardedFor?.split(',')[0] || ip,
      userAgent,
      referrer,
    });

    // In a real controller, we would use @Redirect() decorator
    // For now, return the redirect URL
    return {
      statusCode: 302,
      redirectUrl: result.redirectUrl,
    };
  }

  @Delete(':linkId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a link' })
  @ApiParam({ name: 'linkId', description: 'Link ID to deactivate' })
  @ApiResponse({ status: 204, description: 'Link deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  async deactivateLink(
    @Request() req,
    @Param('linkId') linkId: string,
  ) {
    await this.linkService.deactivateLink(linkId);
  }

  @Get(':linkId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get link details' })
  @ApiParam({ name: 'linkId', description: 'Link ID' })
  async getLinkDetails(@Param('linkId') linkId: string) {
    return await this.linkService.getLinkById(linkId);
  }

  @Put(':linkId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update link details' })
  @ApiParam({ name: 'linkId', description: 'Link ID' })
  @ApiResponse({ status: 200, description: 'Link updated successfully' })
  async updateLink(
    @Param('linkId') linkId: string,
    @Body() dto: UpdateLinkDto,
  ) {
    return await this.linkService.updateLink(linkId, dto);
  }

  @Get('influencer/:influencerId/top-performing')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get top performing links for an influencer' })
  @ApiParam({ name: 'influencerId', description: 'Influencer ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTopPerformingLinks(
    @Param('influencerId') influencerId: string,
    @Query('limit') limit: number = 10,
  ) {
    return await this.linkService.getTopPerformingLinks(influencerId, Number(limit));
  }

  @Get(':linkId/metrics')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get real-time metrics for a link' })
  @ApiParam({ name: 'linkId', description: 'Link ID' })
  async getLinkMetrics(@Param('linkId') linkId: string) {
    return await this.linkService.getLinkMetrics(linkId);
  }
}