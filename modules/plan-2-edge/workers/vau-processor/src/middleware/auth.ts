// Authentication middleware
import { IRequest } from 'itty-router';
import { Env } from '../types';
import { verifyHMAC } from '../utils/crypto';
import { UnauthorizedError } from '../utils/errors';

export async function withAuth(request: IRequest, env: Env): Promise<Response | void> {
  // Check for API key in header
  const apiKey = request.headers.get('Authorization');
  if (!apiKey || !apiKey.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  // Extract token
  const token = apiKey.substring(7);

  // For development, accept a test token
  if (env.ENVIRONMENT === 'development' && token === 'test-token') {
    return;
  }

  // Verify HMAC signature for production
  const signature = request.headers.get('X-HMAC-Signature');
  if (!signature) {
    throw new UnauthorizedError('Missing HMAC signature');
  }

  // Build the message to verify
  const timestamp = request.headers.get('X-Timestamp');
  if (!timestamp) {
    throw new UnauthorizedError('Missing timestamp');
  }

  // Check timestamp is recent (within 5 minutes)
  const now = Date.now();
  const requestTime = parseInt(timestamp);
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
    throw new UnauthorizedError('Invalid or expired timestamp');
  }

  // Get request body if present
  let body = '';
  if (request.method === 'POST' || request.method === 'PUT') {
    try {
      const clonedRequest = request.clone();
      body = await clonedRequest.text();
      // Store parsed body for later use
      (request as any).parsedBody = body ? JSON.parse(body) : null;
    } catch (error) {
      throw new UnauthorizedError('Invalid request body');
    }
  }

  // Build signature message
  const url = new URL(request.url);
  const message = [
    request.method,
    url.pathname,
    timestamp,
    body
  ].join('\n');

  // Verify HMAC
  const isValid = await verifyHMAC(message, signature, env.HMAC_SECRET);
  if (!isValid) {
    throw new UnauthorizedError('Invalid HMAC signature');
  }

  // Add authenticated user info to request
  (request as any).auth = {
    token,
    timestamp: requestTime
  };
}