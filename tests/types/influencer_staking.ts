// Type definitions for Influencer Staking Program

export interface InfluencerStaking {
  version: '0.1.0';
  name: 'influencer_staking';
  instructions: Array<{
    name: string;
    accounts: Array<{
      name: string;
      isMut: boolean;
      isSigner: boolean;
    }>;
    args: Array<{
      name: string;
      type: any;
    }>;
  }>;
  accounts: Array<{
    name: string;
    type: {
      kind: 'struct';
      fields: Array<{
        name: string;
        type: any;
      }>;
    };
  }>;
  events: Array<{
    name: string;
    fields: Array<{
      name: string;
      type: any;
      index: boolean;
    }>;
  }>;
  errors: Array<{
    code: number;
    name: string;
    msg: string;
  }>;
}

export interface StakingPool {
  influencer: string;
  mint: string;
  vault: string;
  totalStaked: bigint;
  stakerCount: number;
  revenueShareBps: number;
  minStake: bigint;
  totalRewardsDistributed: bigint;
  pendingRewards: bigint;
  createdAt: number;
  isActive: boolean;
  bump: number;
}

export interface StakeAccount {
  staker: string;
  pool: string;
  amount: bigint;
  stakedAt: number;
  lastClaim: number;
  totalClaimed: bigint;
  pendingRewards: bigint;
}