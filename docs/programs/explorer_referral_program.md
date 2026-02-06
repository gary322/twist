# Explorer Referral Program (`explorer_referral`)

Program ID: `EXPL11111111111111111111111111111111111111111`  •  Language: Rust (Anchor)  •  Audited: Yes

---
## 1. Purpose
Manages two critical user acquisition mechanisms:
1. **Explorer Pool**: Rewards users for discovering and spending time on new, unbonded sites
2. **Referral System**: Incentivizes viral growth through user and site owner referrals

Both systems mint AC-D tokens from pre-funded USDC pots, ensuring non-inflationary rewards.

---
## 2. System Overview
```mermaid
flowchart TD
    A[VAU from Cold Site] --> B{Site Bonded?}
    B -->|No| C[Explorer Pool]
    B -->|Yes| D[Regular Thermostat]
    
    C --> E[Check κ(t) Cap]
    E --> F[Swap USDC → AC-D]
    F --> G[Mint to User]
    
    H[New User] --> I[Referral System]
    I --> J[Mint Bonus to Referrer]
    
    K[New Site Bond] --> L[Owner Referral]
    L --> M[Escrow → Delayed Payout]
```

---
## 3. Account Structure

### 3.1 Program State
```rust
#[account]
pub struct ExplorerState {
    pub authority: Pubkey,                   // Multisig
    pub daily_budget: u64,                   // USDC allocated per day
    pub slice_duration: i64,                 // 300 seconds (5 min)
    pub slices_per_day: u16,                // 288
    pub current_day: u64,                    // Days since epoch
    pub today_distributed: u64,              // USDC spent today
    pub total_distributed_lifetime: u128,     // All-time USDC
    pub kappa_oracle: Pubkey,                // Kappa oracle program
    pub price_oracle: Pubkey,                // AC/USDC price feed
}

// PDA: ["explorer_state"]
```

### 3.2 Daily Explorer Pot
```rust
#[account]
pub struct DailyExplorerPot {
    pub day_index: u64,                      // Days since epoch
    pub total_budget: u64,                   // USDC for this day
    pub remaining_budget: u64,               // USDC left
    pub slice_budgets: [u64; 288],          // Per 5-min slice
    pub current_slice: u16,                  // 0-287
    pub sites_rewarded: u32,                 // Unique sites
    pub users_rewarded: u32,                 // Unique users
}

// PDA: ["explorer_pot", day_index.to_le_bytes()]
```

### 3.3 Device Earnings Tracker
```rust
#[account]
pub struct DeviceEarnings {
    pub device_pubkey: Pubkey,               // Hardware key
    pub day_index: u64,                      
    pub explorer_earned: u64,                // AC-D from explorer
    pub referral_earned: u64,                // AC-D from referrals
    pub total_earned: u64,                   // Combined
    pub last_earn_slot: u64,                 // Anti-spam
}

// PDA: ["device_earnings", device_pubkey, day_index.to_le_bytes()]
```

### 3.4 User Referral State
```rust
#[account]
pub struct UserReferralState {
    pub user: Pubkey,                        // Referred user
    pub referrer: Pubkey,                    // Who referred them
    pub registered_at: i64,                  // Timestamp
    pub first_vau_rewarded: bool,            // One-time flag
    pub total_referral_rewards: u64,         // Paid to referrer
}

// PDA: ["user_referral", user_pubkey]
```

### 3.5 Site Referral State
```rust
#[account]
pub struct SiteReferralState {
    pub site_hash: [u8; 32],                 // SHA-256(origin)
    pub owner: Pubkey,                       // Site owner
    pub referrer: Pubkey,                    // Who referred owner
    pub bond_amount: u64,                    // Collateral staked
    pub referral_fee: u64,                   // 5% of bond
    pub bond_timestamp: i64,                 // When bonded
    pub cooldown_end: i64,                   // 24h cooldown
    pub fee_claimed: bool,                   // Payout flag
}

// PDA: ["site_referral", site_hash]
```

---
## 4. Core Instructions

### 4.1 Process Explorer VAU
```rust
pub fn process_explorer_vau(
    ctx: Context<ProcessExplorerVAU>,
    vau: VerifiedAttentionUnit,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_day = (clock.unix_timestamp / 86400) as u64;
    let current_slice = ((clock.unix_timestamp % 86400) / 300) as u16;
    
    // Verify VAU authenticity (already done by Edge)
    require!(
        vau.verified,
        ErrorCode::UnverifiedVAU
    );
    
    // Check site is unbonded
    let site_bonded = is_site_bonded(&vau.site_hash)?;
    require!(
        !site_bonded,
        ErrorCode::SiteAlreadyBonded
    );
    
    // Get or create device earnings tracker
    let device_earnings = &mut ctx.accounts.device_earnings;
    if device_earnings.day_index != current_day {
        // Reset for new day
        device_earnings.day_index = current_day;
        device_earnings.explorer_earned = 0;
        device_earnings.referral_earned = 0;
        device_earnings.total_earned = 0;
    }
    
    // Check κ(t) cap
    let kappa = get_current_kappa(&ctx.accounts.kappa_oracle)?;
    let remaining_cap = kappa.saturating_sub(device_earnings.total_earned);
    
    if remaining_cap == 0 {
        msg!("Device {} hit daily cap", vau.device_pubkey);
        return Ok(());
    }
    
    // Get daily pot
    let pot = &mut ctx.accounts.daily_pot;
    require!(
        pot.day_index == current_day,
        ErrorCode::PotDayMismatch
    );
    
    // Calculate reward from slice budget
    let slice_budget = pot.slice_budgets[current_slice as usize];
    let slice_remaining = pot.remaining_budget.min(slice_budget);
    
    // Simple proportional: more time = more reward
    let base_reward_usdc = calculate_explorer_reward(
        vau.seconds,
        slice_remaining,
        get_slice_competition_estimate()?
    );
    
    // Cap by remaining budget and κ
    let reward_usdc = base_reward_usdc
        .min(slice_remaining)
        .min(remaining_cap * get_ac_price()? / 1_000_000_000);
    
    if reward_usdc == 0 {
        return Ok(());
    }
    
    // Swap USDC for AC-D
    let reward_ac = swap_usdc_for_ac(
        ctx.accounts,
        reward_usdc,
        &[&[b"explorer_pot", &current_day.to_le_bytes()]]
    )?;
    
    // Mint AC-D to user
    mint_ac_to_user(
        ctx.accounts,
        &vau.user_wallet,
        reward_ac
    )?;
    
    // Update tracking
    pot.remaining_budget -= reward_usdc;
    device_earnings.explorer_earned += reward_ac;
    device_earnings.total_earned += reward_ac;
    device_earnings.last_earn_slot = clock.slot;
    
    // Update stats
    pot.sites_rewarded = pot.sites_rewarded.saturating_add(1); // Approximate
    pot.users_rewarded = pot.users_rewarded.saturating_add(1);
    
    emit!(ExplorerReward {
        user: vau.user_wallet,
        device: vau.device_pubkey,
        site_hash: vau.site_hash,
        seconds: vau.seconds,
        reward_ac,
        reward_usdc,
        slice: current_slice,
    });
    
    Ok(())
}
```

### 4.2 Register User Referral
```rust
pub fn register_referral(
    ctx: Context<RegisterReferral>,
    referrer: Pubkey,
) -> Result<()> {
    let referral_state = &mut ctx.accounts.referral_state;
    let clock = Clock::get()?;
    
    // One-time registration
    require!(
        referral_state.referrer == Pubkey::default(),
        ErrorCode::AlreadyReferred
    );
    
    // Can't self-refer
    require!(
        referrer != ctx.accounts.user.key(),
        ErrorCode::SelfReferral
    );
    
    // Referrer must exist
    require!(
        account_exists(&referrer)?,
        ErrorCode::InvalidReferrer
    );
    
    referral_state.user = ctx.accounts.user.key();
    referral_state.referrer = referrer;
    referral_state.registered_at = clock.unix_timestamp;
    referral_state.first_vau_rewarded = false;
    referral_state.total_referral_rewards = 0;
    
    emit!(ReferralRegistered {
        user: ctx.accounts.user.key(),
        referrer,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}
```

### 4.3 Process First VAU Referral Bonus
```rust
pub fn process_first_vau_bonus(
    ctx: Context<ProcessFirstVAU>,
    vau: VerifiedAttentionUnit,
) -> Result<()> {
    let referral = &mut ctx.accounts.user_referral;
    let clock = Clock::get()?;
    
    // Check if bonus already paid
    require!(
        !referral.first_vau_rewarded,
        ErrorCode::BonusAlreadyPaid
    );
    
    // Verify this is user's first VAU
    require!(
        vau.user_wallet == referral.user,
        ErrorCode::UserMismatch
    );
    
    // Get referral caps
    let kappa = get_current_kappa(&ctx.accounts.kappa_oracle)?;
    let referral_cap = kappa / 2; // ϖ(t) = κ(t) / 2
    
    // Fixed bonus amount
    let bonus_amount = FIRST_VAU_BONUS.min(referral_cap); // 25 AC-D default
    
    // Check referral pot has funds
    let pot = &mut ctx.accounts.referral_pot;
    let bonus_usdc = bonus_amount * get_ac_price()? / 1_000_000_000;
    
    require!(
        pot.remaining_budget >= bonus_usdc,
        ErrorCode::InsufficientReferralBudget
    );
    
    // Swap and mint
    let minted_ac = swap_usdc_for_ac(
        ctx.accounts,
        bonus_usdc,
        &[&[b"referral_pot", &current_day.to_le_bytes()]]
    )?;
    
    mint_ac_to_user(
        ctx.accounts,
        &referral.referrer,
        minted_ac
    )?;
    
    // Update state
    referral.first_vau_rewarded = true;
    referral.total_referral_rewards += minted_ac;
    pot.remaining_budget -= bonus_usdc;
    
    emit!(ReferralBonusPaid {
        referrer: referral.referrer,
        referred_user: referral.user,
        amount_ac: minted_ac,
        bonus_type: "first_vau",
    });
    
    Ok(())
}
```

### 4.4 Register Site Owner Referral
```rust
pub fn register_site_referral(
    ctx: Context<RegisterSiteReferral>,
    site_hash: [u8; 32],
    bond_amount: u64,
    referrer: Pubkey,
) -> Result<()> {
    let site_referral = &mut ctx.accounts.site_referral;
    let clock = Clock::get()?;
    
    // Called during site bonding process
    require!(
        ctx.accounts.caller.key() == thermostat::ID,
        ErrorCode::UnauthorizedCaller
    );
    
    site_referral.site_hash = site_hash;
    site_referral.owner = ctx.accounts.owner.key();
    site_referral.referrer = referrer;
    site_referral.bond_amount = bond_amount;
    site_referral.referral_fee = bond_amount * 5 / 100; // 5%
    site_referral.bond_timestamp = clock.unix_timestamp;
    site_referral.cooldown_end = clock.unix_timestamp + 86400; // 24h
    site_referral.fee_claimed = false;
    
    emit!(SiteReferralRegistered {
        site_hash,
        owner: ctx.accounts.owner.key(),
        referrer,
        bond_amount,
        fee: site_referral.referral_fee,
    });
    
    Ok(())
}
```

### 4.5 Claim Site Referral Fee
```rust
pub fn claim_site_referral(
    ctx: Context<ClaimSiteReferral>,
) -> Result<()> {
    let referral = &mut ctx.accounts.site_referral;
    let clock = Clock::get()?;
    
    // Check cooldown passed
    require!(
        clock.unix_timestamp >= referral.cooldown_end,
        ErrorCode::CooldownActive
    );
    
    // Check not already claimed
    require!(
        !referral.fee_claimed,
        ErrorCode::AlreadyClaimed
    );
    
    // Check site still bonded
    require!(
        is_site_bonded(&referral.site_hash)?,
        ErrorCode::SiteUnbonded
    );
    
    // Get referral cap
    let kappa = get_current_kappa(&ctx.accounts.kappa_oracle)?;
    let referral_cap_ac = kappa / 2;
    let referral_cap_usdc = referral_cap_ac * get_ac_price()? / 1_000_000_000;
    
    // Cap the fee
    let fee_to_pay = referral.referral_fee.min(referral_cap_usdc);
    
    // Swap and mint
    let minted_ac = swap_usdc_for_ac(
        ctx.accounts,
        fee_to_pay,
        &[&[b"referral_pot", &current_day.to_le_bytes()]]
    )?;
    
    mint_ac_to_user(
        ctx.accounts,
        &referral.referrer,
        minted_ac
    )?;
    
    // Update state
    referral.fee_claimed = true;
    
    emit!(SiteReferralClaimed {
        site_hash: referral.site_hash,
        referrer: referral.referrer,
        amount_ac: minted_ac,
        amount_usdc: fee_to_pay,
    });
    
    Ok(())
}
```

### 4.6 Initialize Daily Pots
```rust
pub fn initialize_daily_pots(
    ctx: Context<InitializeDailyPots>,
) -> Result<()> {
    let clock = Clock::get()?;
    let current_day = (clock.unix_timestamp / 86400) as u64;
    
    // Only treasury splitter can initialize
    require!(
        ctx.accounts.caller.key() == treasury_splitter::ID,
        ErrorCode::UnauthorizedCaller
    );
    
    // Initialize explorer pot
    let explorer_pot = &mut ctx.accounts.explorer_pot;
    explorer_pot.day_index = current_day;
    explorer_pot.total_budget = ctx.accounts.funding_amount_explorer;
    explorer_pot.remaining_budget = ctx.accounts.funding_amount_explorer;
    
    // Distribute budget across 288 slices
    let slice_budget = explorer_pot.total_budget / 288;
    for i in 0..288 {
        explorer_pot.slice_budgets[i] = slice_budget;
    }
    explorer_pot.current_slice = 0;
    explorer_pot.sites_rewarded = 0;
    explorer_pot.users_rewarded = 0;
    
    // Initialize referral pots similarly
    let user_ref_pot = &mut ctx.accounts.user_referral_pot;
    user_ref_pot.day_index = current_day;
    user_ref_pot.total_budget = ctx.accounts.funding_amount_user_ref;
    user_ref_pot.remaining_budget = ctx.accounts.funding_amount_user_ref;
    
    let owner_ref_pot = &mut ctx.accounts.owner_referral_pot;
    owner_ref_pot.day_index = current_day;
    owner_ref_pot.total_budget = ctx.accounts.funding_amount_owner_ref;
    owner_ref_pot.remaining_budget = ctx.accounts.funding_amount_owner_ref;
    
    emit!(DailyPotsInitialized {
        day: current_day,
        explorer_budget: explorer_pot.total_budget,
        user_ref_budget: user_ref_pot.total_budget,
        owner_ref_budget: owner_ref_pot.total_budget,
    });
    
    Ok(())
}
```

---
## 5. Helper Functions

### 5.1 Explorer Reward Calculator
```rust
fn calculate_explorer_reward(
    seconds: u8,
    slice_budget: u64,
    competition_estimate: u64,
) -> u64 {
    // Base rate: proportional to time spent
    let time_weight = seconds as u64; // 1-5 seconds
    
    // Competition factor: less reward when many users active
    let competition_factor = 1_000_000 / competition_estimate.max(1);
    
    // Calculate share of slice budget
    let reward = (slice_budget * time_weight * competition_factor) / 
                 (5 * 1_000_000); // Normalize
    
    reward.min(slice_budget / 100) // Cap at 1% of slice
}
```

### 5.2 USDC to AC Swap
```rust
fn swap_usdc_for_ac<'info>(
    accounts: &SwapAccounts<'info>,
    usdc_amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<u64> {
    // Use Orca Whirlpool for swap
    let swap_accounts = SwapV2 {
        whirlpool: accounts.whirlpool.to_account_info(),
        token_mint_a: accounts.usdc_mint.to_account_info(),
        token_mint_b: accounts.ac_mint.to_account_info(),
        token_owner_account_a: accounts.pot_usdc_account.to_account_info(),
        token_owner_account_b: accounts.pot_ac_account.to_account_info(),
        token_vault_a: accounts.whirlpool_vault_a.to_account_info(),
        token_vault_b: accounts.whirlpool_vault_b.to_account_info(),
        tick_array_0: accounts.tick_array_0.to_account_info(),
        tick_array_1: accounts.tick_array_1.to_account_info(),
        tick_array_2: accounts.tick_array_2.to_account_info(),
        oracle: accounts.oracle.to_account_info(),
        token_authority: accounts.pot_authority.to_account_info(),
        token_program: accounts.token_program.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new_with_signer(
        accounts.whirlpool_program.to_account_info(),
        swap_accounts,
        signer_seeds,
    );
    
    // Swap with 1% slippage tolerance
    let amount_out = whirlpool::cpi::swap_v2(
        cpi_ctx,
        usdc_amount,
        0, // Min out calculated off-chain
        true, // A to B (USDC to AC)
        true, // Amount specified is input
        get_sqrt_price_limit()?,
    )?;
    
    Ok(amount_out)
}
```

### 5.3 Competition Estimator
```rust
fn get_slice_competition_estimate() -> Result<u64> {
    // Simple estimate based on recent activity
    // In production, use more sophisticated model
    
    let current_hour = Clock::get()?.unix_timestamp / 3600 % 24;
    
    // Peak hours have more competition
    let base_competition = match current_hour {
        8..=10 | 18..=21 => 10_000,  // Peak
        11..=17 => 5_000,             // Day
        22..=23 | 0..=7 => 2_000,     // Night
        _ => 3_000,
    };
    
    Ok(base_competition)
}
```

---
## 6. Security Considerations

### 6.1 Attack Vectors
| Attack | Mitigation |
|--------|-----------|
| VAU spam | Hardware key rate limit + κ cap |
| Referral farming | Caps + cooldowns + first VAU only |
| Budget drain | Daily pots + per-slice limits |
| Sybil devices | κ(t) makes unprofitable |
| Site cycling | Thermostat tracks all sites |

### 6.2 Economic Bounds
- Max explorer earning: κ(t) per device per day
- Max referral earning: κ(t)/2 per event
- Total daily budget: Set by treasury splitter
- No inflation: All rewards from USDC swaps

---
## 7. Testing

### 7.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_explorer_cap_enforcement() {
        let mut test = setup_test().await;
        
        // Set κ = 1000 AC-D
        set_kappa(&mut test, 1000_000_000_000).await;
        
        // Process VAUs until cap
        let mut total_earned = 0;
        for i in 0..100 {
            let reward = process_explorer_vau(&mut test, 5).await?;
            total_earned += reward;
            
            if reward == 0 {
                break; // Hit cap
            }
        }
        
        assert!(total_earned <= 1000_000_000_000);
        assert!(total_earned >= 900_000_000_000); // Should be close
    }
    
    #[tokio::test]
    async fn test_referral_cooldown() {
        let mut test = setup_test().await;
        
        // Register site referral
        register_site_referral(&mut test, site_hash, bond_amount, referrer).await?;
        
        // Try immediate claim - should fail
        let result = claim_site_referral(&mut test).await;
        assert_eq!(result.unwrap_err(), ErrorCode::CooldownActive);
        
        // Fast forward 24h
        test.warp_slot(SLOTS_PER_DAY).await;
        
        // Now should succeed
        claim_site_referral(&mut test).await?;
    }
}
```

### 7.2 Integration Tests
```rust
#[tokio::test]
async fn test_daily_budget_distribution() {
    let mut test = setup_test().await;
    
    // Initialize with 10,000 USDC daily budget
    initialize_daily_pots(&mut test, 10_000_000_000).await?;
    
    // Simulate full day of activity
    for hour in 0..24 {
        for minute in 0..60 {
            // Process some VAUs
            let users = get_active_users_for_time(hour, minute);
            
            for user in users {
                process_explorer_vau(&mut test, user, 5).await?;
            }
            
            // Advance to next minute
            test.warp_slot(SLOTS_PER_MINUTE).await;
        }
    }
    
    // Check budget fully distributed
    let pot = get_explorer_pot(&test).await;
    assert!(pot.remaining_budget < 1_000_000); // <$1 dust
    
    // Check reasonable distribution
    assert!(pot.users_rewarded > 1000);
    assert!(pot.sites_rewarded > 100);
}
```

---
## 8. Monitoring

### 8.1 Key Metrics
```sql
-- Explorer efficiency
SELECT 
    day_index,
    total_budget,
    remaining_budget,
    (total_budget - remaining_budget) / total_budget as utilization,
    users_rewarded,
    sites_rewarded,
    (total_budget - remaining_budget) / users_rewarded as avg_reward_usdc
FROM daily_explorer_pots
WHERE day_index >= CURRENT_DATE - 7;

-- Referral effectiveness  
SELECT
    DATE(registered_at) as date,
    COUNT(*) as new_referrals,
    COUNT(DISTINCT referrer) as unique_referrers,
    SUM(total_referral_rewards) as total_rewards_ac
FROM user_referral_states
GROUP BY DATE(registered_at);
```

### 8.2 Alerts
```yaml
- alert: ExplorerBudgetExhausted
  expr: |
    explorer_pot_remaining_budget == 0 
    AND hour() < 20
  annotations:
    summary: "Explorer budget exhausted early"

- alert: ReferralAbuseDetected
  expr: |
    rate(referral_registrations[5m]) > 100
  annotations:
    summary: "Unusual referral registration rate"

- alert: DevicesAtCap
  expr: |
    devices_at_daily_cap / total_active_devices > 0.1
  annotations:
    summary: ">10% of devices hitting cap"
```

---
## 9. Future Enhancements

### 9.1 Dynamic Slice Allocation
Instead of even 5-min slices, weight by historical activity patterns.

### 9.2 Site Quality Scoring  
Higher rewards for sites with better engagement metrics.

### 9.3 Referral Trees
Track multi-level referrals (with decreasing rewards).

### 9.4 Loyalty Bonuses
Long-term users get slightly higher caps or multipliers.

---
End of file 