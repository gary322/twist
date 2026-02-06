# Bond Pool Factory Program (`bond_pool_factory`)

Program ID: `BOND1111111111111111111111111111111111111111`  •  Language: Rust (Anchor)  •  Type: Staking System

---
## 1. Purpose
Creates and manages Page-Staked Attention Bond (PSAB) pools where users lock AC-D tokens for 30+ days to earn yields from future page visitors. Site owners benefit from committed audiences while stakers earn from attention value appreciation. 90% of yield is burned, creating a powerful deflationary mechanism.

---
## 2. Economic Model
```
Users stake AC-D → Pool locked for 30+ days → Future visitors pay to pool → 
90% burned, 10% to stakers → Stakers can claim after unlock
```

**Key Mechanics:**
- Minimum 30-day lock (no early withdrawal)
- Higher burn rates = more yield for stakers
- Yield comes from future hot page burns
- NFT receipt for each bond position

---
## 3. Account Structure

### 3.1 Factory State
```rust
#[account]
pub struct FactoryState {
    pub authority: Pubkey,                   // Protocol authority
    pub total_pools_created: u64,            // Counter
    pub total_value_locked: u128,            // All-time TVL in AC-D
    pub current_tvl: u64,                    // Current TVL
    pub total_burned_from_yield: u128,       // 90% burns accumulated
    pub protocol_fee_bps: u16,               // 100 = 1% (if any)
    pub min_bond_duration: i64,              // 30 days minimum
    pub max_bond_duration: i64,              // 365 days maximum
    pub paused: bool,                        // Emergency pause
}

// PDA: ["factory_state"]
```

### 3.2 Bond Pool
```rust
#[account]
pub struct BondPool {
    pub pool_id: [u8; 32],                   // Unique identifier
    pub site_hash: [u8; 32],                 // Which site this is for
    pub site_owner: Pubkey,                  // Site owner (info only)
    pub created_at: i64,                     // Pool creation time
    
    // Staking parameters
    pub min_stake_amount: u64,               // Minimum AC-D to stake
    pub max_stake_amount: Option<u64>,       // Cap per user
    pub lock_duration: i64,                  // Seconds tokens locked
    
    // Pool state
    pub total_staked: u64,                   // Current AC-D staked
    pub total_shares: u64,                   // Share tokens issued
    pub total_yield_accumulated: u128,       // From page burns
    pub total_yield_burned: u128,            // 90% burned
    pub total_yield_distributed: u128,       // 10% to stakers
    
    // Reward tracking
    pub reward_per_share: u128,              // Accumulated rewards
    pub last_update_slot: u64,               // For reward calculation
    
    // Status
    pub active: bool,                        // Accepting deposits
    pub finalized: bool,                     // No more deposits
}

// PDA: ["pool", site_hash]
```

### 3.3 Bond Position (User Stake)
```rust
#[account]
pub struct BondPosition {
    pub owner: Pubkey,                       // Who staked
    pub pool: Pubkey,                        // Which pool
    pub bond_mint: Pubkey,                   // NFT mint (receipt)
    
    // Stake details
    pub amount_staked: u64,                  // AC-D staked
    pub shares: u64,                         // Pool shares owned
    pub stake_timestamp: i64,                // When staked
    pub unlock_timestamp: i64,               // When can withdraw
    
    // Rewards
    pub reward_debt: u128,                   // For reward calculation
    pub rewards_claimed: u64,                // AC-D claimed
    pub last_claim_timestamp: i64,           
    
    // Metadata
    pub position_number: u64,                // For NFT metadata
    pub auto_compound: bool,                 // Restake rewards
}

// PDA: ["position", owner, pool]
```

### 3.4 Bond NFT Metadata
```rust
#[account]
pub struct BondNFT {
    pub position: Pubkey,                    // Link to position
    pub site_name: String,                   // "example.com"
    pub stake_amount: u64,                   // Original stake
    pub lock_duration_days: u32,             // 30, 60, 90, etc
    pub apy_at_stake: u16,                   // Estimated APY (bps)
    pub artwork_seed: [u8; 32],              // For generative art
}

// Stored in Metaplex metadata
```

---
## 4. Core Instructions

### 4.1 Create Bond Pool
```rust
pub fn create_bond_pool(
    ctx: Context<CreateBondPool>,
    params: CreatePoolParams,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let factory = &mut ctx.accounts.factory_state;
    let clock = Clock::get()?;
    
    // Verify site ownership
    require!(
        verify_site_owner(&ctx.accounts.site_owner, &params.site_hash)?,
        ErrorCode::NotSiteOwner
    );
    
    // Validate parameters
    require!(
        params.lock_duration >= factory.min_bond_duration &&
        params.lock_duration <= factory.max_bond_duration,
        ErrorCode::InvalidLockDuration
    );
    
    require!(
        params.min_stake_amount >= 1_000_000_000, // 1 AC-D minimum
        ErrorCode::StakeTooLow
    );
    
    // Initialize pool
    let pool_id = generate_pool_id(&params.site_hash, clock.unix_timestamp);
    
    pool.pool_id = pool_id;
    pool.site_hash = params.site_hash;
    pool.site_owner = ctx.accounts.site_owner.key();
    pool.created_at = clock.unix_timestamp;
    
    pool.min_stake_amount = params.min_stake_amount;
    pool.max_stake_amount = params.max_stake_amount;
    pool.lock_duration = params.lock_duration;
    
    pool.total_staked = 0;
    pool.total_shares = 0;
    pool.total_yield_accumulated = 0;
    pool.total_yield_burned = 0;
    pool.total_yield_distributed = 0;
    
    pool.reward_per_share = 0;
    pool.last_update_slot = clock.slot;
    
    pool.active = true;
    pool.finalized = false;
    
    // Update factory
    factory.total_pools_created += 1;
    
    emit!(BondPoolCreated {
        pool_id,
        site_hash: params.site_hash,
        site_owner: ctx.accounts.site_owner.key(),
        lock_duration: params.lock_duration,
        min_stake: params.min_stake_amount,
    });
    
    Ok(())
}
```

### 4.2 Stake in Pool (Create Bond)
```rust
pub fn stake_in_pool(
    ctx: Context<StakeInPool>,
    amount: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let position = &mut ctx.accounts.position;
    let factory = &mut ctx.accounts.factory_state;
    let clock = Clock::get()?;
    
    // Validate pool active
    require!(pool.active, ErrorCode::PoolNotActive);
    require!(!pool.finalized, ErrorCode::PoolFinalized);
    
    // Validate amount
    require!(
        amount >= pool.min_stake_amount,
        ErrorCode::StakeBelowMinimum
    );
    
    if let Some(max) = pool.max_stake_amount {
        require!(
            amount <= max,
            ErrorCode::StakeAboveMaximum
        );
    }
    
    // Update rewards before staking
    update_pool_rewards(pool)?;
    
    // Calculate shares (1:1 if first stake, proportional otherwise)
    let shares = if pool.total_shares == 0 {
        amount
    } else {
        (amount as u128 * pool.total_shares as u128 / pool.total_staked as u128) as u64
    };
    
    // Transfer AC-D to pool
    transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.staker_ac_account.to_account_info(),
                to: ctx.accounts.pool_ac_account.to_account_info(),
                authority: ctx.accounts.staker.to_account_info(),
            },
        ),
        amount,
    )?;
    
    // Create position
    position.owner = ctx.accounts.staker.key();
    position.pool = pool.key();
    position.bond_mint = ctx.accounts.bond_nft_mint.key();
    position.amount_staked = amount;
    position.shares = shares;
    position.stake_timestamp = clock.unix_timestamp;
    position.unlock_timestamp = clock.unix_timestamp + pool.lock_duration;
    position.reward_debt = (shares as u128 * pool.reward_per_share) / PRECISION;
    position.rewards_claimed = 0;
    position.last_claim_timestamp = clock.unix_timestamp;
    position.position_number = pool.total_shares; // Incrementing ID
    position.auto_compound = false; // Default
    
    // Mint NFT receipt
    mint_bond_nft(
        ctx.accounts,
        &pool,
        &position,
        amount,
        shares,
    )?;
    
    // Update pool state
    pool.total_staked += amount;
    pool.total_shares += shares;
    
    // Update factory TVL
    factory.current_tvl += amount;
    factory.total_value_locked += amount as u128;
    
    emit!(BondCreated {
        staker: ctx.accounts.staker.key(),
        pool: pool.key(),
        amount,
        shares,
        unlock_timestamp: position.unlock_timestamp,
        nft_mint: position.bond_mint,
    });
    
    Ok(())
}
```

### 4.3 Distribute Yield from Page Burns
```rust
pub fn distribute_yield(
    ctx: Context<DistributeYield>,
    burn_amount: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let factory = &mut ctx.accounts.factory_state;
    
    // Only callable by thermostat when page burns occur
    require!(
        ctx.accounts.caller.key() == thermostat::ID,
        ErrorCode::UnauthorizedCaller
    );
    
    // Pool must have stakers
    require!(
        pool.total_shares > 0,
        ErrorCode::NoStakers
    );
    
    // Calculate split: 90% burn, 10% to stakers
    let burn_portion = (burn_amount as u128 * 90) / 100;
    let staker_portion = burn_amount as u128 - burn_portion;
    
    // Burn the 90%
    burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.ac_mint.to_account_info(),
                from: ctx.accounts.burn_source.to_account_info(),
                authority: ctx.accounts.burn_authority.to_account_info(),
            },
        ),
        burn_portion as u64,
    )?;
    
    // Distribute 10% to pool
    update_pool_rewards(pool)?;
    
    // Add rewards to pool
    pool.reward_per_share += (staker_portion * PRECISION) / pool.total_shares as u128;
    pool.total_yield_accumulated += burn_amount as u128;
    pool.total_yield_burned += burn_portion;
    pool.total_yield_distributed += staker_portion;
    
    // Update factory stats
    factory.total_burned_from_yield += burn_portion;
    
    emit!(YieldDistributed {
        pool: pool.key(),
        total_amount: burn_amount,
        burned: burn_portion as u64,
        to_stakers: staker_portion as u64,
        new_reward_per_share: pool.reward_per_share,
    });
    
    Ok(())
}
```

### 4.4 Claim Rewards
```rust
pub fn claim_rewards(
    ctx: Context<ClaimRewards>,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;
    
    // Verify ownership
    require!(
        ctx.accounts.claimant.key() == position.owner,
        ErrorCode::NotPositionOwner
    );
    
    // Update pool rewards
    update_pool_rewards(pool)?;
    
    // Calculate pending rewards
    let pending = calculate_pending_rewards(position, pool)?;
    
    if pending == 0 {
        return Ok(());
    }
    
    // Transfer rewards
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_ac_account.to_account_info(),
                to: ctx.accounts.claimant_ac_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[&pool_seeds(pool)],
        ),
        pending,
    )?;
    
    // Update position
    position.reward_debt = (position.shares as u128 * pool.reward_per_share) / PRECISION;
    position.rewards_claimed += pending;
    position.last_claim_timestamp = clock.unix_timestamp;
    
    emit!(RewardsClaimed {
        claimant: ctx.accounts.claimant.key(),
        pool: pool.key(),
        amount: pending,
        total_claimed: position.rewards_claimed,
    });
    
    Ok(())
}
```

### 4.5 Withdraw Stake (After Unlock)
```rust
pub fn withdraw_stake(
    ctx: Context<WithdrawStake>,
    shares_to_withdraw: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let position = &mut ctx.accounts.position;
    let factory = &mut ctx.accounts.factory_state;
    let clock = Clock::get()?;
    
    // Check unlock time
    require!(
        clock.unix_timestamp >= position.unlock_timestamp,
        ErrorCode::StillLocked
    );
    
    // Validate shares
    require!(
        shares_to_withdraw <= position.shares,
        ErrorCode::InsufficientShares
    );
    
    // Claim pending rewards first
    claim_rewards_internal(ctx.accounts, position, pool)?;
    
    // Calculate AC-D to return
    let amount_to_return = (shares_to_withdraw as u128 * pool.total_staked as u128 / 
                           pool.total_shares as u128) as u64;
    
    // Transfer AC-D back
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_ac_account.to_account_info(),
                to: ctx.accounts.withdrawer_ac_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[&pool_seeds(pool)],
        ),
        amount_to_return,
    )?;
    
    // Update position
    position.shares -= shares_to_withdraw;
    position.amount_staked = (position.amount_staked as u128 * 
                             position.shares as u128 / 
                             (position.shares + shares_to_withdraw) as u128) as u64;
    
    // Update pool
    pool.total_shares -= shares_to_withdraw;
    pool.total_staked -= amount_to_return;
    
    // Update factory TVL
    factory.current_tvl -= amount_to_return;
    
    // Burn NFT if fully withdrawn
    if position.shares == 0 {
        burn_bond_nft(ctx.accounts, &position.bond_mint)?;
    }
    
    emit!(StakeWithdrawn {
        withdrawer: ctx.accounts.withdrawer.key(),
        pool: pool.key(),
        shares: shares_to_withdraw,
        amount: amount_to_return,
        remaining_shares: position.shares,
    });
    
    Ok(())
}
```

---
## 5. Helper Functions

### 5.1 Reward Calculations
```rust
const PRECISION: u128 = 1e12 as u128;

fn calculate_pending_rewards(
    position: &BondPosition,
    pool: &BondPool,
) -> Result<u64> {
    let accumulated = (position.shares as u128 * pool.reward_per_share) / PRECISION;
    let pending = accumulated.saturating_sub(position.reward_debt);
    
    Ok(pending as u64)
}

fn update_pool_rewards(pool: &mut BondPool) -> Result<()> {
    // Called before any stake/unstake/claim
    // In practice, rewards come from distribute_yield calls
    // This is placeholder for any auto-compounding logic
    
    Ok(())
}
```

### 5.2 NFT Generation
```rust
fn mint_bond_nft<'info>(
    accounts: &MintNFTAccounts<'info>,
    pool: &BondPool,
    position: &BondPosition,
    amount: u64,
    shares: u64,
) -> Result<()> {
    // Create mint
    let mint_rent = Rent::get()?.minimum_balance(Mint::LEN);
    create_account(
        CpiContext::new(
            accounts.system_program.to_account_info(),
            CreateAccount {
                from: accounts.staker.to_account_info(),
                to: accounts.nft_mint.to_account_info(),
            },
        ),
        mint_rent,
        Mint::LEN as u64,
        &accounts.token_program.key(),
    )?;
    
    // Initialize mint (supply = 1)
    initialize_mint(
        CpiContext::new(
            accounts.token_program.to_account_info(),
            InitializeMint {
                mint: accounts.nft_mint.to_account_info(),
                rent: accounts.rent.to_account_info(),
            },
        ),
        0, // No decimals for NFT
        &accounts.mint_authority.key(),
        Some(&accounts.mint_authority.key()), // Freeze authority
    )?;
    
    // Mint to staker
    mint_to(
        CpiContext::new_with_signer(
            accounts.token_program.to_account_info(),
            MintTo {
                mint: accounts.nft_mint.to_account_info(),
                to: accounts.staker_nft_account.to_account_info(),
                authority: accounts.mint_authority.to_account_info(),
            },
            &[&[b"mint_authority", &[accounts.bumps.mint_authority]]],
        ),
        1,
    )?;
    
    // Create metadata
    let site_name = get_site_name(&pool.site_hash)?;
    let lock_days = pool.lock_duration / 86400;
    
    create_metadata_accounts_v3(
        CpiContext::new_with_signer(
            accounts.metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: accounts.metadata.to_account_info(),
                mint: accounts.nft_mint.to_account_info(),
                mint_authority: accounts.mint_authority.to_account_info(),
                payer: accounts.staker.to_account_info(),
                update_authority: accounts.mint_authority.to_account_info(),
                system_program: accounts.system_program.to_account_info(),
                rent: accounts.rent.to_account_info(),
            },
            &[&[b"mint_authority", &[accounts.bumps.mint_authority]]],
        ),
        DataV2 {
            name: format!("PSAB #{} - {}", position.position_number, site_name),
            symbol: "PSAB".to_string(),
            uri: generate_metadata_uri(pool, position, amount)?,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        },
        true,
        true,
        None,
    )?;
    
    Ok(())
}
```

---
## 6. View Functions

### 6.1 Get Pool Stats
```rust
pub fn get_pool_stats(pool_pubkey: Pubkey) -> Result<PoolStats> {
    let pool = Account::<BondPool>::try_from(&pool_pubkey)?;
    
    // Calculate APY based on recent yield
    let apy = calculate_pool_apy(&pool)?;
    
    Ok(PoolStats {
        total_staked: pool.total_staked,
        total_shares: pool.total_shares,
        staker_count: get_staker_count(&pool_pubkey)?,
        total_yield_earned: pool.total_yield_accumulated,
        burn_percentage: 90,
        current_apy: apy,
        time_to_unlock: pool.lock_duration,
    })
}
```

### 6.2 Get User Positions
```rust
pub fn get_user_positions(user: Pubkey) -> Result<Vec<PositionInfo>> {
    // Query all positions for user
    let positions = get_program_accounts_filtered(
        &bond_pool_factory::ID,
        &[
            Filter::DataSize(BondPosition::SIZE),
            Filter::Memcmp {
                offset: 8, // After discriminator
                bytes: user.to_bytes(),
            },
        ],
    )?;
    
    positions.into_iter()
        .map(|(_, account)| {
            let position = BondPosition::try_deserialize(&mut &account.data[..])?;
            let pool = get_pool(&position.pool)?;
            let pending = calculate_pending_rewards(&position, &pool)?;
            
            Ok(PositionInfo {
                pool: position.pool,
                amount_staked: position.amount_staked,
                shares: position.shares,
                unlock_time: position.unlock_timestamp,
                pending_rewards: pending,
                total_claimed: position.rewards_claimed,
                nft_mint: position.bond_mint,
            })
        })
        .collect()
}
```

---
## 7. Economic Analysis

### 7.1 Yield Sources
```
Page becomes hot → Visitors burn AC-D → 90% burned, 10% to pool → 
Stakers earn from visitor burns
```

### 7.2 APY Projections
```rust
// Example calculation
const DAILY_PAGE_VISITORS: u64 = 10_000;
const AVG_BURN_PER_VISITOR: u64 = 10_000_000_000; // 10 AC-D
const POOL_TVL: u64 = 10_000_000_000_000_000; // 10M AC-D

let daily_burns = DAILY_PAGE_VISITORS * AVG_BURN_PER_VISITOR;
let daily_to_stakers = daily_burns / 10; // 10%
let daily_yield_rate = daily_to_stakers as f64 / POOL_TVL as f64;
let apy = ((1.0 + daily_yield_rate).powf(365.0) - 1.0) * 100.0;
// APY ≈ 36.5%
```

### 7.3 Burn Amplification
```
Without PSAB: User burns X tokens on hot page
With PSAB: User burns X tokens → 0.9X burned forever → Net burn increased by 90%
```

---
## 8. Security Considerations

### 8.1 Attack Vectors
| Attack | Mitigation |
|--------|-----------|
| Rug pull | Tokens locked in program PDA |
| Yield manipulation | Only thermostat can distribute |
| Share dilution | Proportional share calculation |
| Front-running stakes | Rewards distributed fairly |
| NFT exploits | Non-transferable until unlock |

### 8.2 Invariants
1. `total_shares * reward_per_share = total_rewards`
2. `sum(position.shares) = pool.total_shares`
3. `sum(position.amount) ≤ pool.total_staked` (due to rounding)
4. `pool.yield_burned + pool.yield_distributed = pool.yield_accumulated`

---
## 9. Testing

### 9.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_proportional_rewards() {
        let mut test = setup_test().await;
        
        // Alice stakes 1000 AC-D
        stake(&mut test, alice, 1000_000_000_000).await?;
        
        // Bob stakes 3000 AC-D
        stake(&mut test, bob, 3000_000_000_000).await?;
        
        // Pool receives 1000 AC-D yield
        distribute_yield(&mut test, 1000_000_000_000).await?;
        
        // Check rewards (10% of yield distributed)
        // Alice should get 25 AC-D (25% of 100)
        // Bob should get 75 AC-D (75% of 100)
        
        let alice_pending = get_pending_rewards(&test, alice).await;
        let bob_pending = get_pending_rewards(&test, bob).await;
        
        assert_eq!(alice_pending, 25_000_000_000);
        assert_eq!(bob_pending, 75_000_000_000);
        
        // Verify 90% was burned
        let burned = get_total_burned(&test).await;
        assert_eq!(burned, 900_000_000_000);
    }
    
    #[tokio::test]
    async fn test_lock_enforcement() {
        let mut test = setup_test().await;
        
        // Stake with 30-day lock
        stake(&mut test, user, 1000_000_000_000).await?;
        
        // Try immediate withdrawal - should fail
        let result = withdraw(&mut test, user, 1000_000_000_000).await;
        assert_eq!(result.unwrap_err(), ErrorCode::StillLocked);
        
        // Fast forward 31 days
        test.warp_slot(31 * 24 * 3600 * 2).await;
        
        // Now withdrawal should work
        withdraw(&mut test, user, 1000_000_000_000).await?;
    }
}
```

### 9.2 Simulation Tests
```rust
#[tokio::test]
async fn test_pool_economics() {
    let mut sim = PoolSimulation::new();
    
    // Add stakers with different amounts and times
    for i in 0..100 {
        sim.add_staker(
            stake_amount: rand_range(100, 10_000) * 1e9,
            stake_day: rand_range(0, 30),
        );
    }
    
    // Simulate daily burns for 180 days
    for day in 0..180 {
        let daily_burns = simulate_page_traffic(day);
        sim.distribute_yield(daily_burns);
        
        // Some stakers withdraw after unlock
        sim.process_withdrawals(day);
        
        // New stakers join based on APY
        if sim.current_apy() > 20.0 {
            sim.add_new_stakers(rand_range(1, 10));
        }
    }
    
    // Verify economics
    assert!(sim.total_burned > sim.total_distributed * 8);
    assert!(sim.average_staker_profit() > 0);
    assert!(sim.tvl_growth() > 0);
}
```

---
## 10. Integration Examples

### 10.1 Site Owner Integration
```typescript
// Create staking pool for your site
async function createStakingPool(siteName: string) {
    const siteHash = sha256(siteName);
    
    const params = {
        site_hash: siteHash,
        lock_duration: 30 * 24 * 60 * 60, // 30 days
        min_stake_amount: 100_000_000_000, // 100 AC-D
        max_stake_amount: 10_000_000_000_000, // 10k AC-D
    };
    
    const tx = await bondPoolFactory.createBondPool(params);
    
    // Add to site dashboard
    await updateSiteDashboard({
        stakingPoolAddress: derivePDA(['pool', siteHash]),
        stakingEnabled: true,
    });
}
```

### 10.2 Staking Widget
```jsx
function StakingWidget({ siteHash }) {
    const [pool, setPool] = useState(null);
    const [amount, setAmount] = useState('');
    
    const stake = async () => {
        const tx = await bondPoolFactory.stakeInPool({
            pool: pool.address,
            amount: parseFloat(amount) * 1e9,
        });
        
        // Show NFT receipt
        showNFTModal(tx.nftMint);
    };
    
    return (
        <div className="staking-widget">
            <h3>Stake on {pool?.siteName}</h3>
            <div className="stats">
                <Stat label="APY" value={`${pool?.apy}%`} />
                <Stat label="Lock Period" value={`${pool?.lockDays} days`} />
                <Stat label="Total Staked" value={`${pool?.tvl} AC-D`} />
            </div>
            
            <Input
                type="number"
                value={amount}
                onChange={setAmount}
                placeholder="Amount to stake"
            />
            
            <Button onClick={stake}>
                Stake & Lock for {pool?.lockDays} days
            </Button>
        </div>
    );
}
```

---
## 11. Monitoring & Analytics

### 11.1 Key Metrics
```sql
-- Pool performance
SELECT 
    p.site_hash,
    s.domain,
    p.total_staked / 1e9 as tvl_ac,
    p.total_shares,
    COUNT(DISTINCT pos.owner) as staker_count,
    p.total_yield_accumulated / 1e9 as total_yield_ac,
    p.total_yield_burned / 1e9 as burned_ac,
    (p.total_yield_distributed::numeric / NULLIF(p.total_staked, 0) * 365 * 100) as apy
FROM bond_pools p
JOIN sites s ON s.hash = p.site_hash
LEFT JOIN bond_positions pos ON pos.pool = p.pubkey
WHERE p.active = true
GROUP BY p.pubkey, s.domain;

-- Staker analytics
SELECT 
    DATE(to_timestamp(stake_timestamp)) as stake_date,
    COUNT(*) as new_stakes,
    SUM(amount_staked) / 1e9 as total_staked_ac,
    AVG(amount_staked) / 1e9 as avg_stake_ac,
    COUNT(DISTINCT owner) as unique_stakers
FROM bond_positions
WHERE stake_timestamp > extract(epoch from NOW() - INTERVAL '30 days')
GROUP BY DATE(to_timestamp(stake_timestamp))
ORDER BY stake_date DESC;

-- Burn efficiency
SELECT 
    DATE(timestamp) as date,
    SUM(CASE WHEN event_type = 'yield_burn' THEN amount ELSE 0 END) / 1e9 as burned_ac,
    SUM(CASE WHEN event_type = 'yield_distribute' THEN amount ELSE 0 END) / 1e9 as distributed_ac,
    SUM(CASE WHEN event_type = 'yield_burn' THEN amount ELSE 0 END)::numeric /
        NULLIF(SUM(amount), 0) * 100 as burn_percentage
FROM psab_events
WHERE timestamp > extract(epoch from NOW() - INTERVAL '7 days')
GROUP BY DATE(timestamp);
```

### 11.2 Alerts
```yaml
- alert: PSABPoolUnhealthy
  expr: |
    (bond_pool_total_staked - bond_pool_total_shares) / bond_pool_total_staked > 0.01
  annotations:
    summary: "Pool accounting mismatch >1%"

- alert: HighYieldVariance
  expr: |
    stddev_over_time(bond_pool_daily_yield[7d]) / avg_over_time(bond_pool_daily_yield[7d]) > 0.5
  annotations:
    summary: "Pool yield volatility >50%"

- alert: StakerExodus
  expr: |
    rate(bond_pool_withdrawals[1h]) > rate(bond_pool_stakes[1h]) * 2
  for: 2h
  annotations:
    summary: "Withdrawals exceeding stakes 2:1"
```

---
## 12. Future Enhancements

### 12.1 Variable Lock Periods
Allow stakers to choose lock duration with corresponding yield multipliers.

### 12.2 veToken Model
Longer locks get voting power in site governance.

### 12.3 Boost Mechanism
Site owners can add bonus rewards to attract stakers.

### 12.4 Cross-Pool Strategies
Allow staking across multiple site pools for diversification.

---
End of file 