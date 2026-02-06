/**
 * TWIST Platform - Edge Worker Entry Point
 * Production-ready VAU processing at the edge
 */

import { VAUManager } from './modules/plan-2-edge/workers/vau-processor/src/vau-manager.js';
import { BloomFilter } from './modules/plan-2-edge/workers/vau-processor/src/bloom-filter.js';
import { PrivacyProcessor } from './modules/plan-2-edge/workers/vau-processor/src/privacy-processor.js';
import { RateLimiter } from './src/rate-limiter.js';

// Environment configuration
const ENV = {
  TWIST_API_ENDPOINT: globalThis.TWIST_API_ENDPOINT || 'https://api.twist.io',
  REDIS_URL: globalThis.REDIS_URL,
  MIN_TIME_ON_SITE: 30, // seconds
  REWARD_MULTIPLIER: 1.0,
  RATE_LIMIT_WINDOW: 60000, // 1 minute
  RATE_LIMIT_MAX: 100, // max requests per window
};

// Initialize services
const vauManager = new VAUManager();
const rateLimiter = new RateLimiter();
const bloomFilter = new BloomFilter();
const privacyProcessor = new PrivacyProcessor();

/**
 * Main request handler for edge worker
 */
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      // Handle different endpoints
      switch (url.pathname) {
        case '/vau/submit':
          return handleVAUSubmission(request, env, ctx);
        
        case '/vau/batch':
          return handleBatchVAU(request, env, ctx);
          
        case '/health':
          return new Response('OK', { status: 200 });
          
        case '/metrics':
          return handleMetrics(request, env);
          
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('Edge worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * Handle individual VAU submission
 */
async function handleVAUSubmission(request, env, ctx) {
  // Check rate limits
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = `vau_submit:${clientIp}`;
  
  const allowed = await rateLimiter.checkLimit(
    rateLimitKey,
    ENV.RATE_LIMIT_MAX,
    ENV.RATE_LIMIT_WINDOW
  );
  
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 
        'Content-Type': 'application/json',
        'Retry-After': '60'
      }
    });
  }

  try {
    // Parse request body
    const vauData = await request.json();
    
    // Validate required fields
    if (!vauData.userId || !vauData.siteId || !vauData.timeSpent) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check minimum time requirement
    if (vauData.timeSpent < ENV.MIN_TIME_ON_SITE) {
      return new Response(JSON.stringify({ 
        error: 'Insufficient time on site',
        required: ENV.MIN_TIME_ON_SITE 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Apply privacy processing
    const privacyProcessed = await privacyProcessor.processVAU({
      userId: vauData.userId,
      siteId: vauData.siteId,
      metadata: vauData.metadata || {}
    });
    
    // Check uniqueness with bloom filter
    const vauId = `${vauData.userId}:${vauData.siteId}:${Math.floor(Date.now() / 3600000)}`;
    const isUnique = !bloomFilter.contains(vauId);
    
    if (isUnique) {
      bloomFilter.add(vauId);
    }
    
    // Calculate reward
    const baseReward = 0.1; // Base TWIST reward
    const timeMultiplier = Math.min(vauData.timeSpent / 300, 2); // Cap at 2x for 5+ minutes
    const uniqueMultiplier = isUnique ? 1.0 : 0.1; // 10% for duplicates
    
    const reward = baseReward * timeMultiplier * uniqueMultiplier * ENV.REWARD_MULTIPLIER;
    
    // Process the VAU
    const result = {
      success: true,
      vauId: generateVAUId(),
      earned: Math.floor(reward * 1e9), // Convert to smallest unit
      isUnique,
      timestamp: Date.now(),
      privacyProcessed: true
    };
    
    // Queue for backend processing
    ctx.waitUntil(submitToBackend(vauData, result, env));
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('VAU processing error:', error);
    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle batch VAU submissions
 */
async function handleBatchVAU(request, env, ctx) {
  try {
    const batch = await request.json();
    
    if (!Array.isArray(batch.vaus) || batch.vaus.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid batch format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Process batch through VAU manager
    const results = await vauManager.processBatch({
      siteId: batch.siteId,
      vaus: batch.vaus,
      timestamp: Date.now()
    });
    
    // Queue for backend sync
    ctx.waitUntil(syncBatchResults(results, env));
    
    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      totalRewards: results.reduce((sum, r) => sum + r.earned, 0)
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Batch processing error:', error);
    return new Response(JSON.stringify({ error: 'Batch processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle metrics endpoint
 */
async function handleMetrics(request, env) {
  const metrics = {
    processed: await env.METRICS.get('vau_processed') || 0,
    unique: await env.METRICS.get('vau_unique') || 0,
    rewards: await env.METRICS.get('rewards_distributed') || 0,
    timestamp: Date.now()
  };
  
  return new Response(JSON.stringify(metrics), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Submit VAU to backend for persistence
 */
async function submitToBackend(vauData, result, env) {
  try {
    const response = await fetch(`${ENV.TWIST_API_ENDPOINT}/api/v1/vau/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Edge-Worker': 'true',
        'Authorization': `Bearer ${env.EDGE_WORKER_KEY}`
      },
      body: JSON.stringify({
        vau: vauData,
        result,
        edge: {
          location: env.CF_LOCATION || 'unknown',
          timestamp: Date.now()
        }
      })
    });
    
    if (!response.ok) {
      console.error('Backend submission failed:', await response.text());
    }
  } catch (error) {
    console.error('Backend submission error:', error);
  }
}

/**
 * Sync batch results to backend
 */
async function syncBatchResults(results, env) {
  try {
    await fetch(`${ENV.TWIST_API_ENDPOINT}/api/v1/vau/batch-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.EDGE_WORKER_KEY}`
      },
      body: JSON.stringify({ results })
    });
  } catch (error) {
    console.error('Batch sync error:', error);
  }
}

/**
 * Generate unique VAU ID
 */
function generateVAUId() {
  return `vau_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}