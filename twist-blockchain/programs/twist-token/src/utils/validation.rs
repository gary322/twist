use anchor_lang::prelude::*;
use crate::errors::TwistError;
use crate::constants::*;

pub fn validate_amount(amount: u64) -> Result<()> {
    require!(amount > 0, TwistError::InvalidAmount);
    Ok(())
}

pub fn validate_lock_period(lock_period: i64) -> Result<()> {
    require!(
        lock_period >= MIN_STAKE_PERIOD && lock_period <= MAX_STAKE_PERIOD,
        TwistError::InvalidLockPeriod
    );
    Ok(())
}

pub fn validate_oracle_staleness(last_update: i64, current_time: i64) -> Result<()> {
    require!(
        current_time - last_update <= ORACLE_STALENESS_THRESHOLD,
        TwistError::OracleStale
    );
    Ok(())
}

pub fn validate_authority(signer: &Pubkey, expected: &Pubkey) -> Result<()> {
    require!(
        signer == expected,
        TwistError::Unauthorized
    );
    Ok(())
}