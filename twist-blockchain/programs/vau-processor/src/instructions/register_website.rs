use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::VAUProcessorError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RegisterWebsiteParams {
    pub site_url: String,
    pub bond_pool: Pubkey,
    pub sector: String,
}

#[derive(Accounts)]
#[instruction(params: RegisterWebsiteParams)]
pub struct RegisterWebsite<'info> {
    #[account(
        seeds = [VAUProcessorState::SEED_PREFIX],
        bump = vau_processor.bump
    )]
    pub vau_processor: Account<'info, VAUProcessorState>,
    
    #[account(
        init,
        payer = owner,
        space = WebsiteRegistry::LEN,
        seeds = [
            WebsiteRegistry::SEED_PREFIX,
            &anchor_lang::solana_program::hash::hash(params.site_url.as_bytes()).to_bytes()
        ],
        bump
    )]
    pub website_registry: Account<'info, WebsiteRegistry>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterWebsite>,
    params: RegisterWebsiteParams,
) -> Result<()> {
    let website = &mut ctx.accounts.website_registry;
    let clock = Clock::get()?;
    
    // Validate URL
    require!(
        params.site_url.len() > 0 && params.site_url.len() <= 256,
        VAUProcessorError::InvalidWebsiteURL
    );
    
    // Validate sector
    require!(
        params.sector.len() > 0 && params.sector.len() <= 32,
        VAUProcessorError::InvalidWebsiteURL
    );
    
    // Calculate site hash
    let site_hash = anchor_lang::solana_program::hash::hash(params.site_url.as_bytes()).to_bytes();
    
    // Initialize website registry
    website.site_hash = site_hash;
    website.site_url = params.site_url.clone();
    website.bond_pool = params.bond_pool;
    website.owner = ctx.accounts.owner.key();
    website.total_burns = 0;
    website.total_twist_burned = 0;
    website.daily_burn_amount = 0;
    website.last_burn_timestamp = 0;
    website.last_daily_reset = clock.unix_timestamp;
    website.unique_visitors = 0;
    website.avg_burn_per_visitor = 0;
    website.sector = params.sector;
    website.active = true;
    website.verified = false; // Requires manual verification
    website.registered_at = clock.unix_timestamp;
    website.bump = ctx.bumps.website_registry;
    website._reserved = [0; 32];
    
    emit!(WebsiteRegistered {
        website: website.key(),
        site_url: params.site_url,
        bond_pool: params.bond_pool,
        owner: ctx.accounts.owner.key(),
        sector: website.sector.clone(),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

#[event]
pub struct WebsiteRegistered {
    pub website: Pubkey,
    pub site_url: String,
    pub bond_pool: Pubkey,
    pub owner: Pubkey,
    pub sector: String,
    pub timestamp: i64,
}