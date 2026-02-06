import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (typeof ttlSeconds === 'number') {
      await this.redis.set(key, value, 'EX', ttlSeconds);
      return;
    }

    await this.redis.set(key, value);
  }

  incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  expire(key: string, ttlSeconds: number): Promise<number> {
    return this.redis.expire(key, ttlSeconds);
  }

  smembers(key: string): Promise<string[]> {
    return this.redis.smembers(key);
  }

  lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.redis.lrange(key, start, stop);
  }

  lpush(key: string, value: string): Promise<number> {
    return this.redis.lpush(key, value);
  }

  ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    return this.redis.ltrim(key, start, stop);
  }
}

