import { 
  Controller, 
  Post, 
  Get, 
  Put,
  Body, 
  Param,
  Query,
  BadRequestException,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InfluencerService } from '../services/influencer.service';
import { EmailVerificationService } from '../services/email-verification.service';
import { 
  RegisterInfluencerDto, 
  VerifyEmailDto, 
  UpdateInfluencerProfileDto, 
  ConnectWalletDto,
  InfluencerResponseDto 
} from '../dto/influencer.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RateLimitGuard } from '../guards/rate-limit.guard';

@ApiTags('Influencers')
@Controller('influencers')
@UseInterceptors(ClassSerializerInterceptor)
export class InfluencerController {
  constructor(
    private readonly influencerService: InfluencerService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Register a new influencer' })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Username or email already exists' })
  async register(@Body() dto: RegisterInfluencerDto) {
    return this.influencerService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const influencer = await this.emailVerificationService.verifyEmail(dto.token);
    return {
      success: true,
      message: 'Email verified successfully',
      username: influencer.username,
    };
  }

  @Post('resend-verification')
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiResponse({ status: 200, description: 'Verification email sent' })
  @ApiResponse({ status: 400, description: 'Email already verified or not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async resendVerification(@Body('email') email: string) {
    await this.emailVerificationService.resendVerificationEmail(email);
    return {
      success: true,
      message: 'Verification email sent',
    };
  }

  @Get('check-availability')
  @ApiOperation({ summary: 'Check username and email availability' })
  @ApiResponse({ status: 200, description: 'Availability status' })
  async checkAvailability(
    @Query('username') username?: string,
    @Query('email') email?: string,
  ) {
    const result: any = {};

    if (username) {
      result.usernameAvailable = await this.emailVerificationService.checkUsernameAvailable(username);
    }

    if (email) {
      result.emailAvailable = await this.emailVerificationService.checkEmailAvailable(email);
    }

    return result;
  }

  @Get(':username')
  async getByUsername(@Param('username') username: string) {
    const influencer = await this.influencerService.findByUsername(username);
    if (!influencer) {
      throw new BadRequestException('Influencer not found');
    }
    return influencer;
  }

  @Put(':influencerId/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update influencer profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Email not verified' })
  async updateProfile(
    @Param('influencerId') influencerId: string,
    @Body() dto: UpdateInfluencerProfileDto,
    @Request() req: any,
  ) {
    // Ensure user can only update their own profile
    if (req.user.influencerId !== influencerId) {
      throw new BadRequestException('You can only update your own profile');
    }

    return this.influencerService.updateProfile(influencerId, dto);
  }

  @Post(':influencerId/connect-wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connect Solana wallet to influencer account' })
  @ApiResponse({ status: 200, description: 'Wallet connected successfully' })
  @ApiResponse({ status: 400, description: 'Invalid wallet or signature' })
  @ApiResponse({ status: 409, description: 'Wallet already connected to another account' })
  async connectWallet(
    @Param('influencerId') influencerId: string,
    @Body() dto: ConnectWalletDto,
    @Request() req: any,
  ) {
    if (req.user.influencerId !== influencerId) {
      throw new BadRequestException('You can only connect wallet to your own account');
    }

    return this.influencerService.connectWallet(
      influencerId,
      dto.walletAddress,
      dto.signature,
      dto.message,
    );
  }

  @Get(':influencerId/dashboard-stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get influencer dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard stats', type: Object })
  async getDashboardStats(
    @Param('influencerId') influencerId: string,
    @Request() req: any,
  ) {
    if (req.user.influencerId !== influencerId) {
      throw new BadRequestException('You can only view your own dashboard');
    }

    
    return {
      totalEarned: '0',
      totalStaked: '0',
      stakerCount: 0,
      clickCount: 0,
      conversionCount: 0,
      conversionRate: 0,
      currentTier: 'BRONZE',
      nextTierProgress: 0,
    };
  }
}
