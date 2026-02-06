import type { RedisLike } from './redis';

export type NonceStore = {
  set(walletAddress: string, nonce: string, ttlSeconds: number): Promise<void>;
  get(walletAddress: string): Promise<string | null>;
  del(walletAddress: string): Promise<void>;
  ping(): Promise<void>;
  isRedisBacked: boolean;
};

export function createMemoryNonceStore(): NonceStore {
  const entries = new Map<string, { nonce: string; expiresAtMs: number }>();

  function cleanupOne(key: string) {
    const current = entries.get(key);
    if (!current) return;
    if (Date.now() >= current.expiresAtMs) {
      entries.delete(key);
    }
  }

  return {
    isRedisBacked: false,
    async set(walletAddress, nonce, ttlSeconds) {
      entries.set(walletAddress, { nonce, expiresAtMs: Date.now() + ttlSeconds * 1000 });
    },
    async get(walletAddress) {
      cleanupOne(walletAddress);
      return entries.get(walletAddress)?.nonce ?? null;
    },
    async del(walletAddress) {
      entries.delete(walletAddress);
    },
    async ping() {
      return;
    },
  };
}

export function createRedisNonceStore(redis: RedisLike): NonceStore {
  const keyForWallet = (walletAddress: string) => `auth:nonce:${walletAddress}`;

  return {
    isRedisBacked: true,
    async set(walletAddress, nonce, ttlSeconds) {
      await redis.setEx(keyForWallet(walletAddress), ttlSeconds, nonce);
    },
    async get(walletAddress) {
      return await redis.get(keyForWallet(walletAddress));
    },
    async del(walletAddress) {
      await redis.del(keyForWallet(walletAddress));
    },
    async ping() {
      await redis.ping();
    },
  };
}
