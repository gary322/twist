/**
 * Quick Ad Network Test
 * A faster version of the comprehensive test
 */

import { runComprehensiveAdNetworkTest } from './comprehensive-ad-test';

// Override config for faster testing
const QUICK_CONFIG = {
  ADVERTISERS: 5,
  PUBLISHERS: 10,
  USERS: 100,
  CAMPAIGNS_PER_ADVERTISER: 2,
  AD_UNITS_PER_PUBLISHER: 2,
  TEST_DURATION_HOURS: 0.1, // 6 minutes instead of 2 hours
  IMPRESSIONS_PER_USER_HOUR: 20,
  CTR: 0.02,
  CVR: 0.05,
  FRAUD_RATE: 0.001,
};

async function runQuickAdNetworkTest() {
  console.log('🚀 Running Quick Ad Network Test (6 minutes)');
  console.log('===========================================');
  
  // Temporarily override the config
  const originalConfig = (global as any).TEST_CONFIG;
  (global as any).TEST_CONFIG = QUICK_CONFIG;
  
  try {
    const result = await runComprehensiveAdNetworkTest();
    
    console.log('\n✅ Quick Test Complete!');
    console.log('======================');
    console.log(`Total Impressions: ${result.summary.totalImpressions.toLocaleString()}`);
    console.log(`Total Clicks: ${result.summary.totalClicks.toLocaleString()}`);
    console.log(`Total Conversions: ${result.summary.totalConversions.toLocaleString()}`);
    console.log(`Total TWIST Rewards: ${result.summary.totalRewards.toFixed(2)}`);
    console.log(`Total Ad Spend: $${result.summary.totalSpend.toFixed(2)}`);
    console.log(`RTB Fill Rate: ${result.efficiency.rtbFillRate}`);
    console.log(`Average CTR: ${(result.summary.avgCTR * 100).toFixed(2)}%`);
    console.log(`Fraud Blocked: ${result.summary.fraudBlocked}`);
    
    return result;
  } finally {
    (global as any).TEST_CONFIG = originalConfig;
  }
}

// Run if called directly
if (require.main === module) {
  runQuickAdNetworkTest().catch(console.error);
}