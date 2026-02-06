use anchor_lang::prelude::*;

#[account]
pub struct OracleState {
    pub authority: Pubkey,
    pub pyth_feed: Pubkey,
    pub switchboard_feed: Pubkey,
    pub chainlink_feed: Option<Pubkey>,
    pub last_update: i64,
    pub last_price: u64,
    pub last_confidence: u64,
    pub max_confidence_threshold: u64,
    pub max_staleness: i64,
    pub price_history: Vec<PricePoint>,
    pub bump: u8,
}

impl OracleState {
    pub const MAX_HISTORY: usize = 24; // 24 hours of hourly data
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + 32 + 33 + // feeds (Option<Pubkey> = 1 + 32)
        8 + 8 + 8 + 8 + 8 + // price info and thresholds
        4 + (PricePoint::LEN * Self::MAX_HISTORY) + // price history
        1; // bump
        
    pub fn add_price_point(&mut self, price: u64, confidence: u64, timestamp: i64) {
        let point = PricePoint {
            price,
            confidence,
            timestamp,
        };
        
        if self.price_history.len() >= Self::MAX_HISTORY {
            self.price_history.remove(0);
        }
        self.price_history.push(point);
        
        self.last_update = timestamp;
        self.last_price = price;
        self.last_confidence = confidence;
    }
    
    pub fn calculate_twap(&self, duration_seconds: i64) -> Result<u64> {
        if self.price_history.is_empty() {
            return Ok(self.last_price);
        }
        
        let current_time = Clock::get()?.unix_timestamp;
        let start_time = current_time - duration_seconds;
        
        let relevant_points: Vec<&PricePoint> = self.price_history
            .iter()
            .filter(|p| p.timestamp >= start_time)
            .collect();
            
        if relevant_points.is_empty() {
            return Ok(self.last_price);
        }
        
        let sum: u128 = relevant_points.iter().map(|p| p.price as u128).sum();
        Ok((sum / relevant_points.len() as u128) as u64)
    }
    
    pub fn is_stale(&self, current_timestamp: i64) -> bool {
        current_timestamp - self.last_update > self.max_staleness
    }
    
    pub fn confidence_too_low(&self) -> bool {
        self.last_confidence > self.max_confidence_threshold
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PricePoint {
    pub price: u64,
    pub confidence: u64,
    pub timestamp: i64,
}

impl PricePoint {
    pub const LEN: usize = 8 + 8 + 8; // 24 bytes
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AggregatedPrice {
    pub price: u64,
    pub confidence: u64,
    pub sources: Vec<PriceSource>,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceSource {
    pub oracle_type: OracleType,
    pub price: u64,
    pub confidence: u64,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum OracleType {
    Pyth,
    Switchboard,
    Chainlink,
}

impl OracleState {
    pub fn validate_price_divergence(&self, prices: &[PriceSource]) -> Result<()> {
        if prices.len() < 2 {
            return Err(crate::errors::TwistError::InsufficientLiquidity.into());
        }
        
        let price_values: Vec<u64> = prices.iter().map(|p| p.price).collect();
        let max_price = *price_values.iter().max().unwrap();
        let min_price = *price_values.iter().min().unwrap();
        
        let divergence_bps = ((max_price - min_price) * 10000) / min_price;
        
        require!(
            divergence_bps <= crate::constants::ORACLE_DIVERGENCE_THRESHOLD_BPS,
            crate::errors::TwistError::OracleDivergenceTooHigh
        );
        
        Ok(())
    }
}