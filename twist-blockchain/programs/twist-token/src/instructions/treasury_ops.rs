use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(amount: u64, purpose: String)]
pub struct WithdrawTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized,
        constraint = !program_state.emergency_pause @ TwistError::EmergencyPauseActive,
    )]
    pub program_state: Account<'info, ProgramState>,
    
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
        constraint = recipient_account.owner == authority.key() @ TwistError::InvalidAccount,
        constraint = recipient_account.mint == program_state.mint @ TwistError::InvalidAccount,
    )]
    pub recipient_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

pub fn withdraw_handler(
    ctx: Context<WithdrawTreasury>,
    amount: u64,
    purpose: String,
) -> Result<()> {
    let program_state = &ctx.accounts.program_state;
    let ops_treasury = &ctx.accounts.ops_treasury;
    let clock = Clock::get()?;
    
    // Validate withdrawal
    require!(
        amount > 0,
        TwistError::InvalidAmount
    );
    
    require!(
        ops_treasury.amount >= amount,
        TwistError::InsufficientLiquidity
    );
    
    // Validate purpose string
    require!(
        !purpose.is_empty() && purpose.len() <= 200,
        TwistError::InvalidAmount
    );
    
    // Calculate maximum allowed withdrawal (10% of ops treasury per day)
    let max_daily_withdrawal = ops_treasury.amount / 10;
    require!(
        amount <= max_daily_withdrawal,
        TwistError::DailyBuybackLimitExceeded
    );
    
    // Transfer tokens from ops treasury
    let seeds = &[
        PROGRAM_STATE_SEED,
        &[program_state.bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    let cpi_accounts = Transfer {
        from: ctx.accounts.ops_treasury.to_account_info(),
        to: ctx.accounts.recipient_account.to_account_info(),
        authority: program_state.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::transfer(cpi_ctx, amount)?;
    
    // Emit event
    emit!(TreasuryWithdrawal {
        treasury_type: "operations".to_string(),
        amount,
        recipient: ctx.accounts.authority.key(),
        purpose: purpose.clone(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Withdrew {} TWIST from operations treasury", amount);
    msg!("Purpose: {}", purpose);
    msg!("Remaining ops balance: {}", ops_treasury.amount - amount);
    
    Ok(())
}

#[derive(Accounts)]
pub struct RebalanceTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized,
        constraint = !program_state.emergency_pause @ TwistError::EmergencyPauseActive,
    )]
    pub program_state: Account<'info, ProgramState>,
    
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
    
    pub token_program: Program<'info, Token>,
}

pub fn rebalance_handler(ctx: Context<RebalanceTreasury>) -> Result<()> {
    let floor_treasury = &ctx.accounts.floor_treasury;
    let ops_treasury = &ctx.accounts.ops_treasury;
    let clock = Clock::get()?;
    
    // Calculate target balances based on treasury split
    let total_treasury = floor_treasury.amount + ops_treasury.amount;
    let target_floor_amount = (total_treasury * ctx.accounts.program_state.treasury_split_bps as u64) / 10000;
    let target_ops_amount = total_treasury - target_floor_amount;
    
    let seeds = &[
        PROGRAM_STATE_SEED,
        &[ctx.accounts.program_state.bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    // Rebalance if needed
    if floor_treasury.amount < target_floor_amount {
        // Transfer from ops to floor
        let transfer_amount = target_floor_amount - floor_treasury.amount;
        
        require!(
            ops_treasury.amount >= transfer_amount,
            TwistError::InsufficientLiquidity
        );
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.ops_treasury.to_account_info(),
            to: ctx.accounts.floor_treasury.to_account_info(),
            authority: ctx.accounts.program_state.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        token::transfer(cpi_ctx, transfer_amount)?;
        
        msg!("Rebalanced {} TWIST from ops to floor treasury", transfer_amount);
        
    } else if ops_treasury.amount < target_ops_amount {
        // Transfer from floor to ops
        let transfer_amount = target_ops_amount - ops_treasury.amount;
        
        require!(
            floor_treasury.amount >= transfer_amount,
            TwistError::InsufficientLiquidity
        );
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.floor_treasury.to_account_info(),
            to: ctx.accounts.ops_treasury.to_account_info(),
            authority: ctx.accounts.program_state.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        token::transfer(cpi_ctx, transfer_amount)?;
        
        msg!("Rebalanced {} TWIST from floor to ops treasury", transfer_amount);
    } else {
        msg!("Treasuries already balanced");
    }
    
    // Update floor liquidity tracking
    ctx.accounts.program_state.floor_liquidity = ctx.accounts.floor_treasury.amount;
    
    // Emit event
    emit!(ParameterUpdated {
        parameter: "treasury_rebalance".to_string(),
        old_value: format!("floor: {}, ops: {}", floor_treasury.amount, ops_treasury.amount),
        new_value: format!("floor: {}, ops: {}", target_floor_amount, target_ops_amount),
        updated_by: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Treasury rebalanced successfully");
    msg!("Floor: {} TWIST ({}%)", target_floor_amount, ctx.accounts.program_state.treasury_split_bps / 100);
    msg!("Ops: {} TWIST ({}%)", target_ops_amount, (10000 - ctx.accounts.program_state.treasury_split_bps) / 100);
    
    Ok(())
}

#[derive(Accounts)]
pub struct AllocateFees<'info> {
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = !program_state.emergency_pause @ TwistError::EmergencyPauseActive,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        constraint = fee_account.mint == program_state.mint @ TwistError::InvalidAccount,
    )]
    pub fee_account: Account<'info, TokenAccount>,
    
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
    
    pub token_program: Program<'info, Token>,
}

pub fn allocate_fees_handler(ctx: Context<AllocateFees>) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let fee_amount = ctx.accounts.fee_account.amount;
    let clock = Clock::get()?;
    
    require!(
        fee_amount > 0,
        TwistError::InvalidAmount
    );
    
    // Fee allocation strategy:
    // - 40% to floor treasury (price support)
    // - 30% to staking rewards
    // - 30% to operations treasury
    
    let floor_allocation = (fee_amount * 4000) / 10000; // 40%
    let staking_allocation = (fee_amount * 3000) / 10000; // 30%
    let ops_allocation = fee_amount - floor_allocation - staking_allocation; // 30%
    
    // Transfer to floor treasury
    let cpi_accounts = Transfer {
        from: ctx.accounts.fee_account.to_account_info(),
        to: ctx.accounts.floor_treasury.to_account_info(),
        authority: ctx.accounts.fee_payer.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, floor_allocation)?;
    
    // Transfer to staking vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.fee_account.to_account_info(),
        to: ctx.accounts.stake_vault.to_account_info(),
        authority: ctx.accounts.fee_payer.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, staking_allocation)?;
    
    // Transfer to ops treasury
    let cpi_accounts = Transfer {
        from: ctx.accounts.fee_account.to_account_info(),
        to: ctx.accounts.ops_treasury.to_account_info(),
        authority: ctx.accounts.fee_payer.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, ops_allocation)?;
    
    // Update tracking
    program_state.total_fees_collected = program_state.total_fees_collected.saturating_add(fee_amount as u128);
    program_state.floor_liquidity = ctx.accounts.floor_treasury.amount;
    
    // Emit event
    emit!(ParameterUpdated {
        parameter: "fee_allocation".to_string(),
        old_value: format!("total_fees: {}", program_state.total_fees_collected - fee_amount as u128),
        new_value: format!("total_fees: {}", program_state.total_fees_collected),
        updated_by: ctx.accounts.fee_payer.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Allocated {} TWIST in fees", fee_amount);
    msg!("Floor treasury: {} TWIST", floor_allocation);
    msg!("Staking rewards: {} TWIST", staking_allocation);
    msg!("Ops treasury: {} TWIST", ops_allocation);
    
    Ok(())
}