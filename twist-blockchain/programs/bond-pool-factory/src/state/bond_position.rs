// bond-pool-factory/src/state/bond_position.rs
use anchor_lang::prelude::*;

#[account]
pub struct BondPosition {
    /// Owner of this position
    pub owner: Pubkey,
    
    /// Pool this position belongs to
    pub pool: Pubkey,
    
    /// Bond NFT mint address (receipt token)
    pub bond_mint: Pubkey,
    
    // Stake details
    /// Amount of TWIST staked
    pub amount_staked: u64,
    
    /// Number of pool shares owned
    pub shares: u64,
    
    /// When the stake was made
    pub stake_timestamp: i64,
    
    /// When the stake can be withdrawn
    pub unlock_timestamp: i64,
    
    // Reward tracking
    /// Reward debt for calculating pending rewards
    pub reward_debt: u128,
    
    /// Total rewards claimed so far
    pub rewards_claimed: u64,
    
    /// Last time rewards were claimed
    pub last_claim_timestamp: i64,
    
    /// Claimed yield integral cursor (for continuous rewards)
    pub claimed_cursor: u128,
    
    // Position metadata
    /// Sequential position number in the pool
    pub position_number: u64,
    
    /// Whether to auto-compound rewards
    pub auto_compound: bool,
    
    /// Tier based on stake amount (for future features)
    pub tier: u8,
    
    /// Bump seed for PDA
    pub bump: u8,
    
    /// Reserved space for future upgrades
    pub _reserved: [u64; 8],
}

impl BondPosition {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        32 + // pool
        32 + // bond_mint
        8 + // amount_staked
        8 + // shares
        8 + // stake_timestamp
        8 + // unlock_timestamp
        16 + // reward_debt
        8 + // rewards_claimed
        8 + // last_claim_timestamp
        16 + // claimed_cursor
        8 + // position_number
        1 + // auto_compound
        1 + // tier
        1 + // bump
        (8 * 8); // _reserved
        
    pub const SEED_PREFIX: &'static [u8] = b"bond_position";
    
    /// Check if the position can be withdrawn
    pub fn can_withdraw(&self, current_timestamp: i64) -> bool {
        current_timestamp >= self.unlock_timestamp
    }
    
    /// Check if the position has pending rewards
    pub fn has_pending_rewards(&self, pool_reward_per_share: u128) -> bool {
        let accumulated = (self.shares as u128)
            .checked_mul(pool_reward_per_share)
            .unwrap_or(0)
            .checked_div(crate::utils::PRECISION)
            .unwrap_or(0);
            
        accumulated > self.reward_debt
    }
}

