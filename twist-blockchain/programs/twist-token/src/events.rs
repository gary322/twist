use anchor_lang::prelude::*;

#[event]
pub struct ProgramInitialized {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub decay_rate_bps: u64,
    pub floor_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct DecayApplied {
    pub decay_amount: u64,
    pub floor_treasury_amount: u64,
    pub ops_treasury_amount: u64,
    pub new_supply: u64,
    pub timestamp: i64,
    pub days_elapsed: f64,
}

#[event]
pub struct TokensStaked {
    pub owner: Pubkey,
    pub amount: u64,
    pub lock_period: i64,
    pub apy_bps: u64,
    pub unlock_timestamp: i64,
    pub stake_index: usize,
}

#[event]
pub struct TokensUnstaked {
    pub owner: Pubkey,
    pub amount: u64,
    pub rewards: u64,
    pub early_unstake_penalty: u64,
    pub stake_index: usize,
    pub timestamp: i64,
}

#[event]
pub struct RewardsClaimed {
    pub owner: Pubkey,
    pub amount: u64,
    pub stake_index: usize,
    pub timestamp: i64,
}

#[event]
pub struct BuybackExecuted {
    pub usdc_spent: u64,
    pub twist_received: u64,
    pub execution_price: u64,
    pub new_floor_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensBurned {
    pub amount: u64,
    pub burner: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct VestingScheduleCreated {
    pub beneficiary: Pubkey,
    pub total_amount: u64,
    pub start_timestamp: i64,
    pub cliff_timestamp: i64,
    pub end_timestamp: i64,
    pub revocable: bool,
}

#[event]
pub struct VestingTokensReleased {
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub remaining_vested: u64,
    pub timestamp: i64,
}

#[event]
pub struct VestingRevoked {
    pub beneficiary: Pubkey,
    pub amount_returned: u64,
    pub timestamp: i64,
}

#[event]
pub struct BridgeTransferInitiated {
    pub user: Pubkey,
    pub amount: u64,
    pub target_chain: u16,
    pub target_address: [u8; 32],
    pub bridge_fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct OracleUpdated {
    pub oracle_type: crate::state::OracleType,
    pub old_price: u64,
    pub new_price: u64,
    pub confidence: u64,
    pub price_change_bps: i64,
    pub timestamp: i64,
    pub publish_time: i64,
}

#[event]
pub struct CircuitBreakerTriggered {
    pub trigger_reason: String,
    pub severity: String,
    pub actions_taken: Vec<String>,
    pub timestamp: i64,
}

#[event]
pub struct CircuitBreakerReset {
    pub reset_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyPauseActivated {
    pub activated_by: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyPauseDeactivated {
    pub deactivated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TreasuryWithdrawal {
    pub treasury_type: String,
    pub amount: u64,
    pub recipient: Pubkey,
    pub purpose: String,
    pub timestamp: i64,
}

#[event]
pub struct ParameterUpdated {
    pub parameter: String,
    pub old_value: String,
    pub new_value: String,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub amount: u64,
    pub recipient: Pubkey,
    pub new_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct AggregatedPriceUpdated {
    pub old_price: u64,
    pub new_price: u64,
    pub avg_confidence: u64,
    pub divergence_bps: u64,
    pub price_sources: u8,
    pub price_change_bps: i64,
    pub timestamp: i64,
}

#[event]
pub struct PIDControllerInitialized {
    pub authority: Pubkey,
    pub kp: i64,
    pub ki: i64,
    pub kd: i64,
    pub target_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct PIDSupplyAdjusted {
    pub adjustment_type: String,
    pub amount: u64,
    pub old_supply: u64,
    pub new_supply: u64,
    pub current_price: u64,
    pub target_price: u64,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct PIDParametersUpdated {
    pub kp: i64,
    pub ki: i64,
    pub kd: i64,
    pub target_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct PIDControllerReset {
    pub timestamp: i64,
}