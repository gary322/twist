# TWIST Smart Contract Architecture

## Overview

The TWIST protocol consists of multiple interconnected smart contracts (programs) deployed on Solana. Each program handles specific functionality while maintaining composability through Cross-Program Invocations (CPI).

## Program Structure

### 1. Core Token Program (`twist-token`)

**Program ID**: `TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### Account Structure

```rust
// Program State (PDA)
pub struct ProgramState {
    pub authority: Pubkey,              // Program authority (multi-sig)
    pub mint: Pubkey,                   // TWIST token mint
    pub bump: u8,                       // PDA bump seed
    
    // Economic parameters
    pub decay_rate_bps: u64,            // Daily decay rate in basis points
    pub treasury_split_bps: u64,        // Floor treasury allocation
    pub last_decay_timestamp: i64,      // Last decay execution
    pub total_decayed: u128,            // Cumulative decay amount
    pub total_burned: u128,             // Cumulative burn amount
    
    // Treasury
    pub floor_treasury: Pubkey,         // Floor treasury address
    pub ops_treasury: Pubkey,           // Operations treasury
    pub floor_price: u64,               // Current floor price (6 decimals)
    pub floor_liquidity: u64,           // Available buyback liquidity
    
    // Oracle configuration
    pub pyth_price_feed: Pubkey,        // Pyth oracle address
    pub switchboard_feed: Pubkey,       // Switchboard oracle
    pub chainlink_feed: Option<Pubkey>, // Optional Chainlink
    pub last_oracle_price: u64,         // Last aggregated price
    
    // Circuit breaker
    pub circuit_breaker_active: bool,   // Emergency stop active
    pub emergency_pause: bool,          // Full pause state
    pub buyback_enabled: bool,          // Buyback feature toggle
    pub max_daily_buyback: u64,         // Daily buyback limit
    pub daily_buyback_used: u64,        // Current daily usage
}
```

#### Key Instructions

##### Initialize
```rust
pub fn initialize(
    ctx: Context<Initialize>,
    params: InitializeParams
) -> Result<()>
```
- Sets up program state
- Configures economic parameters
- Establishes treasury addresses
- One-time execution only

##### Apply Decay
```rust
pub fn apply_decay(
    ctx: Context<ApplyDecay>
) -> Result<()>
```
- Executes daily 0.5% decay
- Distributes to treasuries
- Updates global metrics
- Requires 24-hour cooldown

##### Execute Buyback
```rust
pub fn execute_buyback(
    ctx: Context<ExecuteBuyback>,
    max_usdc_amount: u64
) -> Result<()>
```
- Triggered when price < 97% floor
- Uses treasury funds
- Burns portion of bought tokens
- Subject to daily limits

### 2. Staking Program (`twist-staking`)

**Program ID**: `STAKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### Account Structure

```rust
// User Stake Account (PDA per user)
pub struct StakeState {
    pub owner: Pubkey,           // Stake owner
    pub bump: u8,                // PDA bump
    pub total_staked: u64,       // Total staked amount
    pub total_earned: u128,      // Lifetime earnings
    pub stakes: Vec<StakeEntry>, // Individual stakes
}

// Individual Stake Entry
pub struct StakeEntry {
    pub amount: u64,             // Staked amount
    pub start_timestamp: i64,    // Stake start time
    pub lock_period: i64,        // Lock duration in seconds
    pub apy_bps: u64,           // APY in basis points
    pub last_claim_timestamp: i64, // Last reward claim
    pub total_earned: u64,       // Total rewards earned
    pub withdrawn: bool,         // Withdrawal status
}
```

#### Key Instructions

##### Stake Tokens
```rust
pub fn stake(
    ctx: Context<Stake>,
    amount: u64,
    lock_period: i64
) -> Result<()>
```
- Lock periods: 30, 90, 180, 365 days
- APY: 10%, 20%, 35%, 67%
- Minimum stake: 100 TWIST
- Multiple concurrent stakes allowed

##### Claim Rewards
```rust
pub fn claim_rewards(
    ctx: Context<ClaimRewards>,
    stake_index: u64
) -> Result<()>
```
- Claims accumulated rewards
- Compounds interest
- No lock on rewards
- Gas-efficient batch claiming

##### Unstake
```rust
pub fn unstake(
    ctx: Context<Unstake>,
    stake_index: u64
) -> Result<()>
```
- Only after lock period
- Returns principal + rewards
- Early unstaking incurs penalties
- Updates global metrics

### 3. Treasury Management Program (`twist-treasury`)

**Program ID**: `TRSYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### Account Structure

```rust
// Treasury State
pub struct TreasuryState {
    pub authority: Pubkey,       // Treasury authority (multi-sig)
    pub treasury_type: TreasuryType, // Floor or Operations
    pub total_received: u128,    // Total tokens received
    pub total_spent: u128,       // Total tokens spent
    pub strategies: Vec<Strategy>, // Active strategies
}

// Investment Strategy
pub struct Strategy {
    pub protocol: Pubkey,        // Target protocol
    pub allocation_bps: u64,     // Allocation percentage
    pub current_value: u64,      // Current position value
    pub last_update: i64,        // Last rebalance
}
```

#### Key Instructions

##### Withdraw Treasury
```rust
pub fn withdraw_treasury(
    ctx: Context<WithdrawTreasury>,
    amount: u64,
    recipient: Pubkey
) -> Result<()>
```
- Multi-sig required
- Timelock for large amounts
- Audit trail maintained
- Emergency override available

##### Rebalance Treasury
```rust
pub fn rebalance_treasury(
    ctx: Context<RebalanceTreasury>,
    new_allocations: Vec<Allocation>
) -> Result<()>
```
- Optimizes yield strategies
- Maintains liquidity requirements
- Risk-adjusted allocations
- Automated execution

### 4. Vesting Program (`twist-vesting`)

**Program ID**: `VESTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### Account Structure

```rust
// Vesting Schedule
pub struct VestingSchedule {
    pub beneficiary: Pubkey,     // Token recipient
    pub mint: Pubkey,            // Token mint
    pub total_amount: u64,       // Total vesting amount
    pub released_amount: u64,    // Already released
    pub start_timestamp: i64,    // Vesting start
    pub cliff_timestamp: i64,    // Cliff date
    pub end_timestamp: i64,      // Vesting end
    pub revocable: bool,         // Can be revoked
    pub revoked: bool,           // Revocation status
}
```

#### Key Instructions

##### Create Vesting
```rust
pub fn create_vesting_schedule(
    ctx: Context<CreateVesting>,
    params: VestingParams
) -> Result<()>
```
- Linear vesting after cliff
- Customizable schedules
- Revocable option
- Multiple beneficiaries

##### Claim Vested
```rust
pub fn claim_vested(
    ctx: Context<ClaimVested>
) -> Result<()>
```
- Claims unlocked tokens
- Partial claims allowed
- Automatic calculation
- No overclaim protection

### 5. Bridge Program (`twist-bridge`)

**Program ID**: `BRDGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### Account Structure

```rust
// Bridge State
pub struct BridgeState {
    pub authority: Pubkey,       // Bridge authority
    pub wormhole_bridge: Pubkey, // Wormhole program
    pub token_bridge: Pubkey,    // Token bridge program
    pub total_bridged_out: u128, // Tokens bridged out
    pub total_bridged_in: u128,  // Tokens bridged in
    pub supported_chains: Vec<ChainInfo>, // Supported chains
}

// Chain Information
pub struct ChainInfo {
    pub chain_id: u16,           // Wormhole chain ID
    pub is_active: bool,         // Chain status
    pub fee_bps: u64,           // Bridge fee
    pub min_amount: u64,         // Minimum bridge amount
}
```

#### Key Instructions

##### Bridge Out
```rust
pub fn bridge_tokens(
    ctx: Context<BridgeTokens>,
    amount: u64,
    target_chain: u16,
    target_address: [u8; 32]
) -> Result<()>
```
- Burns tokens on Solana
- Emits Wormhole VAA
- Charges bridge fee
- Validates target chain

##### Complete Bridge
```rust
pub fn complete_bridge_transfer(
    ctx: Context<CompleteBridge>,
    vaa_data: Vec<u8>
) -> Result<()>
```
- Verifies Wormhole VAA
- Mints tokens to recipient
- Prevents double-spending
- Updates bridge metrics

## Cross-Program Invocations (CPI)

### Token → Staking CPI
```rust
// In staking program
let cpi_accounts = Transfer {
    from: ctx.accounts.user_token_account.to_account_info(),
    to: ctx.accounts.stake_vault.to_account_info(),
    authority: ctx.accounts.user.to_account_info(),
};
let cpi_program = ctx.accounts.token_program.to_account_info();
let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
token::transfer(cpi_ctx, amount)?;
```

### Treasury → DEX CPI
```rust
// Execute buyback through Orca
let swap_ix = orca_whirlpool::instruction::swap(
    &whirlpool_program_id,
    &token_program_id,
    &token_authority,
    &whirlpool,
    &token_owner_account_a,
    &token_vault_a,
    &token_owner_account_b,
    &token_vault_b,
    &tick_array_0,
    &tick_array_1,
    &tick_array_2,
    &oracle,
    amount,
    other_amount_threshold,
    sqrt_price_limit,
    amount_specified_is_input,
    a_to_b,
)?;
```

## Security Considerations

### Access Control
```rust
// Multi-sig check
pub fn require_multisig(ctx: &Context) -> Result<()> {
    let multisig_account = &ctx.accounts.multisig;
    require!(
        multisig_account.signers.len() >= multisig_account.threshold,
        ErrorCode::InsufficientSigners
    );
    Ok(())
}

// Authority check
#[access_control(is_authority(&ctx))]
pub fn admin_function(ctx: Context<AdminAction>) -> Result<()> {
    // Admin-only logic
}
```

### Reentrancy Protection
```rust
// State-based reentrancy guard
pub struct ReentrancyGuard {
    locked: bool,
}

impl ReentrancyGuard {
    pub fn lock(&mut self) -> Result<()> {
        require!(!self.locked, ErrorCode::Reentrant);
        self.locked = true;
        Ok(())
    }
    
    pub fn unlock(&mut self) {
        self.locked = false;
    }
}
```

### Integer Overflow Protection
```rust
// Safe math operations
pub fn safe_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or(ErrorCode::Overflow)
}

pub fn safe_mul(a: u64, b: u64) -> Result<u64> {
    a.checked_mul(b).ok_or(ErrorCode::Overflow)
}

// Using U256 for large calculations
use uint::construct_uint;
construct_uint! {
    pub struct U256(4);
}
```

## Gas Optimization

### Account Size Optimization
```rust
// Pack struct fields efficiently
#[repr(C)]
pub struct OptimizedState {
    pub flags: u8,      // Combine booleans
    pub bump: u8,       // 1 byte
    pub padding: [u8; 6], // Align to 8 bytes
    pub amount: u64,    // 8 bytes
    pub timestamp: i64, // 8 bytes
}
```

### Compute Unit Optimization
```rust
// Request optimal compute units
pub fn optimize_compute_units(
    instructions: &mut Vec<Instruction>
) {
    instructions.insert(
        0,
        ComputeBudgetInstruction::set_compute_unit_limit(300_000)
    );
    instructions.insert(
        1,
        ComputeBudgetInstruction::set_compute_unit_price(1_000)
    );
}
```

### Batch Operations
```rust
// Batch reward claims
pub fn claim_all_rewards(
    ctx: Context<ClaimAllRewards>
) -> Result<()> {
    let stake_state = &mut ctx.accounts.stake_state;
    let mut total_rewards = 0u64;
    
    // Single iteration through all stakes
    for stake in stake_state.stakes.iter_mut() {
        if !stake.withdrawn {
            let rewards = calculate_rewards(stake);
            total_rewards = total_rewards.checked_add(rewards)?;
            stake.last_claim_timestamp = Clock::get()?.unix_timestamp;
        }
    }
    
    // Single transfer
    transfer_rewards(total_rewards)?;
    Ok(())
}
```

## Upgrade Pattern

### Proxy Pattern Implementation
```rust
// Upgradeable program with data migration
pub fn upgrade_program(
    ctx: Context<UpgradeProgram>,
    new_program_data: Pubkey
) -> Result<()> {
    // Verify authority
    require_multisig(&ctx)?;
    
    // Set upgrade authority
    let program_data = &ctx.accounts.program_data;
    program_data.upgrade_authority = new_program_data;
    
    // Emit upgrade event
    emit!(ProgramUpgraded {
        old_version: ctx.accounts.program.key(),
        new_version: new_program_data,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
```

### State Migration
```rust
// Migrate from V1 to V2
pub fn migrate_state_v1_to_v2(
    ctx: Context<MigrateState>
) -> Result<()> {
    let old_state = StateV1::try_from_slice(
        &ctx.accounts.old_state.data.borrow()
    )?;
    
    let new_state = StateV2 {
        // Copy existing fields
        field1: old_state.field1,
        field2: old_state.field2,
        // Add new fields with defaults
        new_field: 0,
    };
    
    new_state.serialize(
        &mut ctx.accounts.new_state.data.borrow_mut()
    )?;
    
    Ok(())
}
```

## Testing Patterns

### Unit Test Example
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_decay_calculation() {
        let initial_balance = 1000 * 10u64.pow(9);
        let decay_rate = 50; // 0.5%
        
        let remaining = calculate_decay(
            initial_balance,
            decay_rate,
            1 // 1 day
        );
        
        assert_eq!(remaining, 995 * 10u64.pow(9));
    }
}
```

### Integration Test Pattern
```rust
#[tokio::test]
async fn test_full_stake_flow() {
    let program_test = ProgramTest::new(
        "twist_token",
        id(),
        processor!(process_instruction)
    );
    
    let (mut banks_client, payer, recent_blockhash) = 
        program_test.start().await;
    
    // Setup accounts
    let user = Keypair::new();
    let stake_account = Keypair::new();
    
    // Execute stake
    let tx = Transaction::new_signed_with_payer(
        &[stake_instruction(&user.pubkey(), 1000)],
        Some(&payer.pubkey()),
        &[&payer, &user],
        recent_blockhash
    );
    
    banks_client.process_transaction(tx).await.unwrap();
    
    // Verify state
    let stake_state = banks_client
        .get_account(stake_account.pubkey())
        .await
        .unwrap()
        .unwrap();
        
    assert_eq!(stake_state.lamports, expected_lamports);
}
```

## Best Practices

### 1. Account Validation
- Always validate account ownership
- Check account discriminators
- Verify PDA derivations
- Validate account data size

### 2. Error Handling
- Use custom error codes
- Provide descriptive messages
- Log errors for debugging
- Handle edge cases explicitly

### 3. Event Emission
- Emit events for all state changes
- Include relevant metadata
- Use for off-chain indexing
- Enable transaction tracking

### 4. Documentation
- Document all public functions
- Explain complex algorithms
- Provide usage examples
- Maintain upgrade notes