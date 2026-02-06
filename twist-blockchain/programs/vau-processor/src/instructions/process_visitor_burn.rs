// vau-processor/src/instructions/process_visitor_burn.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use bond_pool_factory::{
    cpi::accounts::DistributeYield,
    program::BondPoolFactory,
    state::BondPool,
};
use crate::state::*;
use crate::errors::VAUProcessorError;

#[derive(Accounts)]
#[instruction(burn_amount: u64, site_url: String)]
pub struct ProcessVisitorBurn<'info> {
    #[account(
        mut,
        seeds = [VAUProcessorState::SEED_PREFIX],
        bump = vau_processor.bump
    )]
    pub vau_processor: Account<'info, VAUProcessorState>,
    
    #[account(
        mut,
        seeds = [
            WebsiteRegistry::SEED_PREFIX,
            &anchor_lang::solana_program::hash::hash(site_url.as_bytes()).to_bytes()
        ],
        bump = website.bump,
        constraint = website.active @ VAUProcessorError::WebsiteNotRegistered,
        constraint = website.verified @ VAUProcessorError::WebsiteNotRegistered
    )]
    pub website: Account<'info, WebsiteRegistry>,
    
    /// The bond pool associated with the website
    #[account(
        mut,
        constraint = bond_pool.key() == website.bond_pool @ VAUProcessorError::BondPoolNotFound
    )]
    pub bond_pool: Account<'info, BondPool>,
    
    /// Visitor's TWIST token account (source of burn)
    #[account(
        mut,
        constraint = burn_source.owner == visitor.key(),
        constraint = burn_source.mint == twist_mint.key(),
        constraint = burn_source.amount >= burn_amount @ VAUProcessorError::InsufficientBalance
    )]
    pub burn_source: Account<'info, TokenAccount>,
    
    /// TWIST mint
    #[account(mut)]
    pub twist_mint: Account<'info, Mint>,
    
    /// Visitor burning tokens
    pub visitor: Signer<'info>,
    
    /// Edge worker signer (must be authorized)
    #[account(
        constraint = vau_processor.edge_worker_signers.contains(&edge_worker.key())
            @ VAUProcessorError::InvalidAuthority
    )]
    pub edge_worker: Signer<'info>,
    
    /// Bond pool factory program
    pub bond_pool_factory: Program<'info, BondPoolFactory>,
    
    /// Token program
    pub token_program: Program<'info, Token>,
    
    /// System program
    pub system_program: Program<'info, System>,
    
    /// Clock sysvar
    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(
    ctx: Context<ProcessVisitorBurn>,
    burn_amount: u64,
    site_url: String,
) -> Result<()> {
    let processor = &mut ctx.accounts.vau_processor;
    let website = &mut ctx.accounts.website;
    let clock = &ctx.accounts.clock;
    
    // Validate burn amount
    require!(
        processor.can_process_burn(burn_amount),
        VAUProcessorError::InvalidBurnAmount
    );
    
    // Check daily reset
    if website.needs_daily_reset(clock.unix_timestamp) {
        website.daily_burn_amount = 0;
        website.last_daily_reset = clock.unix_timestamp;
    }
    
    // Check daily limit
    require!(
        website.can_burn(burn_amount, processor.daily_burn_limit_per_site),
        VAUProcessorError::DailyBurnLimitExceeded
    );
    
    // Calculate processor fee
    let processor_fee = (burn_amount as u128)
        .checked_mul(processor.processor_fee_bps as u128)
        .ok_or(VAUProcessorError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(VAUProcessorError::MathOverflow)? as u64;
    
    let amount_after_fee = burn_amount
        .checked_sub(processor_fee)
        .ok_or(VAUProcessorError::MathOverflow)?;
    
    // CPI to bond pool factory to distribute yield
    // This will handle the 90% burn / 10% to stakers split
    let cpi_accounts = DistributeYield {
        factory_state: ctx.accounts.bond_pool_factory.to_account_info(),
        bond_pool: ctx.accounts.bond_pool.to_account_info(),
        burn_source: ctx.accounts.burn_source.to_account_info(),
        burn_authority: ctx.accounts.visitor.to_account_info(),
        twist_mint: ctx.accounts.twist_mint.to_account_info(),
        vau_processor_signer: ctx.accounts.edge_worker.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.bond_pool_factory.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    bond_pool_factory::cpi::distribute_yield(cpi_ctx, amount_after_fee)?;
    
    // Update processor stats
    processor.total_burns_processed = processor.total_burns_processed
        .checked_add(1)
        .ok_or(VAUProcessorError::MathOverflow)?;
    
    processor.total_twist_burned = processor.total_twist_burned
        .checked_add(burn_amount as u128)
        .ok_or(VAUProcessorError::MathOverflow)?;
    
    processor.total_fees_collected = processor.total_fees_collected
        .checked_add(processor_fee as u128)
        .ok_or(VAUProcessorError::MathOverflow)?;
    
    // Update website stats
    website.total_burns = website.total_burns
        .checked_add(1)
        .ok_or(VAUProcessorError::MathOverflow)?;
    
    website.total_twist_burned = website.total_twist_burned
        .checked_add(burn_amount as u128)
        .ok_or(VAUProcessorError::MathOverflow)?;
    
    website.daily_burn_amount = website.daily_burn_amount
        .checked_add(burn_amount)
        .ok_or(VAUProcessorError::MathOverflow)?;
    
    website.last_burn_timestamp = clock.unix_timestamp;
    
    // Update average burn per visitor
    if website.unique_visitors > 0 {
        website.avg_burn_per_visitor = (website.total_twist_burned / website.unique_visitors as u128) as u64;
    }
    
    emit!(VisitorBurnProcessed {
        visitor: ctx.accounts.visitor.key(),
        website: website.key(),
        bond_pool: ctx.accounts.bond_pool.key(),
        burn_amount,
        processor_fee,
        amount_to_pool: amount_after_fee,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

#[event]
pub struct VisitorBurnProcessed {
    pub visitor: Pubkey,
    pub website: Pubkey,
    pub bond_pool: Pubkey,
    pub burn_amount: u64,
    pub processor_fee: u64,
    pub amount_to_pool: u64,
    pub timestamp: i64,
}