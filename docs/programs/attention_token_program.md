# Attention Token Program (`attention_token`)

Program ID: `ATTN11111111111111111111111111111111111111111`  •  Language: Rust (Anchor)  •  Token: AC-D

---
## 1. Purpose
Implements the AC-D (Attention Coin - Decaying) token with a daily 0.5% decay mechanism. This is the core utility token of AHEE that decreases in balance automatically each day, creating natural circulation pressure and funding the protocol treasury.

---
## 2. Key Features
- **Daily Decay**: All balances reduce by 0.5% at UTC midnight
- **SPL Token Compatible**: Works with wallets, DEXes, and DeFi
- **Atomic Rebase**: Single transaction updates all balances
- **Revenue Generation**: Decay funds protocol operations
- **Floor Price Support**: 90% of decay goes to PCFT

---
## 3. Account Structure

### 3.1 Token Mint
```rust
// Standard SPL Token mint with extensions
pub struct AttentionTokenMint {
    // SPL Token fields
    pub mint_authority: COption<Pubkey>,    // Set to PDA
    pub supply: u64,                        // Total supply
    pub decimals: u8,                       // 9 decimals
    pub is_initialized: bool,
    pub freeze_authority: COption<Pubkey>,  // None
    
    // Extension: Rebase data
    pub last_rebase_slot: u64,
    pub last_rebase_timestamp: i64,
    pub total_rebased: u128,                // Cumulative decay
}

// Mint address: Derived from ["mint", "attention"]
```

### 3.2 Decay State
```rust
#[account]
pub struct DecayState {
    pub authority: Pubkey,                  // Multisig
    pub decay_rate_numerator: u16,          // 5 (0.5%)
    pub decay_rate_denominator: u16,        // 1000
    pub last_rebase_timestamp: i64,         // Unix timestamp
    pub last_rebase_slot: u64,              // Solana slot
    pub total_supply_snapshot: u64,         // Supply at last rebase
    pub treasury_wallet: Pubkey,            // PCFT address
    pub rebase_in_progress: bool,           // Mutex flag
    pub total_decayed_lifetime: u128,       // All-time decay
}

// PDA: ["decay_state"]
```

### 3.3 User Balance Wrapper
```rust
// Virtual balance calculation (not stored)
pub fn get_effective_balance(
    token_account: &TokenAccount,
    decay_state: &DecayState,
) -> u64 {
    let current_time = Clock::get().unwrap().unix_timestamp;
    let days_elapsed = (current_time - decay_state.last_rebase_timestamp) / 86400;
    
    if days_elapsed == 0 {
        return token_account.amount;
    }
    
    // Apply compound decay
    let decay_factor = 995u128.pow(days_elapsed as u32);
    let denominator = 1000u128.pow(days_elapsed as u32);
    
    (token_account.amount as u128 * decay_factor / denominator) as u64
}
```

---
## 4. Core Instructions

### 4.1 Initialize Program
```rust
pub fn initialize(
    ctx: Context<Initialize>,
    decay_rate_numerator: u16,
    decay_rate_denominator: u16,
) -> Result<()> {
    let decay_state = &mut ctx.accounts.decay_state;
    let clock = Clock::get()?;
    
    // Validate decay rate (max 10% daily)
    require!(
        decay_rate_numerator <= decay_rate_denominator / 10,
        ErrorCode::DecayRateTooHigh
    );
    
    decay_state.authority = ctx.accounts.authority.key();
    decay_state.decay_rate_numerator = decay_rate_numerator;
    decay_state.decay_rate_denominator = decay_rate_denominator;
    decay_state.last_rebase_timestamp = clock.unix_timestamp;
    decay_state.last_rebase_slot = clock.slot;
    decay_state.treasury_wallet = ctx.accounts.treasury.key();
    decay_state.rebase_in_progress = false;
    decay_state.total_decayed_lifetime = 0;
    
    // Initialize mint
    let mint = &mut ctx.accounts.mint;
    mint.mint_authority = COption::Some(ctx.accounts.mint_pda.key());
    mint.decimals = 9;
    mint.is_initialized = true;
    mint.freeze_authority = COption::None;
    
    emit!(ProgramInitialized {
        authority: decay_state.authority,
        decay_rate: format!("{}%", 
            decay_rate_numerator as f64 / decay_rate_denominator as f64 * 100.0
        ),
    });
    
    Ok(())
}
```

### 4.2 Daily Rebase
```rust
pub fn rebase(ctx: Context<Rebase>) -> Result<()> {
    let decay_state = &mut ctx.accounts.decay_state;
    let clock = Clock::get()?;
    
    // Check if rebase is due (once per day)
    let current_day = clock.unix_timestamp / 86400;
    let last_rebase_day = decay_state.last_rebase_timestamp / 86400;
    
    require!(
        current_day > last_rebase_day,
        ErrorCode::RebaseNotDue
    );
    
    // Prevent concurrent rebase
    require!(
        !decay_state.rebase_in_progress,
        ErrorCode::RebaseInProgress
    );
    
    decay_state.rebase_in_progress = true;
    
    // Calculate decay amount
    let current_supply = ctx.accounts.mint.supply;
    let decay_amount = (current_supply as u128 * 
        decay_state.decay_rate_numerator as u128 / 
        decay_state.decay_rate_denominator as u128) as u64;
    
    // Burn tokens (reduces supply)
    token::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.rebase_token_account.to_account_info(),
                authority: ctx.accounts.mint_pda.to_account_info(),
            },
            &[&[b"mint", b"attention", &[ctx.bumps.mint_pda]]],
        ),
        decay_amount,
    )?;
    
    // Mint equivalent USDC value to treasury
    let usdc_amount = calculate_usdc_value(decay_amount, &ctx.accounts.price_oracle)?;
    mint_usdc_to_treasury(ctx, usdc_amount)?;
    
    // Update state
    decay_state.last_rebase_timestamp = clock.unix_timestamp;
    decay_state.last_rebase_slot = clock.slot;
    decay_state.total_supply_snapshot = current_supply - decay_amount;
    decay_state.total_decayed_lifetime += decay_amount as u128;
    decay_state.rebase_in_progress = false;
    
    emit!(RebaseCompleted {
        timestamp: clock.unix_timestamp,
        supply_before: current_supply,
        supply_after: current_supply - decay_amount,
        decay_amount,
        usdc_minted: usdc_amount,
    });
    
    Ok(())
}
```

### 4.3 Mint Tokens
```rust
pub fn mint_to(
    ctx: Context<MintTo>,
    amount: u64,
) -> Result<()> {
    // Only authorized minters (Explorer, Referral, etc.)
    require!(
        is_authorized_minter(&ctx.accounts.minter.key()),
        ErrorCode::UnauthorizedMinter
    );
    
    // Check daily mint cap
    let daily_mint_cap = get_daily_mint_cap(&ctx.accounts.mint)?;
    let minted_today = get_minted_today(&ctx.accounts.mint_stats)?;
    
    require!(
        minted_today + amount <= daily_mint_cap,
        ErrorCode::DailyMintCapExceeded
    );
    
    // Mint tokens
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.mint_pda.to_account_info(),
            },
            &[&[b"mint", b"attention", &[ctx.bumps.mint_pda]]],
        ),
        amount,
    )?;
    
    // Update daily stats
    update_mint_stats(&mut ctx.accounts.mint_stats, amount)?;
    
    emit!(TokensMinted {
        minter: ctx.accounts.minter.key(),
        recipient: ctx.accounts.destination.key(),
        amount,
        purpose: get_mint_purpose(&ctx.accounts.minter.key()),
    });
    
    Ok(())
}
```

### 4.4 Burn Tokens
```rust
pub fn burn(
    ctx: Context<Burn>,
    amount: u64,
) -> Result<()> {
    // Anyone can burn their own tokens
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.source.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;
    
    // Track burn source for analytics
    let burn_type = classify_burn_source(&ctx.accounts.source.key());
    
    emit!(TokensBurned {
        burner: ctx.accounts.owner.key(),
        amount,
        burn_type,
        remaining_balance: ctx.accounts.source.amount - amount,
    });
    
    Ok(())
}
```

---
## 5. Helper Functions

### 5.1 Price Oracle Integration
```rust
fn calculate_usdc_value(
    ac_amount: u64,
    price_oracle: &AccountInfo,
) -> Result<u64> {
    // Read from Pyth/Switchboard median
    let price_data = PriceOracle::try_deserialize(
        &mut &price_oracle.data.borrow()[..]
    )?;
    
    // Validate freshness
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp - price_data.timestamp < 600, // 10 min
        ErrorCode::StalePriceData
    );
    
    // Calculate USDC value (6 decimals)
    let ac_amount_scaled = ac_amount as u128 * 1_000_000; // to 6 decimals
    let price_scaled = price_data.price as u128; // already in 10^-6 USDC per AC
    
    Ok((ac_amount_scaled * price_scaled / 1_000_000_000) as u64)
}
```

### 5.2 Authorized Minters
```rust
fn is_authorized_minter(pubkey: &Pubkey) -> bool {
    match *pubkey {
        explorer_referral::EXPLORER_PDA => true,
        explorer_referral::REFERRAL_PDA => true,
        campaign_reward_router::CAMPAIGN_PDA => true,
        _ => false,
    }
}

fn get_mint_purpose(minter: &Pubkey) -> &'static str {
    match *minter {
        explorer_referral::EXPLORER_PDA => "explorer_reward",
        explorer_referral::REFERRAL_PDA => "referral_bonus",
        campaign_reward_router::CAMPAIGN_PDA => "campaign_payout",
        _ => "unknown",
    }
}
```

### 5.3 Daily Stats Tracking
```rust
#[account]
pub struct DailyMintStats {
    pub date: i64,              // UTC day number
    pub explorer_minted: u64,
    pub referral_minted: u64,
    pub campaign_minted: u64,
    pub total_minted: u64,
    pub total_burned: u64,
    pub unique_recipients: u32,
}

fn update_mint_stats(
    stats: &mut Account<DailyMintStats>,
    amount: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_day = clock.unix_timestamp / 86400;
    
    // Reset if new day
    if stats.date != current_day {
        stats.date = current_day;
        stats.explorer_minted = 0;
        stats.referral_minted = 0;
        stats.campaign_minted = 0;
        stats.total_minted = 0;
        stats.total_burned = 0;
        stats.unique_recipients = 0;
    }
    
    stats.total_minted += amount;
    // Update category-specific counters...
    
    Ok(())
}
```

---
## 6. Supply Dynamics

### 6.1 Daily Flow Equation
```
ΔS = Mints - Burns - Decay

Where:
- Mints = Explorer + Referral + Campaign rewards
- Burns = Hot page burns + CHB + Buyback + User burns  
- Decay = 0.005 * S

Target: ΔS ≤ 0 (non-inflationary)
```

### 6.2 Mint Caps
```rust
fn get_daily_mint_cap(mint: &Account<Mint>) -> Result<u64> {
    let current_supply = mint.supply;
    
    // Base cap: 0.4% of supply (matches treasury allocation)
    let base_cap = current_supply * 4 / 1000;
    
    // Adjust based on PID controller gain
    let gain = get_pid_gain()?;
    let adjusted_cap = if gain < 0.0 {
        // Reduce minting when supply too high
        (base_cap as f64 * (1.0 + gain)) as u64
    } else {
        base_cap // Never increase beyond base
    };
    
    Ok(adjusted_cap)
}
```

---
## 7. Integration with Other Programs

### 7.1 Treasury Splitter CPI
```rust
fn mint_usdc_to_treasury(
    ctx: Context<Rebase>,
    usdc_amount: u64,
) -> Result<()> {
    // Call treasury_splitter program
    let cpi_accounts = SplitRevenue {
        treasury_pda: ctx.accounts.treasury.to_account_info(),
        usdc_mint: ctx.accounts.usdc_mint.to_account_info(),
        pcft_account: ctx.accounts.pcft_account.to_account_info(),
        explorer_pot: ctx.accounts.explorer_pot.to_account_info(),
        referral_pot: ctx.accounts.referral_pot.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.treasury_splitter.to_account_info(),
        cpi_accounts,
        &[&[b"mint", b"attention", &[ctx.bumps.mint_pda]]],
    );
    
    treasury_splitter::cpi::split_revenue(cpi_ctx, usdc_amount)?;
    
    Ok(())
}
```

### 7.2 Explorer/Referral Minting
```rust
// Called by explorer_referral program
pub fn authorized_mint(
    ctx: Context<AuthorizedMint>,
    recipient: Pubkey,
    amount: u64,
    mint_type: MintType,
) -> Result<()> {
    // Verify caller is authorized program
    require!(
        ctx.accounts.caller_program.key() == explorer_referral::ID,
        ErrorCode::UnauthorizedProgram
    );
    
    // Delegate to mint_to
    mint_to(
        Context::new(
            ctx.program_id,
            ctx.accounts.into(),
            ctx.remaining_accounts,
            ctx.bumps.clone(),
        ),
        amount,
    )
}
```

---
## 8. Security Considerations

### 8.1 Attack Vectors
| Attack | Mitigation | Risk |
|--------|-----------|------|
| Rebase front-running | Single daily execution | Low |
| Mint authority abuse | PDA-only mint authority | None |
| Price manipulation | Median of 2 oracles + staleness check | Low |
| Double rebase | Mutex flag + timestamp check | None |
| Supply inflation | Hard caps + PID control | Low |

### 8.2 Emergency Controls
```rust
pub fn emergency_pause_minting(
    ctx: Context<EmergencyPause>,
) -> Result<()> {
    require!(
        ctx.accounts.authority.key() == ctx.accounts.decay_state.authority,
        ErrorCode::UnauthorizedAuthority
    );
    
    ctx.accounts.mint_state.minting_paused = true;
    
    emit!(MintingPaused {
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
```

---
## 9. Testing

### 9.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_daily_decay() {
        let mut test = ProgramTest::new(...);
        
        // Setup
        let initial_supply = 1_000_000_000; // 1M AC
        initialize_and_mint(&mut test, initial_supply).await;
        
        // Fast forward 1 day
        test.warp_to_slot(SLOTS_PER_DAY).unwrap();
        
        // Execute rebase
        let tx = rebase(&mut test).await;
        assert!(tx.is_ok());
        
        // Check supply decreased by 0.5%
        let new_supply = get_supply(&mut test).await;
        assert_eq!(new_supply, 995_000_000); // 0.995 * 1M
        
        // Check USDC minted to treasury
        let treasury_balance = get_usdc_balance(&mut test, TREASURY).await;
        assert!(treasury_balance > 0);
    }
    
    #[tokio::test]
    async fn test_compound_decay() {
        // Test multiple days without rebase
        let balance = 1_000_000;
        
        // Day 0: 1,000,000
        // Day 1: 995,000 (0.5% decay)
        // Day 2: 990,025 (0.5% of 995,000)
        // Day 3: 985,074.875
        
        let effective = get_effective_balance(balance, 3);
        assert_eq!(effective, 985_074); // Rounded down
    }
}
```

### 9.2 Integration Tests
```rust
#[tokio::test]
async fn test_mint_cap_enforcement() {
    let mut test = setup_program().await;
    
    // Get daily cap
    let cap = get_daily_mint_cap(&mut test).await;
    
    // Try to mint exactly at cap - should succeed
    mint_tokens(&mut test, cap).await.unwrap();
    
    // Try to mint 1 more - should fail
    let result = mint_tokens(&mut test, 1).await;
    assert_eq!(
        result.unwrap_err().unwrap(),
        ErrorCode::DailyMintCapExceeded.into()
    );
}
```

### 9.3 Fuzz Tests
```rust
proptest! {
    #[test]
    fn fuzz_decay_calculation(
        supply in 1_000_000u64..1_000_000_000_000u64,
        days in 1u32..365u32,
    ) {
        let decayed = calculate_compound_decay(supply, days, 5, 1000);
        
        // Supply should always decrease
        prop_assert!(decayed < supply);
        
        // Should never go negative or overflow
        prop_assert!(decayed > 0);
        
        // Max yearly decay ~84% (0.995^365 ≈ 0.16)
        if days == 365 {
            prop_assert!(decayed > supply * 15 / 100);
        }
    }
}
```

---
## 10. Monitoring & Analytics

### 10.1 Key Metrics
```sql
-- Daily supply tracking
CREATE VIEW supply_metrics AS
SELECT 
    date_trunc('day', timestamp) as day,
    MAX(total_supply) as supply_start,
    MIN(total_supply) as supply_end,
    SUM(mint_amount) as total_minted,
    SUM(burn_amount) as total_burned,
    MAX(decay_amount) as daily_decay,
    MIN(total_supply) - MAX(total_supply) as net_change
FROM token_events
GROUP BY date_trunc('day', timestamp);

-- Mint source breakdown
CREATE VIEW mint_sources AS
SELECT 
    date_trunc('hour', timestamp) as hour,
    mint_purpose,
    COUNT(*) as mint_count,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount
FROM mint_events
GROUP BY date_trunc('hour', timestamp), mint_purpose;
```

### 10.2 Alerts
```yaml
- name: SupplyInflation
  expr: |
    (attention_token_supply - attention_token_supply[1d]) / attention_token_supply[1d] > 0.001
  for: 1h
  annotations:
    summary: "AC-D supply increasing (current: {{ $value | humanizePercentage }})"

- name: RebaseMissed  
  expr: |
    time() - attention_token_last_rebase_timestamp > 90000  # 25 hours
  annotations:
    summary: "Daily rebase overdue"

- name: MintCapApproaching
  expr: |
    attention_token_daily_minted / attention_token_daily_cap > 0.9
  annotations:
    summary: "Daily mint cap 90% utilized"
```

---
## 11. User Experience

### 11.1 Wallet Integration
AC-D appears as a normal SPL token in wallets, but with a note about daily decay. Wallets can optionally show:
- Current balance
- Effective balance (after pending decay)
- Time until next decay
- Historical decay chart

### 11.2 DEX Trading
Works normally on Orca, Raydium, etc. Arbitrageurs naturally handle post-decay price adjustments.

### 11.3 DeFi Composability
- **Lending**: Collateral value adjusts for decay
- **Staking**: Rewards must exceed decay rate
- **LPs**: Impermanent loss calculations account for decay

---
## 12. Economic Parameters

### 12.1 Tunable Values
| Parameter | Current | Range | Update Method |
|-----------|---------|-------|---------------|
| Decay rate | 0.5% | 0.1-1.0% | 7-day timelock |
| PCFT allocation | 90% | 80-95% | Governance |
| Explorer allocation | 30% | 20-40% | Governance |
| Mint cap multiplier | 0.4% | 0.2-0.6% | PID controller |

### 12.2 Supply Projections
```
Starting supply: 1,000,000,000 AC-D
After 1 year (365 decays): ~158,000,000 AC-D
After 2 years: ~25,000,000 AC-D
After 3 years: ~4,000,000 AC-D

(Assuming no mints/burns for illustration)
```

---
## 13. Deployment Checklist

- [ ] Deploy program to devnet
- [ ] Initialize with test parameters
- [ ] Run 7-day simulation
- [ ] Audit by Halborn/Kudelski
- [ ] Deploy to mainnet-beta
- [ ] Initialize with production parameters
- [ ] Test rebase with small amount
- [ ] Enable minting authorities
- [ ] Monitor first 24h cycle
- [ ] Public announcement

---
End of file 