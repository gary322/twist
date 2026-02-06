// Environment interface for Cloudflare Workers

export interface Env {
  // KV Namespaces
  RATE_LIMITS: KVNamespace;
  DEVICE_REGISTRY: KVNamespace;
  ATTESTATION_CACHE: KVNamespace;
  BLOOM_FILTERS: KVNamespace;
  KV: KVNamespace; // General purpose KV

  // Durable Objects
  RATE_LIMITER: DurableObjectNamespace;
  SESSION_MANAGER: DurableObjectNamespace;
  VAU_AGGREGATOR: DurableObjectNamespace;

  // R2 Buckets
  AUDIT_LOGS: R2Bucket;
  ANALYTICS_DATA: R2Bucket;

  // Queues
  VAU_QUEUE: Queue;
  REWARD_QUEUE: Queue;
  ANALYTICS_QUEUE: Queue;

  // Secrets
  HMAC_SECRET: string;
  SOLANA_RPC: string;
  TWIST_PROGRAM_ID: string;
  PAGERDUTY_TOKEN?: string;
  PAGERDUTY_ROUTING_KEY?: string;

  // Environment
  ENVIRONMENT: 'development' | 'staging' | 'production';
}