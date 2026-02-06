use anchor_lang::prelude::*;

use crate::state::StakeEntry;

/// Calculate the real APY accounting for token decay
pub fn calculate_decay_adjusted_apy(
    base_apy_bps: u64,
    decay_rate_bps: u64,
    lock_period_days: u64,
) -> Result<u64> {
    // Real APY = Base APY - Decay Rate
    // Since decay happens daily, we need to adjust the APY
    
    // Convert daily decay to annual decay
    // Annual decay = 1 - (1 - daily_decay)^365
    let daily_decay_factor = 10000 - decay_rate_bps;
    let annual_decay_factor = calculate_compound_factor(daily_decay_factor, 365)?;
    let annual_decay_bps = 10000 - annual_decay_factor;
    
    // Adjust APY based on lock period
    // Longer locks get decay protection bonus
    let decay_protection_multiplier = match lock_period_days {
        0..=30 => 10000,    // No protection
        31..=90 => 10500,   // 5% protection
        91..=180 => 11000,  // 10% protection
        181..=365 => 12000, // 20% protection
        _ => 13000,         // 30% protection for >1 year
    };
    
    // Calculate net APY
    let base_apy_adjusted = (base_apy_bps as u128 * decay_protection_multiplier as u128) / 10000;
    
    // Net APY should account for decay
    let net_apy_bps = if base_apy_adjusted > annual_decay_bps as u128 {
        (base_apy_adjusted - annual_decay_bps as u128) as u64
    } else {
        0 // If decay exceeds APY, effective yield is 0
    };
    
    Ok(net_apy_bps)
}

/// Calculate rewards for a stake entry accounting for decay
pub fn calculate_stake_rewards(
    stake: &StakeEntry,
    current_timestamp: i64,
    decay_rate_bps: u64,
) -> Result<u64> {
    // Time elapsed since last claim
    let time_elapsed = current_timestamp.saturating_sub(stake.last_claim_timestamp);
    if time_elapsed <= 0 {
        return Ok(0);
    }
    
    // Calculate decay-adjusted APY
    let lock_period_days = (stake.lock_period / 86400) as u64;
    let adjusted_apy_bps = calculate_decay_adjusted_apy(
        stake.apy_bps,
        decay_rate_bps,
        lock_period_days,
    )?;
    
    // Calculate rewards
    // rewards = principal * (apy / 365 days) * days_elapsed
    let days_elapsed = time_elapsed as u128 / 86400;
    let annual_rate = adjusted_apy_bps as u128;
    
    let rewards = (stake.amount as u128)
        .checked_mul(annual_rate)
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_mul(days_elapsed)
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(10000) // basis points
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(365) // annual to daily
        .ok_or(ProgramError::ArithmeticOverflow)?;
    
    Ok(rewards as u64)
}

/// Calculate the optimal stake duration based on decay rate
pub fn calculate_optimal_stake_duration(
    decay_rate_bps: u64,
    risk_tolerance: RiskTolerance,
) -> u64 {
    // Higher decay rate = longer optimal stake duration
    let base_days = match risk_tolerance {
        RiskTolerance::Conservative => 180, // 6 months base
        RiskTolerance::Moderate => 90,      // 3 months base
        RiskTolerance::Aggressive => 30,    // 1 month base
    };
    
    // Adjust based on decay rate
    // Higher decay = multiply duration
    let decay_multiplier = if decay_rate_bps > 50 {
        150 // 1.5x for high decay
    } else if decay_rate_bps > 25 {
        125 // 1.25x for medium decay
    } else {
        100 // 1x for low decay
    };
    
    (base_days * decay_multiplier) / 100
}

/// Calculate break-even point where staking rewards offset decay
pub fn calculate_breakeven_apy(decay_rate_bps: u64) -> Result<u64> {
    // Convert daily decay to annual
    let daily_decay_factor = 10000 - decay_rate_bps;
    let annual_decay_factor = calculate_compound_factor(daily_decay_factor, 365)?;
    let annual_decay_bps = 10000 - annual_decay_factor;
    
    // Break-even APY must equal annual decay rate
    // Add 10% buffer for fees and slippage
    let breakeven_apy = (annual_decay_bps * 110) / 100;
    
    Ok(breakeven_apy)
}

/// Calculate compound factor for daily rates
fn calculate_compound_factor(daily_factor_bps: u64, days: u32) -> Result<u64> {
    // Use approximation for compound interest
    // (1 + r)^n ≈ 1 + n*r + (n*(n-1)*r^2)/2 for small r
    
    let r = daily_factor_bps as i64 - 10000; // Convert to rate
    let n = days as i64;
    
    // First order: n * r
    let first_order = n.checked_mul(r).ok_or(ProgramError::ArithmeticOverflow)?;
    
    // Second order: (n * (n-1) * r^2) / 2
    let r_squared = r.checked_mul(r).ok_or(ProgramError::ArithmeticOverflow)? / 10000;
    let n_factor = n.checked_mul(n - 1).ok_or(ProgramError::ArithmeticOverflow)? / 2;
    let second_order = n_factor.checked_mul(r_squared).ok_or(ProgramError::ArithmeticOverflow)? / 10000;
    
    // Result = 10000 + first_order + second_order
    let result = 10000i64
        .checked_add(first_order)
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_add(second_order)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    
    Ok(result.max(0) as u64)
}

/// Risk tolerance levels for stake duration calculations
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum RiskTolerance {
    Conservative,
    Moderate,
    Aggressive,
}

/// Calculate total portfolio value including stakes
pub fn calculate_portfolio_value(
    liquid_balance: u64,
    stakes: &[StakeEntry],
    current_timestamp: i64,
    decay_rate_bps: u64,
) -> Result<u64> {
    let mut total_value = liquid_balance;
    
    for stake in stakes {
        // Add principal
        total_value = total_value.saturating_add(stake.amount);
        
        // Add unclaimed rewards
        let rewards = calculate_stake_rewards(stake, current_timestamp, decay_rate_bps)?;
        total_value = total_value.saturating_add(rewards);
    }
    
    Ok(total_value)
}

/// Calculate effective yield after fees
pub fn calculate_net_yield(
    gross_apy_bps: u64,
    protocol_fee_bps: u64,
    withdrawal_fee_bps: u64,
    compound_frequency_days: u64,
) -> Result<u64> {
    // Deduct protocol fee from gross APY
    let after_protocol_fee = gross_apy_bps.saturating_sub(protocol_fee_bps);
    
    // Account for withdrawal fee impact based on compound frequency
    // More frequent compounds = more withdrawal fee impact
    let annual_compounds = 365 / compound_frequency_days.max(1);
    let total_withdrawal_fees = withdrawal_fee_bps.saturating_mul(annual_compounds);
    
    // Net yield
    let net_yield = after_protocol_fee.saturating_sub(total_withdrawal_fees);
    
    Ok(net_yield)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decay_adjusted_apy() {
        // 10 bps daily decay (0.1%), 5000 bps (50%) base APY, 90 day lock
        // With 90 day lock, we get 5% protection bonus (multiplier = 10500)
        // Adjusted base APY = 5000 * 1.05 = 5250 bps
        let apy = calculate_decay_adjusted_apy(5000, 10, 90).unwrap();
        assert!(apy < 5250); // Should be less than adjusted base due to decay
        assert!(apy > 0); // Should still be positive for reasonable rates
        
        // Test with higher APY to ensure positive result
        let apy2 = calculate_decay_adjusted_apy(10000, 10, 180).unwrap();
        assert!(apy2 > 0); // 100% APY with 180 day lock should overcome 0.1% daily decay
    }

    #[test]
    fn test_breakeven_calculation() {
        // 10 bps daily decay (0.1%)
        let breakeven = calculate_breakeven_apy(10).unwrap();
        
        // For 0.1% daily decay, annual decay is approximately 30.5%
        // Break-even with 10% buffer should be around 33.5% = 3350 bps
        assert!(breakeven > 3000); // Should be at least 30%
        assert!(breakeven < 5000); // But not unreasonably high
        
        // Test with smaller decay
        let breakeven2 = calculate_breakeven_apy(5).unwrap();
        assert!(breakeven2 > 1500); // 0.05% daily ≈ 16.7% annual
        assert!(breakeven2 < 2500);
    }
}