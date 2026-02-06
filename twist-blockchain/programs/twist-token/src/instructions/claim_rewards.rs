use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, MintTo};
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::utils::safe_add;

#[derive(Accounts)]
#[instruction(stake_index: usize)]
pub struct ClaimRewards<'info> {
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
        constraint = mint.key() == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub mint: Account<'info, anchor_spl::token::Mint>,
    
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
}

pub fn handler(ctx: Context<ClaimRewards>, stake_index: usize) -> Result<()> {
    let stake_state = &mut ctx.accounts.stake_state;
    let program_state = &ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Check emergency pause
    require!(
        !program_state.emergency_pause,
        TwistError::EmergencyPauseActive
    );
    
    // Calculate pending rewards before getting mutable reference
    let pending_rewards = stake_state.calculate_rewards(stake_index, clock.unix_timestamp)?;
    
    // Check if there are rewards to claim
    require!(
        pending_rewards > 0,
        TwistError::NoRewardsToClaim
    );
    
    // Verify stake exists and is active
    let stake_ref = stake_state.stakes.get(stake_index)
        .ok_or(TwistError::InvalidAmount)?;
    
    require!(
        !stake_ref.withdrawn,
        TwistError::InvalidAmount
    );
    
    // Get stake info before mutation
    let stake_info = (stake_ref.amount, stake_ref.lock_period, stake_ref.apy_bps);
    
    // Update stake state total earned first
    stake_state.total_earned = stake_state.total_earned.saturating_add(pending_rewards as u128);
    
    // Now get mutable reference to update the stake
    let stake = stake_state.stakes.get_mut(stake_index)
        .ok_or(TwistError::InvalidAmount)?;
    
    // Update the stake's last claim timestamp and total earned
    stake.last_claim_timestamp = clock.unix_timestamp;
    stake.total_earned = safe_add(stake.total_earned, pending_rewards)?;
    
    // Get values needed for CPI before dropping mutable reference
    let program_state_bump = program_state.bump;
    
    // Release mutable references before CPI
    
    // Create signer seeds for mint authority
    let seeds = &[
        PROGRAM_STATE_SEED,
        &[program_state_bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    // Mint reward tokens to user
    // Note: In production, rewards might come from a reward pool instead of minting
    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.owner_token_account.to_account_info(),
        authority: ctx.accounts.program_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::mint_to(cpi_ctx, pending_rewards)?;
    
    // Update mint supply tracking in program state
    let program_state = &mut ctx.accounts.program_state;
    program_state.total_transactions = program_state.total_transactions.saturating_add(1);
    
    // Emit rewards claimed event
    emit!(RewardsClaimed {
        owner: ctx.accounts.owner.key(),
        amount: pending_rewards,
        stake_index,
        timestamp: clock.unix_timestamp,
    });
    
    let (stake_amount, lock_period, apy_bps) = stake_info;
    msg!("Claimed {} TWIST rewards", pending_rewards as f64 / 10f64.powf(DECIMALS as f64));
    msg!("Stake: {} TWIST locked for {} days at {}% APY", 
        stake_amount as f64 / 10f64.powf(DECIMALS as f64),
        lock_period / 86400,
        apy_bps as f64 / 100.0
    );
    
    Ok(())
}