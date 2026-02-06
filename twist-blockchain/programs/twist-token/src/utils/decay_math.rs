use anchor_lang::prelude::*;

pub fn calculate_compound_decay(
    initial_amount: u64,
    decay_rate_bps: u64,
    periods: u64,
) -> Result<u64> {
    // Using integer math to avoid floating point
    let mut remaining = initial_amount;
    let rate_complement = 10000 - decay_rate_bps;
    
    for _ in 0..periods {
        remaining = (remaining as u128 * rate_complement as u128 / 10000) as u64;
    }
    
    Ok(initial_amount - remaining)
}

pub fn calculate_time_weighted_balance(
    balance: u64,
    start_time: i64,
    end_time: i64,
    current_time: i64,
) -> Result<u64> {
    if current_time < start_time {
        return Ok(0);
    }
    
    let elapsed = std::cmp::min(current_time - start_time, end_time - start_time);
    let total_period = end_time - start_time;
    
    if total_period <= 0 {
        return Ok(balance);
    }
    
    Ok((balance as u128 * elapsed as u128 / total_period as u128) as u64)
}