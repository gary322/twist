use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum CircuitBreakerSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum TripCondition {
    PriceVolatility,
    VolumeSpike,
    SupplyChange,
    OracleDivergence,
    LiquidityDrain,
    AbnormalDecay,
    ManualTrigger,
}

#[account]
pub struct CircuitBreakerState {
    pub authority: Pubkey,
    pub bump: u8,
    
    // Trip history
    pub last_trip_timestamp: i64,
    pub last_trip_severity: CircuitBreakerSeverity,
    pub last_trip_condition: TripCondition,
    pub trip_count: u64,
    
    // Auto-reset configuration
    pub auto_reset_enabled: bool,
    pub auto_reset_duration: i64, // seconds
    
    // Thresholds
    pub price_volatility_threshold_bps: u64, // basis points
    pub volume_spike_multiplier: u64,
    pub supply_change_threshold_bps: u64,
    pub oracle_divergence_threshold_bps: u64,
    pub liquidity_drain_threshold_bps: u64,
    
    // Cooldown periods
    pub low_severity_cooldown: i64,
    pub medium_severity_cooldown: i64,
    pub high_severity_cooldown: i64,
    pub critical_severity_cooldown: i64,
    
    // Historical data for calculations
    pub price_1h_ago: u64,
    pub price_24h_ago: u64,
    pub volume_1h_ago: u128,
    pub volume_24h_ago: u128,
    pub supply_24h_ago: u128,
    pub liquidity_1h_ago: u64,
    
    // Reserved space
    pub _reserved: [u8; 64],
}

impl CircuitBreakerState {
    pub const LEN: usize = 8 + // discriminator
        32 + 1 + // authority + bump
        8 + 1 + 1 + 8 + // trip history (using 1 byte for enums)
        1 + 8 + // auto-reset
        8 + 8 + 8 + 8 + 8 + // thresholds
        8 + 8 + 8 + 8 + // cooldowns
        8 + 8 + 16 + 16 + 16 + 8 + // historical data
        64; // reserved
        
    pub fn get_cooldown_duration(&self, severity: &CircuitBreakerSeverity) -> i64 {
        match severity {
            CircuitBreakerSeverity::Low => self.low_severity_cooldown,
            CircuitBreakerSeverity::Medium => self.medium_severity_cooldown,
            CircuitBreakerSeverity::High => self.high_severity_cooldown,
            CircuitBreakerSeverity::Critical => self.critical_severity_cooldown,
        }
    }
    
    pub fn can_reset(&self, current_timestamp: i64) -> bool {
        if !self.auto_reset_enabled {
            return false;
        }
        
        let cooldown = self.get_cooldown_duration(&self.last_trip_severity);
        current_timestamp - self.last_trip_timestamp >= cooldown
    }
    
    pub fn check_price_volatility(&self, current_price: u64) -> Option<CircuitBreakerSeverity> {
        // Check 1-hour volatility
        let volatility_1h = if self.price_1h_ago > 0 {
            let diff = if current_price > self.price_1h_ago {
                current_price - self.price_1h_ago
            } else {
                self.price_1h_ago - current_price
            };
            (diff * 10000) / self.price_1h_ago
        } else {
            0
        };
        
        if volatility_1h > self.price_volatility_threshold_bps {
            if volatility_1h > self.price_volatility_threshold_bps * 3 {
                Some(CircuitBreakerSeverity::Critical)
            } else if volatility_1h > self.price_volatility_threshold_bps * 2 {
                Some(CircuitBreakerSeverity::High)
            } else {
                Some(CircuitBreakerSeverity::Medium)
            }
        } else {
            None
        }
    }
    
    pub fn check_volume_spike(&self, current_volume: u128) -> Option<CircuitBreakerSeverity> {
        if self.volume_1h_ago == 0 {
            return None;
        }
        
        let spike_ratio = current_volume / self.volume_1h_ago;
        if spike_ratio > self.volume_spike_multiplier as u128 {
            if spike_ratio > (self.volume_spike_multiplier * 5) as u128 {
                Some(CircuitBreakerSeverity::Critical)
            } else if spike_ratio > (self.volume_spike_multiplier * 2) as u128 {
                Some(CircuitBreakerSeverity::High)
            } else {
                Some(CircuitBreakerSeverity::Medium)
            }
        } else {
            None
        }
    }
    
    pub fn check_supply_change(&self, current_supply: u128) -> Option<CircuitBreakerSeverity> {
        if self.supply_24h_ago == 0 {
            return None;
        }
        
        let change = if current_supply > self.supply_24h_ago {
            current_supply - self.supply_24h_ago
        } else {
            self.supply_24h_ago - current_supply
        };
        
        let change_bps = (change * 10000) / self.supply_24h_ago;
        
        if change_bps > self.supply_change_threshold_bps as u128 {
            if change_bps > (self.supply_change_threshold_bps * 3) as u128 {
                Some(CircuitBreakerSeverity::Critical)
            } else if change_bps > (self.supply_change_threshold_bps * 2) as u128 {
                Some(CircuitBreakerSeverity::High)
            } else {
                Some(CircuitBreakerSeverity::Medium)
            }
        } else {
            None
        }
    }
    
    pub fn check_liquidity_drain(&self, current_liquidity: u64) -> Option<CircuitBreakerSeverity> {
        if self.liquidity_1h_ago == 0 {
            return None;
        }
        
        if current_liquidity < self.liquidity_1h_ago {
            let drain = self.liquidity_1h_ago - current_liquidity;
            let drain_bps = (drain as u128 * 10000) / self.liquidity_1h_ago as u128;
            
            if drain_bps > self.liquidity_drain_threshold_bps as u128 {
                if drain_bps > (self.liquidity_drain_threshold_bps * 3) as u128 {
                    Some(CircuitBreakerSeverity::Critical)
                } else if drain_bps > (self.liquidity_drain_threshold_bps * 2) as u128 {
                    Some(CircuitBreakerSeverity::High)
                } else {
                    Some(CircuitBreakerSeverity::Medium)
                }
            } else {
                None
            }
        } else {
            None
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CircuitBreakerParams {
    pub auto_reset_enabled: bool,
    pub auto_reset_duration: i64,
    pub price_volatility_threshold_bps: u64,
    pub volume_spike_multiplier: u64,
    pub supply_change_threshold_bps: u64,
    pub oracle_divergence_threshold_bps: u64,
    pub liquidity_drain_threshold_bps: u64,
    pub low_severity_cooldown: i64,
    pub medium_severity_cooldown: i64,
    pub high_severity_cooldown: i64,
    pub critical_severity_cooldown: i64,
}

impl Default for CircuitBreakerParams {
    fn default() -> Self {
        Self {
            auto_reset_enabled: true,
            auto_reset_duration: 3600, // 1 hour
            price_volatility_threshold_bps: 5000, // 50%
            volume_spike_multiplier: 10,
            supply_change_threshold_bps: 200, // 2%
            oracle_divergence_threshold_bps: 500, // 5%
            liquidity_drain_threshold_bps: 2000, // 20%
            low_severity_cooldown: 900, // 15 minutes
            medium_severity_cooldown: 3600, // 1 hour
            high_severity_cooldown: 14400, // 4 hours
            critical_severity_cooldown: 86400, // 24 hours
        }
    }
}