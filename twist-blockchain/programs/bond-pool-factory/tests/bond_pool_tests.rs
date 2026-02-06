// bond-pool-factory/tests/bond_pool_tests.rs
use anchor_lang::prelude::*;
use anchor_lang::InstructionData;
use solana_program_test::*;
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use bond_pool_factory::state::*;
use bond_pool_factory::instruction::*;

#[tokio::test]
async fn test_initialize_factory() {
    let program_id = bond_pool_factory::ID;
    let mut program_test = ProgramTest::new(
        "bond_pool_factory",
        program_id,
        processor!(bond_pool_factory::entry),
    );

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Derive factory state PDA
    let (factory_state, _) = Pubkey::find_program_address(
        &[FactoryState::SEED_PREFIX],
        &program_id,
    );

    // Create initialize instruction
    let params = InitializeFactoryParams {
        min_bond_duration: 30 * 24 * 60 * 60, // 30 days
        max_bond_duration: 365 * 24 * 60 * 60, // 365 days
        burn_percentage_bps: 9_000, // 90%
        yield_percentage_bps: 1_000, // 10%
        early_unwrap_penalty_bps: 30, // 0.3%
        protocol_fee_bps: 0,
        treasury: payer.pubkey(),
        vau_processor_program: Pubkey::new_unique(),
    };

    let accounts = bond_pool_factory::accounts::InitializeFactory {
        factory_state,
        authority: payer.pubkey(),
        system_program: solana_sdk::system_program::ID,
    };

    let ix = Instruction {
        program_id,
        accounts: accounts.to_account_metas(None),
        data: bond_pool_factory::instruction::InitializeFactory { params }.data(),
    };

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );

    banks_client.process_transaction(tx).await.unwrap();

    // Verify factory state
    let factory_account = banks_client.get_account(factory_state).await.unwrap().unwrap();
    assert_eq!(factory_account.owner, program_id);
}

#[tokio::test]
async fn test_create_bond_pool() {
    // Test creating a bond pool for a website
    // Implementation would follow similar pattern
}

#[tokio::test]
async fn test_stake_and_distribute_yield() {
    // Test staking and yield distribution
    // This would:
    // 1. Initialize factory
    // 2. Create a bond pool
    // 3. Stake TWIST tokens
    // 4. Simulate burns and distribute yield
    // 5. Verify 90% burned, 10% to stakers
}

#[tokio::test] 
async fn test_claim_rewards() {
    // Test claiming accumulated rewards
}

#[tokio::test]
async fn test_withdraw_after_unlock() {
    // Test withdrawal after lock period
}