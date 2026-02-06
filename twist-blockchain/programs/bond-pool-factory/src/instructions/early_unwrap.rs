// bond-pool-factory/src/instructions/early_unwrap.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};
use crate::state::*;

#[derive(Accounts)]
pub struct EarlyUnwrap<'info> {
    pub factory_state: Account<'info, FactoryState>,
    
    pub bond_pool: Account<'info, BondPool>,
    
    /// User's sector token account (e.g., sTWIST-Gaming)
    #[account(
        mut,
        constraint = user_sector_token_account.owner == user.key(),
        constraint = user_sector_token_account.mint == bond_pool.sector_token_mint
    )]
    pub user_sector_token_account: Account<'info, TokenAccount>,
    
    /// User's TWIST token account
    #[account(
        mut,
        constraint = user_twist_account.owner == user.key()
    )]
    pub user_twist_account: Account<'info, TokenAccount>,
    
    /// Pool's TWIST vault
    #[account(
        mut,
        constraint = pool_twist_vault.owner == bond_pool.key()
    )]
    pub pool_twist_vault: Account<'info, TokenAccount>,
    
    /// Sector token mint
    #[account(
        mut,
        constraint = sector_token_mint.key() == bond_pool.sector_token_mint
    )]
    pub sector_token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<EarlyUnwrap>,
    amount: u64,
) -> Result<()> {
    let factory = &ctx.accounts.factory_state;
    let pool = &ctx.accounts.bond_pool;
    
    // Calculate penalty (e.g., 0.3% = 30 bps)
    let penalty_amount = (amount as u128)
        .checked_mul(factory.early_unwrap_penalty_bps as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(crate::errors::BondPoolError::MathOverflow)? as u64;
    
    let amount_after_penalty = amount
        .checked_sub(penalty_amount)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    // Burn the sector tokens
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.sector_token_mint.to_account_info(),
                from: ctx.accounts.user_sector_token_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;
    
    // Transfer TWIST back (minus penalty)
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
                to: ctx.accounts.user_twist_account.to_account_info(),
                authority: ctx.accounts.bond_pool.to_account_info(),
            },
            &[pool_seeds],
        ),
        amount_after_penalty,
    )?;
    
    // Burn the penalty amount
    if penalty_amount > 0 {
        token::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.sector_token_mint.to_account_info().clone(),
                    from: ctx.accounts.pool_twist_vault.to_account_info(),
                    authority: ctx.accounts.bond_pool.to_account_info(),
                },
                &[pool_seeds],
            ),
            penalty_amount,
        )?;
    }
    
    emit!(EarlyUnwrapExecuted {
        user: ctx.accounts.user.key(),
        pool: pool.key(),
        amount,
        penalty: penalty_amount,
        received: amount_after_penalty,
    });
    
    Ok(())
}

#[event]
pub struct EarlyUnwrapExecuted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub penalty: u64,
    pub received: u64,
}