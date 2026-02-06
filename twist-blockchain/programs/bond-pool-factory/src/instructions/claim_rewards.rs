// bond-pool-factory/src/instructions/claim_rewards.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub bond_pool: Account<'info, BondPool>,
    
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
        seeds = [BondPosition::SEED_PREFIX, claimant.key().as_ref(), bond_pool.key().as_ref()],
        bump = bond_position.bump
    )]
    pub bond_position: Account<'info, BondPosition>,
    
    /// Pool's TWIST vault account
    #[account(
        mut,
        constraint = pool_twist_vault.owner == bond_pool.key()
    )]
    pub pool_twist_vault: Account<'info, TokenAccount>,
    
    /// Claimant's TWIST token account
    #[account(
        mut,
        constraint = claimant_twist_account.owner == claimant.key()
    )]
    pub claimant_twist_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub claimant: Signer<'info>,
    
    /// CHECK: Validated in constraint
    pub owner: UncheckedAccount<'info>,
    
    /// CHECK: Validated in constraint
    pub pool: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimRewards>) -> Result<()> {
    let pool = &ctx.accounts.bond_pool;
    let position = &mut ctx.accounts.bond_position;
    let clock = Clock::get()?;
    
    // Calculate pending rewards using the integral method
    let pending_integral = calculate_pending_rewards_integral(position, pool)?;
    
    // Calculate pending rewards using the share method
    let pending_share = pool.calculate_pending_rewards(
        position.shares,
        position.reward_debt
    );
    
    // Use the maximum of both methods (ensures fairness)
    let pending = pending_integral.max(pending_share);
    
    if pending == 0 {
        return Ok(());
    }
    
    // Transfer rewards from pool vault to claimant
    let pool_seeds = &[
        BondPool::SEED_PREFIX,
        &pool.site_hash,
        &[pool.bump],
    ];
    
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_twist_vault.to_account_info(),
                to: ctx.accounts.claimant_twist_account.to_account_info(),
                authority: ctx.accounts.bond_pool.to_account_info(),
            },
            &[pool_seeds],
        ),
        pending,
    )?;
    
    // Update position state
    position.reward_debt = (position.shares as u128)
        .checked_mul(pool.reward_per_share)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?
        .checked_div(crate::utils::PRECISION)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    position.claimed_cursor = pool.yield_integral;
    position.rewards_claimed = position.rewards_claimed
        .checked_add(pending)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    position.last_claim_timestamp = clock.unix_timestamp;
    
    emit!(RewardsClaimed {
        claimant: ctx.accounts.claimant.key(),
        pool: pool.key(),
        position: position.key(),
        amount: pending,
        total_claimed: position.rewards_claimed,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

/// Calculate pending rewards using the integral method
fn calculate_pending_rewards_integral(
    position: &BondPosition,
    pool: &BondPool,
) -> Result<u64> {
    let yield_delta = pool.yield_integral
        .checked_sub(position.claimed_cursor)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    let pending = (yield_delta as u128)
        .checked_mul(position.amount_staked as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?
        .checked_div(1 << 64) // Q64 scaling
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    Ok(pending as u64)
}

#[event]
pub struct RewardsClaimed {
    pub claimant: Pubkey,
    pub pool: Pubkey,
    pub position: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
    pub timestamp: i64,
}