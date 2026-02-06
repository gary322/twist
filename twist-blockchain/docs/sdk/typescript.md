# TWIST TypeScript SDK Documentation

## Overview

The TWIST TypeScript SDK provides a comprehensive interface for interacting with the TWIST token protocol on Solana. It handles transaction building, account management, error handling, and provides type-safe methods for all protocol operations.

## Installation

```bash
# npm
npm install @twist/sdk @solana/web3.js @project-serum/anchor

# yarn
yarn add @twist/sdk @solana/web3.js @project-serum/anchor

# pnpm
pnpm add @twist/sdk @solana/web3.js @project-serum/anchor
```

## Quick Start

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { TwistClient } from '@twist/sdk';

// Initialize connection
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Create wallet (or use existing)
const wallet = Keypair.generate();

// Initialize client
const client = new TwistClient({
  connection,
  wallet: {
    publicKey: wallet.publicKey,
    signTransaction: async (tx) => {
      tx.partialSign(wallet);
      return tx;
    },
    signAllTransactions: async (txs) => {
      txs.forEach(tx => tx.partialSign(wallet));
      return txs;
    }
  },
  options: {
    commitment: 'confirmed',
    skipPreflight: false,
  }
});

// Use the client
const balance = await client.getUserBalance(wallet.publicKey);
console.log(`Balance: ${balance} TWIST`);
```

## Core Concepts

### Client Configuration

```typescript
interface TwistClientConfig {
  connection: Connection;
  wallet: Wallet;
  programId?: PublicKey;      // Defaults to mainnet program
  options?: {
    commitment?: Commitment;   // Transaction commitment level
    skipPreflight?: boolean;   // Skip preflight checks
    retries?: number;         // Number of retry attempts
    retryDelay?: number;      // Delay between retries (ms)
  };
}
```

### Error Handling

The SDK provides typed errors for better error handling:

```typescript
import { TwistError, ErrorCode } from '@twist/sdk';

try {
  await client.stake(1000, 30);
} catch (error) {
  if (error instanceof TwistError) {
    switch (error.code) {
      case ErrorCode.InsufficientBalance:
        console.error('Not enough TWIST tokens');
        break;
      case ErrorCode.InvalidLockPeriod:
        console.error('Lock period must be 30, 90, 180, or 365 days');
        break;
      default:
        console.error('Transaction failed:', error.message);
    }
  }
}
```

## Token Operations

### Get Token Info

```typescript
// Get token metrics
const metrics = await client.getTokenMetrics();
console.log({
  price: metrics.marketPrice,
  floorPrice: metrics.floorPrice,
  totalSupply: metrics.totalSupply.toString(),
  circulatingSupply: metrics.circulatingSupply.toString(),
  stakedSupply: metrics.stakedSupply.toString(),
  volume24h: metrics.volume24h,
});

// Get user balance
const balance = await client.getUserBalance(userPublicKey);
console.log(`Balance: ${balance} TWIST`);

// Get program state
const state = await client.getProgramState();
console.log({
  decayRate: state.decayRateBps / 100,
  lastDecay: new Date(state.lastDecayTimestamp * 1000),
  totalDecayed: state.totalDecayed.toString(),
});
```

### Apply Decay

```typescript
// Check if decay can be applied
const canDecay = await client.canApplyDecay();
if (canDecay) {
  // Apply daily decay
  const txId = await client.applyDecay();
  console.log(`Decay applied: ${txId}`);
  
  // Get decay details
  const decayInfo = await client.getLastDecayInfo();
  console.log({
    amount: decayInfo.decayAmount.toString(),
    floorTreasury: decayInfo.floorAmount.toString(),
    opsTreasury: decayInfo.opsAmount.toString(),
  });
}
```

## Staking Operations

### Stake Tokens

```typescript
// Stake 1000 TWIST for 90 days
const stakeAmount = 1000;
const lockDays = 90;

const txId = await client.stake(stakeAmount, lockDays);
console.log(`Staked successfully: ${txId}`);

// Get expected APY
const apy = client.getStakingAPY(lockDays);
console.log(`APY: ${apy}%`);

// Calculate expected rewards
const rewards = await client.estimateStakeRewards(stakeAmount, lockDays);
console.log({
  dailyRewards: rewards.dailyRewards,
  totalRewards: rewards.totalRewards,
  effectiveAPY: rewards.effectiveAPY,
});
```

### Manage Stakes

```typescript
// Get all user stakes
const stakeState = await client.getStakeState(userPublicKey);
console.log(`Total staked: ${stakeState.totalStaked.toString()}`);

// Iterate through individual stakes
stakeState.stakes.forEach((stake, index) => {
  console.log({
    index,
    amount: stake.amount.toString(),
    startDate: new Date(stake.startTimestamp * 1000),
    lockPeriod: stake.lockPeriod / 86400, // Convert to days
    apy: stake.apyBps / 100,
    earned: stake.totalEarned.toString(),
    canUnstake: Date.now() / 1000 > stake.startTimestamp + stake.lockPeriod,
  });
});

// Claim rewards for specific stake
const stakeIndex = 0;
const claimTx = await client.claimRewards(stakeIndex);
console.log(`Rewards claimed: ${claimTx}`);

// Claim all rewards
const claimAllTx = await client.claimAllRewards();
console.log(`All rewards claimed: ${claimAllTx}`);

// Unstake after lock period
const unstakeTx = await client.unstake(stakeIndex);
console.log(`Unstaked: ${unstakeTx}`);
```

### Early Unstaking

```typescript
// Check penalty for early unstaking
const penalty = await client.calculateUnstakePenalty(stakeIndex);
console.log({
  penaltyPercent: penalty.penaltyPercent,
  penaltyAmount: penalty.penaltyAmount.toString(),
  returnAmount: penalty.returnAmount.toString(),
});

// Unstake early (if user accepts penalty)
if (confirm(`Accept ${penalty.penaltyPercent}% penalty?`)) {
  const txId = await client.unstakeEarly(stakeIndex);
  console.log(`Unstaked early: ${txId}`);
}
```

## Trading Operations

### Swap Tokens

```typescript
// Buy TWIST with USDC
const buyTx = await client.swap({
  inputToken: 'USDC',
  inputAmount: 100,  // 100 USDC
  minOutputAmount: 1900, // Minimum 1900 TWIST (slippage protection)
});
console.log(`Bought TWIST: ${buyTx}`);

// Sell TWIST for USDC
const sellTx = await client.swap({
  inputToken: 'TWIST',
  inputAmount: 1000,  // 1000 TWIST
  minOutputAmount: 48, // Minimum 48 USDC
});
console.log(`Sold TWIST: ${sellTx}`);

// Get swap quote before executing
const quote = await client.getSwapQuote({
  inputToken: 'USDC',
  inputAmount: 100,
});
console.log({
  outputAmount: quote.outputAmount,
  priceImpact: quote.priceImpact,
  fee: quote.fee,
  minimumReceived: quote.minimumReceived,
});
```

### Liquidity Provision

```typescript
// Add liquidity to pool
const addLiquidityTx = await client.addLiquidity({
  twistAmount: 10000,
  usdcAmount: 500,
  slippageTolerance: 1, // 1%
});
console.log(`Liquidity added: ${addLiquidityTx.txId}`);
console.log(`LP tokens received: ${addLiquidityTx.lpTokens}`);

// Remove liquidity
const removeLiquidityTx = await client.removeLiquidity({
  lpTokens: 100,
  minTwistAmount: 9900,
  minUsdcAmount: 495,
});
console.log(`Liquidity removed: ${removeLiquidityTx}`);
```

## DeFi Operations

### Buyback Execution

```typescript
// Check if buyback is needed
const buybackInfo = await client.getBuybackInfo();
if (buybackInfo.canExecute) {
  console.log({
    currentPrice: buybackInfo.currentPrice,
    floorPrice: buybackInfo.floorPrice,
    threshold: buybackInfo.thresholdPrice,
    availableFunds: buybackInfo.availableFunds,
  });
  
  // Execute buyback (authorized wallets only)
  const buybackTx = await client.executeBuyback(5000); // $5000 USDC
  console.log(`Buyback executed: ${buybackTx}`);
}
```

### Vesting Management

```typescript
// Create vesting schedule (admin only)
const vestingTx = await client.createVestingSchedule({
  beneficiary: beneficiaryPublicKey,
  totalAmount: new BN(1000000).mul(new BN(10).pow(new BN(9))), // 1M TWIST
  startDate: Date.now() / 1000,
  cliffDate: Date.now() / 1000 + 30 * 86400, // 30 day cliff
  endDate: Date.now() / 1000 + 365 * 86400,  // 1 year total
  revocable: false,
});
console.log(`Vesting created: ${vestingTx}`);

// Check vesting schedule
const vesting = await client.getVestingSchedule(beneficiaryPublicKey, authorityPublicKey);
console.log({
  totalAmount: vesting.totalAmount.toString(),
  releasedAmount: vesting.releasedAmount.toString(),
  availableToClaim: vesting.availableToClaim.toString(),
  nextUnlock: new Date(vesting.nextUnlockTime * 1000),
});

// Claim vested tokens
const claimVestedTx = await client.claimVested(authorityPublicKey);
console.log(`Vested tokens claimed: ${claimVestedTx}`);
```

### Bridge Operations

```typescript
// Get supported chains
const chains = await client.getSupportedChains();
console.log('Supported chains:', chains);

// Bridge to Ethereum
const bridgeTx = await client.bridgeTokens({
  amount: 5000,
  targetChain: 'ethereum',
  targetAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bd3e',
});
console.log(`Bridge initiated: ${bridgeTx.txId}`);
console.log(`Estimated arrival: ${bridgeTx.estimatedArrival}`);

// Monitor bridge status
const bridgeStatus = await client.getBridgeStatus(bridgeTx.transferId);
console.log({
  status: bridgeStatus.status,
  confirmations: bridgeStatus.confirmations,
  targetTxHash: bridgeStatus.targetTxHash,
});
```

## Advanced Features

### Circuit Breaker

```typescript
// Check circuit breaker status
const circuitBreaker = await client.checkCircuitBreaker();
if (circuitBreaker.active) {
  console.log({
    reason: circuitBreaker.reason,
    triggeredAt: new Date(circuitBreaker.triggeredAt * 1000),
    autoResetAt: new Date(circuitBreaker.autoResetTime * 1000),
    severity: circuitBreaker.severity,
  });
}

// Reset circuit breaker (admin only)
if (isAdmin) {
  const resetTx = await client.resetCircuitBreaker();
  console.log(`Circuit breaker reset: ${resetTx}`);
}
```

### Oracle Data

```typescript
// Get aggregated price
const price = await client.getCurrentPrice();
console.log(`Current price: $${price.price.toFixed(4)}`);
console.log(`Confidence: ±${price.confidence.toFixed(4)}`);
console.log(`Sources: ${price.sources}`);

// Get individual oracle prices
const oracles = await client.getAllOraclePrices();
oracles.forEach(oracle => {
  console.log({
    source: oracle.source,
    price: oracle.price,
    confidence: oracle.confidence,
    lastUpdate: new Date(oracle.timestamp * 1000),
  });
});
```

### Transaction Building

```typescript
// Build custom transaction
import { TransactionBuilder } from '@twist/sdk';

const builder = new TransactionBuilder(client);

// Add multiple instructions
builder
  .addInstruction(await client.buildStakeInstruction(1000, 90))
  .addInstruction(await client.buildClaimRewardsInstruction(0))
  .setFeePayer(wallet.publicKey)
  .setRecentBlockhash(await connection.getLatestBlockhash());

// Sign and send
const tx = builder.build();
const signature = await client.sendTransaction(tx);
console.log(`Transaction sent: ${signature}`);
```

### Batch Operations

```typescript
// Batch multiple operations
const batch = client.createBatch();

// Add operations to batch
batch.add(client.claimRewards(0));
batch.add(client.claimRewards(1));
batch.add(client.stake(500, 30));

// Execute batch
const results = await batch.execute();
results.forEach((result, index) => {
  if (result.success) {
    console.log(`Operation ${index} succeeded: ${result.signature}`);
  } else {
    console.error(`Operation ${index} failed: ${result.error}`);
  }
});
```

## Event Listening

```typescript
// Listen for program events
const eventListener = client.addEventListener('TokensStaked', (event) => {
  console.log({
    user: event.owner.toBase58(),
    amount: event.amount.toString(),
    lockPeriod: event.lockPeriod / 86400,
    apy: event.apyBps / 100,
  });
});

// Listen for specific events
client.addEventListener('BuybackExecuted', (event) => {
  console.log(`Buyback: ${event.usdcSpent} USDC for ${event.twistReceived} TWIST`);
});

client.addEventListener('DecayApplied', (event) => {
  console.log(`Decay: ${event.decayAmount} TWIST removed from supply`);
});

// Remove listener
eventListener.remove();
```

## Utility Functions

```typescript
import { utils } from '@twist/sdk';

// Format token amounts
const formatted = utils.formatTokenAmount(1234567890123456789n, 9);
console.log(formatted); // "1,234,567,890.123456789"

// Convert to/from decimals
const atomicAmount = utils.toAtomicAmount(100.5, 9); // 100500000000
const decimalAmount = utils.toDecimalAmount(atomicAmount, 9); // 100.5

// Calculate price impact
const impact = utils.calculatePriceImpact(
  currentPrice,
  executionPrice
);
console.log(`Price impact: ${impact}%`);

// Validate addresses
if (utils.isValidPublicKey(addressString)) {
  const pubkey = new PublicKey(addressString);
}

// Time utilities
const lockEndDate = utils.calculateLockEndDate(Date.now(), 90);
const daysRemaining = utils.getDaysRemaining(lockEndDate);
```

## Testing

```typescript
import { MockTwistClient } from '@twist/sdk/testing';

// Create mock client for testing
const mockClient = new MockTwistClient({
  initialBalance: 10000,
  initialPrice: 0.05,
});

// Mock responses
mockClient.setMockResponse('stake', {
  success: true,
  signature: 'mock-signature',
});

// Use in tests
describe('MyComponent', () => {
  it('should stake tokens', async () => {
    const result = await mockClient.stake(1000, 90);
    expect(result).toBe('mock-signature');
  });
});
```

## Best Practices

### 1. Error Handling

Always wrap SDK calls in try-catch blocks:

```typescript
async function safeStake(amount: number, days: number) {
  try {
    const tx = await client.stake(amount, days);
    return { success: true, tx };
  } catch (error) {
    if (error instanceof TwistError) {
      return { success: false, error: error.code };
    }
    return { success: false, error: 'UNKNOWN_ERROR' };
  }
}
```

### 2. Transaction Confirmation

Wait for proper confirmation:

```typescript
const signature = await client.stake(1000, 90);

// Wait for confirmation
const confirmation = await connection.confirmTransaction(
  signature,
  'finalized' // or 'confirmed' for faster but less secure
);

if (confirmation.value.err) {
  throw new Error('Transaction failed');
}
```

### 3. Rate Limiting

Implement rate limiting for RPC calls:

```typescript
import { RateLimiter } from '@twist/sdk/utils';

const limiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 1000, // 10 requests per second
});

async function rateLimitedCall() {
  await limiter.acquire();
  return client.getUserBalance(publicKey);
}
```

### 4. Connection Management

Use connection pooling for better performance:

```typescript
import { ConnectionPool } from '@twist/sdk/utils';

const pool = new ConnectionPool({
  endpoints: [
    'https://api.mainnet-beta.solana.com',
    'https://solana-api.projectserum.com',
  ],
  maxConnections: 5,
});

const client = new TwistClient({
  connection: pool.getConnection(),
  wallet,
});
```

## Migration Guide

### From v1 to v2

```typescript
// v1
const client = new TwistClient(connection, wallet);
await client.stake(1000, 90);

// v2
const client = new TwistClient({ connection, wallet });
await client.stake(1000, 90);

// New features in v2
const batch = client.createBatch();
const metrics = await client.getTokenMetrics();
```

## Troubleshooting

### Common Issues

1. **InsufficientBalance**: Ensure you have enough TWIST tokens and SOL for fees
2. **InvalidLockPeriod**: Use only supported periods: 30, 90, 180, 365 days
3. **TransactionTimeout**: Increase timeout or use skipPreflight option
4. **AccountNotFound**: Ensure accounts are initialized before use

### Debug Mode

Enable debug logging:

```typescript
const client = new TwistClient({
  connection,
  wallet,
  debug: true, // Enables detailed logging
});

// Or set globally
import { setDebugMode } from '@twist/sdk';
setDebugMode(true);
```

## Resources

- [API Reference](./api-reference.md)
- [Integration Examples](./examples.md)
- [GitHub Repository](https://github.com/twist-protocol/sdk)
- [Discord Support](https://discord.gg/twist)