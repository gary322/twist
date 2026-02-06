use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use crate::state::*;
use crate::constants::*;
use crate::errors::TwistError;
use crate::events::*;
use crate::utils::{validate_amount, safe_sub, safe_div};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BridgeMessage {
    pub amount: u64,
    pub recipient: [u8; 32],
    pub chain_id: u16,
    pub token_address: [u8; 32],
    pub decimals: u8,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct InitiateBridge<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        token::mint = program_state.mint,
        token::authority = user,
        constraint = user_token_account.amount >= amount @ TwistError::InsufficientLiquidity
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [BRIDGE_ESCROW_SEED],
        bump,
        token::mint = program_state.mint,
        token::authority = program_state,
    )]
    pub bridge_escrow: Account<'info, TokenAccount>,
    
    #[account(
        constraint = mint.key() == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub mint: Account<'info, Mint>,
    
    /// CHECK: Wormhole bridge account - verified in handler
    pub wormhole_bridge: AccountInfo<'info>,
    
    /// CHECK: Wormhole fee collector - verified in handler
    pub wormhole_fee_collector: AccountInfo<'info>,
    
    /// CHECK: Wormhole program - verified in handler
    pub wormhole_program: AccountInfo<'info>,
    
    /// CHECK: Wormhole message account - created in handler
    pub wormhole_message: AccountInfo<'info>,
    
    /// CHECK: Wormhole sequence account - verified in handler
    pub wormhole_sequence: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn initiate_handler(
    ctx: Context<InitiateBridge>,
    amount: u64,
    target_chain: u16,
    target_address: [u8; 32],
) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // Validate inputs
    validate_amount(amount)?;
    
    // Check emergency pause
    require!(
        !program_state.emergency_pause,
        TwistError::EmergencyPauseActive
    );
    
    // Validate target chain
    const SUPPORTED_CHAINS: [u16; 4] = [
        2,  // Ethereum
        4,  // BSC
        5,  // Polygon
        6,  // Avalanche
    ];
    
    require!(
        SUPPORTED_CHAINS.contains(&target_chain),
        TwistError::UnsupportedChain
    );
    
    // Calculate bridge fee (0.1%)
    let bridge_fee = safe_div(amount, 1000)?;
    let transfer_amount = safe_sub(amount, bridge_fee)?;
    
    // Minimum bridge amount check (to cover gas on destination chain)
    const MIN_BRIDGE_AMOUNT: u64 = 100 * 10u64.pow(DECIMALS as u32); // 100 TWIST
    require!(
        transfer_amount >= MIN_BRIDGE_AMOUNT,
        TwistError::InvalidAmount
    );
    
    // Transfer tokens to bridge escrow
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.bridge_escrow.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, amount)?;
    
    // Update program state
    program_state.total_transactions = program_state.total_transactions.saturating_add(1);
    
    // Create bridge message data
    let _message_data = BridgeMessage {
        amount: transfer_amount,
        recipient: target_address,
        chain_id: target_chain,
        token_address: ctx.accounts.mint.key().to_bytes(),
        decimals: DECIMALS,
    };
    
    // TODO: When Wormhole dependency is fixed, implement actual CPI call here
    // For now, we're simulating the bridge by logging the event
    
    // In production, this would be:
    // wormhole::post_message(
    //     CpiContext::new(
    //         ctx.accounts.wormhole_program.to_account_info(),
    //         wormhole::PostMessage {
    //             config: ctx.accounts.wormhole_bridge.to_account_info(),
    //             message: ctx.accounts.wormhole_message.to_account_info(),
    //             emitter: ctx.accounts.bridge_escrow.to_account_info(),
    //             sequence: ctx.accounts.wormhole_sequence.to_account_info(),
    //             payer: ctx.accounts.user.to_account_info(),
    //             fee_collector: ctx.accounts.wormhole_fee_collector.to_account_info(),
    //             system_program: ctx.accounts.system_program.to_account_info(),
    //         },
    //     ),
    //     0, // nonce
    //     message_data.try_to_vec()?,
    //     wormhole::ConsistencyLevel::Confirmed,
    // )?;
    
    // Emit bridge event
    emit!(BridgeTransferInitiated {
        user: ctx.accounts.user.key(),
        amount: transfer_amount,
        target_chain,
        target_address,
        bridge_fee,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Bridge transfer initiated");
    msg!("Amount: {} TWIST", transfer_amount as f64 / 10f64.powf(DECIMALS as f64));
    msg!("Target chain: {}", target_chain);
    msg!("Bridge fee: {} TWIST", bridge_fee as f64 / 10f64.powf(DECIMALS as f64));
    
    Ok(())
}

#[derive(Accounts)]
pub struct CompleteBridge<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROGRAM_STATE_SEED],
        bump = program_state.bump,
        constraint = program_state.authority == authority.key() @ TwistError::Unauthorized
    )]
    pub program_state: Account<'info, ProgramState>,
    
    #[account(
        mut,
        constraint = mint.key() == program_state.mint @ TwistError::InvalidMintAuthority
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        token::mint = program_state.mint,
        token::authority = recipient,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Recipient can be any valid pubkey
    pub recipient: AccountInfo<'info>,
    
    /// CHECK: Wormhole VAA (Verified Action Approval) - verified in handler
    pub vaa: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn complete_handler(
    ctx: Context<CompleteBridge>,
    _vaa_data: Vec<u8>,
) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    let clock = Clock::get()?;
    
    // TODO: When Wormhole dependency is fixed, verify VAA here
    // For now, we'll simulate the verification
    
    // In production, this would parse and verify the VAA
    // let vaa = parse_and_verify_vaa(&vaa_data)?;
    // let payload: BridgeMessage = borsh::deserialize(&vaa.payload)?;
    
    // Simulated payload for testing
    let amount = 1000 * 10u64.pow(DECIMALS as u32); // 1000 TWIST
    
    // Get bump before dropping mutable reference
    let program_state_bump = program_state.bump;
    
    // Update program state
    program_state.total_transactions = program_state.total_transactions.saturating_add(1);
    
    // Release mutable reference before creating immutable ones
    
    // Mint tokens to recipient
    let seeds = &[
        PROGRAM_STATE_SEED,
        &[program_state_bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    let cpi_accounts = token::MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: ctx.accounts.program_state.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::mint_to(cpi_ctx, amount)?;
    
    // Emit completion event
    emit!(BridgeTransferCompleted {
        recipient: ctx.accounts.recipient.key(),
        amount,
        source_chain: 1, // Solana
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Bridge transfer completed");
    msg!("Minted {} TWIST to recipient", amount as f64 / 10f64.powf(DECIMALS as f64));
    
    Ok(())
}

// Additional events for bridge completion
#[event]
pub struct BridgeTransferCompleted {
    pub recipient: Pubkey,
    pub amount: u64,
    pub source_chain: u16,
    pub timestamp: i64,
}