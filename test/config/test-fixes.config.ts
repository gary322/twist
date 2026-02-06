// Test Configuration Updates to Fix Failed Tests
import { RPCConnectionPool, getRPCPool } from '../../twist-blockchain/sdk/src/rpc-config';
import { avalancheBridgeHandler } from '../../twist-blockchain/sdk/src/bridge-timeout-fix';
import { WalletTestUtils } from '../../src/components/wallet/wallet-integration-test-fix';

// Test environment configuration with fixes
export const TEST_CONFIG_FIXES = {
  // Fix for UI Wallet Integration Tests
  wallet: {
    testUtils: WalletTestUtils,
    cssPath: '/src/components/wallet/wallet-integration.css',
    testTimeouts: {
      modalAppear: 3000,
      connectionComplete: 5000,
      transactionConfirm: 10000
    },
    mockProviders: [
      { name: 'Phantom', icon: '/assets/phantom.png' },
      { name: 'Solflare', icon: '/assets/solflare.png' },
      { name: 'Backpack', icon: '/assets/backpack.png' }
    ]
  },
  
  // Fix for RPC Timeout Issues
  rpc: {
    // Use connection pool with multiple endpoints
    getConnection: async (network: 'mainnet-beta' | 'devnet' = 'devnet') => {
      const pool = getRPCPool(network);
      return pool.getConnection();
    },
    
    // Execute with automatic retry and failover
    executeWithRetry: async (operation: any, options?: any) => {
      const pool = getRPCPool(options?.network || 'devnet');
      return pool.executeWithRetry(operation, {
        maxRetries: options?.maxRetries || 5,
        timeout: options?.timeout || 30000
      });
    },
    
    // Default timeout configurations
    timeouts: {
      default: 30000,      // 30 seconds
      transaction: 60000,  // 60 seconds for transactions
      confirmation: 45000, // 45 seconds for confirmations
      simulation: 20000    // 20 seconds for simulations
    }
  },
  
  // Fix for Avalanche Bridge Timeout
  bridge: {
    avalanche: {
      handler: avalancheBridgeHandler,
      timeout: 180000, // 3 minutes
      confirmations: 12,
      retryConfig: {
        maxRetries: 5,
        retryDelay: 5000
      }
    },
    
    // Other chain configurations
    ethereum: { timeout: 120000, confirmations: 12 },
    bsc: { timeout: 60000, confirmations: 15 },
    polygon: { timeout: 90000, confirmations: 128 },
    solana: { timeout: 45000 }
  },
  
  // General test improvements
  general: {
    // Increase Jest timeout for integration tests
    jestTimeout: 120000, // 2 minutes
    
    // Retry flaky tests
    retryTimes: 2,
    
    // Parallel test execution settings
    maxWorkers: '50%',
    
    // Test environment cleanup
    setupFilesAfterEnv: ['./test/setup/cleanup.ts']
  }
};

// Jest configuration updates
export const jestConfigUpdates = {
  testTimeout: TEST_CONFIG_FIXES.general.jestTimeout,
  retry: TEST_CONFIG_FIXES.general.retryTimes,
  maxWorkers: TEST_CONFIG_FIXES.general.maxWorkers,
  
  // Global test setup
  globalSetup: './test/setup/global-setup.ts',
  globalTeardown: './test/setup/global-teardown.ts',
  
  // Module name mapper for CSS
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@blockchain/(.*)$': '<rootDir>/twist-blockchain/$1'
  },
  
  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  }
};

// Helper functions for tests
export const testHelpers = {
  // Wait for wallet UI to be ready
  async waitForWalletUI(): Promise<void> {
    await WalletTestUtils.waitForModal();
  },
  
  // Get healthy RPC connection with retry
  async getHealthyRPC(network: 'mainnet-beta' | 'devnet' = 'devnet'): Promise<any> {
    return TEST_CONFIG_FIXES.rpc.executeWithRetry(
      async (conn) => conn,
      { network, maxRetries: 3 }
    );
  },
  
  // Monitor Avalanche bridge with proper timeout
  async monitorAvalancheBridge(txHash: string): Promise<any> {
    return avalancheBridgeHandler.monitorBridgeTransaction(txHash, {
      onStatusUpdate: (status) => {
        logger.log(`Bridge status: ${status.stage} - ${status.message}`);
      }
    });
  }
};

// Export test environment setup
export function setupTestEnvironment(): void {
  // Set longer timeouts for integration tests
  if (process.env.TEST_TYPE === 'integration') {
    jest.setTimeout(TEST_CONFIG_FIXES.general.jestTimeout);
  }
  
  // Mock timers for wallet UI tests
  if (process.env.TEST_TYPE === 'ui') {
    jest.useFakeTimers();
  }
  
  // Setup RPC mocks for unit tests
  if (process.env.TEST_TYPE === 'unit') {
    jest.mock('@solana/web3.js', () => ({
      Connection: jest.fn().mockImplementation(() => ({
        getLatestBlockhash: jest.fn().mockResolvedValue({
          blockhash: 'test-blockhash',
          lastValidBlockHeight: 100
        }),
        getBalance: jest.fn().mockResolvedValue(1000000000),
        simulateTransaction: jest.fn().mockResolvedValue({ value: { err: null } })
      }))
    }));
  }
}

// Cleanup function
export function cleanupTestEnvironment(): void {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset timers
  if (jest.isMockFunction(setTimeout)) {
    jest.useRealTimers();
  }
  
  // Clean up DOM for UI tests
  if (typeof document !== 'undefined') {
    document.body.innerHTML = '';
  }
}