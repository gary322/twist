use anchor_lang::prelude::*;

#[account]
pub struct LiquidityPosition {
    pub whirlpool: Pubkey,
    pub position_mint: Pubkey,
    pub owner: Pubkey,
    pub lower_tick: i32,
    pub upper_tick: i32,
    pub liquidity: u128,
    pub last_rebalance_timestamp: i64,
    pub last_compound_timestamp: i64,
    pub rebalance_count: u32,
    pub total_fees_compounded_twist: u64,
    pub total_fees_compounded_usdc: u64,
    pub created_timestamp: i64,
    pub bump: u8,
}

impl LiquidityPosition {
    pub const LEN: usize = 8 + // discriminator
        32 + // whirlpool
        32 + // position_mint
        32 + // owner
        4 + // lower_tick
        4 + // upper_tick
        16 + // liquidity
        8 + // last_rebalance_timestamp
        8 + // last_compound_timestamp
        4 + // rebalance_count
        8 + // total_fees_compounded_twist
        8 + // total_fees_compounded_usdc
        8 + // created_timestamp
        1 + // bump
        16; // padding for future fields
}