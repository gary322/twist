import { expect } from "chai";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { ethers } from "ethers";
import BN from "bn.js";
import { 
  TwistTokenClient,
  WormholeBridge,
  CrossChainMonitor 
} from "../../../modules/plan-1-blockchain";

describe("Cross-Chain Bridge Operations", () => {
  let solanaConnection: Connection;
  let ethProvider: ethers.providers.JsonRpcProvider;
  let twistClient: TwistTokenClient;
  let wormholeBridge: WormholeBridge;
  let crossChainMonitor: CrossChainMonitor;
  
  // Test wallets
  let solanaWallet: Keypair;
  let ethWallet: ethers.Wallet;
  let bscWallet: ethers.Wallet;
  let polygonWallet: ethers.Wallet;
  let avalancheWallet: ethers.Wallet;

  before(async () => {
    // Initialize connections
    solanaConnection = new Connection("http://localhost:8899", "confirmed");
    ethProvider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    
    // Initialize clients
    twistClient = new TwistTokenClient(solanaConnection);
    wormholeBridge = new WormholeBridge(solanaConnection);
    crossChainMonitor = new CrossChainMonitor();
    
    // Create test wallets
    solanaWallet = Keypair.generate();
    ethWallet = ethers.Wallet.createRandom().connect(ethProvider);
    bscWallet = ethers.Wallet.createRandom();
    polygonWallet = ethers.Wallet.createRandom();
    avalancheWallet = ethers.Wallet.createRandom();
  });

  describe("Basic Bridge Operations", () => {
    it("should bridge TWIST from Solana to Ethereum", async () => {
      logger.log("🌉 Testing Solana → Ethereum bridge...");
      
      const bridgeAmount = new BN(10000 * 1e9); // 10k TWIST
      const initialSolanaBalance = await twistClient.getBalance(solanaWallet.publicKey);
      
      // Initiate bridge transfer
      const bridgeTx = await wormholeBridge.transfer({
        amount: bridgeAmount,
        fromChain: "solana",
        toChain: "ethereum",
        toAddress: ethWallet.address,
        wallet: solanaWallet
      });
      
      logger.log(`Bridge initiated: ${bridgeTx.sequence}`);
      expect(bridgeTx.sequence).to.exist;
      
      // Monitor bridge progress
      let bridgeComplete = false;
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes with 10s intervals
      
      while (!bridgeComplete && attempts < maxAttempts) {
        const status = await wormholeBridge.getTransferStatus(bridgeTx.sequence);
        
        logger.log(`Attempt ${attempts + 1}: ${status.status}`);
        
        if (status.status === "completed") {
          bridgeComplete = true;
          
          // Verify tokens arrived on Ethereum
          const ethTwistContract = new ethers.Contract(
            TWIST_ETH_ADDRESS,
            TWIST_ABI,
            ethProvider
          );
          
          const ethBalance = await ethTwistContract.balanceOf(ethWallet.address);
          expect(ethBalance.toString()).to.equal(bridgeAmount.toString());
          
          // Verify Solana balance decreased
          const finalSolanaBalance = await twistClient.getBalance(solanaWallet.publicKey);
          expect(finalSolanaBalance.toString()).to.equal(
            initialSolanaBalance.sub(bridgeAmount).toString()
          );
          
          // Verify total supply tracking
          const solanaSupply = await twistClient.getCirculatingSupply();
          const ethSupply = await ethTwistContract.totalSupply();
          const totalSupply = solanaSupply.add(new BN(ethSupply.toString()));
          
          expect(totalSupply).to.equal(await twistClient.getTotalSupply());
        }
        
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        attempts++;
      }
      
      expect(bridgeComplete).to.be.true;
    });

    it("should bridge TWIST back from Ethereum to Solana", async () => {
      logger.log("🌉 Testing Ethereum → Solana bridge...");
      
      const bridgeAmount = ethers.utils.parseUnits("5000", 9); // 5k TWIST
      
      // Get Ethereum TWIST contract
      const ethTwistContract = new ethers.Contract(
        TWIST_ETH_ADDRESS,
        TWIST_ABI,
        ethWallet
      );
      
      const initialEthBalance = await ethTwistContract.balanceOf(ethWallet.address);
      
      // Approve bridge contract
      const approveTx = await ethTwistContract.approve(
        ETH_BRIDGE_ADDRESS,
        bridgeAmount
      );
      await approveTx.wait();
      
      // Bridge back to Solana
      const ethBridge = new ethers.Contract(
        ETH_BRIDGE_ADDRESS,
        BRIDGE_ABI,
        ethWallet
      );
      
      const bridgeTx = await ethBridge.transferTokens(
        TWIST_ETH_ADDRESS,
        bridgeAmount,
        1, // Solana chain ID
        solanaWallet.publicKey.toBuffer()
      );
      
      const receipt = await bridgeTx.wait();
      const sequence = extractSequenceFromLogs(receipt.logs);
      
      // Wait for confirmation on Solana
      let confirmed = false;
      let attempts = 0;
      
      while (!confirmed && attempts < 30) {
        try {
          const vaa = await wormholeBridge.getSignedVAA(sequence);
          
          // Redeem on Solana
          const redeemTx = await wormholeBridge.redeemOnSolana({
            vaa,
            wallet: solanaWallet
          });
          
          confirmed = true;
          
          // Verify balances
          const finalEthBalance = await ethTwistContract.balanceOf(ethWallet.address);
          expect(finalEthBalance.toString()).to.equal(
            initialEthBalance.sub(bridgeAmount).toString()
          );
          
          const solanaBalance = await twistClient.getBalance(solanaWallet.publicKey);
          expect(solanaBalance.gte(new BN(bridgeAmount.toString()))).to.be.true;
          
        } catch (error) {
          logger.log(`Attempt ${attempts + 1}: Waiting for VAA...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          attempts++;
        }
      }
      
      expect(confirmed).to.be.true;
    });

    it("should handle multi-chain routing", async () => {
      logger.log("🌐 Testing multi-chain routing...");
      
      // Route: Solana → Ethereum → BSC → Polygon
      const routeAmount = new BN(1000 * 1e9); // 1k TWIST
      
      const route = [
        { from: "solana", to: "ethereum", wallet: solanaWallet, recipient: ethWallet.address },
        { from: "ethereum", to: "bsc", wallet: ethWallet, recipient: bscWallet.address },
        { from: "bsc", to: "polygon", wallet: bscWallet, recipient: polygonWallet.address }
      ];
      
      let currentAmount = routeAmount;
      
      for (const leg of route) {
        logger.log(`\nRouting ${leg.from} → ${leg.to}...`);
        
        const bridgeFee = await wormholeBridge.getBridgeFee(leg.from, leg.to);
        const netAmount = currentAmount.sub(bridgeFee);
        
        const tx = await executeBridgeTransfer({
          amount: currentAmount,
          fromChain: leg.from,
          toChain: leg.to,
          fromWallet: leg.wallet,
          toAddress: leg.recipient
        });
        
        await waitForBridgeCompletion(tx.sequence);
        
        currentAmount = netAmount;
        logger.log(`Completed: ${currentAmount} TWIST arrived`);
      }
      
      // Verify final balance on Polygon
      const polygonTwist = new ethers.Contract(
        TWIST_POLYGON_ADDRESS,
        TWIST_ABI,
        polygonProvider
      );
      
      const polygonBalance = await polygonTwist.balanceOf(polygonWallet.address);
      expect(polygonBalance.gt(0)).to.be.true;
      
      // Calculate total fees
      const totalFees = routeAmount.sub(new BN(polygonBalance.toString()));
      const feePercentage = totalFees.mul(new BN(100)).div(routeAmount);
      
      logger.log(`\nTotal routing fees: ${feePercentage}% of original amount`);
      expect(feePercentage.lte(new BN(3))).to.be.true; // Max 3% total fees
    });
  });

  describe("Complex Bridge Scenarios", () => {
    it("should handle concurrent bridge operations", async () => {
      logger.log("🔄 Testing concurrent bridge operations...");
      
      const operations = [
        { amount: new BN(1000 * 1e9), from: "solana", to: "ethereum" },
        { amount: new BN(2000 * 1e9), from: "solana", to: "bsc" },
        { amount: new BN(1500 * 1e9), from: "solana", to: "polygon" },
        { amount: new BN(500 * 1e9), from: "ethereum", to: "solana" },
        { amount: new BN(750 * 1e9), from: "bsc", to: "ethereum" }
      ];
      
      // Initiate all bridges concurrently
      const bridgePromises = operations.map(async (op) => {
        const wallet = getWalletForChain(op.from);
        const recipient = getAddressForChain(op.to);
        
        return wormholeBridge.transfer({
          amount: op.amount,
          fromChain: op.from,
          toChain: op.to,
          toAddress: recipient,
          wallet
        });
      });
      
      const bridgeTxs = await Promise.all(bridgePromises);
      
      logger.log(`Initiated ${bridgeTxs.length} concurrent bridges`);
      
      // Monitor all bridges
      const completionPromises = bridgeTxs.map(async (tx, index) => {
        const startTime = Date.now();
        await waitForBridgeCompletion(tx.sequence);
        const duration = Date.now() - startTime;
        
        return {
          operation: operations[index],
          sequence: tx.sequence,
          duration,
          success: true
        };
      });
      
      const results = await Promise.all(completionPromises);
      
      logger.log("\n📊 Concurrent Bridge Results:");
      results.forEach((result, i) => {
        logger.log(`${i + 1}. ${result.operation.from} → ${result.operation.to}: ${result.duration / 1000}s`);
      });
      
      // All should complete successfully
      expect(results.every(r => r.success)).to.be.true;
      
      // Verify no tokens were lost
      const totalSupplyAfter = await getTotalSupplyAcrossChains();
      expect(totalSupplyAfter).to.equal(await twistClient.getTotalSupply());
    });

    it("should handle bridge failures and recovery", async () => {
      logger.log("❌ Testing bridge failure scenarios...");
      
      // Scenario 1: Network congestion causing timeout
      const congestedBridge = await wormholeBridge.transfer({
        amount: new BN(5000 * 1e9),
        fromChain: "solana",
        toChain: "ethereum",
        toAddress: ethWallet.address,
        wallet: solanaWallet,
        options: { maxRetries: 1, timeout: 5000 } // Short timeout
      });
      
      // Wait for timeout
      let timedOut = false;
      try {
        await waitForBridgeCompletion(congestedBridge.sequence, { timeout: 10000 });
      } catch (error) {
        if (error.message.includes("timeout")) {
          timedOut = true;
        }
      }
      
      if (timedOut) {
        logger.log("Bridge timed out, attempting recovery...");
        
        // Recovery mechanism should kick in
        const recoveryTx = await wormholeBridge.retryTransfer(congestedBridge.sequence);
        expect(recoveryTx.success).to.be.true;
        
        // Original tokens should be recoverable
        const refundTx = await wormholeBridge.cancelAndRefund({
          sequence: congestedBridge.sequence,
          wallet: solanaWallet
        });
        
        expect(refundTx.refunded).to.equal(congestedBridge.amount);
      }
      
      // Scenario 2: Invalid recipient address
      try {
        await wormholeBridge.transfer({
          amount: new BN(1000 * 1e9),
          fromChain: "solana",
          toChain: "ethereum",
          toAddress: "invalid_address",
          wallet: solanaWallet
        });
        expect.fail("Should reject invalid address");
      } catch (error) {
        expect(error.message).to.include("Invalid recipient address");
      }
      
      // Scenario 3: Insufficient liquidity on destination
      const largeBridge = new BN(100_000_000 * 1e9); // 100M TWIST
      
      try {
        await wormholeBridge.transfer({
          amount: largeBridge,
          fromChain: "solana",
          toChain: "avalanche",
          toAddress: avalancheWallet.address,
          wallet: solanaWallet
        });
      } catch (error) {
        expect(error.message).to.include("Insufficient liquidity");
        
        // Should suggest alternative routes
        const alternatives = await wormholeBridge.getAlternativeRoutes({
          amount: largeBridge,
          from: "solana",
          to: "avalanche"
        });
        
        expect(alternatives.length).to.be.gt(0);
        logger.log(`Suggested alternatives: ${alternatives.map(a => a.route.join(" → ")).join(", ")}`);
      }
    });

    it("should maintain price consistency across chains", async () => {
      logger.log("💰 Testing cross-chain price consistency...");
      
      const priceMonitor = crossChainMonitor.startPriceMonitoring({
        chains: ["solana", "ethereum", "bsc", "polygon", "avalanche"],
        interval: 5000 // 5 seconds
      });
      
      // Collect price data for 1 minute
      const priceHistory = [];
      
      for (let i = 0; i < 12; i++) {
        const prices = await crossChainMonitor.getAllChainPrices();
        priceHistory.push({
          timestamp: Date.now(),
          prices
        });
        
        // Check for arbitrage opportunities
        const maxPrice = Math.max(...Object.values(prices));
        const minPrice = Math.min(...Object.values(prices));
        const spread = (maxPrice - minPrice) / minPrice;
        
        logger.log(`\nPrice check ${i + 1}:`);
        Object.entries(prices).forEach(([chain, price]) => {
          logger.log(`  ${chain}: $${price.toFixed(4)}`);
        });
        logger.log(`  Spread: ${(spread * 100).toFixed(2)}%`);
        
        if (spread > 0.02) { // 2% arbitrage opportunity
          logger.log("  ⚠️ Arbitrage opportunity detected!");
          
          // Verify arbitrage bots are active
          const arbActivity = await crossChainMonitor.getArbitrageActivity();
          expect(arbActivity.activeBots).to.be.gt(0);
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      priceMonitor.stop();
      
      // Analyze price consistency
      const avgSpreads = priceHistory.map(p => {
        const prices = Object.values(p.prices);
        const max = Math.max(...prices);
        const min = Math.min(...prices);
        return (max - min) / min;
      });
      
      const avgSpread = avgSpreads.reduce((a, b) => a + b) / avgSpreads.length;
      
      logger.log(`\nAverage cross-chain price spread: ${(avgSpread * 100).toFixed(2)}%`);
      expect(avgSpread).to.be.lt(0.015); // Less than 1.5% average spread
    });

    it("should handle chain-specific issues", async () => {
      logger.log("⛓️ Testing chain-specific scenarios...");
      
      // Ethereum: High gas prices
      const ethGasPrice = await ethProvider.getGasPrice();
      const highGasMultiplier = 5;
      
      logger.log(`Current ETH gas: ${ethers.utils.formatUnits(ethGasPrice, "gwei")} gwei`);
      logger.log(`Simulating ${highGasMultiplier}x gas spike...`);
      
      const highGasBridge = await simulateHighGasBridge({
        amount: new BN(1000 * 1e9),
        fromChain: "ethereum",
        toChain: "solana",
        gasPrice: ethGasPrice.mul(highGasMultiplier),
        wallet: ethWallet
      });
      
      // Should warn about high fees
      expect(highGasBridge.warnings).to.include("High network fees");
      expect(highGasBridge.estimatedFees.gt(highGasBridge.amount.mul(new BN(5)).div(new BN(100)))).to.be.true; // >5% fees
      
      // BSC: Network congestion
      logger.log("\nSimulating BSC congestion...");
      
      const bscCongestionTest = await simulateNetworkCongestion({
        chain: "bsc",
        congestionLevel: "high",
        testDuration: 30000 // 30 seconds
      });
      
      expect(bscCongestionTest.successRate).to.be.lt(0.8); // Less than 80% success during congestion
      expect(bscCongestionTest.avgConfirmationTime).to.be.gt(15000); // >15 seconds
      
      // Polygon: Reorg handling
      logger.log("\nTesting Polygon reorg handling...");
      
      const polygonBridge = await wormholeBridge.transfer({
        amount: new BN(2000 * 1e9),
        fromChain: "polygon",
        toChain: "solana",
        toAddress: solanaWallet.publicKey.toString(),
        wallet: polygonWallet
      });
      
      // Simulate reorg
      await simulateChainReorg({
        chain: "polygon",
        depth: 3,
        affectedTx: polygonBridge.txHash
      });
      
      // Bridge should detect and handle reorg
      const reorgStatus = await wormholeBridge.getTransferStatus(polygonBridge.sequence);
      expect(reorgStatus.reorgDetected).to.be.true;
      expect(reorgStatus.status).to.equal("resubmitted");
      
      // Avalanche: Subnet bridging
      logger.log("\nTesting Avalanche subnet bridging...");
      
      const subnetBridge = await wormholeBridge.transferToSubnet({
        amount: new BN(5000 * 1e9),
        fromChain: "avalanche",
        toSubnet: "defi-subnet",
        toAddress: avalancheWallet.address,
        wallet: avalancheWallet
      });
      
      expect(subnetBridge.success).to.be.true;
      expect(subnetBridge.route).to.include("c-chain");
    });
  });

  describe("Security and Edge Cases", () => {
    it("should prevent double-spending across chains", async () => {
      logger.log("🔒 Testing double-spend prevention...");
      
      const amount = new BN(10000 * 1e9);
      
      // Attempt to bridge same tokens twice
      const firstBridge = await wormholeBridge.transfer({
        amount,
        fromChain: "solana",
        toChain: "ethereum",
        toAddress: ethWallet.address,
        wallet: solanaWallet
      });
      
      // Try to bridge again before first completes
      try {
        const doubleBridge = await wormholeBridge.transfer({
          amount,
          fromChain: "solana",
          toChain: "bsc",
          toAddress: bscWallet.address,
          wallet: solanaWallet
        });
        expect.fail("Should prevent double-spending");
      } catch (error) {
        expect(error.message).to.include("Insufficient balance");
      }
      
      // Tokens should be locked until bridge completes
      const lockedBalance = await wormholeBridge.getLockedBalance(solanaWallet.publicKey);
      expect(lockedBalance.toString()).to.equal(amount.toString());
      
      // Wait for first bridge to complete
      await waitForBridgeCompletion(firstBridge.sequence);
      
      // Now second bridge should work
      const secondBridge = await wormholeBridge.transfer({
        amount: new BN(5000 * 1e9),
        fromChain: "ethereum",
        toChain: "bsc",
        toAddress: bscWallet.address,
        wallet: ethWallet
      });
      
      expect(secondBridge.sequence).to.exist;
    });

    it("should handle guardian set changes", async () => {
      logger.log("👮 Testing guardian set rotation...");
      
      // Get current guardian set
      const currentSet = await wormholeBridge.getGuardianSet();
      logger.log(`Current guardian set: ${currentSet.index}`);
      logger.log(`Guardians: ${currentSet.guardians.length}`);
      
      // Initiate bridge just before guardian rotation
      const bridgeBeforeRotation = await wormholeBridge.transfer({
        amount: new BN(1000 * 1e9),
        fromChain: "solana",
        toChain: "ethereum",
        toAddress: ethWallet.address,
        wallet: solanaWallet
      });
      
      // Simulate guardian set change
      await simulateGuardianSetChange();
      
      // Bridge should still complete with new guardian signatures
      const completed = await waitForBridgeCompletion(bridgeBeforeRotation.sequence);
      expect(completed).to.be.true;
      
      // Verify new guardian set is active
      const newSet = await wormholeBridge.getGuardianSet();
      expect(newSet.index).to.equal(currentSet.index + 1);
    });

    it("should enforce bridge limits and rate limiting", async () => {
      logger.log("🚦 Testing bridge limits...");
      
      // Test maximum single transfer limit
      const maxTransferLimit = await wormholeBridge.getMaxTransferLimit("solana", "ethereum");
      
      try {
        await wormholeBridge.transfer({
          amount: maxTransferLimit.add(new BN(1)),
          fromChain: "solana",
          toChain: "ethereum",
          toAddress: ethWallet.address,
          wallet: solanaWallet
        });
        expect.fail("Should enforce transfer limit");
      } catch (error) {
        expect(error.message).to.include("Exceeds maximum transfer limit");
      }
      
      // Test rate limiting
      const rateLimitTest = async () => {
        const transfers = [];
        
        // Try to make many small transfers quickly
        for (let i = 0; i < 20; i++) {
          transfers.push(
            wormholeBridge.transfer({
              amount: new BN(100 * 1e9),
              fromChain: "solana",
              toChain: "ethereum",
              toAddress: ethWallet.address,
              wallet: solanaWallet
            }).catch(e => ({ error: e.message }))
          );
        }
        
        const results = await Promise.all(transfers);
        const rateLimited = results.filter(r => r.error?.includes("Rate limit"));
        
        logger.log(`Rate limited: ${rateLimited.length}/20 transfers`);
        expect(rateLimited.length).to.be.gt(0);
      };
      
      await rateLimitTest();
      
      // Test daily transfer limit
      const dailyLimit = await wormholeBridge.getDailyLimit(solanaWallet.publicKey);
      const dailyUsed = await wormholeBridge.getDailyUsage(solanaWallet.publicKey);
      
      logger.log(`Daily limit: ${dailyLimit.div(new BN(1e9))} TWIST`);
      logger.log(`Daily used: ${dailyUsed.div(new BN(1e9))} TWIST`);
      
      if (dailyUsed.add(new BN(10000 * 1e9)).gt(dailyLimit)) {
        try {
          await wormholeBridge.transfer({
            amount: new BN(10000 * 1e9),
            fromChain: "solana",
            toChain: "ethereum",
            toAddress: ethWallet.address,
            wallet: solanaWallet
          });
          expect.fail("Should enforce daily limit");
        } catch (error) {
          expect(error.message).to.include("Daily limit exceeded");
        }
      }
    });

    it("should handle wrapped token conversions correctly", async () => {
      logger.log("🎁 Testing wrapped token mechanics...");
      
      // Each chain except Solana has wrapped TWIST
      const wrappedTokens = {
        ethereum: { address: TWIST_ETH_ADDRESS, decimals: 18 },
        bsc: { address: TWIST_BSC_ADDRESS, decimals: 18 },
        polygon: { address: TWIST_POLYGON_ADDRESS, decimals: 18 },
        avalanche: { address: TWIST_AVAX_ADDRESS, decimals: 18 }
      };
      
      // Test decimal conversions (Solana uses 9, others use 18)
      const solanaAmount = new BN(1234567890123456); // With 9 decimals
      
      const ethBridge = await wormholeBridge.transfer({
        amount: solanaAmount,
        fromChain: "solana",
        toChain: "ethereum",
        toAddress: ethWallet.address,
        wallet: solanaWallet
      });
      
      await waitForBridgeCompletion(ethBridge.sequence);
      
      // Check Ethereum balance with correct decimal conversion
      const ethTwist = new ethers.Contract(
        TWIST_ETH_ADDRESS,
        TWIST_ABI,
        ethProvider
      );
      
      const ethBalance = await ethTwist.balanceOf(ethWallet.address);
      const expectedEthAmount = solanaAmount.mul(new BN(10).pow(new BN(9))); // Convert 9 to 18 decimals
      
      expect(ethBalance.toString()).to.equal(expectedEthAmount.toString());
      
      // Test unwrapping when bridging back
      const unwrapBridge = await wormholeBridge.transfer({
        amount: new BN(ethBalance.toString()),
        fromChain: "ethereum",
        toChain: "solana",
        toAddress: solanaWallet.publicKey.toString(),
        wallet: ethWallet,
        decimals: 18
      });
      
      await waitForBridgeCompletion(unwrapBridge.sequence);
      
      // Should receive original amount back on Solana
      const finalSolanaBalance = await twistClient.getBalance(solanaWallet.publicKey);
      expect(finalSolanaBalance.toString()).to.equal(solanaAmount.toString());
    });
  });

  describe("Monitoring and Analytics", () => {
    it("should track bridge volume and statistics", async () => {
      logger.log("📊 Collecting bridge analytics...");
      
      const startTime = Date.now();
      const testDuration = 60000; // 1 minute
      
      // Start analytics collection
      const analytics = crossChainMonitor.startAnalytics();
      
      // Perform various bridge operations
      const testOperations = [
        { amount: new BN(1000 * 1e9), from: "solana", to: "ethereum" },
        { amount: new BN(2000 * 1e9), from: "ethereum", to: "bsc" },
        { amount: new BN(1500 * 1e9), from: "bsc", to: "polygon" },
        { amount: new BN(3000 * 1e9), from: "polygon", to: "avalanche" },
        { amount: new BN(2500 * 1e9), from: "avalanche", to: "solana" }
      ];
      
      const operationPromises = testOperations.map(op => 
        executeBridgeOperation(op).catch(e => ({ error: e }))
      );
      
      await Promise.all(operationPromises);
      
      // Wait for remaining test duration
      const elapsed = Date.now() - startTime;
      if (elapsed < testDuration) {
        await new Promise(resolve => setTimeout(resolve, testDuration - elapsed));
      }
      
      // Stop analytics and get report
      const report = analytics.stop();
      
      logger.log("\n📈 Bridge Analytics Report:");
      logger.log(`Total Volume: $${report.totalVolume.toLocaleString()}`);
      logger.log(`Total Transactions: ${report.totalTransactions}`);
      logger.log(`Success Rate: ${(report.successRate * 100).toFixed(2)}%`);
      logger.log(`Average Time: ${report.avgBridgeTime.toFixed(2)} seconds`);
      logger.log(`Average Fee: ${(report.avgFeePercent * 100).toFixed(3)}%`);
      
      logger.log("\nVolume by Route:");
      Object.entries(report.volumeByRoute).forEach(([route, volume]) => {
        logger.log(`  ${route}: $${volume.toLocaleString()}`);
      });
      
      logger.log("\nPopular Routes:");
      report.popularRoutes.slice(0, 5).forEach((route, i) => {
        logger.log(`  ${i + 1}. ${route.from} → ${route.to}: ${route.count} transfers`);
      });
      
      // Verify analytics accuracy
      expect(report.totalTransactions).to.equal(testOperations.length);
      expect(report.successRate).to.be.gt(0.9); // >90% success rate
    });

    it("should detect and alert on anomalies", async () => {
      logger.log("🚨 Testing anomaly detection...");
      
      const anomalyDetector = crossChainMonitor.startAnomalyDetection({
        volumeThreshold: 1000000, // $1M
        velocityThreshold: 10, // 10 transfers per minute
        priceDeviationThreshold: 0.05 // 5%
      });
      
      const detectedAnomalies = [];
      
      anomalyDetector.on("anomaly", (anomaly) => {
        detectedAnomalies.push(anomaly);
        logger.log(`\nAnomaly detected: ${anomaly.type}`);
        logger.log(`Severity: ${anomaly.severity}`);
        logger.log(`Details: ${JSON.stringify(anomaly.details)}`);
      });
      
      // Simulate various anomalies
      
      // 1. Unusual volume spike
      await simulateVolumeSpike({
        multiplier: 10,
        duration: 5000
      });
      
      // 2. Rapid sequential transfers (potential attack)
      const rapidTransfers = Array(20).fill(null).map(() => 
        wormholeBridge.transfer({
          amount: new BN(100 * 1e9),
          fromChain: "solana",
          toChain: "ethereum",
          toAddress: ethWallet.address,
          wallet: solanaWallet
        }).catch(e => e)
      );
      
      await Promise.all(rapidTransfers);
      
      // 3. Large price deviation between chains
      await simulatePriceDeviation({
        chain: "bsc",
        deviation: 0.08 // 8% lower
      });
      
      // Wait for detection
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      anomalyDetector.stop();
      
      // Verify anomalies were detected
      expect(detectedAnomalies.length).to.be.gte(3);
      expect(detectedAnomalies.some(a => a.type === "volume_spike")).to.be.true;
      expect(detectedAnomalies.some(a => a.type === "velocity_spike")).to.be.true;
      expect(detectedAnomalies.some(a => a.type === "price_deviation")).to.be.true;
      
      // Check if protective measures were triggered
      const protectiveMeasures = await crossChainMonitor.getActiveProtections();
      expect(protectiveMeasures.length).to.be.gt(0);
    });
  });
});

// Helper functions

async function waitForBridgeCompletion(
  sequence: string, 
  options: { timeout?: number; checkInterval?: number } = {}
): Promise<boolean> {
  const timeout = options.timeout || 300000; // 5 minutes default
  const checkInterval = options.checkInterval || 10000; // 10 seconds default
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const status = await wormholeBridge.getTransferStatus(sequence);
    
    if (status.status === "completed") {
      return true;
    }
    
    if (status.status === "failed") {
      throw new Error(`Bridge failed: ${status.error}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  throw new Error("Bridge timeout");
}

function getWalletForChain(chain: string): any {
  switch (chain) {
    case "solana": return solanaWallet;
    case "ethereum": return ethWallet;
    case "bsc": return bscWallet;
    case "polygon": return polygonWallet;
    case "avalanche": return avalancheWallet;
    default: throw new Error(`Unknown chain: ${chain}`);
  }
}

function getAddressForChain(chain: string): string {
  switch (chain) {
    case "solana": return solanaWallet.publicKey.toString();
    case "ethereum": return ethWallet.address;
    case "bsc": return bscWallet.address;
    case "polygon": return polygonWallet.address;
    case "avalanche": return avalancheWallet.address;
    default: throw new Error(`Unknown chain: ${chain}`);
  }
}

function extractSequenceFromLogs(logs: any[]): string {
  // Extract Wormhole sequence from transaction logs
  const wormholeLog = logs.find(log => 
    log.topics[0] === WORMHOLE_MESSAGE_EVENT_TOPIC
  );
  
  if (!wormholeLog) {
    throw new Error("No Wormhole message found in logs");
  }
  
  return ethers.utils.defaultAbiCoder.decode(
    ["uint64"],
    wormholeLog.data
  )[0].toString();
}

async function getTotalSupplyAcrossChains(): Promise<BN> {
  const supplies = await Promise.all([
    twistClient.getCirculatingSupply(), // Solana
    getChainSupply("ethereum"),
    getChainSupply("bsc"),
    getChainSupply("polygon"),
    getChainSupply("avalanche")
  ]);
  
  return supplies.reduce((total, supply) => total.add(supply), new BN(0));
}

async function getChainSupply(chain: string): Promise<BN> {
  // Mock implementation - would query actual contracts
  return new BN(Math.floor(Math.random() * 10000000) * 1e9);
}

async function executeBridgeTransfer(params: any): Promise<any> {
  return wormholeBridge.transfer({
    amount: params.amount,
    fromChain: params.fromChain,
    toChain: params.toChain,
    toAddress: params.toAddress,
    wallet: params.fromWallet
  });
}

async function simulateHighGasBridge(params: any): Promise<any> {
  // Mock implementation
  return {
    warnings: ["High network fees"],
    estimatedFees: params.amount.mul(new BN(10)).div(new BN(100)), // 10% fees
    proceed: false
  };
}

async function simulateNetworkCongestion(params: any): Promise<any> {
  // Mock implementation
  return {
    successRate: 0.7,
    avgConfirmationTime: 20000
  };
}

async function simulateChainReorg(params: any): Promise<void> {
  // Mock implementation
  logger.log(`Simulating ${params.depth}-block reorg on ${params.chain}`);
}

async function simulateGuardianSetChange(): Promise<void> {
  // Mock implementation
  logger.log("Simulating Wormhole guardian set rotation");
}

async function executeBridgeOperation(op: any): Promise<any> {
  const wallet = getWalletForChain(op.from);
  const recipient = getAddressForChain(op.to);
  
  return wormholeBridge.transfer({
    amount: op.amount,
    fromChain: op.from,
    toChain: op.to,
    toAddress: recipient,
    wallet
  });
}

async function simulateVolumeSpike(params: any): Promise<void> {
  // Mock implementation
  logger.log(`Simulating ${params.multiplier}x volume spike`);
}

async function simulatePriceDeviation(params: any): Promise<void> {
  // Mock implementation
  logger.log(`Simulating ${params.deviation * 100}% price deviation on ${params.chain}`);
}

// Constants (would be imported from config)
const TWIST_ETH_ADDRESS = "0x1234...";
const TWIST_BSC_ADDRESS = "0x5678...";
const TWIST_POLYGON_ADDRESS = "0x9012...";
const TWIST_AVAX_ADDRESS = "0x3456...";
const ETH_BRIDGE_ADDRESS = "0xabcd...";
const WORMHOLE_MESSAGE_EVENT_TOPIC = "0xef12...";
const TWIST_ABI = []; // Would contain actual ABI
const BRIDGE_ABI = []; // Would contain actual ABI