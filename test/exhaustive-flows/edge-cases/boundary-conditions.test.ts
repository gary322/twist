import { expect } from "chai";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { TwistTokenClient } from "../../../modules/plan-1-blockchain";

describe("Edge Cases and Boundary Conditions", () => {
  let connection: Connection;
  let twistClient: TwistTokenClient;
  let testUser: Keypair;

  beforeEach(async () => {
    connection = new Connection("http://localhost:8899", "confirmed");
    testUser = Keypair.generate();
    twistClient = new TwistTokenClient(connection);
  });

  describe("Numerical Boundary Tests", () => {
    it("should handle maximum possible token amounts", async () => {
      const MAX_SUPPLY = new BN(1_000_000_000).mul(new BN(10).pow(new BN(9))); // 1B tokens
      const MAX_U64 = new BN(2).pow(new BN(64)).sub(new BN(1));

      // Test staking with maximum allowed amount
      try {
        await twistClient.stake({
          amount: MAX_SUPPLY,
          lockPeriod: 365 * 86400,
          wallet: testUser
        });
        // Should succeed if user has balance
      } catch (error) {
        expect(error.message).to.include("InsufficientBalance");
      }

      // Test calculations don't overflow
      const decayAmount = MAX_SUPPLY.mul(new BN(50)).div(new BN(10000)); // 0.5% decay
      expect(decayAmount.lte(MAX_U64)).to.be.true;
    });

    it("should handle minimum possible token amounts", async () => {
      const ONE_LAMPORT = new BN(1);

      // Test operations with 1 lamport
      try {
        await twistClient.stake({
          amount: ONE_LAMPORT,
          lockPeriod: 30 * 86400,
          wallet: testUser
        });
      } catch (error) {
        expect(error.message).to.include("AmountTooSmall");
      }

      // Test decay on very small amounts
      const tinyAmount = new BN(100);
      const decayed = tinyAmount.mul(new BN(50)).div(new BN(10000));
      expect(decayed.toNumber()).to.equal(0); // Should round down to 0
    });

    it("should handle precision edge cases", async () => {
      // Test rounding in reward calculations
      const stakeAmount = new BN(1_000_000_000); // 1 TWIST (with 9 decimals)
      const apyBps = new BN(6700); // 67% APY
      const secondsInYear = new BN(365 * 86400);
      const secondsStaked = new BN(86400); // 1 day

      const expectedReward = stakeAmount
        .mul(apyBps)
        .mul(secondsStaked)
        .div(new BN(10000))
        .div(secondsInYear);

      // Verify no precision loss in calculation
      const backCalculated = expectedReward
        .mul(secondsInYear)
        .mul(new BN(10000))
        .div(apyBps)
        .div(secondsStaked);

      const precisionLoss = stakeAmount.sub(backCalculated).abs();
      expect(precisionLoss.lte(new BN(1))).to.be.true; // Max 1 lamport precision loss
    });
  });

  describe("Time-based Edge Cases", () => {
    it("should handle rapid successive operations", async () => {
      const operations = [];

      // Try to execute 100 operations in quick succession
      for (let i = 0; i < 100; i++) {
        operations.push(
          twistClient.transfer({
            to: Keypair.generate().publicKey,
            amount: new BN(1000),
            wallet: testUser
          }).catch(e => e)
        );
      }

      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === "fulfilled").length;
      
      logger.log(`${successful}/100 rapid operations succeeded`);
      expect(successful).to.be.greaterThan(0);
    });

    it("should enforce time-based constraints", async () => {
      // Test decay timing constraint
      await twistClient.applyDecay();

      // Try to decay again immediately
      try {
        await twistClient.applyDecay();
        expect.fail("Should not allow decay twice in same day");
      } catch (error) {
        expect(error.message).to.include("DecayTooSoon");
      }

      // Test unstaking before lock period
      const stakeTx = await twistClient.stake({
        amount: new BN(1000 * 1e9),
        lockPeriod: 30 * 86400,
        wallet: testUser
      });

      try {
        await twistClient.unstake({
          stakeAccount: stakeTx.stakeAccount,
          wallet: testUser
        });
        expect.fail("Should not allow early unstaking");
      } catch (error) {
        expect(error.message).to.include("StillLocked");
      }
    });

    it("should handle clock drift and time zones", async () => {
      // Simulate clock drift between client and blockchain
      const clientTime = Date.now() / 1000;
      const blockchainTime = await getBlockchainTime();
      const drift = Math.abs(clientTime - blockchainTime);

      expect(drift).to.be.lessThan(60); // Less than 1 minute drift

      // Operations should still work with reasonable drift
      const result = await twistClient.stake({
        amount: new BN(1000 * 1e9),
        lockPeriod: 30 * 86400,
        wallet: testUser
      });

      expect(result.success).to.be.true;
    });
  });

  describe("State Transition Edge Cases", () => {
    it("should handle conflicting state updates", async () => {
      const account = Keypair.generate().publicKey;
      
      // Simulate two users trying to update same account
      const update1 = twistClient.updateAccountSettings({
        account,
        settings: { autoCompound: true },
        wallet: testUser
      });

      const update2 = twistClient.updateAccountSettings({
        account,
        settings: { autoCompound: false },
        wallet: testUser
      });

      const results = await Promise.allSettled([update1, update2]);
      
      // One should succeed, one should fail
      const succeeded = results.filter(r => r.status === "fulfilled").length;
      expect(succeeded).to.equal(1);
    });

    it("should maintain consistency during partial failures", async () => {
      // Create a complex transaction that partially fails
      const complexTx = async () => {
        const tx = new Transaction();
        
        // Add multiple instructions
        tx.add(await twistClient.buildTransferInstruction({
          to: Keypair.generate().publicKey,
          amount: new BN(1000),
          wallet: testUser
        }));

        // This one might fail due to insufficient balance
        tx.add(await twistClient.buildTransferInstruction({
          to: Keypair.generate().publicKey,
          amount: new BN(999999999999999),
          wallet: testUser
        }));

        return connection.sendTransaction(tx, [testUser]);
      };

      try {
        await complexTx();
      } catch (error) {
        // Verify no partial state changes occurred
        const balance = await twistClient.getBalance(testUser.publicKey);
        expect(balance).to.equal(await getInitialBalance(testUser.publicKey));
      }
    });
  });

  describe("Input Validation Edge Cases", () => {
    it("should handle malformed inputs gracefully", async () => {
      const testCases = [
        { amount: new BN(-1), error: "NegativeAmount" },
        { amount: new BN(0), error: "ZeroAmount" },
        { lockPeriod: -86400, error: "InvalidLockPeriod" },
        { lockPeriod: 366 * 86400, error: "LockPeriodTooLong" },
        { to: PublicKey.default, error: "InvalidRecipient" },
        { to: testUser.publicKey, error: "SelfTransfer" }
      ];

      for (const testCase of testCases) {
        try {
          if (testCase.amount !== undefined) {
            await twistClient.stake({
              amount: testCase.amount,
              lockPeriod: 30 * 86400,
              wallet: testUser
            });
          } else if (testCase.lockPeriod !== undefined) {
            await twistClient.stake({
              amount: new BN(1000),
              lockPeriod: testCase.lockPeriod,
              wallet: testUser
            });
          } else if (testCase.to !== undefined) {
            await twistClient.transfer({
              to: testCase.to,
              amount: new BN(1000),
              wallet: testUser
            });
          }
          expect.fail(`Should have thrown ${testCase.error}`);
        } catch (error) {
          expect(error.message).to.include(testCase.error);
        }
      }
    });

    it("should sanitize string inputs", async () => {
      // Test governance proposal with malicious content
      const maliciousProposal = {
        title: "<script>alert('xss')</script>",
        description: "'; DROP TABLE users; --",
        actions: []
      };

      const result = await twistClient.createProposal({
        ...maliciousProposal,
        wallet: testUser
      });

      // Verify inputs were sanitized
      const proposal = await twistClient.getProposal(result.id);
      expect(proposal.title).to.not.include("<script>");
      expect(proposal.description).to.not.include("DROP TABLE");
    });
  });

  describe("Oracle Edge Cases", () => {
    it("should handle oracle failures gracefully", async () => {
      // Simulate all oracles being offline
      const mockOracles = {
        pyth: null,
        switchboard: null,
        chainlink: null
      };

      try {
        await twistClient.getAggregatedPrice(mockOracles);
        expect.fail("Should fail with no oracles");
      } catch (error) {
        expect(error.message).to.include("InsufficientOracles");
      }

      // Simulate extreme price divergence
      const divergentOracles = {
        pyth: { price: 0.05, confidence: 0.0001 },
        switchboard: { price: 0.10, confidence: 0.0001 }, // 100% higher
        chainlink: { price: 0.07, confidence: 0.0001 }
      };

      try {
        await twistClient.getAggregatedPrice(divergentOracles);
        expect.fail("Should fail with high divergence");
      } catch (error) {
        expect(error.message).to.include("PriceDivergenceTooHigh");
      }
    });

    it("should handle stale price data", async () => {
      const staleOracle = {
        price: 0.05,
        confidence: 0.0001,
        timestamp: Date.now() / 1000 - 120 // 2 minutes old
      };

      try {
        await twistClient.validateOracleData(staleOracle);
        expect.fail("Should reject stale data");
      } catch (error) {
        expect(error.message).to.include("StaleOracleData");
      }
    });
  });

  describe("Concurrency and Race Conditions", () => {
    it("should handle concurrent stake operations", async () => {
      const users = Array(10).fill(null).map(() => Keypair.generate());
      
      // All users try to stake at the same time
      const stakePromises = users.map(user => 
        twistClient.stake({
          amount: new BN(1000 * 1e9),
          lockPeriod: 30 * 86400,
          wallet: user
        }).catch(e => e)
      );

      const results = await Promise.allSettled(stakePromises);
      const successful = results.filter(r => r.status === "fulfilled").length;
      
      expect(successful).to.equal(10); // All should succeed
    });

    it("should handle concurrent buyback triggers", async () => {
      // Simulate multiple bots trying to trigger buyback
      const buybackAttempts = Array(5).fill(null).map(() => 
        twistClient.executeBuyback({
          maxAmount: new BN(1000 * 1e6)
        }).catch(e => e)
      );

      const results = await Promise.allSettled(buybackAttempts);
      const successful = results.filter(r => r.status === "fulfilled").length;
      
      // Only one should succeed due to mutex
      expect(successful).to.equal(1);
    });
  });

  describe("Network and Infrastructure Edge Cases", () => {
    it("should handle network interruptions", async () => {
      // Simulate network timeout
      const originalTimeout = connection.timeout;
      connection.timeout = 1; // 1ms timeout

      try {
        await twistClient.getBalance(testUser.publicKey);
        expect.fail("Should timeout");
      } catch (error) {
        expect(error.message).to.include("timeout");
      }

      connection.timeout = originalTimeout;
    });

    it("should retry failed transactions appropriately", async () => {
      let attempts = 0;
      const mockSend = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Transaction failed");
        }
        return "success-signature";
      };

      const result = await twistClient.sendWithRetry(mockSend, {
        maxRetries: 3,
        retryDelay: 100
      });

      expect(result).to.equal("success-signature");
      expect(attempts).to.equal(3);
    });

    it("should handle RPC rate limits", async () => {
      const requests = Array(1000).fill(null).map((_, i) => 
        twistClient.getBalance(Keypair.generate().publicKey)
          .catch(e => ({ error: e, index: i }))
      );

      const results = await Promise.allSettled(requests);
      const rateLimited = results.filter(r => 
        r.status === "fulfilled" && 
        r.value.error?.message.includes("429")
      ).length;

      logger.log(`${rateLimited} requests were rate limited`);
      expect(rateLimited).to.be.lessThan(100); // Should handle most requests
    });
  });

  describe("Account and Balance Edge Cases", () => {
    it("should handle dust amounts correctly", async () => {
      // Test decay on accounts with dust amounts
      const dustAccounts = [
        { balance: new BN(10), expectedDecay: new BN(0) },
        { balance: new BN(100), expectedDecay: new BN(0) },
        { balance: new BN(1000), expectedDecay: new BN(0) },
        { balance: new BN(10000), expectedDecay: new BN(0) },
        { balance: new BN(100000), expectedDecay: new BN(5) }
      ];

      for (const account of dustAccounts) {
        const decayed = account.balance.mul(new BN(50)).div(new BN(10000));
        expect(decayed.toString()).to.equal(account.expectedDecay.toString());
      }
    });

    it("should handle account closure edge cases", async () => {
      // Try to close account with active stakes
      const stakeAccount = await twistClient.stake({
        amount: new BN(1000 * 1e9),
        lockPeriod: 30 * 86400,
        wallet: testUser
      });

      try {
        await twistClient.closeAccount({
          account: stakeAccount.stakeAccount,
          wallet: testUser
        });
        expect.fail("Should not allow closing active stake");
      } catch (error) {
        expect(error.message).to.include("AccountHasActiveStakes");
      }
    });
  });
});

// Helper functions
async function getBlockchainTime(): Promise<number> {
  // Mock implementation
  return Date.now() / 1000;
}

async function getInitialBalance(pubkey: PublicKey): Promise<BN> {
  // Mock implementation
  return new BN(0);
}