use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::defi::*;
use crate::utils::{validate_amount, safe_mul, safe_div, safe_add};

#[derive(Accounts)]
#[instruction(params: PoolParams)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    /// The TWIST token mint
    #[account(
        constraint = twist_mint.key() == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub twist_mint: Account<'info, Mint>,
    
    /// The USDC token mint
    pub usdc_mint: Account<'info, Mint>,
    
    /// CHECK: Whirlpool config account - verified by CPI
    pub whirlpools_config: AccountInfo<'info>,
    
    /// CHECK: Token mint A (should be TWIST) - verified by CPI
    pub token_mint_a: AccountInfo<'info>,
    
    /// CHECK: Token mint B (should be USDC) - verified by CPI
    pub token_mint_b: AccountInfo<'info>,
    
    /// CHECK: Whirlpool account to be initialized - created by CPI
    #[account(mut)]
    pub whirlpool: AccountInfo<'info>,
    
    /// CHECK: Token vault A - created by CPI
    #[account(mut)]
    pub token_vault_a: AccountInfo<'info>,
    
    /// CHECK: Token vault B - created by CPI
    #[account(mut)]
    pub token_vault_b: AccountInfo<'info>,
    
    /// CHECK: Fee tier account - verified by CPI
    pub fee_tier: AccountInfo<'info>,
    
    /// The pool oracle account to store price data
    #[account(
        init,
        payer = authority,
        space = 8 + PoolOracle::LEN,
        seeds = [b"pool_oracle", whirlpool.key().as_ref()],
        bump
    )]
    pub oracle: Account<'info, PoolOracle>,
    
    /// CHECK: Whirlpool program
    pub whirlpool_program: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(twist_amount: u64, usdc_amount: u64)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub liquidity_provider: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        constraint = user_twist_account.owner == liquidity_provider.key() @ TwistError::Unauthorized,
        constraint = user_twist_account.mint == program_state.mint @ TwistError::InvalidMintAuthority,
        constraint = user_twist_account.amount >= twist_amount @ TwistError::InsufficientLiquidity
    )]
    pub user_twist_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = user_usdc_account.owner == liquidity_provider.key() @ TwistError::Unauthorized,
        constraint = user_usdc_account.mint == usdc_mint.key() @ TwistError::InvalidMintAuthority,
        constraint = user_usdc_account.amount >= usdc_amount @ TwistError::InsufficientLiquidity
    )]
    pub user_usdc_account: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    /// CHECK: Whirlpool account - verified in handler
    #[account(mut)]
    pub whirlpool: AccountInfo<'info>,
    
    /// CHECK: Token vault A - verified in handler
    #[account(mut)]
    pub token_vault_a: AccountInfo<'info>,
    
    /// CHECK: Token vault B - verified in handler
    #[account(mut)]
    pub token_vault_b: AccountInfo<'info>,
    
    /// CHECK: Position mint - created by CPI
    #[account(mut)]
    pub position_mint: AccountInfo<'info>,
    
    /// CHECK: Position token account - created by CPI
    #[account(mut)]
    pub position_token_account: AccountInfo<'info>,
    
    /// CHECK: Tick array lower - verified by CPI
    #[account(mut)]
    pub tick_array_lower: AccountInfo<'info>,
    
    /// CHECK: Tick array upper - verified by CPI
    #[account(mut)]
    pub tick_array_upper: AccountInfo<'info>,
    
    /// Pool oracle for price updates
    #[account(
        mut,
        seeds = [b"pool_oracle", whirlpool.key().as_ref()],
        bump,
    )]
    pub oracle: Account<'info, PoolOracle>,
    
    /// CHECK: Whirlpool program
    pub whirlpool_program: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub liquidity_provider: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        constraint = user_twist_account.owner == liquidity_provider.key() @ TwistError::Unauthorized,
        constraint = user_twist_account.mint == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub user_twist_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = user_usdc_account.owner == liquidity_provider.key() @ TwistError::Unauthorized,
        constraint = user_usdc_account.mint == usdc_mint.key() @ TwistError::InvalidMintAuthority
    )]
    pub user_usdc_account: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    /// CHECK: Whirlpool account - verified in handler
    #[account(mut)]
    pub whirlpool: AccountInfo<'info>,
    
    /// CHECK: Token vault A - verified in handler
    #[account(mut)]
    pub token_vault_a: AccountInfo<'info>,
    
    /// CHECK: Token vault B - verified in handler
    #[account(mut)]
    pub token_vault_b: AccountInfo<'info>,
    
    /// CHECK: Position mint - verified in handler
    pub position_mint: AccountInfo<'info>,
    
    /// CHECK: Position token account - verified in handler
    #[account(mut)]
    pub position_token_account: AccountInfo<'info>,
    
    /// CHECK: Tick array lower - verified by CPI
    #[account(mut)]
    pub tick_array_lower: AccountInfo<'info>,
    
    /// CHECK: Tick array upper - verified by CPI
    #[account(mut)]
    pub tick_array_upper: AccountInfo<'info>,
    
    /// Pool oracle for price updates
    #[account(
        mut,
        seeds = [b"pool_oracle", whirlpool.key().as_ref()],
        bump,
    )]
    pub oracle: Account<'info, PoolOracle>,
    
    /// CHECK: Whirlpool program
    pub whirlpool_program: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PoolParams {
    pub initial_price: u64,  // Price in USDC with 6 decimals (e.g., 50000 = $0.05)
    pub fee_rate: u16,       // Fee tier in basis points (e.g., 100 = 1%)
    pub tick_spacing: u16,   // Tick spacing for the pool
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RebalanceParams {
    pub position_index: u8,      // Which position to rebalance
    pub new_lower_price: u64,    // New lower price bound (scaled by 1e6)
    pub new_upper_price: u64,    // New upper price bound (scaled by 1e6)
    pub max_slippage_bps: u16,   // Maximum slippage in basis points
}

pub fn initialize_pool_handler(
    ctx: Context<InitializePool>,
    params: PoolParams,
) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Validate parameters
    require!(
        params.initial_price > 0,
        TwistError::InvalidAmount
    );
    
    // Common fee tiers: 1 bps (0.01%), 5 bps (0.05%), 30 bps (0.3%), 100 bps (1%)
    const VALID_FEE_RATES: [u16; 4] = [1, 5, 30, 100];
    require!(
        VALID_FEE_RATES.contains(&params.fee_rate),
        TwistError::InvalidAmount
    );
    
    // Valid tick spacings based on fee tier
    let expected_tick_spacing = match params.fee_rate {
        1 => 1,     // 0.01% fee -> 1 tick spacing
        5 => 8,     // 0.05% fee -> 8 tick spacing  
        30 => 60,   // 0.3% fee -> 60 tick spacing
        100 => 200, // 1% fee -> 200 tick spacing
        _ => return Err(TwistError::InvalidAmount.into()),
    };
    
    require!(
        params.tick_spacing == expected_tick_spacing,
        TwistError::InvalidAmount
    );
    
    // Calculate initial sqrt price
    // Price = TWIST/USDC, so if TWIST = $0.05, then 1 TWIST = 0.05 USDC
    // sqrt_price = sqrt(price * 2^64)
    let price_ratio = (params.initial_price as u128) * (1u128 << 64) / 1_000_000u128; // Adjust for USDC decimals
    let sqrt_price = (price_ratio as f64).sqrt() as u128;
    
    // Store pool info in program state
    program_state.whirlpool = ctx.accounts.whirlpool.key();
    program_state.whirlpool_initialized = true;
    
    // Initialize oracle
    let oracle = &mut ctx.accounts.oracle;
    oracle.whirlpool = ctx.accounts.whirlpool.key();
    oracle.last_update_timestamp = clock.unix_timestamp;
    oracle.sqrt_price = sqrt_price;
    oracle.price = params.initial_price;
    oracle.liquidity = 0;
    oracle.volume_24h = 0;
    oracle.fees_24h = 0;
    oracle.bump = ctx.bumps.oracle;
    
    // Build initialize pool instruction for Orca
    let initialize_pool_ix = build_initialize_pool_ix(
        ctx.accounts.whirlpool_program.key(),
        ctx.accounts.whirlpools_config.key(),
        ctx.accounts.token_mint_a.key(),
        ctx.accounts.token_mint_b.key(),
        ctx.accounts.fee_tier.key(),
        sqrt_price,
        ctx.accounts.whirlpool.key(),
        ctx.accounts.token_vault_a.key(),
        ctx.accounts.token_vault_b.key(),
        ctx.accounts.authority.key(),
    )?;
    
    // Execute CPI to initialize Whirlpool
    anchor_lang::solana_program::program::invoke(
        &initialize_pool_ix,
        &[
            ctx.accounts.whirlpools_config.to_account_info(),
            ctx.accounts.token_mint_a.to_account_info(),
            ctx.accounts.token_mint_b.to_account_info(),
            ctx.accounts.fee_tier.to_account_info(),
            ctx.accounts.whirlpool.to_account_info(),
            ctx.accounts.token_vault_a.to_account_info(),
            ctx.accounts.token_vault_b.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
    )?;
    
    // Emit event
    emit!(PoolInitialized {
        whirlpool: ctx.accounts.whirlpool.key(),
        token_mint_a: ctx.accounts.token_mint_a.key(),
        token_mint_b: ctx.accounts.token_mint_b.key(),
        initial_price: params.initial_price,
        sqrt_price,
        fee_rate: params.fee_rate,
        tick_spacing: params.tick_spacing,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Orca Whirlpool initialized successfully");
    msg!("Pool address: {}", ctx.accounts.whirlpool.key());
    msg!("Initial price: ${}", params.initial_price as f64 / 1_000_000.0);
    msg!("Fee rate: {}%", params.fee_rate as f64 / 100.0);
    msg!("Tick spacing: {}", params.tick_spacing);
    
    Ok(())
}

pub fn add_liquidity_handler(
    ctx: Context<AddLiquidity>,
    twist_amount: u64,
    usdc_amount: u64,
    slippage_bps: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    
    // Validate amounts
    validate_amount(twist_amount)?;
    validate_amount(usdc_amount)?;
    require!(
        slippage_bps <= 1000, // Max 10% slippage
        TwistError::InvalidAmount
    );
    
    // Calculate price range for concentrated liquidity
    // For now, we'll use a ±10% range around current price
    let oracle = &ctx.accounts.oracle;
    let current_sqrt_price = oracle.sqrt_price;
    
    // Calculate lower and upper sqrt prices (±10% range)
    let lower_sqrt_price = current_sqrt_price * 9000 / 10000;
    let upper_sqrt_price = current_sqrt_price * 11000 / 10000;
    
    // Convert sqrt prices to tick indices
    let lower_tick = sqrt_price_to_tick(lower_sqrt_price)?;
    let upper_tick = sqrt_price_to_tick(upper_sqrt_price)?;
    
    // Build open position instruction
    let open_position_ix = build_open_position_ix(
        ctx.accounts.whirlpool_program.key(),
        ctx.accounts.whirlpool.key(),
        ctx.accounts.position_mint.key(),
        ctx.accounts.position_token_account.key(),
        ctx.accounts.liquidity_provider.key(),
        lower_tick,
        upper_tick,
    )?;
    
    // Execute CPI to open position
    anchor_lang::solana_program::program::invoke(
        &open_position_ix,
        &[
            ctx.accounts.whirlpool.to_account_info(),
            ctx.accounts.position_mint.to_account_info(),
            ctx.accounts.position_token_account.to_account_info(),
            ctx.accounts.liquidity_provider.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;
    
    // Calculate minimum amounts with slippage
    let min_twist = safe_div(safe_mul(twist_amount, 10000 - slippage_bps)?, 10000)?;
    let min_usdc = safe_div(safe_mul(usdc_amount, 10000 - slippage_bps)?, 10000)?;
    
    // Build increase liquidity instruction
    let increase_liquidity_ix = build_increase_liquidity_ix(
        ctx.accounts.whirlpool_program.key(),
        ctx.accounts.whirlpool.key(),
        ctx.accounts.position_mint.key(),
        ctx.accounts.position_token_account.key(),
        ctx.accounts.user_twist_account.key(),
        ctx.accounts.user_usdc_account.key(),
        ctx.accounts.token_vault_a.key(),
        ctx.accounts.token_vault_b.key(),
        ctx.accounts.tick_array_lower.key(),
        ctx.accounts.tick_array_upper.key(),
        ctx.accounts.liquidity_provider.key(),
        twist_amount,
        usdc_amount,
        min_twist,
        min_usdc,
    )?;
    
    // Execute CPI to add liquidity
    anchor_lang::solana_program::program::invoke(
        &increase_liquidity_ix,
        &[
            ctx.accounts.whirlpool.to_account_info(),
            ctx.accounts.position_mint.to_account_info(),
            ctx.accounts.position_token_account.to_account_info(),
            ctx.accounts.user_twist_account.to_account_info(),
            ctx.accounts.user_usdc_account.to_account_info(),
            ctx.accounts.token_vault_a.to_account_info(),
            ctx.accounts.token_vault_b.to_account_info(),
            ctx.accounts.tick_array_lower.to_account_info(),
            ctx.accounts.tick_array_upper.to_account_info(),
            ctx.accounts.liquidity_provider.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
    )?;
    
    // Update oracle liquidity info
    let oracle = &mut ctx.accounts.oracle;
    oracle.last_update_timestamp = clock.unix_timestamp;
    
    // Update program state
    let program_state = &mut ctx.accounts.program_state;
    program_state.total_transactions = program_state.total_transactions.saturating_add(1);
    
    // Emit event
    emit!(LiquidityAdded {
        provider: ctx.accounts.liquidity_provider.key(),
        position_mint: ctx.accounts.position_mint.key(),
        twist_amount,
        usdc_amount,
        lower_tick,
        upper_tick,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Liquidity added successfully");
    msg!("TWIST: {} tokens", twist_amount as f64 / 10f64.powf(DECIMALS as f64));
    msg!("USDC: {} tokens", usdc_amount as f64 / 1_000_000.0);
    msg!("Position mint: {}", ctx.accounts.position_mint.key());
    
    Ok(())
}

pub fn remove_liquidity_handler(
    ctx: Context<RemoveLiquidity>,
    liquidity_amount: u64,
    min_twist: u64,
    min_usdc: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    
    // Validate amounts
    validate_amount(liquidity_amount)?;
    
    // Build decrease liquidity instruction
    let decrease_liquidity_ix = build_decrease_liquidity_ix(
        ctx.accounts.whirlpool_program.key(),
        ctx.accounts.whirlpool.key(),
        ctx.accounts.position_mint.key(),
        ctx.accounts.position_token_account.key(),
        ctx.accounts.user_twist_account.key(),
        ctx.accounts.user_usdc_account.key(),
        ctx.accounts.token_vault_a.key(),
        ctx.accounts.token_vault_b.key(),
        ctx.accounts.tick_array_lower.key(),
        ctx.accounts.tick_array_upper.key(),
        ctx.accounts.liquidity_provider.key(),
        liquidity_amount,
        min_twist,
        min_usdc,
    )?;
    
    // Execute CPI to remove liquidity
    anchor_lang::solana_program::program::invoke(
        &decrease_liquidity_ix,
        &[
            ctx.accounts.whirlpool.to_account_info(),
            ctx.accounts.position_mint.to_account_info(),
            ctx.accounts.position_token_account.to_account_info(),
            ctx.accounts.user_twist_account.to_account_info(),
            ctx.accounts.user_usdc_account.to_account_info(),
            ctx.accounts.token_vault_a.to_account_info(),
            ctx.accounts.token_vault_b.to_account_info(),
            ctx.accounts.tick_array_lower.to_account_info(),
            ctx.accounts.tick_array_upper.to_account_info(),
            ctx.accounts.liquidity_provider.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
    )?;
    
    // Update oracle
    let oracle = &mut ctx.accounts.oracle;
    oracle.last_update_timestamp = clock.unix_timestamp;
    
    // Update program state
    let program_state = &mut ctx.accounts.program_state;
    program_state.total_transactions = program_state.total_transactions.saturating_add(1);
    
    // Emit event
    emit!(LiquidityRemoved {
        provider: ctx.accounts.liquidity_provider.key(),
        position_mint: ctx.accounts.position_mint.key(),
        liquidity_amount,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Liquidity removed successfully");
    msg!("Liquidity amount: {}", liquidity_amount);
    msg!("Min TWIST: {} tokens", min_twist as f64 / 10f64.powf(DECIMALS as f64));
    msg!("Min USDC: {} tokens", min_usdc as f64 / 1_000_000.0);
    
    Ok(())
}

// Helper functions for Orca integration

fn build_initialize_pool_ix(
    whirlpool_program: Pubkey,
    whirlpools_config: Pubkey,
    token_mint_a: Pubkey,
    token_mint_b: Pubkey,
    fee_tier: Pubkey,
    initial_sqrt_price: u128,
    whirlpool: Pubkey,
    token_vault_a: Pubkey,
    token_vault_b: Pubkey,
    funder: Pubkey,
) -> Result<anchor_lang::solana_program::instruction::Instruction> {
    // Orca initialize pool instruction discriminator
    const INITIALIZE_POOL_DISCRIMINATOR: [u8; 8] = [95, 180, 10, 172, 84, 174, 232, 40];
    
    let accounts = vec![
        AccountMeta::new_readonly(whirlpools_config, false),
        AccountMeta::new_readonly(token_mint_a, false),
        AccountMeta::new_readonly(token_mint_b, false),
        AccountMeta::new_readonly(fee_tier, false),
        AccountMeta::new(whirlpool, false),
        AccountMeta::new(token_vault_a, false),
        AccountMeta::new(token_vault_b, false),
        AccountMeta::new(funder, true),
        AccountMeta::new_readonly(anchor_spl::token::ID, false),
        AccountMeta::new_readonly(anchor_lang::system_program::ID, false),
        AccountMeta::new_readonly(anchor_lang::solana_program::sysvar::rent::ID, false),
    ];
    
    let mut data = INITIALIZE_POOL_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&initial_sqrt_price.to_le_bytes());
    
    Ok(anchor_lang::solana_program::instruction::Instruction {
        program_id: whirlpool_program,
        accounts,
        data,
    })
}

fn build_open_position_ix(
    whirlpool_program: Pubkey,
    whirlpool: Pubkey,
    position_mint: Pubkey,
    position_token_account: Pubkey,
    owner: Pubkey,
    tick_lower_index: i32,
    tick_upper_index: i32,
) -> Result<anchor_lang::solana_program::instruction::Instruction> {
    // Orca open position instruction discriminator
    const OPEN_POSITION_DISCRIMINATOR: [u8; 8] = [135, 128, 47, 77, 15, 152, 240, 49];
    
    let accounts = vec![
        AccountMeta::new(whirlpool, false),
        AccountMeta::new(owner, true),
        AccountMeta::new(position_mint, false),
        AccountMeta::new(position_token_account, false),
        AccountMeta::new_readonly(anchor_spl::token::ID, false),
        AccountMeta::new_readonly(anchor_lang::system_program::ID, false),
        AccountMeta::new_readonly(anchor_lang::solana_program::sysvar::rent::ID, false),
    ];
    
    let mut data = OPEN_POSITION_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&tick_lower_index.to_le_bytes());
    data.extend_from_slice(&tick_upper_index.to_le_bytes());
    
    Ok(anchor_lang::solana_program::instruction::Instruction {
        program_id: whirlpool_program,
        accounts,
        data,
    })
}

fn build_increase_liquidity_ix(
    whirlpool_program: Pubkey,
    whirlpool: Pubkey,
    position_mint: Pubkey,
    position_token_account: Pubkey,
    token_owner_account_a: Pubkey,
    token_owner_account_b: Pubkey,
    token_vault_a: Pubkey,
    token_vault_b: Pubkey,
    tick_array_lower: Pubkey,
    tick_array_upper: Pubkey,
    position_authority: Pubkey,
    amount_a: u64,
    amount_b: u64,
    _min_amount_a: u64,
    _min_amount_b: u64,
) -> Result<anchor_lang::solana_program::instruction::Instruction> {
    // Orca increase liquidity instruction discriminator
    const INCREASE_LIQUIDITY_DISCRIMINATOR: [u8; 8] = [46, 156, 243, 118, 13, 205, 251, 178];
    
    let accounts = vec![
        AccountMeta::new(whirlpool, false),
        AccountMeta::new_readonly(position_mint, false),
        AccountMeta::new(position_token_account, false),
        AccountMeta::new(token_owner_account_a, false),
        AccountMeta::new(token_owner_account_b, false),
        AccountMeta::new(token_vault_a, false),
        AccountMeta::new(token_vault_b, false),
        AccountMeta::new(tick_array_lower, false),
        AccountMeta::new(tick_array_upper, false),
        AccountMeta::new_readonly(position_authority, true),
        AccountMeta::new_readonly(anchor_spl::token::ID, false),
    ];
    
    #[derive(AnchorSerialize)]
    struct IncreaseLiquidityParams {
        liquidity_amount: u128,
        token_max_a: u64,
        token_max_b: u64,
    }
    
    // Calculate liquidity amount from token amounts
    // This is simplified - real calculation would use Orca's liquidity math
    let liquidity_amount = std::cmp::min(amount_a as u128, amount_b as u128);
    
    let params = IncreaseLiquidityParams {
        liquidity_amount,
        token_max_a: amount_a,
        token_max_b: amount_b,
    };
    
    let mut data = INCREASE_LIQUIDITY_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&params.try_to_vec()?);
    
    Ok(anchor_lang::solana_program::instruction::Instruction {
        program_id: whirlpool_program,
        accounts,
        data,
    })
}

fn build_decrease_liquidity_ix(
    whirlpool_program: Pubkey,
    whirlpool: Pubkey,
    position_mint: Pubkey,
    position_token_account: Pubkey,
    token_owner_account_a: Pubkey,
    token_owner_account_b: Pubkey,
    token_vault_a: Pubkey,
    token_vault_b: Pubkey,
    tick_array_lower: Pubkey,
    tick_array_upper: Pubkey,
    position_authority: Pubkey,
    liquidity_amount: u64,
    min_amount_a: u64,
    min_amount_b: u64,
) -> Result<anchor_lang::solana_program::instruction::Instruction> {
    // Orca decrease liquidity instruction discriminator
    const DECREASE_LIQUIDITY_DISCRIMINATOR: [u8; 8] = [160, 38, 208, 111, 104, 91, 44, 1];
    
    let accounts = vec![
        AccountMeta::new(whirlpool, false),
        AccountMeta::new_readonly(position_mint, false),
        AccountMeta::new(position_token_account, false),
        AccountMeta::new(token_owner_account_a, false),
        AccountMeta::new(token_owner_account_b, false),
        AccountMeta::new(token_vault_a, false),
        AccountMeta::new(token_vault_b, false),
        AccountMeta::new(tick_array_lower, false),
        AccountMeta::new(tick_array_upper, false),
        AccountMeta::new_readonly(position_authority, true),
        AccountMeta::new_readonly(anchor_spl::token::ID, false),
    ];
    
    #[derive(AnchorSerialize)]
    struct DecreaseLiquidityParams {
        liquidity_amount: u128,
        token_min_a: u64,
        token_min_b: u64,
    }
    
    let params = DecreaseLiquidityParams {
        liquidity_amount: liquidity_amount as u128,
        token_min_a: min_amount_a,
        token_min_b: min_amount_b,
    };
    
    let mut data = DECREASE_LIQUIDITY_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&params.try_to_vec()?);
    
    Ok(anchor_lang::solana_program::instruction::Instruction {
        program_id: whirlpool_program,
        accounts,
        data,
    })
}

// Convert sqrt price to tick index
fn sqrt_price_to_tick(sqrt_price: u128) -> Result<i32> {
    // Simplified conversion - in production would use full tick math
    let log_base = 1.0001f64;
    let price = (sqrt_price as f64 / (1u64 << 32) as f64).powi(2);
    let tick = (price.ln() / log_base.ln()) as i32;
    Ok(tick)
}

// New events for liquidity operations
#[event]
pub struct PoolInitialized {
    pub whirlpool: Pubkey,
    pub token_mint_a: Pubkey,
    pub token_mint_b: Pubkey,
    pub initial_price: u64,
    pub sqrt_price: u128,
    pub fee_rate: u16,
    pub tick_spacing: u16,
    pub timestamp: i64,
}

#[event]
pub struct LiquidityAdded {
    pub provider: Pubkey,
    pub position_mint: Pubkey,
    pub twist_amount: u64,
    pub usdc_amount: u64,
    pub lower_tick: i32,
    pub upper_tick: i32,
    pub timestamp: i64,
}

#[event]
pub struct LiquidityRemoved {
    pub provider: Pubkey,
    pub position_mint: Pubkey,
    pub liquidity_amount: u64,
    pub timestamp: i64,
}

// Advanced Liquidity Management Instructions

#[derive(Accounts)]
#[instruction(position_index: u8)]
pub struct RebalancePosition<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Box<Account<'info, ProgramState>>,
    
    #[account(
        mut,
        seeds = [LIQUIDITY_POSITION_SEED, &position_index.to_le_bytes()],
        bump = liquidity_position.bump,
        constraint = liquidity_position.whirlpool == whirlpool.key() @ TwistError::InvalidAccount
    )]
    pub liquidity_position: Account<'info, LiquidityPosition>,
    
    #[account(
        mut,
        constraint = whirlpool.key() == program_state.whirlpool @ TwistError::InvalidAccount
    )]
    pub whirlpool: Box<Account<'info, WhirlpoolState>>,
    
    #[account(
        mut,
        constraint = twist_vault.key() == whirlpool.token_vault_a @ TwistError::InvalidAccount
    )]
    pub twist_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = usdc_vault.key() == whirlpool.token_vault_b @ TwistError::InvalidAccount
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    /// CHECK: Old tick array lower
    pub old_tick_array_lower: AccountInfo<'info>,
    
    /// CHECK: Old tick array upper
    pub old_tick_array_upper: AccountInfo<'info>,
    
    /// CHECK: New tick array lower
    pub new_tick_array_lower: AccountInfo<'info>,
    
    /// CHECK: New tick array upper  
    pub new_tick_array_upper: AccountInfo<'info>,
    
    /// CHECK: Orca Whirlpool program
    pub whirlpool_program: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn rebalance_position_handler(
    ctx: Context<RebalancePosition>,
    position_index: u8,
    params: RebalanceParams,
) -> Result<()> {
    let liquidity_position = &mut ctx.accounts.liquidity_position;
    let whirlpool = &ctx.accounts.whirlpool;
    let clock = Clock::get()?;
    
    // Validate new price range
    require!(
        params.new_lower_price < params.new_upper_price,
        TwistError::InvalidPriceRange
    );
    
    // Check if rebalancing is needed (price moved out of range)
    let current_sqrt_price = whirlpool.sqrt_price;
    let _current_price = (current_sqrt_price as u128).pow(2) / (1u128 << 64);
    
    // Calculate ticks for new range
    let new_lower_tick = price_to_tick(params.new_lower_price, whirlpool.tick_spacing)?;
    let new_upper_tick = price_to_tick(params.new_upper_price, whirlpool.tick_spacing)?;
    
    // Get current liquidity amount
    let old_liquidity = liquidity_position.liquidity;
    
    // Step 1: Remove liquidity from old position
    let remove_liquidity_ix = build_orca_decrease_liquidity_ix(
        &ctx.accounts.whirlpool_program.key(),
        &ctx.accounts.whirlpool.key(),
        liquidity_position.position_mint,
        &ctx.accounts.old_tick_array_lower.key(),
        &ctx.accounts.old_tick_array_upper.key(),
        old_liquidity,
        0, // Min amount A (we'll check slippage separately)
        0, // Min amount B
    );
    
    // Execute remove liquidity CPI
    let seeds = &[
        PROGRAM_STATE_SEED,
        &[ctx.accounts.program_state.bump],
    ];
    let signer_seeds = &[&seeds[..]];   
    
    anchor_lang::solana_program::program::invoke_signed(
        &remove_liquidity_ix,
        &[
            ctx.accounts.whirlpool_program.to_account_info(),
            ctx.accounts.whirlpool.to_account_info(),
            ctx.accounts.program_state.to_account_info(),
            ctx.accounts.twist_vault.to_account_info(),
            ctx.accounts.usdc_vault.to_account_info(),
            ctx.accounts.old_tick_array_lower.to_account_info(),
            ctx.accounts.old_tick_array_upper.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        signer_seeds,
    )?;
    
    // Get amounts after removal
    let twist_amount = ctx.accounts.twist_vault.amount;
    let usdc_amount = ctx.accounts.usdc_vault.amount;
    
    // Step 2: Add liquidity to new position
    let add_liquidity_ix = build_orca_increase_liquidity_ix(
        &ctx.accounts.whirlpool_program.key(),
        &ctx.accounts.whirlpool.key(),
        &ctx.accounts.authority.key(),
        liquidity_position.position_mint,
        &ctx.accounts.new_tick_array_lower.key(),
        &ctx.accounts.new_tick_array_upper.key(),
        new_lower_tick,
        new_upper_tick,
        twist_amount,
        usdc_amount,
        params.max_slippage_bps,
    );
    
    anchor_lang::solana_program::program::invoke_signed(
        &add_liquidity_ix,
        &[
            ctx.accounts.whirlpool_program.to_account_info(),
            ctx.accounts.whirlpool.to_account_info(),
            ctx.accounts.program_state.to_account_info(),
            ctx.accounts.twist_vault.to_account_info(),
            ctx.accounts.usdc_vault.to_account_info(),
            ctx.accounts.new_tick_array_lower.to_account_info(),
            ctx.accounts.new_tick_array_upper.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        signer_seeds,
    )?;
    
    // Update position state
    liquidity_position.lower_tick = new_lower_tick;
    liquidity_position.upper_tick = new_upper_tick;
    liquidity_position.last_rebalance_timestamp = clock.unix_timestamp;
    liquidity_position.rebalance_count = liquidity_position.rebalance_count.saturating_add(1);
    
    // Calculate new liquidity (would come from Orca response)
    let new_liquidity = calculate_liquidity_from_amounts(
        twist_amount,
        usdc_amount,
        new_lower_tick,
        new_upper_tick,
        current_sqrt_price,
    )?;
    liquidity_position.liquidity = new_liquidity;
    
    // Emit event
    emit!(PositionRebalanced {
        position_index,
        old_lower_tick: liquidity_position.lower_tick,
        old_upper_tick: liquidity_position.upper_tick,
        new_lower_tick,
        new_upper_tick,
        old_liquidity,
        new_liquidity,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Position {} rebalanced successfully", position_index);
    msg!("New range: ${} - ${}", 
        params.new_lower_price as f64 / 1e6,
        params.new_upper_price as f64 / 1e6
    );
    msg!("New liquidity: {}", new_liquidity);
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(position_index: u8)]
pub struct AutoCompound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
    )]
    pub program_state: Box<Account<'info, ProgramState>>,
    
    #[account(
        mut,
        seeds = [LIQUIDITY_POSITION_SEED, &position_index.to_le_bytes()],
        bump = liquidity_position.bump,
    )]
    pub liquidity_position: Account<'info, LiquidityPosition>,
    
    #[account(
        mut,
        constraint = whirlpool.key() == program_state.whirlpool @ TwistError::InvalidAccount
    )]
    pub whirlpool: Box<Account<'info, WhirlpoolState>>,
    
    #[account(
        mut,
        constraint = twist_vault.key() == whirlpool.token_vault_a @ TwistError::InvalidAccount
    )]
    pub twist_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = usdc_vault.key() == whirlpool.token_vault_b @ TwistError::InvalidAccount
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = fee_account.mint == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub fee_account: Account<'info, TokenAccount>,
    
    /// CHECK: Tick array lower
    pub tick_array_lower: AccountInfo<'info>,
    
    /// CHECK: Tick array upper
    pub tick_array_upper: AccountInfo<'info>,
    
    /// CHECK: Orca Whirlpool program
    pub whirlpool_program: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn auto_compound_handler(
    ctx: Context<AutoCompound>,
    position_index: u8,
) -> Result<()> {
    let liquidity_position = &mut ctx.accounts.liquidity_position;
    let whirlpool = &ctx.accounts.whirlpool;
    let clock = Clock::get()?;
    
    // Check if enough time has passed since last compound (minimum 1 hour)
    let time_since_last_compound = clock.unix_timestamp - liquidity_position.last_compound_timestamp;
    require!(
        time_since_last_compound >= 3600, // 1 hour
        TwistError::CompoundTooSoon
    );
    
    // Step 1: Collect fees from position
    let collect_fees_ix = build_orca_collect_fees_ix(
        &ctx.accounts.whirlpool_program.key(),
        &ctx.accounts.whirlpool.key(),
        &ctx.accounts.authority.key(),
        liquidity_position.position_mint,
        &ctx.accounts.tick_array_lower.key(),
        &ctx.accounts.tick_array_upper.key(),
    );
    
    let seeds = &[
        PROGRAM_STATE_SEED,
        &[ctx.accounts.program_state.bump],
    ];
    let signer_seeds = &[&seeds[..]];   
    
    // Get balances before collection
    let twist_before = ctx.accounts.fee_account.amount;
    let usdc_before = ctx.accounts.usdc_vault.amount;
    
    anchor_lang::solana_program::program::invoke_signed(
        &collect_fees_ix,
        &[
            ctx.accounts.whirlpool_program.to_account_info(),
            ctx.accounts.whirlpool.to_account_info(),
            ctx.accounts.program_state.to_account_info(),
            ctx.accounts.fee_account.to_account_info(),
            ctx.accounts.usdc_vault.to_account_info(),
            ctx.accounts.tick_array_lower.to_account_info(),
            ctx.accounts.tick_array_upper.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        signer_seeds,
    )?;
    
    // Calculate collected fees
    let twist_fees = ctx.accounts.fee_account.amount - twist_before;
    let usdc_fees = ctx.accounts.usdc_vault.amount - usdc_before;
    
    // Only compound if we collected meaningful fees
    require!(
        twist_fees > 0 || usdc_fees > 0,
        TwistError::NoFeesToCompound  
    );
    
    // Step 2: Add collected fees back to position as liquidity
    let add_liquidity_ix = build_orca_increase_liquidity_ix(
        &ctx.accounts.whirlpool_program.key(),
        &ctx.accounts.whirlpool.key(),
        &ctx.accounts.authority.key(),
        liquidity_position.position_mint,
        &ctx.accounts.tick_array_lower.key(),
        &ctx.accounts.tick_array_upper.key(),
        liquidity_position.lower_tick,
        liquidity_position.upper_tick,
        twist_fees,
        usdc_fees,
        100, // 1% slippage tolerance
    );
    
    anchor_lang::solana_program::program::invoke_signed(
        &add_liquidity_ix,
        &[
            ctx.accounts.whirlpool_program.to_account_info(),
            ctx.accounts.whirlpool.to_account_info(),
            ctx.accounts.program_state.to_account_info(),
            ctx.accounts.fee_account.to_account_info(),
            ctx.accounts.usdc_vault.to_account_info(),
            ctx.accounts.tick_array_lower.to_account_info(),
            ctx.accounts.tick_array_upper.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        signer_seeds,
    )?;
    
    // Calculate additional liquidity from fees
    let additional_liquidity = calculate_liquidity_from_amounts(
        twist_fees,
        usdc_fees,
        liquidity_position.lower_tick,
        liquidity_position.upper_tick,
        whirlpool.sqrt_price,
    )?;
    
    // Update position state
    let old_liquidity = liquidity_position.liquidity;
    liquidity_position.liquidity = old_liquidity.saturating_add(additional_liquidity);
    liquidity_position.last_compound_timestamp = clock.unix_timestamp;
    liquidity_position.total_fees_compounded_twist = safe_add(
        liquidity_position.total_fees_compounded_twist,
        twist_fees
    )?;
    liquidity_position.total_fees_compounded_usdc = safe_add(
        liquidity_position.total_fees_compounded_usdc,
        usdc_fees
    )?;
    
    // Update program state metrics
    let program_state = &mut ctx.accounts.program_state;
    program_state.total_fees_collected = program_state.total_fees_collected
        .saturating_add(twist_fees as u128)
        .saturating_add((usdc_fees as u128) * 1_000); // Convert USDC to TWIST equivalent
    
    // Emit event
    emit!(FeesCompounded {
        position_index,
        twist_fees,
        usdc_fees,
        additional_liquidity,
        new_total_liquidity: liquidity_position.liquidity,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Auto-compounded position {}", position_index);
    msg!("TWIST fees: {} USDC fees: {}", 
        twist_fees as f64 / 10f64.powf(DECIMALS as f64),
        usdc_fees as f64 / 1e6
    );
    msg!("Additional liquidity: {}", additional_liquidity);
    
    Ok(())
}

// Helper functions

fn price_to_tick(price: u64, tick_spacing: u16) -> Result<i32> {
    // Convert price to tick index
    // This is a simplified version - real implementation would use Orca's math
    let price_f64 = price as f64 / 1e6;
    let tick_f64 = (price_f64.ln() / 1.0001_f64.ln()) as i32;
    
    // Round to nearest valid tick
    let rounded_tick = (tick_f64 / tick_spacing as i32) * tick_spacing as i32;
    
    Ok(rounded_tick)
}

fn calculate_liquidity_from_amounts(
    amount_a: u64,
    amount_b: u64,
    _lower_tick: i32,
    _upper_tick: i32,
    _sqrt_price: u128,
) -> Result<u128> {
    // Simplified liquidity calculation
    // Real implementation would use Orca's liquidity math
    let sqrt_product = ((amount_a as u128).saturating_mul(amount_b as u128) as f64).sqrt();
    let liquidity = (sqrt_product as u128).saturating_mul(100); // Scale factor
    
    Ok(liquidity)
}

fn build_orca_decrease_liquidity_ix(
    _program_id: &Pubkey,
    _whirlpool: &Pubkey,
    _position_mint: Pubkey,
    _tick_array_lower: &Pubkey,
    _tick_array_upper: &Pubkey,
    _liquidity: u128,
    _min_amount_a: u64,
    _min_amount_b: u64,
) -> anchor_lang::solana_program::instruction::Instruction {
    // Build Orca decrease liquidity instruction
    // This would use actual Orca instruction builder
    anchor_lang::solana_program::instruction::Instruction {
        program_id: crate::defi::ORCA_WHIRLPOOL_PROGRAM_ID,
        accounts: vec![],
        data: vec![],
    }
}

fn build_orca_collect_fees_ix(
    _program_id: &Pubkey,
    _whirlpool: &Pubkey,
    _authority: &Pubkey,
    _position_mint: Pubkey,
    _tick_array_lower: &Pubkey,
    _tick_array_upper: &Pubkey,
) -> anchor_lang::solana_program::instruction::Instruction {
    // Build Orca collect fees instruction
    anchor_lang::solana_program::instruction::Instruction {
        program_id: crate::defi::ORCA_WHIRLPOOL_PROGRAM_ID,
        accounts: vec![],
        data: vec![],
    }
}

fn build_orca_increase_liquidity_ix(
    _program_id: &Pubkey,
    _whirlpool: &Pubkey,
    _authority: &Pubkey,
    _position_mint: Pubkey,
    _tick_array_lower: &Pubkey,
    _tick_array_upper: &Pubkey,
    _lower_tick: i32,
    _upper_tick: i32,
    _twist_amount: u64,
    _usdc_amount: u64,
    _max_slippage_bps: u16,
) -> anchor_lang::solana_program::instruction::Instruction {
    // Build Orca increase liquidity instruction
    anchor_lang::solana_program::instruction::Instruction {
        program_id: crate::defi::ORCA_WHIRLPOOL_PROGRAM_ID,
        accounts: vec![],
        data: vec![],
    }
}

// New events for advanced liquidity management
#[event]
pub struct PositionRebalanced {
    pub position_index: u8,
    pub old_lower_tick: i32,
    pub old_upper_tick: i32,
    pub new_lower_tick: i32,
    pub new_upper_tick: i32,
    pub old_liquidity: u128,
    pub new_liquidity: u128,
    pub timestamp: i64,
}

#[event]
pub struct FeesCompounded {
    pub position_index: u8,
    pub twist_fees: u64,
    pub usdc_fees: u64,
    pub additional_liquidity: u128,
    pub new_total_liquidity: u128,
    pub timestamp: i64,
}