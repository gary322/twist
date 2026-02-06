use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::VAUProcessorError;

#[derive(Accounts)]
pub struct ClaimProcessorFees<'info> {
    #[account(
        mut,
        seeds = [VAUProcessorState::SEED_PREFIX],
        bump = vau_processor.bump,
        has_one = authority @ VAUProcessorError::InvalidAuthority,
        has_one = treasury
    )]
    pub vau_processor: Account<'info, VAUProcessorState>,
    
    /// Processor's fee vault (holds collected fees)
    #[account(
        mut,
        constraint = fee_vault.owner == vau_processor.key()
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    
    /// Treasury token account to receive fees
    #[account(
        mut,
        constraint = treasury_account.owner == treasury.key()
    )]
    pub treasury_account: Account<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    
    /// CHECK: Validated in has_one
    pub treasury: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimProcessorFees>) -> Result<()> {
    let processor = &ctx.accounts.vau_processor;
    let fee_vault = &ctx.accounts.fee_vault;
    
    // Get current balance in fee vault
    let claimable_amount = fee_vault.amount;
    
    require!(
        claimable_amount > 0,
        VAUProcessorError::InsufficientBalance
    );
    
    // Transfer fees to treasury
    let processor_seeds = &[
        VAUProcessorState::SEED_PREFIX,
        &[processor.bump],
    ];
    
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.fee_vault.to_account_info(),
                to: ctx.accounts.treasury_account.to_account_info(),
                authority: ctx.accounts.vau_processor.to_account_info(),
            },
            &[processor_seeds],
        ),
        claimable_amount,
    )?;
    
    emit!(ProcessorFeesClaimed {
        amount: claimable_amount,
        treasury: ctx.accounts.treasury.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

#[event]
pub struct ProcessorFeesClaimed {
    pub amount: u64,
    pub treasury: Pubkey,
    pub timestamp: i64,
}