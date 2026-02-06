import client from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

export type Metrics = {
  register: client.Registry;
  httpRequestDurationSeconds: client.Histogram<string>;
};

export function createMetrics(): Metrics {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpRequestDurationSeconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  });

  return { register, httpRequestDurationSeconds };
}

export function httpMetricsMiddleware(metrics: Metrics) {
  return (req: Request, res: Response, next: NextFunction) => {
    const stopTimer = metrics.httpRequestDurationSeconds.startTimer();
    res.on('finish', () => {
      const route = (req.route?.path as string | undefined) || req.path || 'unknown';
      stopTimer({
        method: req.method,
        route,
        status_code: String(res.statusCode),
      });
    });
    next();
  };
}

