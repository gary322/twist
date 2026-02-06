import { createClient } from 'redis';

export type RedisLike = {
  get(key: string): Promise<string | null>;
  setEx(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<void>;
};

export async function connectRedis(redisUrl: string): Promise<RedisLike> {
  const client = createClient({ url: redisUrl });
  client.on('error', () => {
    // Consumers log connection failures explicitly; avoid noisy logs here.
  });

  await client.connect();
  return client as unknown as RedisLike;
}
