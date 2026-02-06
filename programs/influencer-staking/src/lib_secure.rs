// Secure version of the staking program with audit fixes applied
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use std::convert::TryInto;

declare_id!("STAKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

// Constants
const ABSOLUTE_MIN_STAKE: u64 = 100_000_000; // 0.1 TWIST minimum
const MAX_REVENUE_SHARE_BPS: u16 = 5000; // 50% maximum
const ADMIN_PUBKEY: Pubkey = pubkey!("ADMINxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

#[program]
pub mod influencer_staking_secure {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        revenue_share_bps: u16,
        min_stake: u64,
    ) -> Result<()> {
        require!(
            revenue_share_bps <= MAX_REVENUE_SHARE_BPS,
            ErrorCode::InvalidRevenueShare
        );
        
        require!(
            min_stake >= ABSOLUTE_MIN_STAKE,
            ErrorCode::MinStakeTooLow
        );

        let pool = &mut ctx.accounts.staking_pool;
        pool.influencer = ctx.accounts.influencer.key();
        pool.mint = ctx.accounts.mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.total_staked = 0;
        pool.staker_count = 0;
        pool.revenue_share_bps = revenue_share_bps;
        pool.min_stake = min_stake;
        pool.total_rewards_distributed = 0;
        pool.pending_rewards = 0;
        pool.created_at = Clock::get()?.unix_timestamp;
        pool.is_active = true;
        pool.is_paused = false; // New field for pause mechanism
        pool.bump = ctx.bumps.staking_pool;

        emit!(PoolCreated {
            pool: pool.key(),
            influencer: pool.influencer,
            revenue_share_bps,
            min_stake,
        });

        Ok(())
    }

    pub fn stake_on_influencer(
        ctx: Context<StakeOnInfluencer>,
        amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.staking_pool;
        
        require!(pool.is_active, ErrorCode::PoolInactive);
        require!(!pool.is_paused, ErrorCode::PoolPaused);
        require!(amount >= pool.min_stake, ErrorCode::BelowMinStake);

        let stake_account = &mut ctx.accounts.stake_account;
        let clock = Clock::get()?;

        // Initialize stake account if new
        if stake_account.amount == 0 {
            stake_account.staker = ctx.accounts.staker.key();
            stake_account.pool = pool.key();
            stake_account.staked_at = clock.unix_timestamp;
            stake_account.last_claim = clock.unix_timestamp;
            stake_account.total_claimed = 0;
            stake_account.pending_rewards = 0;
            pool.staker_count = pool.staker_count.checked_add(1)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        // Calculate pending rewards before stake changes
        let pending = calculate_pending_rewards_safe(
            stake_account,
            pool,
            clock.unix_timestamp,
        )?;
        stake_account.pending_rewards = stake_account.pending_rewards
            .checked_add(pending)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update stake with overflow protection
        stake_account.amount = stake_account.amount
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.total_staked = pool.total_staked
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;

        // Transfer tokens to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.staker_tokens.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.staker.to_account_info(),
                },
            ),
            amount,
        )?;

        // Update influencer tier based on total staked
        let new_tier = calculate_tier(pool.total_staked);

        emit!(UserStaked {
            staker: ctx.accounts.staker.key(),
            influencer: pool.influencer,
            amount,
            total_pool_stake: pool.total_staked,
            new_tier,
            staker_count: pool.staker_count,
        });

        Ok(())
    }

    pub fn unstake(
        ctx: Context<Unstake>,
        amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.staking_pool;
        let stake_account = &mut ctx.accounts.stake_account;

        require!(!pool.is_paused, ErrorCode::PoolPaused);
        require!(amount <= stake_account.amount, ErrorCode::InsufficientStake);

        let clock = Clock::get()?;

        // Calculate and add pending rewards
        let pending = calculate_pending_rewards_safe(
            stake_account,
            pool,
            clock.unix_timestamp,
        )?;
        stake_account.pending_rewards = stake_account.pending_rewards
            .checked_add(pending)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update stakes with underflow protection
        stake_account.amount = stake_account.amount
            .checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.total_staked = pool.total_staked
            .checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;

        // Transfer tokens back to staker
        let seeds = &[
            b"pool",
            pool.influencer.as_ref(),
            &[pool.bump],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.staker_tokens.to_account_info(),
                    authority: pool.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        // Update staker count if fully unstaked
        if stake_account.amount == 0 {
            pool.staker_count = pool.staker_count
                .checked_sub(1)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        emit!(UserUnstaked {
            staker: ctx.accounts.staker.key(),
            amount,
            remaining_stake: stake_account.amount,
        });

        Ok(())
    }

    pub fn distribute_rewards(
        ctx: Context<DistributeRewards>,
        earning_amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.staking_pool;
        
        require!(pool.total_staked > 0, ErrorCode::NoStakers);
        require!(!pool.is_paused, ErrorCode::PoolPaused);

        // Calculate staker rewards with overflow protection
        let staker_rewards = earning_amount
            .checked_mul(pool.revenue_share_bps as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update pool rewards
        pool.pending_rewards = pool.pending_rewards
            .checked_add(staker_rewards)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.total_rewards_distributed = pool.total_rewards_distributed
            .checked_add(staker_rewards)
            .ok_or(ErrorCode::MathOverflow)?;

        let influencer_share = earning_amount
            .checked_sub(staker_rewards)
            .ok_or(ErrorCode::MathOverflow)?;

        emit!(RewardsDistributed {
            pool: pool.key(),
            total_earned: earning_amount,
            staker_share: staker_rewards,
            influencer_share,
            total_staked: pool.total_staked,
        });

        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let pool = &ctx.accounts.staking_pool;
        let stake_account = &mut ctx.accounts.stake_account;

        require!(!pool.is_paused, ErrorCode::PoolPaused);

        let clock = Clock::get()?;

        // Calculate all pending rewards
        let pending_from_pool = calculate_pending_rewards_safe(
            stake_account,
            pool,
            clock.unix_timestamp,
        )?;

        let total_claimable = stake_account.pending_rewards
            .checked_add(pending_from_pool)
            .ok_or(ErrorCode::MathOverflow)?;
        
        if total_claimable == 0 {
            emit!(ClaimFailed {
                staker: ctx.accounts.staker.key(),
                reason: "No rewards to claim",
                timestamp: clock.unix_timestamp,
            });
            return Err(ErrorCode::NoRewardsToClaim.into());
        }

        // Reset pending rewards
        stake_account.pending_rewards = 0;
        stake_account.last_claim = clock.unix_timestamp;
        stake_account.total_claimed = stake_account.total_claimed
            .checked_add(total_claimable)
            .ok_or(ErrorCode::MathOverflow)?;

        // Transfer rewards from treasury
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.rewards_treasury.to_account_info(),
                    to: ctx.accounts.staker_tokens.to_account_info(),
                    authority: ctx.accounts.treasury_authority.to_account_info(),
                },
            ),
            total_claimable,
        )?;

        emit!(RewardsClaimed {
            staker: ctx.accounts.staker.key(),
            amount: total_claimable,
            total_claimed: stake_account.total_claimed,
        });

        Ok(())
    }

    pub fn update_revenue_share(
        ctx: Context<UpdatePool>,
        new_share_bps: u16,
    ) -> Result<()> {
        // Security fix: Verify caller is the pool's influencer
        require!(
            ctx.accounts.authority.key() == ctx.accounts.staking_pool.influencer,
            ErrorCode::UnauthorizedAccess
        );
        
        require!(new_share_bps <= MAX_REVENUE_SHARE_BPS, ErrorCode::InvalidRevenueShare);

        let pool = &mut ctx.accounts.staking_pool;
        let old_share = pool.revenue_share_bps;
        pool.revenue_share_bps = new_share_bps;

        emit!(PoolUpdated {
            pool: pool.key(),
            old_share_bps: old_share,
            new_share_bps,
        });

        Ok(())
    }

    // New function: Pause pool for emergencies
    pub fn pause_pool(ctx: Context<UpdatePool>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.staking_pool.influencer ||
            ctx.accounts.authority.key() == ADMIN_PUBKEY,
            ErrorCode::UnauthorizedAccess
        );
        
        let pool = &mut ctx.accounts.staking_pool;
        pool.is_paused = true;
        
        emit!(PoolPaused {
            pool: pool.key(),
            paused_by: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }

    // New function: Unpause pool
    pub fn unpause_pool(ctx: Context<UpdatePool>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.staking_pool.influencer ||
            ctx.accounts.authority.key() == ADMIN_PUBKEY,
            ErrorCode::UnauthorizedAccess
        );
        
        let pool = &mut ctx.accounts.staking_pool;
        pool.is_paused = false;
        
        emit!(PoolUnpaused {
            pool: pool.key(),
            unpaused_by: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
}

// Account structures with security improvements
#[account]
pub struct StakingPool {
    pub influencer: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub total_staked: u64,
    pub staker_count: u32,
    pub revenue_share_bps: u16,
    pub min_stake: u64,
    pub total_rewards_distributed: u64,
    pub pending_rewards: u64,
    pub created_at: i64,
    pub is_active: bool,
    pub is_paused: bool, // New field for pause mechanism
    pub bump: u8,
}

#[account]
pub struct StakeAccount {
    pub staker: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub staked_at: i64,
    pub last_claim: i64,
    pub total_claimed: u64,
    pub pending_rewards: u64,
}

// Context definitions
#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = influencer,
        space = 8 + 32 + 32 + 32 + 8 + 4 + 2 + 8 + 8 + 8 + 8 + 1 + 1 + 1,
        seeds = [b"pool", influencer.key().as_ref()],
        bump
    )]
    pub staking_pool: Account<'info, StakingPool>,
    #[account(mut)]
    pub influencer: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = influencer,
        token::mint = mint,
        token::authority = staking_pool,
        seeds = [b"vault", staking_pool.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdatePool<'info> {
    #[account(mut)]
    pub staking_pool: Account<'info, StakingPool>,
    pub authority: Signer<'info>,
}

// Safe reward calculation with overflow protection
fn calculate_pending_rewards_safe(
    stake: &StakeAccount,
    pool: &StakingPool,
    current_time: i64,
) -> Result<u64> {
    if pool.total_staked == 0 || stake.amount == 0 {
        return Ok(0);
    }

    // Use u128 for intermediate calculations to prevent overflow
    let share = (stake.amount as u128)
        .checked_mul(pool.pending_rewards as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(pool.total_staked as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    
    // Ensure result fits in u64
    if share > u64::MAX as u128 {
        return Err(ErrorCode::MathOverflow.into());
    }

    Ok(share as u64)
}

fn calculate_tier(total_staked: u64) -> u8 {
    // Convert to TWIST tokens (9 decimals)
    let staked_tokens = total_staked / 10u64.pow(9);

    match staked_tokens {
        0..=999 => 0,           // Bronze: < 1K
        1000..=9999 => 1,       // Silver: 1K-10K
        10000..=49999 => 2,     // Gold: 10K-50K
        _ => 3,                 // Platinum: 50K+
    }
}

// Enhanced error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Revenue share cannot exceed 50%")]
    InvalidRevenueShare,
    #[msg("Pool is not active")]
    PoolInactive,
    #[msg("Pool is paused")]
    PoolPaused,
    #[msg("Stake amount below minimum")]
    BelowMinStake,
    #[msg("Minimum stake is too low")]
    MinStakeTooLow,
    #[msg("Insufficient stake balance")]
    InsufficientStake,
    #[msg("No stakers in pool")]
    NoStakers,
    #[msg("No rewards to claim")]
    NoRewardsToClaim,
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    #[msg("Math overflow error")]
    MathOverflow,
}

// Additional events for better tracking
#[event]
pub struct PoolPaused {
    pub pool: Pubkey,
    pub paused_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PoolUnpaused {
    pub pool: Pubkey,
    pub unpaused_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ClaimFailed {
    pub staker: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

// Existing events remain the same
#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub influencer: Pubkey,
    pub revenue_share_bps: u16,
    pub min_stake: u64,
}

#[event]
pub struct UserStaked {
    pub staker: Pubkey,
    pub influencer: Pubkey,
    pub amount: u64,
    pub total_pool_stake: u64,
    pub new_tier: u8,
    pub staker_count: u32,
}

#[event]
pub struct UserUnstaked {
    pub staker: Pubkey,
    pub amount: u64,
    pub remaining_stake: u64,
}

#[event]
pub struct RewardsDistributed {
    pub pool: Pubkey,
    pub total_earned: u64,
    pub staker_share: u64,
    pub influencer_share: u64,
    pub total_staked: u64,
}

#[event]
pub struct RewardsClaimed {
    pub staker: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
}

#[event]
pub struct PoolUpdated {
    pub pool: Pubkey,
    pub old_share_bps: u16,
    pub new_share_bps: u16,
}