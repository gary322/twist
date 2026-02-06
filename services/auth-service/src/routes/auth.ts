import crypto from 'crypto';
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import * as jwt from 'jsonwebtoken';

import type { AppConfig } from '../config';
import type { NonceStore } from '../nonce-store';

function decodeBase58OrThrow(input: string): Uint8Array {
  try {
    return bs58.decode(input);
  } catch {
    throw new Error('Invalid base58 encoding');
  }
}

function decodeSignature(signature: unknown): Uint8Array {
  if (Array.isArray(signature)) {
    const asNumbers = signature.map((v) => Number(v));
    if (asNumbers.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
      throw new Error('Invalid signature array');
    }
    return Uint8Array.from(asNumbers);
  }

  if (typeof signature !== 'string') {
    throw new Error('Signature must be a string or number[]');
  }

  // Try base58 first (common for Solana signatures).
  try {
    return decodeBase58OrThrow(signature);
  } catch {
    // Then try base64.
    try {
      return Uint8Array.from(Buffer.from(signature, 'base64'));
    } catch {
      throw new Error('Invalid signature encoding');
    }
  }
}

function validateSolanaPublicKeyBase58(walletAddress: string): void {
  const bytes = decodeBase58OrThrow(walletAddress);
  if (bytes.length !== 32) {
    throw new Error('Invalid wallet address length');
  }
}

export function createAuthRouter(params: {
  config: AppConfig;
  nonceStore: NonceStore;
}): Router {
  const { config, nonceStore } = params;
  const router = Router();

  router.post(
    '/nonce',
    body('walletAddress')
      .isString()
      .custom((value: string) => {
        validateSolanaPublicKeyBase58(value);
        return true;
      }),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid request', details: errors.array() });
      }

      const walletAddress = String(req.body.walletAddress);
      const nonce = crypto.randomBytes(32).toString('hex');
      const message = `TWIST Auth Nonce: ${nonce}`;

      await nonceStore.set(walletAddress, nonce, config.nonceTtlSeconds);

      return res.status(200).json({
        walletAddress,
        nonce,
        message,
        ttlSeconds: config.nonceTtlSeconds,
      });
    },
  );

  router.post(
    '/verify',
    body('walletAddress')
      .isString()
      .custom((value: string) => {
        validateSolanaPublicKeyBase58(value);
        return true;
      }),
    body('signature').exists(),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid request', details: errors.array() });
      }

      const walletAddress = String(req.body.walletAddress);
      const signatureRaw = req.body.signature as unknown;

      const nonce = await nonceStore.get(walletAddress);
      if (!nonce) {
        return res.status(400).json({ error: 'Nonce not found or expired' });
      }

      const message = `TWIST Auth Nonce: ${nonce}`;
      const messageBytes = Buffer.from(message, 'utf8');

      let publicKeyBytes: Uint8Array;
      let signatureBytes: Uint8Array;
      try {
        publicKeyBytes = decodeBase58OrThrow(walletAddress);
        signatureBytes = decodeSignature(signatureRaw);
      } catch (err) {
        return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid signature' });
      }

      if (signatureBytes.length !== nacl.sign.signatureLength) {
        return res.status(400).json({ error: 'Invalid signature length' });
      }

      const ok = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid wallet signature' });
      }

      await nonceStore.del(walletAddress);

      const accessToken = jwt.sign(
        {
          sub: walletAddress,
          walletAddress,
        },
        config.jwtSecret as jwt.Secret,
        { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
      );

      return res.status(200).json({
        tokenType: 'Bearer',
        accessToken,
        expiresIn: config.jwtExpiresIn,
      });
    },
  );

  return router;
}
