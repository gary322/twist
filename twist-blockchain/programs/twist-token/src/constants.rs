
pub const DECIMALS: u8 = 9;
pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * 10u64.pow(9); // 1B tokens
pub const DECAY_RATE_BPS: u64 = 50; // 0.5% = 50 basis points
pub const TREASURY_SPLIT_BPS: u64 = 9000; // 90% to floor treasury
pub const BUYBACK_THRESHOLD_BPS: u64 = 9700; // 97% of floor price
pub const MIN_STAKE_PERIOD: i64 = 30 * 86400; // 30 days in seconds
pub const MAX_STAKE_PERIOD: i64 = 365 * 86400; // 365 days
pub const DECAY_INTERVAL: i64 = 86400; // 24 hours
pub const ORACLE_CONFIDENCE_THRESHOLD: u64 = 10000; // $0.01 confidence
pub const ORACLE_STALENESS_THRESHOLD: i64 = 60; // 60 seconds

// Seeds for PDA derivation
pub const PROGRAM_STATE_SEED: &[u8] = b"program_state";
pub const STAKE_STATE_SEED: &[u8] = b"stake_state";
pub const STAKE_VAULT_SEED: &[u8] = b"stake_vault";
pub const FLOOR_TREASURY_SEED: &[u8] = b"floor_treasury";
pub const OPS_TREASURY_SEED: &[u8] = b"ops_treasury";
pub const VESTING_SEED: &[u8] = b"vesting";
pub const VESTING_VAULT_SEED: &[u8] = b"vesting_vault";
pub const BRIDGE_ESCROW_SEED: &[u8] = b"bridge_escrow";
pub const LIQUIDITY_POSITION_SEED: &[u8] = b"liquidity_position";
pub const PID_CONTROLLER_SEED: &[u8] = b"pid_controller";
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";

// Staking APY tiers (in basis points)
pub const APY_30_DAYS: u64 = 1000; // 10%
pub const APY_90_DAYS: u64 = 2000; // 20%
pub const APY_180_DAYS: u64 = 3500; // 35%
pub const APY_365_DAYS: u64 = 6700; // 67%

// Limits
pub const MAX_DAILY_BUYBACK_DEFAULT: u64 = 50_000 * 1_000_000; // $50k USDC
pub const MIN_BUYBACK_AMOUNT: u64 = 100 * 1_000_000; // $100 USDC
pub const MAX_TRANSACTION_SIZE_EMERGENCY: u64 = 10_000 * 1_000_000; // $10k during emergency

// Circuit breaker thresholds
pub const PRICE_VOLATILITY_THRESHOLD: f64 = 0.5; // 50%
pub const VOLUME_SPIKE_MULTIPLIER: u64 = 10; // 10x normal volume
pub const SUPPLY_CHANGE_THRESHOLD_BPS: u64 = 200; // 2% daily change
pub const ORACLE_DIVERGENCE_THRESHOLD_BPS: u64 = 500; // 5% divergence