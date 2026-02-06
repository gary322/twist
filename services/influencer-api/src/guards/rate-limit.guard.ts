import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { Observable } from 'rxjs';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windowMs = 60 * 1000; // 1 minute
  private readonly maxRequests = 10; // 10 requests per minute

  constructor(@InjectRedis() private redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection.remoteAddress;
    const endpoint = request.route.path;
    
    const key = `ratelimit:${endpoint}:${ip}`;
    
    // Get current count
    const current = await this.redis.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= this.maxRequests) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests',
          error: 'Rate limit exceeded',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment counter
    const pipeline = this.redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, Math.ceil(this.windowMs / 1000));
    await pipeline.exec();

    // Set rate limit headers
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', this.maxRequests);
    response.setHeader('X-RateLimit-Remaining', this.maxRequests - count - 1);
    response.setHeader('X-RateLimit-Reset', new Date(Date.now() + this.windowMs).toISOString());

    return true;
  }
}