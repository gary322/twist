# Kappa Oracle Program (`kappa_oracle`)

Program ID: `KAPPA111111111111111111111111111111111111111`  •  Language: Rust (Anchor)  •  Updates: Hourly

---
## 1. Purpose
Computes and maintains the adaptive per-device earning cap κ(t) = 3 × C_token / P_AC, where C_token is the median price of FIDO2 hardware tokens and P_AC is the current AC-D token price. This creates a dynamic Sybil resistance mechanism that adjusts to real-world hardware costs.

---
## 2. Economic Rationale
- **Cost to create fake identity**: Price of hardware token (~$30-50)
- **Maximum daily earnings**: κ(t) AC-D tokens
- **Break-even time**: >3 days including decay
- **Result**: Sybil attacks economically irrational

---
## 3. Account Structure

### 3.1 Oracle State
```rust
#[account]
pub struct KappaOracleState {
    pub authority: Pubkey,                   // Update authority (multisig)
    pub current_kappa: u64,                  // Current κ value (AC-D with 9 decimals)
    pub last_update: i64,                    // Unix timestamp
    pub update_count: u64,                   // Total updates
    
    // Price inputs
    pub c_token_cents: u64,                  // Median hardware token price in cents
    pub p_ac_cents: u64,                     // AC-D price in cents (6 decimals)
    
    // Bounds
    pub kappa_min: u64,                      // Floor: 100 AC-D
    pub kappa_max: u64,                      // Ceiling: 2000 AC-D
    pub multiplier: u8,                      // Default: 3
    
    // Stats
    pub total_devices_registered: u64,        // For analytics
    pub daily_earnings_distributed: u64,      // Yesterday's total
}

// PDA: ["oracle_state"]
```

### 3.2 Price Feed Account
```rust
#[account] 
pub struct TokenPriceFeed {
    pub price_cents: u64,                    // Median price in cents
    pub confidence: u8,                      // 0-100 confidence score
    pub sample_count: u32,                   // Number of prices in median
    pub sources: [PriceSource; 5],           // Up to 5 sources
    pub last_update: i64,                    // Unix timestamp
    pub submitted_by: Pubkey,                // Oracle service key
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PriceSource {
    pub name: [u8; 16],                      // "amazon", "yubico", etc
    pub price: u64,                          // Individual price
    pub timestamp: i64,                      // When scraped
}

// PDA: ["token_price_feed"]
```

### 3.3 Historical Kappa Record
```rust
#[account]
pub struct KappaHistory {
    pub timestamp: i64,
    pub kappa_value: u64,
    pub c_token: u64,
    pub p_ac: u64,
    pub devices_active: u64,
    pub earnings_distributed: u64,
}

// PDA: ["kappa_history", timestamp.to_le_bytes()]
```

---
## 4. Instructions

### 4.1 Initialize Oracle
```rust
pub fn initialize(
    ctx: Context<Initialize>,
    params: InitializeParams,
) -> Result<()> {
    let state = &mut ctx.accounts.oracle_state;
    let clock = Clock::get()?;
    
    state.authority = ctx.accounts.authority.key();
    state.current_kappa = params.initial_kappa;
    state.last_update = clock.unix_timestamp;
    state.update_count = 0;
    
    state.c_token_cents = params.initial_c_token;
    state.p_ac_cents = params.initial_p_ac;
    
    state.kappa_min = 100_000_000_000; // 100 AC-D
    state.kappa_max = 2000_000_000_000; // 2000 AC-D
    state.multiplier = 3;
    
    state.total_devices_registered = 0;
    state.daily_earnings_distributed = 0;
    
    emit!(OracleInitialized {
        authority: state.authority,
        initial_kappa: state.current_kappa,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}
```

### 4.2 Update Token Price
```rust
pub fn update_token_price(
    ctx: Context<UpdateTokenPrice>,
    price_data: TokenPriceData,
) -> Result<()> {
    let feed = &mut ctx.accounts.token_price_feed;
    let clock = Clock::get()?;
    
    // Verify submitter is authorized
    require!(
        is_authorized_price_submitter(&ctx.accounts.submitter.key()),
        ErrorCode::UnauthorizedSubmitter
    );
    
    // Validate data freshness
    for source in &price_data.sources {
        require!(
            clock.unix_timestamp - source.timestamp < 3600, // 1 hour
            ErrorCode::StalePriceData
        );
    }
    
    // Calculate median
    let median_price = calculate_median_price(&price_data.sources)?;
    
    // Sanity check (hardware tokens $10-$200 range)
    require!(
        median_price >= 1000 && median_price <= 20000,
        ErrorCode::PriceOutOfRange
    );
    
    // Update feed
    feed.price_cents = median_price;
    feed.confidence = calculate_confidence(&price_data.sources);
    feed.sample_count = price_data.sources.len() as u32;
    feed.sources = price_data.sources;
    feed.last_update = clock.unix_timestamp;
    feed.submitted_by = ctx.accounts.submitter.key();
    
    emit!(TokenPriceUpdated {
        price: median_price,
        confidence: feed.confidence,
        sources: price_data.sources.len(),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}
```

### 4.3 Update AC Price
```rust
pub fn update_ac_price(
    ctx: Context<UpdateACPrice>,
) -> Result<()> {
    let state = &mut ctx.accounts.oracle_state;
    let clock = Clock::get()?;
    
    // Read from Pyth price account
    let pyth_price = get_pyth_price(&ctx.accounts.pyth_price_account)?;
    
    // Read from Switchboard
    let switchboard_price = get_switchboard_price(&ctx.accounts.switchboard_feed)?;
    
    // Calculate median
    let median_price = (pyth_price + switchboard_price) / 2;
    
    // Sanity check ($0.001 - $10 range)
    require!(
        median_price >= 100 && median_price <= 1_000_000,
        ErrorCode::ACPriceOutOfRange  
    );
    
    state.p_ac_cents = median_price;
    
    emit!(ACPriceUpdated {
        price: median_price,
        pyth: pyth_price,
        switchboard: switchboard_price,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}
```

### 4.4 Compute Kappa
```rust
pub fn compute_kappa(
    ctx: Context<ComputeKappa>,
) -> Result<()> {
    let state = &mut ctx.accounts.oracle_state;
    let clock = Clock::get()?;
    
    // Require recent price updates
    require!(
        clock.unix_timestamp - ctx.accounts.token_price_feed.last_update < 7200, // 2 hours
        ErrorCode::StaleTokenPrice
    );
    
    // Get prices
    let c_token = ctx.accounts.token_price_feed.price_cents;
    let p_ac = state.p_ac_cents;
    
    require!(p_ac > 0, ErrorCode::InvalidACPrice);
    
    // Calculate κ = multiplier × C_token / P_AC
    // C_token in cents, P_AC in cents with 6 decimals
    // Result needs to be in AC-D atomic units (9 decimals)
    let kappa_raw = (state.multiplier as u128) * 
                    (c_token as u128) * 
                    1_000_000_000_u128 / // 9 decimals
                    (p_ac as u128);
    
    // Apply bounds
    let kappa_bounded = kappa_raw
        .min(state.kappa_max as u128)
        .max(state.kappa_min as u128) as u64;
    
    // Smooth large changes (max 10% per update)
    let max_change = state.current_kappa / 10;
    let kappa_smoothed = if kappa_bounded > state.current_kappa {
        state.current_kappa + max_change.min(kappa_bounded - state.current_kappa)
    } else {
        state.current_kappa - max_change.min(state.current_kappa - kappa_bounded)
    };
    
    // Update state
    let old_kappa = state.current_kappa;
    state.current_kappa = kappa_smoothed;
    state.c_token_cents = c_token;
    state.last_update = clock.unix_timestamp;
    state.update_count += 1;
    
    // Record history
    let history = &mut ctx.accounts.kappa_history;
    history.timestamp = clock.unix_timestamp;
    history.kappa_value = kappa_smoothed;
    history.c_token = c_token;
    history.p_ac = p_ac;
    history.devices_active = state.total_devices_registered;
    history.earnings_distributed = state.daily_earnings_distributed;
    
    emit!(KappaUpdated {
        old_kappa,
        new_kappa: kappa_smoothed,
        c_token,
        p_ac,
        raw_calculation: kappa_raw as u64,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}
```

### 4.5 Update Stats
```rust
pub fn update_daily_stats(
    ctx: Context<UpdateStats>,
    stats: DailyStats,
) -> Result<()> {
    let state = &mut ctx.accounts.oracle_state;
    
    // Only callable by authorized stats aggregator
    require!(
        ctx.accounts.updater.key() == expected_stats_updater(),
        ErrorCode::UnauthorizedUpdater
    );
    
    state.total_devices_registered = stats.total_devices;
    state.daily_earnings_distributed = stats.earnings_yesterday;
    
    emit!(StatsUpdated {
        devices: stats.total_devices,
        earnings: stats.earnings_yesterday,
        avg_per_device: stats.earnings_yesterday / stats.total_devices.max(1),
    });
    
    Ok(())
}
```

---
## 5. Helper Functions

### 5.1 Median Price Calculator
```rust
fn calculate_median_price(sources: &[PriceSource]) -> Result<u64> {
    require!(!sources.is_empty(), ErrorCode::NoPriceSources);
    
    let mut prices: Vec<u64> = sources.iter()
        .map(|s| s.price)
        .filter(|&p| p > 0)
        .collect();
    
    require!(!prices.is_empty(), ErrorCode::AllPricesZero);
    
    prices.sort_unstable();
    let mid = prices.len() / 2;
    
    Ok(if prices.len() % 2 == 0 {
        (prices[mid - 1] + prices[mid]) / 2
    } else {
        prices[mid]
    })
}

fn calculate_confidence(sources: &[PriceSource]) -> u8 {
    // Higher confidence with more sources and lower variance
    let count_score = (sources.len() as u8).min(5) * 10; // Max 50
    
    let prices: Vec<u64> = sources.iter().map(|s| s.price).collect();
    let mean = prices.iter().sum::<u64>() / prices.len() as u64;
    let variance = prices.iter()
        .map(|&p| (p as i64 - mean as i64).pow(2))
        .sum::<i64>() / prices.len() as i64;
    
    let variance_score = if variance < (mean as i64).pow(2) / 100 {
        50 // Low variance
    } else if variance < (mean as i64).pow(2) / 25 {
        30 // Medium variance
    } else {
        10 // High variance
    };
    
    (count_score + variance_score).min(100)
}
```

### 5.2 Oracle Price Readers
```rust
fn get_pyth_price(account: &AccountInfo) -> Result<u64> {
    let price_feed = pyth_sdk_solana::load_price_feed_from_account_info(account)
        .map_err(|_| ErrorCode::InvalidPythAccount)?;
    
    let price = price_feed.get_current_price()
        .ok_or(ErrorCode::NoPythPrice)?;
    
    // Convert to cents with 6 decimals
    let price_cents = (price.price as u64) * 100 / 10u64.pow(price.expo.abs() as u32);
    
    Ok(price_cents)
}

fn get_switchboard_price(account: &AccountInfo) -> Result<u64> {
    let feed = AggregatorAccountData::new(account)
        .map_err(|_| ErrorCode::InvalidSwitchboardAccount)?;
    
    let result = feed.get_result()
        .map_err(|_| ErrorCode::NoSwitchboardResult)?;
    
    // Convert to cents
    let price_cents = (result.mantissa as u64) * 100 / 10u64.pow(result.scale as u32);
    
    Ok(price_cents)
}
```

---
## 6. View Functions

### 6.1 Get Current Kappa
```rust
pub fn get_current_kappa(program_id: &Pubkey) -> Result<u64> {
    let (state_pda, _) = Pubkey::find_program_address(
        &[b"oracle_state"],
        program_id
    );
    
    let account = Account::<KappaOracleState>::try_from(&state_pda)?;
    Ok(account.current_kappa)
}
```

### 6.2 Get Kappa History
```rust
pub fn get_kappa_history(
    program_id: &Pubkey,
    start_time: i64,
    end_time: i64,
) -> Result<Vec<KappaHistory>> {
    let mut history = Vec::new();
    
    // Iterate through daily records
    let mut current = start_time;
    while current <= end_time {
        let (history_pda, _) = Pubkey::find_program_address(
            &[b"kappa_history", &current.to_le_bytes()],
            program_id
        );
        
        if let Ok(record) = Account::<KappaHistory>::try_from(&history_pda) {
            history.push(record.into_inner());
        }
        
        current += 86400; // Next day
    }
    
    Ok(history)
}
```

---
## 7. Integration with Explorer

### 7.1 CPI from Explorer Program
```rust
// In explorer_referral program
pub fn check_device_cap(
    ctx: Context<CheckCap>,
    device_pubkey: Pubkey,
) -> Result<u64> {
    // Get current kappa
    let kappa = kappa_oracle::cpi::get_current_kappa(
        ctx.accounts.kappa_oracle_program.to_account_info()
    )?;
    
    // Get device's earnings today
    let earned_today = get_device_earnings_today(&device_pubkey)?;
    
    // Calculate remaining allowance
    let remaining = kappa.saturating_sub(earned_today);
    
    Ok(remaining)
}
```

### 7.2 Enforcement Logic
```rust
// Before minting explorer rewards
let device_cap = check_device_cap(ctx, vau.device_pubkey)?;
let mint_amount = reward_amount.min(device_cap);

if mint_amount == 0 {
    msg!("Device {} hit daily cap", vau.device_pubkey);
    return Ok(());
}
```

---
## 8. Security Considerations

### 8.1 Price Manipulation Protection
| Attack | Mitigation |
|--------|-----------|
| Fake high C_token | Multiple sources + median |
| Fake low P_AC | Dual oracle requirement |
| Rapid κ changes | 10% max change per update |
| Stale prices | 2-hour freshness requirement |
| Unauthorized updates | Whitelist + multisig |

### 8.2 Economic Bounds
```rust
const KAPPA_MIN: u64 = 100_000_000_000;  // 100 AC-D (~$5 at $0.05)
const KAPPA_MAX: u64 = 2000_000_000_000; // 2000 AC-D (~$100)

// At minimum: Need 15+ devices to earn $75/day
// At maximum: Single device caps at $100/day
```

---
## 9. Testing

### 9.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_kappa_calculation() {
        // C_token = $40 (4000 cents)
        // P_AC = $0.05 (5000 cents with 6 decimals)
        // κ = 3 × 4000 / 0.05 = 240,000 AC-D base units
        
        let kappa = calculate_kappa(4000, 5000, 3);
        assert_eq!(kappa, 240_000_000_000); // With 9 decimals
    }
    
    #[test]
    fn test_bounds_enforcement() {
        // Test upper bound
        let high_kappa = calculate_kappa(10000, 100, 3); // Would be 3000
        assert_eq!(high_kappa, KAPPA_MAX);
        
        // Test lower bound  
        let low_kappa = calculate_kappa(100, 10000, 3); // Would be 30
        assert_eq!(low_kappa, KAPPA_MIN);
    }
    
    #[test]
    fn test_smoothing() {
        let current = 1000_000_000_000; // 1000 AC-D
        let target = 1500_000_000_000;  // 1500 AC-D
        
        let smoothed = apply_smoothing(current, target);
        assert_eq!(smoothed, 1100_000_000_000); // +10% max
    }
}
```

### 9.2 Simulation Tests
```rust
#[tokio::test]
async fn test_sybil_economics() {
    let mut sim = Simulation::new();
    
    // Attacker creates 100 fake devices at $40 each
    let attack_cost = 100 * 40_00; // $4,000
    
    // Each device earns κ = 240 AC-D/day
    let daily_earnings = 100 * 240;
    
    // Factor in 0.5% daily decay
    let net_daily = daily_earnings * 995 / 1000;
    
    // Sell at market price
    let daily_revenue = net_daily * 5; // $0.05 per AC-D
    
    // Break-even time
    let days_to_breakeven = attack_cost / daily_revenue;
    assert!(days_to_breakeven > 3);
    
    // After decay and slippage, attack is unprofitable
}
```

---
## 10. Monitoring

### 10.1 Key Metrics
```yaml
- name: kappa_value
  help: Current adaptive cap in AC-D
  type: gauge

- name: hardware_token_price
  help: Median FIDO2 token price in cents
  type: gauge

- name: ac_price
  help: AC-D price in cents  
  type: gauge

- name: devices_at_cap
  help: Number of devices that hit daily cap
  type: counter

- name: kappa_updates_total
  help: Total kappa recalculations
  type: counter
```

### 10.2 Alerts
```yaml
- alert: KappaNotUpdated
  expr: time() - kappa_oracle_last_update > 7200
  annotations:
    summary: "Kappa not updated for 2 hours"

- alert: PriceDataStale  
  expr: time() - token_price_feed_timestamp > 14400
  annotations:
    summary: "Hardware token price data stale (>4h)"

- alert: KappaAtBound
  expr: kappa_value == 100e9 or kappa_value == 2000e9
  for: 1h
  annotations:
    summary: "Kappa stuck at min/max bound"
```

---
## 11. Operational Procedures

### 11.1 Daily Operations
1. Hardware price oracle runs (weekly)
2. AC price updates (every 5 min)
3. Kappa recomputation (hourly)
4. Stats aggregation (daily)

### 11.2 Manual Interventions
- Adjust multiplier if attack patterns detected
- Update bounds based on market conditions
- Add/remove price sources
- Emergency pause if manipulation detected

---
## 12. Future Enhancements

### 12.1 Dynamic Multiplier
Instead of fixed 3×, adjust based on:
- Network-wide Sybil detection rate
- Ratio of devices at cap
- Total network earnings

### 12.2 Device Reputation
Long-lived devices with consistent behavior could earn higher caps, while new devices start lower.

### 12.3 Geographic Adjustments
Different κ values based on regional hardware costs and earning power parity.

---
End of file 