use anchor_lang::prelude::*;

#[account]
pub struct MultisigConfig {
    pub multisig_address: Pubkey,
    pub threshold: u64,
    pub members: Vec<Pubkey>,
    pub transaction_count: u64,
    pub initialized: bool,
    pub bump: u8,
    
    // Pending transactions
    pub pending_transactions: u64,
    
    // Time delays for different operations
    pub parameter_update_delay: i64,    // Delay for parameter updates
    pub treasury_withdrawal_delay: i64, // Delay for treasury withdrawals
    pub authority_transfer_delay: i64,  // Delay for authority transfers
    
    // Reserved space
    pub _reserved: [u8; 64],
}

impl MultisigConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // multisig_address
        8 + // threshold
        4 + (32 * 10) + // members vec (max 10 members)
        8 + // transaction_count
        1 + // initialized
        1 + // bump
        8 + // pending_transactions
        8 + 8 + 8 + // time delays
        64; // reserved
        
    pub fn is_member(&self, pubkey: &Pubkey) -> bool {
        self.members.contains(pubkey)
    }
    
    pub fn validate_threshold(&self) -> bool {
        self.threshold > 0 && 
        self.threshold <= self.members.len() as u64 &&
        self.members.len() >= 3 // Minimum 3 members
    }
}

#[account]
pub struct MultisigTransaction {
    pub multisig: Pubkey,
    pub transaction_index: u64,
    pub proposer: Pubkey,
    pub instruction_data: Vec<u8>,
    pub instruction_program_id: Pubkey,
    pub instruction_accounts: Vec<TransactionAccount>,
    pub signers: Vec<Pubkey>,
    pub executed: bool,
    pub cancelled: bool,
    pub created_at: i64,
    pub executed_at: i64,
    pub eta: i64, // Estimated time of arrival (timelock)
    pub bump: u8,
    
    // Transaction metadata
    pub title: String,
    pub description: String,
    
    // Reserved space
    pub _reserved: [u8; 32],
}

impl MultisigTransaction {
    pub const LEN: usize = 8 + // discriminator
        32 + // multisig
        8 + // transaction_index
        32 + // proposer
        4 + 1024 + // instruction_data (max 1KB)
        32 + // instruction_program_id
        4 + (64 * 10) + // instruction_accounts (max 10 accounts)
        4 + (32 * 10) + // signers (max 10 signers)
        1 + // executed
        1 + // cancelled
        8 + // created_at
        8 + // executed_at
        8 + // eta
        1 + // bump
        4 + 64 + // title (max 64 chars)
        4 + 256 + // description (max 256 chars)
        32; // reserved
        
    pub fn has_signed(&self, signer: &Pubkey) -> bool {
        self.signers.contains(signer)
    }
    
    pub fn signature_count(&self) -> u64 {
        self.signers.len() as u64
    }
    
    pub fn can_execute(&self, threshold: u64, current_time: i64) -> bool {
        !self.executed && 
        !self.cancelled && 
        self.signature_count() >= threshold &&
        current_time >= self.eta
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TransactionAccount {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MultisigParams {
    pub members: Vec<Pubkey>,
    pub threshold: u64,
    pub parameter_update_delay: i64,
    pub treasury_withdrawal_delay: i64,
    pub authority_transfer_delay: i64,
}

impl Default for MultisigParams {
    fn default() -> Self {
        Self {
            members: vec![],
            threshold: 3,
            parameter_update_delay: 86400,     // 24 hours
            treasury_withdrawal_delay: 172800, // 48 hours
            authority_transfer_delay: 259200,  // 72 hours
        }
    }
}