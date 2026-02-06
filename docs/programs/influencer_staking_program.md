# Influencer Staking Program

## Overview

The Influencer Staking Program (ISP) allows any user to lock AC-D tokens behind a specific influencer's referral code and earn a share of that influencer's future campaign rewards. It extends the existing Bond-Pool Factory pattern but replaces the page-URL key with an `InfluencerId`.

Key goals:
1. Give fans upside in their favourite influencer's success.
2. Provide influencers access to additional upfront liquidity.
3. Keep the system permissionless & fully on-chain.

## Core Concepts

### Influencer Bond Pool (IBP)
```
struct InfluencerBondPool {
    // Governance
    authority:    Pubkey,     // Influencer wallet (upgrade / settings)
    beneficiary:  Pubkey,     // Where staking yield is routed (influencer earnings PDA)

    // Pool metadata
    influencer_id: [u8; 32],  // Hash of referral code or influencer handle
    stake_mint:    Pubkey,    // AC-D mint (fixed)
    receipt_mint:  Pubkey,    // NFT receipts (1:1 with stake)

    // Economics
    total_staked:  u64,       // AC-D currently staked
    total_shares:  u64,       // Shares outstanding (1 share = 1 staked AC-D)
    reserve:       u64,       // Yield reserve before distribution

    // Parameters
    lock_period:   u64,       // Seconds tokens must remain staked
    early_penalty: u16,       // BPS burned on early unlock
    yield_share:   u16,       // % of influencer earnings routed to pool

    // Accounting
    cumulative_yield_per_share: u128, // Q64.64 precision
    last_update:  i64,
}
```

### Yield Flow
1. Influencer earns campaign rewards ➜ routed to `beneficiary` PDA.
2. A crank (or influencer) calls `deposit_yield` which:
   • Moves X AC-D from beneficiary PDA to pool reserve.  
   • Updates `cumulative_yield_per_share`.
3. Individual stakers harvest pro-rata via `claim()`.

## Instruction Set

| ix | Name | Accounts | Description |
|----|------|----------|-------------|
| 0  | `initialize_pool` | Factory, Pool, Influencer, Receipt Mint, System, Rent | Creates a new IBP with params. |
| 1  | `stake` | Pool, User, User Token AC-D, User Receipt, Token Program | Stake AC-D and mint NFT receipt. |
| 2  | `unstake` | Pool, User, Receipt, User AC-D, Token Program | Burn receipt NFT, return AC-D (apply penalty if before `lock_period`). |
| 3  | `claim` | Pool, User, User AC-D, Token Program | Claim pending yield. |
| 4  | `deposit_yield` | Pool, Beneficiary PDA, Token Program | Move influencer earnings into pool reserve. |
| 5  | `update_params` | Pool, Authority | Change `lock_period`, `early_penalty`, `yield_share`. |

### initialize_pool
```rust
pub fn initialize_pool(ctx: Context<InitializePool>, params: InitParams) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    pool.authority      = ctx.accounts.influencer.key();
    pool.beneficiary    = derive_beneficiary_pda(&params.influencer_id);
    pool.influencer_id  = params.influencer_id;
    pool.stake_mint     = AC_D_MINT;
    pool.receipt_mint   = ctx.accounts.receipt_mint.key();
    pool.lock_period    = params.lock_period;
    pool.early_penalty  = params.early_penalty; // in BPS
    pool.yield_share    = params.yield_share;   // in BPS
    pool.last_update    = Clock::get()?.unix_timestamp;
    Ok(())
}
```

### stake
```rust
pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
    // Transfer AC-D from user → pool vault (CPI to SPL-Token)
    // Mint 1:1 receipt NFT to user
    // Update total_staked / total_shares
}
```

### deposit_yield
```rust
pub fn deposit_yield(ctx: Context<DepositYield>, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    // Transfer from beneficiary PDA to reserve vault
    // Update cumulative_yield_per_share
    let delta = (amount as u128) << 64 / pool.total_shares as u128;
    pool.cumulative_yield_per_share += delta;
    Ok(())
}
```

### claim
```rust
pub fn claim(ctx: Context<Claim>) -> Result<()> {
    let owed = pending_yield(...);
    if owed > 0 {
        // Transfer AC-D to user
    }
}
```

### Unstake Penalty Logic
```rust
if now < stake_time + pool.lock_period {
    let penalty = amount * pool.early_penalty / 10_000;
    burn(penalty);          // Sent to burn address
    return_amount = amount - penalty;
}
```

## Events
```
StakeEvent        { user, amount }
UnstakeEvent      { user, amount, penalty }
YieldDepositEvent { influencer, amount }
ClaimEvent        { user, amount }
```

## Security
- Re-entrancy safe via Anchor.
- Receipts are NFTs preventing double-spend.
- Yield share capped (max 50%) to protect influencers.
- Early-unstake penalty discourages mercenary capital.

## Crank / Automation
• Edge worker watches influencer beneficiary PDAs and auto-calls `deposit_yield` every 5 minutes.  
• Off-chain indexer publishes ROI stats for extension UI.

## Upgrade Path
- Program upgrade authority held by Program Multisig (3-of-5).  
- Lock period & penalty adjustable via multisig proposal.  
- Future plan: dynamic lock tiers (similar to Curve gauges). 