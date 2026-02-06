use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;

#[derive(Accounts)]
pub struct UpdateOracle<'info> {
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
    
    /// CHECK: Switchboard feed account (optional for this instruction)
    pub switchboard_feed: Option<AccountInfo<'info>>,
}

pub fn handler(ctx: Context<UpdateOracle>) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Check if circuit breaker is active
    require!(
        !program_state.circuit_breaker_active,
        TwistError::CircuitBreakerActive
    );
    
    // For now, we'll use a simplified oracle update that validates the account
    // In production, this would use the full Pyth SDK integration
    
    // Validate that the pyth account is the expected one
    require!(
        ctx.accounts.pyth_price_account.key() == program_state.pyth_price_feed,
        TwistError::InvalidOracle
    );
    
    // TODO: Integrate actual Pyth price feed parsing
    // For now, we'll use a mock price for testing
    // In production, this would parse the Pyth account data
    let mock_price = 50000; // $0.05 in 6 decimals
    let mock_confidence = 100; // $0.0001 confidence
    let mock_publish_time = clock.unix_timestamp - 10; // 10 seconds ago
    
    // Check staleness
    require!(
        clock.unix_timestamp - mock_publish_time <= ORACLE_STALENESS_THRESHOLD,
        TwistError::OracleStale
    );
    
    // Check confidence threshold
    require!(
        mock_confidence <= ORACLE_CONFIDENCE_THRESHOLD,
        TwistError::OracleConfidenceTooLow
    );
    
    // Update program state with new oracle price
    let old_price = program_state.last_oracle_price;
    program_state.last_oracle_price = mock_price;
    program_state.last_oracle_update = clock.unix_timestamp;
    
    // Calculate price change for monitoring
    let price_change_bps = if old_price > 0 {
        let change = if mock_price > old_price {
            ((mock_price - old_price) * 10000) / old_price
        } else {
            ((old_price - mock_price) * 10000) / old_price
        };
        change as i64
    } else {
        0
    };
    
    // Emit oracle update event
    emit!(OracleUpdated {
        oracle_type: OracleType::Pyth,
        old_price,
        new_price: mock_price,
        confidence: mock_confidence,
        price_change_bps,
        timestamp: clock.unix_timestamp,
        publish_time: mock_publish_time,
    });
    
    msg!("Oracle updated successfully");
    msg!("Price: ${}", mock_price as f64 / 1e6);
    msg!("Confidence: ±${}", mock_confidence as f64 / 1e6);
    msg!("Price change: {}bps", price_change_bps);
    
    Ok(())
}