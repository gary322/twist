use anchor_lang::prelude::*;
use crate::utils::{safe_sub, safe_mul, safe_div};

#[account]
pub struct VestingSchedule {
    pub authority: Pubkey,
    pub beneficiary: Pubkey,
    pub mint: Pubkey,
    pub total_amount: u64,
    pub released_amount: u64,
    pub start_timestamp: i64,
    pub cliff_timestamp: i64,
    pub end_timestamp: i64,
    pub revocable: bool,
    pub revoked: bool,
    pub bump: u8,
}

impl VestingSchedule {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // beneficiary
        32 + // mint
        8 + // total_amount
        8 + // released_amount
        8 + // start_timestamp
        8 + // cliff_timestamp
        8 + // end_timestamp
        1 + // revocable
        1 + // revoked
        1 + // bump
        7; // padding for alignment
    
    /// Calculate the amount that has vested up to the given timestamp
    pub fn calculate_vested_amount(&self, current_timestamp: i64) -> Result<u64> {
        // If revoked, no more vesting
        if self.revoked {
            return Ok(self.released_amount);
        }
        
        // Before cliff, nothing is vested
        if current_timestamp < self.cliff_timestamp {
            return Ok(0);
        }
        
        // After end, everything is vested
        if current_timestamp >= self.end_timestamp {
            return Ok(self.total_amount);
        }
        
        // Linear vesting between cliff and end
        let time_since_cliff = safe_sub(
            current_timestamp as u64,
            self.cliff_timestamp as u64
        )?;
        
        let total_vesting_period = safe_sub(
            self.end_timestamp as u64,
            self.cliff_timestamp as u64
        )?;
        
        // Calculate proportional vested amount
        let vested_proportion = safe_mul(self.total_amount, time_since_cliff)?;
        let vested_amount = safe_div(vested_proportion, total_vesting_period)?;
        
        Ok(vested_amount)
    }
    
    /// Calculate the amount that can be released (vested - already released)
    pub fn calculate_releasable_amount(&self, current_timestamp: i64) -> Result<u64> {
        let vested = self.calculate_vested_amount(current_timestamp)?;
        safe_sub(vested, self.released_amount)
    }
}