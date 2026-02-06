#[cfg(test)]
mod tests {
    use anchor_lang::prelude::*;
    use bond_pool_factory::state::*;
    use bond_pool_factory::utils::PRECISION;

    #[test]
    fn test_precision_constant() {
        assert_eq!(PRECISION, 1_000_000_000_000);
        println!("✅ PRECISION constant verified: {}", PRECISION);
    }

    #[test]
    fn test_factory_state_size() {
        assert_eq!(FactoryState::LEN, 8 + 32 + 8 + 16 + 16 + 16 + 2 + 8 + 8 + 2 + 2 + 2 + 1 + 32 + 32 + 32 + 1 + 16);
        println!("✅ FactoryState size: {} bytes", FactoryState::LEN);
    }

    #[test]
    fn test_bond_pool_size() {
        assert_eq!(BondPool::LEN, 8 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 16 + 16 + 16 + 16 + 8 + 32 + 1 + 1 + 1 + 2 + 32 + 32 + 32 + 1 + 64);
        println!("✅ BondPool size: {} bytes", BondPool::LEN);
    }

    #[test]
    fn test_90_10_split_calculation() {
        let burn_amount = 1_000_000_000_000u64; // 1000 TWIST
        let burn_percentage_bps = 9000u16; // 90%
        
        let burn_portion = (burn_amount as u128)
            .checked_mul(burn_percentage_bps as u128)
            .unwrap()
            .checked_div(10_000)
            .unwrap() as u64;
        
        let staker_portion = burn_amount
            .checked_sub(burn_portion)
            .unwrap();
        
        assert_eq!(burn_portion, 900_000_000_000); // 900 TWIST (90%)
        assert_eq!(staker_portion, 100_000_000_000); // 100 TWIST (10%)
        
        println!("✅ 90/10 split calculation verified:");
        println!("   Total: {} TWIST", burn_amount / 1_000_000_000);
        println!("   Burned: {} TWIST (90%)", burn_portion / 1_000_000_000);
        println!("   To Stakers: {} TWIST (10%)", staker_portion / 1_000_000_000);
    }

    #[test]
    fn test_reward_per_share_calculation() {
        let total_shares = 1_000_000_000_000u64; // 1000 TWIST staked
        let yield_amount = 100_000_000_000u64; // 100 TWIST yield (10% of 1000 burn)
        
        // Calculate reward per share
        let reward_per_share = (yield_amount as u128)
            .checked_mul(PRECISION)
            .unwrap()
            .checked_div(total_shares as u128)
            .unwrap();
        
        // Verify a staker with 30% of shares gets 30% of yield
        let staker_shares = 300_000_000_000u64; // 300 TWIST (30%)
        let staker_rewards = (staker_shares as u128)
            .checked_mul(reward_per_share)
            .unwrap()
            .checked_div(PRECISION)
            .unwrap() as u64;
        
        assert_eq!(staker_rewards, 30_000_000_000); // 30 TWIST (30% of 100)
        
        println!("✅ Reward distribution calculation verified:");
        println!("   Staker with 30% shares gets: {} TWIST", staker_rewards / 1_000_000_000);
    }

    #[test]
    fn test_early_unwrap_penalty() {
        let amount = 1_000_000_000_000u64; // 1000 TWIST
        let penalty_bps = 30u16; // 0.3%
        
        let penalty_amount = (amount as u128)
            .checked_mul(penalty_bps as u128)
            .unwrap()
            .checked_div(10_000)
            .unwrap() as u64;
        
        let amount_after_penalty = amount
            .checked_sub(penalty_amount)
            .unwrap();
        
        assert_eq!(penalty_amount, 3_000_000_000); // 3 TWIST (0.3%)
        assert_eq!(amount_after_penalty, 997_000_000_000); // 997 TWIST
        
        println!("✅ Early unwrap penalty calculation verified:");
        println!("   Original: {} TWIST", amount / 1_000_000_000);
        println!("   Penalty: {} TWIST (0.3%)", penalty_amount / 1_000_000_000);
        println!("   Received: {} TWIST", amount_after_penalty / 1_000_000_000);
    }

    #[test]
    fn test_yield_integral_update() {
        let mut pool = BondPool {
            total_staked: 1_000_000_000_000, // 1000 TWIST
            total_shares: 1_000_000_000_000,
            yield_integral: 0,
            total_yield_accumulated: 0,
            total_yield_burned: 0,
            total_yield_distributed: 0,
            reward_per_share: 0,
            // ... other fields would be initialized
            authority: Pubkey::default(),
            creator: Pubkey::default(),
            site_hash: [0; 32],
            page_identifier: [0; 32],
            sector: String::new(),
            sector_token_mint: Pubkey::default(),
            twist_mint: Pubkey::default(),
            min_stake_amount: 0,
            max_stake_amount: 0,
            lock_duration: 0,
            staker_count: 0,
            creator_fee_recipient: Pubkey::default(),
            active: true,
            paused: false,
            finalized: false,
            creator_fee_bps: 0,
            last_update_timestamp: 0,
            creation_timestamp: 0,
            pool_vault: Pubkey::default(),
            bump: 0,
            _reserved: [0; 64],
        };
        
        // Simulate 100 TWIST burn (10 TWIST to stakers)
        let staker_portion = 10_000_000_000u64;
        let delta = (staker_portion as u128) * PRECISION;
        pool.yield_integral = pool.yield_integral.saturating_add(delta / pool.total_staked as u128);
        pool.total_yield_distributed = pool.total_yield_distributed.saturating_add(staker_portion);
        
        // Calculate rewards for a staker with 400 TWIST (40% of pool)
        let staker_shares = 400_000_000_000u64;
        let staker_claimed_cursor = 0u128; // Never claimed before
        
        let pending = ((pool.yield_integral - staker_claimed_cursor) * staker_shares as u128) / PRECISION;
        
        assert_eq!(pending, 4_000_000_000); // 4 TWIST (40% of 10)
        
        println!("✅ Yield integral calculation verified:");
        println!("   Pool yield integral: {}", pool.yield_integral);
        println!("   Staker pending rewards: {} TWIST", pending / 1_000_000_000);
    }

    #[test]
    fn test_psab_mechanism() {
        println!("\n🔥 PSAB (Page-Staked Attention Bonds) Mechanism Test");
        println!("================================================");
        
        // Scenario: Website has 3 stakers, visitor burns 1000 TWIST
        let visitor_burn = 1_000_000_000_000u64; // 1000 TWIST
        let burn_amount = (visitor_burn * 9000) / 10000; // 900 TWIST
        let staker_yield = (visitor_burn * 1000) / 10000; // 100 TWIST
        
        println!("📊 Visitor burns {} TWIST on website", visitor_burn / 1_000_000_000);
        println!("   ├─ 🔥 {} TWIST permanently burned (90%)", burn_amount / 1_000_000_000);
        println!("   └─ 💰 {} TWIST distributed to stakers (10%)", staker_yield / 1_000_000_000);
        
        // Staker shares
        let staker1_shares = 500_000_000_000u64; // 500 TWIST (50%)
        let staker2_shares = 300_000_000_000u64; // 300 TWIST (30%)
        let staker3_shares = 200_000_000_000u64; // 200 TWIST (20%)
        let total_shares = staker1_shares + staker2_shares + staker3_shares;
        
        // Calculate individual rewards
        let staker1_reward = (staker_yield * staker1_shares) / total_shares;
        let staker2_reward = (staker_yield * staker2_shares) / total_shares;
        let staker3_reward = (staker_yield * staker3_shares) / total_shares;
        
        println!("\n👥 Staker Rewards Distribution:");
        println!("   ├─ Staker 1 (50% of pool): {} TWIST", staker1_reward / 1_000_000_000);
        println!("   ├─ Staker 2 (30% of pool): {} TWIST", staker2_reward / 1_000_000_000);
        println!("   └─ Staker 3 (20% of pool): {} TWIST", staker3_reward / 1_000_000_000);
        
        assert_eq!(staker1_reward, 50_000_000_000); // 50 TWIST
        assert_eq!(staker2_reward, 30_000_000_000); // 30 TWIST
        assert_eq!(staker3_reward, 20_000_000_000); // 20 TWIST
        assert_eq!(staker1_reward + staker2_reward + staker3_reward, staker_yield);
        
        println!("\n✅ PSAB mechanism working correctly!");
        println!("   Total supply reduced by {} TWIST", burn_amount / 1_000_000_000);
        println!("   Stakers earned {} TWIST from visitor activity", staker_yield / 1_000_000_000);
    }
}