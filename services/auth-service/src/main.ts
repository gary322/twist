/**
 * TWIST Platform - Authentication Service
 * Production-ready authentication with 2FA, OAuth, and WebAuthn
 */

import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';

// Import from plan-3-auth module where the actual implementation exists
import { App } from '../../modules/plan-3-auth/twist-auth/services/auth-service/src/app';
import { AppDataSource } from '../../modules/plan-3-auth/twist-auth/services/auth-service/src/db';
import { ConfigService } from '../../modules/plan-3-auth/twist-auth/services/auth-service/src/config';
import { logger } from '../../modules/plan-3-auth/twist-auth/services/auth-service/src/utils/logger';
import { MetricsService } from '../../modules/plan-3-auth/twist-auth/services/auth-service/src/monitoring/metrics';
import { HealthCheckService } from '../../modules/plan-3-auth/twist-auth/services/auth-service/src/monitoring/health';

// Environment configuration
const config = ConfigService.getInstance();
const PORT = config.get('PORT') || 3001;
const NODE_ENV = config.get('NODE_ENV') || 'production';

// Redis client for caching and rate limiting
const redis = new Redis({
  host: config.get('REDIS_HOST') || 'localhost',
  port: parseInt(config.get('REDIS_PORT') || '6379'),
  password: config.get('REDIS_PASSWORD'),
  db: parseInt(config.get('REDIS_DB') || '0'),
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Rate limiter configuration
const rateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'auth_rl',
  points: 100, // Number of requests
  duration: 900, // Per 15 minutes
  blockDuration: 900, // Block for 15 minutes
});

// Global rate limiter for DDoS protection
const globalRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'auth_global_rl',
  points: 10000, // Global limit
  duration: 60, // Per minute
});

/**
 * Initialize and start the authentication service
 */
async function startServer() {
  try {
    // Initialize database connection
    logger.info('Connecting to database...');
    await AppDataSource.initialize();
    logger.info('Database connected successfully');

    // Test Redis connection
    await redis.ping();
    logger.info('Redis connected successfully');

    // Create Express app with all middleware from plan-3-auth
    const authApp = new App();
    await authApp.initialize();
    const app = authApp.getApp();

    // Add production middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));

    app.use(compression());

    // CORS configuration
    app.use(cors({
      origin: (origin, callback) => {
        const allowedOrigins = config.get('ALLOWED_ORIGINS')?.split(',') || ['https://twist.to'];
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      maxAge: 86400, // 24 hours
    }));

    // Global rate limiting middleware
    app.use(async (req, res, next) => {
      try {
        await globalRateLimiter.consume(req.ip);
        next();
      } catch (rejRes) {
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 60,
        });
      }
    });

    // Per-IP rate limiting middleware
    app.use(async (req, res, next) => {
      try {
        await rateLimiter.consume(req.ip);
        next();
      } catch (rejRes) {
        res.status(429).json({
          error: 'Too many requests from this IP',
          retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 900,
        });
      }
    });

    // Health check endpoints
    app.get('/health', (req, res) => {
      const health = HealthCheckService.getInstance().getHealth();
      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    });

    app.get('/ready', async (req, res) => {
      try {
        // Check database
        await AppDataSource.query('SELECT 1');
        // Check Redis
        await redis.ping();
        res.status(200).json({ status: 'ready' });
      } catch (error) {
        res.status(503).json({ status: 'not ready', error: error.message });
      }
    });

    // Metrics endpoint
    app.get('/metrics', (req, res) => {
      res.set('Content-Type', MetricsService.getInstance().register.contentType);
      res.end(MetricsService.getInstance().register.metrics());
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);
      
      // Don't leak error details in production
      if (NODE_ENV === 'production') {
        res.status(500).json({
          error: 'Internal server error',
          requestId: req.id,
        });
      } else {
        res.status(500).json({
          error: err.message,
          stack: err.stack,
          requestId: req.id,
        });
      }
    });

    // Create HTTP server
    const server = createServer(app);

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      logger.info(`${signal} received, starting graceful shutdown...`);
      
      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Close database connections
      try {
        await AppDataSource.destroy();
        logger.info('Database connections closed');
      } catch (error) {
        logger.error('Error closing database:', error);
      }

      // Close Redis connection
      redis.disconnect();
      logger.info('Redis connection closed');

      // Exit process
      process.exit(0);
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });

    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 TWIST Auth Service running on port ${PORT}`);
      logger.info(`Environment: ${NODE_ENV}`);
      logger.info(`Features enabled:`);
      logger.info(`  - 2FA/TOTP: ✓`);
      logger.info(`  - OAuth: ✓`);
      logger.info(`  - WebAuthn: ✓`);
      logger.info(`  - Rate Limiting: ✓`);
      logger.info(`  - Session Management: ✓`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the service
startServer();