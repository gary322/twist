use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::utils::{safe_add, safe_sub, safe_div};

#[derive(Accounts)]
#[instruction(stake_index: usize)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        seeds = [STAKE_STATE_SEED, owner.key().as_ref()],
        bump = stake_state.bump,
        constraint = stake_state.owner == owner.key() @ TwistError::Unauthorized,
        constraint = stake_state.stakes.len() > stake_index @ TwistError::InvalidAmount
    )]
    pub stake_state: Box<Account<'info, StakeState>>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
    )]
    pub program_state: Box<Account<'info, ProgramState>>,
    
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
    
    #[account(
        mut,
        seeds = [FLOOR_TREASURY_SEED],
        bump,
        token::mint = program_state.mint,
        token::authority = program_state,
    )]
    pub floor_treasury_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Unstake>, stake_index: usize) -> Result<()> {
    let stake_state = &mut ctx.accounts.stake_state;
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Check emergency pause
    require!(
        !program_state.emergency_pause,
        TwistError::EmergencyPauseActive
    );
    
    // Calculate pending rewards before getting mutable reference
    let pending_rewards = stake_state.calculate_rewards(stake_index, clock.unix_timestamp)?;
    
    // Get immutable stake data we need
    let stake_ref = stake_state.stakes.get(stake_index)
        .ok_or(TwistError::InvalidAmount)?;
    
    // Check if already withdrawn
    require!(
        !stake_ref.withdrawn,
        TwistError::InvalidAmount
    );
    
    // Get stake data we need before mutation
    let stake_amount = stake_ref.amount;
    let is_unlocked = stake_ref.is_unlocked(clock.unix_timestamp);
    let early_penalty = if !is_unlocked {
        let penalty = stake_ref.calculate_early_unstake_penalty(clock.unix_timestamp);
        msg!("Early unstake penalty: {} TWIST", 
            penalty as f64 / 10f64.powf(DECIMALS as f64)
        );
        penalty
    } else {
        0u64
    };
    
    // Now get mutable reference to update the stake
    let stake = stake_state.stakes.get_mut(stake_index)
        .ok_or(TwistError::InvalidAmount)?;
    
    // Calculate total amount to return (stake + rewards - penalty)
    let total_before_penalty = safe_add(stake_amount, pending_rewards)?;
    let total_to_return = safe_sub(total_before_penalty, early_penalty)?;
    
    // Update stake entry
    stake.withdrawn = true;
    stake.total_earned = safe_add(stake.total_earned, pending_rewards)?;
    stake.last_claim_timestamp = clock.unix_timestamp;
    
    // Update stake state totals
    stake_state.total_staked = safe_sub(stake_state.total_staked, stake_amount)?;
    stake_state.total_earned = stake_state.total_earned.saturating_add(pending_rewards as u128);
    
    // Update global program state
    program_state.total_staked = program_state.total_staked.saturating_sub(stake_amount as u128);
    
    // Update floor liquidity if there's a penalty
    if early_penalty > 0 {
        program_state.floor_liquidity = safe_add(
            program_state.floor_liquidity,
            safe_div(early_penalty, 1_000_000_000)? // Convert from token units to USDC equivalent
        )?;
    }
    
    // Get program state values before dropping mutable reference
    let program_state_bump = program_state.bump;
    
    // Release mutable references before creating immutable ones
    
    // Create signer seeds for PDA
    let seeds = &[
        PROGRAM_STATE_SEED,
        &[program_state_bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    // Transfer tokens from vault to user
    let cpi_accounts = Transfer {
        from: ctx.accounts.stake_vault.to_account_info(),
        to: ctx.accounts.owner_token_account.to_account_info(),
        authority: ctx.accounts.program_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::transfer(cpi_ctx, total_to_return)?;
    
    // If there's a penalty, transfer it to floor treasury
    if early_penalty > 0 {
        let penalty_cpi_accounts = Transfer {
            from: ctx.accounts.stake_vault.to_account_info(),
            to: ctx.accounts.floor_treasury_vault.to_account_info(),
            authority: ctx.accounts.program_state.to_account_info(),
        };
        let penalty_cpi_program = ctx.accounts.token_program.to_account_info();
        let penalty_cpi_ctx = CpiContext::new_with_signer(
            penalty_cpi_program, 
            penalty_cpi_accounts, 
            signer_seeds
        );
        
        token::transfer(penalty_cpi_ctx, early_penalty)?;
    }
    
    // Emit unstake event
    emit!(TokensUnstaked {
        owner: ctx.accounts.owner.key(),
        amount: stake_amount,
        rewards: pending_rewards,
        early_unstake_penalty: early_penalty,
        stake_index,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Unstaked {} TWIST", stake_amount as f64 / 10f64.powf(DECIMALS as f64));
    msg!("Rewards: {} TWIST", pending_rewards as f64 / 10f64.powf(DECIMALS as f64));
    if early_penalty > 0 {
        msg!("Early penalty: {} TWIST", early_penalty as f64 / 10f64.powf(DECIMALS as f64));
    }
    msg!("Total received: {} TWIST", total_to_return as f64 / 10f64.powf(DECIMALS as f64));
    
    Ok(())
}