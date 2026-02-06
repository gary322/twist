use anchor_lang::prelude::*;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeVAUProcessorParams {
    pub bond_pool_factory: Pubkey,
    pub treasury: Pubkey,
    pub processor_fee_bps: u16,
    pub min_burn_amount: u64,
    pub max_burn_amount: u64,
    pub daily_burn_limit_per_site: u64,
    pub rate_limit_per_minute: u16,
    pub edge_worker_signers: Vec<Pubkey>,
}

#[derive(Accounts)]
pub struct InitializeVAUProcessor<'info> {
    #[account(
        init,
        payer = authority,
        space = VAUProcessorState::LEN,
        seeds = [VAUProcessorState::SEED_PREFIX],
        bump
    )]
    pub vau_processor: Account<'info, VAUProcessorState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeVAUProcessor>,
    params: InitializeVAUProcessorParams,
) -> Result<()> {
    let processor = &mut ctx.accounts.vau_processor;
    
    // Validate parameters
    require!(
        params.processor_fee_bps <= 100, // Max 1% fee
        crate::errors::VAUProcessorError::InvalidAuthority
    );
    
    require!(
        params.min_burn_amount > 0,
        crate::errors::VAUProcessorError::InvalidBurnAmount
    );
    
    require!(
        params.max_burn_amount >= params.min_burn_amount,
        crate::errors::VAUProcessorError::InvalidBurnAmount
    );
    
    require!(
        params.edge_worker_signers.len() <= 10,
        crate::errors::VAUProcessorError::InvalidAuthority
    );
    
    // Initialize processor state
    processor.authority = ctx.accounts.authority.key();
    processor.bond_pool_factory = params.bond_pool_factory;
    processor.treasury = params.treasury;
    processor.total_burns_processed = 0;
    processor.total_twist_burned = 0;
    processor.total_fees_collected = 0;
    processor.processor_fee_bps = params.processor_fee_bps;
    processor.min_burn_amount = params.min_burn_amount;
    processor.max_burn_amount = params.max_burn_amount;
    processor.daily_burn_limit_per_site = params.daily_burn_limit_per_site;
    processor.paused = false;
    processor.edge_worker_signers = params.edge_worker_signers;
    processor.rate_limit_per_minute = params.rate_limit_per_minute;
    processor.last_update_timestamp = Clock::get()?.unix_timestamp;
    processor.bump = ctx.bumps.vau_processor;
    processor._reserved = [0; 32];
    
    emit!(VAUProcessorInitialized {
        authority: processor.authority,
        bond_pool_factory: processor.bond_pool_factory,
        treasury: processor.treasury,
        processor_fee_bps: processor.processor_fee_bps,
        min_burn_amount: processor.min_burn_amount,
        max_burn_amount: processor.max_burn_amount,
    });
    
    Ok(())
}

#[event]
pub struct VAUProcessorInitialized {
    pub authority: Pubkey,
    pub bond_pool_factory: Pubkey,
    pub treasury: Pubkey,
    pub processor_fee_bps: u16,
    pub min_burn_amount: u64,
    pub max_burn_amount: u64,
}