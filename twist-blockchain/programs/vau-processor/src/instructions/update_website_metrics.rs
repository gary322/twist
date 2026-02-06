use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::VAUProcessorError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateMetricsParams {
    pub unique_visitors_delta: u64,
    pub verified: Option<bool>,
    pub active: Option<bool>,
}

#[derive(Accounts)]
pub struct UpdateWebsiteMetrics<'info> {
    #[account(
        seeds = [VAUProcessorState::SEED_PREFIX],
        bump = vau_processor.bump
    )]
    pub vau_processor: Account<'info, VAUProcessorState>,
    
    #[account(
        mut,
        has_one = owner @ VAUProcessorError::InvalidAuthority
    )]
    pub website_registry: Account<'info, WebsiteRegistry>,
    
    pub owner: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdateWebsiteMetrics>,
    params: UpdateMetricsParams,
) -> Result<()> {
    let website = &mut ctx.accounts.website_registry;
    
    // Update unique visitors
    website.unique_visitors = website.unique_visitors
        .checked_add(params.unique_visitors_delta)
        .ok_or(VAUProcessorError::MathOverflow)?;
    
    // Update verification status if provided
    if let Some(verified) = params.verified {
        website.verified = verified;
    }
    
    // Update active status if provided
    if let Some(active) = params.active {
        website.active = active;
    }
    
    // Recalculate average burn per visitor
    if website.unique_visitors > 0 && website.total_twist_burned > 0 {
        website.avg_burn_per_visitor = (website.total_twist_burned / website.unique_visitors as u128) as u64;
    }
    
    emit!(WebsiteMetricsUpdated {
        website: website.key(),
        unique_visitors: website.unique_visitors,
        avg_burn_per_visitor: website.avg_burn_per_visitor,
        verified: website.verified,
        active: website.active,
    });
    
    Ok(())
}

#[event]
pub struct WebsiteMetricsUpdated {
    pub website: Pubkey,
    pub unique_visitors: u64,
    pub avg_burn_per_visitor: u64,
    pub verified: bool,
    pub active: bool,
}