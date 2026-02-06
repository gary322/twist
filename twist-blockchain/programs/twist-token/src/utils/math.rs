use anchor_lang::prelude::*;
use crate::errors::TwistError;

pub fn safe_mul(a: u64, b: u64) -> Result<u64> {
    a.checked_mul(b).ok_or(TwistError::MathOverflow.into())
}

pub fn safe_div(a: u64, b: u64) -> Result<u64> {
    if b == 0 {
        return Err(TwistError::MathOverflow.into());
    }
    a.checked_div(b).ok_or(TwistError::MathOverflow.into())
}

pub fn safe_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or(TwistError::MathOverflow.into())
}

pub fn safe_sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b).ok_or(TwistError::MathOverflow.into())
}

pub fn calculate_percentage(amount: u64, bps: u64) -> Result<u64> {
    safe_div(safe_mul(amount, bps)?, 10000)
}