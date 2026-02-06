use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Burn as TokenBurn, Mint};
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::utils::validate_amount;

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub burner: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
    )]
    pub program_state: Box<Account<'info, ProgramState>>,
    
    #[account(
        mut,
        constraint = mint.key() == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        token::mint = program_state.mint,
        token::authority = burner,
        constraint = burner_token_account.amount >= amount @ TwistError::InsufficientLiquidity
    )]
    pub burner_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<BurnTokens>, amount: u64, reason: String) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Validate inputs
    validate_amount(amount)?;
    require!(
        reason.len() <= 200,
        TwistError::InvalidAmount
    );
    
    // Check emergency pause
    require!(
        !program_state.emergency_pause,
        TwistError::EmergencyPauseActive
    );
    
    // Get current supply before burn
    let current_supply = ctx.accounts.mint.supply;
    
    // Execute burn
    let cpi_accounts = TokenBurn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.burner_token_account.to_account_info(),
        authority: ctx.accounts.burner.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::burn(cpi_ctx, amount)?;
    
    // Update program state
    program_state.total_burned = program_state.total_burned.saturating_add(amount as u128);
    program_state.total_transactions = program_state.total_transactions.saturating_add(1);
    
    // If this is a significant burn (>0.1% of supply), update floor price
    let burn_percentage = (amount as u128 * 10000) / current_supply as u128;
    if burn_percentage >= 10 { // 0.1% or more
        // Burning tokens increases the value of remaining tokens
        // Floor price increases proportionally
        let supply_reduction_factor = 10000 + burn_percentage;
        program_state.floor_price = (program_state.floor_price as u128 * supply_reduction_factor / 10000) as u64;
        
        msg!("Significant burn detected. New floor price: ${}", 
            program_state.floor_price as f64 / 1e6
        );
    }
    
    // Emit burn event
    emit!(TokensBurned {
        amount,
        burner: ctx.accounts.burner.key(),
        reason: reason.clone(),
        timestamp: clock.unix_timestamp,
    });
    
    // Log burn details
    msg!("Burned {} TWIST tokens", amount as f64 / 10f64.powf(DECIMALS as f64));
    msg!("Reason: {}", reason);
    msg!("New supply: {} TWIST", 
        (current_supply - amount) as f64 / 10f64.powf(DECIMALS as f64)
    );
    msg!("Total burned to date: {} TWIST", 
        program_state.total_burned as f64 / 10f64.powf(DECIMALS as f64) as f64
    );
    
    Ok(())
}