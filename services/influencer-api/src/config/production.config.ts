export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: {
      rejectUnauthorized: false,
    },
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD,
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    programId: process.env.STAKING_PROGRAM_ID,
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
  },
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://twist.finance'],
    credentials: true,
  },
  logging: {
    level: 'info',
    format: 'json',
  },
  security: {
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  },
  ipQualityScore: {
    apiKey: process.env.IP_QUALITY_SCORE_API_KEY,
  },
});
