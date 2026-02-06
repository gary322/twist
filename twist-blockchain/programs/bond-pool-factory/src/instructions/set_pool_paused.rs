// bond-pool-factory/src/instructions/set_pool_paused.rs
use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct SetPoolPaused<'info> {
    pub factory_state: Account<'info, FactoryState>,
    
    #[account(mut)]
    pub bond_pool: Account<'info, BondPool>,
    
    #[account(
        constraint = authority.key() == factory_state.authority || 
                     authority.key() == bond_pool.site_owner 
                     @ crate::errors::BondPoolError::UnauthorizedCaller
    )]
    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<SetPoolPaused>,
    paused: bool,
) -> Result<()> {
    let pool = &mut ctx.accounts.bond_pool;
    let old_paused = pool.paused;
    
    pool.paused = paused;
    
    emit!(PoolPausedStateChanged {
        pool: pool.key(),
        paused,
        old_paused,
        authority: ctx.accounts.authority.key(),
    });
    
    Ok(())
}

#[event]
pub struct PoolPausedStateChanged {
    pub pool: Pubkey,
    pub paused: bool,
    pub old_paused: bool,
    pub authority: Pubkey,
}