use anchor_lang::prelude::*;

#[account]
pub struct ProgramState {
    // Authority
    pub authority: Pubkey,
    pub bump: u8,

    // Token configuration
    pub mint: Pubkey,
    pub decimals: u8,

    // Economic parameters
    pub decay_rate_bps: u64,
    pub treasury_split_bps: u64,
    pub last_decay_timestamp: i64,
    pub total_decayed: u128,
    pub total_burned: u128,
    pub total_staked: u128,
    pub total_stakes: u64,
    pub total_bought_back: u128,

    // Treasury configuration
    pub floor_treasury: Pubkey,
    pub ops_treasury: Pubkey,
    pub floor_price: u64, // In USDC atomic units (1e6)
    pub floor_liquidity: u64,

    // Oracle configuration
    pub pyth_price_feed: Pubkey,
    pub switchboard_feed: Pubkey,
    pub chainlink_feed: Option<Pubkey>,
    pub last_oracle_update: i64,
    pub last_oracle_price: u64,

    // Circuit breaker
    pub circuit_breaker_active: bool,
    pub emergency_pause: bool,
    pub buyback_enabled: bool,
    pub max_daily_buyback: u64,
    pub daily_buyback_used: u64,
    pub last_buyback_reset: i64,

    // Stats
    pub total_users: u64,
    pub total_transactions: u128,
    pub volume_24h: u128,
    pub volume_7d: u128,
    pub volume_30d: u128,
    
    // Liquidity pool configuration
    pub whirlpool: Pubkey,
    pub whirlpool_initialized: bool,
    
    // Fee tracking
    pub total_fees_collected: u128,
    
    // Additional fields for upgradability
    pub version: u8,
    pub initialized: bool,
    
    // Reserved space for future upgrades
    pub _reserved: [u8; 79],
}

impl ProgramState {
    pub const LEN: usize = 8 + // discriminator
        32 + 1 + // authority + bump
        32 + 1 + // mint + decimals
        8 + 8 + 8 + 16 + 16 + 16 + 8 + 16 + // economic parameters
        32 + 32 + 8 + 8 + // treasury configuration
        32 + 32 + 33 + 8 + 8 + // oracle configuration (Option<Pubkey> = 1 + 32)
        1 + 1 + 1 + 8 + 8 + 8 + // circuit breaker
        8 + 16 + 16 + 16 + 16 + // stats
        32 + 1 + // whirlpool + whirlpool_initialized
        16 + // total_fees_collected
        1 + 1 + // version + initialized
        79; // reserved
        
    pub fn is_initialized(&self) -> bool {
        self.initialized
    }
    
    pub fn can_decay(&self, current_timestamp: i64) -> bool {
        current_timestamp - self.last_decay_timestamp >= crate::constants::DECAY_INTERVAL
    }
    
    pub fn can_buyback(&self) -> bool {
        self.buyback_enabled && !self.emergency_pause && !self.circuit_breaker_active
    }
    
    pub fn reset_daily_buyback_if_needed(&mut self, current_timestamp: i64) {
        if current_timestamp - self.last_buyback_reset >= 86400 {
            self.daily_buyback_used = 0;
            self.last_buyback_reset = current_timestamp;
        }
    }
}

