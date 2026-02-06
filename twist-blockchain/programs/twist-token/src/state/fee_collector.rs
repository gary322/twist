use anchor_lang::prelude::*;

#[account]
pub struct FeeCollectorState {
    pub authority: Pubkey,
    pub bump: u8,
    
    // Fee sources tracking
    pub total_trading_fees: u128,
    pub total_withdrawal_fees: u128,
    pub total_bridge_fees: u128,
    pub total_liquidity_fees: u128,
    pub total_other_fees: u128,
    
    // Distribution tracking
    pub total_distributed: u128,
    pub last_distribution_timestamp: i64,
    
    // Fee configuration
    pub trading_fee_bps: u64,      // Trading fee in basis points
    pub withdrawal_fee_bps: u64,   // Early withdrawal penalty
    pub bridge_fee_bps: u64,       // Cross-chain bridge fee
    pub liquidity_fee_bps: u64,    // Liquidity provision fee
    
    // Distribution configuration (must sum to 10000)
    pub floor_treasury_share_bps: u64,    // Share to floor treasury
    pub ops_treasury_share_bps: u64,       // Share to operations
    pub staking_rewards_share_bps: u64,    // Share to stakers
    pub burn_share_bps: u64,               // Share to burn
    
    // Accumulator accounts
    pub pending_distribution: u64,
    pub min_distribution_amount: u64,
    
    // Stats
    pub distributions_count: u64,
    pub unique_fee_payers: u64,
    
    // Reserved space
    pub _reserved: [u8; 64],
}

impl FeeCollectorState {
    pub const LEN: usize = 8 + // discriminator
        32 + 1 + // authority + bump
        16 + 16 + 16 + 16 + 16 + // fee source tracking (u128s)
        16 + 8 + // distribution tracking
        8 + 8 + 8 + 8 + // fee configuration
        8 + 8 + 8 + 8 + // distribution configuration
        8 + 8 + // accumulator accounts
        8 + 8 + // stats
        64; // reserved
        
    pub fn validate_distribution_shares(&self) -> bool {
        let total = self.floor_treasury_share_bps +
            self.ops_treasury_share_bps +
            self.staking_rewards_share_bps +
            self.burn_share_bps;
        
        total == 10000 // Must sum to 100%
    }
    
    pub fn calculate_distribution_amounts(&self, total_amount: u64) -> FeeDistribution {
        FeeDistribution {
            floor_treasury: (total_amount as u128 * self.floor_treasury_share_bps as u128 / 10000) as u64,
            ops_treasury: (total_amount as u128 * self.ops_treasury_share_bps as u128 / 10000) as u64,
            staking_rewards: (total_amount as u128 * self.staking_rewards_share_bps as u128 / 10000) as u64,
            burn_amount: (total_amount as u128 * self.burn_share_bps as u128 / 10000) as u64,
        }
    }
    
    pub fn record_fee(&mut self, fee_type: FeeType, amount: u64) {
        match fee_type {
            FeeType::Trading => {
                self.total_trading_fees = self.total_trading_fees.saturating_add(amount as u128);
            },
            FeeType::Withdrawal => {
                self.total_withdrawal_fees = self.total_withdrawal_fees.saturating_add(amount as u128);
            },
            FeeType::Bridge => {
                self.total_bridge_fees = self.total_bridge_fees.saturating_add(amount as u128);
            },
            FeeType::Liquidity => {
                self.total_liquidity_fees = self.total_liquidity_fees.saturating_add(amount as u128);
            },
            FeeType::Other => {
                self.total_other_fees = self.total_other_fees.saturating_add(amount as u128);
            },
        }
        
        self.pending_distribution = self.pending_distribution.saturating_add(amount);
    }
    
    pub fn get_total_fees_collected(&self) -> u128 {
        self.total_trading_fees
            .saturating_add(self.total_withdrawal_fees)
            .saturating_add(self.total_bridge_fees)
            .saturating_add(self.total_liquidity_fees)
            .saturating_add(self.total_other_fees)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct FeeDistribution {
    pub floor_treasury: u64,
    pub ops_treasury: u64,
    pub staking_rewards: u64,
    pub burn_amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum FeeType {
    Trading,
    Withdrawal,
    Bridge,
    Liquidity,
    Other,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FeeCollectorParams {
    pub trading_fee_bps: u64,
    pub withdrawal_fee_bps: u64,
    pub bridge_fee_bps: u64,
    pub liquidity_fee_bps: u64,
    pub floor_treasury_share_bps: u64,
    pub ops_treasury_share_bps: u64,
    pub staking_rewards_share_bps: u64,
    pub burn_share_bps: u64,
    pub min_distribution_amount: u64,
}

impl Default for FeeCollectorParams {
    fn default() -> Self {
        Self {
            trading_fee_bps: 30,        // 0.3% trading fee
            withdrawal_fee_bps: 100,    // 1% early withdrawal
            bridge_fee_bps: 10,         // 0.1% bridge fee
            liquidity_fee_bps: 5,       // 0.05% liquidity fee
            floor_treasury_share_bps: 4000,    // 40% to floor
            ops_treasury_share_bps: 3000,      // 30% to ops
            staking_rewards_share_bps: 2000,   // 20% to stakers
            burn_share_bps: 1000,              // 10% burn
            min_distribution_amount: 1000 * 10u64.pow(9), // 1000 TWIST minimum
        }
    }
}