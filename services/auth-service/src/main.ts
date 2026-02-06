import dotenv from 'dotenv';
dotenv.config();

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import expressWinston from 'express-winston';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';

import { loadConfig } from './config';
import { createLogger } from './logger';
import { connectRedis } from './redis';
import { createMetrics, httpMetricsMiddleware } from './metrics';
import { createMemoryNonceStore, createRedisNonceStore, type NonceStore } from './nonce-store';
import { createAuthRouter } from './routes/auth';
import { createHealthRouter } from './routes/health';

function msBeforeNextFromRateLimitError(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const maybe = err as { msBeforeNext?: unknown };
  if (typeof maybe.msBeforeNext === 'number' && Number.isFinite(maybe.msBeforeNext)) {
    return maybe.msBeforeNext;
  }
  return null;
}

async function bootstrap() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  let nonceStore: NonceStore = createMemoryNonceStore();
  let redisClient: Awaited<ReturnType<typeof connectRedis>> | null = null;

  if (config.redisUrl) {
    try {
      redisClient = await connectRedis(config.redisUrl);
      nonceStore = createRedisNonceStore(redisClient);
      logger.info('redis.connected', { redisBackedNonces: true });
    } catch (err) {
      logger.error('redis.connect_failed', { error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    logger.warn('redis.disabled', { reason: 'REDIS_URL not set', redisBackedNonces: false });
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // Basic request id.
  app.use((req, res, next) => {
    const existing = req.header('x-request-id');
    const id = existing && existing.length > 0 ? existing : cryptoRandomId();
    (req as any).id = id;
    res.setHeader('x-request-id', id);
    next();
  });

  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));

  const allowedOrigins = config.allowedOrigins;
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow server-to-server requests without an Origin header.
        if (!origin) return callback(null, true);

        if (allowedOrigins.length === 0) return callback(new Error('CORS origin not allowed'));
        if (allowedOrigins.includes(origin)) return callback(null, true);

        return callback(new Error('CORS origin not allowed'));
      },
      credentials: true,
      maxAge: 86400,
    }),
  );

  const metrics = createMetrics();
  app.use(httpMetricsMiddleware(metrics));

  app.use(
    expressWinston.logger({
      winstonInstance: logger,
      meta: true,
      msg: 'http.request',
      expressFormat: false,
      colorize: false,
      requestWhitelist: ['method', 'url', 'headers', 'ip'],
      responseWhitelist: ['statusCode'],
      requestFilter: (req, propName) => {
        if (propName === 'headers') {
          const headers = { ...(req.headers || {}) } as Record<string, unknown>;
          delete headers.authorization;
          delete headers.cookie;
          delete headers['set-cookie'];
          return headers;
        }
        return (req as any)[propName];
      },
    }),
  );

  // Rate limiting: global and per-IP.
  const globalLimiter = redisClient
    ? new RateLimiterRedis({
        storeClient: redisClient as any,
        keyPrefix: 'auth_global_rl',
        points: config.rateLimit.globalPoints,
        duration: config.rateLimit.globalDurationSeconds,
      })
    : new RateLimiterMemory({
        keyPrefix: 'auth_global_rl',
        points: config.rateLimit.globalPoints,
        duration: config.rateLimit.globalDurationSeconds,
      });

  const ipLimiter = redisClient
    ? new RateLimiterRedis({
        storeClient: redisClient as any,
        keyPrefix: 'auth_ip_rl',
        points: config.rateLimit.ipPoints,
        duration: config.rateLimit.ipDurationSeconds,
        blockDuration: config.rateLimit.ipBlockDurationSeconds,
      })
    : new RateLimiterMemory({
        keyPrefix: 'auth_ip_rl',
        points: config.rateLimit.ipPoints,
        duration: config.rateLimit.ipDurationSeconds,
        blockDuration: config.rateLimit.ipBlockDurationSeconds,
      });

  app.use(async (req, res, next) => {
    try {
      await globalLimiter.consume('global');
      next();
    } catch (err) {
      const msBeforeNext = msBeforeNextFromRateLimitError(err);
      if (msBeforeNext) res.setHeader('retry-after', String(Math.ceil(msBeforeNext / 1000)));
      res.status(429).json({ error: 'Too many requests' });
    }
  });

  app.use(async (req, res, next) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      await ipLimiter.consume(ip);
      next();
    } catch (err) {
      const msBeforeNext = msBeforeNextFromRateLimitError(err);
      if (msBeforeNext) res.setHeader('retry-after', String(Math.ceil(msBeforeNext / 1000)));
      res.status(429).json({ error: 'Too many requests' });
    }
  });

  app.use(createHealthRouter({ nonceStore }));
  app.use('/auth', createAuthRouter({ config, nonceStore }));

  app.get('/metrics', async (_req, res) => {
    res.setHeader('content-type', metrics.register.contentType);
    res.status(200).send(await metrics.register.metrics());
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error('http.error', {
      requestId: (req as any).id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Internal server error', requestId: (req as any).id });
  });

  const server = createServer(app);

  const shutdown = async (signal: string) => {
    logger.info('shutdown.start', { signal });
    server.close(() => {
      logger.info('shutdown.http_closed');
    });

    if (redisClient) {
      try {
        await redisClient.quit();
      } catch {
        // ignore
      }
    }

    // Allow outstanding logs to flush.
    setTimeout(() => process.exit(0), 250).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  server.listen(config.port, () => {
    logger.info('server.listening', {
      port: config.port,
      env: config.env,
      redisBackedNonces: nonceStore.isRedisBacked,
    });
  });
}

function cryptoRandomId(): string {
  // Node 18+.
  return require('crypto').randomBytes(16).toString('hex');
}

void bootstrap();
