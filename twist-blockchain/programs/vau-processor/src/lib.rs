// vau-processor/src/lib.rs
use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("VAUProc11111111111111111111111111111111111");

#[program]
pub mod vau_processor {
    use super::*;

    /// Initialize the VAU processor
    pub fn initialize_vau_processor(
        ctx: Context<InitializeVAUProcessor>,
        params: InitializeVAUProcessorParams,
    ) -> Result<()> {
        instructions::initialize_vau_processor::handler(ctx, params)
    }

    /// Process a visitor attention event (burn tokens on a website)
    pub fn process_visitor_burn(
        ctx: Context<ProcessVisitorBurn>,
        burn_amount: u64,
        site_url: String,
    ) -> Result<()> {
        instructions::process_visitor_burn::handler(ctx, burn_amount, site_url)
    }

    /// Register a website for VAU tracking
    pub fn register_website(
        ctx: Context<RegisterWebsite>,
        params: RegisterWebsiteParams,
    ) -> Result<()> {
        instructions::register_website::handler(ctx, params)
    }

    /// Update website metrics
    pub fn update_website_metrics(
        ctx: Context<UpdateWebsiteMetrics>,
        params: UpdateMetricsParams,
    ) -> Result<()> {
        instructions::update_website_metrics::handler(ctx, params)
    }

    /// Claim VAU processor fees (admin only)
    pub fn claim_processor_fees(
        ctx: Context<ClaimProcessorFees>,
    ) -> Result<()> {
        instructions::claim_processor_fees::handler(ctx)
    }
}