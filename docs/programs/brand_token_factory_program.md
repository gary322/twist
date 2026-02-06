# Brand Token Factory Program (`brand_token_factory`)

Program ID: `BRAND111111111111111111111111111111111111111`  •  Language: Rust (Anchor)  •  Type: Optional

---
## 1. Purpose
Enables product/website owners to create optional fixed-supply branded tokens that can be distributed alongside AC-D rewards. These tokens provide additional upside for users without affecting the core AC-D tokenomics or inflation controls.

---
## 2. Key Properties
- **Fixed Supply**: 10M tokens max, mint authority burned after creation
- **No Protocol Value**: BrandTokens have no guaranteed value or AC-D backing
- **Owner Controlled**: Distribution rules entirely up to the creator
- **Optional Integration**: Sites can operate with AC-D only
- **SPL Compatible**: Standard tokens that work in any wallet/DEX

---
## 3. Account Structure

### 3.1 Factory State
```rust
#[account]
pub struct FactoryState {
    pub authority: Pubkey,                   // Upgrade authority
    pub total_brands_created: u64,           // Counter
    pub creation_fee: u64,                   // USDC fee (if any)
    pub default_decimals: u8,                // 6
    pub default_supply: u64,                 // 10_000_000
    pub paused: bool,                        // Emergency pause
}

// PDA: ["factory_state"]
```

### 3.2 Brand Token Registry
```rust
#[account]
pub struct BrandToken {
    pub mint: Pubkey,                        // SPL Token mint
    pub owner: Pubkey,                       // Who created it
    pub site_hash: [u8; 32],                 // Associated website
    pub name: String,                        // Token name (32 chars)
    pub symbol: String,                      // Token symbol (10 chars)
    pub uri: String,                         // Metadata URI
    pub total_supply: u64,                   // Fixed at creation
    pub created_at: i64,                     // Timestamp
    pub distribution_rules: DistributionRules,
    pub stats: BrandTokenStats,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DistributionRules {
    pub reward_ratio: u8,                    // 0-100% of rewards as BrandToken
    pub vesting_period: Option<i64>,         // Optional vesting
    pub whitelist_only: bool,                // Restrict recipients
    pub transferable: bool,                  // Can users trade it
}

#[derive(AnchorSerialize, AnchorDeserialize, Default)]
pub struct BrandTokenStats {
    pub total_distributed: u64,
    pub unique_holders: u32,
    pub last_distribution: i64,
}

// PDA: ["brand_token", mint]
```

### 3.3 Distribution Escrow
```rust
#[account]
pub struct DistributionEscrow {
    pub brand_token: Pubkey,                 // Which token
    pub owner: Pubkey,                       // Who funds it
    pub balance: u64,                        // Tokens in escrow
    pub distributed: u64,                    // Tokens paid out
    pub authorized_programs: Vec<Pubkey>,    // Can withdraw
}

// PDA: ["escrow", brand_token_mint]
```

---
## 4. Core Instructions

### 4.1 Create Brand Token
```rust
pub fn create_brand_token(
    ctx: Context<CreateBrandToken>,
    params: CreateBrandTokenParams,
) -> Result<()> {
    let factory_state = &ctx.accounts.factory_state;
    let clock = Clock::get()?;
    
    // Check not paused
    require!(!factory_state.paused, ErrorCode::FactoryPaused);
    
    // Validate parameters
    require!(
        params.name.len() <= 32 && params.name.len() > 0,
        ErrorCode::InvalidTokenName
    );
    
    require!(
        params.symbol.len() <= 10 && params.symbol.len() > 0,
        ErrorCode::InvalidTokenSymbol
    );
    
    require!(
        params.total_supply <= 10_000_000 * 10u64.pow(params.decimals as u32),
        ErrorCode::SupplyTooHigh
    );
    
    // Pay creation fee if any
    if factory_state.creation_fee > 0 {
        transfer_fee(
            &ctx.accounts.owner_usdc_account,
            &ctx.accounts.factory_fee_account,
            factory_state.creation_fee,
            &ctx.accounts.owner,
            &ctx.accounts.token_program,
        )?;
    }
    
    // Create mint account
    let mint_rent = Rent::get()?.minimum_balance(Mint::LEN);
    create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        mint_rent,
        Mint::LEN as u64,
        &ctx.accounts.token_program.key(),
    )?;
    
    // Initialize mint
    initialize_mint(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint {
                mint: ctx.accounts.mint.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        ),
        params.decimals,
        &ctx.accounts.mint_authority.key(), // Temporary authority
        None, // No freeze authority
    )?;
    
    // Mint total supply to escrow
    let escrow_seeds = &[
        b"escrow",
        ctx.accounts.mint.key().as_ref(),
        &[ctx.bumps.escrow],
    ];
    
    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.escrow_token_account.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            &[escrow_seeds],
        ),
        params.total_supply,
    )?;
    
    // Burn mint authority (no more minting possible)
    set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.mint_authority.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
            &[escrow_seeds],
        ),
        AuthorityType::MintTokens,
        None, // Burn authority
    )?;
    
    // Create metadata
    create_metadata_accounts_v3(
        CpiContext::new_with_signer(
            ctx.accounts.metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                mint_authority: ctx.accounts.mint_authority.to_account_info(),
                payer: ctx.accounts.owner.to_account_info(),
                update_authority: ctx.accounts.owner.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            &[escrow_seeds],
        ),
        DataV2 {
            name: params.name.clone(),
            symbol: params.symbol.clone(),
            uri: params.uri.clone(),
            seller_fee_basis_points: 0,
            creators: Some(vec![Creator {
                address: ctx.accounts.owner.key(),
                verified: true,
                share: 100,
            }]),
            collection: None,
            uses: None,
        },
        true, // Is mutable
        true, // Update authority is signer
        None, // Collection details
    )?;
    
    // Initialize registry entry
    let brand_token = &mut ctx.accounts.brand_token;
    brand_token.mint = ctx.accounts.mint.key();
    brand_token.owner = ctx.accounts.owner.key();
    brand_token.site_hash = params.site_hash;
    brand_token.name = params.name;
    brand_token.symbol = params.symbol;
    brand_token.uri = params.uri;
    brand_token.total_supply = params.total_supply;
    brand_token.created_at = clock.unix_timestamp;
    brand_token.distribution_rules = params.distribution_rules;
    brand_token.stats = BrandTokenStats::default();
    
    // Initialize escrow
    let escrow = &mut ctx.accounts.escrow;
    escrow.brand_token = ctx.accounts.mint.key();
    escrow.owner = ctx.accounts.owner.key();
    escrow.balance = params.total_supply;
    escrow.distributed = 0;
    escrow.authorized_programs = vec![
        brand_reward_router::ID,
        campaign_reward_router::ID,
    ];
    
    // Update factory stats
    let factory_state = &mut ctx.accounts.factory_state;
    factory_state.total_brands_created += 1;
    
    emit!(BrandTokenCreated {
        mint: ctx.accounts.mint.key(),
        owner: ctx.accounts.owner.key(),
        name: params.name,
        symbol: params.symbol,
        total_supply: params.total_supply,
        site_hash: params.site_hash,
    });
    
    Ok(())
}
```

### 4.2 Update Distribution Rules
```rust
pub fn update_distribution_rules(
    ctx: Context<UpdateRules>,
    new_rules: DistributionRules,
) -> Result<()> {
    let brand_token = &mut ctx.accounts.brand_token;
    
    // Only owner can update
    require!(
        ctx.accounts.owner.key() == brand_token.owner,
        ErrorCode::UnauthorizedOwner
    );
    
    // Validate new rules
    require!(
        new_rules.reward_ratio <= 100,
        ErrorCode::InvalidRewardRatio
    );
    
    if let Some(vesting) = new_rules.vesting_period {
        require!(
            vesting >= 0 && vesting <= 365 * 86400, // Max 1 year
            ErrorCode::InvalidVestingPeriod
        );
    }
    
    let old_rules = brand_token.distribution_rules.clone();
    brand_token.distribution_rules = new_rules.clone();
    
    emit!(DistributionRulesUpdated {
        mint: brand_token.mint,
        old_rules,
        new_rules,
        updated_by: ctx.accounts.owner.key(),
    });
    
    Ok(())
}
```

### 4.3 Withdraw from Escrow
```rust
pub fn withdraw_from_escrow(
    ctx: Context<WithdrawFromEscrow>,
    amount: u64,
    recipient: Pubkey,
) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    
    // Check authorization
    let authorized = ctx.accounts.authority.key() == escrow.owner ||
                    escrow.authorized_programs.contains(&ctx.accounts.program_id);
    
    require!(authorized, ErrorCode::UnauthorizedWithdrawal);
    
    // Check balance
    require!(
        escrow.balance >= amount,
        ErrorCode::InsufficientEscrowBalance
    );
    
    // Transfer tokens
    let escrow_seeds = &[
        b"escrow",
        escrow.brand_token.as_ref(),
        &[ctx.bumps.escrow],
    ];
    
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            &[escrow_seeds],
        ),
        amount,
    )?;
    
    // Update balances
    escrow.balance -= amount;
    escrow.distributed += amount;
    
    // Update stats
    let brand_token = &mut ctx.accounts.brand_token;
    brand_token.stats.total_distributed += amount;
    brand_token.stats.last_distribution = Clock::get()?.unix_timestamp;
    
    emit!(EscrowWithdrawal {
        brand_token: escrow.brand_token,
        amount,
        recipient,
        remaining_balance: escrow.balance,
        authority: ctx.accounts.authority.key(),
    });
    
    Ok(())
}
```

### 4.4 Manual Distribution
```rust
pub fn distribute_tokens(
    ctx: Context<DistributeTokens>,
    distributions: Vec<Distribution>,
) -> Result<()> {
    let brand_token = &ctx.accounts.brand_token;
    
    // Only owner can manually distribute
    require!(
        ctx.accounts.owner.key() == brand_token.owner,
        ErrorCode::UnauthorizedOwner
    );
    
    // Validate distributions
    let total_amount: u64 = distributions.iter()
        .map(|d| d.amount)
        .sum();
    
    require!(
        total_amount <= ctx.accounts.escrow.balance,
        ErrorCode::InsufficientEscrowBalance
    );
    
    require!(
        distributions.len() <= 20, // Batch limit
        ErrorCode::TooManyDistributions
    );
    
    // Process each distribution
    for distribution in distributions {
        // Validate recipient
        if brand_token.distribution_rules.whitelist_only {
            require!(
                is_whitelisted(&distribution.recipient, &brand_token.mint)?,
                ErrorCode::RecipientNotWhitelisted
            );
        }
        
        // Transfer tokens
        withdraw_from_escrow_internal(
            ctx.accounts,
            distribution.amount,
            distribution.recipient,
        )?;
        
        // Apply vesting if configured
        if let Some(vesting_period) = brand_token.distribution_rules.vesting_period {
            create_vesting_schedule(
                &distribution.recipient,
                distribution.amount,
                vesting_period,
            )?;
        }
    }
    
    // Update unique holders estimate
    ctx.accounts.brand_token.stats.unique_holders += distributions.len() as u32;
    
    emit!(TokensDistributed {
        brand_token: brand_token.mint,
        total_amount,
        recipient_count: distributions.len(),
        distributor: ctx.accounts.owner.key(),
    });
    
    Ok(())
}
```

---
## 5. Integration Points

### 5.1 With Brand Reward Router
```rust
// Called by brand_reward_router when user completes action
pub fn claim_brand_reward(
    brand_token_mint: Pubkey,
    user: Pubkey,
    amount: u64,
) -> Result<()> {
    // Router calls withdraw_from_escrow with its PDA authority
    brand_token_factory::cpi::withdraw_from_escrow(
        ctx,
        amount,
        user,
    )
}
```

### 5.2 With Thermostat
```rust
// During bonded minting, check if site has BrandToken
pub fn get_brand_token_for_site(site_hash: [u8; 32]) -> Option<BrandToken> {
    // Query registry by site_hash
    let (pda, _) = Pubkey::find_program_address(
        &[b"brand_token_by_site", &site_hash],
        &brand_token_factory::ID
    );
    
    Account::<BrandToken>::try_from(&pda).ok()
}
```

---
## 6. View Functions

### 6.1 Get Brand Token Info
```rust
pub fn get_brand_token(mint: Pubkey) -> Result<BrandTokenInfo> {
    let (brand_pda, _) = Pubkey::find_program_address(
        &[b"brand_token", mint.as_ref()],
        &id()
    );
    
    let brand = Account::<BrandToken>::try_from(&brand_pda)?;
    let escrow = get_escrow_info(mint)?;
    
    Ok(BrandTokenInfo {
        mint,
        name: brand.name,
        symbol: brand.symbol,
        total_supply: brand.total_supply,
        circulating_supply: brand.stats.total_distributed,
        escrow_balance: escrow.balance,
        owner: brand.owner,
        created_at: brand.created_at,
        distribution_rules: brand.distribution_rules,
    })
}
```

### 6.2 List Tokens by Owner
```rust
pub fn get_tokens_by_owner(owner: Pubkey) -> Result<Vec<Pubkey>> {
    // In practice, use getProgramAccounts with memcmp filter
    // This is pseudo-code for the concept
    
    let accounts = get_program_accounts_filtered(
        &brand_token_factory::ID,
        &[
            Filter::DataSize(BrandToken::SIZE),
            Filter::Memcmp {
                offset: 8 + 32, // After discriminator + mint
                bytes: owner.to_bytes(),
            },
        ],
    )?;
    
    Ok(accounts.into_iter()
        .map(|(pubkey, _)| pubkey)
        .collect())
}
```

---
## 7. Security Model

### 7.1 Key Invariants
1. **Supply is truly fixed**: Mint authority burned after creation
2. **Owner controls distribution**: But cannot mint more tokens
3. **No protocol risk**: BrandTokens isolated from AC-D system
4. **Escrow transparency**: All tokens trackable on-chain

### 7.2 Attack Mitigation
| Attack | Mitigation |
|--------|-----------|
| Infinite mint | Mint authority burned |
| Rug pull | Tokens in escrow, transparent |
| Spam creation | Optional creation fee |
| Distribution abuse | Rate limits, whitelist option |

---
## 8. Testing

### 8.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_fixed_supply() {
        let mut test = setup_test().await;
        
        // Create token with 1M supply
        let params = CreateBrandTokenParams {
            name: "TestCoin".to_string(),
            symbol: "TEST".to_string(),
            total_supply: 1_000_000_000_000, // 1M with 6 decimals
            decimals: 6,
            ..Default::default()
        };
        
        create_brand_token(&mut test, params).await?;
        
        // Try to mint more - should fail
        let result = mint_more_tokens(&mut test, 1000).await;
        assert!(result.is_err());
        
        // Verify mint authority is None
        let mint = get_mint(&test, token_mint).await;
        assert_eq!(mint.mint_authority, COption::None);
    }
    
    #[tokio::test]
    async fn test_distribution_limits() {
        let mut test = setup_test().await;
        
        // Create token and set 30% brand reward ratio
        create_and_configure_token(&mut test, 30).await?;
        
        // User earns 100 AC-D equivalent
        let ac_reward = 100_000_000_000;
        let brand_reward = 30_000_000_000; // 30%
        
        // Distribute brand tokens
        distribute_reward(&mut test, user, brand_reward).await?;
        
        // Check user received correct amount
        let balance = get_token_balance(&test, user, brand_mint).await;
        assert_eq!(balance, brand_reward);
        
        // Check escrow depleted correctly
        let escrow = get_escrow(&test, brand_mint).await;
        assert_eq!(escrow.distributed, brand_reward);
    }
}
```

### 8.2 Integration Tests
```rust
#[tokio::test]
async fn test_brand_token_with_rewards() {
    let mut test = setup_full_test().await;
    
    // Owner creates BrandToken
    let brand_mint = create_brand_token(&mut test, site_owner).await?;
    
    // Configure 50/50 AC-D and BrandToken rewards
    set_reward_ratio(&mut test, brand_mint, 50).await?;
    
    // User visits site and earns rewards
    let vau = create_test_vau(user, site_hash, 5);
    process_vau(&mut test, vau).await?;
    
    // Check user got both tokens
    let ac_balance = get_ac_balance(&test, user).await;
    let brand_balance = get_brand_balance(&test, user, brand_mint).await;
    
    assert!(ac_balance > 0);
    assert!(brand_balance > 0);
    assert_eq!(brand_balance, ac_balance); // 50/50 split
}
```

---
## 9. Economic Considerations

### 9.1 Value Proposition for Owners
- **User Loyalty**: Additional incentive to engage with product
- **Speculation**: Token can appreciate if product succeeds
- **Governance**: Could be used for feature voting
- **Gamification**: Achievements, levels, exclusive content

### 9.2 Value Proposition for Users
- **Upside Potential**: Unlike AC-D, BrandTokens can appreciate
- **Exclusive Access**: Tokens can gate content/features
- **Trading**: Can sell if transferable
- **Collection**: Badge of early supporter status

### 9.3 No Protocol Risk
- BrandTokens cannot be used to mint AC-D
- Failure of a BrandToken doesn't affect AHEE
- No oracle dependencies or liquidations
- Pure upside experiment for owners

---
## 10. Example Use Cases

### 10.1 Gaming Site
```rust
// Player completes level
ahee.track({
    feature: "level_complete",
    level: 10,
    score: 5000
});

// Reward: 50 AC-D + 100 GAME tokens
```

### 10.2 Content Creator
```rust
// Subscriber watches full video
ahee.track({
    feature: "video_watched",
    duration: 600,
    video_id: "abc123"
});

// Reward: 20 AC-D + 50 CREATOR tokens
```

### 10.3 E-commerce
```rust
// Customer makes purchase
ahee.track({
    feature: "purchase",
    amount: 99.99,
    category: "electronics"
});

// Reward: 100 AC-D + 500 SHOP tokens (5x multiplier)
```

---
## 11. Future Enhancements

### 11.1 Token Utilities
- Staking for multipliers
- Governance voting
- Access tokens for premium features
- Liquidity mining programs

### 11.2 Cross-Brand Partnerships
- Token swaps between brands
- Collaborative rewards
- Ecosystem index tokens

### 11.3 Advanced Distribution
- Automated market making
- Bonding curves
- Dutch auctions for initial distribution

---
End of file 