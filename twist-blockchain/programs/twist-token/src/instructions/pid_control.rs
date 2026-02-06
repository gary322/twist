use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount, MintTo, Burn};
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;

#[derive(Accounts)]
pub struct InitializePIDController<'info> {
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
        init,
        payer = authority,
        space = PIDControllerState::LEN,
        seeds = [b"pid_controller"],
        bump
    )]
    pub pid_controller: Account<'info, PIDControllerState>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(
    ctx: Context<InitializePIDController>,
    params: PIDControllerParams,
) -> Result<()> {
    let pid_controller = &mut ctx.accounts.pid_controller;
    
    // Initialize PID controller
    pid_controller.authority = ctx.accounts.authority.key();
    pid_controller.kp = params.kp;
    pid_controller.ki = params.ki;
    pid_controller.kd = params.kd;
    pid_controller.integral = 0;
    pid_controller.previous_error = 0;
    pid_controller.last_update_timestamp = 0;
    pid_controller.integral_min = params.integral_min;
    pid_controller.integral_max = params.integral_max;
    pid_controller.output_min = params.output_min;
    pid_controller.output_max = params.output_max;
    pid_controller.target_price = params.target_price;
    pid_controller.price_tolerance_bps = params.price_tolerance_bps;
    pid_controller.max_mint_rate_bps = params.max_mint_rate_bps;
    pid_controller.max_burn_rate_bps = params.max_burn_rate_bps;
    pid_controller.last_adjustment_timestamp = 0;
    pid_controller.adjustment_cooldown = params.adjustment_cooldown;
    pid_controller.total_minted = 0;
    pid_controller.total_burned = 0;
    pid_controller.adjustment_count = 0;
    pid_controller.last_adjustment_amount = 0;
    pid_controller.last_adjustment_type = AdjustmentType::None;
    pid_controller.bump = ctx.bumps.pid_controller;
    
    emit!(PIDControllerInitialized {
        authority: pid_controller.authority,
        kp: params.kp,
        ki: params.ki,
        kd: params.kd,
        target_price: params.target_price,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("PID Controller initialized");
    msg!("Gains: P={}, I={}, D={}", params.kp, params.ki, params.kd);
    msg!("Target price: ${}", params.target_price as f64 / 1e6);
    
    Ok(())
}

#[derive(Accounts)]
pub struct ExecutePIDControl<'info> {
    pub executor: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        seeds = [b"pid_controller"],
        bump = pid_controller.bump,
    )]
    pub pid_controller: Account<'info, PIDControllerState>,
    
    #[account(
        mut,
        constraint = mint.key() == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub mint: Account<'info, Mint>,
    
    /// Account to receive minted tokens or source for burned tokens
    #[account(
        mut,
        constraint = token_account.mint == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

pub fn execute_handler(ctx: Context<ExecutePIDControl>) -> Result<()> {
    let program_state = &ctx.accounts.program_state;
    let pid_controller = &mut ctx.accounts.pid_controller;
    let clock = Clock::get()?;
    
    // Check if circuit breaker is active
    require!(
        !program_state.circuit_breaker_active,
        TwistError::CircuitBreakerActive
    );
    
    require!(
        !program_state.emergency_pause,
        TwistError::EmergencyPauseActive
    );
    
    // Get current price (use last oracle price)
    let current_price = program_state.last_oracle_price;
    require!(
        current_price > 0,
        TwistError::InvalidOracleData
    );
    
    // Check oracle staleness
    require!(
        clock.unix_timestamp - program_state.last_oracle_update <= ORACLE_STALENESS_THRESHOLD * 2,
        TwistError::OracleStale
    );
    
    // Get current supply
    let current_supply = ctx.accounts.mint.supply as u128;
    
    // Calculate adjustment
    let adjustment = pid_controller.calculate_adjustment(
        current_price,
        current_supply,
        clock.unix_timestamp,
    )?;
    
    msg!("PID Control: {:?}", adjustment.adjustment_type);
    msg!("Amount: {}", adjustment.amount);
    msg!("Reason: {}", adjustment.reason);
    
    // Execute adjustment
    match adjustment.adjustment_type {
        AdjustmentType::Mint => {
            // Mint new tokens
            let seeds = &[PROGRAM_STATE_SEED, &[program_state.bump]];
            let signer_seeds = &[&seeds[..]];
            
            let cpi_accounts = MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.program_state.to_account_info(),
            };
            
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            
            anchor_spl::token::mint_to(cpi_ctx, adjustment.amount)?;
            
            emit!(PIDSupplyAdjusted {
                adjustment_type: "mint".to_string(),
                amount: adjustment.amount,
                old_supply: current_supply as u64,
                new_supply: current_supply as u64 + adjustment.amount,
                current_price,
                target_price: pid_controller.target_price,
                reason: adjustment.reason,
                timestamp: clock.unix_timestamp,
            });
        },
        AdjustmentType::Burn => {
            // Burn tokens
            let cpi_accounts = Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.executor.to_account_info(),
            };
            
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            
            anchor_spl::token::burn(cpi_ctx, adjustment.amount)?;
            
            emit!(PIDSupplyAdjusted {
                adjustment_type: "burn".to_string(),
                amount: adjustment.amount,
                old_supply: current_supply as u64,
                new_supply: current_supply as u64 - adjustment.amount,
                current_price,
                target_price: pid_controller.target_price,
                reason: adjustment.reason,
                timestamp: clock.unix_timestamp,
            });
        },
        AdjustmentType::None => {
            msg!("No adjustment needed");
        }
    }
    
    Ok(())
}

#[derive(Accounts)]
pub struct UpdatePIDParameters<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        seeds = [b"pid_controller"],
        bump = pid_controller.bump,
        constraint = pid_controller.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub pid_controller: Account<'info, PIDControllerState>,
}

pub fn update_parameters_handler(
    ctx: Context<UpdatePIDParameters>,
    params: PIDControllerParams,
) -> Result<()> {
    let pid_controller = &mut ctx.accounts.pid_controller;
    
    // Update parameters
    pid_controller.kp = params.kp;
    pid_controller.ki = params.ki;
    pid_controller.kd = params.kd;
    pid_controller.target_price = params.target_price;
    pid_controller.price_tolerance_bps = params.price_tolerance_bps;
    pid_controller.max_mint_rate_bps = params.max_mint_rate_bps;
    pid_controller.max_burn_rate_bps = params.max_burn_rate_bps;
    pid_controller.adjustment_cooldown = params.adjustment_cooldown;
    pid_controller.integral_min = params.integral_min;
    pid_controller.integral_max = params.integral_max;
    pid_controller.output_min = params.output_min;
    pid_controller.output_max = params.output_max;
    
    emit!(PIDParametersUpdated {
        kp: params.kp,
        ki: params.ki,
        kd: params.kd,
        target_price: params.target_price,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("PID parameters updated");
    
    Ok(())
}

#[derive(Accounts)]
pub struct ResetPIDController<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        seeds = [b"pid_controller"],
        bump = pid_controller.bump,
    )]
    pub pid_controller: Account<'info, PIDControllerState>,
}

pub fn reset_handler(ctx: Context<ResetPIDController>) -> Result<()> {
    let pid_controller = &mut ctx.accounts.pid_controller;
    
    pid_controller.reset();
    
    emit!(PIDControllerReset {
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("PID controller reset");
    
    Ok(())
}