// bond-pool-factory/src/instructions/update_pool_params.rs
use anchor_lang::prelude::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdatePoolParamsData {
    pub min_stake_amount: Option<u64>,
    pub max_stake_amount: Option<u64>,
    pub active: Option<bool>,
    pub website_revenue_share_bps: Option<u16>,
}

#[derive(Accounts)]
pub struct UpdatePoolParams<'info> {
    #[account(mut)]
    pub bond_pool: Account<'info, BondPool>,
    
    #[account(
        constraint = site_owner.key() == bond_pool.site_owner @ crate::errors::BondPoolError::NotOwner
    )]
    pub site_owner: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdatePoolParams>,
    params: UpdatePoolParamsData,
) -> Result<()> {
    let pool = &mut ctx.accounts.bond_pool;
    
    if let Some(min_stake) = params.min_stake_amount {
        require!(
            min_stake >= 1_000_000_000, // 1 TWIST minimum
            crate::errors::BondPoolError::StakeBelowMinimum
        );
        pool.min_stake_amount = min_stake;
    }
    
    if let Some(max_stake) = params.max_stake_amount {
        pool.max_stake_amount = max_stake;
    }
    
    if let Some(active) = params.active {
        pool.active = active;
    }
    
    if let Some(revenue_share) = params.website_revenue_share_bps {
        require!(
            revenue_share <= 5_000, // Max 50%
            crate::errors::BondPoolError::InvalidRevenueShare
        );
        pool.website_revenue_share_bps = revenue_share;
    }
    
    emit!(PoolParamsUpdated {
        pool: pool.key(),
        min_stake_amount: pool.min_stake_amount,
        max_stake_amount: pool.max_stake_amount,
        active: pool.active,
        website_revenue_share_bps: pool.website_revenue_share_bps,
    });
    
    Ok(())
}

#[event]
pub struct PoolParamsUpdated {
    pub pool: Pubkey,
    pub min_stake_amount: u64,
    pub max_stake_amount: u64,
    pub active: bool,
    pub website_revenue_share_bps: u16,
}