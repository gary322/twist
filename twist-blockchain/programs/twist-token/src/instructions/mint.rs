use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, TokenAccount, MintTo};
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::TokensMinted;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MintParams {
    pub amount: u64,
    pub recipient: Pubkey,
}

#[derive(Accounts)]
#[instruction(params: MintParams)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        constraint = mint.key() == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        token::mint = mint,
        token::authority = recipient,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Recipient of minted tokens
    pub recipient: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<MintTokens>, params: MintParams) -> Result<()> {
    let program_state = &ctx.accounts.program_state;
    
    // Check emergency pause
    require!(
        !program_state.emergency_pause,
        TwistError::EmergencyPauseActive
    );
    
    // Check supply cap
    let current_supply = ctx.accounts.mint.supply;
    let new_supply = current_supply.checked_add(params.amount)
        .ok_or(TwistError::MathOverflow)?;
    
    require!(
        new_supply <= TOTAL_SUPPLY,
        TwistError::SupplyCapExceeded
    );
    
    // Create mint authority signer seeds
    let seeds = &[
        PROGRAM_STATE_SEED,
        &[program_state.bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    // Mint tokens
    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: ctx.accounts.program_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::mint_to(cpi_ctx, params.amount)?;
    
    // Emit event
    emit!(TokensMinted {
        amount: params.amount,
        recipient: params.recipient,
        new_supply,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Minted {} TWIST tokens to {}", 
        params.amount as f64 / 10f64.powf(DECIMALS as f64),
        params.recipient
    );
    
    Ok(())
}