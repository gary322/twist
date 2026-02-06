// bond-pool-factory/src/errors.rs
use anchor_lang::prelude::*;

#[error_code]
pub enum BondPoolError {
    #[msg("Invalid revenue share percentage (max 50%)")]
    InvalidRevenueShare,
    
    #[msg("Stake amount below minimum")]
    StakeBelowMinimum,
    
    #[msg("Stake amount above maximum")]
    StakeAboveMaximum,
    
    #[msg("Pool is not active")]
    PoolNotActive,
    
    #[msg("Pool has been finalized")]
    PoolFinalized,
    
    #[msg("Not the pool or site owner")]
    NotOwner,
    
    #[msg("Stake is still locked")]
    StillLocked,
    
    #[msg("Insufficient shares to withdraw")]
    InsufficientShares,
    
    #[msg("Invalid lock duration (30-365 days)")]
    InvalidLockDuration,
    
    #[msg("Unauthorized caller")]
    UnauthorizedCaller,
    
    #[msg("No stakers in pool")]
    NoStakers,
    
    #[msg("Pool is paused")]
    PoolPaused,
    
    #[msg("Factory is paused")]
    FactoryPaused,
    
    #[msg("Invalid site hash")]
    InvalidSiteHash,
    
    #[msg("Pool already exists for this site")]
    PoolAlreadyExists,
    
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Invalid burn split configuration")]
    InvalidBurnSplit,
    
    #[msg("NFT mint failed")]
    NFTMintFailed,
    
    #[msg("Invalid sector")]
    InvalidSector,
    
    #[msg("Early unwrap fee too high")]
    EarlyUnwrapFeeTooHigh,
}