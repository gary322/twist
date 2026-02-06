use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;

#[derive(Accounts)]
pub struct UpdatePriceAggregated<'info> {
    pub updater: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    /// CHECK: Pyth price feed account
    #[account(
        constraint = pyth_price_account.key() == program_state.pyth_price_feed @ TwistError::InvalidOracle
    )]
    pub pyth_price_account: AccountInfo<'info>,
    
    /// CHECK: Switchboard feed account
    #[account(
        constraint = switchboard_feed.key() == program_state.switchboard_feed @ TwistError::InvalidOracle
    )]
    pub switchboard_feed: AccountInfo<'info>,
    
    /// CHECK: Chainlink feed account (optional)
    pub chainlink_feed: Option<AccountInfo<'info>>,
}

pub fn handler(ctx: Context<UpdatePriceAggregated>) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Check if circuit breaker is active
    require!(
        !program_state.circuit_breaker_active,
        TwistError::CircuitBreakerActive
    );
    
    let mut price_sources: Vec<PriceSource> = Vec::new();
    
    // Get Pyth price
    // TODO: Use actual Pyth SDK integration
    let pyth_price = 50000; // Mock: $0.05
    let pyth_confidence = 100;
    let pyth_timestamp = clock.unix_timestamp - 5;
    
    price_sources.push(PriceSource {
        oracle_type: OracleType::Pyth,
        price: pyth_price,
        confidence: pyth_confidence,
        timestamp: pyth_timestamp,
    });
    
    // Get Switchboard price
    let _switchboard_data = ctx.accounts.switchboard_feed.try_borrow_data()?;
    // TODO: Use actual Switchboard SDK to parse the aggregator result
    let switchboard_price = 49500; // Mock: $0.0495
    let switchboard_confidence = 150;
    let switchboard_timestamp = clock.unix_timestamp - 8;
    
    price_sources.push(PriceSource {
        oracle_type: OracleType::Switchboard,
        price: switchboard_price,
        confidence: switchboard_confidence,
        timestamp: switchboard_timestamp,
    });
    
    // Get Chainlink price if available
    if let Some(chainlink_account) = &ctx.accounts.chainlink_feed {
        if program_state.chainlink_feed.is_some() && 
           chainlink_account.key() == program_state.chainlink_feed.unwrap() {
            // TODO: Integrate Chainlink when available on Solana
            let chainlink_price = 50200; // Mock: $0.0502
            let chainlink_confidence = 80;
            let chainlink_timestamp = clock.unix_timestamp - 12;
            
            price_sources.push(PriceSource {
                oracle_type: OracleType::Chainlink,
                price: chainlink_price,
                confidence: chainlink_confidence,
                timestamp: chainlink_timestamp,
            });
        }
    }
    
    // Validate all prices are recent
    for source in &price_sources {
        require!(
            clock.unix_timestamp - source.timestamp <= ORACLE_STALENESS_THRESHOLD,
            TwistError::OracleStale
        );
    }
    
    // Calculate price divergence
    let prices: Vec<u64> = price_sources.iter().map(|s| s.price).collect();
    let max_price = *prices.iter().max().unwrap();
    let min_price = *prices.iter().min().unwrap();
    let divergence_bps = ((max_price - min_price) * 10000) / min_price;
    
    require!(
        divergence_bps <= ORACLE_DIVERGENCE_THRESHOLD_BPS,
        TwistError::OracleDivergenceTooHigh
    );
    
    // Calculate weighted average price based on confidence
    let mut weighted_sum: u128 = 0;
    let mut weight_sum: u128 = 0;
    
    for source in &price_sources {
        // Higher confidence = lower value = higher weight
        let weight = 10000u128 / (source.confidence as u128).max(1);
        weighted_sum += (source.price as u128) * weight;
        weight_sum += weight;
    }
    
    let aggregated_price = (weighted_sum / weight_sum) as u64;
    
    // Calculate average confidence
    let total_confidence: u64 = price_sources.iter().map(|s| s.confidence).sum();
    let avg_confidence = total_confidence / price_sources.len() as u64;
    
    // Update program state
    let old_price = program_state.last_oracle_price;
    program_state.last_oracle_price = aggregated_price;
    program_state.last_oracle_update = clock.unix_timestamp;
    
    // Calculate price change
    let price_change_bps = if old_price > 0 {
        if aggregated_price > old_price {
            ((aggregated_price - old_price) * 10000 / old_price) as i64
        } else {
            -(((old_price - aggregated_price) * 10000 / old_price) as i64)
        }
    } else {
        0
    };
    
    // Emit aggregated price update event
    emit!(AggregatedPriceUpdated {
        old_price,
        new_price: aggregated_price,
        avg_confidence,
        divergence_bps,
        price_sources: price_sources.len() as u8,
        price_change_bps,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Aggregated price updated successfully");
    msg!("Price: ${}", aggregated_price as f64 / 1e6);
    msg!("Sources: {}", price_sources.len());
    msg!("Divergence: {}bps", divergence_bps);
    msg!("Avg confidence: ±${}", avg_confidence as f64 / 1e6);
    
    Ok(())
}