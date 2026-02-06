# Harberger Burn Program (`harberger_burn`)

Program ID: `HARB1111111111111111111111111111111111111111`  •  Language: Rust (Anchor)  •  Type: Token Sink

---
## 1. Purpose
Implements Continuous Harberger Burn (CHB) - a novel token sink mechanism where users purchase revocable licenses by burning AC-D tokens based on self-assessed prices. Creates deflationary pressure while enabling efficient resource allocation for premium namespaces, vanity addresses, and prime ad slots.

---
## 2. Core Concept
```
Traditional Harberger Tax: Pay recurring tax on self-assessed value
     ↓
Continuous Harberger Burn: Burn tokens upfront based on time × self-assessed price
```

**Key Properties:**
- Higher self-assessment = More tokens burned = Longer exclusive use
- Anyone can force-acquire by burning more tokens
- No recurring payments, just upfront burns
- 100% of tokens burned (true deflation)

---
## 3. Account Structure

### 3.1 CHB Registry
```rust
#[account]
pub struct CHBRegistry {
    pub authority: Pubkey,                   // Protocol authority
    pub resource_type: ResourceType,         // What's being licensed
    pub min_price_per_day: u64,             // Floor price in AC-D
    pub max_duration_days: u32,             // Max license duration
    pub total_licenses_issued: u64,          // Counter
    pub total_burned_lifetime: u128,         // AC-D burned all-time
    pub active_licenses: u32,                // Currently active
    pub created_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum ResourceType {
    Username,           // @alice on platform
    VanityAddress,      // alice.sol
    PremiumAdSlot,      // Top banner on site
    CustomBadge,        // Special profile badge
    ShortLink,          // ahee.xyz/alice
    Custom(String),     // Extensible
}

// PDA: ["registry", resource_type]
```

### 3.2 License Account
```rust
#[account]
pub struct License {
    pub resource_id: [u8; 32],               // What's licensed
    pub resource_type: ResourceType,         
    pub owner: Pubkey,                       // Current owner
    pub self_assessed_price: u64,            // AC-D per day
    pub duration_days: u32,                  // How long purchased
    pub total_burned: u64,                   // Price × duration
    pub acquired_at: i64,                    // Unix timestamp
    pub expires_at: i64,                     // When it expires
    pub previous_owner: Option<Pubkey>,      // For forced transfers
    pub metadata: LicenseMetadata,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default)]
pub struct LicenseMetadata {
    pub display_name: String,                // "Alice"
    pub uri: Option<String>,                 // Profile pic, etc
    pub attributes: BTreeMap<String, String>,// Custom data
    pub transfer_count: u32,                 // Times changed hands
}

// PDA: ["license", resource_type, resource_id]
```

### 3.3 Burn Record
```rust
#[account]
pub struct BurnRecord {
    pub license_id: [u8; 32],
    pub burner: Pubkey,
    pub amount_burned: u64,
    pub burn_type: BurnType,
    pub timestamp: i64,
    pub tx_signature: [u8; 64],
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum BurnType {
    InitialAcquisition,
    Renewal,
    ForcedAcquisition,
    VoluntaryRelease,
}

// PDA: ["burn", license_id, timestamp.to_le_bytes()]
```

### 3.4 Pending Acquisition
```rust
#[account]
pub struct PendingAcquisition {
    pub resource_id: [u8; 32],
    pub acquirer: Pubkey,
    pub offered_price: u64,                  // Daily rate
    pub duration_days: u32,
    pub total_to_burn: u64,
    pub current_owner: Pubkey,
    pub current_expiry: i64,
    pub created_at: i64,
    pub grace_period_end: i64,               // 24h for current owner
}

// PDA: ["pending", resource_id, acquirer]
```

---
## 4. Core Instructions

### 4.1 Initialize Registry
```rust
pub fn initialize_registry(
    ctx: Context<InitializeRegistry>,
    params: InitializeRegistryParams,
) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let clock = Clock::get()?;
    
    registry.authority = ctx.accounts.authority.key();
    registry.resource_type = params.resource_type;
    registry.min_price_per_day = params.min_price_per_day;
    registry.max_duration_days = params.max_duration_days;
    registry.total_licenses_issued = 0;
    registry.total_burned_lifetime = 0;
    registry.active_licenses = 0;
    registry.created_at = clock.unix_timestamp;
    
    emit!(RegistryInitialized {
        resource_type: params.resource_type,
        min_price: params.min_price_per_day,
        max_duration: params.max_duration_days,
    });
    
    Ok(())
}
```

### 4.2 Acquire License
```rust
pub fn acquire_license(
    ctx: Context<AcquireLicense>,
    resource_id: [u8; 32],
    display_name: String,
    price_per_day: u64,
    duration_days: u32,
) -> Result<()> {
    let registry = &ctx.accounts.registry;
    let license = &mut ctx.accounts.license;
    let clock = Clock::get()?;
    
    // Validate parameters
    require!(
        price_per_day >= registry.min_price_per_day,
        ErrorCode::PriceTooLow
    );
    
    require!(
        duration_days > 0 && duration_days <= registry.max_duration_days,
        ErrorCode::InvalidDuration
    );
    
    require!(
        display_name.len() > 0 && display_name.len() <= 32,
        ErrorCode::InvalidDisplayName
    );
    
    // Check if already licensed
    if license.owner != Pubkey::default() && clock.unix_timestamp < license.expires_at {
        return Err(ErrorCode::AlreadyLicensed.into());
    }
    
    // Calculate burn amount
    let total_burn = price_per_day
        .checked_mul(duration_days as u64)
        .ok_or(ErrorCode::Overflow)?;
    
    // Burn AC-D tokens
    burn_tokens(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.ac_mint.to_account_info(),
                from: ctx.accounts.acquirer_ac_account.to_account_info(),
                authority: ctx.accounts.acquirer.to_account_info(),
            },
        ),
        total_burn,
    )?;
    
    // Initialize or update license
    let was_new = license.owner == Pubkey::default();
    
    license.resource_id = resource_id;
    license.resource_type = registry.resource_type.clone();
    license.owner = ctx.accounts.acquirer.key();
    license.self_assessed_price = price_per_day;
    license.duration_days = duration_days;
    license.total_burned = total_burn;
    license.acquired_at = clock.unix_timestamp;
    license.expires_at = clock.unix_timestamp + (duration_days as i64 * 86400);
    license.previous_owner = if was_new { None } else { Some(license.owner) };
    
    license.metadata.display_name = display_name;
    license.metadata.transfer_count += if was_new { 0 } else { 1 };
    
    // Create burn record
    let burn_record = &mut ctx.accounts.burn_record;
    burn_record.license_id = resource_id;
    burn_record.burner = ctx.accounts.acquirer.key();
    burn_record.amount_burned = total_burn;
    burn_record.burn_type = if was_new {
        BurnType::InitialAcquisition
    } else {
        BurnType::Renewal
    };
    burn_record.timestamp = clock.unix_timestamp;
    
    // Update registry stats
    let registry = &mut ctx.accounts.registry;
    registry.total_burned_lifetime += total_burn as u128;
    if was_new {
        registry.total_licenses_issued += 1;
        registry.active_licenses += 1;
    }
    
    emit!(LicenseAcquired {
        resource_type: registry.resource_type.clone(),
        resource_id,
        owner: ctx.accounts.acquirer.key(),
        display_name: license.metadata.display_name.clone(),
        price_per_day,
        duration_days,
        total_burned: total_burn,
        expires_at: license.expires_at,
    });
    
    Ok(())
}
```

### 4.3 Initiate Forced Acquisition
```rust
pub fn initiate_forced_acquisition(
    ctx: Context<InitiateForcedAcquisition>,
    offered_price_per_day: u64,
    duration_days: u32,
) -> Result<()> {
    let license = &ctx.accounts.license;
    let clock = Clock::get()?;
    
    // Check license is active
    require!(
        clock.unix_timestamp < license.expires_at,
        ErrorCode::LicenseExpired
    );
    
    // Check offer is higher than current price
    require!(
        offered_price_per_day > license.self_assessed_price,
        ErrorCode::OfferTooLow
    );
    
    // Can't force-acquire from yourself
    require!(
        ctx.accounts.acquirer.key() != license.owner,
        ErrorCode::SelfAcquisition
    );
    
    // Create pending acquisition
    let pending = &mut ctx.accounts.pending_acquisition;
    let total_burn = offered_price_per_day * duration_days as u64;
    
    pending.resource_id = license.resource_id;
    pending.acquirer = ctx.accounts.acquirer.key();
    pending.offered_price = offered_price_per_day;
    pending.duration_days = duration_days;
    pending.total_to_burn = total_burn;
    pending.current_owner = license.owner;
    pending.current_expiry = license.expires_at;
    pending.created_at = clock.unix_timestamp;
    pending.grace_period_end = clock.unix_timestamp + 86400; // 24h
    
    emit!(ForcedAcquisitionInitiated {
        resource_id: license.resource_id,
        current_owner: license.owner,
        acquirer: ctx.accounts.acquirer.key(),
        offered_price: offered_price_per_day,
        duration_days,
        grace_period_end: pending.grace_period_end,
    });
    
    Ok(())
}
```

### 4.4 Counter or Execute Forced Acquisition
```rust
pub fn respond_to_forced_acquisition(
    ctx: Context<RespondToForcedAcquisition>,
    action: ResponseAction,
) -> Result<()> {
    let pending = &ctx.accounts.pending_acquisition;
    let license = &mut ctx.accounts.license;
    let clock = Clock::get()?;
    
    match action {
        ResponseAction::Counter => {
            // Current owner counters by matching price
            require!(
                ctx.accounts.responder.key() == pending.current_owner,
                ErrorCode::NotCurrentOwner
            );
            
            require!(
                clock.unix_timestamp < pending.grace_period_end,
                ErrorCode::GracePeriodExpired
            );
            
            // Calculate counter burn (match the offer)
            let days_remaining = ((license.expires_at - clock.unix_timestamp) / 86400) as u32;
            let additional_days = pending.duration_days.saturating_sub(days_remaining);
            let counter_burn = pending.offered_price * additional_days as u64;
            
            // Burn tokens to extend at new price
            if counter_burn > 0 {
                burn_tokens(
                    CpiContext::new(
                        ctx.accounts.token_program.to_account_info(),
                        Burn {
                            mint: ctx.accounts.ac_mint.to_account_info(),
                            from: ctx.accounts.owner_ac_account.to_account_info(),
                            authority: ctx.accounts.responder.to_account_info(),
                        },
                    ),
                    counter_burn,
                )?;
                
                // Update license
                license.self_assessed_price = pending.offered_price;
                license.expires_at = clock.unix_timestamp + (pending.duration_days as i64 * 86400);
                license.total_burned += counter_burn;
            }
            
            // Close pending acquisition
            ctx.accounts.pending_acquisition.close(
                ctx.accounts.acquirer.to_account_info()
            )?;
            
            emit!(ForcedAcquisitionCountered {
                resource_id: license.resource_id,
                owner: license.owner,
                new_price: pending.offered_price,
                extended_until: license.expires_at,
                additional_burned: counter_burn,
            });
        },
        
        ResponseAction::Execute => {
            // Acquirer executes after grace period
            require!(
                ctx.accounts.responder.key() == pending.acquirer,
                ErrorCode::NotAcquirer
            );
            
            require!(
                clock.unix_timestamp >= pending.grace_period_end,
                ErrorCode::StillInGracePeriod
            );
            
            // Burn tokens from acquirer
            burn_tokens(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Burn {
                        mint: ctx.accounts.ac_mint.to_account_info(),
                        from: ctx.accounts.acquirer_ac_account.to_account_info(),
                        authority: ctx.accounts.responder.to_account_info(),
                    },
                ),
                pending.total_to_burn,
            )?;
            
            // Transfer license
            license.previous_owner = Some(license.owner);
            license.owner = pending.acquirer;
            license.self_assessed_price = pending.offered_price;
            license.duration_days = pending.duration_days;
            license.total_burned = pending.total_to_burn;
            license.acquired_at = clock.unix_timestamp;
            license.expires_at = clock.unix_timestamp + (pending.duration_days as i64 * 86400);
            license.metadata.transfer_count += 1;
            
            // Update registry
            let registry = &mut ctx.accounts.registry;
            registry.total_burned_lifetime += pending.total_to_burn as u128;
            
            // Close pending
            ctx.accounts.pending_acquisition.close(
                ctx.accounts.responder.to_account_info()
            )?;
            
            emit!(LicenseForciblyAcquired {
                resource_id: license.resource_id,
                previous_owner: pending.current_owner,
                new_owner: pending.acquirer,
                price_per_day: pending.offered_price,
                duration_days: pending.duration_days,
                total_burned: pending.total_to_burn,
            });
        }
    }
    
    Ok(())
}
```

### 4.5 Release License Early
```rust
pub fn release_license(
    ctx: Context<ReleaseLicense>,
) -> Result<()> {
    let license = &mut ctx.accounts.license;
    let registry = &mut ctx.accounts.registry;
    let clock = Clock::get()?;
    
    require!(
        ctx.accounts.releaser.key() == license.owner,
        ErrorCode::NotOwner
    );
    
    require!(
        clock.unix_timestamp < license.expires_at,
        ErrorCode::AlreadyExpired
    );
    
    // Calculate partial refund (optional feature)
    let days_remaining = ((license.expires_at - clock.unix_timestamp) / 86400) as u64;
    let potential_refund = license.self_assessed_price * days_remaining;
    
    // For now, no refunds - pure burn
    // Could implement partial refund with protocol taking a cut
    
    let previous_owner = license.owner;
    let resource_id = license.resource_id;
    
    // Clear license
    license.owner = Pubkey::default();
    license.expires_at = clock.unix_timestamp;
    license.previous_owner = Some(previous_owner);
    
    // Update registry
    registry.active_licenses = registry.active_licenses.saturating_sub(1);
    
    emit!(LicenseReleased {
        resource_id,
        owner: previous_owner,
        released_at: clock.unix_timestamp,
        days_remaining,
        value_forfeited: potential_refund,
    });
    
    Ok(())
}
```

---
## 5. View Functions

### 5.1 Check License Status
```rust
pub fn is_license_active(
    resource_type: ResourceType,
    resource_id: [u8; 32],
) -> Result<bool> {
    let (license_pda, _) = Pubkey::find_program_address(
        &[b"license", &resource_type.to_bytes(), &resource_id],
        &id()
    );
    
    let license = Account::<License>::try_from(&license_pda)?;
    let clock = Clock::get()?;
    
    Ok(license.owner != Pubkey::default() && clock.unix_timestamp < license.expires_at)
}
```

### 5.2 Get Minimum Acquisition Price
```rust
pub fn get_minimum_acquisition_price(
    resource_type: ResourceType,
    resource_id: [u8; 32],
    duration_days: u32,
) -> Result<u64> {
    let (license_pda, _) = Pubkey::find_program_address(
        &[b"license", &resource_type.to_bytes(), &resource_id],
        &id()
    );
    
    if let Ok(license) = Account::<License>::try_from(&license_pda) {
        if Clock::get()?.unix_timestamp < license.expires_at {
            // Must outbid current price
            Ok((license.self_assessed_price + 1) * duration_days as u64)
        } else {
            // Expired, use registry minimum
            let registry = get_registry(resource_type)?;
            Ok(registry.min_price_per_day * duration_days as u64)
        }
    } else {
        // Never licensed, use minimum
        let registry = get_registry(resource_type)?;
        Ok(registry.min_price_per_day * duration_days as u64)
    }
}
```

---
## 6. Economic Model

### 6.1 Pricing Dynamics
```
Optimal self-assessment = True value to owner
- Too low: Risk forced acquisition
- Too high: Overpay for no benefit
```

### 6.2 Burn Projections
```rust
// Example: Username registry
const AVG_USERNAME_VALUE: u64 = 100_000_000_000; // 100 AC-D/day
const TARGET_USERNAMES: u64 = 100_000;
const AVG_DURATION: u32 = 90; // days

let projected_burn = AVG_USERNAME_VALUE * TARGET_USERNAMES * AVG_DURATION as u64;
// = 900 billion AC-D burned
```

### 6.3 Resource Examples
| Resource | Min Price/Day | Typical Duration | Total Burn |
|----------|---------------|------------------|------------|
| Username | 10 AC-D | 90 days | 900 AC-D |
| Premium .sol | 100 AC-D | 365 days | 36,500 AC-D |
| Top ad slot | 1,000 AC-D | 7 days | 7,000 AC-D |
| Custom badge | 50 AC-D | 30 days | 1,500 AC-D |

---
## 7. Security Considerations

### 7.1 Attack Vectors
| Attack | Mitigation |
|--------|-----------|
| Griefing via forced acquisition | 24h grace period + must pay more |
| Squatting on names | High upfront burn cost |
| License sniping at expiry | Can pre-renew before expiry |
| Spam acquisitions | Minimum prices + burns |

### 7.2 Edge Cases
- Simultaneous acquisition attempts: First valid tx wins
- Owner goes inactive: License expires, becomes available
- Partial day calculations: Always round up
- Clock drift: Use Solana Clock, not client time

---
## 8. Testing

### 8.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_forced_acquisition_flow() {
        let mut test = setup_test().await;
        
        // Alice acquires "alice" for 100 AC-D/day for 30 days
        acquire_license(
            &mut test,
            alice,
            b"alice",
            100_000_000_000,
            30
        ).await?;
        
        // Bob tries to force-acquire for 150 AC-D/day
        initiate_forced_acquisition(
            &mut test,
            bob,
            b"alice",
            150_000_000_000,
            30
        ).await?;
        
        // Alice has 24h to counter
        let pending = get_pending_acquisition(&test, b"alice", bob).await;
        assert!(pending.grace_period_end > Clock::get()?.unix_timestamp);
        
        // Fast forward 25 hours
        test.warp_slot(25 * 3600 * 2).await;
        
        // Bob can now execute
        execute_forced_acquisition(&mut test, bob, b"alice").await?;
        
        // Verify ownership transferred
        let license = get_license(&test, b"alice").await;
        assert_eq!(license.owner, bob);
        assert_eq!(license.self_assessed_price, 150_000_000_000);
    }
    
    #[tokio::test]
    async fn test_burn_amounts() {
        let mut test = setup_test().await;
        
        // Track AC-D supply before
        let supply_before = get_token_supply(&test).await;
        
        // Acquire license burning 10,000 AC-D
        acquire_license(
            &mut test,
            user,
            b"test",
            1000_000_000_000, // 1000 AC-D/day
            10                // 10 days
        ).await?;
        
        // Verify tokens burned
        let supply_after = get_token_supply(&test).await;
        assert_eq!(supply_before - supply_after, 10_000_000_000_000);
        
        // Verify burn record
        let burns = get_burn_records(&test, b"test").await;
        assert_eq!(burns.len(), 1);
        assert_eq!(burns[0].amount_burned, 10_000_000_000_000);
    }
}
```

### 8.2 Simulation Tests
```rust
#[tokio::test]
async fn test_market_dynamics() {
    let mut sim = MarketSimulation::new();
    
    // Add 1000 users with different valuations
    for i in 0..1000 {
        sim.add_user(User {
            id: i,
            username_valuation: rand_range(10, 1000), // AC-D/day
            budget: 100_000_000_000_000, // 100k AC-D
        });
    }
    
    // Run for 365 days
    for day in 0..365 {
        sim.tick_day();
        
        // Users acquire/renew based on valuation
        // Force acquisitions happen when profitable
        // Measure total burns, ownership changes, etc
    }
    
    // Verify efficient allocation
    let final_state = sim.get_final_state();
    assert!(final_state.total_burned > 1_000_000_000_000_000); // >1M AC-D
    assert!(final_state.avg_price_correlation > 0.8); // Price ~ value
}
```

---
## 9. Integration Examples

### 9.1 Username System
```typescript
// Frontend integration
async function claimUsername(username: string, days: number) {
    // Check availability
    const isActive = await harberger.isLicenseActive(
        'Username',
        sha256(username)
    );
    
    if (isActive) {
        const minPrice = await harberger.getMinimumAcquisitionPrice(
            'Username',
            sha256(username),
            days
        );
        
        const confirm = await showModal({
            title: 'Username Taken',
            message: `Force-acquire "${username}" for ${minPrice} AC-D?`,
            details: 'Current owner has 24h to counter-offer'
        });
        
        if (confirm) {
            await harberger.initiateForcedAcquisition(
                sha256(username),
                minPrice / days + 1, // Slightly above minimum
                days
            );
        }
    } else {
        // Direct acquisition
        const price = await suggestPrice(username); // AI suggestion
        await harberger.acquireLicense(
            sha256(username),
            username,
            price,
            days
        );
    }
}
```

### 9.2 Ad Slot Auction
```solidity
// Continuous auction for premium placement
contract AdSlotHarberger {
    function getTopSlot() external view returns (address owner, uint256 dailyRate) {
        License memory slot = harberger.getLicense(
            ResourceType.PremiumAdSlot,
            keccak256("homepage-top-banner")
        );
        
        return (slot.owner, slot.selfAssessedPrice);
    }
    
    function bidForSlot(uint256 dailyRate, uint32 days) external {
        harberger.initiateForcedAcquisition(
            keccak256("homepage-top-banner"),
            dailyRate,
            days
        );
    }
}
```

---
## 10. Monitoring & Analytics

### 10.1 Key Metrics
```sql
-- Resource utilization
SELECT 
    resource_type,
    COUNT(*) as total_licenses,
    COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as active_licenses,
    AVG(self_assessed_price) / 1e9 as avg_price_ac_per_day,
    SUM(total_burned) / 1e9 as total_burned_ac,
    AVG(duration_days) as avg_duration_days,
    MAX(metadata->>'transfer_count')::int as max_transfers
FROM licenses
GROUP BY resource_type;

-- Forced acquisition activity
SELECT 
    DATE(created_at) as date,
    COUNT(*) as forced_acquisitions_initiated,
    SUM(CASE WHEN executed THEN 1 ELSE 0 END) as executed,
    SUM(CASE WHEN countered THEN 1 ELSE 0 END) as countered,
    AVG(offered_price / current_price - 1) as avg_premium_offered
FROM forced_acquisitions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at);

-- Burn velocity
SELECT 
    DATE_TRUNC('hour', timestamp) as hour,
    SUM(amount_burned) / 1e9 as ac_burned,
    COUNT(DISTINCT burner) as unique_burners,
    COUNT(*) as burn_events
FROM burn_records
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp)
ORDER BY hour DESC;
```

### 10.2 Alerts
```yaml
- alert: UnusualForcedAcquisitionRate
  expr: |
    rate(harberger_forced_acquisitions[1h]) > 
    5 * avg_over_time(harberger_forced_acquisitions[24h])
  annotations:
    summary: "5x increase in forced acquisition attempts"

- alert: LargeHarbergerBurn
  expr: harberger_burn_amount > 1000000e9
  annotations:
    summary: "Single burn exceeded 1M AC-D"

- alert: LicenseExpirationSurge
  expr: |
    predict_linear(harberger_active_licenses[1h], 3600) < 
    harberger_active_licenses * 0.8
  annotations:
    summary: ">20% of licenses expiring in next hour"
```

---
## 11. UI/UX Considerations

### 11.1 License Browser
- Searchable directory of all resources
- Sort by price, expiry, transfer count
- Show "force-acquire" button with cost
- Expiration countdown timers
- Historical ownership data

### 11.2 Owner Dashboard
- Your licenses with expiry alerts
- Pending acquisition warnings
- Quick renew/extend buttons
- Pricing suggestions based on demand
- Total AC-D burned lifetime

### 11.3 Market Analytics
- Price trends by resource type
- Most contested resources
- Burn rate charts
- Ownership duration distributions

---
## 12. Future Extensions

### 12.1 Fractional Licenses
Allow multiple parties to share a license with time-division.

### 12.2 License Derivatives
Create futures/options on high-value licenses.

### 12.3 Combinatorial Licenses
Bundle multiple resources with volume discounts.

### 12.4 Revenue Sharing
Optional mechanism where forced acquisition compensates previous owner.

---
End of file 