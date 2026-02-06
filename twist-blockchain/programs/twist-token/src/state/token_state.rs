use anchor_lang::prelude::*;

#[account]
pub struct TokenMetadata {
    pub mint: Pubkey,
    pub update_authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub freeze_authority: Option<Pubkey>,
    pub total_supply_cap: u64,
    pub current_supply: u64,
    pub burned_amount: u128,
    pub last_update: i64,
    pub bump: u8,
}

impl TokenMetadata {
    pub const MAX_NAME_LEN: usize = 32;
    pub const MAX_SYMBOL_LEN: usize = 10;
    pub const MAX_URI_LEN: usize = 200;
    
    pub const LEN: usize = 8 + // discriminator
        32 + 32 + // mint + update_authority
        4 + Self::MAX_NAME_LEN + // name
        4 + Self::MAX_SYMBOL_LEN + // symbol
        4 + Self::MAX_URI_LEN + // uri
        1 + 33 + // decimals + freeze_authority
        8 + 8 + 16 + 8 + 1; // supply info + timestamp + bump
}

#[account]
pub struct DecayState {
    pub last_decay_slot: u64,
    pub last_decay_timestamp: i64,
    pub total_decayed: u128,
    pub decay_rate_bps: u64,
    pub next_decay_timestamp: i64,
    pub decay_paused: bool,
    pub bump: u8,
}

impl DecayState {
    pub const LEN: usize = 8 + // discriminator
        8 + 8 + 16 + 8 + 8 + 1 + 1; // fields
        
    pub fn calculate_decay_amount(&self, current_supply: u64, days_elapsed: f64) -> Result<u64> {
        // Use compound decay formula: S * (1 - r)^t
        let decay_rate = self.decay_rate_bps as f64 / 10_000.0;
        let remaining_factor = (1.0 - decay_rate).powf(days_elapsed);
        let decay_amount = (current_supply as f64 * (1.0 - remaining_factor)) as u64;
        
        Ok(decay_amount)
    }
    
    pub fn can_decay(&self, current_timestamp: i64) -> bool {
        !self.decay_paused && current_timestamp >= self.next_decay_timestamp
    }
}

#[account]
pub struct BurnRecord {
    pub burner: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub tx_signature: [u8; 64],
    pub reason: BurnReason,
    pub bump: u8,
}

impl BurnRecord {
    pub const LEN: usize = 8 + // discriminator
        32 + 8 + 8 + 64 + 1 + 32 + 1; // fields (BurnReason max 32 bytes)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum BurnReason {
    Manual,
    Decay,
    Buyback,
    Penalty,
    Other(String),
}

impl BurnReason {
    pub const MAX_OTHER_LEN: usize = 32;
}