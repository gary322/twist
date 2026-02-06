# TWIST Token SDK

Official TypeScript SDK for interacting with TWIST Token on Solana blockchain.

## Installation

```bash
npm install @twist/sdk
# or
yarn add @twist/sdk
```

## Quick Start

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { TwistClient } from '@twist/sdk';

// Initialize client
const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.generate(); // Use your wallet

const client = new TwistClient({
  connection,
  wallet: { publicKey: wallet.publicKey, signTransaction: async (tx) => tx },
});

// Get token metrics
const metrics = await client.getTokenMetrics();
console.log(`Current price: $${metrics.price}`);
console.log(`Floor price: $${metrics.floorPrice}`);
```

## Features

- ✅ Complete instruction builders for all TWIST operations
- ✅ Type-safe account parsers
- ✅ Built-in error handling
- ✅ Automatic retries and transaction confirmation
- ✅ Helper utilities for common tasks
- ✅ Full TypeScript support

## Core Functionality

### Staking

```typescript
// Stake tokens
const signature = await client.stake(
  1000,    // Amount in TWIST
  90       // Lock period in days
);

// Check stake status
const stakeState = await client.getStakeState(wallet.publicKey);
console.log(`Total staked: ${stakeState.totalStaked}`);

// Claim rewards
await client.claimRewards();

// Unstake (after lock period)
await client.unstake(0); // Stake index
```

### Token Operations

```typescript
// Get user balance
const balance = await client.getUserBalance(wallet.publicKey);
console.log(`Balance: ${balance} TWIST`);

// Apply decay (called by anyone)
await client.applyDecay();

// Execute buyback (authority only)
await client.executeBuyback(5000); // $5000 USDC
```

### Vesting

```typescript
// Create vesting schedule
await client.createVestingSchedule({
  totalAmount: new BN(1000000 * 1e9),
  startTimestamp: new BN(Date.now() / 1000),
  cliffTimestamp: new BN((Date.now() / 1000) + 30 * 86400), // 30 day cliff
  endTimestamp: new BN((Date.now() / 1000) + 365 * 86400),  // 1 year total
  revocable: false,
}, beneficiaryPublicKey);

// Claim vested tokens
await client.claimVested(authorityPublicKey);
```

### Bridge

```typescript
// Bridge to Ethereum
await client.bridgeTokens(
  1000,                    // Amount
  2,                       // Ethereum chain ID
  '0x1234...5678'         // Destination address
);
```

## Advanced Usage

### Custom Transaction Building

```typescript
import { buildTransaction } from '@twist/sdk';

// Create multiple instructions
const stakeIx = await instructions.createStakeInstruction(...);
const claimIx = await instructions.createClaimRewardsInstruction(...);

// Build optimized transaction
const tx = buildTransaction(
  [stakeIx, claimIx],
  400000,  // Compute units
  50000    // Priority fee
);

// Send transaction
const signature = await connection.sendTransaction(tx, [wallet]);
```

### Error Handling

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
        console.error('Lock period must be 30-365 days');
        break;
      default:
        console.error('Transaction failed:', error.message);
    }
  }
}
```

### Monitoring Events

```typescript
// Listen for staking events
client.program.addEventListener('TokensStaked', (event) => {
  console.log(`User ${event.owner} staked ${event.amount} TWIST`);
});

// Listen for buyback events
client.program.addEventListener('BuybackExecuted', (event) => {
  console.log(`Buyback: ${event.usdcSpent} USDC for ${event.twistReceived} TWIST`);
});
```

## API Reference

### TwistClient

Main client for interacting with TWIST token.

#### Constructor

```typescript
new TwistClient(config: {
  connection: Connection;
  wallet: Wallet;
  programId?: PublicKey;
  commitment?: Commitment;
})
```

#### Methods

##### Read Methods

- `getProgramState()` - Get global program state
- `getStakeState(owner)` - Get user's staking info
- `getVestingSchedule(beneficiary, authority)` - Get vesting details
- `getCurrentPrice()` - Get current token price
- `getFloorPrice()` - Get floor price
- `getTokenMetrics()` - Get comprehensive token metrics
- `getUserBalance(owner)` - Get user's token balance

##### Write Methods

- `stake(amount, lockPeriodDays)` - Stake tokens
- `unstake(stakeIndex)` - Unstake tokens
- `claimRewards()` - Claim staking rewards
- `applyDecay()` - Apply daily decay
- `executeBuyback(usdcAmount)` - Execute buyback
- `createVestingSchedule(params, beneficiary)` - Create vesting
- `claimVested(authority)` - Claim vested tokens
- `bridgeTokens(amount, chain, address)` - Bridge tokens

##### Admin Methods

- `updateParameters(params)` - Update protocol parameters
- `emergencyPause()` - Activate emergency pause
- `unpause()` - Deactivate emergency pause
- `transferAuthority(newAuthority)` - Transfer admin rights

### Types

All types are exported from `@twist/sdk`:

```typescript
import {
  TokenAmount,
  StakeState,
  VestingSchedule,
  PriceInfo,
  TwistTransaction,
  // ... and more
} from '@twist/sdk';
```

### Constants

```typescript
import {
  TWIST_PROGRAM_ID,
  DECIMALS,
  STAKING_TIERS,
  SUPPORTED_CHAINS,
  // ... and more
} from '@twist/sdk';
```

### Utilities

```typescript
import {
  formatTokenAmount,
  toBNAmount,
  toDecimalAmount,
  calculatePriceImpact,
  // ... and more
} from '@twist/sdk';
```

## Examples

### Calculate Staking Rewards

```typescript
const rewards = await client.estimateStakeRewards(
  10000,  // 10,000 TWIST
  180     // 180 days
);

console.log(`APY: ${rewards.apy}%`);
console.log(`Total rewards: ${rewards.totalRewards} TWIST`);
console.log(`Daily rewards: ${rewards.dailyRewards} TWIST`);
```

### Monitor Circuit Breaker

```typescript
const status = await client.checkCircuitBreaker();

if (status.active) {
  console.log(`Circuit breaker active: ${status.reason}`);
  console.log(`Auto-reset at: ${new Date(status.autoResetTime)}`);
}
```

### Multi-sig Operations

```typescript
// Propose a parameter update
const updateIx = await instructions.createUpdateParametersInstruction(...);
await client.proposeMultisigTransaction(
  updateIx.data,
  'Update decay rate to 0.4%'
);

// Approve transaction
await client.approveMultisigTransaction(new BN(1));

// Execute after threshold reached
await client.executeMultisigTransaction(new BN(1));
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Generate Documentation

```bash
npm run docs
```

## Support

- Documentation: https://docs.twist.io
- Discord: https://discord.gg/twist
- GitHub: https://github.com/twist-protocol

## License

MIT