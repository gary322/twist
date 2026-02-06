/**
 * TWIST Platform Secrets Configuration
 * 
 * CRITICAL: This is an EXAMPLE file. Copy to secrets.ts and fill with real values.
 * NEVER commit secrets.ts to version control!
 * 
 * All services must import secrets from this single file.
 */

export const SECRETS = {
  // Blockchain (Plan 1)
  SOLANA: {
    RPC_ENDPOINT: 'https://api.mainnet-beta.solana.com',
    DEVNET_RPC: 'https://api.devnet.solana.com',
    PROGRAM_DEPLOY_KEY: '', // Base58 private key for program deployment
    MINT_AUTHORITY_KEY: '', // Base58 private key for token mint
    TREASURY_WALLET_KEY: '', // Base58 private key for treasury
    MULTISIG_KEYS: ['', '', '', '', ''], // 5 keys for 3-of-5 multisig
  },

  // Edge Infrastructure (Plan 2)
  CLOUDFLARE: {
    ACCOUNT_ID: '',
    API_TOKEN: '',
    KV_NAMESPACE_ID: '',
    DURABLE_OBJECT_NAMESPACE_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
  },

  // Authentication (Plan 3)
  AUTH: {
    JWT_SECRET: '', // 256-bit secret for JWT signing
    ENCRYPTION_KEY: '', // 256-bit key for sensitive data
    OAUTH_PROVIDERS: {
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      APPLE_CLIENT_ID: '',
      APPLE_CLIENT_SECRET: '',
    },
  },

  // Database
  DATABASE: {
    PRIMARY_URL: '', // PostgreSQL connection string
    REPLICA_URL: '', // Read replica connection string
    REDIS_URL: '', // Redis connection string
    REDIS_PASSWORD: '',
  },

  // Message Bus
  MESSAGE_BUS: {
    KAFKA_BROKERS: ['', '', ''],
    KAFKA_USERNAME: '',
    KAFKA_PASSWORD: '',
    KAFKA_SSL_CA: '', // Base64 encoded CA certificate
  },

  // Monitoring
  MONITORING: {
    PROMETHEUS_PUSH_GATEWAY: '',
    SENTRY_DSN: '',
    DATADOG_API_KEY: '',
    PAGERDUTY_API_KEY: '',
  },

  // Third-party APIs
  EXTERNAL_APIS: {
    ORCA_WHIRLPOOL_ID: '', // Orca DEX pool address
    PYTH_PRICE_FEED_ID: '', // Pyth oracle price feed
    CHAINLINK_ORACLE_ADDRESS: '',
    COINGECKO_API_KEY: '',
  },

  // Storage
  STORAGE: {
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: '',
    S3_BUCKET_NAME: '',
    IPFS_API_KEY: '',
    ARWEAVE_WALLET_KEY: '',
  },

  // Email & Communications
  COMMUNICATIONS: {
    SENDGRID_API_KEY: '',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    DISCORD_BOT_TOKEN: '',
    TELEGRAM_BOT_TOKEN: '',
  },

  // Payment Processing
  PAYMENTS: {
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    CIRCLE_API_KEY: '', // For USDC operations
  },

  // Security
  SECURITY: {
    RECAPTCHA_SECRET_KEY: '',
    CLOUDFLARE_TURNSTILE_SECRET: '',
    RATE_LIMIT_BYPASS_TOKEN: '',
  },

  // Development & Testing
  DEV: {
    TEST_WALLET_KEYS: ['', '', ''], // Only for development
    MAINNET_FORK_URL: '',
  }
};

// Type-safe secret access
export type SecretsType = typeof SECRETS;