/**
 * Token Economics Scenario
 * Simulates token decay, burning, treasury operations, and overall economics
 */

import { Platform } from '../actors/platform';
import { User } from '../actors/user';
import { Influencer } from '../actors/influencer';
import { Publisher } from '../actors/publisher';
import { SimulationMetrics } from '../utils/metrics';

export class TokenEconomicsScenario {
  constructor(
    private platform: Platform,
    private users: User[],
    private influencers: Influencer[],
    private publishers: Publisher[],
    private metrics: SimulationMetrics
  ) {}

  async run(): Promise<any> {
    const results = {
      initialSupply: 0,
      finalSupply: 0,
      totalBurned: 0,
      totalDecayed: 0,
      transferFees: 0,
      treasuryBalance: {
        floor: 0,
        operations: 0
      },
      burnEvents: [] as any[],
      supplyMetrics: {
        circulating: 0,
        staked: 0,
        locked: 0
      }
    };

    console.log('\n  Running token economics simulation...');

    // Get initial metrics
    const initialMetrics = await this.platform.getTokenMetrics();
    results.initialSupply = initialMetrics.totalSupply;

    // Apply daily decay
    console.log('  Applying token decay...');
    const decayResults = await this.applyTokenDecay();
    results.totalDecayed = decayResults.totalDecayed;
    results.burnEvents.push(...decayResults.burnEvents);

    // Process transfer fees
    console.log('  Processing transfer fees...');
    const transferResults = await this.processTransferFees();
    results.transferFees = transferResults.totalFees;

    // Execute programmatic burns
    console.log('  Executing programmatic burns...');
    const burnResults = await this.executeProgrammaticBurns();
    results.totalBurned += burnResults.totalBurned;
    results.burnEvents.push(...burnResults.burnEvents);

    // Update treasury
    console.log('  Updating treasury operations...');
    await this.updateTreasuryOperations();

    // Calculate final metrics
    const finalMetrics = await this.platform.getTokenMetrics();
    results.finalSupply = finalMetrics.totalSupply;
    results.supplyMetrics = {
      circulating: finalMetrics.circulatingSupply,
      staked: finalMetrics.stakedSupply,
      locked: this.calculateLockedSupply()
    };

    results.treasuryBalance = {
      floor: this.platform.treasury.floor,
      operations: this.platform.treasury.operations
    };

    // Verify token economics invariants
    await this.verifyInvariants(results);

    return results;
  }

  private async applyTokenDecay(): Promise<{ totalDecayed: number; burnEvents: any[] }> {
    let totalDecayed = 0;
    const burnEvents = [];
    
    // Apply decay to all wallets
    const allWallets = [
      ...this.users.map(u => ({ type: 'user', id: u.id, balance: u.balance })),
      ...this.influencers.map(i => ({ type: 'influencer', id: i.id, balance: i.balance })),
      ...this.publishers.map(p => ({ type: 'publisher', id: p.id, balance: p.balance }))
    ];

    for (const wallet of allWallets) {
      if (wallet.balance > 0) {
        // Calculate decay (0.1% daily)
        const decayAmount = Math.floor(wallet.balance * 0.001);
        
        if (decayAmount > 0) {
          totalDecayed += decayAmount;
          
          // Update balance based on wallet type
          switch (wallet.type) {
            case 'user':
              const user = this.users.find(u => u.id === wallet.id);
              if (user) user.balance -= decayAmount;
              break;
            case 'influencer':
              const influencer = this.influencers.find(i => i.id === wallet.id);
              if (influencer) influencer.balance -= decayAmount;
              break;
            case 'publisher':
              const publisher = this.publishers.find(p => p.id === wallet.id);
              if (publisher) publisher.balance -= decayAmount;
              break;
          }

          // Burn decayed tokens
          const burnResult = await this.platform.burnTokens(decayAmount, 'decay');
          burnEvents.push({
            type: 'decay',
            walletType: wallet.type,
            walletId: wallet.id,
            amount: decayAmount,
            transactionId: burnResult.transactionId
          });
        }
      }
    }

    // Apply decay to staked tokens (50% rate)
    for (const user of this.users) {
      for (const [influencerId, position] of user.stakingPositions) {
        const decayAmount = Math.floor(position.amount * 0.0005);
        if (decayAmount > 0) {
          position.amount -= decayAmount;
          totalDecayed += decayAmount;
          
          const burnResult = await this.platform.burnTokens(decayAmount, 'staking_decay');
          burnEvents.push({
            type: 'staking_decay',
            userId: user.id,
            influencerId,
            amount: decayAmount,
            transactionId: burnResult.transactionId
          });
        }
      }
    }

    return { totalDecayed, burnEvents };
  }

  private async processTransferFees(): Promise<{ totalFees: number }> {
    let totalFees = 0;
    
    // Simulate transfers between users
    const numTransfers = Math.floor(this.users.length * 0.1); // 10% of users transfer
    
    for (let i = 0; i < numTransfers; i++) {
      const sender = this.users[Math.floor(Math.random() * this.users.length)];
      const receiver = this.users[Math.floor(Math.random() * this.users.length)];
      
      if (sender.id !== receiver.id && sender.balance > 100) {
        const amount = Math.floor(sender.balance * 0.1); // Transfer 10% of balance
        const fee = Math.floor(amount * this.platform.config.transferFee);
        
        // Execute transfer
        sender.balance -= (amount + fee);
        receiver.balance += amount;
        totalFees += fee;
        
        // 50% of fees burned, 50% to treasury
        const burnAmount = Math.floor(fee * 0.5);
        const treasuryAmount = fee - burnAmount;
        
        await this.platform.burnTokens(burnAmount, 'transfer_fee');
        await this.platform.updateTreasury('operations', treasuryAmount);
        
        this.metrics.recordTransaction({
          type: 'transfer',
          from: sender.id,
          to: receiver.id,
          amount,
          fee,
          category: 'p2p_transfer'
        });
      }
    }
    
    return { totalFees };
  }

  private async executeProgrammaticBurns(): Promise<{ totalBurned: number; burnEvents: any[] }> {
    let totalBurned = 0;
    const burnEvents = [];
    
    // 1. Burn from operations treasury if above threshold
    if (this.platform.treasury.operations > 5000000) {
      const burnAmount = Math.floor(this.platform.treasury.operations * 0.2);
      const result = await this.platform.burnTokens(burnAmount, 'treasury_excess');
      
      this.platform.treasury.operations -= burnAmount;
      totalBurned += burnAmount;
      
      burnEvents.push({
        type: 'treasury_burn',
        source: 'operations',
        amount: burnAmount,
        reason: 'excess_operations',
        transactionId: result.transactionId
      });
    }
    
    // 2. Burn inactive user tokens (simulated)
    const inactiveThreshold = 30 * 24 * 60 * 60 * 1000; // 30 days
    const currentTime = Date.now();
    
    for (const user of this.users) {
      const inactiveTime = currentTime - user.lastActive;
      
      if (inactiveTime > inactiveThreshold && user.balance > 0) {
        // Burn 10% of inactive user balance
        const burnAmount = Math.floor(user.balance * 0.1);
        const result = await this.platform.burnTokens(burnAmount, 'inactive_user');
        
        user.balance -= burnAmount;
        totalBurned += burnAmount;
        
        burnEvents.push({
          type: 'inactive_burn',
          userId: user.id,
          amount: burnAmount,
          daysInactive: Math.floor(inactiveTime / (24 * 60 * 60 * 1000)),
          transactionId: result.transactionId
        });
      }
    }
    
    // 3. Burn from failed campaigns (advertiser refunds)
    const failedCampaignBurn = 50000 * Math.random(); // Simulated
    if (failedCampaignBurn > 0) {
      const result = await this.platform.burnTokens(failedCampaignBurn, 'failed_campaign');
      totalBurned += failedCampaignBurn;
      
      burnEvents.push({
        type: 'campaign_burn',
        amount: failedCampaignBurn,
        reason: 'failed_campaign_refund',
        transactionId: result.transactionId
      });
    }
    
    return { totalBurned, burnEvents };
  }

  private async updateTreasuryOperations(): Promise<void> {
    // Rebalance treasury if needed
    const totalTreasury = this.platform.treasury.floor + this.platform.treasury.operations;
    const targetFloorRatio = this.platform.config.treasurySplit.floor;
    const currentFloorRatio = this.platform.treasury.floor / totalTreasury;
    
    if (currentFloorRatio < targetFloorRatio * 0.9) {
      // Rebalance: move from operations to floor
      const rebalanceAmount = Math.floor(
        (targetFloorRatio * totalTreasury - this.platform.treasury.floor)
      );
      
      this.platform.treasury.operations -= rebalanceAmount;
      this.platform.treasury.floor += rebalanceAmount;
      
      this.metrics.recordTransaction({
        type: 'treasury_rebalance',
        from: 'operations',
        to: 'floor',
        amount: rebalanceAmount,
        category: 'treasury'
      });
    }
  }

  private calculateLockedSupply(): number {
    let locked = 0;
    
    // Treasury floor is locked
    locked += this.platform.treasury.floor;
    
    // Add vesting tokens (simulated)
    locked += 10000000; // 10M in vesting
    
    // Add liquidity pool locks (simulated)
    locked += 5000000; // 5M in LP
    
    return locked;
  }

  private async verifyInvariants(results: any): Promise<void> {
    // Verify total supply decreased
    if (results.finalSupply >= results.initialSupply) {
      console.warn('⚠️  Warning: Token supply did not decrease!');
    }
    
    // Verify burn amount matches supply change
    const expectedSupply = results.initialSupply - results.totalBurned - results.totalDecayed;
    const supplyDiff = Math.abs(results.finalSupply - expectedSupply);
    
    if (supplyDiff > 1) { // Allow for rounding
      console.warn(`⚠️  Warning: Supply mismatch. Expected: ${expectedSupply}, Actual: ${results.finalSupply}`);
    }
    
    // Verify treasury floor never decreases (except rebalance)
    if (this.platform.treasury.floor < 0) {
      console.error('❌ Error: Treasury floor is negative!');
    }
    
    // Log economics health
    const burnRate = ((results.totalBurned + results.totalDecayed) / results.initialSupply) * 100;
    console.log(`  Token burn rate: ${burnRate.toFixed(2)}% daily`);
    
    const stakingRatio = (results.supplyMetrics.staked / results.supplyMetrics.circulating) * 100;
    console.log(`  Staking ratio: ${stakingRatio.toFixed(1)}%`);
  }
}