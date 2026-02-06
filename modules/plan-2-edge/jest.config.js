module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'workers/**/*.ts',
    'durable-objects/**/*.ts',
    'shared/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@workers/(.*)$': '<rootDir>/workers/$1',
    '^@durable-objects/(.*)$': '<rootDir>/durable-objects/$1'
  },
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020', 'WebWorker'],
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        noImplicitAny: true,
        strictNullChecks: true,
        types: ['jest', 'node', '@cloudflare/workers-types']
      }
    },
    crypto: {
      randomUUID: () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      },
      subtle: {
        digest: async (algorithm, data) => {
          // Mock SHA-256 digest
          const bytes = new Uint8Array(32);
          for (let i = 0; i < 32; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
          }
          return bytes.buffer;
        }
      }
    }
  }
};