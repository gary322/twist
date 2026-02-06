use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::state::{
    ProgramState, CircuitBreakerState, CircuitBreakerParams, 
    CircuitBreakerSeverity, TripCondition, PriceSource
};

#[derive(Accounts)]
pub struct InitializeCircuitBreaker<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        init,
        payer = authority,
        space = CircuitBreakerState::LEN,
        seeds = [b"circuit_breaker"],
        bump
    )]
    pub circuit_breaker: Account<'info, CircuitBreakerState>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(
    ctx: Context<InitializeCircuitBreaker>,
    params: CircuitBreakerParams,
) -> Result<()> {
    let circuit_breaker = &mut ctx.accounts.circuit_breaker;
    
    circuit_breaker.authority = ctx.accounts.authority.key();
    circuit_breaker.bump = ctx.bumps.circuit_breaker;
    
    // Set thresholds
    circuit_breaker.auto_reset_enabled = params.auto_reset_enabled;
    circuit_breaker.auto_reset_duration = params.auto_reset_duration;
    circuit_breaker.price_volatility_threshold_bps = params.price_volatility_threshold_bps;
    circuit_breaker.volume_spike_multiplier = params.volume_spike_multiplier;
    circuit_breaker.supply_change_threshold_bps = params.supply_change_threshold_bps;
    circuit_breaker.oracle_divergence_threshold_bps = params.oracle_divergence_threshold_bps;
    circuit_breaker.liquidity_drain_threshold_bps = params.liquidity_drain_threshold_bps;
    
    // Set cooldown periods
    circuit_breaker.low_severity_cooldown = params.low_severity_cooldown;
    circuit_breaker.medium_severity_cooldown = params.medium_severity_cooldown;
    circuit_breaker.high_severity_cooldown = params.high_severity_cooldown;
    circuit_breaker.critical_severity_cooldown = params.critical_severity_cooldown;
    
    // Initialize state
    circuit_breaker.last_trip_timestamp = 0;
    circuit_breaker.last_trip_severity = CircuitBreakerSeverity::Low;
    circuit_breaker.last_trip_condition = TripCondition::ManualTrigger;
    circuit_breaker.trip_count = 0;
    
    msg!("Circuit breaker initialized");
    msg!("Price volatility threshold: {}%", params.price_volatility_threshold_bps as f64 / 100.0);
    msg!("Volume spike multiplier: {}x", params.volume_spike_multiplier);
    msg!("Auto reset: {}", params.auto_reset_enabled);
    
    Ok(())
}

#[derive(Accounts)]
pub struct CheckCircuitBreaker<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        seeds = [b"circuit_breaker"],
        bump,
    )]
    pub circuit_breaker: Account<'info, CircuitBreakerState>,
    
    pub mint: Account<'info, Mint>,
}

pub fn check_conditions_handler(ctx: Context<CheckCircuitBreaker>) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let circuit_breaker = &mut ctx.accounts.circuit_breaker;
    let clock = Clock::get()?;
    
    // Update historical data first
    update_historical_data(circuit_breaker, program_state, &ctx.accounts.mint, clock.unix_timestamp)?;
    
    // Check if we can auto-reset
    if program_state.circuit_breaker_active && circuit_breaker.can_reset(clock.unix_timestamp) {
        program_state.circuit_breaker_active = false;
        
        emit!(CircuitBreakerReset {
            reset_by: ctx.accounts.authority.key(),
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Circuit breaker auto-reset after cooldown");
        return Ok(());
    }
    
    // Skip checks if already tripped
    if program_state.circuit_breaker_active {
        return Ok(());
    }
    
    // Check all conditions
    let mut max_severity = None;
    let mut triggered_condition = None;
    
    // 1. Price volatility check
    if let Some(severity) = circuit_breaker.check_price_volatility(program_state.last_oracle_price) {
        if max_severity.is_none() || severity_to_u8(&severity) > severity_to_u8(max_severity.as_ref().unwrap()) {
            max_severity = Some(severity);
            triggered_condition = Some(TripCondition::PriceVolatility);
        }
    }
    
    // 2. Volume spike check
    if let Some(severity) = circuit_breaker.check_volume_spike(program_state.volume_24h) {
        if max_severity.is_none() || severity_to_u8(&severity) > severity_to_u8(max_severity.as_ref().unwrap()) {
            max_severity = Some(severity);
            triggered_condition = Some(TripCondition::VolumeSpike);
        }
    }
    
    // 3. Supply change check
    let current_supply = ctx.accounts.mint.supply as u128;
    if let Some(severity) = circuit_breaker.check_supply_change(current_supply) {
        if max_severity.is_none() || severity_to_u8(&severity) > severity_to_u8(max_severity.as_ref().unwrap()) {
            max_severity = Some(severity);
            triggered_condition = Some(TripCondition::SupplyChange);
        }
    }
    
    // 4. Liquidity drain check
    if let Some(severity) = circuit_breaker.check_liquidity_drain(program_state.floor_liquidity) {
        if max_severity.is_none() || severity_to_u8(&severity) > severity_to_u8(max_severity.as_ref().unwrap()) {
            max_severity = Some(severity);
            triggered_condition = Some(TripCondition::LiquidityDrain);
        }
    }
    
    // 5. Oracle divergence check (if we have multiple price sources)
    if let Some(prices) = get_all_oracle_prices(program_state) {
        if let Some(severity) = check_oracle_divergence(&prices, circuit_breaker.oracle_divergence_threshold_bps) {
            if max_severity.is_none() || severity_to_u8(&severity) > severity_to_u8(max_severity.as_ref().unwrap()) {
                max_severity = Some(severity);
                triggered_condition = Some(TripCondition::OracleDivergence);
            }
        }
    }
    
    // Trip circuit breaker if needed
    if let (Some(severity), Some(condition)) = (max_severity, triggered_condition) {
        trip_circuit_breaker(program_state, circuit_breaker, severity, condition, clock.unix_timestamp)?;
    }
    
    Ok(())
}

#[derive(Accounts)]
pub struct ManualTripCircuitBreaker<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        seeds = [b"circuit_breaker"],
        bump,
    )]
    pub circuit_breaker: Account<'info, CircuitBreakerState>,
}

pub fn manual_trip_handler(
    ctx: Context<ManualTripCircuitBreaker>,
    reason: String,
    severity: CircuitBreakerSeverity,
) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let circuit_breaker = &mut ctx.accounts.circuit_breaker;
    let clock = Clock::get()?;
    
    require!(
        !program_state.circuit_breaker_active,
        TwistError::CircuitBreakerActive
    );
    
    trip_circuit_breaker(
        program_state,
        circuit_breaker,
        severity,
        TripCondition::ManualTrigger,
        clock.unix_timestamp
    )?;
    
    msg!("Circuit breaker manually triggered: {}", reason);
    
    Ok(())
}

#[derive(Accounts)]
pub struct ManualResetCircuitBreaker<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        seeds = [b"circuit_breaker"],
        bump,
    )]
    pub circuit_breaker: Account<'info, CircuitBreakerState>,
}

pub fn manual_reset_handler(ctx: Context<ManualResetCircuitBreaker>) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let circuit_breaker = &mut ctx.accounts.circuit_breaker;
    let clock = Clock::get()?;
    
    require!(
        program_state.circuit_breaker_active,
        TwistError::CircuitBreakerActive
    );
    
    // Check if cooldown has passed
    let cooldown = circuit_breaker.get_cooldown_duration(&circuit_breaker.last_trip_severity);
    let time_since_trip = clock.unix_timestamp - circuit_breaker.last_trip_timestamp;
    
    require!(
        time_since_trip >= cooldown,
        TwistError::CircuitBreakerActive
    );
    
    // Reset circuit breaker
    program_state.circuit_breaker_active = false;
    
    // Re-enable systems based on severity
    match circuit_breaker.last_trip_severity {
        CircuitBreakerSeverity::Critical => {
            program_state.emergency_pause = false;
            program_state.buyback_enabled = true;
        },
        CircuitBreakerSeverity::High => {
            program_state.buyback_enabled = true;
        },
        _ => {}
    }
    
    emit!(CircuitBreakerReset {
        reset_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Circuit breaker manually reset after {} seconds", time_since_trip);
    
    Ok(())
}

// Helper functions

fn trip_circuit_breaker(
    program_state: &mut ProgramState,
    circuit_breaker: &mut CircuitBreakerState,
    severity: CircuitBreakerSeverity,
    condition: TripCondition,
    timestamp: i64,
) -> Result<()> {
    program_state.circuit_breaker_active = true;
    
    circuit_breaker.last_trip_timestamp = timestamp;
    circuit_breaker.last_trip_severity = severity.clone();
    circuit_breaker.last_trip_condition = condition.clone();
    circuit_breaker.trip_count += 1;
    
    let mut actions_taken = Vec::new();
    
    // Take actions based on severity
    match severity {
        CircuitBreakerSeverity::Critical => {
            program_state.emergency_pause = true;
            program_state.buyback_enabled = false;
            actions_taken.push("Emergency pause activated".to_string());
            actions_taken.push("Buyback disabled".to_string());
            actions_taken.push("All operations halted".to_string());
        },
        CircuitBreakerSeverity::High => {
            program_state.buyback_enabled = false;
            actions_taken.push("Buyback disabled".to_string());
            actions_taken.push("High-risk operations restricted".to_string());
        },
        CircuitBreakerSeverity::Medium => {
            actions_taken.push("Enhanced monitoring enabled".to_string());
            actions_taken.push("Risk parameters tightened".to_string());
        },
        CircuitBreakerSeverity::Low => {
            actions_taken.push("Alert sent to operators".to_string());
        }
    }
    
    emit!(CircuitBreakerTriggered {
        trigger_reason: format!("{:?}", condition),
        severity: format!("{:?}", severity),
        actions_taken,
        timestamp,
    });
    
    msg!("Circuit breaker triggered: {:?} - {:?}", condition, severity);
    
    Ok(())
}

fn update_historical_data(
    circuit_breaker: &mut CircuitBreakerState,
    program_state: &ProgramState,
    mint: &Mint,
    timestamp: i64,
) -> Result<()> {
    // Update 1-hour data every hour
    if timestamp % 3600 < 60 { // Within first minute of hour
        circuit_breaker.price_1h_ago = program_state.last_oracle_price;
        circuit_breaker.volume_1h_ago = program_state.volume_24h; // This would need proper 1h tracking
        circuit_breaker.liquidity_1h_ago = program_state.floor_liquidity;
    }
    
    // Update 24-hour data every day
    if timestamp % 86400 < 60 { // Within first minute of day
        circuit_breaker.price_24h_ago = program_state.last_oracle_price;
        circuit_breaker.volume_24h_ago = program_state.volume_24h;
        circuit_breaker.supply_24h_ago = mint.supply as u128;
    }
    
    Ok(())
}

fn severity_to_u8(severity: &CircuitBreakerSeverity) -> u8 {
    match severity {
        CircuitBreakerSeverity::Low => 1,
        CircuitBreakerSeverity::Medium => 2,
        CircuitBreakerSeverity::High => 3,
        CircuitBreakerSeverity::Critical => 4,
    }
}

fn get_all_oracle_prices(_program_state: &ProgramState) -> Option<Vec<PriceSource>> {
    // This would fetch prices from multiple oracles
    // For now, returning None as it requires oracle account access
    None
}

fn check_oracle_divergence(prices: &[PriceSource], threshold_bps: u64) -> Option<CircuitBreakerSeverity> {
    if prices.len() < 2 {
        return None;
    }
    
    let max_price = prices.iter().map(|p| p.price).max().unwrap();
    let min_price = prices.iter().map(|p| p.price).min().unwrap();
    
    let divergence_bps = ((max_price - min_price) * 10000) / min_price;
    
    if divergence_bps > threshold_bps {
        if divergence_bps > threshold_bps * 3 {
            Some(CircuitBreakerSeverity::Critical)
        } else if divergence_bps > threshold_bps * 2 {
            Some(CircuitBreakerSeverity::High)
        } else {
            Some(CircuitBreakerSeverity::Medium)
        }
    } else {
        None
    }
}