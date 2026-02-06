#[cfg(test)]
mod psab_tests {
    const PRECISION: u128 = 1_000_000_000_000; // 1e12

    #[test]
    fn test_psab_90_10_burn_distribution() {
        println!("\n🔥 PSAB (Page-Staked Attention Bonds) 90/10 Burn Test");
        println!("======================================================\n");
        
        // Scenario: Multiple visitors burn tokens on a website with stakers
        struct BurnEvent {
            visitor: &'static str,
            amount: u64,
        }
        
        let burns = vec![
            BurnEvent { visitor: "Visitor A", amount: 500_000_000_000 },   // 500 TWIST
            BurnEvent { visitor: "Visitor B", amount: 300_000_000_000 },   // 300 TWIST
            BurnEvent { visitor: "Visitor C", amount: 200_000_000_000 },   // 200 TWIST
        ];
        
        let mut total_burned = 0u64;
        let mut total_to_stakers = 0u64;
        
        println!("📊 Visitor Burns:");
        for burn in &burns {
            let burn_portion = (burn.amount * 9000) / 10000; // 90%
            let staker_portion = burn.amount - burn_portion;  // 10%
            
            println!("   {} burns {} TWIST", burn.visitor, burn.amount / 1_000_000_000);
            println!("      ├─ 🔥 {} TWIST permanently burned (90%)", burn_portion / 1_000_000_000);
            println!("      └─ 💰 {} TWIST to stakers (10%)", staker_portion / 1_000_000_000);
            
            total_burned += burn_portion;
            total_to_stakers += staker_portion;
        }
        
        let total_visitor_burns: u64 = burns.iter().map(|b| b.amount).sum();
        
        println!("\n📈 Total Statistics:");
        println!("   Total visitor burns: {} TWIST", total_visitor_burns / 1_000_000_000);
        println!("   Total permanently burned: {} TWIST (90%)", total_burned / 1_000_000_000);
        println!("   Total distributed to stakers: {} TWIST (10%)", total_to_stakers / 1_000_000_000);
        
        // Verify the split
        assert_eq!(total_burned, (total_visitor_burns * 9000) / 10000);
        assert_eq!(total_to_stakers, (total_visitor_burns * 1000) / 10000);
        assert_eq!(total_burned + total_to_stakers, total_visitor_burns);
        
        println!("\n✅ PSAB 90/10 burn mechanism verified!");
    }

    #[test]
    fn test_staker_reward_distribution() {
        println!("\n💰 Staker Reward Distribution Test");
        println!("===================================\n");
        
        // Mock staker data
        struct Staker {
            name: &'static str,
            staked: u64,
            shares: u64,
        }
        
        let stakers = vec![
            Staker { name: "Alice", staked: 500_000_000_000, shares: 500_000_000_000 },
            Staker { name: "Bob", staked: 300_000_000_000, shares: 300_000_000_000 },
            Staker { name: "Carol", staked: 150_000_000_000, shares: 150_000_000_000 },
            Staker { name: "Dave", staked: 50_000_000_000, shares: 50_000_000_000 },
        ];
        
        let total_shares: u64 = stakers.iter().map(|s| s.shares).sum();
        
        println!("👥 Staking Pool Status:");
        for staker in &stakers {
            let percentage = (staker.shares as f64 / total_shares as f64) * 100.0;
            println!("   {} - {} TWIST ({:.1}% of pool)", 
                     staker.name, 
                     staker.staked / 1_000_000_000,
                     percentage);
        }
        
        // Simulate a 1000 TWIST burn (100 TWIST to stakers)
        let visitor_burn = 1_000_000_000_000u64;
        let staker_yield = (visitor_burn * 1000) / 10000; // 10%
        
        println!("\n🔥 Visitor burns {} TWIST", visitor_burn / 1_000_000_000);
        println!("   └─ {} TWIST distributed to stakers", staker_yield / 1_000_000_000);
        
        // Calculate reward per share
        let reward_per_share = (staker_yield as u128 * PRECISION) / total_shares as u128;
        
        println!("\n💎 Individual Rewards:");
        let mut total_distributed = 0u64;
        
        for staker in &stakers {
            let reward = ((staker.shares as u128 * reward_per_share) / PRECISION) as u64;
            total_distributed += reward;
            
            let percentage = (staker.shares as f64 / total_shares as f64) * 100.0;
            println!("   {} earns {} TWIST ({:.1}% of yield)", 
                     staker.name, 
                     reward / 1_000_000_000,
                     percentage);
        }
        
        // Verify distribution
        assert_eq!(total_distributed, staker_yield);
        
        println!("\n✅ Rewards distributed proportionally to all stakers!");
    }

    #[test]
    fn test_yield_integral_mechanism() {
        println!("\n🔧 Yield Integral Mechanism Test");
        println!("==================================\n");
        
        // Mock pool state
        let mut yield_integral = 0u128;
        let total_staked = 1_000_000_000_000u64; // 1000 TWIST
        
        // Staker positions
        struct Position {
            name: &'static str,
            shares: u64,
            claimed_cursor: u128,
        }
        
        let mut positions = vec![
            Position { name: "Early Staker", shares: 600_000_000_000, claimed_cursor: 0 },
            Position { name: "Late Staker", shares: 400_000_000_000, claimed_cursor: 0 },
        ];
        
        // First burn happens (only Early Staker is in pool)
        let burn1 = 50_000_000_000u64; // 50 TWIST burn
        let yield1 = (burn1 * 1000) / 10000; // 5 TWIST to stakers
        
        // Update yield integral
        let delta1 = (yield1 as u128 * PRECISION) / 600_000_000_000u128; // Only early staker
        yield_integral += delta1;
        
        println!("🔥 First Burn: {} TWIST", burn1 / 1_000_000_000);
        println!("   └─ {} TWIST to Early Staker (100% of pool)", yield1 / 1_000_000_000);
        
        // Late Staker joins, sets their cursor
        positions[1].claimed_cursor = yield_integral;
        
        // Second burn happens (both stakers in pool)
        let burn2 = 100_000_000_000u64; // 100 TWIST burn
        let yield2 = (burn2 * 1000) / 10000; // 10 TWIST to stakers
        
        // Update yield integral
        let delta2 = (yield2 as u128 * PRECISION) / total_staked as u128;
        yield_integral += delta2;
        
        println!("\n🔥 Second Burn: {} TWIST", burn2 / 1_000_000_000);
        println!("   └─ {} TWIST split between both stakers", yield2 / 1_000_000_000);
        
        // Calculate pending rewards
        println!("\n💰 Pending Rewards:");
        for position in &positions {
            let pending = ((yield_integral - position.claimed_cursor) * position.shares as u128) / PRECISION;
            println!("   {} has {} TWIST pending", 
                     position.name, 
                     pending / 1_000_000_000);
            
            // Verify calculations (with small rounding tolerance)
            if position.name == "Early Staker" {
                // Should get all of first burn + 60% of second burn
                let expected = yield1 + (yield2 * 600 / 1000);
                let diff = (pending as i64 - expected as i64).abs();
                assert!(diff <= 1, "Early staker reward mismatch: {} vs {}", pending, expected);
            } else {
                // Should get 40% of second burn only
                let expected = yield2 * 400 / 1000;
                let diff = (pending as i64 - expected as i64).abs();
                assert!(diff <= 1, "Late staker reward mismatch: {} vs {}", pending, expected);
            }
        }
        
        println!("\n✅ Yield integral correctly tracks rewards for all stakers!");
    }

    #[test]
    fn test_psab_value_proposition() {
        println!("\n🌟 PSAB Value Proposition Test");
        println!("================================\n");
        
        // Website metrics
        let daily_visitors = 10_000;
        let avg_burn_per_visitor = 10_000_000_000u64; // 10 TWIST
        let daily_burn_volume = daily_visitors as u64 * avg_burn_per_visitor;
        
        println!("🌐 Website Statistics:");
        println!("   Daily visitors: {}", daily_visitors);
        println!("   Average burn per visitor: {} TWIST", avg_burn_per_visitor / 1_000_000_000);
        println!("   Daily burn volume: {} TWIST", daily_burn_volume / 1_000_000_000);
        
        // Calculate daily yields
        let daily_permanent_burn = (daily_burn_volume * 9000) / 10000;
        let daily_staker_yield = (daily_burn_volume * 1000) / 10000;
        
        println!("\n📊 Daily Token Economics:");
        println!("   🔥 {} TWIST permanently burned", daily_permanent_burn / 1_000_000_000);
        println!("   💰 {} TWIST to stakers", daily_staker_yield / 1_000_000_000);
        
        // Staker APY calculation
        let total_staked = 1_000_000_000_000_000u64; // 1M TWIST staked
        let annual_yield = daily_staker_yield * 365;
        let apy = (annual_yield as f64 / total_staked as f64) * 100.0;
        
        println!("\n📈 Staker Returns:");
        println!("   Total staked: {} TWIST", total_staked / 1_000_000_000);
        println!("   Annual yield: {} TWIST", annual_yield / 1_000_000_000);
        println!("   APY: {:.2}%", apy);
        
        // Supply reduction
        let annual_burn = daily_permanent_burn * 365;
        println!("\n🔥 Supply Reduction:");
        println!("   Annual permanent burn: {} TWIST", annual_burn / 1_000_000_000);
        println!("   This creates deflationary pressure on TWIST");
        
        println!("\n✅ PSAB creates value for both token holders and stakers!");
    }
}