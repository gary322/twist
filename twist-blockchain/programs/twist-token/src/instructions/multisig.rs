use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;

use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializeMultisig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        init,
        payer = authority,
        space = MultisigConfig::LEN,
        seeds = [b"multisig"],
        bump
    )]
    pub multisig_config: Account<'info, MultisigConfig>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_multisig_handler(
    ctx: Context<InitializeMultisig>,
    params: MultisigParams,
) -> Result<()> {
    // Validate parameters
    require!(
        params.members.len() >= 3 && params.members.len() <= 10,
        TwistError::InvalidAmount
    );
    
    require!(
        params.threshold >= 2 && params.threshold <= params.members.len() as u64,
        TwistError::InvalidAmount
    );
    
    // Check for duplicate members
    let mut unique_members = params.members.clone();
    unique_members.sort();
    unique_members.dedup();
    require!(
        unique_members.len() == params.members.len(),
        TwistError::InvalidAccount
    );
    
    // Get multisig key before mutable borrow
    let multisig_key = ctx.accounts.multisig_config.key();
    
    // Now do mutable borrows
    let multisig_config = &mut ctx.accounts.multisig_config;
    
    // Initialize multisig config
    multisig_config.multisig_address = multisig_key;
    multisig_config.threshold = params.threshold;
    multisig_config.members = params.members.clone();
    multisig_config.transaction_count = 0;
    multisig_config.initialized = true;
    multisig_config.bump = ctx.bumps.multisig_config;
    multisig_config.pending_transactions = 0;
    
    // Set time delays
    multisig_config.parameter_update_delay = params.parameter_update_delay;
    multisig_config.treasury_withdrawal_delay = params.treasury_withdrawal_delay;
    multisig_config.authority_transfer_delay = params.authority_transfer_delay;
    
    // Update program state to enable multisig
    // Note: After this, all admin operations will require multisig approval
    
    msg!("Multisig initialized with {} members and threshold {}", 
        params.members.len(), 
        params.threshold
    );
    msg!("Parameter update delay: {} seconds", params.parameter_update_delay);
    msg!("Treasury withdrawal delay: {} seconds", params.treasury_withdrawal_delay);
    msg!("Authority transfer delay: {} seconds", params.authority_transfer_delay);
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(transaction_data: Vec<u8>)]
pub struct ProposeTransaction<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    
    #[account(
        seeds = [b"multisig"],
        bump,
        constraint = multisig_config.initialized @ TwistError::InvalidAccount,
        constraint = multisig_config.is_member(&proposer.key()) @ TwistError::Unauthorized,
    )]
    pub multisig_config: Account<'info, MultisigConfig>,
    
    #[account(
        init,
        payer = proposer,
        space = MultisigTransaction::LEN,
        seeds = [
            b"multisig_transaction",
            multisig_config.key().as_ref(),
            &multisig_config.transaction_count.to_le_bytes()
        ],
        bump
    )]
    pub transaction: Account<'info, MultisigTransaction>,
    
    pub system_program: Program<'info, System>,
}

pub fn propose_transaction_handler(
    ctx: Context<ProposeTransaction>,
    instruction_data: Vec<u8>,
    instruction_program_id: Pubkey,
    instruction_accounts: Vec<TransactionAccount>,
    title: String,
    description: String,
    delay_seconds: i64,
) -> Result<()> {
    let multisig_config = &mut ctx.accounts.multisig_config;
    let transaction = &mut ctx.accounts.transaction;
    let clock = Clock::get()?;
    
    // Validate inputs
    require!(
        instruction_data.len() <= 1024,
        TwistError::InvalidAmount
    );
    
    require!(
        instruction_accounts.len() <= 10,
        TwistError::InvalidAmount
    );
    
    require!(
        title.len() <= 64 && !title.is_empty(),
        TwistError::InvalidAmount
    );
    
    require!(
        description.len() <= 256,
        TwistError::InvalidAmount
    );
    
    // Initialize transaction
    transaction.multisig = multisig_config.key();
    transaction.transaction_index = multisig_config.transaction_count;
    transaction.proposer = ctx.accounts.proposer.key();
    transaction.instruction_data = instruction_data;
    transaction.instruction_program_id = instruction_program_id;
    transaction.instruction_accounts = instruction_accounts;
    transaction.signers = vec![ctx.accounts.proposer.key()]; // Proposer auto-signs
    transaction.executed = false;
    transaction.cancelled = false;
    transaction.created_at = clock.unix_timestamp;
    transaction.executed_at = 0;
    transaction.eta = clock.unix_timestamp + delay_seconds;
    transaction.bump = ctx.bumps.transaction;
    transaction.title = title.clone();
    transaction.description = description.clone();
    
    // Update multisig state
    multisig_config.transaction_count += 1;
    multisig_config.pending_transactions += 1;
    
    // Emit event
    emit!(ParameterUpdated {
        parameter: "multisig_proposal".to_string(),
        old_value: format!("pending: {}", multisig_config.pending_transactions - 1),
        new_value: format!("pending: {}", multisig_config.pending_transactions),
        updated_by: ctx.accounts.proposer.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Transaction proposed: {}", title);
    msg!("Index: {}, ETA: {}", transaction.transaction_index, transaction.eta);
    msg!("Signatures: 1/{}", multisig_config.threshold);
    
    Ok(())
}

#[derive(Accounts)]
pub struct ApproveTransaction<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    
    #[account(
        seeds = [b"multisig"],
        bump,
        constraint = multisig_config.is_member(&signer.key()) @ TwistError::Unauthorized,
    )]
    pub multisig_config: Account<'info, MultisigConfig>,
    
    #[account(
        mut,
        seeds = [
            b"multisig_transaction",
            multisig_config.key().as_ref(),
            &transaction.transaction_index.to_le_bytes()
        ],
        bump,
        constraint = !transaction.executed @ TwistError::InvalidAccount,
        constraint = !transaction.cancelled @ TwistError::InvalidAccount,
    )]
    pub transaction: Account<'info, MultisigTransaction>,
}

pub fn approve_transaction_handler(ctx: Context<ApproveTransaction>) -> Result<()> {
    let transaction = &mut ctx.accounts.transaction;
    let clock = Clock::get()?;
    
    // Check if already signed
    require!(
        !transaction.has_signed(&ctx.accounts.signer.key()),
        TwistError::InvalidAccount
    );
    
    // Add signature
    transaction.signers.push(ctx.accounts.signer.key());
    
    let current_signatures = transaction.signature_count();
    let threshold = ctx.accounts.multisig_config.threshold;
    
    // Emit event
    emit!(ParameterUpdated {
        parameter: format!("multisig_approval_{}", transaction.transaction_index),
        old_value: format!("signatures: {}/{}", current_signatures - 1, threshold),
        new_value: format!("signatures: {}/{}", current_signatures, threshold),
        updated_by: ctx.accounts.signer.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Transaction {} approved by {}", 
        transaction.transaction_index, 
        ctx.accounts.signer.key()
    );
    msg!("Signatures: {}/{}", current_signatures, threshold);
    
    if current_signatures >= threshold {
        msg!("Transaction has reached threshold and can be executed after timelock");
    }
    
    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteTransaction<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"multisig"],
        bump,
    )]
    pub multisig_config: Account<'info, MultisigConfig>,
    
    #[account(
        mut,
        seeds = [
            b"multisig_transaction",
            multisig_config.key().as_ref(),
            &transaction.transaction_index.to_le_bytes()
        ],
        bump,
        constraint = transaction.can_execute(multisig_config.threshold, clock.unix_timestamp) @ TwistError::InvalidAccount,
    )]
    pub transaction: Account<'info, MultisigTransaction>,
    
    /// CHECK: The program to invoke
    pub target_program: AccountInfo<'info>,
    
    pub clock: Sysvar<'info, Clock>,
}

pub fn execute_transaction_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ExecuteTransaction<'info>>,
) -> Result<()> {
    let transaction = &mut ctx.accounts.transaction;
    let multisig_config = &mut ctx.accounts.multisig_config;
    let clock = &ctx.accounts.clock;
    
    // Build the instruction
    let mut account_infos = vec![];
    let remaining_accounts = ctx.remaining_accounts;
    
    // Match accounts from the transaction to remaining accounts
    for (i, _tx_account) in transaction.instruction_accounts.iter().enumerate() {
        if i < remaining_accounts.len() {
            account_infos.push(remaining_accounts[i].clone());
        } else {
            return Err(TwistError::InvalidAccount.into());
        }
    }
    
    // Create the instruction
    let ix = Instruction {
        program_id: transaction.instruction_program_id,
        accounts: transaction.instruction_accounts
            .iter()
            .enumerate()
            .map(|(i, acc)| AccountMeta {
                pubkey: remaining_accounts[i].key(),
                is_signer: acc.is_signer,
                is_writable: acc.is_writable,
            })
            .collect(),
        data: transaction.instruction_data.clone(),
    };
    
    // Execute via CPI
    let seeds = &[
        b"multisig".as_ref(),
        &[multisig_config.bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &account_infos,
        signer_seeds,
    )?;
    
    // Update transaction state
    transaction.executed = true;
    transaction.executed_at = clock.unix_timestamp;
    
    // Update multisig state
    multisig_config.pending_transactions = multisig_config.pending_transactions.saturating_sub(1);
    
    // Emit event
    emit!(ParameterUpdated {
        parameter: format!("multisig_execution_{}", transaction.transaction_index),
        old_value: "pending".to_string(),
        new_value: "executed".to_string(),
        updated_by: ctx.accounts.executor.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Transaction {} executed successfully", transaction.transaction_index);
    msg!("Title: {}", transaction.title);
    
    Ok(())
}

#[derive(Accounts)]
pub struct CancelTransaction<'info> {
    #[account(mut)]
    pub canceller: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"multisig"],
        bump,
        constraint = multisig_config.is_member(&canceller.key()) @ TwistError::Unauthorized,
    )]
    pub multisig_config: Account<'info, MultisigConfig>,
    
    #[account(
        mut,
        seeds = [
            b"multisig_transaction",
            multisig_config.key().as_ref(),
            &transaction.transaction_index.to_le_bytes()
        ],
        bump,
        constraint = !transaction.executed @ TwistError::InvalidAccount,
        constraint = !transaction.cancelled @ TwistError::InvalidAccount,
        constraint = transaction.proposer == canceller.key() || 
                    transaction.signature_count() < multisig_config.threshold @ TwistError::Unauthorized,
    )]
    pub transaction: Account<'info, MultisigTransaction>,
}

pub fn cancel_transaction_handler(ctx: Context<CancelTransaction>) -> Result<()> {
    let transaction = &mut ctx.accounts.transaction;
    let multisig_config = &mut ctx.accounts.multisig_config;
    let clock = Clock::get()?;
    
    // Cancel the transaction
    transaction.cancelled = true;
    
    // Update multisig state
    multisig_config.pending_transactions = multisig_config.pending_transactions.saturating_sub(1);
    
    // Emit event
    emit!(ParameterUpdated {
        parameter: format!("multisig_cancellation_{}", transaction.transaction_index),
        old_value: "pending".to_string(),
        new_value: "cancelled".to_string(),
        updated_by: ctx.accounts.canceller.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Transaction {} cancelled", transaction.transaction_index);
    
    Ok(())
}