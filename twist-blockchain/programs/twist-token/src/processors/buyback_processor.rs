use anchor_lang::prelude::*;
use crate::errors::TwistError;

pub fn get_aggregated_price(
    pyth_account: &AccountInfo,
    switchboard_account: &AccountInfo,
    chainlink_feed: Option<Pubkey>,
) -> Result<u64> {
    let mut prices = Vec::new();
    let clock = Clock::get()?;
    
    // Get Pyth price
    if let Ok(pyth_price) = get_pyth_price(pyth_account, clock.unix_timestamp) {
        prices.push(pyth_price);
    }
    
    // Get Switchboard price
    if let Ok(switchboard_price) = get_switchboard_price(switchboard_account, clock.unix_timestamp) {
        prices.push(switchboard_price);
    }
    
    // Get Chainlink price if available
    if chainlink_feed.is_some() {
        // TODO: Implement Chainlink price fetching
        // For now, we'll use Pyth and Switchboard only
    }
    
    // Require at least 2 price sources
    require!(
        prices.len() >= 2,
        TwistError::InvalidOracleFeed
    );
    
    // Check for price divergence
    let max_price = *prices.iter().max().unwrap();
    let min_price = *prices.iter().min().unwrap();
    let divergence_bps = ((max_price - min_price) * 10000) / min_price;
    
    require!(
        divergence_bps <= 200, // 2% max divergence
        TwistError::OracleDivergenceTooHigh
    );
    
    // Return average price
    let sum: u64 = prices.iter().sum();
    Ok(sum / prices.len() as u64)
}

fn get_pyth_price(
    _pyth_account: &AccountInfo,
    _current_timestamp: i64,
) -> Result<u64> {
    // For now, return a mock price until we properly integrate Pyth
    // TODO: Properly integrate Pyth price feeds
    msg!("Warning: Using mock Pyth price");
    Ok(50_000) // $0.05 USDC
}

fn get_switchboard_price(
    _switchboard_account: &AccountInfo,
    _current_timestamp: i64,
) -> Result<u64> {
    // TODO: Implement Switchboard price fetching
    // For now, return a mock price for testing
    Ok(50_000) // $0.05 USDC
}

pub fn calculate_buyback_amount(
    floor_liquidity: u64,
    current_price: u64,
    floor_price: u64,
    threshold_bps: u64,
) -> Result<u64> {
    // Implementation for buyback amount calculation
    let threshold_price = (floor_price * threshold_bps) / 10000;
    
    if current_price > threshold_price {
        return Ok(0);
    }
    
    let price_discount = ((threshold_price - current_price) * 10000) / threshold_price;
    let buyback_multiplier = std::cmp::min(price_discount / 100 + 100, 300);
    let base_buyback = floor_liquidity / 50;
    
    Ok((base_buyback * buyback_multiplier) / 100)
}