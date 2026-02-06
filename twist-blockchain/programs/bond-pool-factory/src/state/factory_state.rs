// bond-pool-factory/src/state/factory_state.rs
use anchor_lang::prelude::*;

#[account]
pub struct FactoryState {
    /// Protocol authority that can update parameters
    pub authority: Pubkey,
    
    /// Total number of pools created
    pub total_pools_created: u64,
    
    /// All-time total value locked across all pools
    pub total_value_locked: u128,
    
    /// Current total value locked
    pub current_tvl: u64,
    
    /// Total amount burned from yield distributions (90% of burns)
    pub total_burned_from_yield: u128,
    
    /// Total amount distributed to stakers (10% of burns)
    pub total_distributed_to_stakers: u128,
    
    /// Protocol fee in basis points (100 = 1%)
    pub protocol_fee_bps: u16,
    
    /// Minimum bond duration in seconds (30 days)
    pub min_bond_duration: i64,
    
    /// Maximum bond duration in seconds (365 days)
    pub max_bond_duration: i64,
    
    /// Burn percentage (90% = 9000 bps)
    pub burn_percentage_bps: u16,
    
    /// Yield percentage to stakers (10% = 1000 bps)
    pub yield_percentage_bps: u16,
    
    /// Early unwrap penalty in basis points (30 = 0.3%)
    pub early_unwrap_penalty_bps: u16,
    
    /// Emergency pause flag
    pub paused: bool,
    
    /// Program upgrade authority
    pub upgrade_authority: Pubkey,
    
    /// Treasury address for protocol fees
    pub treasury: Pubkey,
    
    /// VAU processor program ID that can call distribute_yield
    pub vau_processor_program: Pubkey,
    
    /// Bump seed for PDA
    pub bump: u8,
    
    /// Reserved space for future upgrades
    pub _reserved: [u64; 16],
}

impl FactoryState {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        8 + // total_pools_created
        16 + // total_value_locked
        8 + // current_tvl
        16 + // total_burned_from_yield
        16 + // total_distributed_to_stakers
        2 + // protocol_fee_bps
        8 + // min_bond_duration
        8 + // max_bond_duration
        2 + // burn_percentage_bps
        2 + // yield_percentage_bps
        2 + // early_unwrap_penalty_bps
        1 + // paused
        32 + // upgrade_authority
        32 + // treasury
        32 + // vau_processor_program
        1 + // bump
        (8 * 16); // _reserved
        
    pub const SEED_PREFIX: &'static [u8] = b"factory_state";
}