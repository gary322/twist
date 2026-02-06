// bond-pool-factory/src/instructions/stake_in_pool.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, MintTo};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::*;
use crate::utils::*;

#[derive(Accounts)]
pub struct StakeInPool<'info> {
    #[account(
        mut,
        seeds = [FactoryState::SEED_PREFIX],
        bump
    )]
    pub factory_state: Account<'info, FactoryState>,
    
    #[account(mut)]
    pub bond_pool: Account<'info, BondPool>,
    
    #[account(
        init,
        payer = staker,
        space = BondPosition::LEN,
        seeds = [BondPosition::SEED_PREFIX, staker.key().as_ref(), bond_pool.key().as_ref()],
        bump
    )]
    pub bond_position: Account<'info, BondPosition>,
    
    /// Staker's TWIST token account
    #[account(
        mut,
        constraint = staker_twist_account.owner == staker.key(),
        constraint = staker_twist_account.mint == twist_mint.key()
    )]
    pub staker_twist_account: Account<'info, TokenAccount>,
    
    /// Pool vault TWIST token account (PDA)
    #[account(
        init_if_needed,
        payer = staker,
        associated_token::mint = twist_mint,
        associated_token::authority = bond_pool,
    )]
    pub pool_twist_vault: Account<'info, TokenAccount>,
    
    /// Sector wrapper token account for the pool
    #[account(
        init_if_needed,
        payer = staker,
        associated_token::mint = sector_token_mint,
        associated_token::authority = bond_pool,
    )]
    pub pool_sector_token_account: Account<'info, TokenAccount>,
    
    /// TWIST token mint
    pub twist_mint: Account<'info, Mint>,
    
    /// Sector token mint (e.g., sTWIST-Gaming)
    #[account(
        mut,
        constraint = sector_token_mint.key() == bond_pool.sector_token_mint
    )]
    pub sector_token_mint: Account<'info, Mint>,
    
    /// Bond NFT mint (to be created)
    /// CHECK: Will be validated in instruction
    #[account(mut)]
    pub bond_nft_mint: UncheckedAccount<'info>,
    
    /// Staker's NFT token account
    /// CHECK: Will be created in instruction
    #[account(mut)]
    pub staker_nft_account: UncheckedAccount<'info>,
    
    /// NFT metadata account
    /// CHECK: Will be created via CPI to metadata program
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub staker: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    
    /// Metaplex Token Metadata Program
    /// CHECK: Program ID will be validated
    pub metadata_program: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<StakeInPool>,
    amount: u64,
) -> Result<()> {
    // Get account infos before mutable borrows
    let factory_account_info = ctx.accounts.factory_state.to_account_info();
    
    let pool = &mut ctx.accounts.bond_pool;
    let position = &mut ctx.accounts.bond_position;
    let factory = &mut ctx.accounts.factory_state;
    let clock = Clock::get()?;
    
    // Validate pool is active
    require!(
        pool.active && !pool.finalized && !pool.paused,
        crate::errors::BondPoolError::PoolNotActive
    );
    
    // Validate factory is not paused
    require!(
        !factory.paused,
        crate::errors::BondPoolError::FactoryPaused
    );
    
    // Validate stake amount
    require!(
        amount >= pool.min_stake_amount,
        crate::errors::BondPoolError::StakeBelowMinimum
    );
    
    if pool.max_stake_amount > 0 {
        require!(
            amount <= pool.max_stake_amount,
            crate::errors::BondPoolError::StakeAboveMaximum
        );
    }
    
    // Update pool rewards before staking
    update_pool_rewards(pool)?;
    
    // Calculate shares to mint
    let shares = if pool.total_shares == 0 {
        // First staker gets 1:1 shares
        amount
    } else {
        // Proportional shares based on current pool value
        (amount as u128)
            .checked_mul(pool.total_shares as u128)
            .ok_or(crate::errors::BondPoolError::MathOverflow)?
            .checked_div(pool.total_staked as u128)
            .ok_or(crate::errors::BondPoolError::MathOverflow)? as u64
    };
    
    // Transfer TWIST to pool vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.staker_twist_account.to_account_info(),
                to: ctx.accounts.pool_twist_vault.to_account_info(),
                authority: ctx.accounts.staker.to_account_info(),
            },
        ),
        amount,
    )?;
    
    // Mint sector wrapper tokens to pool
    let factory_bump = factory.bump;
    let factory_seeds = &[
        FactoryState::SEED_PREFIX,
        &[factory_bump],
    ];
    
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.sector_token_mint.to_account_info(),
                to: ctx.accounts.pool_sector_token_account.to_account_info(),
                authority: factory_account_info,
            },
            &[factory_seeds],
        ),
        amount,
    )?;
    
    // Initialize bond position
    position.owner = ctx.accounts.staker.key();
    position.pool = pool.key();
    position.bond_mint = ctx.accounts.bond_nft_mint.key();
    position.amount_staked = amount;
    position.shares = shares;
    position.stake_timestamp = clock.unix_timestamp;
    position.unlock_timestamp = clock.unix_timestamp + pool.lock_duration;
    position.reward_debt = (shares as u128)
        .checked_mul(pool.reward_per_share)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?
        .checked_div(crate::utils::PRECISION)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    position.rewards_claimed = 0;
    position.last_claim_timestamp = clock.unix_timestamp;
    position.claimed_cursor = pool.yield_integral;
    position.position_number = pool.staker_count as u64;
    position.auto_compound = false;
    position.tier = calculate_tier(amount);
    position.bump = ctx.bumps.bond_position;
    position._reserved = [0; 8];
    
    // Mint Bond NFT
    mint_bond_nft(
        &ctx.accounts.staker.key(),
        &ctx.accounts.bond_nft_mint,
        &ctx.accounts.staker_nft_account,
        &ctx.accounts.nft_metadata,
        &ctx.accounts.metadata_program,
        &ctx.accounts.token_program,
        &ctx.accounts.system_program,
        &ctx.accounts.rent,
        pool,
        position,
        ctx.accounts.staker.to_account_info(),
    )?;
    
    // Update pool state
    pool.total_staked = pool.total_staked
        .checked_add(amount)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    pool.total_shares = pool.total_shares
        .checked_add(shares)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    pool.staker_count += 1;
    
    // Update factory TVL
    factory.current_tvl = factory.current_tvl
        .checked_add(amount)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    factory.total_value_locked = factory.total_value_locked
        .checked_add(amount as u128)
        .ok_or(crate::errors::BondPoolError::MathOverflow)?;
    
    emit!(BondCreated {
        staker: ctx.accounts.staker.key(),
        pool: pool.key(),
        amount,
        shares,
        unlock_timestamp: position.unlock_timestamp,
        nft_mint: position.bond_mint,
        position_number: position.position_number,
    });
    
    Ok(())
}

#[event]
pub struct BondCreated {
    pub staker: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub unlock_timestamp: i64,
    pub nft_mint: Pubkey,
    pub position_number: u64,
}