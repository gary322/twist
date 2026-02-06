export * from './client';
export * from './instructions';
export * from './accounts';
export * from './types';
export * from './utils';
export * from './constants';

// Re-export specialized modules
export * from './defi/orca-integration';
export * from './oracles/price-aggregator';
export * from './economics/pid-controller';
export * from './safety/circuit-breaker';

// Version
export const SDK_VERSION = '1.0.0';