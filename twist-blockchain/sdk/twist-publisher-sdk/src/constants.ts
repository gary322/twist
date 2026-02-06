import { PublicKey } from '@solana/web3.js';

// Program IDs
export const BOND_POOL_FACTORY_ID = new PublicKey('BondPoo1111111111111111111111111111111111111');
export const VAU_PROCESSOR_ID = new PublicKey('VAUProc11111111111111111111111111111111111');
export const TWIST_MINT = new PublicKey('TWSTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'); // Replace with actual mint

// Configuration
export const DEFAULT_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
export const DEFAULT_COMMITMENT = 'confirmed';

// PSAB Parameters
export const BURN_PERCENTAGE_BPS = 9000; // 90%
export const YIELD_PERCENTAGE_BPS = 1000; // 10%
export const MIN_STAKE_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds

// Widget Configuration
export const WIDGET_STYLES = {
  default: {
    backgroundColor: '#8B5CF6',
    textColor: '#FFFFFF',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
  },
  dark: {
    backgroundColor: '#1F2937',
    textColor: '#F3F4F6',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
  },
  minimal: {
    backgroundColor: 'transparent',
    textColor: '#374151',
    borderRadius: '4px',
    fontFamily: 'system-ui, sans-serif',
  },
};

// Analytics Events
export const ANALYTICS_EVENTS = {
  WIDGET_LOADED: 'psab_widget_loaded',
  STAKE_INITIATED: 'psab_stake_initiated',
  STAKE_COMPLETED: 'psab_stake_completed',
  BURN_INITIATED: 'psab_burn_initiated',
  BURN_COMPLETED: 'psab_burn_completed',
  REWARDS_CLAIMED: 'psab_rewards_claimed',
  ERROR_OCCURRED: 'psab_error_occurred',
};