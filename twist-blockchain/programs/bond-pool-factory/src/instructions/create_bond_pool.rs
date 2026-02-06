// bond-pool-factory/src/instructions/create_bond_pool.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use crate::state::*;
use crate::utils::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateBondPoolParams {
    pub site_hash: [u8; 32],
    pub sector: WebsiteSector,
    pub min_stake_amount: u64,
    pub max_stake_amount: u64,
    pub lock_duration: i64,
    pub website_revenue_share_bps: u16,
}

#[derive(Accounts)]
#[instruction(params: CreateBondPoolParams)]
pub struct CreateBondPool<'info> {
    #[account(mut)]
    pub factory_state: Account<'info, FactoryState>,
    
    #[account(
        init,
        payer = site_owner,
        space = BondPool::LEN,
        seeds = [BondPool::SEED_PREFIX, &params.site_hash],
        bump
    )]
    pub bond_pool: Account<'info, BondPool>,
    
    /// CHECK: Vault PDA will be validated in instruction
    #[account(
        mut,
        seeds = [b"vault", bond_pool.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,
    
    /// TWIST token mint
    pub twist_mint: Account<'info, Mint>,
    
    /// Sector wrapper token mint (e.g., sTWIST-Gaming)
    #[account(
        constraint = sector_token_mint.mint_authority.unwrap() == factory_state.key()
    )]
    pub sector_token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub site_owner: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateBondPool>,
    params: CreateBondPoolParams,
) -> Result<()> {
    let factory = &mut ctx.accounts.factory_state;
    let pool = &mut ctx.accounts.bond_pool;
    let clock = Clock::get()?;
    
    // Validate factory is not paused
    require!(
        !factory.paused,
        crate::errors::BondPoolError::FactoryPaused
    );
    
    // Validate parameters
    require!(
        params.lock_duration >= factory.min_bond_duration &&
        params.lock_duration <= factory.max_bond_duration,
        crate::errors::BondPoolError::InvalidLockDuration
    );
    
    require!(
        params.min_stake_amount >= 1_000_000_000, // 1 TWIST minimum
        crate::errors::BondPoolError::StakeBelowMinimum
    );
    
    require!(
        params.website_revenue_share_bps <= 5_000, // Max 50% revenue share
        crate::errors::BondPoolError::InvalidRevenueShare
    );
    
    // Generate pool ID
    let pool_id = generate_pool_id(&params.site_hash, clock.unix_timestamp);
    
    // Initialize pool
    pool.pool_id = pool_id;
    pool.site_hash = params.site_hash;
    pool.site_owner = ctx.accounts.site_owner.key();
    pool.sector = params.sector;
    pool.created_at = clock.unix_timestamp;
    pool.min_stake_amount = params.min_stake_amount;
    pool.max_stake_amount = params.max_stake_amount;
    pool.lock_duration = params.lock_duration;
    pool.total_staked = 0;
    pool.total_shares = 0;
    pool.total_yield_accumulated = 0;
    pool.total_yield_burned = 0;
    pool.total_yield_distributed = 0;
    pool.reward_per_share = 0;
    pool.last_update_slot = clock.slot;
    pool.yield_integral = 0;
    pool.active = true;
    pool.finalized = false;
    pool.paused = false;
    pool.staker_count = 0;
    pool.website_revenue_share_bps = params.website_revenue_share_bps;
    pool.vault = ctx.accounts.vault.key();
    pool.sector_token_mint = ctx.accounts.sector_token_mint.key();
    pool.bump = ctx.bumps.bond_pool;
    pool._reserved = [0; 16];
    
    // Update factory state
    factory.total_pools_created += 1;
    
    emit!(BondPoolCreated {
        pool_id,
        site_hash: params.site_hash,
        site_owner: ctx.accounts.site_owner.key(),
        sector: params.sector,
        lock_duration: params.lock_duration,
        min_stake: params.min_stake_amount,
        max_stake: params.max_stake_amount,
    });
    
    Ok(())
}

#[event]
pub struct BondPoolCreated {
    pub pool_id: [u8; 32],
    pub site_hash: [u8; 32],
    pub site_owner: Pubkey,
    pub sector: WebsiteSector,
    pub lock_duration: i64,
    pub min_stake: u64,
    pub max_stake: u64,
}