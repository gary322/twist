// Avalanche Bridge Timeout Fix
import { JsonRpcProvider, TransactionReceipt, formatUnits } from 'ethers';

export interface BridgeTimeoutConfig {
  avalanche: {
    confirmationTimeout: number;
    confirmationBlocks: number;
    maxRetries: number;
    retryDelay: number;
    rpcUrls: string[];
  };
  ethereum: {
    confirmationTimeout: number;
    confirmationBlocks: number;
  };
  bsc: {
    confirmationTimeout: number;
    confirmationBlocks: number;
  };
  polygon: {
    confirmationTimeout: number;
    confirmationBlocks: number;
  };
  solana: {
    confirmationTimeout: number;
  };
}

// Enhanced timeout configuration for cross-chain bridges
export const BRIDGE_TIMEOUT_CONFIG: BridgeTimeoutConfig = {
  avalanche: {
    // Increased timeout for Avalanche due to subnet complexity
    confirmationTimeout: 180000, // 3 minutes (increased from 1 minute)
    confirmationBlocks: 12, // ~24 seconds on Avalanche C-Chain
    maxRetries: 5, // Increased retries for reliability
    retryDelay: 5000, // 5 seconds between retries
    rpcUrls: [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://rpc.ankr.com/avalanche',
      'https://avalanche-mainnet.infura.io/v3/' + process.env.INFURA_KEY,
      'https://ava-mainnet.public.blastapi.io/ext/bc/C/rpc',
      'https://avalanche.public-rpc.com'
    ]
  },
  ethereum: {
    confirmationTimeout: 120000, // 2 minutes
    confirmationBlocks: 12 // ~3 minutes on Ethereum
  },
  bsc: {
    confirmationTimeout: 60000, // 1 minute
    confirmationBlocks: 15 // ~45 seconds on BSC
  },
  polygon: {
    confirmationTimeout: 90000, // 1.5 minutes
    confirmationBlocks: 128 // ~4 minutes on Polygon (due to reorgs)
  },
  solana: {
    confirmationTimeout: 45000 // 45 seconds
  }
};

// Avalanche-specific bridge handler with enhanced reliability
export class AvalancheBridgeHandler {
  private providers: JsonRpcProvider[] = [];
  private currentProviderIndex = 0;
  
  constructor() {
    // Initialize multiple providers for redundancy
    for (const rpcUrl of BRIDGE_TIMEOUT_CONFIG.avalanche.rpcUrls) {
      const provider = new JsonRpcProvider(rpcUrl);
      // Note: timeout configuration is different in ethers v6
      this.providers.push(provider);
    }
  }
  
  // Get current provider with automatic failover
  private async getHealthyProvider(): Promise<JsonRpcProvider> {
    for (let i = 0; i < this.providers.length; i++) {
      const index = (this.currentProviderIndex + i) % this.providers.length;
      const provider = this.providers[index];
      
      try {
        // Quick health check
        await provider.getBlockNumber();
        this.currentProviderIndex = index;
        return provider;
      } catch (error) {
        console.warn(`Avalanche provider ${index} failed health check:`, (error as Error).message);
      }
    }
    
    throw new Error('No healthy Avalanche providers available');
  }
  
  // Enhanced transaction confirmation with retries
  async waitForConfirmation(
    txHash: string,
    options?: {
      confirmations?: number;
      timeout?: number;
      onRetry?: (attempt: number) => void;
    }
  ): Promise<TransactionReceipt> {
    const confirmations = options?.confirmations || BRIDGE_TIMEOUT_CONFIG.avalanche.confirmationBlocks;
    const timeout = options?.timeout || BRIDGE_TIMEOUT_CONFIG.avalanche.confirmationTimeout;
    const maxRetries = BRIDGE_TIMEOUT_CONFIG.avalanche.maxRetries;
    const retryDelay = BRIDGE_TIMEOUT_CONFIG.avalanche.retryDelay;
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const provider = await this.getHealthyProvider();
        
        // Create promise with timeout
        const confirmationPromise = provider.waitForTransaction(
          txHash,
          confirmations,
          timeout
        );
        
        // Add additional timeout wrapper for safety
        const receipt = await Promise.race([
          confirmationPromise,
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Transaction confirmation timeout')),
              timeout
            )
          )
        ]);
        
        // Verify receipt is valid
        if (!receipt || !receipt.blockNumber) {
          throw new Error('Invalid transaction receipt');
        }
        
        // Additional verification - check if block is finalized
        const currentBlock = await provider.getBlockNumber();
        const confirmationDepth = currentBlock - receipt.blockNumber;
        
        if (confirmationDepth < confirmations) {
          throw new Error(
            `Insufficient confirmations: ${confirmationDepth}/${confirmations}`
          );
        }
        
        return receipt;
        
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `Avalanche confirmation attempt ${attempt + 1}/${maxRetries} failed:`,
          (error as Error).message
        );
        
        if (options?.onRetry) {
          options.onRetry(attempt + 1);
        }
        
        // Wait before retry
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    throw new Error(
      `Failed to confirm Avalanche transaction after ${maxRetries} attempts: ${lastError?.message}`
    );
  }
  
  // Monitor bridge transaction with enhanced status updates
  async monitorBridgeTransaction(
    txHash: string,
    options?: {
      onStatusUpdate?: (status: BridgeTransactionStatus) => void;
      abortSignal?: AbortSignal;
    }
  ): Promise<BridgeTransactionResult> {
    const startTime = Date.now();
    let status: BridgeTransactionStatus = {
      stage: 'submitted',
      txHash,
      confirmations: 0,
      estimatedTime: BRIDGE_TIMEOUT_CONFIG.avalanche.confirmationTimeout
    };
    
    // Update status callback
    const updateStatus = (updates: Partial<BridgeTransactionStatus>) => {
      status = { ...status, ...updates };
      if (options?.onStatusUpdate) {
        options.onStatusUpdate(status);
      }
    };
    
    try {
      // Stage 1: Wait for initial transaction inclusion
      updateStatus({ stage: 'pending', message: 'Waiting for transaction inclusion...' });
      
      const provider = await this.getHealthyProvider();
      let receipt: TransactionReceipt | null = null;
      
      // Poll for transaction with shorter intervals
      const pollInterval = 2000; // 2 seconds
      while (!receipt && !options?.abortSignal?.aborted) {
        try {
          receipt = await provider.getTransactionReceipt(txHash);
          if (receipt) break;
        } catch (error) {
          // Ignore errors during polling
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        // Check timeout
        if (Date.now() - startTime > BRIDGE_TIMEOUT_CONFIG.avalanche.confirmationTimeout) {
          throw new Error('Transaction inclusion timeout');
        }
      }
      
      if (!receipt) {
        throw new Error('Transaction not found');
      }
      
      // Stage 2: Wait for confirmations
      updateStatus({
        stage: 'confirming',
        message: 'Waiting for block confirmations...',
        blockNumber: receipt.blockNumber
      });
      
      // Monitor confirmations
      let lastConfirmations = 0;
      while (!options?.abortSignal?.aborted) {
        const currentBlock = await provider.getBlockNumber();
        const confirmations = currentBlock - receipt.blockNumber + 1;
        
        if (confirmations !== lastConfirmations) {
          updateStatus({
            confirmations,
            message: `${confirmations}/${BRIDGE_TIMEOUT_CONFIG.avalanche.confirmationBlocks} confirmations`
          });
          lastConfirmations = confirmations;
        }
        
        if (confirmations >= BRIDGE_TIMEOUT_CONFIG.avalanche.confirmationBlocks) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      
      // Stage 3: Verify bridge event
      updateStatus({
        stage: 'verifying',
        message: 'Verifying bridge event...'
      });
      
      // Check for bridge events in logs
      const bridgeEvent = receipt.logs.find((log: any) => 
        log.topics[0] === BRIDGE_EVENT_SIGNATURE
      );
      
      if (!bridgeEvent) {
        throw new Error('Bridge event not found in transaction');
      }
      
      // Stage 4: Complete
      updateStatus({
        stage: 'completed',
        message: 'Bridge transaction confirmed'
      });
      
      return {
        success: true,
        txHash,
        receipt,
        confirmations: BRIDGE_TIMEOUT_CONFIG.avalanche.confirmationBlocks,
        totalTime: Date.now() - startTime
      };
      
    } catch (error) {
      updateStatus({
        stage: 'failed',
        message: (error as Error).message
      });
      
      return {
        success: false,
        txHash,
        error: (error as Error).message,
        totalTime: Date.now() - startTime
      };
    }
  }
  
  // Get current network status
  async getNetworkStatus(): Promise<AvalancheNetworkStatus> {
    const provider = await this.getHealthyProvider();
    
    const [
      blockNumber,
      feeData,
      network,
      block
    ] = await Promise.all([
      provider.getBlockNumber(),
      provider.getFeeData(),
      provider.getNetwork(),
      provider.getBlock('latest')
    ]);
    
    return {
      healthy: true,
      blockNumber,
      gasPrice: formatUnits(feeData.gasPrice || 0n, 'gwei'),
      chainId: Number(network.chainId),
      blockTime: block?.timestamp || 0,
      currentProvider: this.currentProviderIndex
    };
  }
}

// Types
export interface BridgeTransactionStatus {
  stage: 'submitted' | 'pending' | 'confirming' | 'verifying' | 'completed' | 'failed';
  txHash: string;
  confirmations: number;
  estimatedTime: number;
  blockNumber?: number;
  message?: string;
}

export interface BridgeTransactionResult {
  success: boolean;
  txHash: string;
  receipt?: TransactionReceipt;
  confirmations?: number;
  totalTime: number;
  error?: string;
}

export interface AvalancheNetworkStatus {
  healthy: boolean;
  blockNumber: number;
  gasPrice: string;
  chainId: number;
  blockTime: number;
  currentProvider: number;
}

// Constants
const BRIDGE_EVENT_SIGNATURE = '0x6eb224fb001ed210e379b335e35efe88672a8ce935d981a6896b27ffdf52a3b2'; // LogMessagePublished

// Export singleton instance
export const avalancheBridgeHandler = new AvalancheBridgeHandler();

// Helper function for tests
export async function waitForAvalancheBridge(
  txHash: string,
  onStatusUpdate?: (status: BridgeTransactionStatus) => void
): Promise<BridgeTransactionResult> {
  return avalancheBridgeHandler.monitorBridgeTransaction(txHash, {
    onStatusUpdate
  });
}