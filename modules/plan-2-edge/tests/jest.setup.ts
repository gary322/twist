import { webcrypto } from 'node:crypto';

// Miniflare + node test runs should have a WebCrypto-compatible global `crypto`.
// Node provides it via `node:crypto` as `webcrypto`.
if (!(globalThis as any).crypto?.subtle) {
  (globalThis as any).crypto = webcrypto as any;
}

