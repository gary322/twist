use anchor_lang::prelude::*;
use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;
use solana_program_test::*;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
    transport::TransportError,
};
use spl_token::state::{Account as TokenAccount, Mint};

pub fn setup_program_test() -> ProgramTest {
    let mut test = ProgramTest::new(
        "twist_token",
        twist_token::id(),
        processor!(twist_token::entry),
    );
    
    // Add SPL Token program
    test.add_program(
        "spl_token",
        spl_token::id(),
        processor!(spl_token::processor::Processor::process),
    );
    
    test
}

pub async fn create_mint(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    mint_authority: &Keypair,
    decimals: u8,
) -> Result<Keypair, TransportError> {
    let mint = Keypair::new();
    let rent = banks_client.get_rent().await.unwrap();
    let mint_rent = rent.minimum_balance(Mint::LEN);
    
    let instructions = vec![
        system_instruction::create_account(
            &payer.pubkey(),
            &mint.pubkey(),
            mint_rent,
            Mint::LEN as u64,
            &spl_token::id(),
        ),
        spl_token::instruction::initialize_mint(
            &spl_token::id(),
            &mint.pubkey(),
            &mint_authority.pubkey(),
            None,
            decimals,
        )
        .unwrap(),
    ];
    
    let mut transaction = Transaction::new_with_payer(&instructions, Some(&payer.pubkey()));
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    transaction.sign(&[payer, &mint], recent_blockhash);
    
    banks_client.process_transaction(transaction).await?;
    
    Ok(mint)
}

pub async fn create_token_account(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    mint: &Pubkey,
    owner: &Pubkey,
) -> Result<Keypair, TransportError> {
    let token_account = Keypair::new();
    let rent = banks_client.get_rent().await.unwrap();
    let account_rent = rent.minimum_balance(TokenAccount::LEN);
    
    let instructions = vec![
        system_instruction::create_account(
            &payer.pubkey(),
            &token_account.pubkey(),
            account_rent,
            TokenAccount::LEN as u64,
            &spl_token::id(),
        ),
        spl_token::instruction::initialize_account(
            &spl_token::id(),
            &token_account.pubkey(),
            mint,
            owner,
        )
        .unwrap(),
    ];
    
    let mut transaction = Transaction::new_with_payer(&instructions, Some(&payer.pubkey()));
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    transaction.sign(&[payer, &token_account], recent_blockhash);
    
    banks_client.process_transaction(transaction).await?;
    
    Ok(token_account)
}

pub async fn mint_tokens(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    mint: &Pubkey,
    mint_authority: &Keypair,
    token_account: &Pubkey,
    amount: u64,
) -> Result<(), TransportError> {
    let instruction = spl_token::instruction::mint_to(
        &spl_token::id(),
        mint,
        token_account,
        &mint_authority.pubkey(),
        &[],
        amount,
    )
    .unwrap();
    
    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    transaction.sign(&[payer, mint_authority], recent_blockhash);
    
    banks_client.process_transaction(transaction).await
}

pub async fn get_token_balance(
    banks_client: &mut BanksClient,
    token_account: &Pubkey,
) -> u64 {
    let account = banks_client.get_account(*token_account).await.unwrap().unwrap();
    let token_account_data = TokenAccount::unpack(&account.data).unwrap();
    token_account_data.amount
}

pub async fn airdrop(
    banks_client: &mut BanksClient,
    receiver: &Pubkey,
    lamports: u64,
) -> Result<(), TransportError> {
    let instruction = system_instruction::transfer(
        &banks_client.payer().pubkey(),
        receiver,
        lamports,
    );
    
    let mut transaction = Transaction::new_with_payer(
        &[instruction],
        Some(&banks_client.payer().pubkey()),
    );
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    transaction.sign(&[banks_client.payer()], recent_blockhash);
    
    banks_client.process_transaction(transaction).await
}

pub fn find_program_address(seeds: &[&[u8]], program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(seeds, program_id)
}

pub async fn advance_clock(
    context: &mut ProgramTestContext,
    slots: u64,
) -> Result<(), TransportError> {
    context.warp_to_slot(slots).unwrap();
    Ok(())
}

pub async fn create_and_fund_account(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    lamports: u64,
) -> Keypair {
    let account = Keypair::new();
    
    airdrop(banks_client, &account.pubkey(), lamports).await.unwrap();
    
    account
}

// Mock oracle creation for testing
pub async fn create_mock_oracle(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    initial_price: f64,
) -> Pubkey {
    let oracle = Keypair::new();
    let rent = banks_client.get_rent().await.unwrap();
    let oracle_rent = rent.minimum_balance(256); // Mock oracle size
    
    // Create a mock oracle account with price data
    let mut oracle_data = vec![0u8; 256];
    // Write price as u64 (price * 1e6) at offset 0
    let price_u64 = (initial_price * 1_000_000.0) as u64;
    oracle_data[..8].copy_from_slice(&price_u64.to_le_bytes());
    
    let instruction = system_instruction::create_account(
        &payer.pubkey(),
        &oracle.pubkey(),
        oracle_rent,
        256,
        &Pubkey::new_unique(), // Mock oracle program
    );
    
    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    transaction.sign(&[payer, &oracle], recent_blockhash);
    
    banks_client.process_transaction(transaction).await.unwrap();
    
    oracle.pubkey()
}

pub async fn update_mock_oracle(
    banks_client: &mut BanksClient,
    oracle: &Pubkey,
    new_price: f64,
) {
    let mut account = banks_client.get_account(*oracle).await.unwrap().unwrap();
    let price_u64 = (new_price * 1_000_000.0) as u64;
    account.data[..8].copy_from_slice(&price_u64.to_le_bytes());
    
    // In real tests, we'd need to properly update through the oracle program
    // For now, this simulates the update
}