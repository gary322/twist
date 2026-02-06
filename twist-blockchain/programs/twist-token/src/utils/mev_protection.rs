use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    clock::Clock,
    hash::hash,
};

use crate::errors::TwistError;

/// MEV protection mechanisms
pub struct MEVProtection;

impl MEVProtection {
    /// Validate transaction timing to prevent sandwich attacks
    pub fn validate_transaction_timing(
        clock: &Clock,
        last_transaction_slot: u64,
        min_slot_gap: u64,
    ) -> Result<()> {
        let current_slot = clock.slot;
        
        require!(
            current_slot >= last_transaction_slot + min_slot_gap,
            TwistError::InvalidAccount
        );
        
        Ok(())
    }
    
    /// Calculate dynamic fee based on transaction value and market conditions
    pub fn calculate_dynamic_fee(
        base_fee_bps: u64,
        transaction_value: u64,
        recent_volume: u128,
        price_volatility: u64,
    ) -> Result<u64> {
        // Base fee
        let mut fee_bps = base_fee_bps;
        
        // Increase fee for large transactions (whale protection)
        if transaction_value > 100_000 * 1_000_000 { // > $100k
            fee_bps = fee_bps.saturating_mul(150).saturating_div(100); // 1.5x
        } else if transaction_value > 50_000 * 1_000_000 { // > $50k
            fee_bps = fee_bps.saturating_mul(125).saturating_div(100); // 1.25x
        }
        
        // Increase fee during high volatility
        if price_volatility > 1000 { // > 10% volatility
            fee_bps = fee_bps.saturating_add(50); // +0.5%
        }
        
        // Increase fee during high volume (congestion pricing)
        let avg_daily_volume: u64 = 1_000_000_000_000; // $1M baseline (in atomic units)
        if recent_volume > (avg_daily_volume as u128 * 5) {
            fee_bps = fee_bps.saturating_add(100); // +1%
        }
        
        // Cap maximum fee at 5%
        Ok(fee_bps.min(500))
    }
    
    /// Generate transaction hash for commit-reveal pattern
    pub fn generate_commit_hash(
        user: &Pubkey,
        amount: u64,
        nonce: u64,
        salt: &[u8; 32],
    ) -> [u8; 32] {
        let mut data = Vec::new();
        data.extend_from_slice(&user.to_bytes());
        data.extend_from_slice(&amount.to_le_bytes());
        data.extend_from_slice(&nonce.to_le_bytes());
        data.extend_from_slice(salt);
        
        hash(&data).to_bytes()
    }
    
    /// Verify commit-reveal
    pub fn verify_commit_reveal(
        commit_hash: &[u8; 32],
        user: &Pubkey,
        amount: u64,
        nonce: u64,
        salt: &[u8; 32],
    ) -> Result<()> {
        let computed_hash = Self::generate_commit_hash(user, amount, nonce, salt);
        
        require!(
            commit_hash == &computed_hash,
            TwistError::InvalidAccount
        );
        
        Ok(())
    }
    
    /// Check if transaction should be delayed (for high-value transactions)
    pub fn should_delay_transaction(
        amount: u64,
        transaction_type: TransactionType,
    ) -> (bool, i64) {
        match transaction_type {
            TransactionType::Swap => {
                if amount > 100_000 * 1_000_000 { // > $100k
                    (true, 60) // 60 second delay
                } else if amount > 50_000 * 1_000_000 { // > $50k
                    (true, 30) // 30 second delay
                } else {
                    (false, 0)
                }
            },
            TransactionType::Withdrawal => {
                if amount > 50_000 * 1_000_000 { // > $50k
                    (true, 300) // 5 minute delay
                } else if amount > 10_000 * 1_000_000 { // > $10k
                    (true, 60) // 1 minute delay
                } else {
                    (false, 0)
                }
            },
            TransactionType::Stake | TransactionType::Other => (false, 0),
        }
    }
    
    /// Calculate maximum extractable value for a transaction
    pub fn calculate_mev_potential(
        transaction_value: u64,
        _current_price: u64,
        pool_liquidity: u64,
        fee_bps: u64,
    ) -> u64 {
        // Calculate price impact
        let price_impact = calculate_price_impact(transaction_value, pool_liquidity);
        
        // MEV = (price_impact * transaction_value) - fees
        let gross_mev = (price_impact * transaction_value) / 10000;
        let fees = (transaction_value * fee_bps) / 10000;
        
        gross_mev.saturating_sub(fees)
    }
    
    /// Validate priority fee to prevent fee escalation wars
    pub fn validate_priority_fee(
        priority_fee: u64,
        base_fee: u64,
        transaction_value: u64,
    ) -> Result<()> {
        // Priority fee should not exceed 10% of transaction value
        let max_priority_fee = transaction_value / 10;
        
        require!(
            priority_fee <= max_priority_fee,
            TwistError::InvalidAmount
        );
        
        // Priority fee should not exceed 10x base fee
        require!(
            priority_fee <= base_fee * 10,
            TwistError::InvalidAmount
        );
        
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum TransactionType {
    Swap,
    Stake,
    Withdrawal,
    Other,
}

/// Commit-reveal state for preventing front-running
#[account]
pub struct CommitRevealState {
    pub user: Pubkey,
    pub commit_hash: [u8; 32],
    pub commit_timestamp: i64,
    pub reveal_timestamp: i64,
    pub revealed: bool,
    pub cancelled: bool,
    pub bump: u8,
}

impl CommitRevealState {
    pub const LEN: usize = 8 + // discriminator
        32 + // user
        32 + // commit_hash
        8 + // commit_timestamp
        8 + // reveal_timestamp
        1 + // revealed
        1 + // cancelled
        1; // bump
        
    pub fn can_reveal(&self, current_timestamp: i64, min_delay: i64) -> bool {
        !self.revealed && 
        !self.cancelled && 
        current_timestamp >= self.commit_timestamp + min_delay
    }
}

/// Single-block transaction restriction
#[account]
pub struct BlockRestriction {
    pub user: Pubkey,
    pub last_transaction_slot: u64,
    pub transaction_count: u64,
    pub daily_volume: u64,
    pub last_reset_slot: u64,
    pub bump: u8,
}

impl BlockRestriction {
    pub const LEN: usize = 8 + // discriminator
        32 + // user
        8 + // last_transaction_slot
        8 + // transaction_count
        8 + // daily_volume
        8 + // last_reset_slot
        1; // bump
        
    pub fn can_transact(&self, current_slot: u64, min_slot_gap: u64) -> bool {
        current_slot >= self.last_transaction_slot + min_slot_gap
    }
    
    pub fn update(&mut self, current_slot: u64, amount: u64) {
        // Reset daily volume if new day (assuming ~2 slots per second, ~172,800 slots per day)
        if current_slot > self.last_reset_slot + 172_800 {
            self.daily_volume = 0;
            self.last_reset_slot = current_slot;
            self.transaction_count = 0;
        }
        
        self.last_transaction_slot = current_slot;
        self.transaction_count += 1;
        self.daily_volume = self.daily_volume.saturating_add(amount);
    }
}

// Helper function to calculate price impact
fn calculate_price_impact(trade_amount: u64, pool_liquidity: u64) -> u64 {
    // Simplified constant product formula
    // impact = trade_amount / (pool_liquidity + trade_amount) * 10000
    let numerator = (trade_amount as u128) * 10000;
    let denominator = (pool_liquidity as u128) + (trade_amount as u128);
    
    (numerator / denominator) as u64
}

/// Priority fee configuration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriorityFeeConfig {
    pub base_fee: u64,
    pub max_priority_multiplier: u64,
    pub congestion_threshold: u64,
    pub whale_threshold: u64,
}

impl Default for PriorityFeeConfig {
    fn default() -> Self {
        Self {
            base_fee: 5000, // 0.0005 SOL
            max_priority_multiplier: 10,
            congestion_threshold: 1000, // transactions per minute
            whale_threshold: 100_000 * 1_000_000, // $100k
        }
    }
}