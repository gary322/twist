// Global Test Setup with Fixes
import { TEST_CONFIG_FIXES } from '../config/test-fixes.config';

export default async function globalSetup() {
  logger.log('\n🔧 Setting up test environment with fixes...\n');
  
  // Set environment variables
  process.env.NODE_ENV = 'test';
  process.env.SOLANA_NETWORK = 'devnet';
  
  // Initialize test RPC endpoints
  if (!process.env.HELIUS_API_KEY) {
    process.env.HELIUS_API_KEY = 'test-key';
  }
  if (!process.env.QUICKNODE_API_KEY) {
    process.env.QUICKNODE_API_KEY = 'test-key';
  }
  if (!process.env.ALCHEMY_API_KEY) {
    process.env.ALCHEMY_API_KEY = 'test-key';
  }
  
  // Setup test wallet
  process.env.TEST_WALLET_PRIVATE_KEY = Array(64).fill(1).join('');
  
  // Configure timeouts
  process.env.DEFAULT_TIMEOUT = String(TEST_CONFIG_FIXES.rpc.timeouts.default);
  process.env.BRIDGE_TIMEOUT = String(TEST_CONFIG_FIXES.bridge.avalanche.timeout);
  
  logger.log('✅ Test environment configured');
  logger.log(`   - Network: ${process.env.SOLANA_NETWORK}`);
  logger.log(`   - Default timeout: ${process.env.DEFAULT_TIMEOUT}ms`);
  logger.log(`   - Bridge timeout: ${process.env.BRIDGE_TIMEOUT}ms`);
  logger.log(`   - Jest timeout: ${TEST_CONFIG_FIXES.general.jestTimeout}ms`);
  
  // Start local validator if needed
  if (process.env.USE_LOCAL_VALIDATOR === 'true') {
    logger.log('\n🚀 Starting local Solana validator...');
    // Validator start logic here
  }
  
  logger.log('\n✨ Global setup complete\n');
}