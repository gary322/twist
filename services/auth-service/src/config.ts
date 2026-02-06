export type AppConfig = {
  env: string;
  port: number;
  allowedOrigins: string[];
  jwtSecret: string;
  jwtExpiresIn: string;
  redisUrl?: string;
  nonceTtlSeconds: number;
  rateLimit: {
    ipPoints: number;
    ipDurationSeconds: number;
    ipBlockDurationSeconds: number;
    globalPoints: number;
    globalDurationSeconds: number;
  };
  logLevel: string;
};

function parseNumberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : defaultValue;
}

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function loadConfig(): AppConfig {
  const env = process.env.NODE_ENV || 'development';
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('Missing required env var: JWT_SECRET');
  }

  const allowedOrigins = parseCsvEnv('ALLOWED_ORIGINS');
  if (allowedOrigins.length === 0 && env !== 'production') {
    allowedOrigins.push('http://localhost:3000', 'http://localhost:5173');
  }

  return {
    env,
    port: parseNumberEnv('PORT', 3001),
    allowedOrigins,
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    redisUrl: process.env.REDIS_URL || undefined,
    nonceTtlSeconds: parseNumberEnv('AUTH_NONCE_TTL_SECONDS', 5 * 60),
    rateLimit: {
      ipPoints: parseNumberEnv('RATE_LIMIT_POINTS', 120),
      ipDurationSeconds: parseNumberEnv('RATE_LIMIT_DURATION_SECONDS', 60),
      ipBlockDurationSeconds: parseNumberEnv('RATE_LIMIT_BLOCK_DURATION_SECONDS', 10 * 60),
      globalPoints: parseNumberEnv('GLOBAL_RATE_LIMIT_POINTS', 20_000),
      globalDurationSeconds: parseNumberEnv('GLOBAL_RATE_LIMIT_DURATION_SECONDS', 60),
    },
    logLevel: process.env.LOG_LEVEL || (env === 'production' ? 'info' : 'debug'),
  };
}

