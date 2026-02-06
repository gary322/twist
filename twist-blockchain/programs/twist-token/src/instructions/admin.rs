use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct TriggerCircuitBreaker<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized,
    )]
    pub program_state: Account<'info, ProgramState>,
}

#[derive(Accounts)]
pub struct ResetCircuitBreaker<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized,
    )]
    pub program_state: Account<'info, ProgramState>,
}

#[derive(Accounts)]
pub struct SetEmergencyPause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized,
    )]
    pub program_state: Account<'info, ProgramState>,
}

#[derive(Accounts)]
pub struct UpdateParameters<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized,
        constraint = !program_state.circuit_breaker_active @ TwistError::CircuitBreakerActive,
        constraint = !program_state.emergency_pause @ TwistError::EmergencyPauseActive,
    )]
    pub program_state: Account<'info, ProgramState>,
}

#[derive(Accounts)]
pub struct UpdateOracles<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized,
        constraint = !program_state.emergency_pause @ TwistError::EmergencyPauseActive,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    /// CHECK: New Pyth price feed account
    pub new_pyth_feed: Option<AccountInfo<'info>>,
    
    /// CHECK: New Switchboard feed account  
    pub new_switchboard_feed: Option<AccountInfo<'info>>,
    
    /// CHECK: New Chainlink feed account
    pub new_chainlink_feed: Option<AccountInfo<'info>>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(mut)]
    pub current_authority: Signer<'info>,
    
    /// CHECK: New authority can be any valid pubkey
    pub new_authority: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == current_authority.key() @ TwistError::Unauthorized,
    )]
    pub program_state: Account<'info, ProgramState>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateParams {
    pub decay_rate_bps: Option<u64>,
    pub treasury_split_bps: Option<u64>,
    pub max_daily_buyback: Option<u64>,
    pub oracle_staleness_threshold: Option<i64>,
    pub buyback_enabled: Option<bool>,
}

pub fn trigger_circuit_breaker_handler(
    ctx: Context<TriggerCircuitBreaker>,
    reason: String,
) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    require!(
        !program_state.circuit_breaker_active,
        TwistError::CircuitBreakerActive
    );
    
    require!(
        !reason.is_empty() && reason.len() <= 200,
        TwistError::InvalidAmount
    );
    
    // Activate circuit breaker
    program_state.circuit_breaker_active = true;
    program_state.buyback_enabled = false;
    
    let actions_taken = vec![
        "Circuit breaker activated".to_string(),
        "Buyback disabled".to_string(),
        "High-risk operations restricted".to_string(),
    ];
    
    // Emit event
    emit!(CircuitBreakerTriggered {
        trigger_reason: reason.clone(),
        severity: "High".to_string(),
        actions_taken,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Circuit breaker triggered by admin: {}", reason);
    
    Ok(())
}

pub fn reset_circuit_breaker_handler(ctx: Context<ResetCircuitBreaker>) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    require!(
        program_state.circuit_breaker_active,
        TwistError::CircuitBreakerActive
    );
    
    // Reset circuit breaker
    program_state.circuit_breaker_active = false;
    program_state.buyback_enabled = true;
    
    // Emit event
    emit!(CircuitBreakerReset {
        reset_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Circuit breaker reset by admin");
    
    Ok(())
}

pub fn set_emergency_pause_handler(
    ctx: Context<SetEmergencyPause>,
    paused: bool,
    reason: String,
) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    require!(
        !reason.is_empty() && reason.len() <= 200,
        TwistError::InvalidAmount
    );
    
    if paused {
        require!(
            !program_state.emergency_pause,
            TwistError::EmergencyPauseActive
        );
        
        program_state.emergency_pause = true;
        program_state.buyback_enabled = false;
        
        emit!(EmergencyPauseActivated {
            activated_by: ctx.accounts.authority.key(),
            reason,
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Emergency pause activated");
    } else {
        require!(
            program_state.emergency_pause,
            TwistError::EmergencyPauseActive
        );
        
        program_state.emergency_pause = false;
        program_state.buyback_enabled = true;
        
        emit!(EmergencyPauseDeactivated {
            deactivated_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Emergency pause deactivated");
    }
    
    Ok(())
}

pub fn update_parameters_handler(
    ctx: Context<UpdateParameters>,
    params: UpdateParams,
) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Update decay rate
    if let Some(decay_rate_bps) = params.decay_rate_bps {
        require!(
            decay_rate_bps <= 100, // Max 1% daily decay
            TwistError::InvalidDecayRate
        );
        
        let old_value = program_state.decay_rate_bps;
        program_state.decay_rate_bps = decay_rate_bps;
        
        emit!(ParameterUpdated {
            parameter: "decay_rate_bps".to_string(),
            old_value: old_value.to_string(),
            new_value: decay_rate_bps.to_string(),
            updated_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Updated decay rate: {} -> {} bps", old_value, decay_rate_bps);
    }
    
    // Update treasury split
    if let Some(treasury_split_bps) = params.treasury_split_bps {
        require!(
            treasury_split_bps >= 7000 && treasury_split_bps <= 10000,
            TwistError::InvalidTreasurySplit
        );
        
        let old_value = program_state.treasury_split_bps;
        program_state.treasury_split_bps = treasury_split_bps;
        
        emit!(ParameterUpdated {
            parameter: "treasury_split_bps".to_string(),
            old_value: old_value.to_string(),
            new_value: treasury_split_bps.to_string(),
            updated_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Updated treasury split: {} -> {} bps", old_value, treasury_split_bps);
    }
    
    // Update max daily buyback
    if let Some(max_daily_buyback) = params.max_daily_buyback {
        require!(
            max_daily_buyback >= MIN_BUYBACK_AMOUNT && max_daily_buyback <= 1_000_000 * 1_000_000,
            TwistError::InvalidAmount
        );
        
        let old_value = program_state.max_daily_buyback;
        program_state.max_daily_buyback = max_daily_buyback;
        
        emit!(ParameterUpdated {
            parameter: "max_daily_buyback".to_string(),
            old_value: old_value.to_string(),
            new_value: max_daily_buyback.to_string(),
            updated_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Updated max daily buyback: ${} -> ${}", 
            old_value / 1_000_000, 
            max_daily_buyback / 1_000_000
        );
    }
    
    // Update buyback enabled
    if let Some(buyback_enabled) = params.buyback_enabled {
        let old_value = program_state.buyback_enabled;
        program_state.buyback_enabled = buyback_enabled;
        
        emit!(ParameterUpdated {
            parameter: "buyback_enabled".to_string(),
            old_value: old_value.to_string(),
            new_value: buyback_enabled.to_string(),
            updated_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Updated buyback enabled: {} -> {}", old_value, buyback_enabled);
    }
    
    Ok(())
}

pub fn update_oracles_handler(ctx: Context<UpdateOracles>) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Update Pyth feed
    if let Some(new_pyth_feed) = &ctx.accounts.new_pyth_feed {
        let old_feed = program_state.pyth_price_feed;
        program_state.pyth_price_feed = new_pyth_feed.key();
        
        emit!(ParameterUpdated {
            parameter: "pyth_price_feed".to_string(),
            old_value: old_feed.to_string(),
            new_value: new_pyth_feed.key().to_string(),
            updated_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Updated Pyth price feed");
    }
    
    // Update Switchboard feed
    if let Some(new_switchboard_feed) = &ctx.accounts.new_switchboard_feed {
        let old_feed = program_state.switchboard_feed;
        program_state.switchboard_feed = new_switchboard_feed.key();
        
        emit!(ParameterUpdated {
            parameter: "switchboard_feed".to_string(),
            old_value: old_feed.to_string(),
            new_value: new_switchboard_feed.key().to_string(),
            updated_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Updated Switchboard feed");
    }
    
    // Update Chainlink feed
    if let Some(new_chainlink_feed) = &ctx.accounts.new_chainlink_feed {
        let old_feed = program_state.chainlink_feed.map(|f| f.to_string()).unwrap_or_else(|| "None".to_string());
        program_state.chainlink_feed = Some(new_chainlink_feed.key());
        
        emit!(ParameterUpdated {
            parameter: "chainlink_feed".to_string(),
            old_value: old_feed,
            new_value: new_chainlink_feed.key().to_string(),
            updated_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Updated Chainlink feed");
    }
    
    // Reset last oracle update to force immediate update
    program_state.last_oracle_update = 0;
    
    msg!("Oracle feeds updated successfully");
    
    Ok(())
}

pub fn transfer_authority_handler(ctx: Context<TransferAuthority>) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    let old_authority = program_state.authority;
    let new_authority = ctx.accounts.new_authority.key();
    
    require!(
        old_authority != new_authority,
        TwistError::InvalidAccount
    );
    
    // Transfer authority
    program_state.authority = new_authority;
    
    emit!(ParameterUpdated {
        parameter: "authority".to_string(),
        old_value: old_authority.to_string(),
        new_value: new_authority.to_string(),
        updated_by: ctx.accounts.current_authority.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Authority transferred from {} to {}", old_authority, new_authority);
    
    Ok(())
}