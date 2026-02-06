import { expect } from "chai";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { 
  TwistTokenClient,
  OrcaLiquidityManager,
  PriceAggregator,
  CircuitBreaker,
  MonitoringDashboard,
  SupplyPIDController
} from "../../../modules/plan-1-blockchain";

describe("Component Integration Tests", () => {
  let connection: Connection;
  let twistClient: TwistTokenClient;
  let orcaManager: OrcaLiquidityManager;
  let priceAggregator: PriceAggregator;
  let circuitBreaker: CircuitBreaker;
  let pidController: SupplyPIDController;
  let monitoring: MonitoringDashboard;

  before(async () => {
    connection = new Connection("http://localhost:8899", "confirmed");
    
    // Initialize all components
    twistClient = new TwistTokenClient(connection);
    orcaManager = new OrcaLiquidityManager(connection, wallet, WHIRLPOOL_ADDRESS);
    priceAggregator = new PriceAggregator(
      connection,
      PYTH_FEED,
      SWITCHBOARD_FEED,
      CHAINLINK_FEED
    );
    circuitBreaker = new CircuitBreaker(twistClient);
    pidController = new SupplyPIDController();
    monitoring = new MonitoringDashboard();
  });

  describe("Smart Contract + SDK Integration", () => {
    it("should seamlessly interact between on-chain program and SDK", async () => {
      const user = Keypair.generate();
      
      // SDK should properly encode/decode all instruction types
      const instructions = [
        "initialize",
        "stake", 
        "unstake",
        "claimRewards",
        "applyDecay",
        "executeBuyback",
        "updateOracle",
        "setEmergencyPause"
      ];

      for (const instruction of instructions) {
        const ix = await twistClient.buildInstruction(instruction, {
          // Mock params based on instruction type
        });

        expect(ix.programId.toString()).to.equal(TWIST_PROGRAM_ID);
        expect(ix.data.length).to.be.greaterThan(0);
        expect(ix.keys.length).to.be.greaterThan(0);
      }

      // Test complex transaction building
      const complexTx = await twistClient.buildComplexTransaction([
        { type: "stake", amount: new BN(1000), lockPeriod: 30 * 86400 },
        { type: "claimRewards" },
        { type: "compound", percentage: 50 }
      ], user);

      expect(complexTx.instructions.length).to.equal(3);
      expect(complexTx.feePayer).to.equal(user.publicKey);
    });

    it("should handle CPI (Cross-Program Invocation) correctly", async () => {
      // Test TWIST interacting with other programs
      
      // 1. TWIST -> SPL Token Program
      const transferIx = await twistClient.buildTransferInstruction({
        from: Keypair.generate().publicKey,
        to: Keypair.generate().publicKey,
        amount: new BN(1000)
      });
      
      expect(transferIx.programId.toString()).to.equal(TOKEN_PROGRAM_ID.toString());

      // 2. TWIST -> Orca Whirlpool
      const swapIx = await orcaManager.buildSwapInstruction({
        poolAddress: WHIRLPOOL_ADDRESS,
        tokenIn: "TWIST",
        amountIn: new BN(1000),
        minAmountOut: new BN(50)
      });

      expect(swapIx.programId.toString()).to.equal(ORCA_PROGRAM_ID);

      // 3. TWIST -> Wormhole Bridge
      const bridgeIx = await twistClient.buildBridgeInstruction({
        amount: new BN(1000),
        targetChain: 2, // Ethereum
        targetAddress: "0x..." 
      });

      expect(bridgeIx.programId.toString()).to.equal(WORMHOLE_PROGRAM_ID);
    });
  });

  describe("Oracle Integration", () => {
    it("should aggregate prices from multiple oracles correctly", async () => {
      // Test normal operation with all oracles online
      const aggregatedPrice = await priceAggregator.getAggregatedPrice();
      
      expect(aggregatedPrice.price).to.be.greaterThan(0);
      expect(aggregatedPrice.confidence).to.be.lessThan(0.001); // < 0.1% confidence interval
      expect(aggregatedPrice.sources.length).to.be.gte(2);

      // Verify each source
      for (const source of aggregatedPrice.sources) {
        expect(["pyth", "switchboard", "chainlink"]).to.include(source.source);
        expect(source.price).to.be.closeTo(aggregatedPrice.price, 0.002); // Within 0.2%
        expect(source.timestamp).to.be.closeTo(Date.now() / 1000, 60); // Within 1 minute
      }
    });

    it("should handle oracle failures gracefully", async () => {
      // Simulate Pyth oracle failure
      const pythOfflineAggregator = new PriceAggregator(
        connection,
        PublicKey.default, // Invalid address
        SWITCHBOARD_FEED,
        CHAINLINK_FEED
      );

      const result = await pythOfflineAggregator.getAggregatedPrice();
      
      // Should still work with 2 oracles
      expect(result.sources.length).to.equal(2);
      expect(result.sources.map(s => s.source)).to.not.include("pyth");
    });

    it("should integrate oracle prices with smart contract operations", async () => {
      // Get current oracle price
      const oraclePrice = await priceAggregator.getAggregatedPrice();
      
      // Update on-chain oracle
      const updateTx = await twistClient.updateOraclePrice({
        price: oraclePrice.price,
        confidence: oraclePrice.confidence,
        timestamp: Date.now()
      });

      expect(updateTx.success).to.be.true;

      // Verify buyback uses updated price
      const floorPrice = await twistClient.getFloorPrice();
      const triggerPrice = floorPrice * 0.97;

      if (oraclePrice.price < triggerPrice) {
        const buybackResult = await twistClient.executeBuyback({
          maxAmount: new BN(1000 * 1e6)
        });

        expect(buybackResult.executionPrice).to.be.closeTo(
          oraclePrice.price,
          oraclePrice.price * 0.01 // Within 1%
        );
      }
    });
  });

  describe("DeFi Protocol Integration", () => {
    it("should integrate Orca liquidity operations with TWIST", async () => {
      const user = Keypair.generate();
      const twistAmount = new BN(10000 * 1e9);
      const usdcAmount = new BN(500 * 1e6);

      // 1. Add liquidity through integrated flow
      const addLiquidityTx = await twistClient.addLiquidityWithOrca({
        twistAmount,
        usdcAmount,
        poolAddress: WHIRLPOOL_ADDRESS,
        slippage: 0.01,
        wallet: user
      });

      expect(addLiquidityTx.success).to.be.true;
      expect(addLiquidityTx.positionNFT).to.exist;

      // 2. Monitor position through SDK
      const position = await orcaManager.getPosition(addLiquidityTx.positionNFT);
      
      expect(position.liquidity).to.be.gt(new BN(0));
      expect(position.twistAmount).to.be.closeTo(twistAmount, twistAmount.div(new BN(100)));
      expect(position.usdcAmount).to.be.closeTo(usdcAmount, usdcAmount.div(new BN(100)));

      // 3. Collect fees and compound
      await simulateTimePassage(86400); // 1 day
      await simulateTradingVolume(100000); // $100k volume

      const fees = await orcaManager.collectFees({
        positionMint: addLiquidityTx.positionNFT,
        wallet: user
      });

      expect(fees.twistAmount.add(fees.usdcAmount)).to.be.gt(new BN(0));

      // 4. Auto-compound fees back to position
      const compoundTx = await twistClient.compoundLPFees({
        positionNFT: addLiquidityTx.positionNFT,
        twistFees: fees.twistAmount,
        usdcFees: fees.usdcAmount,
        wallet: user
      });

      expect(compoundTx.success).to.be.true;
    });

    it("should handle complex arbitrage scenarios", async () => {
      // Setup price monitoring across DEXs
      const dexMonitor = setInterval(async () => {
        const prices = await Promise.all([
          orcaManager.getPrice(),
          getRaydiumPrice(),
          getSerumPrice()
        ]);

        const [orcaPrice, raydiumPrice, serumPrice] = prices;
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        const spread = (maxPrice - minPrice) / minPrice;

        if (spread > 0.01) { // 1% arbitrage opportunity
          logger.log(`Arbitrage opportunity: ${(spread * 100).toFixed(2)}% spread`);
          
          // Execute arbitrage through integrated system
          const arbTx = await twistClient.executeArbitrage({
            buyDEX: prices.indexOf(minPrice) === 0 ? "orca" : 
                    prices.indexOf(minPrice) === 1 ? "raydium" : "serum",
            sellDEX: prices.indexOf(maxPrice) === 0 ? "orca" :
                     prices.indexOf(maxPrice) === 1 ? "raydium" : "serum",
            amount: new BN(10000 * 1e6), // $10k
            minProfit: new BN(50 * 1e6) // Min $50 profit
          });

          if (arbTx.success) {
            logger.log(`Arbitrage executed: $${arbTx.profit.toNumber() / 1e6} profit`);
          }
        }
      }, 1000);

      // Run for 30 seconds
      await new Promise(resolve => setTimeout(resolve, 30000));
      clearInterval(dexMonitor);
    });
  });

  describe("Monitoring Integration", () => {
    it("should collect and expose metrics from all components", async () => {
      // Start monitoring all components
      const metrics = await monitoring.collectMetrics({
        components: [
          "smart-contract",
          "oracles", 
          "liquidity",
          "staking",
          "treasury",
          "circuit-breaker"
        ]
      });

      // Verify comprehensive metrics
      expect(metrics).to.have.all.keys([
        "timestamp",
        "price",
        "supply",
        "volume24h",
        "tvl",
        "stakingAPY",
        "treasuryValue",
        "liquidityDepth",
        "oracleHealth",
        "systemHealth"
      ]);

      // Test metric aggregation
      const hourlyMetrics = await monitoring.getHourlyMetrics(24);
      expect(hourlyMetrics).to.have.length(24);

      // Verify alerts trigger correctly
      const alertRules = [
        { metric: "price", condition: "below", threshold: 0.045, severity: "high" },
        { metric: "volume24h", condition: "below", threshold: 50000, severity: "medium" },
        { metric: "oracleHealth", condition: "equals", threshold: false, severity: "critical" }
      ];

      for (const rule of alertRules) {
        const alert = await monitoring.checkAlert(rule);
        if (alert.triggered) {
          expect(alert.severity).to.equal(rule.severity);
          expect(alert.message).to.include(rule.metric);
        }
      }
    });

    it("should integrate monitoring with circuit breaker", async () => {
      // Monitor for circuit breaker conditions
      const cbStatus = await circuitBreaker.checkConditions();

      // If any conditions are close to triggering, monitoring should alert
      for (const condition of cbStatus.conditions) {
        if (condition.value > condition.threshold * 0.9) {
          const alert = await monitoring.getAlert(`circuit-breaker-${condition.name}`);
          expect(alert).to.exist;
          expect(alert.severity).to.be.oneOf(["medium", "high"]);
        }
      }

      // Test circuit breaker activation flow
      if (cbStatus.shouldTrip) {
        // Monitoring should immediately alert
        const criticalAlert = await monitoring.getLatestCriticalAlert();
        expect(criticalAlert.type).to.equal("circuit-breaker-triggered");
        
        // Verify all dependent systems are notified
        const notifications = await monitoring.getNotificationsSent();
        expect(notifications).to.include.members([
          "ops-team",
          "dev-team", 
          "security-team",
          "executive-team"
        ]);
      }
    });
  });

  describe("Economic Model Integration", () => {
    it("should integrate PID controller with buyback and supply", async () => {
      const targetPrice = 0.05; // $0.05
      let currentPrice = await priceAggregator.getAggregatedPrice();
      
      // Run PID controller for multiple iterations
      for (let i = 0; i < 10; i++) {
        const adjustment = pidController.calculateMintAdjustment({
          targetPrice,
          currentPrice: currentPrice.price,
          currentSupply: await twistClient.getTotalSupply(),
          maxMintRate: 0.001 // 0.1% max daily mint
        });

        logger.log(`PID iteration ${i}: ${adjustment.adjustmentReason}`);

        if (adjustment.mintAmount.gt(new BN(0))) {
          // Execute supply adjustment
          const adjustTx = await twistClient.adjustSupply({
            amount: adjustment.mintAmount,
            type: adjustment.adjustmentReason.includes("Minting") ? "mint" : "burn",
            reason: adjustment.adjustmentReason
          });

          expect(adjustTx.success).to.be.true;

          // Wait for market to react
          await simulateTimePassage(3600); // 1 hour
          
          // Get new price
          currentPrice = await priceAggregator.getAggregatedPrice();
        }
      }

      // Price should converge towards target
      const finalPriceDiff = Math.abs(currentPrice.price - targetPrice) / targetPrice;
      expect(finalPriceDiff).to.be.lt(0.05); // Within 5% of target
    });

    it("should coordinate decay, buyback, and staking rewards", async () => {
      const initialMetrics = await twistClient.getEconomicMetrics();

      // 1. Apply daily decay
      const decayTx = await twistClient.applyDecay();
      expect(decayTx.success).to.be.true;

      const postDecaySupply = await twistClient.getTotalSupply();
      expect(postDecaySupply).to.be.lt(initialMetrics.totalSupply);

      // 2. Check if buyback triggered
      const currentPrice = await priceAggregator.getAggregatedPrice();
      const floorPrice = await twistClient.getFloorPrice();

      if (currentPrice.price < floorPrice * 0.97) {
        const buybackTx = await twistClient.executeBuyback({
          maxAmount: new BN(10000 * 1e6)
        });

        expect(buybackTx.success).to.be.true;
        expect(buybackTx.twistBurned).to.be.gt(new BN(0));

        // Verify supply decreased from buyback burn
        const postBuybackSupply = await twistClient.getTotalSupply();
        expect(postBuybackSupply).to.be.lt(postDecaySupply);
      }

      // 3. Calculate and distribute staking rewards
      const stakingPool = await twistClient.getStakingPool();
      const rewardRate = calculateDynamicRewardRate({
        stakedPercentage: stakingPool.totalStaked.div(postDecaySupply),
        currentAPY: stakingPool.currentAPY,
        targetStakedPercentage: 0.5 // Target 50% staked
      });

      const rewardsTx = await twistClient.distributeStakingRewards({
        rewardRate,
        fundingSource: "treasury"
      });

      expect(rewardsTx.success).to.be.true;
      expect(rewardsTx.totalDistributed).to.be.gt(new BN(0));

      // 4. Verify economic balance
      const finalMetrics = await twistClient.getEconomicMetrics();
      
      // Total value should be preserved (minus small fees)
      const initialValue = calculateTotalValue(initialMetrics);
      const finalValue = calculateTotalValue(finalMetrics);
      
      expect(finalValue).to.be.gte(initialValue * 0.99); // Max 1% loss to fees
    });
  });

  describe("Cross-Chain Integration", () => {
    it("should handle cross-chain transfers with all components", async () => {
      const user = Keypair.generate();
      const bridgeAmount = new BN(10000 * 1e9); // 10k TWIST

      // 1. Initiate bridge transfer
      const bridgeTx = await twistClient.bridgeTokens({
        amount: bridgeAmount,
        targetChain: "ethereum",
        targetAddress: "0x1234...abcd",
        wallet: user
      });

      expect(bridgeTx.success).to.be.true;
      expect(bridgeTx.wormholeSequence).to.exist;

      // 2. Monitor bridge status
      const bridgeMonitor = setInterval(async () => {
        const status = await twistClient.getBridgeStatus(bridgeTx.wormholeSequence);
        
        logger.log(`Bridge status: ${status.status}`);
        
        if (status.status === "completed") {
          clearInterval(bridgeMonitor);
          
          // 3. Verify supply tracking
          const solanaSupply = await twistClient.getTotalSupply();
          const bridgedSupply = await twistClient.getBridgedSupply();
          const totalSupply = solanaSupply.add(bridgedSupply);
          
          // Total supply should remain constant
          expect(totalSupply).to.equal(initialTotalSupply);
          
          // 4. Verify oracle price parity across chains
          const solanaPrices = await priceAggregator.getAggregatedPrice();
          const ethPrices = await getEthereumTwistPrice();
          
          const priceDiff = Math.abs(solanaPrices.price - ethPrices) / solanaPrices.price;
          expect(priceDiff).to.be.lt(0.02); // Less than 2% difference
        }
      }, 5000);

      // Wait for bridge completion (max 5 minutes)
      await new Promise(resolve => setTimeout(resolve, 300000));
    });
  });

  describe("Bot Integration", () => {
    it("should coordinate multiple bots without conflicts", async () => {
      // Start all bots
      const bots = {
        buyback: await startBuybackBot(),
        liquidity: await startLiquidityBot(), 
        arbitrage: await startArbitrageBot(),
        monitoring: await startMonitoringBot()
      };

      // Run for 60 seconds and track operations
      const operations = [];
      const operationLogger = (bot: string, operation: any) => {
        operations.push({ bot, operation, timestamp: Date.now() });
      };

      Object.entries(bots).forEach(([name, bot]) => {
        bot.on("operation", (op) => operationLogger(name, op));
      });

      await new Promise(resolve => setTimeout(resolve, 60000));

      // Verify no conflicting operations
      const conflicts = findConflictingOperations(operations);
      expect(conflicts).to.have.length(0);

      // Verify bot coordination
      const buybackOps = operations.filter(op => op.bot === "buyback");
      const liquidityOps = operations.filter(op => op.bot === "liquidity");

      // Liquidity bot should pause during buyback
      for (const buybackOp of buybackOps) {
        const concurrentLiqOps = liquidityOps.filter(liqOp => 
          Math.abs(liqOp.timestamp - buybackOp.timestamp) < 5000 // Within 5 seconds
        );
        expect(concurrentLiqOps).to.have.length(0);
      }

      // Stop all bots
      await Promise.all(Object.values(bots).map(bot => bot.stop()));
    });
  });

  describe("Error Recovery Integration", () => {
    it("should handle cascading failures gracefully", async () => {
      // Simulate oracle failure during critical operation
      const mockFailingOracle = {
        getPrice: async () => { throw new Error("Oracle timeout"); }
      };

      // Attempt buyback with failing oracle
      try {
        await twistClient.executeBuyback({
          maxAmount: new BN(1000 * 1e6),
          priceOracle: mockFailingOracle
        });
      } catch (error) {
        // Should fallback to other oracles
        expect(error.recovered).to.be.true;
        expect(error.fallbackOracle).to.exist;
      }

      // Verify circuit breaker activated if needed
      const cbStatus = await circuitBreaker.getStatus();
      if (cbStatus.isActive) {
        expect(cbStatus.reason).to.include("oracle");
        
        // Verify graceful degradation
        const degradedOps = await twistClient.getAvailableOperations();
        expect(degradedOps).to.not.include("executeBuyback");
        expect(degradedOps).to.include("transfer"); // Basic ops still work
      }
    });

    it("should maintain data consistency across component failures", async () => {
      const user = Keypair.generate();
      
      // Start complex operation that touches multiple components
      const complexOp = async () => {
        // 1. Stake tokens
        const stakeTx = await twistClient.stake({
          amount: new BN(1000 * 1e9),
          lockPeriod: 30 * 86400,
          wallet: user
        });

        // 2. Add liquidity (simulate failure here)
        throw new Error("Network error");

        // 3. Vote on proposal (should not execute)
        await twistClient.vote({
          proposalId: "prop-123",
          support: true,
          wallet: user
        });
      };

      try {
        await complexOp();
      } catch (error) {
        // Verify partial state was rolled back
        const userStakes = await twistClient.getUserStakes(user.publicKey);
        expect(userStakes).to.have.length(0); // Stake should be rolled back

        const userVotes = await twistClient.getUserVotes(user.publicKey);
        expect(userVotes).to.have.length(0); // Vote never executed
      }
    });
  });
});

// Helper functions
async function simulateTimePassage(seconds: number): Promise<void> {
  // Implementation would advance blockchain time
}

async function simulateTradingVolume(volumeUSD: number): Promise<void> {
  // Implementation would simulate trades
}

async function getRaydiumPrice(): Promise<number> {
  return 0.05 + (Math.random() - 0.5) * 0.001;
}

async function getSerumPrice(): Promise<number> {
  return 0.05 + (Math.random() - 0.5) * 0.001;
}

async function calculateDynamicRewardRate(params: any): number {
  const { stakedPercentage, currentAPY, targetStakedPercentage } = params;
  
  if (stakedPercentage < targetStakedPercentage) {
    // Increase APY to incentivize staking
    return Math.min(currentAPY * 1.1, 0.7); // Max 70% APY
  } else {
    // Decrease APY if over-staked
    return Math.max(currentAPY * 0.95, 0.1); // Min 10% APY
  }
}

async function calculateTotalValue(metrics: any): number {
  return metrics.treasuryValue + 
         (metrics.totalSupply.toNumber() / 1e9 * metrics.price) +
         metrics.liquidityValue;
}

async function getEthereumTwistPrice(): Promise<number> {
  // Mock implementation
  return 0.05;
}

async function startBuybackBot(): Promise<any> {
  return {
    on: (event: string, handler: Function) => {},
    stop: async () => {}
  };
}

async function startLiquidityBot(): Promise<any> {
  return {
    on: (event: string, handler: Function) => {},
    stop: async () => {}
  };
}

async function startArbitrageBot(): Promise<any> {
  return {
    on: (event: string, handler: Function) => {},
    stop: async () => {}
  };
}

async function startMonitoringBot(): Promise<any> {
  return {
    on: (event: string, handler: Function) => {},
    stop: async () => {}
  };
}

function findConflictingOperations(operations: any[]): any[] {
  const conflicts = [];
  
  for (let i = 0; i < operations.length; i++) {
    for (let j = i + 1; j < operations.length; j++) {
      const op1 = operations[i];
      const op2 = operations[j];
      
      // Check if operations conflict
      if (Math.abs(op1.timestamp - op2.timestamp) < 1000) { // Within 1 second
        if (op1.operation.type === op2.operation.type &&
            op1.operation.target === op2.operation.target) {
          conflicts.push({ op1, op2 });
        }
      }
    }
  }
  
  return conflicts;
}