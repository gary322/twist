// bond-pool-factory/src/instructions/distribute_yield.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};
use crate::state::*;

#[derive(Accounts)]
pub struct DistributeYield<'info> {
    #[account(mut)]
    pub factory_state: Account<'info, FactoryState>,
    
    #[account(mut)]
    pub bond_pool: Account<'info, BondPool>,
    
    /// Source account containing TWIST to be distributed/burned
    #[account(
        mut,
        constraint = burn_source.mint == twist_mint.key()
    )]
    pub burn_source: Account<'info, TokenAccount>,
    
    /// Authority for the burn source (visitor)
    pub burn_authority: Signer<'info>,
    
    /// TWIST token mint
    #[account(mut)]
    pub twist_mint: Account<'info, Mint>,
    
    /// VAU processor signer (edge worker)
    pub vau_processor_signer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<DistributeYield>,
    burn_amount: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.bond_pool;
    let factory = &mut ctx.accounts.factory_state;
    
    // For now, we'll check that we have a VAU processor signer
    // In production, this would verify against the stored VAU processor program
    require!(
        ctx.accounts.vau_processor_signer.is_signer,
        crate::errors::BondPoolError::UnauthorizedCaller
    );
    
    // Pool must have stakers to receive yield
    require!(
        pool.total_shares > 0,
        crate::errors::BondPoolError::NoStakers
    );
    
    // Pool must be active
    require!(
        !pool.paused,
        crate::errors::BondPoolError::PoolPaused
    );
    
    // Calculate split according to factory parameters
    // Default: 90% burn (9000 bps), 10% to stakers (1000 bps)
    let burn_portion = (burn_amount as u128)
        .checked_mul(factory.burn_percentage_bps as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(crate::errors::BondPoolError::MathOverflow)? as u64;
        
    let staker_portion = burn_amount
        .checked_sub(burn_portion)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    // Burn the 90% portion
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.twist_mint.to_account_info(),
                from: ctx.accounts.burn_source.to_account_info(),
                authority: ctx.accounts.burn_authority.to_account_info(),
            },
        ),
        burn_portion,
    )?;
    
    // Update pool rewards with the 10% portion
    // This increases the reward per share for all stakers
    let reward_increment = (staker_portion as u128)
        .checked_mul(crate::utils::PRECISION)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?
        .checked_div(pool.total_shares as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    pool.reward_per_share = pool.reward_per_share
        .checked_add(reward_increment)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    // Update yield integral for continuous reward calculation
    let yield_delta = (staker_portion as u128)
        .checked_mul(1 << 64) // Q64 scaling
        .ok_or(crate::errors::BondPoolError::MathOverflow)?
        .checked_div(pool.total_staked as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    pool.yield_integral = pool.yield_integral
        .checked_add(yield_delta)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    // Update pool statistics
    pool.total_yield_accumulated = pool.total_yield_accumulated
        .checked_add(burn_amount as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    pool.total_yield_burned = pool.total_yield_burned
        .checked_add(burn_portion as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    pool.total_yield_distributed = pool.total_yield_distributed
        .checked_add(staker_portion as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    // Update factory statistics
    factory.total_burned_from_yield = factory.total_burned_from_yield
        .checked_add(burn_portion as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    factory.total_distributed_to_stakers = factory.total_distributed_to_stakers
        .checked_add(staker_portion as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    let clock = Clock::get()?;
    pool.last_update_slot = clock.slot;
    
    emit!(YieldDistributed {
        pool: pool.key(),
        site_hash: pool.site_hash,
        total_amount: burn_amount,
        burned: burn_portion,
        to_stakers: staker_portion,
        new_reward_per_share: pool.reward_per_share,
        yield_integral: pool.yield_integral,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

#[event]
pub struct YieldDistributed {
    pub pool: Pubkey,
    pub site_hash: [u8; 32],
    pub total_amount: u64,
    pub burned: u64,
    pub to_stakers: u64,
    pub new_reward_per_share: u128,
    pub yield_integral: u128,
    pub timestamp: i64,
}