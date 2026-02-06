// bond-pool-factory/src/instructions/initialize_factory.rs
use anchor_lang::prelude::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeFactoryParams {
    pub min_bond_duration: i64,
    pub max_bond_duration: i64,
    pub burn_percentage_bps: u16,
    pub yield_percentage_bps: u16,
    pub early_unwrap_penalty_bps: u16,
    pub protocol_fee_bps: u16,
    pub treasury: Pubkey,
    pub vau_processor_program: Pubkey,
}

#[derive(Accounts)]
pub struct InitializeFactory<'info> {
    #[account(
        init,
        payer = authority,
        space = FactoryState::LEN,
        seeds = [FactoryState::SEED_PREFIX],
        bump
    )]
    pub factory_state: Account<'info, FactoryState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeFactory>,
    params: InitializeFactoryParams,
) -> Result<()> {
    let factory = &mut ctx.accounts.factory_state;
    
    // Validate parameters
    require!(
        params.burn_percentage_bps + params.yield_percentage_bps == 10_000,
        crate::errors::BondPoolError::InvalidBurnSplit
    );
    
    require!(
        params.burn_percentage_bps == 9_000, // 90% burn
        crate::errors::BondPoolError::InvalidBurnSplit
    );
    
    require!(
        params.early_unwrap_penalty_bps <= 100, // Max 1% penalty
        crate::errors::BondPoolError::EarlyUnwrapFeeTooHigh
    );
    
    require!(
        params.min_bond_duration >= 30 * 24 * 60 * 60, // 30 days minimum
        crate::errors::BondPoolError::InvalidLockDuration
    );
    
    require!(
        params.max_bond_duration <= 365 * 24 * 60 * 60, // 365 days maximum
        crate::errors::BondPoolError::InvalidLockDuration
    );
    
    // Initialize factory state
    factory.authority = ctx.accounts.authority.key();
    factory.total_pools_created = 0;
    factory.total_value_locked = 0;
    factory.current_tvl = 0;
    factory.total_burned_from_yield = 0;
    factory.total_distributed_to_stakers = 0;
    factory.protocol_fee_bps = params.protocol_fee_bps;
    factory.min_bond_duration = params.min_bond_duration;
    factory.max_bond_duration = params.max_bond_duration;
    factory.burn_percentage_bps = params.burn_percentage_bps;
    factory.yield_percentage_bps = params.yield_percentage_bps;
    factory.early_unwrap_penalty_bps = params.early_unwrap_penalty_bps;
    factory.paused = false;
    factory.upgrade_authority = ctx.accounts.authority.key();
    factory.treasury = params.treasury;
    factory.vau_processor_program = params.vau_processor_program;
    factory.bump = ctx.bumps.factory_state;
    factory._reserved = [0; 16];
    
    emit!(FactoryInitialized {
        authority: factory.authority,
        min_bond_duration: factory.min_bond_duration,
        max_bond_duration: factory.max_bond_duration,
        burn_percentage_bps: factory.burn_percentage_bps,
        yield_percentage_bps: factory.yield_percentage_bps,
    });
    
    Ok(())
}

#[event]
pub struct FactoryInitialized {
    pub authority: Pubkey,
    pub min_bond_duration: i64,
    pub max_bond_duration: i64,
    pub burn_percentage_bps: u16,
    pub yield_percentage_bps: u16,
}