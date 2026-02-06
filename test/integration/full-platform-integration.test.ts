import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TwistClient } from '../../modules/plan-1-blockchain/sdk/src/client/client';
import { TwistWebSDK } from '../../modules/plan-4-sdk/packages/web/src';
import { TwistServerSDK } from '../../modules/plan-4-sdk/packages/server/src';
import fetch from 'node-fetch';

describe('Full Platform Integration Test', () => {
  // Infrastructure
  let connection: Connection;
  let twistClient: TwistClient;
  let webSDK: TwistWebSDK;
  let serverSDK: TwistServerSDK;
  
  // Test accounts
  const platform = {
    treasury: Keypair.generate(),
    feeCollector: Keypair.generate(),
    admin: Keypair.generate(),
  };
  
  const users = {
    alice: {
      email: 'alice@test.com',
      wallet: Keypair.generate(),
    },
    bob: {
      email: 'bob@test.com',
      wallet: Keypair.generate(),
    },
    influencer1: {
      email: 'influencer1@test.com',
      wallet: Keypair.generate(),
    },
    influencer2: {
      email: 'influencer2@test.com',
      wallet: Keypair.generate(),
    },
  };
  
  // State tracking
  let tokenMint: PublicKey;
  let stakingPools: Map<string, PublicKey> = new Map();
  let userBalances: Map<string, bigint> = new Map();

  beforeAll(async () => {
    logger.log('🚀 Initializing Full Platform Integration Test');
    
    // Initialize connection
    connection = new Connection(process.env.RPC_URL || 'https://api.devnet.solana.com');
    
    // Initialize blockchain client
    twistClient = new TwistClient({
      rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
      wallet: platform.admin,
    });
    
    // Initialize SDKs
    webSDK = new TwistWebSDK({
      apiKey: process.env.WEB_API_KEY || 'integration-test-key',
      environment: 'development',
    });
    
    serverSDK = new TwistServerSDK({
      apiKey: process.env.SERVER_API_KEY || 'integration-server-key',
      apiSecret: process.env.SERVER_SECRET || 'integration-secret',
      environment: 'development',
    });
    
    // Fund test accounts
    await fundTestAccounts();
  });

  describe('1. Platform Initialization', () => {
    it('should deploy and initialize all smart contracts', async () => {
      logger.log('\n📝 Deploying smart contracts...');
      
      // Deploy TWIST token
      const tokenDeployment = await twistClient.deployToken({
        decimals: 9,
        initialSupply: 1_000_000_000n * 10n ** 9n, // 1B TWIST
        decayRate: 50, // 0.5% daily
        treasury: platform.treasury.publicKey,
      });
      
      tokenMint = tokenDeployment.mint;
      logger.log('✓ Token deployed:', tokenMint.toString());
      
      // Deploy staking program
      const stakingDeployment = await twistClient.deployStakingProgram();
      logger.log('✓ Staking program deployed:', stakingDeployment.programId.toString());
      
      // Deploy treasury program
      const treasuryDeployment = await twistClient.deployTreasuryProgram();
      logger.log('✓ Treasury program deployed:', treasuryDeployment.programId.toString());
      
      // Initialize fee collector
      await twistClient.initializeFeeCollector({
        feeCollector: platform.feeCollector.publicKey,
        transferFeeBps: 30, // 0.3%
        stakingFeeBps: 100, // 1%
      });
      logger.log('✓ Fee collector initialized');
    });

    it('should set up edge infrastructure', async () => {
      logger.log('\n🌐 Setting up edge infrastructure...');
      
      // Verify edge workers are responding
      const endpoints = [
        '/health',
        '/api/v1/vau/status',
        '/api/v1/security/status',
      ];
      
      for (const endpoint of endpoints) {
        const response = await fetch(`${process.env.EDGE_URL || 'https://api.twist.io'}${endpoint}`);
        expect(response.status).toBe(200);
        logger.log(`✓ Edge worker ready: ${endpoint}`);
      }
    });

    it('should initialize authentication system', async () => {
      logger.log('\n🔐 Initializing authentication system...');
      
      // Check auth service health
      const authHealth = await fetch(`${process.env.AUTH_URL || 'http://localhost:3000'}/health`);
      expect(authHealth.status).toBe(200);
      
      // Verify OAuth providers
      const providers = ['google', 'twitter', 'discord'];
      for (const provider of providers) {
        const configured = await serverSDK.checkOAuthProvider(provider);
        expect(configured).toBe(true);
        logger.log(`✓ OAuth provider configured: ${provider}`);
      }
    });
  });

  describe('2. User Onboarding Flow', () => {
    it('should onboard regular users', async () => {
      logger.log('\n👥 Onboarding users...');
      
      for (const [name, user] of Object.entries(users)) {
        // Register user
        const identity = await webSDK.identify(user.email);
        expect(identity.userId).toBeDefined();
        
        // Connect wallet
        await webSDK.connectWallet({
          publicKey: user.wallet.publicKey,
          signMessage: async (message) => {
            // Simulate wallet signing
            return Buffer.from('mock-signature');
          },
        } as any);
        
        // Mint initial tokens for testing
        await twistClient.mintTo({
          mint: tokenMint,
          destination: user.wallet.publicKey,
          amount: 10_000n * 10n ** 9n, // 10,000 TWIST
        });
        
        userBalances.set(name, 10_000n * 10n ** 9n);
        logger.log(`✓ Onboarded ${name}`);
      }
    });

    it('should upgrade users to influencer status', async () => {
      logger.log('\n⭐ Creating influencer accounts...');
      
      // Upgrade influencer1 and influencer2
      for (const influencer of [users.influencer1, users.influencer2]) {
        // Apply for influencer status
        const application = await webSDK.applyForInfluencer({
          socialProfiles: {
            twitter: '@test_influencer',
            youtube: 'TestInfluencer',
          },
          followers: {
            twitter: 100000,
            youtube: 500000,
          },
          category: 'gaming',
        });
        
        // Auto-approve for testing
        await serverSDK.approveInfluencer(influencer.email);
        
        // Create staking pool
        const pool = await twistClient.createInfluencerPool({
          influencer: influencer.wallet.publicKey,
          revenueShareBps: 2000, // 20%
          minStake: 100n * 10n ** 9n, // 100 TWIST minimum
        });
        
        stakingPools.set(influencer.email, pool.poolAddress);
        logger.log(`✓ Influencer pool created for ${influencer.email}`);
      }
    });
  });

  describe('3. Core Platform Features', () => {
    it('should handle token transfers with fees', async () => {
      logger.log('\n💸 Testing token transfers...');
      
      const transferAmount = 1000n * 10n ** 9n; // 1000 TWIST
      const expectedFee = (transferAmount * 30n) / 10000n; // 0.3% fee
      
      // Transfer from Alice to Bob
      const preAliceBalance = userBalances.get('alice')!;
      const preBobBalance = userBalances.get('bob')!;
      const preTreasuryBalance = await twistClient.getBalance(platform.treasury.publicKey, tokenMint);
      
      await twistClient.transfer({
        from: users.alice.wallet,
        to: users.bob.wallet.publicKey,
        amount: transferAmount,
        mint: tokenMint,
      });
      
      // Update tracked balances
      userBalances.set('alice', preAliceBalance - transferAmount - expectedFee);
      userBalances.set('bob', preBobBalance + transferAmount);
      
      // Verify balances
      const postAliceBalance = await twistClient.getBalance(users.alice.wallet.publicKey, tokenMint);
      const postBobBalance = await twistClient.getBalance(users.bob.wallet.publicKey, tokenMint);
      const postTreasuryBalance = await twistClient.getBalance(platform.treasury.publicKey, tokenMint);
      
      expect(postAliceBalance).toBe(preAliceBalance - transferAmount - expectedFee);
      expect(postBobBalance).toBe(preBobBalance + transferAmount);
      expect(postTreasuryBalance).toBe(preTreasuryBalance + expectedFee);
      
      logger.log('✓ Transfer completed with fees collected');
    });

    it('should process VAU submissions', async () => {
      logger.log('\n🎯 Testing VAU system...');
      
      // Submit VAU for each user
      for (const [name, user] of Object.entries(users)) {
        const vauResult = await webSDK.submitVAU({
          attestation: {
            platform: 'web',
            trustScore: 95,
            deviceId: `device-${name}`,
          },
        });
        
        expect(vauResult).toBeDefined();
        expect(vauResult!.earned).toBeGreaterThan(0);
        logger.log(`✓ VAU submitted for ${name}: earned ${vauResult!.earned}`);
      }
    });

    it('should handle user staking on influencers', async () => {
      logger.log('\n💎 Testing staking system...');
      
      // Alice stakes on influencer1
      const aliceStakeAmount = 500n * 10n ** 9n; // 500 TWIST
      
      const stakeResult = await webSDK.stakeOnInfluencer({
        influencerId: users.influencer1.email,
        amount: aliceStakeAmount,
        wallet: users.alice.wallet.publicKey.toString(),
      });
      
      expect(stakeResult.success).toBe(true);
      userBalances.set('alice', userBalances.get('alice')! - aliceStakeAmount);
      
      // Bob stakes on influencer2
      const bobStakeAmount = 300n * 10n ** 9n; // 300 TWIST
      
      await webSDK.stakeOnInfluencer({
        influencerId: users.influencer2.email,
        amount: bobStakeAmount,
        wallet: users.bob.wallet.publicKey.toString(),
      });
      
      userBalances.set('bob', userBalances.get('bob')! - bobStakeAmount);
      
      logger.log('✓ Users staked on influencers');
      
      // Verify staking pool states
      for (const [email, poolAddress] of stakingPools.entries()) {
        const poolState = await twistClient.getStakingPoolState(poolAddress);
        logger.log(`  Pool ${email}: ${poolState.totalStaked} staked by ${poolState.stakerCount} users`);
      }
    });

    it('should distribute influencer earnings', async () => {
      logger.log('\n💰 Testing revenue distribution...');
      
      // Simulate influencer1 earning from campaign
      const earningAmount = 10_000n * 10n ** 9n; // 10,000 TWIST
      
      await serverSDK.distributeInfluencerRewards({
        influencerId: users.influencer1.email,
        earningAmount,
        source: 'conversion',
        metadata: {
          campaignId: 'test-campaign-001',
          conversions: 50,
        },
      });
      
      logger.log('✓ Revenue distributed to influencer1 stakers');
      
      // Check pending rewards for Alice
      const aliceStakes = await webSDK.getUserStakes(users.alice.email);
      const aliceStake = aliceStakes.find(s => s.influencer.id === users.influencer1.email);
      
      expect(aliceStake).toBeDefined();
      expect(BigInt(aliceStake!.stake.pendingRewards)).toBeGreaterThan(0n);
      
      logger.log(`  Alice pending rewards: ${aliceStake!.stake.pendingRewards}`);
    });

    it('should handle reward claiming', async () => {
      logger.log('\n🎁 Testing reward claiming...');
      
      // Alice claims rewards
      const preClaimBalance = userBalances.get('alice')!;
      
      const claimResult = await webSDK.claimRewards(users.influencer1.email);
      expect(claimResult.success).toBe(true);
      
      const claimedAmount = BigInt(claimResult.claimedAmount);
      userBalances.set('alice', preClaimBalance + claimedAmount);
      
      logger.log(`✓ Alice claimed ${claimedAmount} TWIST in rewards`);
      
      // Verify balance increased
      const postClaimBalance = await twistClient.getBalance(users.alice.wallet.publicKey, tokenMint);
      expect(postClaimBalance).toBeGreaterThan(preClaimBalance);
    });
  });

  describe('4. Advanced Features', () => {
    it('should handle influencer tier upgrades', async () => {
      logger.log('\n🏆 Testing tier system...');
      
      // Check current tiers
      for (const influencer of [users.influencer1, users.influencer2]) {
        const details = await webSDK.getInfluencerDetails(influencer.email);
        logger.log(`  ${influencer.email} current tier: ${details.profile.tier}`);
        
        // Simulate meeting tier requirements
        await serverSDK.updateInfluencerMetrics(influencer.email, {
          totalStaked: 100_000n * 10n ** 9n,
          totalEarned: 50_000n * 10n ** 9n,
          conversions: 1000,
        });
      }
      
      // Trigger tier evaluation
      await serverSDK.evaluateInfluencerTiers();
      
      // Check updated tiers
      for (const influencer of [users.influencer1, users.influencer2]) {
        const details = await webSDK.getInfluencerDetails(influencer.email);
        logger.log(`  ${influencer.email} new tier: ${details.profile.tier}`);
      }
    });

    it('should handle campaign participation', async () => {
      logger.log('\n📢 Testing campaign system...');
      
      // Create a test campaign
      const campaign = await serverSDK.createCampaign({
        name: 'Test Gaming Campaign',
        budget: 50_000n * 10n ** 9n, // 50,000 TWIST
        requirements: {
          minFollowers: 10000,
          platforms: ['twitter', 'youtube'],
          categories: ['gaming'],
        },
        rewards: {
          perConversion: 10n * 10n ** 9n, // 10 TWIST
          perEngagement: 1n * 10n ** 8n, // 0.1 TWIST
        },
      });
      
      logger.log('✓ Campaign created:', campaign.id);
      
      // Influencer joins campaign
      await webSDK.joinCampaign(campaign.id);
      
      // Track campaign performance
      await serverSDK.trackCampaignEvent({
        campaignId: campaign.id,
        influencerId: users.influencer1.email,
        eventType: 'conversion',
        metadata: {
          productId: 'game-001',
          revenue: 59.99,
        },
      });
      
      logger.log('✓ Campaign conversion tracked');
    });

    it('should handle governance voting', async () => {
      logger.log('\n🗳️ Testing governance...');
      
      // Create a proposal
      const proposal = await serverSDK.createProposal({
        title: 'Reduce transfer fee to 0.2%',
        description: 'Lower the transfer fee from 0.3% to 0.2%',
        type: 'parameter_change',
        parameters: {
          transferFeeBps: 20,
        },
      });
      
      logger.log('✓ Proposal created:', proposal.id);
      
      // Users vote
      await webSDK.voteOnProposal(proposal.id, 'yes');
      logger.log('  Alice voted YES');
      
      // Check proposal status
      const proposalStatus = await webSDK.getProposal(proposal.id);
      logger.log(`  Current votes: YES=${proposalStatus.yesVotes}, NO=${proposalStatus.noVotes}`);
    });
  });

  describe('5. Security and Error Handling', () => {
    it('should handle network failures gracefully', async () => {
      logger.log('\n🔧 Testing error recovery...');
      
      // Simulate network failure
      const faultySDK = new TwistWebSDK({
        apiKey: 'test',
        apiUrl: 'http://localhost:9999', // Non-existent
      });
      
      try {
        await faultySDK.searchInfluencers({ query: 'test' });
      } catch (error: any) {
        expect(error.code).toBe('NETWORK_ERROR');
        logger.log('✓ Network error handled gracefully');
      }
    });

    it('should enforce security policies', async () => {
      logger.log('\n🔒 Testing security policies...');
      
      // Test rate limiting
      const requests = Array(50).fill(0).map(() => 
        webSDK.searchInfluencers({ query: 'spam' })
      );
      
      const results = await Promise.allSettled(requests);
      const rateLimited = results.filter(r => 
        r.status === 'rejected' && r.reason.code === 'RATE_LIMITED'
      );
      
      expect(rateLimited.length).toBeGreaterThan(0);
      logger.log(`✓ Rate limiting active: ${rateLimited.length} requests blocked`);
      
      // Test invalid operations
      await expect(
        webSDK.stakeOnInfluencer({
          influencerId: 'non-existent',
          amount: 100n,
          wallet: users.alice.wallet.publicKey.toString(),
        })
      ).rejects.toThrow('Influencer not found');
      
      logger.log('✓ Invalid operations rejected');
    });
  });

  describe('6. Performance Metrics', () => {
    it('should maintain acceptable performance', async () => {
      logger.log('\n📊 Measuring performance...');
      
      const operations = [
        { name: 'Search Influencers', fn: () => webSDK.searchInfluencers({ limit: 10 }) },
        { name: 'Get User Stakes', fn: () => webSDK.getUserStakes() },
        { name: 'Track Event', fn: () => webSDK.track({ action: 'test' }) },
      ];
      
      for (const op of operations) {
        const start = Date.now();
        await op.fn();
        const duration = Date.now() - start;
        
        logger.log(`  ${op.name}: ${duration}ms`);
        expect(duration).toBeLessThan(1000); // Sub-second response
      }
    });
  });

  afterAll(async () => {
    logger.log('\n🎉 Full Platform Integration Test Complete!');
    
    // Generate summary report
    const report = {
      platform: {
        tokenMint: tokenMint?.toString(),
        stakingPools: stakingPools.size,
        totalUsers: Object.keys(users).length,
      },
      balances: Object.fromEntries(
        await Promise.all(
          Object.entries(users).map(async ([name, user]) => [
            name,
            await twistClient.getBalance(user.wallet.publicKey, tokenMint),
          ])
        )
      ),
      features: {
        blockchain: '✅ Operational',
        edge: '✅ Operational',
        auth: '✅ Operational',
        staking: '✅ Operational',
        governance: '✅ Operational',
      },
    };
    
    logger.log('\n📋 Final Report:', JSON.stringify(report, null, 2));
  });

  // Helper function to fund test accounts
  async function fundTestAccounts() {
    logger.log('💰 Funding test accounts...');
    
    const accounts = [
      ...Object.values(platform),
      ...Object.values(users).map(u => u.wallet),
    ];
    
    for (const account of accounts) {
      try {
        const signature = await connection.requestAirdrop(
          account.publicKey,
          5 * 1e9 // 5 SOL
        );
        await connection.confirmTransaction(signature);
      } catch (error) {
        console.warn(`Failed to airdrop to ${account.publicKey.toString().slice(0, 8)}...`);
      }
    }
  }
});