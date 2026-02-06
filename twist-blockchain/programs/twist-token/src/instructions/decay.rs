use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint};
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::utils::calculate_compound_decay;

#[derive(Accounts)]
pub struct ApplyDecay<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        constraint = mint.key() == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ApplyDecay>) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Check if enough time has passed
    require!(
        program_state.can_decay(clock.unix_timestamp),
        TwistError::DecayTooSoon
    );
    
    // Check emergency pause
    require!(
        !program_state.emergency_pause,
        TwistError::EmergencyPauseActive
    );
    
    // Get current supply from mint
    let current_supply = ctx.accounts.mint.supply;
    
    // Calculate periods elapsed
    let time_elapsed = clock.unix_timestamp - program_state.last_decay_timestamp;
    let periods = (time_elapsed / DECAY_INTERVAL) as u64;
    
    // Calculate compound decay
    let decay_amount = calculate_compound_decay(
        current_supply,
        program_state.decay_rate_bps,
        periods
    )?;
    
    // Calculate treasury distributions
    let floor_amount = decay_amount * program_state.treasury_split_bps / 10000;
    let ops_amount = decay_amount - floor_amount;
    
    // Update program state
    program_state.total_decayed = program_state.total_decayed.saturating_add(decay_amount as u128);
    program_state.last_decay_timestamp = clock.unix_timestamp;
    program_state.floor_liquidity = program_state.floor_liquidity.saturating_add(floor_amount);
    
    // Emit decay event
    emit!(DecayApplied {
        decay_amount,
        floor_treasury_amount: floor_amount,
        ops_treasury_amount: ops_amount,
        new_supply: current_supply - decay_amount,
        timestamp: clock.unix_timestamp,
        days_elapsed: periods as f64,
    });
    
    msg!("Decay applied successfully");
    msg!("Amount decayed: {} TWIST", decay_amount as f64 / 10f64.powf(DECIMALS as f64));
    msg!("Floor treasury: {} TWIST", floor_amount as f64 / 10f64.powf(DECIMALS as f64));
    msg!("Ops treasury: {} TWIST", ops_amount as f64 / 10f64.powf(DECIMALS as f64));
    
    Ok(())
}