// bond-pool-factory/src/state/bond_pool.rs
use anchor_lang::prelude::*;
use super::WebsiteSector;

#[account]
pub struct BondPool {
    /// Unique identifier for the pool
    pub pool_id: [u8; 32],
    
    /// Hash of the website URL this pool is for
    pub site_hash: [u8; 32],
    
    /// Website owner (for information/verification)
    pub site_owner: Pubkey,
    
    /// Website sector/category
    pub sector: WebsiteSector,
    
    /// Pool creation timestamp
    pub created_at: i64,
    
    // Staking parameters
    /// Minimum amount of TWIST required to stake
    pub min_stake_amount: u64,
    
    /// Maximum stake amount per user (0 = no limit)
    pub max_stake_amount: u64,
    
    /// Lock duration in seconds
    pub lock_duration: i64,
    
    // Pool state
    /// Total TWIST tokens staked in pool
    pub total_staked: u64,
    
    /// Total shares issued (for proportional rewards)
    pub total_shares: u64,
    
    /// Total yield accumulated from burns (before split)
    pub total_yield_accumulated: u128,
    
    /// Total amount burned (90% of yields)
    pub total_yield_burned: u128,
    
    /// Total amount distributed to stakers (10% of yields)
    pub total_yield_distributed: u128,
    
    // Reward tracking
    /// Accumulated rewards per share (Q128.128 fixed point)
    pub reward_per_share: u128,
    
    /// Last slot when rewards were updated
    pub last_update_slot: u64,
    
    /// Yield integral for continuous reward calculation
    pub yield_integral: u128,
    
    // Pool management
    /// Whether pool is accepting new stakes
    pub active: bool,
    
    /// Whether pool is finalized (no new stakes)
    pub finalized: bool,
    
    /// Emergency pause flag
    pub paused: bool,
    
    /// Number of unique stakers
    pub staker_count: u32,
    
    /// Revenue share percentage for the website (basis points)
    pub website_revenue_share_bps: u16,
    
    /// Pool vault address (PDA holding staked tokens)
    pub vault: Pubkey,
    
    /// Sector wrapper token mint address
    pub sector_token_mint: Pubkey,
    
    /// Bump seed for PDA
    pub bump: u8,
    
    /// Reserved space for future upgrades
    pub _reserved: [u64; 16],
}

impl BondPool {
    pub const LEN: usize = 8 + // discriminator
        32 + // pool_id
        32 + // site_hash
        32 + // site_owner
        1 + // sector
        8 + // created_at
        8 + // min_stake_amount
        8 + // max_stake_amount
        8 + // lock_duration
        8 + // total_staked
        8 + // total_shares
        16 + // total_yield_accumulated
        16 + // total_yield_burned
        16 + // total_yield_distributed
        16 + // reward_per_share
        8 + // last_update_slot
        16 + // yield_integral
        1 + // active
        1 + // finalized
        1 + // paused
        4 + // staker_count
        2 + // website_revenue_share_bps
        32 + // vault
        32 + // sector_token_mint
        1 + // bump
        (8 * 16); // _reserved
        
    pub const SEED_PREFIX: &'static [u8] = b"bond_pool";
    
    /// Calculate pending rewards for a position
    pub fn calculate_pending_rewards(&self, shares: u64, reward_debt: u128) -> u64 {
        let accumulated = (shares as u128)
            .checked_mul(self.reward_per_share)
            .unwrap_or(0)
            .checked_div(crate::utils::PRECISION)
            .unwrap_or(0);
            
        accumulated
            .checked_sub(reward_debt)
            .unwrap_or(0) as u64
    }
}