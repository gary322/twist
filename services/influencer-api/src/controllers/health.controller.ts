import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Connection } from 'typeorm';
import { Redis } from 'ioredis';

@Controller()
export class HealthController {
  constructor(
    @InjectConnection() private connection: Connection,
    @InjectRedis() private redis: Redis,
  ) {}

  @Get('health')
  async health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    try {
      // Check database connection
      await this.connection.query('SELECT 1');
      
      // Check Redis connection
      await this.redis.ping();
      
      return { 
        status: 'ready', 
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          redis: 'connected',
        }
      };
    } catch (error) {
      throw new Error('Service not ready');
    }
  }
}