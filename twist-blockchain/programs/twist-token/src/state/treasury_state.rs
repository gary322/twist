use anchor_lang::prelude::*;

#[account]
pub struct TreasuryState {
    pub authority: Pubkey,
    pub treasury_type: TreasuryType,
    pub token_account: Pubkey,
    pub usdc_account: Pubkey,
    pub total_received: u128,
    pub total_withdrawn: u128,
    pub total_used_for_buyback: u128,
    pub last_withdrawal: i64,
    pub withdrawal_limit_daily: u64,
    pub withdrawal_used_today: u64,
    pub last_limit_reset: i64,
    pub bump: u8,
}

impl TreasuryState {
    pub const LEN: usize = 8 + // discriminator
        32 + 1 + // authority + treasury_type
        32 + 32 + // token_account + usdc_account
        16 + 16 + 16 + // totals
        8 + 8 + 8 + 8 + // withdrawal info
        1; // bump
        
    pub fn can_withdraw(&self, amount: u64, current_timestamp: i64) -> bool {
        // Reset daily limit if needed
        let mut withdrawal_used = self.withdrawal_used_today;
        if current_timestamp - self.last_limit_reset >= 86400 {
            withdrawal_used = 0;
        }
        
        withdrawal_used + amount <= self.withdrawal_limit_daily
    }
    
    pub fn record_withdrawal(&mut self, amount: u64, current_timestamp: i64) {
        if current_timestamp - self.last_limit_reset >= 86400 {
            self.withdrawal_used_today = amount;
            self.last_limit_reset = current_timestamp;
        } else {
            self.withdrawal_used_today += amount;
        }
        
        self.total_withdrawn += amount as u128;
        self.last_withdrawal = current_timestamp;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum TreasuryType {
    Floor,
    Operations,
    Reserve,
}

#[account]
pub struct BuybackState {
    pub authority: Pubkey,
    pub enabled: bool,
    pub floor_price_threshold_bps: u64, // e.g., 9700 = 97%
    pub max_daily_amount: u64,
    pub daily_used: u64,
    pub last_reset: i64,
    pub total_bought_back: u128,
    pub total_burned: u128,
    pub last_execution: i64,
    pub min_interval: i64, // Minimum seconds between buybacks
    pub price_impact_threshold_bps: u64, // Max acceptable price impact
    pub bump: u8,
}

impl BuybackState {
    pub const LEN: usize = 8 + // discriminator
        32 + 1 + // authority + enabled
        8 + 8 + 8 + 8 + // limits and daily tracking
        16 + 16 + // totals
        8 + 8 + 8 + // timing and thresholds
        1; // bump
        
    pub fn can_execute(&self, current_timestamp: i64, current_price: u64, floor_price: u64) -> bool {
        if !self.enabled {
            return false;
        }
        
        // Check time constraint
        if current_timestamp - self.last_execution < self.min_interval {
            return false;
        }
        
        // Check price threshold
        let threshold_price = (floor_price * self.floor_price_threshold_bps) / 10000;
        if current_price > threshold_price {
            return false;
        }
        
        // Check daily limit (with reset)
        let daily_used = if current_timestamp - self.last_reset >= 86400 {
            0
        } else {
            self.daily_used
        };
        
        daily_used < self.max_daily_amount
    }
    
    pub fn calculate_buyback_amount(&self, floor_liquidity: u64, price_discount_bps: u64) -> u64 {
        // Base amount is 2% of floor liquidity
        let base_amount = floor_liquidity / 50;
        
        // Scale by price discount (max 3x at 2% discount)
        let multiplier = std::cmp::min(price_discount_bps / 100 + 100, 300);
        let scaled_amount = (base_amount as u128 * multiplier as u128 / 100) as u64;
        
        // Apply daily limit
        let daily_remaining = if Clock::get().unwrap().unix_timestamp - self.last_reset >= 86400 {
            self.max_daily_amount
        } else {
            self.max_daily_amount.saturating_sub(self.daily_used)
        };
        
        std::cmp::min(scaled_amount, daily_remaining)
    }
}