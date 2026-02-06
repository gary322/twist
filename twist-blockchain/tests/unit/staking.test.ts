import { expect } from "chai";
import BN from "bn.js";
import { stakingCalculator } from "../../sdk/src/utils/staking-math";

describe("Staking Calculator Unit Tests", () => {
  describe("APY Calculations", () => {
    it("should calculate correct APY for 30-day lock", () => {
      const lockPeriod = 30 * 86400; // 30 days in seconds
      const apy = stakingCalculator.getAPYForLockPeriod(lockPeriod);
      expect(apy).to.equal(1000); // 10% APY
    });

    it("should calculate correct APY for 90-day lock", () => {
      const lockPeriod = 90 * 86400;
      const apy = stakingCalculator.getAPYForLockPeriod(lockPeriod);
      expect(apy).to.equal(2000); // 20% APY
    });

    it("should calculate correct APY for 180-day lock", () => {
      const lockPeriod = 180 * 86400;
      const apy = stakingCalculator.getAPYForLockPeriod(lockPeriod);
      expect(apy).to.equal(3500); // 35% APY
    });

    it("should calculate correct APY for 365-day lock", () => {
      const lockPeriod = 365 * 86400;
      const apy = stakingCalculator.getAPYForLockPeriod(lockPeriod);
      expect(apy).to.equal(6700); // 67% APY
    });
  });

  describe("Reward Calculations", () => {
    it("should calculate rewards correctly for simple case", () => {
      const stakedAmount = new BN(1000 * 1e9); // 1000 TWIST
      const apyBps = 2000; // 20% APY
      const daysStaked = 365;

      const rewards = stakingCalculator.calculateRewards(
        stakedAmount,
        apyBps,
        daysStaked
      );

      const expectedRewards = new BN(200 * 1e9); // 200 TWIST
      expect(rewards.toString()).to.equal(expectedRewards.toString());
    });

    it("should calculate partial period rewards", () => {
      const stakedAmount = new BN(1000 * 1e9);
      const apyBps = 3650; // 36.5% APY
      const daysStaked = 100;

      const rewards = stakingCalculator.calculateRewards(
        stakedAmount,
        apyBps,
        daysStaked
      );

      // 100/365 * 36.5% * 1000 = 100 TWIST
      const expectedRewards = new BN(100 * 1e9);
      const diff = rewards.sub(expectedRewards).abs();
      
      // Allow small rounding difference
      expect(diff.ltn(1e6)).to.be.true;
    });

    it("should account for decay in reward calculations", () => {
      const stakedAmount = new BN(1000 * 1e9);
      const apyBps = 2000;
      const daysStaked = 30;
      const decayRateBps = 50; // 0.5% daily

      const { netRewards, decayLoss } = stakingCalculator.calculateNetRewards(
        stakedAmount,
        apyBps,
        daysStaked,
        decayRateBps
      );

      // Rewards: ~16.44 TWIST
      // Decay loss: ~14.01 TWIST
      // Net: ~2.43 TWIST
      expect(netRewards.gtn(0)).to.be.true;
      expect(decayLoss.gtn(0)).to.be.true;
      expect(netRewards.lt(decayLoss)).to.be.true; // At 30 days, decay > rewards
    });
  });

  describe("Early Unstaking Penalties", () => {
    it("should calculate no penalty after lock period", () => {
      const lockPeriod = 90 * 86400;
      const timeStaked = 91 * 86400;
      const penalty = stakingCalculator.calculateEarlyUnstakePenalty(
        lockPeriod,
        timeStaked
      );
      expect(penalty).to.equal(0);
    });

    it("should calculate maximum penalty at start", () => {
      const lockPeriod = 90 * 86400;
      const timeStaked = 86400; // 1 day
      const penalty = stakingCalculator.calculateEarlyUnstakePenalty(
        lockPeriod,
        timeStaked
      );
      expect(penalty).to.equal(5000); // 50% penalty
    });

    it("should calculate proportional penalty", () => {
      const lockPeriod = 90 * 86400;
      const timeStaked = 45 * 86400; // Half way
      const penalty = stakingCalculator.calculateEarlyUnstakePenalty(
        lockPeriod,
        timeStaked
      );
      expect(penalty).to.equal(2500); // 25% penalty
    });
  });

  describe("Optimal Lock Period", () => {
    it("should recommend longer lock for low decay environment", () => {
      const decayRateBps = 30; // 0.3% daily
      const optimalPeriod = stakingCalculator.calculateOptimalLockPeriod(decayRateBps);
      expect(optimalPeriod).to.be.gte(180 * 86400); // At least 180 days
    });

    it("should recommend shorter lock for high decay environment", () => {
      const decayRateBps = 100; // 1% daily
      const optimalPeriod = stakingCalculator.calculateOptimalLockPeriod(decayRateBps);
      expect(optimalPeriod).to.be.lte(90 * 86400); // At most 90 days
    });
  });
});