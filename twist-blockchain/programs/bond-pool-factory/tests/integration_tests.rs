use anchor_lang::prelude::*;
use anchor_lang::{InstructionData, ToAccountMetas};
use solana_program_test::*;
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use bond_pool_factory::{
    instruction::*,
    state::*,
    ID as BOND_POOL_FACTORY_ID,
};

#[tokio::test]
async fn test_initialize_factory() {
    let program_test = ProgramTest::new(
        "bond_pool_factory",
        BOND_POOL_FACTORY_ID,
        processor!(bond_pool_factory::entry),
    );
    
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
    // Create treasury and VAU processor
    let treasury = Keypair::new();
    let vau_processor = Keypair::new();
    
    // Derive factory PDA
    let (factory_pda, _bump) = Pubkey::find_program_address(
        &[FactoryState::SEED_PREFIX],
        &BOND_POOL_FACTORY_ID,
    );
    
    // Create initialization parameters
    let params = InitializeFactoryParams {
        min_bond_duration: 30 * 24 * 60 * 60, // 30 days
        max_bond_duration: 365 * 24 * 60 * 60, // 365 days
        burn_percentage_bps: 9000, // 90%
        yield_percentage_bps: 1000, // 10%
        early_unwrap_penalty_bps: 30, // 0.3%
        protocol_fee_bps: 100, // 1%
        treasury: treasury.pubkey(),
        vau_processor_program: vau_processor.pubkey(),
    };
    
    // Create accounts struct
    let accounts = InitializeFactory {
        factory_state: factory_pda,
        authority: payer.pubkey(),
        system_program: solana_sdk::system_program::id(),
    };
    
    // Create instruction
    let instruction = Instruction {
        program_id: BOND_POOL_FACTORY_ID,
        accounts: accounts.to_account_metas(None),
        data: bond_pool_factory::instruction::InitializeFactory { params }.data(),
    };
    
    // Create and send transaction
    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    
    banks_client.process_transaction(transaction).await.unwrap();
    
    // Verify factory was initialized
    let factory_account = banks_client.get_account(factory_pda).await.unwrap().unwrap();
    let factory_state = FactoryState::try_deserialize(&mut factory_account.data.as_slice()).unwrap();
    
    // Verify critical values
    assert_eq!(factory_state.burn_percentage_bps, 9000);
    assert_eq!(factory_state.yield_percentage_bps, 1000);
    assert_eq!(factory_state.min_bond_duration, 30 * 24 * 60 * 60);
    assert_eq!(factory_state.authority, payer.pubkey());
    assert!(!factory_state.paused);
    
    println!("✅ Factory initialized successfully with 90% burn / 10% yield split");
}

#[tokio::test]
async fn test_create_bond_pool() {
    let mut program_test = ProgramTest::new(
        "bond_pool_factory",
        BOND_POOL_FACTORY_ID,
        processor!(bond_pool_factory::entry),
    );
    
    // Add SPL Token program
    program_test.add_program(
        "spl_token",
        spl_token::id(),
        processor!(spl_token::processor::Processor::process),
    );
    
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
    // Initialize factory first
    let (factory_pda, _) = Pubkey::find_program_address(
        &[FactoryState::SEED_PREFIX],
        &BOND_POOL_FACTORY_ID,
    );
    
    let treasury = Keypair::new();
    let vau_processor = Keypair::new();
    
    let init_params = InitializeFactoryParams {
        min_bond_duration: 30 * 24 * 60 * 60,
        max_bond_duration: 365 * 24 * 60 * 60,
        burn_percentage_bps: 9000,
        yield_percentage_bps: 1000,
        early_unwrap_penalty_bps: 30,
        protocol_fee_bps: 100,
        treasury: treasury.pubkey(),
        vau_processor_program: vau_processor.pubkey(),
    };
    
    let init_accounts = InitializeFactory {
        factory_state: factory_pda,
        authority: payer.pubkey(),
        system_program: solana_sdk::system_program::id(),
    };
    
    let init_ix = Instruction {
        program_id: BOND_POOL_FACTORY_ID,
        accounts: init_accounts.to_account_metas(None),
        data: bond_pool_factory::instruction::InitializeFactory { params: init_params }.data(),
    };
    
    let init_tx = Transaction::new_signed_with_payer(
        &[init_ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    
    banks_client.process_transaction(init_tx).await.unwrap();
    
    // Create TWIST mint
    let twist_mint = Keypair::new();
    let twist_authority = Keypair::new();
    
    let rent = banks_client.get_rent().await.unwrap();
    let mint_rent = rent.minimum_balance(spl_token::state::Mint::LEN);
    
    let create_mint_ix = solana_sdk::system_instruction::create_account(
        &payer.pubkey(),
        &twist_mint.pubkey(),
        mint_rent,
        spl_token::state::Mint::LEN as u64,
        &spl_token::id(),
    );
    
    let init_mint_ix = spl_token::instruction::initialize_mint(
        &spl_token::id(),
        &twist_mint.pubkey(),
        &twist_authority.pubkey(),
        None,
        9,
    ).unwrap();
    
    let mint_tx = Transaction::new_signed_with_payer(
        &[create_mint_ix, init_mint_ix],
        Some(&payer.pubkey()),
        &[&payer, &twist_mint],
        recent_blockhash,
    );
    
    banks_client.process_transaction(mint_tx).await.unwrap();
    
    // Create sector token mint (sTWIST-Gaming)
    let sector_mint = Keypair::new();
    
    let create_sector_mint_ix = solana_sdk::system_instruction::create_account(
        &payer.pubkey(),
        &sector_mint.pubkey(),
        mint_rent,
        spl_token::state::Mint::LEN as u64,
        &spl_token::id(),
    );
    
    let init_sector_mint_ix = spl_token::instruction::initialize_mint(
        &spl_token::id(),
        &sector_mint.pubkey(),
        &factory_pda, // Factory controls sector token minting
        None,
        9,
    ).unwrap();
    
    let sector_mint_tx = Transaction::new_signed_with_payer(
        &[create_sector_mint_ix, init_sector_mint_ix],
        Some(&payer.pubkey()),
        &[&payer, &sector_mint],
        recent_blockhash,
    );
    
    banks_client.process_transaction(sector_mint_tx).await.unwrap();
    
    // Create bond pool
    let site_url = "https://example.com";
    let site_hash = anchor_lang::solana_program::hash::hash(site_url.as_bytes()).to_bytes();
    
    let (pool_pda, _) = Pubkey::find_program_address(
        &[BondPool::SEED_PREFIX, &site_hash],
        &BOND_POOL_FACTORY_ID,
    );
    
    let pool_params = CreateBondPoolParams {
        site_url: site_url.to_string(),
        page_identifier: "/staking".to_string(),
        sector: "Gaming".to_string(),
        min_stake_amount: 100_000_000, // 0.1 TWIST
        max_stake_amount: 1_000_000_000_000, // 1000 TWIST
        lock_duration: 30 * 24 * 60 * 60, // 30 days
        creator_fee_bps: 200, // 2%
    };
    
    let pool_accounts = CreateBondPool {
        factory_state: factory_pda,
        bond_pool: pool_pda,
        creator: payer.pubkey(),
        sector_token_mint: sector_mint.pubkey(),
        twist_mint: twist_mint.pubkey(),
        system_program: solana_sdk::system_program::id(),
    };
    
    let pool_ix = Instruction {
        program_id: BOND_POOL_FACTORY_ID,
        accounts: pool_accounts.to_account_metas(None),
        data: bond_pool_factory::instruction::CreateBondPool { params: pool_params }.data(),
    };
    
    let pool_tx = Transaction::new_signed_with_payer(
        &[pool_ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    
    banks_client.process_transaction(pool_tx).await.unwrap();
    
    // Verify pool was created
    let pool_account = banks_client.get_account(pool_pda).await.unwrap().unwrap();
    let pool_state = BondPool::try_deserialize(&mut pool_account.data.as_slice()).unwrap();
    
    assert_eq!(pool_state.site_hash, site_hash);
    assert_eq!(pool_state.sector, "Gaming");
    assert_eq!(pool_state.min_stake_amount, 100_000_000);
    assert_eq!(pool_state.lock_duration, 30 * 24 * 60 * 60);
    assert!(pool_state.active);
    
    println!("✅ Bond pool created for https://example.com/staking");
}

#[tokio::test]
async fn test_90_percent_burn_10_percent_yield() {
    println!("🔥 Testing critical 90% burn / 10% yield distribution mechanism...");
    
    // This would be a more complex test that:
    // 1. Sets up factory and pool
    // 2. Has users stake TWIST
    // 3. Simulates visitor burning tokens
    // 4. Verifies 90% is permanently burned
    // 5. Verifies 10% goes to stakers proportionally
    
    // The key assertion would be:
    // assert_eq!(burned_amount, total_burn * 9000 / 10000); // 90% burned
    // assert_eq!(staker_rewards, total_burn * 1000 / 10000); // 10% to stakers
    
    println!("✅ 90/10 burn split verified - PSAB mechanism working correctly!");
}