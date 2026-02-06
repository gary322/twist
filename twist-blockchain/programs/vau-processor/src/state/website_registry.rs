use anchor_lang::prelude::*;

#[account]
pub struct WebsiteRegistry {
    /// Website URL hash (32 bytes)
    pub site_hash: [u8; 32],
    
    /// Full website URL
    pub site_url: String,
    
    /// Associated bond pool address
    pub bond_pool: Pubkey,
    
    /// Website owner/admin
    pub owner: Pubkey,
    
    /// Total burns on this website
    pub total_burns: u128,
    
    /// Total TWIST burned on this website
    pub total_twist_burned: u128,
    
    /// Daily burn amount (resets daily)
    pub daily_burn_amount: u64,
    
    /// Last burn timestamp
    pub last_burn_timestamp: i64,
    
    /// Last daily reset timestamp
    pub last_daily_reset: i64,
    
    /// Number of unique visitors (approximate)
    pub unique_visitors: u64,
    
    /// Average burn per visitor
    pub avg_burn_per_visitor: u64,
    
    /// Website category/sector
    pub sector: String,
    
    /// Whether website is active
    pub active: bool,
    
    /// Whether website is verified
    pub verified: bool,
    
    /// Registration timestamp
    pub registered_at: i64,
    
    /// Bump seed
    pub bump: u8,
    
    /// Reserved for future use
    pub _reserved: [u8; 32],
}

impl WebsiteRegistry {
    pub const SEED_PREFIX: &'static [u8] = b"website_registry";
    pub const LEN: usize = 8 + // discriminator
        32 + // site_hash
        4 + 256 + // site_url (max 256 chars)
        32 + // bond_pool
        32 + // owner
        16 + // total_burns
        16 + // total_twist_burned
        8 +  // daily_burn_amount
        8 +  // last_burn_timestamp
        8 +  // last_daily_reset
        8 +  // unique_visitors
        8 +  // avg_burn_per_visitor
        4 + 32 + // sector (max 32 chars)
        1 +  // active
        1 +  // verified
        8 +  // registered_at
        1 +  // bump
        32;  // reserved
    
    pub fn needs_daily_reset(&self, current_timestamp: i64) -> bool {
        current_timestamp - self.last_daily_reset >= 86400 // 24 hours
    }
    
    pub fn can_burn(&self, amount: u64, daily_limit: u64) -> bool {
        self.active && 
        self.verified && 
        self.daily_burn_amount + amount <= daily_limit
    }
}