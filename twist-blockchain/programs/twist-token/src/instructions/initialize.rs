use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub decay_rate_bps: u64,
    pub treasury_split_bps: u64,
    pub initial_floor_price: u64,
    pub max_daily_buyback: u64,
    pub pyth_price_feed: Pubkey,
    pub switchboard_feed: Pubkey,
    pub chainlink_feed: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = ProgramState::LEN,
        seeds = [PROGRAM_STATE_SEED],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        init,
        payer = authority,
        mint::decimals = DECIMALS,
        mint::authority = program_state.key(),
        mint::freeze_authority = program_state.key(),
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = floor_treasury,
    )]
    pub floor_treasury_account: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = ops_treasury,
    )]
    pub ops_treasury_account: Account<'info, TokenAccount>,
    
    /// CHECK: Floor treasury PDA
    #[account(
        seeds = [FLOOR_TREASURY_SEED],
        bump
    )]
    pub floor_treasury: AccountInfo<'info>,
    
    /// CHECK: Operations treasury PDA
    #[account(
        seeds = [OPS_TREASURY_SEED],
        bump
    )]
    pub ops_treasury: AccountInfo<'info>,
    
    /// CHECK: Pyth price feed account
    pub pyth_price_feed: AccountInfo<'info>,
    
    /// CHECK: Switchboard feed account
    pub switchboard_feed: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<Initialize>,
    params: InitializeParams,
) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Validate parameters
    require!(
        params.decay_rate_bps <= 100, // Max 1% daily decay
        TwistError::InvalidDecayRate
    );
    require!(
        params.treasury_split_bps <= 10000,
        TwistError::InvalidTreasurySplit
    );
    require!(
        !program_state.is_initialized(),
        TwistError::AlreadyInitialized
    );
    
    // Initialize program state
    program_state.authority = ctx.accounts.authority.key();
    program_state.mint = ctx.accounts.mint.key();
    program_state.bump = ctx.bumps.program_state;
    program_state.version = 1;
    program_state.initialized = true;
    
    // Economic parameters
    program_state.decay_rate_bps = params.decay_rate_bps;
    program_state.treasury_split_bps = params.treasury_split_bps;
    program_state.last_decay_timestamp = clock.unix_timestamp;
    program_state.total_decayed = 0;
    program_state.total_burned = 0;
    program_state.total_staked = 0;
    program_state.total_stakes = 0;
    program_state.total_bought_back = 0;
    
    // Treasury configuration
    program_state.floor_treasury = ctx.accounts.floor_treasury.key();
    program_state.ops_treasury = ctx.accounts.ops_treasury.key();
    program_state.floor_price = params.initial_floor_price;
    program_state.floor_liquidity = 0;
    
    // Oracle configuration
    program_state.pyth_price_feed = params.pyth_price_feed;
    program_state.switchboard_feed = params.switchboard_feed;
    program_state.chainlink_feed = params.chainlink_feed;
    program_state.last_oracle_update = clock.unix_timestamp;
    program_state.last_oracle_price = params.initial_floor_price;
    
    // Circuit breaker configuration
    program_state.circuit_breaker_active = false;
    program_state.emergency_pause = false;
    program_state.buyback_enabled = true;
    program_state.max_daily_buyback = params.max_daily_buyback;
    program_state.daily_buyback_used = 0;
    program_state.last_buyback_reset = clock.unix_timestamp;
    
    // Initialize stats
    program_state.total_users = 0;
    program_state.total_transactions = 0;
    program_state.volume_24h = 0;
    program_state.volume_7d = 0;
    program_state.volume_30d = 0;
    
    // Set token metadata
    program_state.decimals = DECIMALS;
    
    // Emit initialization event
    emit!(ProgramInitialized {
        authority: program_state.authority,
        mint: program_state.mint,
        decay_rate_bps: program_state.decay_rate_bps,
        floor_price: program_state.floor_price,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("TWIST Token initialized successfully");
    msg!("Mint: {}", program_state.mint);
    msg!("Decay rate: {} bps", program_state.decay_rate_bps);
    msg!("Floor price: ${}", program_state.floor_price as f64 / 1e6);
    
    Ok(())
}