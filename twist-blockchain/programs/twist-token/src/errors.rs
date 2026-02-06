use anchor_lang::prelude::*;

#[error_code]
pub enum TwistError {
    #[msg("Invalid decay rate")]
    InvalidDecayRate,
    
    #[msg("Invalid treasury split")]
    InvalidTreasurySplit,
    
    #[msg("Decay too soon")]
    DecayTooSoon,
    
    #[msg("Invalid lock period")]
    InvalidLockPeriod,
    
    #[msg("Invalid amount")]
    InvalidAmount,
    
    #[msg("Buyback disabled")]
    BuybackDisabled,
    
    #[msg("Daily buyback limit exceeded")]
    DailyBuybackLimitExceeded,
    
    #[msg("Price above threshold")]
    PriceAboveThreshold,
    
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    
    #[msg("Oracle stale")]
    OracleStale,
    
    #[msg("Oracle confidence too low")]
    OracleConfidenceTooLow,
    
    #[msg("Oracle divergence too high")]
    OracleDivergenceTooHigh,
    
    #[msg("Program already initialized")]
    AlreadyInitialized,
    
    #[msg("Unauthorized")]
    Unauthorized,
    
    #[msg("Emergency pause active")]
    EmergencyPauseActive,
    
    #[msg("Circuit breaker triggered")]
    CircuitBreakerTriggered,
    
    #[msg("Invalid oracle feed")]
    InvalidOracleFeed,
    
    #[msg("Stake still locked")]
    StakeStillLocked,
    
    #[msg("No rewards to claim")]
    NoRewardsToClaim,
    
    #[msg("Vesting schedule not started")]
    VestingNotStarted,
    
    #[msg("Invalid vesting parameters")]
    InvalidVestingParams,
    
    #[msg("Unsupported chain")]
    UnsupportedChain,
    
    #[msg("Bridge transfer failed")]
    BridgeTransferFailed,
    
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Decay manipulation detected")]
    DecayManipulationDetected,
    
    #[msg("Invalid start time")]
    InvalidStartTime,
    
    #[msg("Invalid cliff time")]
    InvalidCliffTime,
    
    #[msg("Invalid end time")]
    InvalidEndTime,
    
    #[msg("Vesting already revoked")]
    VestingAlreadyRevoked,
    
    #[msg("Vesting not revocable")]
    VestingNotRevocable,
    
    #[msg("Invalid mint authority")]
    InvalidMintAuthority,
    
    #[msg("Supply cap exceeded")]
    SupplyCapExceeded,
    
    #[msg("Invalid price feed account")]
    InvalidPriceFeed,
    
    #[msg("Slippage tolerance exceeded")]
    SlippageToleranceExceeded,
    
    #[msg("Invalid account")]
    InvalidAccount,
    
    #[msg("Invalid price range")]
    InvalidPriceRange,
    
    #[msg("Compound too soon")]
    CompoundTooSoon,
    
    #[msg("No fees to compound")]
    NoFeesToCompound,
    
    #[msg("Circuit breaker active")]
    CircuitBreakerActive,
    
    #[msg("Invalid oracle")]
    InvalidOracle,
    
    #[msg("Invalid oracle data")]
    InvalidOracleData,
    
    #[msg("Adjustment too soon")]
    AdjustmentTooSoon,
}