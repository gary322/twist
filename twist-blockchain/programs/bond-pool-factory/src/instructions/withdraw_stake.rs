// bond-pool-factory/src/instructions/withdraw_stake.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer, CloseAccount};
use crate::state::*;
use crate::utils::*;

#[derive(Accounts)]
pub struct WithdrawStake<'info> {
    #[account(
        mut,
        seeds = [FactoryState::SEED_PREFIX],
        bump = factory_state.bump
    )]
    pub factory_state: Account<'info, FactoryState>,
    
    #[account(mut)]
    pub bond_pool: Account<'info, BondPool>,
    
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
        seeds = [BondPosition::SEED_PREFIX, withdrawer.key().as_ref(), bond_pool.key().as_ref()],
        bump = bond_position.bump,
        close = withdrawer
    )]
    pub bond_position: Account<'info, BondPosition>,
    
    /// Pool's TWIST vault
    #[account(
        mut,
        constraint = pool_twist_vault.owner == bond_pool.key()
    )]
    pub pool_twist_vault: Account<'info, TokenAccount>,
    
    /// Pool's sector token account
    #[account(
        mut,
        constraint = pool_sector_token_account.owner == bond_pool.key(),
        constraint = pool_sector_token_account.mint == bond_pool.sector_token_mint
    )]
    pub pool_sector_token_account: Account<'info, TokenAccount>,
    
    /// Withdrawer's TWIST token account
    #[account(
        mut,
        constraint = withdrawer_twist_account.owner == withdrawer.key()
    )]
    pub withdrawer_twist_account: Account<'info, TokenAccount>,
    
    /// Bond NFT mint
    #[account(
        mut,
        constraint = bond_nft_mint.key() == bond_position.bond_mint
    )]
    pub bond_nft_mint: Account<'info, Mint>,
    
    /// Withdrawer's NFT token account
    #[account(
        mut,
        constraint = withdrawer_nft_account.owner == withdrawer.key(),
        constraint = withdrawer_nft_account.mint == bond_nft_mint.key(),
        constraint = withdrawer_nft_account.amount == 1
    )]
    pub withdrawer_nft_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub withdrawer: Signer<'info>,
    
    /// CHECK: Validated in constraint
    pub owner: UncheckedAccount<'info>,
    
    /// CHECK: Validated in constraint
    pub pool: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<WithdrawStake>,
    shares_to_withdraw: u64,
) -> Result<()> {
    // Get account infos before mutable borrows
    let pool_account_info = ctx.accounts.bond_pool.to_account_info();
    let factory_account_info = ctx.accounts.factory_state.to_account_info();
    
    let pool = &mut ctx.accounts.bond_pool;
    let position = &ctx.accounts.bond_position;
    let factory = &mut ctx.accounts.factory_state;
    let clock = Clock::get()?;
    
    // Check if position can be withdrawn
    require!(
        position.can_withdraw(clock.unix_timestamp),
        crate::errors::BondPoolError::StillLocked
    );
    
    // Validate shares
    require!(
        shares_to_withdraw <= position.shares,
        crate::errors::BondPoolError::InsufficientShares
    );
    
    // If withdrawing all shares, ensure NFT is being burned
    let withdrawing_all = shares_to_withdraw == position.shares;
    
    // Claim any pending rewards first
    claim_rewards_internal(
        pool,
        position,
        &ctx.accounts.pool_twist_vault,
        &ctx.accounts.withdrawer_twist_account,
        &ctx.accounts.token_program,
    )?;
    
    // Calculate TWIST amount to return based on shares
    let amount_to_return = (shares_to_withdraw as u128)
        .checked_mul(pool.total_staked as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?
        .checked_div(pool.total_shares as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)? as u64;
    
    // Transfer TWIST back to withdrawer
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
                to: ctx.accounts.withdrawer_twist_account.to_account_info(),
                authority: pool_account_info,
            },
            &[pool_seeds],
        ),
        amount_to_return,
    )?;
    
    // Burn equivalent sector tokens
    let factory_bump = factory.bump;
    let factory_seeds = &[
        FactoryState::SEED_PREFIX,
        &[factory_bump],
    ];
    
    token::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.pool_sector_token_account.to_account_info().clone(),
                from: ctx.accounts.pool_sector_token_account.to_account_info(),
                authority: factory_account_info,
            },
            &[factory_seeds],
        ),
        amount_to_return,
    )?;
    
    // Update pool state
    pool.total_shares = pool.total_shares
        .checked_sub(shares_to_withdraw)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    pool.total_staked = pool.total_staked
        .checked_sub(amount_to_return)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    // Update factory TVL
    factory.current_tvl = factory.current_tvl
        .checked_sub(amount_to_return)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    // If withdrawing all, burn NFT and close NFT account
    if withdrawing_all {
        // Burn the NFT
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.bond_nft_mint.to_account_info(),
                    from: ctx.accounts.withdrawer_nft_account.to_account_info(),
                    authority: ctx.accounts.withdrawer.to_account_info(),
                },
            ),
            1,
        )?;
        
        // Close NFT token account
        token::close_account(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account: ctx.accounts.withdrawer_nft_account.to_account_info(),
                    destination: ctx.accounts.withdrawer.to_account_info(),
                    authority: ctx.accounts.withdrawer.to_account_info(),
                },
            ),
        )?;
        
        // Decrement staker count
        pool.staker_count = pool.staker_count.saturating_sub(1);
    }
    
    emit!(StakeWithdrawn {
        withdrawer: ctx.accounts.withdrawer.key(),
        pool: pool.key(),
        position: position.key(),
        shares: shares_to_withdraw,
        amount: amount_to_return,
        remaining_shares: position.shares.saturating_sub(shares_to_withdraw),
        all_withdrawn: withdrawing_all,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

/// Internal function to claim rewards during withdrawal
fn claim_rewards_internal<'info>(
    pool: &Account<'info, BondPool>,
    position: &BondPosition,
    pool_vault: &Account<'info, TokenAccount>,
    user_account: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    let pending = pool.calculate_pending_rewards(
        position.shares,
        position.reward_debt
    );
    
    if pending > 0 {
        let pool_seeds = &[
            BondPool::SEED_PREFIX,
            &pool.site_hash,
            &[pool.bump],
        ];
        
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer {
                    from: pool_vault.to_account_info(),
                    to: user_account.to_account_info(),
                    authority: pool.to_account_info(),
                },
                &[pool_seeds],
            ),
            pending,
        )?;
    }
    
    Ok(())
}

#[event]
pub struct StakeWithdrawn {
    pub withdrawer: Pubkey,
    pub pool: Pubkey,
    pub position: Pubkey,
    pub shares: u64,
    pub amount: u64,
    pub remaining_shares: u64,
    pub all_withdrawn: bool,
    pub timestamp: i64,
}