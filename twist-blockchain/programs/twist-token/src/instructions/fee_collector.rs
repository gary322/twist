use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Burn};

use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializeFeeCollector<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        init,
        payer = authority,
        space = FeeCollectorState::LEN,
        seeds = [b"fee_collector"],
        bump
    )]
    pub fee_collector: Account<'info, FeeCollectorState>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_fee_collector_handler(
    ctx: Context<InitializeFeeCollector>,
    params: FeeCollectorParams,
) -> Result<()> {
    let fee_collector = &mut ctx.accounts.fee_collector;
    
    // Validate distribution shares sum to 100%
    let total_shares = params.floor_treasury_share_bps +
        params.ops_treasury_share_bps +
        params.staking_rewards_share_bps +
        params.burn_share_bps;
    
    require!(
        total_shares == 10000,
        TwistError::InvalidAmount
    );
    
    // Initialize fee collector
    fee_collector.authority = ctx.accounts.authority.key();
    fee_collector.bump = ctx.bumps.fee_collector;
    
    // Set fee configuration
    fee_collector.trading_fee_bps = params.trading_fee_bps;
    fee_collector.withdrawal_fee_bps = params.withdrawal_fee_bps;
    fee_collector.bridge_fee_bps = params.bridge_fee_bps;
    fee_collector.liquidity_fee_bps = params.liquidity_fee_bps;
    
    // Set distribution configuration
    fee_collector.floor_treasury_share_bps = params.floor_treasury_share_bps;
    fee_collector.ops_treasury_share_bps = params.ops_treasury_share_bps;
    fee_collector.staking_rewards_share_bps = params.staking_rewards_share_bps;
    fee_collector.burn_share_bps = params.burn_share_bps;
    
    fee_collector.min_distribution_amount = params.min_distribution_amount;
    
    msg!("Fee collector initialized");
    msg!("Trading fee: {} bps", params.trading_fee_bps);
    msg!("Distribution: Floor {}%, Ops {}%, Staking {}%, Burn {}%",
        params.floor_treasury_share_bps / 100,
        params.ops_treasury_share_bps / 100,
        params.staking_rewards_share_bps / 100,
        params.burn_share_bps / 100
    );
    
    Ok(())
}

#[derive(Accounts)]
pub struct CollectFee<'info> {
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"fee_collector"],
        bump,
    )]
    pub fee_collector: Account<'info, FeeCollectorState>,
    
    #[account(
        mut,
        constraint = fee_account.owner == fee_payer.key() @ TwistError::InvalidAccount,
        constraint = fee_account.mint == program_state.mint @ TwistError::InvalidAccount,
    )]
    pub fee_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"fee_vault"],
        bump,
        token::mint = program_state.mint,
        token::authority = fee_collector,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    
    #[account(
        seeds = [PROGRAM_STATE_SEED],
        bump,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    pub token_program: Program<'info, Token>,
}

pub fn collect_fee_handler(
    ctx: Context<CollectFee>,
    fee_type: FeeType,
    amount: u64,
) -> Result<()> {
    let fee_collector = &mut ctx.accounts.fee_collector;
    let clock = Clock::get()?;
    
    require!(
        amount > 0,
        TwistError::InvalidAmount
    );
    
    // Transfer fee to vault
    let cpi_accounts = token::Transfer {
        from: ctx.accounts.fee_account.to_account_info(),
        to: ctx.accounts.fee_vault.to_account_info(),
        authority: ctx.accounts.fee_payer.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, amount)?;
    
    // Record fee
    fee_collector.record_fee(fee_type.clone(), amount);
    
    // Emit event
    emit!(ParameterUpdated {
        parameter: format!("fee_collected_{:?}", fee_type),
        old_value: (fee_collector.pending_distribution - amount).to_string(),
        new_value: fee_collector.pending_distribution.to_string(),
        updated_by: ctx.accounts.fee_payer.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Collected {} TWIST in {:?} fees", amount, fee_type);
    msg!("Total pending distribution: {}", fee_collector.pending_distribution);
    
    Ok(())
}

#[derive(Accounts)]
pub struct DistributeFees<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"fee_collector"],
        bump,
    )]
    pub fee_collector: Account<'info, FeeCollectorState>,
    
    #[account(
        mut,
        seeds = [b"fee_vault"],
        bump,
        token::mint = program_state.mint,
        token::authority = fee_collector,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [FLOOR_TREASURY_SEED],
        bump,
        token::mint = program_state.mint,
        token::authority = program_state,
    )]
    pub floor_treasury: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [OPS_TREASURY_SEED],
        bump,
        token::mint = program_state.mint,
        token::authority = program_state,
    )]
    pub ops_treasury: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [STAKE_VAULT_SEED],
        bump,
        token::mint = program_state.mint,
        token::authority = program_state,
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(mut)]
    pub mint: Account<'info, token::Mint>,
    
    pub token_program: Program<'info, Token>,
}

pub fn distribute_fees_handler(ctx: Context<DistributeFees>) -> Result<()> {
    let fee_collector = &mut ctx.accounts.fee_collector;
    let fee_vault = &ctx.accounts.fee_vault;
    let clock = Clock::get()?;
    
    // Check if we have enough to distribute
    require!(
        fee_vault.amount >= fee_collector.min_distribution_amount,
        TwistError::InvalidAmount
    );
    
    let distribution_amount = fee_vault.amount;
    let distribution = fee_collector.calculate_distribution_amounts(distribution_amount);
    
    let seeds = &[
        b"fee_collector".as_ref(),
        &[fee_collector.bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    // Transfer to floor treasury
    if distribution.floor_treasury > 0 {
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.fee_vault.to_account_info(),
            to: ctx.accounts.floor_treasury.to_account_info(),
            authority: fee_collector.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        token::transfer(cpi_ctx, distribution.floor_treasury)?;
    }
    
    // Transfer to ops treasury
    if distribution.ops_treasury > 0 {
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.fee_vault.to_account_info(),
            to: ctx.accounts.ops_treasury.to_account_info(),
            authority: fee_collector.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        token::transfer(cpi_ctx, distribution.ops_treasury)?;
    }
    
    // Transfer to staking vault
    if distribution.staking_rewards > 0 {
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.fee_vault.to_account_info(),
            to: ctx.accounts.stake_vault.to_account_info(),
            authority: fee_collector.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        token::transfer(cpi_ctx, distribution.staking_rewards)?;
    }
    
    // Burn tokens
    if distribution.burn_amount > 0 {
        let cpi_accounts = Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.fee_vault.to_account_info(),
            authority: fee_collector.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        token::burn(cpi_ctx, distribution.burn_amount)?;
        
        // Update burned tracking
        ctx.accounts.program_state.total_burned = ctx.accounts.program_state.total_burned
            .saturating_add(distribution.burn_amount as u128);
    }
    
    // Update tracking
    fee_collector.total_distributed = fee_collector.total_distributed
        .saturating_add(distribution_amount as u128);
    fee_collector.last_distribution_timestamp = clock.unix_timestamp;
    fee_collector.distributions_count += 1;
    fee_collector.pending_distribution = 0;
    
    // Update floor liquidity
    ctx.accounts.program_state.floor_liquidity = ctx.accounts.floor_treasury.amount;
    
    // Emit event
    emit!(ParameterUpdated {
        parameter: "fee_distribution".to_string(),
        old_value: format!("pending: {}", distribution_amount),
        new_value: format!("distributed: floor={}, ops={}, stake={}, burn={}",
            distribution.floor_treasury,
            distribution.ops_treasury,
            distribution.staking_rewards,
            distribution.burn_amount
        ),
        updated_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Distributed {} TWIST in fees", distribution_amount);
    msg!("Floor: {}, Ops: {}, Staking: {}, Burn: {}",
        distribution.floor_treasury,
        distribution.ops_treasury,
        distribution.staking_rewards,
        distribution.burn_amount
    );
    
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFeeParameters<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"fee_collector"],
        bump,
        constraint = fee_collector.authority == authority.key() @ TwistError::Unauthorized,
    )]
    pub fee_collector: Account<'info, FeeCollectorState>,
}

pub fn update_fee_parameters_handler(
    ctx: Context<UpdateFeeParameters>,
    params: FeeCollectorParams,
) -> Result<()> {
    let fee_collector = &mut ctx.accounts.fee_collector;
    let clock = Clock::get()?;
    
    // Validate distribution shares
    let total_shares = params.floor_treasury_share_bps +
        params.ops_treasury_share_bps +
        params.staking_rewards_share_bps +
        params.burn_share_bps;
    
    require!(
        total_shares == 10000,
        TwistError::InvalidAmount
    );
    
    // Update parameters
    fee_collector.trading_fee_bps = params.trading_fee_bps;
    fee_collector.withdrawal_fee_bps = params.withdrawal_fee_bps;
    fee_collector.bridge_fee_bps = params.bridge_fee_bps;
    fee_collector.liquidity_fee_bps = params.liquidity_fee_bps;
    
    fee_collector.floor_treasury_share_bps = params.floor_treasury_share_bps;
    fee_collector.ops_treasury_share_bps = params.ops_treasury_share_bps;
    fee_collector.staking_rewards_share_bps = params.staking_rewards_share_bps;
    fee_collector.burn_share_bps = params.burn_share_bps;
    
    fee_collector.min_distribution_amount = params.min_distribution_amount;
    
    emit!(ParameterUpdated {
        parameter: "fee_parameters".to_string(),
        old_value: "various".to_string(),
        new_value: format!("trading={}bps, withdrawal={}bps, bridge={}bps, liquidity={}bps",
            params.trading_fee_bps,
            params.withdrawal_fee_bps,
            params.bridge_fee_bps,
            params.liquidity_fee_bps
        ),
        updated_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Updated fee parameters");
    
    Ok(())
}