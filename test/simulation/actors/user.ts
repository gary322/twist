/**
 * User Actor - Represents a regular platform user
 * Can browse, earn tokens, stake on influencers, and interact with publishers
 */

import { VAUData, StakingPosition, UserProfile } from '../types';
import { EdgeWorkerClient } from '../clients/edge-worker-client';
import { BlockchainClient } from '../clients/blockchain-client';

export class User {
  public id: string;
  public profile: UserProfile;
  public balance: number = 0;
  public stakingPositions: Map<string, StakingPosition> = new Map();
  public totalEarned: number = 0;
  public browsingHistory: Array<{ site: string; timestamp: number; earned: number }> = [];
  public lastActive: number = Date.now();

  private edgeClient: EdgeWorkerClient;
  private blockchainClient: BlockchainClient;

  constructor(profile: UserProfile) {
    this.id = profile.id;
    this.profile = profile;
    this.edgeClient = new EdgeWorkerClient();
    this.blockchainClient = new BlockchainClient();
  }

  async initialize() {
    // Install browser extension
    this.profile.hasExtension = true;
    
    // Create wallet
    this.profile.walletAddress = await this.blockchainClient.createWallet();
    
    // Initial balance (airdrop for testing)
    this.balance = 100; // Start with 100 TWIST
  }

  async browseAndEarn(): Promise<number> {
    this.lastActive = Date.now(); // Update last active time
    
    // Simulate browsing random websites
    const sites = [
      'news.com', 'blog.tech', 'social.media', 'shop.online',
      'video.stream', 'game.play', 'learn.edu', 'finance.app'
    ];

    const site = sites[Math.floor(Math.random() * sites.length)];
    const timeSpent = Math.random() * 300 + 60; // 1-6 minutes

    // Submit VAU
    const vauData: VAUData = {
      userId: this.id,
      siteId: site,
      timeSpent,
      timestamp: Date.now(),
      metadata: {
        referrer: 'google.com',
        device: 'desktop',
        browser: 'chrome'
      }
    };

    const result = await this.edgeClient.submitVAU(vauData);
    
    if (result.success) {
      this.balance += result.earned;
      this.totalEarned += result.earned;
      this.browsingHistory.push({
        site,
        timestamp: Date.now(),
        earned: result.earned
      });
    }

    return result.earned;
  }

  async visitPublisherSite(publisher: any): Promise<{ userEarned: number; publisherCommission: number }> {
    // Browse publisher site
    const timeSpent = Math.random() * 180 + 30; // 30s - 3.5min
    
    const vauData: VAUData = {
      userId: this.id,
      siteId: publisher.domain,
      timeSpent,
      timestamp: Date.now(),
      metadata: {
        publisherId: publisher.id,
        widgetVersion: '2.0'
      }
    };

    const result = await this.edgeClient.submitVAU(vauData);
    const publisherCommission = result.earned * 0.2; // 20% to publisher

    this.balance += result.earned;
    this.totalEarned += result.earned;

    return {
      userEarned: result.earned,
      publisherCommission
    };
  }

  async stakeOnInfluencer(influencer: any, amount: number): Promise<boolean> {
    if (amount > this.balance) {
      return false; // Insufficient balance
    }

    try {
      // Execute staking transaction
      const tx = await this.blockchainClient.stake({
        userId: this.id,
        influencerId: influencer.id,
        amount,
        poolAddress: influencer.stakingPool.address
      });

      if (tx.success) {
        this.balance -= amount;
        
        const position: StakingPosition = {
          influencerId: influencer.id,
          amount,
          stakedAt: Date.now(),
          apy: influencer.stakingPool.apy,
          rewards: 0
        };

        this.stakingPositions.set(influencer.id, position);
        return true;
      }
    } catch (error) {
      console.error('Staking failed:', error);
    }

    return false;
  }

  async claimRewards(influencerId: string): Promise<number> {
    const position = this.stakingPositions.get(influencerId);
    if (!position || position.rewards === 0) {
      return 0;
    }

    try {
      const tx = await this.blockchainClient.claimRewards({
        userId: this.id,
        influencerId,
        amount: position.rewards
      });

      if (tx.success) {
        this.balance += position.rewards;
        const claimed = position.rewards;
        position.rewards = 0;
        return claimed;
      }
    } catch (error) {
      console.error('Claim failed:', error);
    }

    return 0;
  }

  async unstake(influencerId: string): Promise<boolean> {
    const position = this.stakingPositions.get(influencerId);
    if (!position) {
      return false;
    }

    try {
      const tx = await this.blockchainClient.unstake({
        userId: this.id,
        influencerId,
        amount: position.amount
      });

      if (tx.success) {
        this.balance += position.amount + position.rewards;
        this.stakingPositions.delete(influencerId);
        return true;
      }
    } catch (error) {
      console.error('Unstake failed:', error);
    }

    return false;
  }

  async burnTokens(amount: number, reason: string): Promise<boolean> {
    if (amount > this.balance) {
      return false;
    }

    try {
      const tx = await this.blockchainClient.burn({
        userId: this.id,
        amount,
        reason
      });

      if (tx.success) {
        this.balance -= amount;
        return true;
      }
    } catch (error) {
      console.error('Burn failed:', error);
    }

    return false;
  }

  getTotalValue(): number {
    const stakedValue = Array.from(this.stakingPositions.values())
      .reduce((sum, pos) => sum + pos.amount + pos.rewards, 0);
    
    return this.balance + stakedValue;
  }

  getActivity(): any {
    return {
      userId: this.id,
      balance: this.balance,
      totalEarned: this.totalEarned,
      totalStaked: Array.from(this.stakingPositions.values())
        .reduce((sum, pos) => sum + pos.amount, 0),
      activeStakes: this.stakingPositions.size,
      lastActive: this.browsingHistory[this.browsingHistory.length - 1]?.timestamp || 0
    };
  }
}