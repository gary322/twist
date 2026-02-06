import { expect } from "chai";
import BN from "bn.js";
import { decayCalculator } from "../../sdk/src/utils/decay-math";

describe("Decay Mechanism Unit Tests", () => {
  describe("decayCalculator", () => {
    it("should calculate correct decay for single day", () => {
      const initialAmount = new BN(1000 * 1e9); // 1000 TWIST
      const decayRateBps = 50; // 0.5%
      const days = 1;

      const remainingAmount = decayCalculator.calculateDecayedAmount(
        initialAmount,
        decayRateBps,
        days
      );

      const expectedAmount = initialAmount.muln(9950).divn(10000); // 99.5%
      expect(remainingAmount.toString()).to.equal(expectedAmount.toString());
    });

    it("should calculate compound decay for multiple days", () => {
      const initialAmount = new BN(1000 * 1e9);
      const decayRateBps = 50;
      const days = 7;

      const remainingAmount = decayCalculator.calculateDecayedAmount(
        initialAmount,
        decayRateBps,
        days
      );

      // After 7 days at 0.5% daily: (0.995)^7 ≈ 0.9656
      const expectedApprox = initialAmount.muln(9656).divn(10000);
      const diff = remainingAmount.sub(expectedApprox).abs();
      
      // Allow small rounding difference
      expect(diff.ltn(initialAmount.divn(10000))).to.be.true;
    });

    it("should handle zero decay rate", () => {
      const initialAmount = new BN(1000 * 1e9);
      const decayRateBps = 0;
      const days = 30;

      const remainingAmount = decayCalculator.calculateDecayedAmount(
        initialAmount,
        decayRateBps,
        days
      );

      expect(remainingAmount.toString()).to.equal(initialAmount.toString());
    });

    it("should calculate treasury distributions correctly", () => {
      const decayAmount = new BN(100 * 1e9);
      const treasurySplitBps = 9000; // 90% to floor treasury

      const { floorAmount, opsAmount } = decayCalculator.calculateTreasuryDistribution(
        decayAmount,
        treasurySplitBps
      );

      expect(floorAmount.toString()).to.equal(new BN(90 * 1e9).toString());
      expect(opsAmount.toString()).to.equal(new BN(10 * 1e9).toString());
      expect(floorAmount.add(opsAmount).toString()).to.equal(decayAmount.toString());
    });

    it("should prevent integer overflow with large numbers", () => {
      const maxSupply = new BN(2).pow(new BN(64)).subn(1); // max u64
      const decayRateBps = 50;
      const days = 1;

      expect(() => {
        decayCalculator.calculateDecayedAmount(maxSupply, decayRateBps, days);
      }).to.not.throw();
    });
  });
});