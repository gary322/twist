import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../services/redis.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attribution } from '../entities/attribution.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FraudDetectionGuard implements CanActivate {
  private readonly logger = new Logger(FraudDetectionGuard.name);
  
  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
    @InjectRepository(Attribution)
    private attributionRepository: Repository<Attribution>,
    private httpService: HttpService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { ip, headers, body } = request;
    const userId = body.userId || request.user?.id;

    // Run multiple fraud checks in parallel
    const fraudChecks = await Promise.all([
      this.checkIPReputation(ip),
      this.checkUserVelocity(userId),
      this.checkDeviceFingerprint(headers),
      this.checkBehaviorPatterns(userId, body),
      this.checkGeolocationAnomaly(ip, userId),
    ]);

    const fraudScore = this.calculateFraudScore(fraudChecks);
    
    // Log suspicious activity
    if (fraudScore > 0.5) {
      await this.logSuspiciousActivity(request, fraudScore);
    }

    // Block if fraud score is too high
    if (fraudScore > 0.8) {
      this.logger.warn(`Blocked request from ${ip} with fraud score ${fraudScore}`);
      return false;
    }

    return true;
  }

  private async checkIPReputation(ip: string): Promise<FraudCheck> {
    try {
      // Check local blacklist
      const isBlacklisted = await this.redisService.get(`blacklist:ip:${ip}`);
      if (isBlacklisted) {
        return { name: 'ip_blacklist', score: 1.0, reason: 'IP is blacklisted' };
      }

      // Check IP reputation service
      const ipReputation = await this.getIPReputation(ip);
      
      if (ipReputation.isVPN || ipReputation.isProxy) {
        return { name: 'ip_reputation', score: 0.7, reason: 'VPN/Proxy detected' };
      }

      if (ipReputation.threatScore > 75) {
        return { name: 'ip_reputation', score: 0.9, reason: 'High threat IP' };
      }

      return { name: 'ip_reputation', score: 0, reason: 'Clean IP' };
    } catch (error) {
      this.logger.error(`IP reputation check failed: ${error.message}`);
      return { name: 'ip_reputation', score: 0, reason: 'Check failed' };
    }
  }

  private async getIPReputation(ip: string): Promise<any> {
    try {
      const apiKey = this.configService.get<string>('IP_QUALITY_SCORE_API_KEY');
      const response = await firstValueFrom(
        this.httpService.get(`https://ipqualityscore.com/api/json/ip/${apiKey}/${ip}`)
      );

      return {
        isVPN: response.data.vpn,
        isProxy: response.data.proxy,
        threatScore: response.data.fraud_score,
        country: response.data.country_code,
      };
    } catch (error) {
      // Fallback to basic checks
      return {
        isVPN: false,
        isProxy: false,
        threatScore: 0,
        country: 'US',
      };
    }
  }

  private async checkUserVelocity(userId: string): Promise<FraudCheck> {
    if (!userId) return { name: 'velocity', score: 0, reason: 'No user ID' };

    const velocityKey = `velocity:${userId}`;
    const currentCount = await this.redisService.incr(velocityKey);
    
    // Set expiry on first increment
    if (currentCount === 1) {
      await this.redisService.expire(velocityKey, 3600); // 1 hour
    }

    // Check velocity limits
    if (currentCount > 100) {
      return { name: 'velocity', score: 1.0, reason: 'Excessive requests' };
    } else if (currentCount > 50) {
      return { name: 'velocity', score: 0.5, reason: 'High request rate' };
    }

    return { name: 'velocity', score: 0, reason: 'Normal velocity' };
  }

  private async checkDeviceFingerprint(headers: any): Promise<FraudCheck> {
    const fingerprint = this.generateFingerprint(headers);
    const fpKey = `fingerprint:${fingerprint}`;
    
    // Check if fingerprint has been seen with multiple users
    const users = await this.redisService.smembers(`${fpKey}:users`);
    
    if (users.length > 5) {
      return { name: 'fingerprint', score: 0.8, reason: 'Fingerprint used by multiple users' };
    }

    // Check if fingerprint is associated with banned activity
    const isBanned = await this.redisService.get(`${fpKey}:banned`);
    if (isBanned) {
      return { name: 'fingerprint', score: 1.0, reason: 'Banned device fingerprint' };
    }

    return { name: 'fingerprint', score: 0, reason: 'Clean fingerprint' };
  }

  private generateFingerprint(headers: any): string {
    const components = [
      headers['user-agent'] || '',
      headers['accept-language'] || '',
      headers['accept-encoding'] || '',
      headers['accept'] || '',
    ];

    return require('crypto')
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  private async checkBehaviorPatterns(userId: string, data: any): Promise<FraudCheck> {
    if (!userId) return { name: 'behavior', score: 0, reason: 'No user ID' };

    // Get user's recent activity
    const recentActivity = await this.getUserTransactionHistory(userId);
    
    // Check for suspicious patterns
    const patterns = [
      this.checkRepetitiveActions(recentActivity),
      this.checkTimingAnomalies(recentActivity),
      this.checkAmountPatterns(recentActivity),
    ];

    const maxScore = Math.max(...patterns);
    
    if (maxScore > 0.7) {
      return { name: 'behavior', score: maxScore, reason: 'Suspicious behavior pattern' };
    }

    return { name: 'behavior', score: 0, reason: 'Normal behavior' };
  }

  private async getUserTransactionHistory(userId: string): Promise<Attribution[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.attributionRepository.find({
      where: {
        userId,
        createdAt: { $gte: thirtyDaysAgo } as any,
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  private checkRepetitiveActions(activities: Attribution[]): number {
    if (activities.length < 10) return 0;

    // Check for repetitive patterns
    const actionCounts = activities.reduce((acc, activity) => {
      const key = `${activity.type}:${activity.campaignId}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxRepetitions = Math.max(...Object.values(actionCounts));
    return maxRepetitions > 20 ? 0.8 : 0;
  }

  private checkTimingAnomalies(activities: Attribution[]): number {
    if (activities.length < 2) return 0;

    // Check for inhuman timing patterns
    const timeDiffs = [];
    for (let i = 1; i < activities.length; i++) {
      const diff = activities[i-1].createdAt.getTime() - activities[i].createdAt.getTime();
      timeDiffs.push(diff);
    }

    // Check if actions are too regular (bot-like)
    const avgDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    const variance = timeDiffs.reduce((sum, diff) => sum + Math.pow(diff - avgDiff, 2), 0) / timeDiffs.length;
    
    if (variance < 1000) { // Very regular timing
      return 0.7;
    }

    return 0;
  }

  private checkAmountPatterns(activities: Attribution[]): number {
    const amounts = activities
      .filter(a => a.earnings > 0)
      .map(a => a.earnings);

    if (amounts.length < 5) return 0;

    // Check for suspicious amount patterns
    const uniqueAmounts = new Set(amounts);
    
    if (uniqueAmounts.size === 1) { // All same amount
      return 0.6;
    }

    return 0;
  }

  private async checkGeolocationAnomaly(ip: string, userId: string): Promise<FraudCheck> {
    if (!userId) return { name: 'geolocation', score: 0, reason: 'No user ID' };

    try {
      // Get current location from IP
      const currentLocation = await this.getLocationFromIP(ip);
      
      // Get user's location history
      const locationKey = `locations:${userId}`;
      const recentLocations = await this.redisService.lrange(locationKey, 0, 10);
      
      // Add current location
      await this.redisService.lpush(locationKey, JSON.stringify({
        country: currentLocation.country,
        city: currentLocation.city,
        timestamp: Date.now(),
      }));
      await this.redisService.expire(locationKey, 30 * 24 * 3600); // 30 days

      // Check for impossible travel
      for (const locStr of recentLocations) {
        const loc = JSON.parse(locStr);
        const timeDiff = Date.now() - loc.timestamp;
        
        if (timeDiff < 3600000 && loc.country !== currentLocation.country) { // 1 hour
          return { name: 'geolocation', score: 0.9, reason: 'Impossible travel detected' };
        }
      }

      return { name: 'geolocation', score: 0, reason: 'Normal location' };
    } catch (error) {
      this.logger.error(`Geolocation check failed: ${error.message}`);
      return { name: 'geolocation', score: 0, reason: 'Check failed' };
    }
  }

  private async getLocationFromIP(ip: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`https://ipapi.co/${ip}/json/`)
      );

      return {
        country: response.data.country_code,
        city: response.data.city,
        region: response.data.region,
      };
    } catch (error) {
      return { country: 'US', city: 'Unknown', region: 'Unknown' };
    }
  }

  private calculateFraudScore(checks: FraudCheck[]): number {
    const weights = {
      ip_blacklist: 1.0,
      ip_reputation: 0.8,
      velocity: 0.7,
      fingerprint: 0.9,
      behavior: 0.6,
      geolocation: 0.8,
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const check of checks) {
      const weight = weights[check.name] || 0.5;
      totalScore += check.score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private async logSuspiciousActivity(request: any, fraudScore: number) {
    const log = {
      timestamp: new Date().toISOString(),
      ip: request.ip,
      userId: request.body.userId || request.user?.id,
      endpoint: request.url,
      method: request.method,
      fraudScore,
      headers: request.headers,
      body: request.body,
    };

    await this.redisService.lpush('fraud:suspicious', JSON.stringify(log));
    await this.redisService.ltrim('fraud:suspicious', 0, 999); // Keep last 1000
    
    this.logger.warn(`Suspicious activity detected: ${JSON.stringify(log)}`);
  }
}

interface FraudCheck {
  name: string;
  score: number;
  reason: string;
}
