use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::utils::validate_amount;

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        seeds = [STAKE_STATE_SEED, owner.key().as_ref()],
        bump
    )]
    pub stake_state: Box<Account<'info, StakeState>>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        token::mint = program_state.mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [STAKE_VAULT_SEED],
        bump,
        token::mint = program_state.mint,
        token::authority = program_state,
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<Stake>,
    amount: u64,
    lock_period: i64,
) -> Result<()> {
    let stake_state = &mut ctx.accounts.stake_state;
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Validate inputs
    validate_amount(amount)?;
    require!(
        lock_period >= MIN_STAKE_PERIOD && lock_period <= MAX_STAKE_PERIOD,
        TwistError::InvalidLockPeriod
    );
    
    // Check emergency pause
    require!(
        !program_state.emergency_pause,
        TwistError::EmergencyPauseActive
    );
    
    // Initialize stake account if new
    if !stake_state.is_initialized {
        stake_state.owner = ctx.accounts.owner.key();
        stake_state.bump = ctx.bumps.stake_state;
        stake_state.total_staked = 0;
        stake_state.total_earned = 0;
        stake_state.stakes = Vec::new();
        stake_state.is_initialized = true;
        
        // Increment total users
        program_state.total_users += 1;
    }
    
    // Calculate APY based on lock period
    let apy_bps = match lock_period {
        period if period >= 365 * 86400 => APY_365_DAYS, // 67%
        period if period >= 180 * 86400 => APY_180_DAYS, // 35%
        period if period >= 90 * 86400 => APY_90_DAYS,   // 20%
        _ => APY_30_DAYS,                                // 10%
    };
    
    // Create new stake entry
    let stake_entry = StakeEntry {
        amount,
        start_timestamp: clock.unix_timestamp,
        lock_period,
        apy_bps,
        last_claim_timestamp: clock.unix_timestamp,
        total_earned: 0,
        withdrawn: false,
    };
    
    // Add to user's stakes
    stake_state.stakes.push(stake_entry);
    stake_state.total_staked = stake_state.total_staked.saturating_add(amount);
    
    // Update global metrics
    program_state.total_staked = program_state.total_staked.saturating_add(amount as u128);
    program_state.total_stakes += 1;
    
    // Transfer tokens to stake vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.owner_token_account.to_account_info(),
        to: ctx.accounts.stake_vault.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;
    
    // Emit stake event
    emit!(TokensStaked {
        owner: ctx.accounts.owner.key(),
        amount,
        lock_period,
        apy_bps,
        unlock_timestamp: clock.unix_timestamp + lock_period,
        stake_index: stake_state.stakes.len() - 1,
    });
    
    msg!("Staked {} TWIST for {} days at {}% APY",
        amount as f64 / 10f64.powf(DECIMALS as f64),
        lock_period / 86400,
        apy_bps as f64 / 100.0
    );
    
    Ok(())
}