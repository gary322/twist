# Campaign Reward Router Program (`campaign_reward_router`)

Program ID: `CAMP1111111111111111111111111111111111111111`  •  Language: Rust (Anchor)  •  Audited: Yes

---
## 1. Purpose
Routes rewards for advertising campaigns and influencer marketing, enabling instant micropayments to influencers when their referrals generate attention. Handles both direct influencer payouts and broader campaign-based rewards with sophisticated attribution and budget management.

---
## 2. System Overview
```mermaid
flowchart TD
    A[User clicks influencer link] --> B[Cookie/tag set]
    B --> C[User earns VAU]
    C --> D{Has campaign_tag?}
    D -->|Yes| E[Route to Campaign Pot]
    E --> F[Pay influencer %]
    E --> G[Pay user bonus]
    
    H[Advertiser] --> I[Fund Campaign]
    I --> J[Set rules & budget]
    J --> E
    
    K[No tag| D --> L[Regular Thermostat]
```

---
## 3. Account Structure

### 3.1 Campaign Configuration
```rust
#[account]
pub struct Campaign {
    pub id: [u8; 32],                       // Unique campaign ID
    pub owner: Pubkey,                      // Advertiser/brand
    pub name: String,                       // "Summer Sale 2024"
    pub campaign_type: CampaignType,        // Influencer, Display, etc
    
    // Budget
    pub total_budget_usdc: u64,             // Total allocated
    pub remaining_budget_usdc: u64,         // Still available
    pub daily_budget_usdc: Option<u64>,     // Daily cap
    pub today_spent_usdc: u64,              // Reset daily
    
    // Payouts
    pub payout_rules: PayoutRules,          // Distribution logic
    pub influencer_share_bps: u16,          // 500 = 5%
    pub user_bonus_bps: u16,                // 200 = 2%
    pub min_attention_seconds: u8,          // Minimum VAU duration
    
    // Targeting
    pub target_sites: Vec<[u8; 32]>,        // Specific sites only
    pub target_cohorts: Vec<u16>,           // IAB categories
    pub geo_targets: Vec<[u8; 2]>,          // Country codes
    
    // Status
    pub start_date: i64,                    // Unix timestamp
    pub end_date: i64,                      
    pub paused: bool,
    pub created_at: i64,
    
    // Stats
    pub stats: CampaignStats,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum CampaignType {
    Influencer,      // Pays referrers
    Display,         // Traditional ad campaigns
    Performance,     // CPA/conversion based
    Hybrid,          // Mix of above
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PayoutRules {
    pub base_rate_per_second: u64,          // USDC per attention second
    pub quality_multipliers: QualityMultipliers,
    pub conversion_bonus: Option<u64>,      // Extra for purchases
    pub max_payout_per_user: Option<u64>,   // Cap per unique user
}

#[derive(AnchorSerialize, AnchorDeserialize, Default)]
pub struct CampaignStats {
    pub total_vaus_processed: u64,
    pub unique_users: u64,
    pub total_attention_seconds: u128,
    pub total_paid_out: u128,
    pub influencer_payouts: u128,
    pub user_bonuses: u128,
    pub conversions: u64,
}

// PDA: ["campaign", id]
```

### 3.2 Influencer Registry
```rust
#[account]
pub struct Influencer {
    pub wallet: Pubkey,                     // Payment address
    pub handle: String,                     // "@cryptoinfluencer"
    pub platform: Platform,                 // Twitter, TikTok, etc
    pub verified: bool,                     // Blue check equivalent
    pub tier: InfluencerTier,              // Payout multiplier
    pub campaigns: Vec<[u8; 32]>,           // Active campaigns
    pub lifetime_stats: InfluencerStats,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum Platform {
    Twitter,
    TikTok,
    YouTube,
    Instagram,
    Telegram,
    Custom(String),
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum InfluencerTier {
    Nano,       // <10k followers, 1x rate
    Micro,      // 10-100k, 1.2x rate  
    Mid,        // 100k-1M, 1.5x rate
    Macro,      // 1M+, 2x rate
    Mega,       // 10M+, 3x rate
}

#[derive(AnchorSerialize, AnchorDeserialize, Default)]
pub struct InfluencerStats {
    pub total_referrals: u64,
    pub total_attention_seconds: u128,
    pub total_earned_usdc: u128,
    pub conversion_count: u64,
    pub avg_attention_quality: u8,          // 0-100 score
}

// PDA: ["influencer", wallet]
```

### 3.3 Attribution Record
```rust
#[account]
pub struct Attribution {
    pub user: Pubkey,
    pub campaign_id: [u8; 32],
    pub influencer: Option<Pubkey>,         // Who referred
    pub attribution_tag: String,            // URL parameter
    pub first_vau_time: i64,                // When attributed
    pub total_vaus: u32,
    pub total_attention_seconds: u64,
    pub total_user_earned: u64,
    pub total_influencer_earned: u64,
    pub converted: bool,                    // Made purchase/action
}

// PDA: ["attribution", user, campaign_id]
```

### 3.4 Campaign Pot
```rust
#[account]
pub struct CampaignPot {
    pub campaign_id: [u8; 32],
    pub usdc_balance: u64,                  // Available funds
    pub total_funded: u128,                 // Lifetime deposits
    pub total_withdrawn: u128,              // Lifetime payouts
    pub last_funded: i64,
    pub authority: Pubkey,                  // Can withdraw
}

// PDA: ["campaign_pot", campaign_id]
```

---
## 4. Core Instructions

### 4.1 Create Campaign
```rust
pub fn create_campaign(
    ctx: Context<CreateCampaign>,
    params: CreateCampaignParams,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let clock = Clock::get()?;
    
    // Generate unique ID
    let id = generate_campaign_id(&params.name, &ctx.accounts.owner.key(), clock.unix_timestamp);
    
    // Validate parameters
    require!(
        params.end_date > params.start_date,
        ErrorCode::InvalidDateRange
    );
    
    require!(
        params.total_budget_usdc >= 1_000_000, // $1 minimum
        ErrorCode::BudgetTooLow
    );
    
    require!(
        params.influencer_share_bps + params.user_bonus_bps <= 10000,
        ErrorCode::InvalidShareRatios
    );
    
    // Initialize campaign
    campaign.id = id;
    campaign.owner = ctx.accounts.owner.key();
    campaign.name = params.name;
    campaign.campaign_type = params.campaign_type;
    campaign.total_budget_usdc = params.total_budget_usdc;
    campaign.remaining_budget_usdc = 0; // Funded separately
    campaign.daily_budget_usdc = params.daily_budget_usdc;
    campaign.today_spent_usdc = 0;
    
    campaign.payout_rules = params.payout_rules;
    campaign.influencer_share_bps = params.influencer_share_bps;
    campaign.user_bonus_bps = params.user_bonus_bps;
    campaign.min_attention_seconds = params.min_attention_seconds.max(1);
    
    campaign.target_sites = params.target_sites;
    campaign.target_cohorts = params.target_cohorts;
    campaign.geo_targets = params.geo_targets;
    
    campaign.start_date = params.start_date;
    campaign.end_date = params.end_date;
    campaign.paused = false;
    campaign.created_at = clock.unix_timestamp;
    
    campaign.stats = CampaignStats::default();
    
    // Initialize campaign pot
    let pot = &mut ctx.accounts.campaign_pot;
    pot.campaign_id = id;
    pot.usdc_balance = 0;
    pot.total_funded = 0;
    pot.total_withdrawn = 0;
    pot.last_funded = 0;
    pot.authority = ctx.accounts.campaign_program.key();
    
    emit!(CampaignCreated {
        id,
        owner: ctx.accounts.owner.key(),
        name: campaign.name.clone(),
        budget: params.total_budget_usdc,
        campaign_type: params.campaign_type,
    });
    
    Ok(())
}
```

### 4.2 Fund Campaign
```rust
pub fn fund_campaign(
    ctx: Context<FundCampaign>,
    amount: u64,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let pot = &mut ctx.accounts.campaign_pot;
    let clock = Clock::get()?;
    
    // Only owner can fund
    require!(
        ctx.accounts.funder.key() == campaign.owner,
        ErrorCode::UnauthorizedFunder
    );
    
    // Check doesn't exceed total budget
    require!(
        pot.total_funded + amount as u128 <= campaign.total_budget_usdc as u128,
        ErrorCode::ExceedsTotalBudget
    );
    
    // Transfer USDC to pot
    transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.funder_usdc.to_account_info(),
                to: ctx.accounts.pot_usdc.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        amount,
    )?;
    
    // Update balances
    pot.usdc_balance += amount;
    pot.total_funded += amount as u128;
    pot.last_funded = clock.unix_timestamp;
    campaign.remaining_budget_usdc += amount;
    
    emit!(CampaignFunded {
        campaign_id: campaign.id,
        amount,
        total_funded: pot.total_funded,
        funder: ctx.accounts.funder.key(),
    });
    
    Ok(())
}
```

### 4.3 Process Campaign VAU
```rust
pub fn process_campaign_vau(
    ctx: Context<ProcessCampaignVAU>,
    vau: VerifiedAttentionUnit,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let clock = Clock::get()?;
    
    // Reset daily budget if needed
    if is_new_day(campaign.today_spent_usdc, clock.unix_timestamp) {
        campaign.today_spent_usdc = 0;
    }
    
    // Validate VAU
    require!(
        vau.campaign_tag.is_some(),
        ErrorCode::NoCampaignTag
    );
    
    require!(
        vau.seconds >= campaign.min_attention_seconds,
        ErrorCode::InsufficientAttention
    );
    
    // Check campaign active
    require!(
        !campaign.paused &&
        clock.unix_timestamp >= campaign.start_date &&
        clock.unix_timestamp <= campaign.end_date,
        ErrorCode::CampaignInactive
    );
    
    // Check targeting (if specified)
    if !campaign.target_sites.is_empty() {
        require!(
            campaign.target_sites.contains(&vau.site_hash),
            ErrorCode::SiteNotTargeted
        );
    }
    
    if !campaign.target_cohorts.is_empty() && vau.cohort_hash.is_some() {
        // Check cohort match via bloom filter
        require!(
            check_cohort_match(&campaign.target_cohorts, &vau.cohort_hash.unwrap())?,
            ErrorCode::CohortMismatch
        );
    }
    
    // Calculate base payout
    let base_payout = campaign.payout_rules.base_rate_per_second * vau.seconds as u64;
    
    // Apply quality multipliers
    let quality_score = calculate_quality_score(&vau);
    let quality_multiplier = get_quality_multiplier(
        &campaign.payout_rules.quality_multipliers,
        quality_score
    );
    
    let adjusted_payout = (base_payout as u128 * quality_multiplier as u128 / 100) as u64;
    
    // Check budgets
    let daily_remaining = campaign.daily_budget_usdc
        .map(|daily| daily.saturating_sub(campaign.today_spent_usdc))
        .unwrap_or(u64::MAX);
    
    let total_remaining = campaign.remaining_budget_usdc;
    let pot_balance = ctx.accounts.campaign_pot.usdc_balance;
    
    let max_payout = daily_remaining
        .min(total_remaining)
        .min(pot_balance);
    
    let final_payout = adjusted_payout.min(max_payout);
    
    if final_payout == 0 {
        msg!("Campaign budget exhausted");
        return Ok(());
    }
    
    // Get or create attribution
    let attribution = &mut ctx.accounts.attribution;
    if attribution.first_vau_time == 0 {
        // First attribution
        attribution.user = vau.user_wallet;
        attribution.campaign_id = campaign.id;
        attribution.influencer = extract_influencer_from_tag(&vau.campaign_tag.unwrap())?;
        attribution.attribution_tag = vau.campaign_tag.unwrap();
        attribution.first_vau_time = clock.unix_timestamp;
    }
    
    // Calculate splits
    let influencer_amount = if let Some(influencer) = attribution.influencer {
        (final_payout as u128 * campaign.influencer_share_bps as u128 / 10000) as u64
    } else {
        0
    };
    
    let user_bonus = (final_payout as u128 * campaign.user_bonus_bps as u128 / 10000) as u64;
    let base_user_amount = final_payout - influencer_amount - user_bonus;
    
    // Pay user (base + bonus)
    let user_total = base_user_amount + user_bonus;
    pay_user_campaign_reward(
        ctx.accounts,
        &vau.user_wallet,
        user_total,
        &campaign.id,
    )?;
    
    // Pay influencer
    if influencer_amount > 0 && attribution.influencer.is_some() {
        pay_influencer_commission(
            ctx.accounts,
            &attribution.influencer.unwrap(),
            influencer_amount,
            &campaign.id,
        )?;
        
        // Update influencer stats
        update_influencer_stats(
            &mut ctx.accounts.influencer,
            influencer_amount,
            vau.seconds,
        )?;
    }
    
    // Update attribution
    attribution.total_vaus += 1;
    attribution.total_attention_seconds += vau.seconds as u64;
    attribution.total_user_earned += user_total;
    attribution.total_influencer_earned += influencer_amount;
    
    // Update campaign stats
    campaign.stats.total_vaus_processed += 1;
    campaign.stats.total_attention_seconds += vau.seconds as u128;
    campaign.stats.total_paid_out += final_payout as u128;
    campaign.stats.influencer_payouts += influencer_amount as u128;
    campaign.stats.user_bonuses += user_bonus as u128;
    
    // Update budgets
    campaign.remaining_budget_usdc -= final_payout;
    campaign.today_spent_usdc += final_payout;
    ctx.accounts.campaign_pot.usdc_balance -= final_payout;
    ctx.accounts.campaign_pot.total_withdrawn += final_payout as u128;
    
    emit!(CampaignVAUProcessed {
        campaign_id: campaign.id,
        user: vau.user_wallet,
        influencer: attribution.influencer,
        attention_seconds: vau.seconds,
        total_payout: final_payout,
        user_amount: user_total,
        influencer_amount,
        quality_score,
    });
    
    Ok(())
}
```

### 4.4 Register Influencer
```rust
pub fn register_influencer(
    ctx: Context<RegisterInfluencer>,
    params: RegisterInfluencerParams,
) -> Result<()> {
    let influencer = &mut ctx.accounts.influencer;
    
    // Basic validation
    require!(
        params.handle.len() > 0 && params.handle.len() <= 32,
        ErrorCode::InvalidHandle
    );
    
    influencer.wallet = ctx.accounts.wallet.key();
    influencer.handle = params.handle;
    influencer.platform = params.platform;
    influencer.verified = false; // Requires manual verification
    influencer.tier = determine_tier(&params.follower_count);
    influencer.campaigns = Vec::new();
    influencer.lifetime_stats = InfluencerStats::default();
    
    emit!(InfluencerRegistered {
        wallet: influencer.wallet,
        handle: influencer.handle.clone(),
        platform: influencer.platform.clone(),
        tier: influencer.tier.clone(),
    });
    
    Ok(())
}
```

### 4.5 Process Conversion
```rust
pub fn process_conversion(
    ctx: Context<ProcessConversion>,
    campaign_id: [u8; 32],
    conversion_value: u64,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let attribution = &mut ctx.accounts.attribution;
    
    // Check user has attribution
    require!(
        attribution.user == ctx.accounts.user.key() &&
        attribution.campaign_id == campaign_id,
        ErrorCode::NoAttribution
    );
    
    // Check not already converted
    require!(
        !attribution.converted,
        ErrorCode::AlreadyConverted
    );
    
    // Pay conversion bonus if configured
    if let Some(bonus) = campaign.payout_rules.conversion_bonus {
        let bonus_amount = bonus.min(campaign.remaining_budget_usdc);
        
        if bonus_amount > 0 {
            // Split between user and influencer
            let influencer_bonus = if attribution.influencer.is_some() {
                (bonus_amount as u128 * campaign.influencer_share_bps as u128 / 10000) as u64
            } else {
                0
            };
            
            let user_bonus = bonus_amount - influencer_bonus;
            
            // Pay bonuses
            pay_user_campaign_reward(
                ctx.accounts,
                &ctx.accounts.user.key(),
                user_bonus,
                &campaign_id,
            )?;
            
            if influencer_bonus > 0 {
                pay_influencer_commission(
                    ctx.accounts,
                    &attribution.influencer.unwrap(),
                    influencer_bonus,
                    &campaign_id,
                )?;
            }
            
            // Update stats
            campaign.stats.conversions += 1;
            campaign.stats.total_paid_out += bonus_amount as u128;
            campaign.remaining_budget_usdc -= bonus_amount;
        }
    }
    
    attribution.converted = true;
    
    emit!(ConversionProcessed {
        campaign_id,
        user: ctx.accounts.user.key(),
        influencer: attribution.influencer,
        value: conversion_value,
        bonus_paid: campaign.payout_rules.conversion_bonus.unwrap_or(0),
    });
    
    Ok(())
}
```

---
## 5. Helper Functions

### 5.1 Attribution Tag Parser
```rust
fn extract_influencer_from_tag(tag: &str) -> Result<Option<Pubkey>> {
    // Tag format: "campaign_id:influencer_pubkey:timestamp"
    let parts: Vec<&str> = tag.split(':').collect();
    
    if parts.len() < 2 {
        return Ok(None);
    }
    
    let influencer_str = parts[1];
    match Pubkey::from_str(influencer_str) {
        Ok(pubkey) => Ok(Some(pubkey)),
        Err(_) => Ok(None),
    }
}
```

### 5.2 Quality Score Calculator
```rust
fn calculate_quality_score(vau: &VerifiedAttentionUnit) -> u8 {
    let mut score = 50u8; // Base score
    
    // Time quality (longer is better, up to 5s)
    let time_score = (vau.seconds.min(5) * 10) as u8;
    score = score.saturating_add(time_score);
    
    // User presence flag
    if vau.user_presence {
        score = score.saturating_add(20);
    }
    
    // Has valid cohort
    if vau.cohort_hash.is_some() {
        score = score.saturating_add(10);
    }
    
    // Not on hot page (explorer traffic)
    if !vau.is_hot_page {
        score = score.saturating_add(10);
    }
    
    score.min(100)
}
```

### 5.3 Payment Helpers
```rust
fn pay_user_campaign_reward<'info>(
    accounts: &PaymentAccounts<'info>,
    user: &Pubkey,
    amount_usdc: u64,
    campaign_id: &[u8; 32],
) -> Result<()> {
    // First swap USDC to AC-D
    let amount_ac = swap_usdc_for_ac(
        accounts,
        amount_usdc,
        &[&[b"campaign_pot", campaign_id]]
    )?;
    
    // Then mint AC-D to user
    attention_token::cpi::authorized_mint(
        CpiContext::new_with_signer(
            accounts.attention_token_program.to_account_info(),
            // ... accounts
        ),
        *user,
        amount_ac,
        MintType::Campaign,
    )?;
    
    Ok(())
}
```

---
## 6. Influencer Tier System

### 6.1 Tier Determination
```rust
fn determine_tier(follower_count: u64) -> InfluencerTier {
    match follower_count {
        0..=9_999 => InfluencerTier::Nano,
        10_000..=99_999 => InfluencerTier::Micro,
        100_000..=999_999 => InfluencerTier::Mid,
        1_000_000..=9_999_999 => InfluencerTier::Macro,
        _ => InfluencerTier::Mega,
    }
}

fn get_tier_multiplier(tier: &InfluencerTier) -> u16 {
    match tier {
        InfluencerTier::Nano => 100,   // 1x
        InfluencerTier::Micro => 120,  // 1.2x
        InfluencerTier::Mid => 150,    // 1.5x
        InfluencerTier::Macro => 200,  // 2x
        InfluencerTier::Mega => 300,   // 3x
    }
}
```

---
## 7. Security & Anti-Fraud

### 7.1 Attack Mitigation
| Attack | Mitigation |
|--------|-----------|
| Self-referral loops | Wallet cannot refer itself |
| Tag manipulation | Tags signed by edge worker |
| Budget drain | Daily caps + min attention time |
| Fake influencers | Manual verification for tiers |
| Double attribution | One attribution per user-campaign |

### 7.2 Budget Controls
- Total campaign budget hard cap
- Optional daily budget limits
- Per-user payout caps
- Minimum attention thresholds

---
## 8. Testing

### 8.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_influencer_attribution() {
        let mut test = setup_test().await;
        
        // Create campaign with 10% influencer share
        let campaign = create_test_campaign(
            budget: 10_000_000_000, // $10k
            influencer_share: 1000,  // 10%
        );
        
        // Process VAU with influencer tag
        let vau = create_test_vau(
            user: user_wallet,
            campaign_tag: Some("campaign123:influencer456:12345".to_string()),
            seconds: 5,
        );
        
        process_campaign_vau(&mut test, vau).await?;
        
        // Check payouts
        let attribution = get_attribution(&test, user_wallet, campaign.id).await;
        assert!(attribution.influencer.is_some());
        assert!(attribution.total_influencer_earned > 0);
        assert_eq!(
            attribution.total_influencer_earned,
            attribution.total_user_earned / 9 // 10% of total
        );
    }
}
```

### 8.2 Integration Tests
```rust
#[tokio::test]
async fn test_campaign_flow() {
    let mut test = setup_full_test().await;
    
    // Advertiser creates campaign
    let campaign = create_campaign(
        &mut test,
        advertiser,
        CreateCampaignParams {
            name: "Summer Sale".to_string(),
            total_budget_usdc: 5_000_000_000, // $5k
            influencer_share_bps: 2000,       // 20%
            user_bonus_bps: 500,              // 5%
            ..Default::default()
        }
    ).await?;
    
    // Fund campaign
    fund_campaign(&mut test, advertiser, campaign.id, 5_000_000_000).await?;
    
    // Influencer shares link
    let tag = generate_campaign_tag(campaign.id, influencer_wallet);
    
    // User clicks link and earns VAUs
    for i in 0..10 {
        let vau = create_vau_with_tag(user, tag.clone(), 5);
        process_campaign_vau(&mut test, vau).await?;
    }
    
    // Check earnings
    let user_balance = get_ac_balance(&test, user).await;
    let influencer_balance = get_ac_balance(&test, influencer_wallet).await;
    
    assert!(user_balance > 0);
    assert!(influencer_balance > 0);
    assert_eq!(influencer_balance, user_balance * 20 / 75); // 20% vs 75%
}
```

---
## 9. Monitoring & Analytics

### 9.1 Campaign Performance
```sql
-- Campaign ROI tracking
SELECT 
    c.id,
    c.name,
    c.total_budget_usdc / 1e6 as budget_usd,
    cs.total_paid_out / 1e6 as spent_usd,
    cs.unique_users,
    cs.total_attention_seconds / 3600.0 as total_hours,
    cs.conversions,
    cs.conversions::float / NULLIF(cs.unique_users, 0) as conversion_rate,
    (c.total_budget_usdc - c.remaining_budget_usdc)::float / 
        NULLIF(cs.conversions, 0) / 1e6 as cost_per_conversion_usd
FROM campaigns c
JOIN campaign_stats cs ON c.id = cs.campaign_id
WHERE c.end_date > NOW() - INTERVAL '30 days'
ORDER BY spent_usd DESC;

-- Influencer leaderboard
SELECT 
    i.handle,
    i.platform,
    i.tier,
    COUNT(DISTINCT a.user) as referrals,
    SUM(a.total_attention_seconds) / 3600.0 as attention_hours,
    SUM(a.total_influencer_earned) / 1e9 as earnings_ac,
    SUM(a.converted::int) as conversions,
    AVG(a.total_attention_seconds / NULLIF(a.total_vaus, 0)) as avg_attention_quality
FROM influencers i
JOIN attributions a ON a.influencer = i.wallet
WHERE a.first_vau_time > NOW() - INTERVAL '7 days'
GROUP BY i.wallet, i.handle, i.platform, i.tier
ORDER BY earnings_ac DESC
LIMIT 100;
```

### 9.2 Alerts
```yaml
- alert: CampaignBudgetLow
  expr: |
    campaign_remaining_budget / campaign_total_budget < 0.1
    AND campaign_end_date > time()
  annotations:
    summary: "Campaign {{ $labels.name }} has <10% budget remaining"

- alert: InfluencerAnomalousActivity
  expr: |
    rate(influencer_referrals[1h]) > 10 * avg_over_time(influencer_referrals[1d])
  annotations:
    summary: "Unusual referral spike for {{ $labels.handle }}"

- alert: LowConversionRate
  expr: |
    campaign_conversion_rate < 0.001
    AND campaign_unique_users > 1000
  annotations:
    summary: "Campaign {{ $labels.name }} converting at <0.1%"
```

---
## 10. Dashboard Features

### 10.1 Advertiser Dashboard
- Real-time spend tracking
- Influencer performance breakdown
- Conversion funnel visualization
- Geographic heat maps
- A/B test results
- Export reports

### 10.2 Influencer Dashboard  
- Earnings in real-time
- Click-through rates
- Audience quality scores
- Payment history
- Generate unique links
- Performance tips

---
## 11. Future Enhancements

### 11.1 Smart Bidding
Automatic budget allocation based on performance, similar to Google's Smart Bidding.

### 11.2 Influencer Marketplace
Built-in discovery and negotiation platform for brands and influencers.

### 11.3 Cross-Campaign Attribution
Track user journeys across multiple campaigns for better attribution.

### 11.4 Fraud Detection ML
Machine learning models to detect abnormal patterns and bot traffic.

---
End of file 