// Error handling utilities

export class ErrorHandler {
  handleError(error: any, request: Request): Response {
    console.error('Request error:', {
      error: error.message || error,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    // Determine error type and response
    if (error.name === 'ValidationError') {
      return new Response(JSON.stringify({
        success: false,
        error: error.message,
        code: 'VALIDATION_ERROR'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (error.name === 'UnauthorizedError') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (error.name === 'RateLimitError') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED'
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'Retry-After': error.retryAfter || '60'
        }
      });
    }

    // Default to 500 for unknown errors
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Custom error classes
export class ValidationError extends Error {
  name = 'ValidationError';
}

export class UnauthorizedError extends Error {
  name = 'UnauthorizedError';
}

export class RateLimitError extends Error {
  name = 'RateLimitError';
  retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}