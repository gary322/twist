// bond-pool-factory/src/utils/mod.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint};
use crate::state::*;

pub const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward calculations

/// Generate a unique pool ID based on site hash and timestamp
pub fn generate_pool_id(site_hash: &[u8; 32], timestamp: i64) -> [u8; 32] {
    let mut pool_id = [0u8; 32];
    pool_id[..32].copy_from_slice(site_hash);
    
    // Mix in timestamp
    let time_bytes = timestamp.to_le_bytes();
    for i in 0..8 {
        pool_id[i] ^= time_bytes[i];
    }
    
    pool_id
}

/// Update pool rewards (placeholder for future auto-compounding)
pub fn update_pool_rewards(pool: &mut BondPool) -> Result<()> {
    // In the current implementation, rewards are updated only when
    // distribute_yield is called. This function is a placeholder
    // for future enhancements like auto-compounding.
    Ok(())
}

/// Calculate staking tier based on amount
pub fn calculate_tier(amount: u64) -> u8 {
    match amount {
        x if x >= 100_000_000_000_000 => 4, // 100K TWIST = Platinum
        x if x >= 50_000_000_000_000 => 3,  // 50K TWIST = Gold
        x if x >= 10_000_000_000_000 => 2,  // 10K TWIST = Silver
        x if x >= 1_000_000_000_000 => 1,   // 1K TWIST = Bronze
        _ => 0,                              // Below 1K = No tier
    }
}

/// Mint Bond NFT for position
pub fn mint_bond_nft<'info>(
    staker: &Pubkey,
    bond_nft_mint: &UncheckedAccount<'info>,
    staker_nft_account: &UncheckedAccount<'info>,
    nft_metadata: &UncheckedAccount<'info>,
    metadata_program: &UncheckedAccount<'info>,
    token_program: &Program<'info, Token>,
    system_program: &Program<'info, System>,
    rent: &Sysvar<'info, Rent>,
    pool: &BondPool,
    position: &BondPosition,
    payer: AccountInfo<'info>,
) -> Result<()> {
    // Note: In a real implementation, this would:
    // 1. Create the NFT mint
    // 2. Initialize the mint with supply of 1
    // 3. Create metadata using Metaplex
    // 4. Mint 1 NFT to the staker
    // 5. Freeze the mint so no more can be created
    
    // For now, we'll just emit an event
    msg!("Bond NFT minting would happen here for position {}", position.position_number);
    
    Ok(())
}

/// Get the site name from hash (would query an oracle or registry in production)
pub fn get_site_name(site_hash: &[u8; 32]) -> Result<String> {
    // In production, this would look up the actual site name
    // from a registry or oracle. For now, return a placeholder.
    Ok(format!("site_{}", bs58::encode(&site_hash[..8]).into_string()))
}

/// Generate metadata URI for Bond NFT
pub fn generate_metadata_uri(
    pool: &BondPool,
    position: &BondPosition,
    amount: u64,
) -> Result<String> {
    let seed = BondNFTMetadata::generate_artwork_seed(
        &position.pool,
        &pool.site_hash,
        position.stake_timestamp,
    );
    
    Ok(format!(
        "https://metadata.twist.io/bonds/{}/metadata.json",
        bs58::encode(&seed).into_string()
    ))
}