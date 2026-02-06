// programs/influencer-staking/src/lib.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use std::convert::TryInto;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod influencer_staking {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        revenue_share_bps: u16, // 0-5000 (0-50%)
        min_stake: u64,
    ) -> Result<()> {
        require!(
            revenue_share_bps <= 5000,
            ErrorCode::InvalidRevenueShare
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
            pool.staker_count += 1;
        }

        // Calculate pending rewards before stake changes
        let pending = calculate_pending_rewards(
            stake_account,
            pool,
            clock.unix_timestamp,
        )?;
        stake_account.pending_rewards += pending;

        // Update stake
        stake_account.amount += amount;
        pool.total_staked += amount;

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

        require!(amount <= stake_account.amount, ErrorCode::InsufficientStake);

        let clock = Clock::get()?;

        // Calculate and add pending rewards
        let pending = calculate_pending_rewards(
            stake_account,
            pool,
            clock.unix_timestamp,
        )?;
        stake_account.pending_rewards += pending;

        // Update stakes
        stake_account.amount -= amount;
        pool.total_staked -= amount;

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
            pool.staker_count -= 1;
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

        // Calculate staker rewards
        let staker_rewards = earning_amount
            .checked_mul(pool.revenue_share_bps as u64)
            .unwrap()
            .checked_div(10000)
            .unwrap();

        // Update pool rewards
        pool.pending_rewards += staker_rewards;
        pool.total_rewards_distributed += staker_rewards;

        let influencer_share = earning_amount - staker_rewards;

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

        let clock = Clock::get()?;

        // Calculate all pending rewards
        let pending_from_pool = calculate_pending_rewards(
            stake_account,
            pool,
            clock.unix_timestamp,
        )?;

        let total_claimable = stake_account.pending_rewards + pending_from_pool;
        require!(total_claimable > 0, ErrorCode::NoRewardsToClaim);

        // Reset pending rewards
        stake_account.pending_rewards = 0;
        stake_account.last_claim = clock.unix_timestamp;
        stake_account.total_claimed += total_claimable;

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
        require!(new_share_bps <= 5000, ErrorCode::InvalidRevenueShare);

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
}

// Account structures
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

// Context structures
#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 32 + 8 + 4 + 2 + 8 + 8 + 8 + 8 + 1 + 1,
        seeds = [b"pool", influencer.key().as_ref()],
        bump
    )]
    pub staking_pool: Account<'info, StakingPool>,
    pub influencer: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = staking_pool,
        seeds = [b"vault", staking_pool.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct StakeOnInfluencer<'info> {
    #[account(mut)]
    pub staking_pool: Account<'info, StakingPool>,
    #[account(
        init_if_needed,
        payer = staker,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8,
        seeds = [b"stake", staking_pool.key().as_ref(), staker.key().as_ref()],
        bump
    )]
    pub stake_account: Account<'info, StakeAccount>,
    #[account(mut)]
    pub staker: Signer<'info>,
    #[account(
        mut,
        constraint = staker_tokens.owner == staker.key(),
        constraint = staker_tokens.mint == staking_pool.mint
    )]
    pub staker_tokens: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = vault.key() == staking_pool.vault
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub staking_pool: Account<'info, StakingPool>,
    #[account(
        mut,
        seeds = [b"stake", staking_pool.key().as_ref(), staker.key().as_ref()],
        bump,
        constraint = stake_account.pool == staking_pool.key()
    )]
    pub stake_account: Account<'info, StakeAccount>,
    pub staker: Signer<'info>,
    #[account(
        mut,
        constraint = staker_tokens.owner == staker.key(),
        constraint = staker_tokens.mint == staking_pool.mint
    )]
    pub staker_tokens: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = vault.key() == staking_pool.vault
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(mut)]
    pub staking_pool: Account<'info, StakingPool>,
    #[account(
        constraint = distributor.key() == staking_pool.influencer
    )]
    pub distributor: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    pub staking_pool: Account<'info, StakingPool>,
    #[account(
        mut,
        seeds = [b"stake", staking_pool.key().as_ref(), staker.key().as_ref()],
        bump,
        constraint = stake_account.pool == staking_pool.key()
    )]
    pub stake_account: Account<'info, StakeAccount>,
    pub staker: Signer<'info>,
    #[account(
        mut,
        constraint = staker_tokens.owner == staker.key(),
        constraint = staker_tokens.mint == staking_pool.mint
    )]
    pub staker_tokens: Account<'info, TokenAccount>,
    #[account(mut)]
    pub rewards_treasury: Account<'info, TokenAccount>,
    pub treasury_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdatePool<'info> {
    #[account(
        mut,
        constraint = staking_pool.influencer == authority.key()
    )]
    pub staking_pool: Account<'info, StakingPool>,
    pub authority: Signer<'info>,
}

// Helper functions
fn calculate_pending_rewards(
    stake: &StakeAccount,
    pool: &StakingPool,
    _current_time: i64,
) -> Result<u64> {
    if pool.total_staked == 0 || stake.amount == 0 {
        return Ok(0);
    }

    // Calculate proportional share of pending rewards
    let share = (stake.amount as u128)
        .checked_mul(pool.pending_rewards as u128)
        .unwrap()
        .checked_div(pool.total_staked as u128)
        .unwrap() as u64;

    Ok(share)
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

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Revenue share cannot exceed 50%")]
    InvalidRevenueShare,
    #[msg("Pool is not active")]
    PoolInactive,
    #[msg("Stake amount below minimum")]
    BelowMinStake,
    #[msg("Insufficient stake balance")]
    InsufficientStake,
    #[msg("No stakers in pool")]
    NoStakers,
    #[msg("No rewards to claim")]
    NoRewardsToClaim,
}

// Events
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