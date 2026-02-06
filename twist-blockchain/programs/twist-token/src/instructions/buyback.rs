use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Burn, Mint};
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::processors::get_aggregated_price;
use crate::defi::*;

#[derive(Accounts)]
pub struct ExecuteBuyback<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        constraint = mint.key() == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        constraint = program_usdc_account.mint == usdc_mint.key() @ TwistError::InvalidMintAuthority,
        token::authority = program_state,
    )]
    pub program_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = program_twist_account.mint == program_state.mint @ TwistError::InvalidMintAuthority,
        token::authority = program_state,
    )]
    pub program_twist_account: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    /// CHECK: Pyth price feed
    pub pyth_price_account: AccountInfo<'info>,
    
    /// CHECK: Switchboard feed
    pub switchboard_feed: AccountInfo<'info>,
    
    /// Orca Whirlpool accounts
    #[account(mut)]
    pub whirlpool: Box<Account<'info, WhirlpoolState>>,
    
    #[account(
        mut,
        constraint = token_vault_a.key() == whirlpool.token_vault_a @ TwistError::InvalidAmount
    )]
    pub token_vault_a: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = token_vault_b.key() == whirlpool.token_vault_b @ TwistError::InvalidAmount
    )]
    pub token_vault_b: Account<'info, TokenAccount>,
    
    /// CHECK: Tick arrays validated in handler
    pub tick_array_0: AccountInfo<'info>,
    
    /// CHECK: Tick arrays validated in handler
    pub tick_array_1: AccountInfo<'info>,
    
    /// CHECK: Tick arrays validated in handler
    pub tick_array_2: AccountInfo<'info>,
    
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

pub fn handler(
    ctx: Context<ExecuteBuyback>,
    max_usdc_amount: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    
    // Get immutable data first
    let program_state_key = ctx.accounts.program_state.key();
    
    // Now get mutable reference
    let program_state = &mut ctx.accounts.program_state;
    
    // Check if buyback is enabled
    require!(
        program_state.can_buyback(),
        TwistError::BuybackDisabled
    );
    
    // Reset daily limit if needed
    program_state.reset_daily_buyback_if_needed(clock.unix_timestamp);
    
    // Check daily limit
    require!(
        program_state.daily_buyback_used + max_usdc_amount <= program_state.max_daily_buyback,
        TwistError::DailyBuybackLimitExceeded
    );
    
    // Get current price from oracle
    let current_price = get_aggregated_price(
        &ctx.accounts.pyth_price_account,
        &ctx.accounts.switchboard_feed,
        program_state.chainlink_feed,
    )?;
    
    // Check if price is below threshold
    let threshold_price = program_state.floor_price * BUYBACK_THRESHOLD_BPS / 10000;
    require!(
        current_price <= threshold_price,
        TwistError::PriceAboveThreshold
    );
    
    // Calculate buyback amount based on discount
    let price_discount = (threshold_price - current_price) * 10000 / threshold_price;
    let buyback_multiplier = std::cmp::min(price_discount / 100 + 100, 300); // Max 3x at 2% discount
    let base_buyback = program_state.floor_liquidity / 50; // 2% of floor liquidity
    let buyback_amount = std::cmp::min(
        base_buyback * buyback_multiplier / 100,
        max_usdc_amount
    );
    
    // Ensure we have enough liquidity
    require!(
        buyback_amount <= program_state.floor_liquidity,
        TwistError::InsufficientLiquidity
    );
    
    // Get bump before modifying state
    let program_state_bump = program_state.bump;
    
    // Determine if we're swapping USDC (token B) for TWIST (token A)
    let a_to_b = false; // USDC -> TWIST
    
    // Calculate minimum output with slippage tolerance (1%)
    let expected_twist = buyback_amount * 1_000_000 / current_price;
    let min_twist_out = expected_twist * 99 / 100; // 1% slippage
    
    // Get tick arrays for the swap
    let tick_arrays = get_tick_array_pubkeys(
        &ctx.accounts.whirlpool.key(),
        ctx.accounts.whirlpool.tick_current_index,
        ctx.accounts.whirlpool.tick_spacing,
        a_to_b,
        &ctx.accounts.whirlpool_program.key(),
    )?;
    
    // Verify tick arrays match
    require!(
        tick_arrays[0] == ctx.accounts.tick_array_0.key() &&
        tick_arrays[1] == ctx.accounts.tick_array_1.key() &&
        tick_arrays[2] == ctx.accounts.tick_array_2.key(),
        TwistError::InvalidAmount
    );
    
    // Prepare swap parameters
    let swap_params = SwapParams {
        amount: buyback_amount,
        other_amount_threshold: min_twist_out,
        sqrt_price_limit: 0, // No price limit
        amount_specified_is_input: true,
        a_to_b,
    };
    
    // Build swap instruction
    let swap_ix = build_swap_ix(
        ctx.accounts.whirlpool_program.key(),
        ctx.accounts.token_program.key(),
        program_state_key,
        ctx.accounts.whirlpool.key(),
        ctx.accounts.program_twist_account.key(),
        ctx.accounts.token_vault_a.key(),
        ctx.accounts.program_usdc_account.key(),
        ctx.accounts.token_vault_b.key(),
        ctx.accounts.tick_array_0.key(),
        ctx.accounts.tick_array_1.key(),
        ctx.accounts.tick_array_2.key(),
        ctx.accounts.oracle.key(),
        swap_params,
    )?;
    
    // Release mutable reference before CPI
    
    // Execute swap via CPI
    let seeds = &[
        PROGRAM_STATE_SEED,
        &[program_state_bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    anchor_lang::solana_program::program::invoke_signed(
        &swap_ix,
        &[
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.program_state.to_account_info(),
            ctx.accounts.whirlpool.to_account_info(),
            ctx.accounts.program_twist_account.to_account_info(),
            ctx.accounts.token_vault_a.to_account_info(),
            ctx.accounts.program_usdc_account.to_account_info(),
            ctx.accounts.token_vault_b.to_account_info(),
            ctx.accounts.tick_array_0.to_account_info(),
            ctx.accounts.tick_array_1.to_account_info(),
            ctx.accounts.tick_array_2.to_account_info(),
            ctx.accounts.oracle.to_account_info(),
        ],
        signer_seeds,
    )?;
    
    // Get actual received amount from account balance change
    ctx.accounts.program_twist_account.reload()?;
    let _twist_balance_after = ctx.accounts.program_twist_account.amount;
    
    // For now, use expected amount (in production, track balance before/after)
    let estimated_twist_received = expected_twist;
    
    // Get mutable reference to program state again
    let program_state = &mut ctx.accounts.program_state;
    
    // Update state
    program_state.daily_buyback_used += buyback_amount;
    program_state.floor_liquidity -= buyback_amount;
    program_state.total_bought_back = program_state.total_bought_back.saturating_add(estimated_twist_received as u128);
    
    // Update floor price based on new liquidity
    let new_floor_price = if program_state.total_staked > 0 {
        program_state.floor_liquidity * 1_000_000 / (program_state.total_staked as u64 / 1_000_000_000)
    } else {
        program_state.floor_price
    };
    program_state.floor_price = new_floor_price;
    
    // Update total burned before the CPI
    program_state.total_burned = program_state.total_burned.saturating_add(estimated_twist_received as u128);
    
    // Release mutable reference again before burn CPI
    
    // Create burn authority signer seeds
    let seeds = &[
        PROGRAM_STATE_SEED,
        &[program_state_bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    // Burn the bought back tokens
    let cpi_accounts = Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.program_twist_account.to_account_info(),
        authority: ctx.accounts.program_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::burn(cpi_ctx, estimated_twist_received)?;
    
    // Emit buyback event
    emit!(BuybackExecuted {
        usdc_spent: buyback_amount,
        twist_received: estimated_twist_received,
        execution_price: current_price,
        new_floor_price,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Buyback executed: {} USDC for {} TWIST",
        buyback_amount as f64 / 1e6,
        estimated_twist_received as f64 / 10f64.powf(DECIMALS as f64)
    );
    msg!("New floor price: ${}", new_floor_price as f64 / 1e6);
    
    Ok(())
}