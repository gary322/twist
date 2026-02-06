use anchor_lang::prelude::*;
use crate::errors::TwistError;

pub fn calculate_staking_rewards(
    stake_amount: u64,
    apy_bps: u64,
    time_elapsed_seconds: i64,
) -> Result<u64> {
    // Implementation for reward calculations
    let annual_reward = (stake_amount as u128)
        .checked_mul(apy_bps as u128)
        .ok_or(TwistError::MathOverflow)?
        .checked_div(10000)
        .ok_or(TwistError::MathOverflow)?;
        
    let reward = annual_reward
        .checked_mul(time_elapsed_seconds as u128)
        .ok_or(TwistError::MathOverflow)?
        .checked_div(365 * 86400)
        .ok_or(TwistError::MathOverflow)?;
        
    Ok(reward as u64)
}