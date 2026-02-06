use anchor_lang::prelude::*;
use anchor_lang::InstructionData;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use solana_program_test::*;
use solana_sdk::{
    account::Account,
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
    system_instruction,
    rent::Rent,
    sysvar,
};
use bond_pool_factory::{
    instruction::*,
    state::*,
    ID as BOND_POOL_FACTORY_ID,
};
use spl_token::state::Account as SplTokenAccount;

pub const PRECISION: u128 = 1_000_000_000_000; // 1e12

pub struct TestEnvironment {
    pub banks_client: BanksClient,
    pub payer: Keypair,
    pub recent_blockhash: solana_sdk::hash::Hash,
    pub twist_mint: Pubkey,
    pub twist_mint_authority: Keypair,
}

impl TestEnvironment {
    pub async fn new() -> Self {
        let mut test = ProgramTest::new(
            "bond_pool_factory",
            BOND_POOL_FACTORY_ID,
            processor!(bond_pool_factory::entry),
        );
        
        // Add SPL Token program
        test.add_program(
            "spl_token",
            spl_token::id(),
            processor!(spl_token::processor::Processor::process),
        );
        
        // Add Associated Token program
        test.add_program(
            "spl_associated_token_account",
            spl_associated_token_account::id(),
            processor!(spl_associated_token_account::processor::process_instruction),
        );
        
        let (mut banks_client, payer, recent_blockhash) = test.start().await;
        
        // Create TWIST mint
        let twist_mint = Keypair::new();
        let twist_mint_authority = Keypair::new();
        
        let rent = banks_client.get_rent().await.unwrap();
        let mint_rent = rent.minimum_balance(spl_token::state::Mint::LEN);
        
        let create_mint_ix = system_instruction::create_account(
            &payer.pubkey(),
            &twist_mint.pubkey(),
            mint_rent,
            spl_token::state::Mint::LEN as u64,
            &spl_token::id(),
        );
        
        let init_mint_ix = spl_token::instruction::initialize_mint(
            &spl_token::id(),
            &twist_mint.pubkey(),
            &twist_mint_authority.pubkey(),
            None,
            9, // 9 decimals like SOL
        ).unwrap();
        
        let tx = Transaction::new_signed_with_payer(
            &[create_mint_ix, init_mint_ix],
            Some(&payer.pubkey()),
            &[&payer, &twist_mint],
            recent_blockhash,
        );
        
        banks_client.process_transaction(tx).await.unwrap();
        
        Self {
            banks_client,
            payer,
            recent_blockhash,
            twist_mint: twist_mint.pubkey(),
            twist_mint_authority,
        }
    }
    
    pub async fn initialize_factory(&mut self) {
        let treasury = Keypair::new();
        let vau_processor = Keypair::new();
        
        let params = InitializeFactoryParams {
            min_bond_duration: 30 * 24 * 60 * 60,
            max_bond_duration: 365 * 24 * 60 * 60,
            burn_percentage_bps: 9000,
            yield_percentage_bps: 1000,
            early_unwrap_penalty_bps: 30,
            protocol_fee_bps: 100,
            treasury: treasury.pubkey(),
            vau_processor_program: vau_processor.pubkey(),
        };
        
        let factory_pda = Pubkey::find_program_address(
            &[FactoryState::SEED_PREFIX],
            &BOND_POOL_FACTORY_ID,
        ).0;
        
        let accounts = InitializeFactory {
            factory_state: factory_pda,
            authority: self.payer.pubkey(),
            system_program: solana_sdk::system_program::id(),
        };
        
        let ix = Instruction {
            program_id: BOND_POOL_FACTORY_ID,
            accounts: accounts.to_account_metas(None),
            data: bond_pool_factory::instruction::InitializeFactory { params }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&self.payer.pubkey()),
            &[&self.payer],
            self.recent_blockhash,
        );
        
        self.banks_client.process_transaction(tx).await.unwrap();
    }
    
    pub async fn create_sector_token_mint(&mut self, sector: &str) -> Pubkey {
        let mint = Keypair::new();
        let rent = self.banks_client.get_rent().await.unwrap();
        let mint_rent = rent.minimum_balance(spl_token::state::Mint::LEN);
        
        // Factory PDA will be mint authority
        let factory_pda = Pubkey::find_program_address(
            &[FactoryState::SEED_PREFIX],
            &BOND_POOL_FACTORY_ID,
        ).0;
        
        let create_mint_ix = system_instruction::create_account(
            &self.payer.pubkey(),
            &mint.pubkey(),
            mint_rent,
            spl_token::state::Mint::LEN as u64,
            &spl_token::id(),
        );
        
        let init_mint_ix = spl_token::instruction::initialize_mint(
            &spl_token::id(),
            &mint.pubkey(),
            &factory_pda,
            None,
            9,
        ).unwrap();
        
        let tx = Transaction::new_signed_with_payer(
            &[create_mint_ix, init_mint_ix],
            Some(&self.payer.pubkey()),
            &[&self.payer, &mint],
            self.recent_blockhash,
        );
        
        self.banks_client.process_transaction(tx).await.unwrap();
        
        mint.pubkey()
    }
    
    pub async fn create_bond_pool(
        &mut self,
        params: CreateBondPoolParams,
        sector_token_mint: Pubkey,
    ) -> Pubkey {
        let site_hash = anchor_lang::solana_program::hash::hash(params.site_url.as_bytes()).to_bytes();
        let pool_pda = Pubkey::find_program_address(
            &[BondPool::SEED_PREFIX, &site_hash],
            &BOND_POOL_FACTORY_ID,
        ).0;
        
        let factory_pda = Pubkey::find_program_address(
            &[FactoryState::SEED_PREFIX],
            &BOND_POOL_FACTORY_ID,
        ).0;
        
        let accounts = CreateBondPool {
            factory_state: factory_pda,
            bond_pool: pool_pda,
            creator: self.payer.pubkey(),
            sector_token_mint,
            twist_mint: self.twist_mint,
            system_program: solana_sdk::system_program::id(),
        };
        
        let ix = Instruction {
            program_id: BOND_POOL_FACTORY_ID,
            accounts: accounts.to_account_metas(None),
            data: bond_pool_factory::instruction::CreateBondPool { params }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&self.payer.pubkey()),
            &[&self.payer],
            self.recent_blockhash,
        );
        
        self.banks_client.process_transaction(tx).await.unwrap();
        
        pool_pda
    }
    
    pub async fn create_bond_pool_with_defaults(&mut self, sector_token_mint: Pubkey) -> Pubkey {
        let params = CreateBondPoolParams {
            site_url: "https://example.com".to_string(),
            page_identifier: "/stake".to_string(),
            sector: "Gaming".to_string(),
            min_stake_amount: 100_000_000,
            max_stake_amount: 0,
            lock_duration: 30 * 24 * 60 * 60,
            creator_fee_bps: 200,
        };
        
        self.create_bond_pool(params, sector_token_mint).await
    }
    
    pub async fn try_create_bond_pool_with_defaults(&mut self, sector_token_mint: Pubkey) -> Result<Pubkey> {
        let params = CreateBondPoolParams {
            site_url: "https://example.com".to_string(),
            page_identifier: "/stake".to_string(),
            sector: "Gaming".to_string(),
            min_stake_amount: 100_000_000,
            max_stake_amount: 0,
            lock_duration: 30 * 24 * 60 * 60,
            creator_fee_bps: 200,
        };
        
        let site_hash = anchor_lang::solana_program::hash::hash(params.site_url.as_bytes()).to_bytes();
        let pool_pda = Pubkey::find_program_address(
            &[BondPool::SEED_PREFIX, &site_hash],
            &BOND_POOL_FACTORY_ID,
        ).0;
        
        let factory_pda = Pubkey::find_program_address(
            &[FactoryState::SEED_PREFIX],
            &BOND_POOL_FACTORY_ID,
        ).0;
        
        let accounts = CreateBondPool {
            factory_state: factory_pda,
            bond_pool: pool_pda,
            creator: self.payer.pubkey(),
            sector_token_mint,
            twist_mint: self.twist_mint,
            system_program: solana_sdk::system_program::id(),
        };
        
        let ix = Instruction {
            program_id: BOND_POOL_FACTORY_ID,
            accounts: accounts.to_account_metas(None),
            data: bond_pool_factory::instruction::CreateBondPool { params }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&self.payer.pubkey()),
            &[&self.payer],
            self.recent_blockhash,
        );
        
        match self.banks_client.process_transaction(tx).await {
            Ok(_) => Ok(pool_pda),
            Err(e) => Err(e.into()),
        }
    }
    
    pub async fn airdrop(&mut self, recipient: &Pubkey, amount: u64) {
        let ix = system_instruction::transfer(&self.payer.pubkey(), recipient, amount);
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&self.payer.pubkey()),
            &[&self.payer],
            self.recent_blockhash,
        );
        self.banks_client.process_transaction(tx).await.unwrap();
    }
    
    pub async fn create_token_account(&mut self, mint: &Pubkey, owner: &Pubkey) -> Pubkey {
        let account = Keypair::new();
        let rent = self.banks_client.get_rent().await.unwrap();
        let account_rent = rent.minimum_balance(spl_token::state::Account::LEN);
        
        let create_account_ix = system_instruction::create_account(
            &self.payer.pubkey(),
            &account.pubkey(),
            account_rent,
            spl_token::state::Account::LEN as u64,
            &spl_token::id(),
        );
        
        let init_account_ix = spl_token::instruction::initialize_account(
            &spl_token::id(),
            &account.pubkey(),
            mint,
            owner,
        ).unwrap();
        
        let tx = Transaction::new_signed_with_payer(
            &[create_account_ix, init_account_ix],
            Some(&self.payer.pubkey()),
            &[&self.payer, &account],
            self.recent_blockhash,
        );
        
        self.banks_client.process_transaction(tx).await.unwrap();
        
        account.pubkey()
    }
    
    pub async fn create_and_fund_token_account(
        &mut self,
        mint: &Pubkey,
        owner: &Pubkey,
        amount: u64,
    ) -> Pubkey {
        let account = self.create_token_account(mint, owner).await;
        self.mint_tokens(mint, &account, amount).await;
        account
    }
    
    pub async fn mint_tokens(&mut self, mint: &Pubkey, to: &Pubkey, amount: u64) {
        let mint_to_ix = spl_token::instruction::mint_to(
            &spl_token::id(),
            mint,
            to,
            &self.twist_mint_authority.pubkey(),
            &[],
            amount,
        ).unwrap();
        
        let tx = Transaction::new_signed_with_payer(
            &[mint_to_ix],
            Some(&self.payer.pubkey()),
            &[&self.payer, &self.twist_mint_authority],
            self.recent_blockhash,
        );
        
        self.banks_client.process_transaction(tx).await.unwrap();
    }
    
    pub async fn stake_in_pool(
        &mut self,
        pool: &Pubkey,
        staker: &Keypair,
        staker_twist_account: &Pubkey,
        amount: u64,
    ) {
        // Implementation would include all the necessary accounts
        // This is simplified for brevity
        todo!("Implement stake_in_pool with all required accounts")
    }
    
    pub async fn stake_in_pool_with_nft(
        &mut self,
        pool: &Pubkey,
        staker: &Keypair,
        staker_twist_account: &Pubkey,
        amount: u64,
    ) -> (Pubkey, Pubkey) {
        // Returns (bond_nft_mint, staker_nft_account)
        todo!("Implement stake_in_pool_with_nft")
    }
    
    pub async fn distribute_yield(
        &mut self,
        pool: &Pubkey,
        burn_authority: &Keypair,
        burn_source: &Pubkey,
        amount: u64,
    ) {
        let factory_pda = Pubkey::find_program_address(
            &[FactoryState::SEED_PREFIX],
            &BOND_POOL_FACTORY_ID,
        ).0;
        
        let accounts = DistributeYield {
            factory_state: factory_pda,
            bond_pool: *pool,
            burn_source: *burn_source,
            burn_authority: burn_authority.pubkey(),
            twist_mint: self.twist_mint,
            vau_processor_signer: burn_authority.pubkey(), // Mock for testing
            token_program: spl_token::id(),
        };
        
        let ix = Instruction {
            program_id: BOND_POOL_FACTORY_ID,
            accounts: accounts.to_account_metas(None),
            data: bond_pool_factory::instruction::DistributeYield { burn_amount: amount }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&self.payer.pubkey()),
            &[&self.payer, burn_authority],
            self.recent_blockhash,
        );
        
        self.banks_client.process_transaction(tx).await.unwrap();
    }
    
    pub async fn distribute_yield_from_new_source(&mut self, pool: &Pubkey, amount: u64) {
        let burn_authority = Keypair::new();
        let burn_source = self.create_and_fund_token_account(
            &self.twist_mint,
            &burn_authority.pubkey(),
            amount,
        ).await;
        
        self.distribute_yield(pool, &burn_authority, &burn_source, amount).await;
    }
    
    pub async fn claim_rewards(&mut self, pool: &Pubkey, staker: &Keypair) {
        todo!("Implement claim_rewards")
    }
    
    pub async fn withdraw_stake(&mut self, pool: &Pubkey, staker: &Keypair, shares: u64) {
        todo!("Implement withdraw_stake")
    }
    
    pub async fn early_unwrap(
        &mut self,
        pool: &Pubkey,
        user: &Keypair,
        user_sector_token_account: &Pubkey,
        amount: u64,
    ) {
        todo!("Implement early_unwrap")
    }
    
    pub async fn transfer_sector_tokens(
        &mut self,
        pool: &Pubkey,
        to: &Pubkey,
        amount: u64,
    ) {
        todo!("Implement transfer_sector_tokens")
    }
    
    pub async fn pause_factory(&mut self) {
        todo!("Implement pause_factory")
    }
    
    pub async fn unpause_factory(&mut self) {
        todo!("Implement unpause_factory")
    }
    
    pub async fn get_pool_state(&mut self, pool: &Pubkey) -> BondPool {
        let account = self.banks_client.get_account(*pool).await.unwrap().unwrap();
        BondPool::try_deserialize(&mut account.data.as_slice()).unwrap()
    }
    
    pub async fn get_factory_state(&mut self, factory: &Pubkey) -> FactoryState {
        let account = self.banks_client.get_account(*factory).await.unwrap().unwrap();
        FactoryState::try_deserialize(&mut account.data.as_slice()).unwrap()
    }
    
    pub async fn get_mint_state(&mut self, mint: &Pubkey) -> spl_token::state::Mint {
        let account = self.banks_client.get_account(*mint).await.unwrap().unwrap();
        spl_token::state::Mint::unpack(&account.data).unwrap()
    }
    
    pub async fn get_token_balance(&mut self, account: &Pubkey) -> u64 {
        let account = self.banks_client.get_account(*account).await.unwrap().unwrap();
        let token_account = SplTokenAccount::unpack(&account.data).unwrap();
        token_account.amount
    }
}