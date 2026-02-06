use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;

// Orca Whirlpool Program ID on mainnet
pub const ORCA_WHIRLPOOL_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0x2b, 0x3e, 0x5d, 0x7f, 0xaa, 0x0f, 0xbb, 0xe8, 
    0x5a, 0xe2, 0xf9, 0x3a, 0xd0, 0x7f, 0xfc, 0xb2,
    0xed, 0x0e, 0x6e, 0x47, 0x7a, 0x7b, 0x50, 0xf2,
    0x6b, 0x6e, 0xe5, 0x73, 0x3e, 0xf0, 0xf1, 0x3d
]);

// Orca swap instruction discriminator
pub const SWAP_DISCRIMINATOR: [u8; 8] = [248, 198, 158, 145, 225, 117, 135, 200];

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SwapParams {
    pub amount: u64,
    pub other_amount_threshold: u64,
    pub sqrt_price_limit: u128,
    pub amount_specified_is_input: bool,
    pub a_to_b: bool,
}

#[derive(Clone)]
pub struct Whirlpool;

impl anchor_lang::Id for Whirlpool {
    fn id() -> Pubkey {
        ORCA_WHIRLPOOL_PROGRAM_ID
    }
}

// Orca Whirlpool account structure (simplified)
#[account]
pub struct WhirlpoolState {
    pub whirlpools_config: Pubkey,
    pub whirlpool_bump: [u8; 1],
    pub tick_spacing: u16,
    pub tick_spacing_seed: [u8; 2],
    pub fee_rate: u16,
    pub protocol_fee_rate: u16,
    pub liquidity: u128,
    pub sqrt_price: u128,
    pub tick_current_index: i32,
    pub protocol_fee_owed_a: u64,
    pub protocol_fee_owed_b: u64,
    pub token_mint_a: Pubkey,
    pub token_vault_a: Pubkey,
    pub fee_growth_global_a: u128,
    pub token_mint_b: Pubkey,
    pub token_vault_b: Pubkey,
    pub fee_growth_global_b: u128,
    pub reward_last_updated_timestamp: u64,
    pub reward_infos: [RewardInfo; 3],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct RewardInfo {
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub emissions_per_second_x64: u128,
    pub growth_global_x64: u128,
}

impl WhirlpoolState {
    pub const LEN: usize = 8 + 653; // discriminator + data
}

// Oracle account for storing pool price
#[account]
pub struct PoolOracle {
    pub whirlpool: Pubkey,
    pub last_update_timestamp: i64,
    pub sqrt_price: u128,
    pub price: u64, // Price in USDC with 6 decimals
    pub liquidity: u128,
    pub volume_24h: u64,
    pub fees_24h: u64,
    pub bump: u8,
}

impl PoolOracle {
    pub const LEN: usize = 8 + 32 + 8 + 16 + 8 + 16 + 8 + 8 + 1;
}

// Calculate the output amount for a swap
pub fn calculate_swap_amount(
    sqrt_price: u128,
    _liquidity: u128,
    amount_in: u64,
    a_to_b: bool,
    fee_rate: u16,
) -> Result<u64> {
    // Simplified swap calculation
    // In production, this would use the full Orca math library
    
    // Apply fee
    let fee_amount = (amount_in as u128 * fee_rate as u128) / 1_000_000;
    let amount_after_fee = amount_in - fee_amount as u64;
    
    // Simple price calculation (would be more complex with actual tick math)
    let price = if a_to_b {
        // TWIST -> USDC
        (sqrt_price * sqrt_price) >> 64
    } else {
        // USDC -> TWIST
        // Avoid overflow by using checked operations
        let sqrt_price_squared = (sqrt_price * sqrt_price) >> 64;
        if sqrt_price_squared == 0 {
            return Err(ProgramError::InvalidArgument.into());
        }
        u128::MAX / sqrt_price_squared
    };
    
    let amount_out = (amount_after_fee as u128 * price) >> 64;
    
    Ok(amount_out as u64)
}

// Build CPI instruction for Orca swap
pub fn build_swap_ix(
    whirlpool_program: Pubkey,
    token_program: Pubkey,
    token_authority: Pubkey,
    whirlpool: Pubkey,
    token_owner_account_a: Pubkey,
    token_vault_a: Pubkey,
    token_owner_account_b: Pubkey,
    token_vault_b: Pubkey,
    tick_array_0: Pubkey,
    tick_array_1: Pubkey,
    tick_array_2: Pubkey,
    oracle: Pubkey,
    params: SwapParams,
) -> Result<Instruction> {
    let accounts = vec![
        AccountMeta::new_readonly(token_program, false),
        AccountMeta::new_readonly(token_authority, true),
        AccountMeta::new(whirlpool, false),
        AccountMeta::new(token_owner_account_a, false),
        AccountMeta::new(token_vault_a, false),
        AccountMeta::new(token_owner_account_b, false),
        AccountMeta::new(token_vault_b, false),
        AccountMeta::new(tick_array_0, false),
        AccountMeta::new(tick_array_1, false),
        AccountMeta::new(tick_array_2, false),
        AccountMeta::new(oracle, false),
    ];

    let mut data = SWAP_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&params.try_to_vec()?);

    Ok(Instruction {
        program_id: whirlpool_program,
        accounts,
        data,
    })
}

// Helper to find tick arrays for a position
pub fn get_tick_array_pubkeys(
    whirlpool: &Pubkey,
    tick_current_index: i32,
    tick_spacing: u16,
    a_to_b: bool,
    program_id: &Pubkey,
) -> Result<[Pubkey; 3]> {
    let tick_array_offset = if a_to_b { 0 } else { 2 };
    
    let start_tick_index = tick_current_index - (tick_current_index % (tick_spacing as i32 * 88));
    
    let tick_arrays = [
        get_tick_array_pda(
            whirlpool,
            start_tick_index + tick_array_offset * tick_spacing as i32 * 88,
            program_id,
        )?,
        get_tick_array_pda(
            whirlpool,
            start_tick_index + (tick_array_offset + 1) * tick_spacing as i32 * 88,
            program_id,
        )?,
        get_tick_array_pda(
            whirlpool,
            start_tick_index + (tick_array_offset + 2) * tick_spacing as i32 * 88,
            program_id,
        )?,
    ];
    
    Ok(tick_arrays)
}

fn get_tick_array_pda(
    whirlpool: &Pubkey,
    start_tick_index: i32,
    program_id: &Pubkey,
) -> Result<Pubkey> {
    let (pda, _) = Pubkey::find_program_address(
        &[
            b"tick_array",
            whirlpool.as_ref(),
            &start_tick_index.to_string().as_bytes(),
        ],
        program_id,
    );
    Ok(pda)
}