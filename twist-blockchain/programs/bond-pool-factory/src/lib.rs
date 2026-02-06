// bond-pool-factory/src/lib.rs
use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("BondPoo1111111111111111111111111111111111111");

#[program]
pub mod bond_pool_factory {
    use super::*;

    /// Initialize the factory state (one-time setup)
    pub fn initialize_factory(
        ctx: Context<InitializeFactory>,
        params: InitializeFactoryParams,
    ) -> Result<()> {
        instructions::initialize_factory::handler(ctx, params)
    }

    /// Create a new bond pool for a website
    pub fn create_bond_pool(
        ctx: Context<CreateBondPool>,
        params: CreateBondPoolParams,
    ) -> Result<()> {
        instructions::create_bond_pool::handler(ctx, params)
    }

    /// Stake TWIST tokens in a bond pool
    pub fn stake_in_pool(
        ctx: Context<StakeInPool>,
        amount: u64,
    ) -> Result<()> {
        instructions::stake_in_pool::handler(ctx, amount)
    }

    /// Distribute yield from page burns (90% burn, 10% to stakers)
    pub fn distribute_yield(
        ctx: Context<DistributeYield>,
        burn_amount: u64,
    ) -> Result<()> {
        instructions::distribute_yield::handler(ctx, burn_amount)
    }

    /// Claim accumulated rewards
    pub fn claim_rewards(
        ctx: Context<ClaimRewards>,
    ) -> Result<()> {
        instructions::claim_rewards::handler(ctx)
    }

    /// Withdraw stake after unlock period
    pub fn withdraw_stake(
        ctx: Context<WithdrawStake>,
        shares_to_withdraw: u64,
    ) -> Result<()> {
        instructions::withdraw_stake::handler(ctx, shares_to_withdraw)
    }

    /// Update pool parameters (admin only)
    pub fn update_pool_params(
        ctx: Context<UpdatePoolParams>,
        params: UpdatePoolParamsData,
    ) -> Result<()> {
        instructions::update_pool_params::handler(ctx, params)
    }

    /// Pause/unpause a pool in case of emergency
    pub fn set_pool_paused(
        ctx: Context<SetPoolPaused>,
        paused: bool,
    ) -> Result<()> {
        instructions::set_pool_paused::handler(ctx, paused)
    }

    /// Unwrap sector tokens early with penalty
    pub fn early_unwrap(
        ctx: Context<EarlyUnwrap>,
        amount: u64,
    ) -> Result<()> {
        instructions::early_unwrap::handler(ctx, amount)
    }
}