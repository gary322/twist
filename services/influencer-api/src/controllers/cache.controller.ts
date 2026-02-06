import { 
  Controller, 
  Get, 
  Delete, 
  Post, 
  Param, 
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CacheService } from '../services/cache.service';
import { InfluencerCacheService } from '../services/influencer-cache.service';

@ApiTags('cache')
@Controller('cache')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CacheController {
  constructor(
    private cacheService: CacheService,
    private influencerCacheService: InfluencerCacheService,
  ) {}

  @Get('stats')
  @Roles('admin')
  @ApiOperation({ summary: 'Get cache statistics' })
  @ApiResponse({ status: 200, description: 'Cache statistics retrieved' })
  async getStats() {
    const stats = await this.cacheService.getStats();
    const metrics = await this.influencerCacheService.getCacheMetrics();

    return {
      success: true,
      data: {
        stats,
        metrics,
        timestamp: new Date(),
      },
    };
  }

  @Delete('flush')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Flush all cache entries' })
  @ApiResponse({ status: 204, description: 'Cache flushed successfully' })
  async flushCache() {
    await this.cacheService.flush();
  }

  @Delete('pattern/:pattern')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete cache entries by pattern' })
  @ApiResponse({ status: 200, description: 'Cache entries deleted' })
  async deleteByPattern(@Param('pattern') pattern: string) {
    const deleted = await this.cacheService.deletePattern(pattern);

    return {
      success: true,
      data: {
        pattern,
        deleted,
      },
    };
  }

  @Delete('tag/:tag')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete cache entries by tag' })
  @ApiResponse({ status: 200, description: 'Cache entries deleted' })
  async deleteByTag(@Param('tag') tag: string) {
    const deleted = await this.cacheService.deleteByTag(tag);

    return {
      success: true,
      data: {
        tag,
        deleted,
      },
    };
  }

  @Delete('influencer/:id')
  @Roles('admin', 'influencer')
  @ApiOperation({ summary: 'Invalidate influencer cache' })
  @ApiResponse({ status: 204, description: 'Influencer cache invalidated' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async invalidateInfluencer(@Param('id') influencerId: string) {
    await this.influencerCacheService.invalidateInfluencer(influencerId);
  }

  @Delete('user/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Invalidate user cache' })
  @ApiResponse({ status: 204, description: 'User cache invalidated' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async invalidateUser(@Param('id') userId: string) {
    await this.influencerCacheService.invalidateUser(userId);
  }

  @Post('warm')
  @Roles('admin')
  @ApiOperation({ summary: 'Warm cache with critical data' })
  @ApiResponse({ status: 200, description: 'Cache warming initiated' })
  async warmCache() {
    // This would typically call the actual services
    await this.influencerCacheService.warmCaches({});

    return {
      success: true,
      message: 'Cache warming initiated',
    };
  }

  @Get('key/:key')
  @Roles('admin')
  @ApiOperation({ summary: 'Get cache value by key' })
  @ApiResponse({ status: 200, description: 'Cache value retrieved' })
  async getCacheValue(
    @Param('key') key: string,
    @Query('prefix') prefix?: string,
  ) {
    const value = await this.cacheService.get(key, { prefix });
    const ttl = await this.cacheService.ttl(key, prefix);

    return {
      success: true,
      data: {
        key,
        prefix,
        value,
        ttl,
        exists: value !== null,
      },
    };
  }

  @Post('reset-stats')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset cache statistics' })
  @ApiResponse({ status: 204, description: 'Cache statistics reset' })
  async resetStats() {
    await this.cacheService.resetStats();
  }
}