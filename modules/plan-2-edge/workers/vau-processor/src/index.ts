// Main VAU Processor Worker
import { Router, IRequest } from 'itty-router';
import { withAuth } from './middleware/auth';
import { withRateLimit } from './middleware/rateLimit';
import { withCache } from './middleware/cache';
import { handleVAU } from './handlers/vau';
import { MetricsCollector } from './utils/metrics';
import { ErrorHandler } from './utils/errors';
import { handleCORS, addCORSHeaders } from './middleware/cors';
import { 
  runHealthChecks, 
  validateVAUSubmission, 
  logRequest,
  processQueueMessage,
  rotateRateLimitWindows,
  rotateSalts,
  syncMetrics
} from './utils/helpers';
import { Env, VAUSubmission, VAUBatch, MessageBatch } from './types';

const router = Router();
const metrics = new MetricsCollector();
const errorHandler = new ErrorHandler();

// VAU submission endpoint
router.post('/api/v1/vau',
  withAuth,
  withRateLimit,
  async (request: IRequest, env: Env) => {
    const ctx = (request as any).ctx as ExecutionContext;
    const startTime = Date.now();

    try {
      // Parse request
      const body = (request as any).parsedBody || await request.json() as VAUSubmission;

      // Validate request
      const validation = await validateVAUSubmission(body, env);
      if (!validation.valid) {
        return new Response(JSON.stringify({
          success: false,
          error: validation.error
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Process VAU
      const result = await handleVAU(body, env, ctx);

      // Record metrics
      metrics.recordVAU({
        deviceId: body.deviceId,
        siteId: body.siteId,
        processingTime: Date.now() - startTime,
        earned: result.earned,
      });

      // Add rate limit headers
      const rateLimitInfo = (request as any).rateLimitInfo;
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Processing-Time': `${Date.now() - startTime}ms`
      });

      if (rateLimitInfo) {
        headers.set('X-RateLimit-Limit', rateLimitInfo.limit.toString());
        headers.set('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
        headers.set('X-RateLimit-Reset', rateLimitInfo.reset.toString());
      }

      return new Response(JSON.stringify({
        success: true,
        data: result
      }), {
        status: 200,
        headers
      });

    } catch (error) {
      return errorHandler.handleError(error, request);
    }
  }
);

// Batch VAU submission
router.post('/api/v1/vau/batch',
  withAuth,
  withRateLimit,
  async (request: IRequest, env: Env) => {
    const ctx = (request as any).ctx as ExecutionContext;
    try {
      const batch = (request as any).parsedBody || await request.json() as VAUBatch;

      // Validate batch size
      if (batch.vaus.length > 100) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Batch size exceeds maximum of 100'
        }), { status: 400 });
      }

      // Queue for processing
      await env.VAU_QUEUE.send({
        type: 'batch',
        data: batch,
        timestamp: Date.now()
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Batch queued for processing',
        batchId: crypto.randomUUID()
      }), { status: 202 });
    } catch (error) {
      return errorHandler.handleError(error, request);
    }
  }
);

// Health check endpoint
router.get('/health', async (request: IRequest, env: Env) => {
  const checks = await runHealthChecks(env);
  const healthy = checks.every(c => c.status === 'healthy');

  return new Response(JSON.stringify({
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks
  }), {
    status: healthy ? 200 : 503,
    headers: { 'Content-Type': 'application/json' }
  });
});

// Metrics endpoint
router.get('/metrics', async (request: IRequest, env: Env) => {
  const metricsData = await metrics.export();
  return new Response(metricsData, {
    headers: { 'Content-Type': 'text/plain' }
  });
});

// 404 handler
router.all('*', () => new Response('Not Found', { status: 404 }));

// Main worker handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Add request ID for tracing
    const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();

    // Set up execution context
    ctx.passThroughOnException();

    // Handle OPTIONS for CORS
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    try {
      // Route request
      // Attach context to request for handlers
      (request as any).ctx = ctx;
      let response = await router.handle(request, env);

      // Add security headers
      response.headers.set('X-Request-ID', requestId);
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('X-XSS-Protection', '1; mode=block');
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

      // Add CORS headers
      response = addCORSHeaders(response, request);

      // Log request
      ctx.waitUntil(
        logRequest(request, response, requestId, env)
      );

      return response;
    } catch (error) {
      return errorHandler.handleError(error, request);
    }
  },

  // Queue handler for async processing
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processQueueMessage(message.body, env);
        message.ack();
      } catch (error) {
        console.error('Queue processing error:', error);
        message.retry();
      }
    }
  },

  // Scheduled handler for maintenance tasks
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    switch (event.cron) {
      case '0 * * * *': // Hourly
        await rotateRateLimitWindows(env);
        break;
      case '0 0 * * 0': // Weekly
        await rotateSalts(env);
        break;
      case '*/5 * * * *': // Every 5 minutes
        await syncMetrics(env);
        break;
    }
  }
};