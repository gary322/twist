// bond-pool-factory/src/state/bond_nft.rs
use anchor_lang::prelude::*;

/// Metadata structure for Bond NFT
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BondNFTMetadata {
    /// Link to the bond position account
    pub position: Pubkey,
    
    /// Website name/URL
    pub site_name: String,
    
    /// Original stake amount
    pub stake_amount: u64,
    
    /// Lock duration in days
    pub lock_duration_days: u32,
    
    /// Estimated APY at time of stake (basis points)
    pub apy_at_stake: u16,
    
    /// Artwork generation seed
    pub artwork_seed: [u8; 32],
    
    /// Website sector
    pub sector: super::WebsiteSector,
    
    /// Stake timestamp
    pub staked_at: i64,
    
    /// Unlock timestamp
    pub unlocks_at: i64,
    
    /// Position tier
    pub tier: u8,
}

impl BondNFTMetadata {
    /// Generate metadata URI for the NFT
    pub fn generate_uri(&self) -> String {
        // In production, this would point to a decentralized storage solution
        format!(
            "https://metadata.twist.io/bonds/{}/metadata.json",
            bs58::encode(&self.artwork_seed).into_string()
        )
    }
    
    /// Generate a unique artwork seed based on position details
    pub fn generate_artwork_seed(
        position: &Pubkey,
        site_hash: &[u8; 32],
        timestamp: i64,
    ) -> [u8; 32] {
        let mut seed = [0u8; 32];
        seed[..32].copy_from_slice(&position.to_bytes());
        
        // Mix in site hash
        for i in 0..32 {
            seed[i] ^= site_hash[i];
        }
        
        // Mix in timestamp
        let time_bytes = timestamp.to_le_bytes();
        for i in 0..8 {
            seed[i] ^= time_bytes[i];
        }
        
        seed
    }
}