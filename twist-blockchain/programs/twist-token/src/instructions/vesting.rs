use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::utils::{safe_add, safe_sub};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VestingParams {
    pub total_amount: u64,
    pub start_timestamp: i64,
    pub cliff_timestamp: i64,
    pub end_timestamp: i64,
    pub revocable: bool,
}

#[derive(Accounts)]
#[instruction(params: VestingParams)]
pub struct CreateVestingSchedule<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Beneficiary can be any valid pubkey
    pub beneficiary: AccountInfo<'info>,
    
    #[account(
        init,
        payer = authority,
        space = VestingSchedule::LEN,
        seeds = [VESTING_SEED, beneficiary.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,
    
    #[account(
        mut,
        token::mint = mint,
        token::authority = authority,
        constraint = source_token_account.amount >= params.total_amount @ TwistError::InsufficientLiquidity
    )]
    pub source_token_account: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = vesting_schedule,
        seeds = [VESTING_VAULT_SEED, vesting_schedule.key().as_ref()],
        bump
    )]
    pub vesting_vault: Account<'info, TokenAccount>,
    
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ReleaseVestedTokens<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    
    #[account(
        mut,
        seeds = [VESTING_SEED, beneficiary.key().as_ref(), vesting_schedule.authority.as_ref()],
        bump = vesting_schedule.bump,
        constraint = vesting_schedule.beneficiary == beneficiary.key() @ TwistError::Unauthorized,
        constraint = !vesting_schedule.revoked @ TwistError::VestingAlreadyRevoked
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,
    
    #[account(
        mut,
        seeds = [VESTING_VAULT_SEED, vesting_schedule.key().as_ref()],
        bump,
        token::mint = vesting_schedule.mint,
        token::authority = vesting_schedule,
    )]
    pub vesting_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = vesting_schedule.mint,
        token::authority = beneficiary,
    )]
    pub beneficiary_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RevokeVesting<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [VESTING_SEED, vesting_schedule.beneficiary.as_ref(), authority.key().as_ref()],
        bump = vesting_schedule.bump,
        constraint = vesting_schedule.authority == authority.key() @ TwistError::Unauthorized,
        constraint = vesting_schedule.revocable @ TwistError::VestingNotRevocable,
        constraint = !vesting_schedule.revoked @ TwistError::VestingAlreadyRevoked
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,
    
    #[account(
        mut,
        seeds = [VESTING_VAULT_SEED, vesting_schedule.key().as_ref()],
        bump,
        token::mint = vesting_schedule.mint,
        token::authority = vesting_schedule,
    )]
    pub vesting_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = vesting_schedule.mint,
        token::authority = authority,
    )]
    pub authority_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

pub fn create_handler(
    ctx: Context<CreateVestingSchedule>,
    params: VestingParams,
) -> Result<()> {
    let vesting_schedule = &mut ctx.accounts.vesting_schedule;
    let clock = Clock::get()?;
    
    // Validate parameters
    require!(
        params.start_timestamp >= clock.unix_timestamp,
        TwistError::InvalidStartTime
    );
    require!(
        params.cliff_timestamp >= params.start_timestamp,
        TwistError::InvalidCliffTime
    );
    require!(
        params.end_timestamp > params.cliff_timestamp,
        TwistError::InvalidEndTime
    );
    require!(
        params.total_amount > 0,
        TwistError::InvalidAmount
    );
    
    // Initialize vesting schedule
    vesting_schedule.authority = ctx.accounts.authority.key();
    vesting_schedule.beneficiary = ctx.accounts.beneficiary.key();
    vesting_schedule.mint = ctx.accounts.mint.key();
    vesting_schedule.total_amount = params.total_amount;
    vesting_schedule.released_amount = 0;
    vesting_schedule.start_timestamp = params.start_timestamp;
    vesting_schedule.cliff_timestamp = params.cliff_timestamp;
    vesting_schedule.end_timestamp = params.end_timestamp;
    vesting_schedule.revocable = params.revocable;
    vesting_schedule.revoked = false;
    vesting_schedule.bump = ctx.bumps.vesting_schedule;
    
    // Transfer tokens to vesting vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.source_token_account.to_account_info(),
        to: ctx.accounts.vesting_vault.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, params.total_amount)?;
    
    // Emit event
    emit!(VestingScheduleCreated {
        beneficiary: vesting_schedule.beneficiary,
        total_amount: params.total_amount,
        start_timestamp: params.start_timestamp,
        cliff_timestamp: params.cliff_timestamp,
        end_timestamp: params.end_timestamp,
        revocable: params.revocable,
    });
    
    msg!("Created vesting schedule for {}", vesting_schedule.beneficiary);
    msg!("Total amount: {} TWIST", params.total_amount as f64 / 10f64.powf(DECIMALS as f64));
    msg!("Cliff date: {}", params.cliff_timestamp);
    msg!("End date: {}", params.end_timestamp);
    
    Ok(())
}

pub fn release_handler(ctx: Context<ReleaseVestedTokens>) -> Result<()> {
    let vesting_schedule = &mut ctx.accounts.vesting_schedule;
    let clock = Clock::get()?;
    
    // Check if cliff has been reached
    require!(
        clock.unix_timestamp >= vesting_schedule.cliff_timestamp,
        TwistError::VestingNotStarted
    );
    
    // Calculate vested amount
    let vested_amount = vesting_schedule.calculate_vested_amount(clock.unix_timestamp)?;
    let releasable_amount = safe_sub(vested_amount, vesting_schedule.released_amount)?;
    
    // Check if there's anything to release
    require!(
        releasable_amount > 0,
        TwistError::NoRewardsToClaim
    );
    
    // Get values needed for event and seeds before updating state
    let beneficiary = vesting_schedule.beneficiary;
    let authority = vesting_schedule.authority;
    let bump = vesting_schedule.bump;
    let total_amount = vesting_schedule.total_amount;
    
    // Update released amount
    vesting_schedule.released_amount = safe_add(
        vesting_schedule.released_amount,
        releasable_amount
    )?;
    
    // Get the new released amount for event
    let new_released_amount = vesting_schedule.released_amount;
    
    // Release mutable reference before creating immutable ones
    
    // Create signer seeds
    let seeds = &[
        VESTING_SEED,
        beneficiary.as_ref(),
        authority.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    // Transfer vested tokens to beneficiary
    let cpi_accounts = Transfer {
        from: ctx.accounts.vesting_vault.to_account_info(),
        to: ctx.accounts.beneficiary_token_account.to_account_info(),
        authority: ctx.accounts.vesting_schedule.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::transfer(cpi_ctx, releasable_amount)?;
    
    // Emit event
    emit!(VestingTokensReleased {
        beneficiary,
        amount: releasable_amount,
        remaining_vested: safe_sub(total_amount, new_released_amount)?,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Released {} TWIST tokens", releasable_amount as f64 / 10f64.powf(DECIMALS as f64));
    msg!("Total released: {} / {} TWIST", 
        new_released_amount as f64 / 10f64.powf(DECIMALS as f64),
        total_amount as f64 / 10f64.powf(DECIMALS as f64)
    );
    
    Ok(())
}

pub fn revoke_handler(ctx: Context<RevokeVesting>) -> Result<()> {
    let vesting_schedule = &mut ctx.accounts.vesting_schedule;
    let clock = Clock::get()?;
    
    // Calculate vested amount before revocation
    let vested_amount = vesting_schedule.calculate_vested_amount(clock.unix_timestamp)?;
    let unvested_amount = safe_sub(vesting_schedule.total_amount, vested_amount)?;
    
    // Get values needed for seeds and event before marking as revoked
    let beneficiary = vesting_schedule.beneficiary;
    let authority = vesting_schedule.authority;
    let bump = vesting_schedule.bump;
    
    // Mark as revoked
    vesting_schedule.revoked = true;
    
    // Release mutable reference before creating immutable ones
    
    // If there are unvested tokens, return them to authority
    if unvested_amount > 0 {
        // Create signer seeds
        let seeds = &[
            VESTING_SEED,
            beneficiary.as_ref(),
            authority.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];
        
        // Transfer unvested tokens back to authority
        let cpi_accounts = Transfer {
            from: ctx.accounts.vesting_vault.to_account_info(),
            to: ctx.accounts.authority_token_account.to_account_info(),
            authority: ctx.accounts.vesting_schedule.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        token::transfer(cpi_ctx, unvested_amount)?;
    }
    
    // Emit event
    emit!(VestingRevoked {
        beneficiary,
        amount_returned: unvested_amount,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Revoked vesting schedule for {}", beneficiary);
    msg!("Returned {} unvested TWIST tokens", unvested_amount as f64 / 10f64.powf(DECIMALS as f64));
    
    Ok(())
}