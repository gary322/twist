use anchor_lang::prelude::*;

#[account]
pub struct VAUProcessorState {
    /// Authority that can update processor settings
    pub authority: Pubkey,
    
    /// Bond pool factory program ID
    pub bond_pool_factory: Pubkey,
    
    /// Treasury for collecting processor fees
    pub treasury: Pubkey,
    
    /// Total burns processed
    pub total_burns_processed: u128,
    
    /// Total TWIST burned through processor
    pub total_twist_burned: u128,
    
    /// Total fees collected
    pub total_fees_collected: u128,
    
    /// Processor fee in basis points (e.g., 50 = 0.5%)
    pub processor_fee_bps: u16,
    
    /// Minimum burn amount
    pub min_burn_amount: u64,
    
    /// Maximum burn amount per transaction
    pub max_burn_amount: u64,
    
    /// Daily burn limit per website
    pub daily_burn_limit_per_site: u64,
    
    /// Whether the processor is paused
    pub paused: bool,
    
    /// Authorized edge worker signers
    pub edge_worker_signers: Vec<Pubkey>,
    
    /// Rate limit: burns per minute
    pub rate_limit_per_minute: u16,
    
    /// Timestamp of last update
    pub last_update_timestamp: i64,
    
    /// Bump seed
    pub bump: u8,
    
    /// Reserved for future use
    pub _reserved: [u8; 32],
}

impl VAUProcessorState {
    pub const SEED_PREFIX: &'static [u8] = b"vau_processor";
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // bond_pool_factory
        32 + // treasury
        16 + // total_burns_processed
        16 + // total_twist_burned
        16 + // total_fees_collected
        2 +  // processor_fee_bps
        8 +  // min_burn_amount
        8 +  // max_burn_amount
        8 +  // daily_burn_limit_per_site
        1 +  // paused
        4 + (32 * 10) + // edge_worker_signers (max 10)
        2 +  // rate_limit_per_minute
        8 +  // last_update_timestamp
        1 +  // bump
        32;  // reserved
    
    pub fn can_process_burn(&self, amount: u64) -> bool {
        !self.paused &&
        amount >= self.min_burn_amount &&
        amount <= self.max_burn_amount
    }
}