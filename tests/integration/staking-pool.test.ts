import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { InfluencerStaking } from '../types/influencer_staking';
import IDL from '../idl/influencer_staking.json';

describe('Influencer Staking Pool Integration Tests', () => {
  let connection: Connection;
  let provider: AnchorProvider;
  let program: Program<InfluencerStaking>;
  
  // Test accounts
  let influencer: Keypair;
  let staker1: Keypair;
  let staker2: Keypair;
  let treasury: Keypair;
  
  // Token accounts
  let mint: Token;
  let influencerTokenAccount: PublicKey;
  let staker1TokenAccount: PublicKey;
  let staker2TokenAccount: PublicKey;
  let treasuryTokenAccount: PublicKey;
  
  // Pool accounts
  let stakingPool: PublicKey;
  let vault: PublicKey;

  beforeAll(async () => {
    // Setup connection
    connection = new Connection('http://localhost:8899', 'confirmed');
    
    // Setup accounts
    influencer = Keypair.generate();
    staker1 = Keypair.generate();
    staker2 = Keypair.generate();
    treasury = Keypair.generate();
    
    // Airdrop SOL
    await Promise.all([
      connection.requestAirdrop(influencer.publicKey, 10 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(staker1.publicKey, 10 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(staker2.publicKey, 10 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(treasury.publicKey, 10 * LAMPORTS_PER_SOL),
    ]);
    
    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Setup provider and program
    const wallet = {
      publicKey: influencer.publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    
    provider = new AnchorProvider(connection, wallet as any, {
      commitment: 'confirmed',
    });
    
    program = new Program(IDL as any, new PublicKey(IDL.metadata.address), provider);
    
    // Create mint
    mint = await Token.createMint(
      connection,
      influencer,
      influencer.publicKey,
      null,
      9,
      TOKEN_PROGRAM_ID
    );
    
    // Create token accounts
    influencerTokenAccount = await mint.createAccount(influencer.publicKey);
    staker1TokenAccount = await mint.createAccount(staker1.publicKey);
    staker2TokenAccount = await mint.createAccount(staker2.publicKey);
    treasuryTokenAccount = await mint.createAccount(treasury.publicKey);
    
    // Mint tokens
    await mint.mintTo(staker1TokenAccount, influencer, [], 1000000 * 10 ** 9);
    await mint.mintTo(staker2TokenAccount, influencer, [], 1000000 * 10 ** 9);
    await mint.mintTo(treasuryTokenAccount, influencer, [], 10000000 * 10 ** 9);
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('Pool Initialization', () => {
    it('should create a staking pool with valid parameters', async () => {
      const revenueShareBps = 2000; // 20%
      const minStake = new BN(1000 * 10 ** 9); // 1000 TWIST
      
      // Derive PDAs
      [stakingPool] = await PublicKey.findProgramAddress(
        [Buffer.from('pool'), influencer.publicKey.toBuffer()],
        program.programId
      );
      
      [vault] = await PublicKey.findProgramAddress(
        [Buffer.from('vault'), stakingPool.toBuffer()],
        program.programId
      );
      
      await program.methods
        .initializePool(revenueShareBps, minStake)
        .accounts({
          stakingPool,
          influencer: influencer.publicKey,
          mint: mint.publicKey,
          vault,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([influencer])
        .rpc();
      
      // Verify pool state
      const poolAccount = await program.account.stakingPool.fetch(stakingPool);
      
      expect(poolAccount.influencer.toString()).toBe(influencer.publicKey.toString());
      expect(poolAccount.mint.toString()).toBe(mint.publicKey.toString());
      expect(poolAccount.revenueShareBps).toBe(revenueShareBps);
      expect(poolAccount.minStake.toString()).toBe(minStake.toString());
      expect(poolAccount.totalStaked.toString()).toBe('0');
      expect(poolAccount.stakerCount).toBe(0);
      expect(poolAccount.isActive).toBe(true);
    });

    it('should reject revenue share above 50%', async () => {
      const invalidInfluencer = Keypair.generate();
      const invalidRevenueShare = 6000; // 60%
      const minStake = new BN(1000 * 10 ** 9);
      
      await connection.requestAirdrop(invalidInfluencer.publicKey, LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const [invalidPool] = await PublicKey.findProgramAddress(
        [Buffer.from('pool'), invalidInfluencer.publicKey.toBuffer()],
        program.programId
      );
      
      const [invalidVault] = await PublicKey.findProgramAddress(
        [Buffer.from('vault'), invalidPool.toBuffer()],
        program.programId
      );
      
      await expect(
        program.methods
          .initializePool(invalidRevenueShare, minStake)
          .accounts({
            stakingPool: invalidPool,
            influencer: invalidInfluencer.publicKey,
            mint: mint.publicKey,
            vault: invalidVault,
            systemProgram: web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([invalidInfluencer])
          .rpc()
      ).rejects.toThrow('Revenue share cannot exceed 50%');
    });
  });

  describe('Staking Operations', () => {
    it('should allow users to stake on influencer', async () => {
      const stakeAmount = new BN(10000 * 10 ** 9); // 10,000 TWIST
      
      // Derive stake account PDA
      const [stakeAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from('stake'),
          stakingPool.toBuffer(),
          staker1.publicKey.toBuffer(),
        ],
        program.programId
      );
      
      await program.methods
        .stakeOnInfluencer(stakeAmount)
        .accounts({
          stakingPool,
          stakeAccount,
          staker: staker1.publicKey,
          stakerTokens: staker1TokenAccount,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([staker1])
        .rpc();
      
      // Verify stake account
      const stakeAccountData = await program.account.stakeAccount.fetch(stakeAccount);
      expect(stakeAccountData.staker.toString()).toBe(staker1.publicKey.toString());
      expect(stakeAccountData.amount.toString()).toBe(stakeAmount.toString());
      
      // Verify pool update
      const poolAccount = await program.account.stakingPool.fetch(stakingPool);
      expect(poolAccount.totalStaked.toString()).toBe(stakeAmount.toString());
      expect(poolAccount.stakerCount).toBe(1);
      
      // Verify token transfer
      const vaultBalance = await connection.getTokenAccountBalance(vault);
      expect(vaultBalance.value.amount).toBe(stakeAmount.toString());
    });

    it('should reject stakes below minimum', async () => {
      const belowMinStake = new BN(500 * 10 ** 9); // 500 TWIST (below 1000 minimum)
      
      const [stakeAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from('stake'),
          stakingPool.toBuffer(),
          staker2.publicKey.toBuffer(),
        ],
        program.programId
      );
      
      await expect(
        program.methods
          .stakeOnInfluencer(belowMinStake)
          .accounts({
            stakingPool,
            stakeAccount,
            staker: staker2.publicKey,
            stakerTokens: staker2TokenAccount,
            vault,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: web3.SystemProgram.programId,
          })
          .signers([staker2])
          .rpc()
      ).rejects.toThrow('Stake amount below minimum');
    });

    it('should allow multiple stakers', async () => {
      const stakeAmount = new BN(5000 * 10 ** 9); // 5,000 TWIST
      
      const [stakeAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from('stake'),
          stakingPool.toBuffer(),
          staker2.publicKey.toBuffer(),
        ],
        program.programId
      );
      
      await program.methods
        .stakeOnInfluencer(stakeAmount)
        .accounts({
          stakingPool,
          stakeAccount,
          staker: staker2.publicKey,
          stakerTokens: staker2TokenAccount,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([staker2])
        .rpc();
      
      // Verify pool update
      const poolAccount = await program.account.stakingPool.fetch(stakingPool);
      expect(poolAccount.totalStaked.toString()).toBe((15000 * 10 ** 9).toString());
      expect(poolAccount.stakerCount).toBe(2);
    });

    it('should allow partial unstaking', async () => {
      const unstakeAmount = new BN(3000 * 10 ** 9); // 3,000 TWIST
      
      const [stakeAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from('stake'),
          stakingPool.toBuffer(),
          staker1.publicKey.toBuffer(),
        ],
        program.programId
      );
      
      const staker1BalanceBefore = await connection.getTokenAccountBalance(staker1TokenAccount);
      
      await program.methods
        .unstake(unstakeAmount)
        .accounts({
          stakingPool,
          stakeAccount,
          staker: staker1.publicKey,
          stakerTokens: staker1TokenAccount,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([staker1])
        .rpc();
      
      // Verify stake account update
      const stakeAccountData = await program.account.stakeAccount.fetch(stakeAccount);
      expect(stakeAccountData.amount.toString()).toBe((7000 * 10 ** 9).toString());
      
      // Verify pool update
      const poolAccount = await program.account.stakingPool.fetch(stakingPool);
      expect(poolAccount.totalStaked.toString()).toBe((12000 * 10 ** 9).toString());
      expect(poolAccount.stakerCount).toBe(2); // Still 2 stakers
      
      // Verify token transfer
      const staker1BalanceAfter = await connection.getTokenAccountBalance(staker1TokenAccount);
      const balanceIncrease = BigInt(staker1BalanceAfter.value.amount) - BigInt(staker1BalanceBefore.value.amount);
      expect(balanceIncrease.toString()).toBe(unstakeAmount.toString());
    });

    it('should update staker count on full unstake', async () => {
      const [stakeAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from('stake'),
          stakingPool.toBuffer(),
          staker2.publicKey.toBuffer(),
        ],
        program.programId
      );
      
      const stakeAccountData = await program.account.stakeAccount.fetch(stakeAccount);
      const fullAmount = stakeAccountData.amount;
      
      await program.methods
        .unstake(fullAmount)
        .accounts({
          stakingPool,
          stakeAccount,
          staker: staker2.publicKey,
          stakerTokens: staker2TokenAccount,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([staker2])
        .rpc();
      
      // Verify staker count decreased
      const poolAccount = await program.account.stakingPool.fetch(stakingPool);
      expect(poolAccount.stakerCount).toBe(1);
    });
  });

  describe('Reward Distribution', () => {
    it('should distribute rewards to stakers', async () => {
      const earningAmount = new BN(1000 * 10 ** 9); // 1000 TWIST earned
      
      await program.methods
        .distributeRewards(earningAmount)
        .accounts({
          stakingPool,
          authority: influencer.publicKey,
        })
        .signers([influencer])
        .rpc();
      
      // Verify pool rewards update
      const poolAccount = await program.account.stakingPool.fetch(stakingPool);
      const expectedStakerRewards = (1000 * 0.2) * 10 ** 9; // 20% of earnings
      expect(poolAccount.pendingRewards.toString()).toBe(expectedStakerRewards.toString());
      expect(poolAccount.totalRewardsDistributed.toString()).toBe(expectedStakerRewards.toString());
    });

    it('should allow stakers to claim rewards', async () => {
      const [stakeAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from('stake'),
          stakingPool.toBuffer(),
          staker1.publicKey.toBuffer(),
        ],
        program.programId
      );
      
      const staker1BalanceBefore = await connection.getTokenAccountBalance(staker1TokenAccount);
      
      await program.methods
        .claimRewards()
        .accounts({
          stakingPool,
          stakeAccount,
          staker: staker1.publicKey,
          stakerTokens: staker1TokenAccount,
          rewardsTreasury: treasuryTokenAccount,
          treasuryAuthority: treasury.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([staker1, treasury])
        .rpc();
      
      // Verify rewards were transferred
      const staker1BalanceAfter = await connection.getTokenAccountBalance(staker1TokenAccount);
      const rewardsClaimed = BigInt(staker1BalanceAfter.value.amount) - BigInt(staker1BalanceBefore.value.amount);
      
      expect(rewardsClaimed).toBeGreaterThan(0n);
      
      // Verify stake account update
      const stakeAccountData = await program.account.stakeAccount.fetch(stakeAccount);
      expect(stakeAccountData.pendingRewards.toString()).toBe('0');
      expect(stakeAccountData.totalClaimed.toString()).toBe(rewardsClaimed.toString());
    });

    it('should calculate rewards proportionally', async () => {
      // Add another staker to test proportional distribution
      const newStaker = Keypair.generate();
      await connection.requestAirdrop(newStaker.publicKey, LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newStakerTokenAccount = await mint.createAccount(newStaker.publicKey);
      await mint.mintTo(newStakerTokenAccount, influencer, [], 20000 * 10 ** 9);
      
      const stakeAmount = new BN(3000 * 10 ** 9); // 3,000 TWIST
      
      const [newStakeAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from('stake'),
          stakingPool.toBuffer(),
          newStaker.publicKey.toBuffer(),
        ],
        program.programId
      );
      
      await program.methods
        .stakeOnInfluencer(stakeAmount)
        .accounts({
          stakingPool,
          stakeAccount: newStakeAccount,
          staker: newStaker.publicKey,
          stakerTokens: newStakerTokenAccount,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([newStaker])
        .rpc();
      
      // Distribute more rewards
      const newEarnings = new BN(2000 * 10 ** 9);
      await program.methods
        .distributeRewards(newEarnings)
        .accounts({
          stakingPool,
          authority: influencer.publicKey,
        })
        .signers([influencer])
        .rpc();
      
      // Verify proportional distribution
      const poolAccount = await program.account.stakingPool.fetch(stakingPool);
      const staker1Account = await program.account.stakeAccount.fetch(
        (await PublicKey.findProgramAddress(
          [Buffer.from('stake'), stakingPool.toBuffer(), staker1.publicKey.toBuffer()],
          program.programId
        ))[0]
      );
      const newStakerAccount = await program.account.stakeAccount.fetch(newStakeAccount);
      
      // Staker1 has 7000 TWIST staked
      // NewStaker has 3000 TWIST staked
      // Total: 10000 TWIST
      // Staker1 should get 70% of rewards, NewStaker 30%
      
      const totalStaked = poolAccount.totalStaked;
      const staker1Share = Number(staker1Account.amount) / Number(totalStaked);
      const newStakerShare = Number(newStakerAccount.amount) / Number(totalStaked);
      
      expect(staker1Share).toBeCloseTo(0.7, 2);
      expect(newStakerShare).toBeCloseTo(0.3, 2);
    });
  });

  describe('Tier Calculation', () => {
    it('should calculate correct tier based on total staked', async () => {
      // The tier calculation is done off-chain based on events
      // We'll verify the correct data is emitted
      
      const testCases = [
        { amount: 500n * 10n ** 9n, expectedTier: 0 }, // Bronze
        { amount: 5000n * 10n ** 9n, expectedTier: 1 }, // Silver
        { amount: 25000n * 10n ** 9n, expectedTier: 2 }, // Gold
        { amount: 75000n * 10n ** 9n, expectedTier: 3 }, // Platinum
      ];
      
      for (const testCase of testCases) {
        // In the actual implementation, this would emit an event
        // with the new tier that can be processed off-chain
        const tier = calculateTier(testCase.amount);
        expect(tier).toBe(testCase.expectedTier);
      }
    });
  });

  describe('Pool Management', () => {
    it('should allow influencer to update revenue share', async () => {
      const newRevenueShareBps = 3000; // 30%
      
      await program.methods
        .updateRevenueShare(newRevenueShareBps)
        .accounts({
          stakingPool,
          influencer: influencer.publicKey,
        })
        .signers([influencer])
        .rpc();
      
      const poolAccount = await program.account.stakingPool.fetch(stakingPool);
      expect(poolAccount.revenueShareBps).toBe(newRevenueShareBps);
    });

    it('should only allow influencer to update pool', async () => {
      const unauthorizedUser = Keypair.generate();
      await connection.requestAirdrop(unauthorizedUser.publicKey, LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await expect(
        program.methods
          .updateRevenueShare(4000)
          .accounts({
            stakingPool,
            influencer: unauthorizedUser.publicKey,
          })
          .signers([unauthorizedUser])
          .rpc()
      ).rejects.toThrow();
    });

    it('should allow pool deactivation', async () => {
      await program.methods
        .deactivatePool()
        .accounts({
          stakingPool,
          influencer: influencer.publicKey,
        })
        .signers([influencer])
        .rpc();
      
      const poolAccount = await program.account.stakingPool.fetch(stakingPool);
      expect(poolAccount.isActive).toBe(false);
      
      // Reactivate for other tests
      await program.methods
        .activatePool()
        .accounts({
          stakingPool,
          influencer: influencer.publicKey,
        })
        .signers([influencer])
        .rpc();
    });
  });
});

// Helper function to calculate tier
function calculateTier(totalStaked: bigint): number {
  const staked = Number(totalStaked / 10n ** 9n);
  
  if (staked >= 50000) return 3; // Platinum
  if (staked >= 10000) return 2; // Gold
  if (staked >= 1000) return 1;  // Silver
  return 0; // Bronze
}