use anchor_lang::prelude::*;

pub mod constants;
pub mod defi;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod processors;
pub mod state;
pub mod utils;

use crate::instructions::*;
use crate::state::{PIDControllerParams, CircuitBreakerParams, CircuitBreakerSeverity, FeeCollectorParams, FeeType, MultisigParams, TransactionAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod twist_token {
    use super::*;

    /// Initialize the TWIST token system
    pub fn initialize(
        ctx: Context<Initialize>,
        params: InitializeParams,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Mint new tokens (restricted to authority)
    pub fn mint_tokens(
        ctx: Context<MintTokens>,
        params: MintParams,
    ) -> Result<()> {
        instructions::mint::handler(ctx, params)
    }

    /// Apply daily decay to all token balances
    pub fn apply_decay(ctx: Context<ApplyDecay>) -> Result<()> {
        instructions::decay::handler(ctx)
    }

    /// Stake TWIST tokens for rewards
    pub fn stake(
        ctx: Context<Stake>,
        amount: u64,
        lock_period: i64,
    ) -> Result<()> {
        instructions::stake::handler(ctx, amount, lock_period)
    }

    /// Unstake TWIST tokens
    pub fn unstake(
        ctx: Context<Unstake>,
        stake_index: usize,
    ) -> Result<()> {
        instructions::unstake::handler(ctx, stake_index)
    }

    /// Claim staking rewards
    pub fn claim_rewards(
        ctx: Context<ClaimRewards>,
        stake_index: usize,
    ) -> Result<()> {
        instructions::claim_rewards::handler(ctx, stake_index)
    }

    /// Execute automatic market buyback
    pub fn execute_buyback(
        ctx: Context<ExecuteBuyback>,
        max_usdc_amount: u64,
    ) -> Result<()> {
        instructions::buyback::handler(ctx, max_usdc_amount)
    }

    /// Burn tokens permanently
    pub fn burn_tokens(
        ctx: Context<BurnTokens>,
        amount: u64,
        reason: String,
    ) -> Result<()> {
        instructions::burn::handler(ctx, amount, reason)
    }

    /// Update oracle price feeds
    pub fn update_oracle(
        ctx: Context<UpdateOracle>,
    ) -> Result<()> {
        instructions::oracle_update::handler(ctx)
    }
    
    /// Update price using multiple oracle feeds (aggregated)
    pub fn update_price_aggregated(
        ctx: Context<UpdatePriceAggregated>,
    ) -> Result<()> {
        instructions::update_price_aggregated::handler(ctx)
    }

    /// Create vesting schedule
    pub fn create_vesting_schedule(
        ctx: Context<CreateVestingSchedule>,
        params: VestingParams,
    ) -> Result<()> {
        instructions::vesting::create_handler(ctx, params)
    }

    /// Release vested tokens
    pub fn release_vested_tokens(
        ctx: Context<ReleaseVestedTokens>,
    ) -> Result<()> {
        instructions::vesting::release_handler(ctx)
    }

    /// Revoke vesting schedule
    pub fn revoke_vesting(
        ctx: Context<RevokeVesting>,
    ) -> Result<()> {
        instructions::vesting::revoke_handler(ctx)
    }

    /// Initiate bridge transfer
    pub fn initiate_bridge_transfer(
        ctx: Context<InitiateBridge>,
        amount: u64,
        target_chain: u16,
        target_address: [u8; 32],
    ) -> Result<()> {
        instructions::bridge::initiate_handler(ctx, amount, target_chain, target_address)
    }

    /// Complete bridge transfer
    pub fn complete_bridge_transfer(
        ctx: Context<CompleteBridge>,
        vaa_data: Vec<u8>,
    ) -> Result<()> {
        instructions::bridge::complete_handler(ctx, vaa_data)
    }

    /// Trigger circuit breaker
    pub fn trigger_circuit_breaker(
        ctx: Context<TriggerCircuitBreaker>,
        reason: String,
    ) -> Result<()> {
        instructions::admin::trigger_circuit_breaker_handler(ctx, reason)
    }

    /// Reset circuit breaker
    pub fn reset_circuit_breaker(
        ctx: Context<ResetCircuitBreaker>,
    ) -> Result<()> {
        instructions::admin::reset_circuit_breaker_handler(ctx)
    }

    /// Set emergency pause
    pub fn set_emergency_pause(
        ctx: Context<SetEmergencyPause>,
        paused: bool,
        reason: String,
    ) -> Result<()> {
        instructions::admin::set_emergency_pause_handler(ctx, paused, reason)
    }

    /// Update program parameters
    pub fn update_parameters(
        ctx: Context<UpdateParameters>,
        params: UpdateParams,
    ) -> Result<()> {
        instructions::admin::update_parameters_handler(ctx, params)
    }
    
    /// Update oracle price feeds
    pub fn update_oracles(
        ctx: Context<UpdateOracles>,
    ) -> Result<()> {
        instructions::admin::update_oracles_handler(ctx)
    }
    
    /// Transfer program authority
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
    ) -> Result<()> {
        instructions::admin::transfer_authority_handler(ctx)
    }

    /// Withdraw from treasury
    pub fn withdraw_treasury(
        ctx: Context<WithdrawTreasury>,
        amount: u64,
        purpose: String,
    ) -> Result<()> {
        instructions::treasury_ops::withdraw_handler(ctx, amount, purpose)
    }
    
    /// Rebalance treasury allocations
    pub fn rebalance_treasury(
        ctx: Context<RebalanceTreasury>,
    ) -> Result<()> {
        instructions::treasury_ops::rebalance_handler(ctx)
    }
    
    /// Allocate collected fees to treasuries
    pub fn allocate_fees(
        ctx: Context<AllocateFees>,
    ) -> Result<()> {
        instructions::treasury_ops::allocate_fees_handler(ctx)
    }

    /// Initialize liquidity pool
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        params: PoolParams,
    ) -> Result<()> {
        instructions::liquidity::initialize_pool_handler(ctx, params)
    }

    /// Add liquidity to pool
    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        twist_amount: u64,
        usdc_amount: u64,
        slippage_bps: u64,
    ) -> Result<()> {
        instructions::liquidity::add_liquidity_handler(ctx, twist_amount, usdc_amount, slippage_bps)
    }

    /// Remove liquidity from pool
    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        liquidity_amount: u64,
        min_twist: u64,
        min_usdc: u64,
    ) -> Result<()> {
        instructions::liquidity::remove_liquidity_handler(ctx, liquidity_amount, min_twist, min_usdc)
    }
    
    /// Rebalance liquidity position
    pub fn rebalance_position(
        ctx: Context<RebalancePosition>,
        position_index: u8,
        params: RebalanceParams,
    ) -> Result<()> {
        instructions::liquidity::rebalance_position_handler(ctx, position_index, params)
    }
    
    /// Auto-compound fees into liquidity
    pub fn auto_compound(
        ctx: Context<AutoCompound>,
        position_index: u8,
    ) -> Result<()> {
        instructions::liquidity::auto_compound_handler(ctx, position_index)
    }
    
    /// Initialize PID controller for dynamic supply regulation
    pub fn initialize_pid_controller(
        ctx: Context<InitializePIDController>,
        params: PIDControllerParams,
    ) -> Result<()> {
        instructions::pid_control::initialize_handler(ctx, params)
    }
    
    /// Execute PID control to adjust supply based on price
    pub fn execute_pid_control(
        ctx: Context<ExecutePIDControl>,
    ) -> Result<()> {
        instructions::pid_control::execute_handler(ctx)
    }
    
    /// Update PID controller parameters
    pub fn update_pid_parameters(
        ctx: Context<UpdatePIDParameters>,
        params: PIDControllerParams,
    ) -> Result<()> {
        instructions::pid_control::update_parameters_handler(ctx, params)
    }
    
    /// Reset PID controller state
    pub fn reset_pid_controller(
        ctx: Context<ResetPIDController>,
    ) -> Result<()> {
        instructions::pid_control::reset_handler(ctx)
    }
    
    /// Initialize circuit breaker system
    pub fn initialize_circuit_breaker(
        ctx: Context<InitializeCircuitBreaker>,
        params: CircuitBreakerParams,
    ) -> Result<()> {
        instructions::circuit_breaker::initialize_handler(ctx, params)
    }
    
    /// Check circuit breaker conditions
    pub fn check_circuit_breaker(
        ctx: Context<CheckCircuitBreaker>,
    ) -> Result<()> {
        instructions::circuit_breaker::check_conditions_handler(ctx)
    }
    
    /// Manually trip circuit breaker
    pub fn manual_trip_circuit_breaker(
        ctx: Context<ManualTripCircuitBreaker>,
        reason: String,
        severity: CircuitBreakerSeverity,
    ) -> Result<()> {
        instructions::circuit_breaker::manual_trip_handler(ctx, reason, severity)
    }
    
    /// Manually reset circuit breaker
    pub fn manual_reset_circuit_breaker(
        ctx: Context<ManualResetCircuitBreaker>,
    ) -> Result<()> {
        instructions::circuit_breaker::manual_reset_handler(ctx)
    }
    
    /// Initialize fee collector
    pub fn initialize_fee_collector(
        ctx: Context<InitializeFeeCollector>,
        params: FeeCollectorParams,
    ) -> Result<()> {
        instructions::fee_collector::initialize_fee_collector_handler(ctx, params)
    }
    
    /// Collect fees from various sources
    pub fn collect_fee(
        ctx: Context<CollectFee>,
        fee_type: FeeType,
        amount: u64,
    ) -> Result<()> {
        instructions::fee_collector::collect_fee_handler(ctx, fee_type, amount)
    }
    
    /// Distribute collected fees
    pub fn distribute_fees(
        ctx: Context<DistributeFees>,
    ) -> Result<()> {
        instructions::fee_collector::distribute_fees_handler(ctx)
    }
    
    /// Update fee parameters
    pub fn update_fee_parameters(
        ctx: Context<UpdateFeeParameters>,
        params: FeeCollectorParams,
    ) -> Result<()> {
        instructions::fee_collector::update_fee_parameters_handler(ctx, params)
    }
    
    /// Initialize multisig
    pub fn initialize_multisig(
        ctx: Context<InitializeMultisig>,
        params: MultisigParams,
    ) -> Result<()> {
        instructions::multisig::initialize_multisig_handler(ctx, params)
    }
    
    /// Propose a multisig transaction
    pub fn propose_transaction(
        ctx: Context<ProposeTransaction>,
        instruction_data: Vec<u8>,
        instruction_program_id: Pubkey,
        instruction_accounts: Vec<TransactionAccount>,
        title: String,
        description: String,
        delay_seconds: i64,
    ) -> Result<()> {
        instructions::multisig::propose_transaction_handler(
            ctx,
            instruction_data,
            instruction_program_id,
            instruction_accounts,
            title,
            description,
            delay_seconds,
        )
    }
    
    /// Approve a multisig transaction
    pub fn approve_transaction(
        ctx: Context<ApproveTransaction>,
    ) -> Result<()> {
        instructions::multisig::approve_transaction_handler(ctx)
    }
    
    /// Execute a multisig transaction
    pub fn execute_transaction<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteTransaction<'info>>,
    ) -> Result<()> {
        instructions::multisig::execute_transaction_handler(ctx)
    }
    
    /// Cancel a multisig transaction
    pub fn cancel_transaction(
        ctx: Context<CancelTransaction>,
    ) -> Result<()> {
        instructions::multisig::cancel_transaction_handler(ctx)
    }
}