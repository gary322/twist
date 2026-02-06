import { describe, it, expect } from '@jest/globals';

describe('Basic Test Suite', () => {
  it('should perform basic math', () => {
    expect(2 + 2).toBe(4);
  });

  it('should validate tier calculation', () => {
    const calculateTier = (totalStaked: number): string => {
      if (totalStaked >= 50000) return 'PLATINUM';
      if (totalStaked >= 10000) return 'GOLD';
      if (totalStaked >= 1000) return 'SILVER';
      return 'BRONZE';
    };

    expect(calculateTier(100)).toBe('BRONZE');
    expect(calculateTier(5000)).toBe('SILVER');
    expect(calculateTier(25000)).toBe('GOLD');
    expect(calculateTier(100000)).toBe('PLATINUM');
  });

  it('should calculate staking rewards', () => {
    const calculateRewards = (stake: number, apy: number, days: number): number => {
      return stake * (apy / 365) * days;
    };

    const stake = 1000;
    const apy = 0.2; // 20%
    const days = 365;
    const expectedReward = stake * apy;
    
    expect(calculateRewards(stake, apy, days)).toBeCloseTo(expectedReward, 10);
  });

  it('should validate wallet address format', () => {
    const isValidWalletAddress = (address: string): boolean => {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    };

    expect(isValidWalletAddress('11111111111111111111111111111111')).toBe(true);
    expect(isValidWalletAddress('invalid')).toBe(false);
    expect(isValidWalletAddress('')).toBe(false);
    expect(isValidWalletAddress('DRpbCBMxVnDK7maPdrMuLKMfZCHhLULpEZzFeMGC1xeU')).toBe(true);
  });
});