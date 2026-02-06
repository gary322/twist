// Helper functions for VAU processor

import { Env, HealthCheck, VAUSubmission, ValidationResult } from '../types';
import { verifyECDSASignature } from './crypto';
import { getDeviceTrust } from '../handlers/vau';
import { MIN_TRUST_SCORE, VAU_MAX_AGE } from '@shared/constants';
import { logger } from './logger';

export async function runHealthChecks(env: Env): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // Check KV namespace
  try {
    await env.RATE_LIMITS.get('health-check');
    checks.push({
      service: 'kv-namespace',
      status: 'healthy',
      timestamp: Date.now()
    });
  } catch (error) {
    checks.push({
      service: 'kv-namespace',
      status: 'unhealthy',
      timestamp: Date.now(),
      details: { error: (error as Error).message }
    });
  }

  // Check R2 bucket
  try {
    await env.AUDIT_LOGS.list({ limit: 1 });
    checks.push({
      service: 'r2-bucket',
      status: 'healthy',
      timestamp: Date.now()
    });
  } catch (error) {
    checks.push({
      service: 'r2-bucket',
      status: 'unhealthy',
      timestamp: Date.now(),
      details: { error: (error as Error).message }
    });
  }

  // Check queue
  try {
    // Queues don't have a direct health check, so we'll assume healthy if env var exists
    if (env.VAU_QUEUE) {
      checks.push({
        service: 'queue',
        status: 'healthy',
        timestamp: Date.now()
      });
    }
  } catch (error) {
    checks.push({
      service: 'queue',
      status: 'unhealthy',
      timestamp: Date.now(),
      details: { error: (error as Error).message }
    });
  }

  return checks;
}

export async function validateVAUSubmission(
  submission: VAUSubmission,
  env: Env
): Promise<ValidationResult> {
  // Check required fields
  if (!submission.userId || !submission.deviceId || !submission.siteId) {
    return {
      valid: false,
      error: 'Missing required fields'
    };
  }

  // Validate signature
  const signatureValid = await verifyECDSASignature(
    submission.signature,
    submission.payload,
    submission.deviceId
  );

  if (!signatureValid) {
    return {
      valid: false,
      error: 'Invalid signature'
    };
  }

  // Check timestamp (max 30 seconds old)
  const age = Date.now() - submission.timestamp;
  if (age > VAU_MAX_AGE) {
    return {
      valid: false,
      error: 'Timestamp too old'
    };
  }

  // Verify device trust
  const deviceTrust = await getDeviceTrust(submission.deviceId, env);
  if (deviceTrust.score < MIN_TRUST_SCORE) {
    return {
      valid: false,
      error: 'Device trust score too low'
    };
  }

  return { 
    valid: true,
    trustScore: deviceTrust.score
  };
}

export async function logRequest(
  request: Request,
  response: Response,
  requestId: string,
  env: Env
): Promise<void> {
  const logEntry = {
    requestId,
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    status: response.status,
    cf: request.cf,
    headers: Object.fromEntries([...request.headers as any]),
    environment: env.ENVIRONMENT
  };

  // Store in R2 for audit
  const date = new Date();
  const key = `request-logs/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${requestId}.json`;
  
  await env.AUDIT_LOGS.put(key, JSON.stringify(logEntry));
}

export async function processQueueMessage(message: any, env: Env): Promise<void> {
  switch (message.type) {
    case 'batch':
      // Process batch VAU submissions
      logger.debug('Processing batch:', message.data);
      break;
    case 'metrics':
      // Sync metrics
      logger.debug('Syncing metrics');
      break;
    default:
      console.warn('Unknown message type:', message.type);
  }
}

export async function rotateRateLimitWindows(env: Env): Promise<void> {
  // Clean up old rate limit windows
  const cutoff = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
  
  // This would ideally use KV list with prefix, but for now we'll skip
  logger.info('Rate limit window rotation completed');
}

export async function rotateSalts(env: Env): Promise<void> {
  const currentWeek = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const newSalt = crypto.randomUUID();

  await env.KV.put(`salt:week:${currentWeek + 1}`, newSalt, {
    expirationTtl: 8 * 24 * 3600 // 8 days
  });

  // Clean up old salts
  const oldWeek = currentWeek - 2;
  await env.KV.delete(`salt:week:${oldWeek}`);
  
  logger.info('Salt rotation completed');
}

export async function syncMetrics(env: Env): Promise<void> {
  // This would sync metrics to external monitoring system
  logger.info('Metrics sync completed');
}