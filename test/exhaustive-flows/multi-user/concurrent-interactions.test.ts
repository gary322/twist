import { expect } from "chai";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { 
  TwistTokenClient,
  OrcaLiquidityManager,
  MonitoringDashboard 
} from "../../../modules/plan-1-blockchain";

describe("Multi-User Concurrent Interactions", () => {
  let connection: Connection;
  let twistClient: TwistTokenClient;
  let orcaManager: OrcaLiquidityManager;
  let users: Array<{
    keypair: Keypair;
    type: "trader" | "staker" | "lp" | "arbitrageur";
    balance: BN;
  }>;

  before(async () => {
    connection = new Connection("http://localhost:8899", "confirmed");
    twistClient = new TwistTokenClient(connection);
    orcaManager = new OrcaLiquidityManager(connection, wallet, WHIRLPOOL_ADDRESS);
    
    // Create diverse user population
    users = [
      // 20 active traders
      ...Array(20).fill(null).map(() => ({
        keypair: Keypair.generate(),
        type: "trader" as const,
        balance: new BN(Math.floor(Math.random() * 50000 + 10000) * 1e9)
      })),
      // 50 stakers
      ...Array(50).fill(null).map(() => ({
        keypair: Keypair.generate(),
        type: "staker" as const,
        balance: new BN(Math.floor(Math.random() * 100000 + 20000) * 1e9)
      })),
      // 10 liquidity providers
      ...Array(10).fill(null).map(() => ({
        keypair: Keypair.generate(),
        type: "lp" as const,
        balance: new BN(Math.floor(Math.random() * 500000 + 100000) * 1e9)
      })),
      // 5 arbitrageurs
      ...Array(5).fill(null).map(() => ({
        keypair: Keypair.generate(),
        type: "arbitrageur" as const,
        balance: new BN(Math.floor(Math.random() * 1000000 + 500000) * 1e9)
      }))
    ];
    
    logger.log(`Created ${users.length} test users`);
  });

  describe("Realistic Market Simulation", () => {
    it("should handle realistic daily trading patterns", async () => {
      logger.log("📈 Simulating 24-hour market activity...");
      
      const marketHours = 24;
      const metrics = {
        trades: 0,
        volume: new BN(0),
        stakes: 0,
        unstakes: 0,
        lpAdds: 0,
        lpRemoves: 0,
        rewards: 0,
        errors: 0
      };
      
      // Simulate each hour
      for (let hour = 0; hour < marketHours; hour++) {
        logger.log(`\nHour ${hour}:00 - ${hour + 1}:00`);
        
        // Determine activity level based on time
        const activityLevel = getActivityLevel(hour);
        const activeUsers = Math.floor(users.length * activityLevel);
        
        // Shuffle users and select active ones
        const shuffled = [...users].sort(() => Math.random() - 0.5);
        const activeThisHour = shuffled.slice(0, activeUsers);
        
        // Execute user actions concurrently
        const hourlyActions = activeThisHour.map(async (user) => {
          try {
            switch (user.type) {
              case "trader":
                return executeTraderAction(user, metrics);
              case "staker":
                return executeStakerAction(user, metrics);
              case "lp":
                return executeLPAction(user, metrics);
              case "arbitrageur":
                return executeArbitrageAction(user, metrics);
            }
          } catch (error) {
            metrics.errors++;
            return null;
          }
        });
        
        await Promise.all(hourlyActions);
        
        // Hourly summary
        const hourlyVolume = await twistClient.getHourlyVolume(hour);
        const price = await orcaManager.getPrice();
        
        logger.log(`
          Active users: ${activeUsers}
          Trades: ${metrics.trades}
          Volume: $${metrics.volume.div(new BN(1e6)).toString()}
          Price: $${price.toFixed(4)}
          Errors: ${metrics.errors}
        `);
        
        // Simulate time passing
        await simulateTimePassage(3600);
      }
      
      // Daily summary
      logger.log("\n📊 24-Hour Summary:");
      logger.log(`Total trades: ${metrics.trades}`);
      logger.log(`Total volume: $${metrics.volume.div(new BN(1e6)).toString()}`);
      logger.log(`Stakes created: ${metrics.stakes}`);
      logger.log(`Rewards claimed: ${metrics.rewards}`);
      logger.log(`Error rate: ${(metrics.errors / (metrics.trades + metrics.stakes + metrics.rewards) * 100).toFixed(2)}%`);
      
      // Verify system handled load
      expect(metrics.errors / metrics.trades).to.be.lt(0.01); // Less than 1% error rate
    });

    it("should handle competing liquidity providers", async () => {
      logger.log("🏊 Testing competitive LP dynamics...");
      
      const lpUsers = users.filter(u => u.type === "lp");
      const competitionRounds = 10;
      const lpMetrics = new Map<string, {
        feesEarned: BN;
        impermanentLoss: number;
        rebalances: number;
        positions: any[];
      }>();
      
      // Initialize LP metrics
      lpUsers.forEach(lp => {
        lpMetrics.set(lp.keypair.publicKey.toString(), {
          feesEarned: new BN(0),
          impermanentLoss: 0,
          rebalances: 0,
          positions: []
        });
      });
      
      for (let round = 0; round < competitionRounds; round++) {
        logger.log(`\nCompetition round ${round + 1}`);
        
        const currentPrice = await orcaManager.getPrice();
        
        // Each LP makes decisions based on market conditions
        const lpActions = lpUsers.map(async (lp) => {
          const metrics = lpMetrics.get(lp.keypair.publicKey.toString())!;
          
          // Analyze existing positions
          for (const position of metrics.positions) {
            const positionData = await orcaManager.getPosition(position.nft);
            
            // Check if position needs rebalancing
            if (currentPrice < positionData.lowerPrice * 1.1 || 
                currentPrice > positionData.upperPrice * 0.9) {
              logger.log(`LP ${lp.keypair.publicKey.toString().slice(0, 8)} rebalancing...`);
              
              // Collect fees first
              const fees = await orcaManager.collectFees({
                positionMint: position.nft,
                wallet: lp.keypair
              });
              
              metrics.feesEarned = metrics.feesEarned.add(fees.twistAmount).add(fees.usdcAmount);
              
              // Close and reopen position
              await orcaManager.closePosition({
                positionMint: position.nft,
                wallet: lp.keypair
              });
              
              // Open new position with updated range
              const newRange = calculateOptimalRange(currentPrice, metrics.rebalances);
              
              const newPosition = await orcaManager.addConcentratedLiquidity({
                poolAddress: WHIRLPOOL_ADDRESS,
                lowerPrice: newRange.lower,
                upperPrice: newRange.upper,
                twistAmount: position.twistAmount,
                usdcAmount: position.usdcAmount,
                slippageTolerance: 0.01,
                wallet: lp.keypair
              });
              
              metrics.positions = metrics.positions.filter(p => p.nft !== position.nft);
              metrics.positions.push({
                nft: newPosition.positionMint,
                twistAmount: position.twistAmount,
                usdcAmount: position.usdcAmount,
                range: newRange
              });
              
              metrics.rebalances++;
            }
          }
          
          // New LPs or those with spare capital add positions
          if (metrics.positions.length === 0 || Math.random() < 0.3) {
            const investmentSize = lp.balance.div(new BN(10)); // Invest 10% of balance
            const range = calculateOptimalRange(currentPrice, 0);
            
            const newPosition = await orcaManager.addConcentratedLiquidity({
              poolAddress: WHIRLPOOL_ADDRESS,
              lowerPrice: range.lower,
              upperPrice: range.upper,
              twistAmount: investmentSize,
              usdcAmount: investmentSize.div(new BN(20)), // Assuming 20:1 ratio
              slippageTolerance: 0.01,
              wallet: lp.keypair
            });
            
            metrics.positions.push({
              nft: newPosition.positionMint,
              twistAmount: investmentSize,
              usdcAmount: investmentSize.div(new BN(20)),
              range
            });
          }
        });
        
        await Promise.all(lpActions);
        
        // Simulate trading volume for fee generation
        await simulateTradingVolume(Math.random() * 1000000 + 100000);
        
        // Calculate impermanent loss
        const newPrice = await orcaManager.getPrice();
        const priceChange = (newPrice - currentPrice) / currentPrice;
        
        lpUsers.forEach(lp => {
          const metrics = lpMetrics.get(lp.keypair.publicKey.toString())!;
          metrics.impermanentLoss += calculateImpermanentLoss(priceChange);
        });
        
        await simulateTimePassage(3600 * 4); // 4 hours between rounds
      }
      
      // Analyze LP performance
      logger.log("\n💰 LP Competition Results:");
      
      const results = Array.from(lpMetrics.entries())
        .map(([pubkey, metrics]) => ({
          lp: pubkey.slice(0, 8),
          feesEarned: metrics.feesEarned.div(new BN(1e6)).toString(),
          impermanentLoss: (metrics.impermanentLoss * 100).toFixed(2),
          rebalances: metrics.rebalances,
          netProfit: calculateNetProfit(metrics)
        }))
        .sort((a, b) => b.netProfit - a.netProfit);
      
      console.table(results);
      
      // Verify competitive dynamics
      const bestPerformer = results[0];
      const worstPerformer = results[results.length - 1];
      
      expect(bestPerformer.rebalances).to.be.gt(worstPerformer.rebalances);
      expect(parseFloat(bestPerformer.feesEarned)).to.be.gt(parseFloat(worstPerformer.feesEarned));
    });

    it("should handle flash mob scenarios", async () => {
      logger.log("👥 Simulating flash mob event...");
      
      // Simulate coordinated action (e.g., social media driven)
      const flashMobSize = 100;
      const flashMobUsers = Array(flashMobSize).fill(null).map(() => ({
        keypair: Keypair.generate(),
        action: Math.random() < 0.8 ? "buy" : "sell", // 80% buyers, 20% sellers
        amount: new BN(Math.floor(Math.random() * 1000 + 100) * 1e6) // $100-$1100
      }));
      
      logger.log(`Flash mob of ${flashMobSize} users arriving...`);
      
      const startPrice = await orcaManager.getPrice();
      const startTime = Date.now();
      
      // Execute all actions as quickly as possible
      const flashMobActions = flashMobUsers.map(async (user, index) => {
        // Add small random delay to simulate realistic arrival
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5000));
        
        try {
          if (user.action === "buy") {
            return await orcaManager.executeSwap({
              inputToken: "USDC",
              inputAmount: user.amount,
              minOutputAmount: new BN(0),
              wallet: user.keypair
            });
          } else {
            const twistAmount = user.amount.mul(new BN(20)); // Rough conversion
            return await orcaManager.executeSwap({
              inputToken: "TWIST",
              inputAmount: twistAmount,
              minOutputAmount: new BN(0),
              wallet: user.keypair
            });
          }
        } catch (error) {
          return { error: error.message };
        }
      });
      
      const results = await Promise.all(flashMobActions);
      const endTime = Date.now();
      const endPrice = await orcaManager.getPrice();
      
      // Analyze flash mob impact
      const successful = results.filter(r => !r.error).length;
      const failed = results.filter(r => r.error).length;
      const priceImpact = (endPrice - startPrice) / startPrice * 100;
      const duration = (endTime - startTime) / 1000;
      
      logger.log(`
        Flash mob completed in ${duration.toFixed(2)} seconds
        Successful trades: ${successful}/${flashMobSize}
        Failed trades: ${failed}
        Price impact: ${priceImpact > 0 ? '+' : ''}${priceImpact.toFixed(2)}%
        Start price: $${startPrice.toFixed(4)}
        End price: $${endPrice.toFixed(4)}
      `);
      
      // Check if circuit breaker triggered
      const cbStatus = await circuitBreaker.getStatus();
      if (Math.abs(priceImpact) > 10) {
        expect(cbStatus.isActive).to.be.true;
        logger.log("Circuit breaker activated due to extreme volatility");
      }
      
      // System should handle the load
      expect(successful / flashMobSize).to.be.gt(0.9); // 90%+ success rate
    });
  });

  describe("Complex Multi-User Scenarios", () => {
    it("should handle governance voting with strategic behavior", async () => {
      logger.log("🗳️ Testing complex governance dynamics...");
      
      // Create a contentious proposal
      const proposal = await twistClient.createProposal({
        title: "Reduce staking rewards by 50%",
        description: "Due to high inflation, reduce all staking APYs by half",
        actions: [{
          target: "staking",
          method: "updateRewardRates",
          params: { multiplier: 0.5 }
        }],
        wallet: users[0].keypair
      });
      
      // Users vote based on their position
      const votingSimulation = {
        stakers: { for: 0, against: 0, abstain: 0 },
        traders: { for: 0, against: 0, abstain: 0 },
        lps: { for: 0, against: 0, abstain: 0 },
        whales: { for: 0, against: 0, abstain: 0 }
      };
      
      // Simulate realistic voting behavior
      const votingPromises = users.map(async (user) => {
        const votingPower = await twistClient.getVotingPower(user.keypair.publicKey);
        
        if (votingPower.gt(new BN(0))) {
          let vote: boolean | null = null;
          
          // Stakers likely vote against (hurts their yields)
          if (user.type === "staker") {
            vote = Math.random() < 0.1; // 10% vote for, 90% against
            if (vote) votingSimulation.stakers.for++;
            else votingSimulation.stakers.against++;
          }
          // Traders might support (reduces sell pressure)
          else if (user.type === "trader") {
            vote = Math.random() < 0.7; // 70% vote for
            if (vote) votingSimulation.traders.for++;
            else votingSimulation.traders.against++;
          }
          // LPs are mixed (depends on their strategy)
          else if (user.type === "lp") {
            vote = Math.random() < 0.5; // 50/50
            if (vote) votingSimulation.lps.for++;
            else votingSimulation.lps.against++;
          }
          
          if (vote !== null) {
            return twistClient.vote({
              proposalId: proposal.id,
              support: vote,
              wallet: user.keypair
            });
          }
        }
      });
      
      await Promise.all(votingPromises);
      
      // Some users might try to buy more tokens to influence vote
      const voteManipulationAttempts = users
        .filter(u => u.balance.gt(new BN(1000000 * 1e9))) // Whales only
        .map(async (whale) => {
          // Try to buy and stake quickly
          const buyAmount = new BN(500000 * 1e6); // $500k
          
          try {
            await orcaManager.executeSwap({
              inputToken: "USDC",
              inputAmount: buyAmount,
              minOutputAmount: new BN(0),
              wallet: whale.keypair
            });
            
            await twistClient.stake({
              amount: buyAmount.mul(new BN(20)), // Rough conversion
              lockPeriod: 30 * 86400,
              wallet: whale.keypair
            });
            
            // Try to vote with new tokens
            await twistClient.vote({
              proposalId: proposal.id,
              support: false, // Whales protect their interests
              wallet: whale.keypair
            });
            
            votingSimulation.whales.against++;
          } catch (error) {
            // Should fail - snapshot voting prevents this
            expect(error.message).to.include("VotingPowerSnapshot");
          }
        });
      
      await Promise.all(voteManipulationAttempts);
      
      // Get final results
      const proposalResult = await twistClient.getProposal(proposal.id);
      
      logger.log("\n📊 Voting Results:");
      console.table(votingSimulation);
      logger.log(`
        Total For: ${proposalResult.forVotes}
        Total Against: ${proposalResult.againstVotes}
        Participation: ${proposalResult.participation}%
        Result: ${proposalResult.passed ? "PASSED" : "FAILED"}
      `);
      
      // Verify governance integrity
      expect(proposalResult.participation).to.be.gt(10); // At least 10% participation
      expect(proposalResult.executionTime).to.be.gt(Date.now() / 1000 + 48 * 3600); // 48h timelock
    });

    it("should handle cascade effects from whale movements", async () => {
      logger.log("🐋 Testing whale movement cascade effects...");
      
      const whale = users.find(u => u.balance.gt(new BN(1000000 * 1e9)));
      if (!whale) {
        logger.log("No whale found, creating one...");
        whale = {
          keypair: Keypair.generate(),
          type: "trader",
          balance: new BN(10000000 * 1e9) // 10M TWIST
        };
      }
      
      const startMetrics = await captureMarketMetrics();
      
      logger.log("Whale initiating large sell...");
      
      // Whale starts selling
      const whaleSellAmount = whale.balance.div(new BN(10)); // 10% of holdings
      
      const whaleSell = await orcaManager.executeSwap({
        inputToken: "TWIST",
        inputAmount: whaleSellAmount,
        minOutputAmount: new BN(0),
        wallet: whale.keypair
      });
      
      logger.log(`Whale sold ${whaleSellAmount.div(new BN(1e9))} TWIST`);
      
      // Monitor cascade effects
      const cascadeEffects = {
        panicSellers: 0,
        buyTheDippers: 0,
        liquidations: 0,
        newStakers: 0
      };
      
      // Other users react to price movement
      const reactions = users
        .filter(u => u.keypair !== whale.keypair)
        .map(async (user) => {
          const currentPrice = await orcaManager.getPrice();
          const priceDropPercent = (startMetrics.price - currentPrice) / startMetrics.price;
          
          // Different user types react differently
          if (user.type === "trader") {
            if (priceDropPercent > 0.05 && Math.random() < 0.4) {
              // 40% chance of panic selling on 5%+ drop
              cascadeEffects.panicSellers++;
              return orcaManager.executeSwap({
                inputToken: "TWIST",
                inputAmount: user.balance.div(new BN(4)), // Sell 25%
                minOutputAmount: new BN(0),
                wallet: user.keypair
              });
            } else if (priceDropPercent > 0.1 && Math.random() < 0.3) {
              // 30% chance of buying the dip on 10%+ drop
              cascadeEffects.buyTheDippers++;
              return orcaManager.executeSwap({
                inputToken: "USDC",
                inputAmount: new BN(1000 * 1e6),
                minOutputAmount: new BN(0),
                wallet: user.keypair
              });
            }
          } else if (user.type === "staker" && priceDropPercent > 0.15) {
            // Stakers might stake more on big drops
            if (Math.random() < 0.5) {
              cascadeEffects.newStakers++;
              return twistClient.stake({
                amount: user.balance.div(new BN(5)),
                lockPeriod: 90 * 86400, // 90 days for bonus
                wallet: user.keypair
              });
            }
          } else if (user.type === "lp") {
            // LPs might get liquidated or rebalance
            const positions = await getUserLPPositions(user.keypair.publicKey);
            for (const position of positions) {
              if (await isPositionUnderwater(position, currentPrice)) {
                cascadeEffects.liquidations++;
                // Position would be liquidated
              }
            }
          }
        });
      
      await Promise.all(reactions);
      
      // Check if buyback triggered
      const floorPrice = await twistClient.getFloorPrice();
      const currentPrice = await orcaManager.getPrice();
      
      let buybackExecuted = false;
      if (currentPrice < floorPrice * 0.97) {
        logger.log("Buyback triggered!");
        const buybackResult = await twistClient.executeBuyback({
          maxAmount: new BN(100000 * 1e6) // $100k
        });
        buybackExecuted = true;
      }
      
      const endMetrics = await captureMarketMetrics();
      
      logger.log("\n🌊 Cascade Effect Summary:");
      logger.log(`Initial whale sell: ${(whaleSellAmount.toNumber() / 1e9).toLocaleString()} TWIST`);
      logger.log(`Price impact: ${((1 - endMetrics.price / startMetrics.price) * 100).toFixed(2)}%`);
      logger.log(`Panic sellers: ${cascadeEffects.panicSellers}`);
      logger.log(`Buy the dippers: ${cascadeEffects.buyTheDippers}`);
      logger.log(`New stakers: ${cascadeEffects.newStakers}`);
      logger.log(`LP liquidations: ${cascadeEffects.liquidations}`);
      logger.log(`Buyback executed: ${buybackExecuted}`);
      logger.log(`Final price: $${endMetrics.price.toFixed(4)} (${endMetrics.price >= startMetrics.price * 0.8 ? '✅ Recovered' : '❌ Still down'})`);
      
      // System should prevent death spiral
      expect(endMetrics.price).to.be.gte(startMetrics.price * 0.7); // Max 30% drop
      expect(endMetrics.tvl).to.be.gte(startMetrics.tvl * 0.8); // Max 20% TVL loss
    });

    it("should handle competing arbitrage bots", async () => {
      logger.log("🤖 Testing arbitrage bot competition...");
      
      const arbitrageurs = users.filter(u => u.type === "arbitrageur");
      const arbitrageResults = new Map<string, {
        attempts: number;
        successful: number;
        profit: BN;
        gasSpent: BN;
      }>();
      
      // Initialize results
      arbitrageurs.forEach(arb => {
        arbitrageResults.set(arb.keypair.publicKey.toString(), {
          attempts: 0,
          successful: 0,
          profit: new BN(0),
          gasSpent: new BN(0)
        });
      });
      
      // Create price discrepancy
      logger.log("Creating arbitrage opportunity...");
      
      // Manipulate price on one DEX (simulated)
      await createPriceDiscrepancy({
        dex1: "orca",
        dex2: "raydium",
        discrepancy: 0.02 // 2% difference
      });
      
      // All arbitrageurs compete for the opportunity
      const startTime = Date.now();
      
      const arbPromises = arbitrageurs.map(async (arb) => {
        const results = arbitrageResults.get(arb.keypair.publicKey.toString())!;
        
        while (Date.now() - startTime < 5000) { // 5 second window
          results.attempts++;
          
          try {
            // Check for arbitrage opportunity
            const prices = await Promise.all([
              orcaManager.getPrice(),
              getRaydiumPrice(),
              getSerumPrice()
            ]);
            
            const maxPrice = Math.max(...prices);
            const minPrice = Math.min(...prices);
            const spread = (maxPrice - minPrice) / minPrice;
            
            if (spread > 0.001) { // 0.1% minimum profit
              // Calculate optimal trade size
              const tradeSize = calculateOptimalArbSize(spread, arb.balance);
              
              // Execute arbitrage
              const buyResult = await executeArbTrade({
                dex: prices.indexOf(minPrice) === 0 ? "orca" : "raydium",
                action: "buy",
                amount: tradeSize,
                wallet: arb.keypair
              });
              
              const sellResult = await executeArbTrade({
                dex: prices.indexOf(maxPrice) === 0 ? "orca" : "raydium",
                action: "sell",
                amount: buyResult.output,
                wallet: arb.keypair
              });
              
              const profit = sellResult.output.sub(tradeSize);
              const gasUsed = buyResult.gas.add(sellResult.gas);
              
              results.successful++;
              results.profit = results.profit.add(profit);
              results.gasSpent = results.gasSpent.add(gasUsed);
              
              // Opportunity likely exhausted, wait briefly
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (error) {
            // Another bot probably got there first
            if (error.message.includes("SlippageExceeded") || 
                error.message.includes("InsufficientLiquidity")) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }
      });
      
      await Promise.all(arbPromises);
      
      // Analyze competition results
      logger.log("\n🏁 Arbitrage Competition Results:");
      
      const competitionResults = Array.from(arbitrageResults.entries())
        .map(([pubkey, results]) => ({
          bot: pubkey.slice(0, 8),
          attempts: results.attempts,
          successful: results.successful,
          successRate: ((results.successful / results.attempts) * 100).toFixed(2) + '%',
          totalProfit: results.profit.div(new BN(1e6)).toString(),
          gasSpent: results.gasSpent.div(new BN(1e9)).toString(),
          netProfit: results.profit.sub(results.gasSpent).div(new BN(1e6)).toString()
        }))
        .sort((a, b) => parseFloat(b.netProfit) - parseFloat(a.netProfit));
      
      console.table(competitionResults);
      
      // Verify competitive dynamics
      const winner = competitionResults[0];
      expect(parseFloat(winner.successRate)).to.be.gt(10); // Winner should have >10% success
      expect(competitionResults.filter(r => parseFloat(r.netProfit) > 0).length).to.be.gte(1); // At least one profitable
    });
  });

  describe("Network Effect Scenarios", () => {
    it("should demonstrate positive network effects", async () => {
      logger.log("🌐 Testing network effect dynamics...");
      
      const stages = [
        { name: "Early Stage", users: 10, liquidityMultiplier: 1 },
        { name: "Growth Stage", users: 50, liquidityMultiplier: 5 },
        { name: "Mature Stage", users: 200, liquidityMultiplier: 20 },
        { name: "Scale Stage", users: 1000, liquidityMultiplier: 100 }
      ];
      
      const networkMetrics = [];
      
      for (const stage of stages) {
        logger.log(`\n📈 ${stage.name} - ${stage.users} users`);
        
        // Create users for this stage
        const stageUsers = Array(stage.users).fill(null).map(() => ({
          keypair: Keypair.generate(),
          type: selectUserType(),
          joinTime: Date.now()
        }));
        
        // Add initial liquidity
        const liquidityAmount = new BN(10000 * stage.liquidityMultiplier * 1e6);
        await orcaManager.addConcentratedLiquidity({
          poolAddress: WHIRLPOOL_ADDRESS,
          lowerPrice: 0.04,
          upperPrice: 0.06,
          twistAmount: liquidityAmount.mul(new BN(20)),
          usdcAmount: liquidityAmount,
          slippageTolerance: 0.01,
          wallet: stageUsers[0].keypair
        });
        
        // Simulate user interactions
        const interactions = await simulateUserInteractions(stageUsers, 100);
        
        // Measure network effects
        const metrics = await measureNetworkEffects();
        
        networkMetrics.push({
          stage: stage.name,
          users: stage.users,
          ...metrics
        });
        
        logger.log(`
          Average trade size: $${metrics.avgTradeSize}
          Price volatility: ${metrics.volatility.toFixed(4)}
          Bid-ask spread: ${metrics.spread.toFixed(4)}
          24h volume: $${metrics.volume24h.toLocaleString()}
          Active users: ${metrics.activeUsers}
          Staking ratio: ${(metrics.stakingRatio * 100).toFixed(2)}%
        `);
      }
      
      // Analyze network effect progression
      logger.log("\n📊 Network Effect Analysis:");
      console.table(networkMetrics);
      
      // Verify positive network effects
      for (let i = 1; i < networkMetrics.length; i++) {
        const prev = networkMetrics[i - 1];
        const curr = networkMetrics[i];
        
        // More users should lead to:
        expect(curr.spread).to.be.lt(prev.spread); // Tighter spreads
        expect(curr.volatility).to.be.lt(prev.volatility); // Lower volatility
        expect(curr.volume24h).to.be.gt(prev.volume24h); // Higher volume
        expect(curr.avgTradeSize).to.be.gt(prev.avgTradeSize); // Larger trades
      }
    });
  });
});

// Helper functions

function getActivityLevel(hour: number): number {
  // Simulate realistic trading patterns (UTC)
  if (hour >= 13 && hour <= 21) return 0.8; // US trading hours - high
  if (hour >= 7 && hour <= 15) return 0.6; // EU trading hours - medium
  if (hour >= 0 && hour <= 8) return 0.7; // Asia trading hours - medium-high
  return 0.3; // Off-peak hours - low
}

async function executeTraderAction(user: any, metrics: any): Promise<void> {
  const action = Math.random();
  
  if (action < 0.7) { // 70% chance to trade
    const isBuy = Math.random() < 0.5;
    const amount = user.balance.div(new BN(Math.floor(Math.random() * 20) + 10));
    
    await orcaManager.executeSwap({
      inputToken: isBuy ? "USDC" : "TWIST",
      inputAmount: amount,
      minOutputAmount: new BN(0),
      wallet: user.keypair
    });
    
    metrics.trades++;
    metrics.volume = metrics.volume.add(amount);
  }
}

async function executeStakerAction(user: any, metrics: any): Promise<void> {
  const action = Math.random();
  
  if (action < 0.1) { // 10% chance to stake more
    const stakeAmount = user.balance.div(new BN(10));
    await twistClient.stake({
      amount: stakeAmount,
      lockPeriod: [30, 90, 180, 365][Math.floor(Math.random() * 4)] * 86400,
      wallet: user.keypair
    });
    metrics.stakes++;
  } else if (action < 0.15) { // 5% chance to claim rewards
    await twistClient.claimRewards({ wallet: user.keypair });
    metrics.rewards++;
  }
}

async function executeLPAction(user: any, metrics: any): Promise<void> {
  const action = Math.random();
  
  if (action < 0.2) { // 20% chance to adjust positions
    // Implementation for LP actions
    metrics.lpAdds++;
  }
}

async function executeArbitrageAction(user: any, metrics: any): Promise<void> {
  // Check for arbitrage opportunities
  const prices = await Promise.all([
    orcaManager.getPrice(),
    getRaydiumPrice()
  ]);
  
  const spread = Math.abs(prices[0] - prices[1]) / Math.min(...prices);
  
  if (spread > 0.005) { // 0.5% opportunity
    // Execute arbitrage
    metrics.trades += 2; // Buy and sell
  }
}

async function simulateTimePassage(seconds: number): Promise<void> {
  // In real implementation, would advance blockchain time
  await new Promise(resolve => setTimeout(resolve, 100));
}

async function simulateTradingVolume(volumeUSD: number): Promise<void> {
  // Simulate trades to generate volume
  const trades = Math.floor(volumeUSD / 1000); // $1000 average trade
  
  for (let i = 0; i < trades; i++) {
    const isBuy = Math.random() < 0.5;
    await orcaManager.executeSwap({
      inputToken: isBuy ? "USDC" : "TWIST",
      inputAmount: new BN(1000 * 1e6),
      minOutputAmount: new BN(0),
      wallet: Keypair.generate()
    }).catch(() => {});
  }
}

function calculateOptimalRange(currentPrice: number, rebalances: number): any {
  // Tighter ranges for more experienced LPs
  const rangeWidth = 0.1 - (rebalances * 0.01); // Start at 10%, decrease by 1% per rebalance
  
  return {
    lower: currentPrice * (1 - rangeWidth / 2),
    upper: currentPrice * (1 + rangeWidth / 2)
  };
}

function calculateImpermanentLoss(priceChange: number): number {
  // IL = 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
  const priceRatio = 1 + priceChange;
  return 2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1;
}

function calculateNetProfit(metrics: any): number {
  const fees = parseFloat(metrics.feesEarned.toString()) / 1e6;
  const il = metrics.impermanentLoss * fees; // Rough IL calculation
  return fees - il;
}

async function getRaydiumPrice(): Promise<number> {
  // Mock implementation
  return 0.05 + (Math.random() - 0.5) * 0.001;
}

async function getSerumPrice(): Promise<number> {
  // Mock implementation
  return 0.05 + (Math.random() - 0.5) * 0.0015;
}

async function captureMarketMetrics(): Promise<any> {
  return {
    price: await orcaManager.getPrice(),
    tvl: await twistClient.getTVL(),
    volume24h: await twistClient.get24hVolume(),
    stakingRatio: await twistClient.getStakingRatio()
  };
}

async function getUserLPPositions(userPubkey: PublicKey): Promise<any[]> {
  // Mock implementation
  return [];
}

async function isPositionUnderwater(position: any, currentPrice: number): Promise<boolean> {
  // Check if position is at risk of liquidation
  return currentPrice < position.liquidationPrice;
}

async function createPriceDiscrepancy(params: any): Promise<void> {
  // Mock implementation to create arbitrage opportunity
}

function calculateOptimalArbSize(spread: number, balance: BN): BN {
  // Calculate optimal size based on spread and available balance
  const maxSize = balance.div(new BN(10)); // Max 10% of balance
  const spreadMultiplier = Math.min(spread * 100, 5); // Cap at 5x
  
  return maxSize.mul(new BN(Math.floor(spreadMultiplier))).div(new BN(5));
}

async function executeArbTrade(params: any): Promise<any> {
  // Mock arbitrage execution
  return {
    output: params.amount.mul(new BN(Math.floor(1000 + Math.random() * 10))).div(new BN(1000)),
    gas: new BN(Math.floor(Math.random() * 0.001 * 1e9))
  };
}

function selectUserType(): string {
  const rand = Math.random();
  if (rand < 0.6) return "trader";
  if (rand < 0.85) return "staker";
  if (rand < 0.95) return "lp";
  return "arbitrageur";
}

async function simulateUserInteractions(users: any[], interactions: number): Promise<any> {
  // Simulate various user interactions
  const results = {
    trades: 0,
    stakes: 0,
    lpAdds: 0
  };
  
  for (let i = 0; i < interactions; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const action = Math.random();
    
    if (action < 0.6) results.trades++;
    else if (action < 0.8) results.stakes++;
    else results.lpAdds++;
  }
  
  return results;
}

async function measureNetworkEffects(): Promise<any> {
  return {
    avgTradeSize: Math.random() * 1000 + 100,
    volatility: Math.random() * 0.1,
    spread: Math.random() * 0.01,
    volume24h: Math.random() * 1000000,
    activeUsers: Math.floor(Math.random() * 1000),
    stakingRatio: Math.random() * 0.5
  };
}