// CORS middleware

export function handleCORS(request: Request): Response {
  const origin = request.headers.get('Origin');
  const allowedOrigins = [
    'https://twist.io',
    'https://app.twist.io',
    'https://admin.twist.io',
    'chrome-extension://*',
    'moz-extension://*'
  ];

  // Check if origin is allowed
  const isAllowed = origin && allowedOrigins.some(allowed => {
    if (allowed.includes('*')) {
      const pattern = allowed.replace('*', '.*');
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return allowed === origin;
  });

  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-HMAC-Signature',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  });

  if (isAllowed) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return new Response(null, {
    status: 204,
    headers
  });
}

export function addCORSHeaders(response: Response, request: Request): Response {
  const origin = request.headers.get('Origin');
  const allowedOrigins = [
    'https://twist.io',
    'https://app.twist.io',
    'https://admin.twist.io',
    'chrome-extension://*',
    'moz-extension://*'
  ];

  // Check if origin is allowed
  const isAllowed = origin && allowedOrigins.some(allowed => {
    if (allowed.includes('*')) {
      const pattern = allowed.replace('*', '.*');
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return allowed === origin;
  });

  if (isAllowed) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}