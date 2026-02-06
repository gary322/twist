import { Router } from 'express';
import type { NonceStore } from '../nonce-store';

export function createHealthRouter(params: { nonceStore: NonceStore }): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/ready', async (_req, res) => {
    try {
      await params.nonceStore.ping();
      res.status(200).json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({
        status: 'not ready',
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  });

  return router;
}

