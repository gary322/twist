// Test setup file
import { jest } from '@jest/globals';

// Set test timeout
jest.setTimeout(30000);

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.TEST_SOLANA_RPC = process.env.TEST_SOLANA_RPC || 'http://localhost:8899';
process.env.TEST_API_URL = process.env.TEST_API_URL || 'http://localhost:3000';
process.env.TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379';
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/twist_test';

// Global test utilities
declare global {
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    generateWalletAddress: () => string;
    mockTransaction: () => { signature: string; slot: number };
  };
}

global.testUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  generateWalletAddress: () => {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '';
    for (let i = 0; i < 44; i++) {
      address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address;
  },
  
  mockTransaction: () => ({
    signature: Array(88).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
    slot: Math.floor(Math.random() * 1000000),
  }),
};

// Suppress console output during tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 500));
});