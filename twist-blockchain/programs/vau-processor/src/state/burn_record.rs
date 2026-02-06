use anchor_lang::prelude::*;

#[account]
pub struct BurnRecord {
    /// Visitor's wallet address
    pub visitor: Pubkey,
    
    /// Website where burn occurred
    pub website: Pubkey,
    
    /// Amount of TWIST burned
    pub amount: u64,
    
    /// Timestamp of burn
    pub timestamp: i64,
    
    /// Transaction signature
    pub tx_signature: [u8; 64],
    
    /// Session ID from edge worker
    pub session_id: [u8; 32],
    
    /// IP hash for rate limiting
    pub ip_hash: [u8; 32],
    
    /// User agent hash
    pub user_agent_hash: [u8; 32],
    
    /// Page identifier where burn occurred
    pub page_identifier: String,
    
    /// Burn type (page_view, interaction, etc)
    pub burn_type: BurnType,
    
    /// Processing status
    pub status: BurnStatus,
    
    /// Bond pool that received yield
    pub bond_pool: Pubkey,
    
    /// Amount sent to bond pool (after fees)
    pub amount_to_pool: u64,
    
    /// Processor fee collected
    pub processor_fee: u64,
    
    /// Edge worker that processed this
    pub edge_worker: Pubkey,
    
    /// Bump seed
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum BurnType {
    PageView,
    Interaction,
    Transaction,
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum BurnStatus {
    Pending,
    Processed,
    Failed,
    Refunded,
}

impl BurnRecord {
    pub const SEED_PREFIX: &'static [u8] = b"burn_record";
    pub const LEN: usize = 8 + // discriminator
        32 + // visitor
        32 + // website
        8 +  // amount
        8 +  // timestamp
        64 + // tx_signature
        32 + // session_id
        32 + // ip_hash
        32 + // user_agent_hash
        4 + 64 + // page_identifier (max 64 chars)
        1 +  // burn_type
        1 +  // status
        32 + // bond_pool
        8 +  // amount_to_pool
        8 +  // processor_fee
        32 + // edge_worker
        1;   // bump
}