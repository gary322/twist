// Enhanced RPC Configuration with Multiple Endpoints and Failover
import { Connection, ConnectionConfig, Commitment } from '@solana/web3.js';

export interface RPCEndpoint {
  url: string;
  weight: number; // Priority weight (higher = more preferred)
  rateLimit?: number; // Requests per second
  timeout?: number; // Custom timeout in ms
  headers?: Record<string, string>;
}

export interface RPCPoolConfig {
  endpoints: RPCEndpoint[];
  commitment?: Commitment;
  confirmTransactionInitialTimeout?: number;
  retryStrategy: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
    maxRetryDelay: number;
  };
}

// Enhanced RPC endpoints with multiple providers
export const RPC_ENDPOINTS_MAINNET: RPCEndpoint[] = [
  // Primary endpoints
  {
    url: 'https://twist-mainnet.helius-rpc.com',
    weight: 100,
    rateLimit: 100,
    timeout: 30000,
    headers: { 'X-API-KEY': process.env.HELIUS_API_KEY || '' }
  },
  {
    url: 'https://mainnet.rpc.quicknode.pro',
    weight: 90,
    rateLimit: 100,
    timeout: 25000,
    headers: { 'X-API-KEY': process.env.QUICKNODE_API_KEY || '' }
  },
  {
    url: 'https://solana-mainnet.g.alchemy.com/v2',
    weight: 85,
    rateLimit: 80,
    timeout: 25000,
    headers: { 'X-API-KEY': process.env.ALCHEMY_API_KEY || '' }
  },
  
  // Secondary endpoints
  {
    url: 'https://rpc.ankr.com/solana',
    weight: 70,
    rateLimit: 50,
    timeout: 20000
  },
  {
    url: 'https://solana-api.projectserum.com',
    weight: 65,
    rateLimit: 40,
    timeout: 20000
  },
  {
    url: 'https://api.mainnet-beta.solana.com',
    weight: 60,
    rateLimit: 30,
    timeout: 20000
  },
  
  // Backup endpoints
  {
    url: 'https://solana.public-rpc.com',
    weight: 50,
    rateLimit: 20,
    timeout: 15000
  },
  {
    url: 'https://mainnet.chainstack.com/solana',
    weight: 45,
    rateLimit: 25,
    timeout: 15000,
    headers: { 'X-API-KEY': process.env.CHAINSTACK_API_KEY || '' }
  },
  {
    url: 'https://solana-mainnet.rpc.extrnode.com',
    weight: 40,
    rateLimit: 20,
    timeout: 15000
  }
];

export const RPC_ENDPOINTS_DEVNET: RPCEndpoint[] = [
  {
    url: 'https://api.devnet.solana.com',
    weight: 100,
    rateLimit: 50,
    timeout: 20000
  },
  {
    url: 'https://devnet.helius-rpc.com',
    weight: 90,
    rateLimit: 50,
    timeout: 20000,
    headers: { 'X-API-KEY': process.env.HELIUS_API_KEY || '' }
  },
  {
    url: 'https://rpc.ankr.com/solana_devnet',
    weight: 80,
    rateLimit: 30,
    timeout: 15000
  }
];

// RPC Connection Pool with automatic failover
export class RPCConnectionPool {
  private connections: Map<string, Connection> = new Map();
  private endpointHealth: Map<string, EndpointHealth> = new Map();
  private currentEndpointIndex: number = 0;
  
  constructor(
    private config: RPCPoolConfig,
    private network: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
  ) {
    this.initializeConnections();
    this.startHealthCheck();
  }
  
  private initializeConnections(): void {
    const endpoints = this.network === 'mainnet-beta' 
      ? RPC_ENDPOINTS_MAINNET 
      : RPC_ENDPOINTS_DEVNET;
      
    for (const endpoint of endpoints) {
      const config: ConnectionConfig = {
        commitment: this.config.commitment || 'confirmed',
        confirmTransactionInitialTimeout: endpoint.timeout || 30000,
        httpHeaders: endpoint.headers
      };
      
      const connection = new Connection(endpoint.url, config);
      this.connections.set(endpoint.url, connection);
      
      // Initialize health tracking
      this.endpointHealth.set(endpoint.url, {
        isHealthy: true,
        lastCheck: Date.now(),
        failureCount: 0,
        successCount: 0,
        averageLatency: 0,
        endpoint
      });
    }
  }
  
  // Get the best available connection
  async getConnection(): Promise<Connection> {
    const healthyEndpoints = this.getHealthyEndpoints();
    
    if (healthyEndpoints.length === 0) {
      throw new Error('No healthy RPC endpoints available');
    }
    
    // Select endpoint based on weight and health
    const selected = this.selectEndpoint(healthyEndpoints);
    return this.connections.get(selected.endpoint.url)!;
  }
  
  // Execute RPC call with automatic retry and failover
  async executeWithRetry<T>(
    operation: (connection: Connection) => Promise<T>,
    options?: { maxRetries?: number; timeout?: number }
  ): Promise<T> {
    const maxRetries = options?.maxRetries || this.config.retryStrategy.maxRetries;
    const timeout = options?.timeout || 30000;
    
    let lastError: Error | null = null;
    let retryCount = 0;
    let retryDelay = this.config.retryStrategy.retryDelay;
    
    while (retryCount < maxRetries) {
      const endpoints = this.getHealthyEndpoints();
      
      for (const endpointHealth of endpoints) {
        try {
          const connection = this.connections.get(endpointHealth.endpoint.url)!;
          const startTime = Date.now();
          
          // Execute with timeout
          const result = await this.executeWithTimeout(
            operation(connection),
            endpointHealth.endpoint.timeout || timeout
          );
          
          // Update health metrics on success
          const latency = Date.now() - startTime;
          this.updateEndpointHealth(endpointHealth.endpoint.url, true, latency);
          
          return result;
        } catch (error) {
          lastError = error as Error;
          
          // Update health metrics on failure
          this.updateEndpointHealth(endpointHealth.endpoint.url, false);
          
          // Log the failure
          console.warn(
            `RPC call failed on ${endpointHealth.endpoint.url}: ${(error as Error).message}`
          );
        }
      }
      
      // All endpoints failed, wait before retry
      if (retryCount < maxRetries - 1) {
        await this.sleep(retryDelay);
        retryDelay = Math.min(
          retryDelay * this.config.retryStrategy.backoffMultiplier,
          this.config.retryStrategy.maxRetryDelay
        );
      }
      
      retryCount++;
    }
    
    throw new Error(
      `RPC call failed after ${retryCount} retries. Last error: ${lastError?.message}`
    );
  }
  
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('RPC request timeout')), timeout)
      )
    ]);
  }
  
  private getHealthyEndpoints(): EndpointHealth[] {
    return Array.from(this.endpointHealth.values())
      .filter(health => health.isHealthy)
      .sort((a, b) => {
        // Sort by weight and success rate
        const aScore = a.endpoint.weight * (a.successCount / (a.successCount + a.failureCount + 1));
        const bScore = b.endpoint.weight * (b.successCount / (b.successCount + b.failureCount + 1));
        return bScore - aScore;
      });
  }
  
  private selectEndpoint(healthyEndpoints: EndpointHealth[]): EndpointHealth {
    // Weighted random selection
    const totalWeight = healthyEndpoints.reduce(
      (sum, h) => sum + h.endpoint.weight,
      0
    );
    
    let random = Math.random() * totalWeight;
    
    for (const health of healthyEndpoints) {
      random -= health.endpoint.weight;
      if (random <= 0) {
        return health;
      }
    }
    
    return healthyEndpoints[0];
  }
  
  private updateEndpointHealth(
    url: string,
    success: boolean,
    latency?: number
  ): void {
    const health = this.endpointHealth.get(url);
    if (!health) return;
    
    if (success) {
      health.successCount++;
      health.failureCount = 0;
      health.isHealthy = true;
      
      if (latency) {
        // Update average latency
        health.averageLatency = 
          (health.averageLatency * (health.successCount - 1) + latency) / 
          health.successCount;
      }
    } else {
      health.failureCount++;
      
      // Mark as unhealthy after 3 consecutive failures
      if (health.failureCount >= 3) {
        health.isHealthy = false;
      }
    }
    
    health.lastCheck = Date.now();
  }
  
  // Periodic health check
  private startHealthCheck(): void {
    setInterval(async () => {
      for (const [url] of this.endpointHealth.entries()) {
        try {
          const connection = this.connections.get(url)!;
          const startTime = Date.now();
          
          // Simple health check - get latest blockhash
          await connection.getLatestBlockhash();
          
          const latency = Date.now() - startTime;
          this.updateEndpointHealth(url, true, latency);
        } catch (error) {
          this.updateEndpointHealth(url, false);
        }
      }
    }, 30000); // Check every 30 seconds
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Get current health status
  getHealthStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [url, health] of this.endpointHealth.entries()) {
      status[url] = {
        healthy: health.isHealthy,
        successRate: health.successCount / (health.successCount + health.failureCount + 1),
        averageLatency: Math.round(health.averageLatency),
        lastCheck: new Date(health.lastCheck).toISOString()
      };
    }
    
    return status;
  }
}

interface EndpointHealth {
  isHealthy: boolean;
  lastCheck: number;
  failureCount: number;
  successCount: number;
  averageLatency: number;
  endpoint: RPCEndpoint;
}

// Default configuration
export const DEFAULT_RPC_POOL_CONFIG: RPCPoolConfig = {
  endpoints: RPC_ENDPOINTS_MAINNET,
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 30000,
  retryStrategy: {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    maxRetryDelay: 10000
  }
};

// Singleton instance
let rpcPool: RPCConnectionPool | null = null;

export function getRPCPool(
  network: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): RPCConnectionPool {
  if (!rpcPool) {
    rpcPool = new RPCConnectionPool(DEFAULT_RPC_POOL_CONFIG, network);
  }
  return rpcPool;
}

// Convenience method for getting a connection
export async function getHealthyConnection(
  network: 'mainnet-beta' | 'devnet' = 'mainnet-beta'
): Promise<Connection> {
  const pool = getRPCPool(network);
  return pool.getConnection();
}

// Convenience method for executing with retry
export async function executeRPCWithRetry<T>(
  operation: (connection: Connection) => Promise<T>,
  options?: { maxRetries?: number; timeout?: number; network?: 'mainnet-beta' | 'devnet' }
): Promise<T> {
  const pool = getRPCPool(options?.network || 'mainnet-beta');
  return pool.executeWithRetry(operation, options);
}