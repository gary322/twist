// bond-pool-factory/src/state/mod.rs
use anchor_lang::prelude::*;

pub mod factory_state;
pub mod bond_pool;
pub mod bond_position;
pub mod bond_nft;

pub use factory_state::*;
pub use bond_pool::*;
pub use bond_position::*;
pub use bond_nft::*;

/// Website sectors for categorization
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum WebsiteSector {
    News = 0,
    Gaming = 1,
    Finance = 2,
    Technology = 3,
    Entertainment = 4,
    Education = 5,
    Social = 6,
    Commerce = 7,
    Other = 8,
}

impl Default for WebsiteSector {
    fn default() -> Self {
        WebsiteSector::Other
    }
}