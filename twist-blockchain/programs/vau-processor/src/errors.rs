use anchor_lang::prelude::*;

#[error_code]
pub enum VAUProcessorError {
    #[msg("Invalid burn amount")]
    InvalidBurnAmount,
    
    #[msg("Website not registered")]
    WebsiteNotRegistered,
    
    #[msg("Website already registered")]
    WebsiteAlreadyRegistered,
    
    #[msg("Invalid website URL")]
    InvalidWebsiteURL,
    
    #[msg("Processor paused")]
    ProcessorPaused,
    
    #[msg("Insufficient burn source balance")]
    InsufficientBalance,
    
    #[msg("Bond pool not found for website")]
    BondPoolNotFound,
    
    #[msg("Invalid authority")]
    InvalidAuthority,
    
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Daily burn limit exceeded")]
    DailyBurnLimitExceeded,
    
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
}