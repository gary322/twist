use anchor_lang::prelude::*;

#[account]
pub struct StakeState {
    pub owner: Pubkey,
    pub bump: u8,
    pub stake_index: u64,
    pub total_staked: u64,
    pub total_earned: u128,
    pub stakes: Vec<StakeEntry>,
    pub is_initialized: bool,
}

impl StakeState {
    pub const MAX_STAKES: usize = 10;
    pub const LEN: usize = 8 + // discriminator
        32 + 1 + // owner + bump
        8 + 8 + 16 + // stake_index + total_staked + total_earned
        4 + (StakeEntry::LEN * Self::MAX_STAKES) + // vec length + entries
        1; // is_initialized
        
    pub fn add_stake(&mut self, entry: StakeEntry) -> Result<()> {
        require!(
            self.stakes.len() < Self::MAX_STAKES,
            crate::errors::TwistError::InvalidAmount
        );
        self.stakes.push(entry);
        Ok(())
    }
    
    pub fn get_unlocked_stakes(&self, current_timestamp: i64) -> Vec<(usize, &StakeEntry)> {
        self.stakes
            .iter()
            .enumerate()
            .filter(|(_, stake)| {
                !stake.withdrawn && 
                current_timestamp >= stake.start_timestamp + stake.lock_period
            })
            .collect()
    }
    
    pub fn calculate_rewards(&self, stake_index: usize, current_timestamp: i64) -> Result<u64> {
        let stake = self.stakes
            .get(stake_index)
            .ok_or(crate::errors::TwistError::InvalidAmount)?;
            
        if stake.withdrawn {
            return Ok(0);
        }
        
        let time_elapsed = current_timestamp - stake.last_claim_timestamp;
        let annual_reward = (stake.amount as u128)
            .checked_mul(stake.apy_bps as u128)
            .ok_or(crate::errors::TwistError::MathOverflow)?
            .checked_div(10000)
            .ok_or(crate::errors::TwistError::MathOverflow)?;
            
        let reward = annual_reward
            .checked_mul(time_elapsed as u128)
            .ok_or(crate::errors::TwistError::MathOverflow)?
            .checked_div(365 * 86400)
            .ok_or(crate::errors::TwistError::MathOverflow)?;
            
        Ok(reward as u64)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StakeEntry {
    pub amount: u64,
    pub start_timestamp: i64,
    pub lock_period: i64,
    pub apy_bps: u64,
    pub last_claim_timestamp: i64,
    pub total_earned: u64,
    pub withdrawn: bool,
}

impl StakeEntry {
    pub const LEN: usize = 8 + 8 + 8 + 8 + 8 + 8 + 1; // 57 bytes
    
    pub fn is_unlocked(&self, current_timestamp: i64) -> bool {
        current_timestamp >= self.start_timestamp + self.lock_period
    }
    
    pub fn calculate_early_unstake_penalty(&self, current_timestamp: i64) -> u64 {
        if self.is_unlocked(current_timestamp) {
            return 0;
        }
        
        let time_remaining = (self.start_timestamp + self.lock_period) - current_timestamp;
        let penalty_rate = match self.lock_period {
            period if period >= 365 * 86400 => 2000, // 20% penalty for 365 days
            period if period >= 180 * 86400 => 1500, // 15% penalty for 180 days
            period if period >= 90 * 86400 => 1000,  // 10% penalty for 90 days
            _ => 500, // 5% penalty for 30 days
        };
        
        // Scale penalty based on time remaining
        let time_ratio = (time_remaining as u128 * 10000) / self.lock_period as u128;
        let scaled_penalty = (penalty_rate as u128 * time_ratio) / 10000;
        
        ((self.amount as u128 * scaled_penalty) / 10000) as u64
    }
}