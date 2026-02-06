import { WhirlpoolClient, Position, Whirlpool } from "@orca-so/whirlpools-sdk";
import { PublicKey } from "@solana/web3.js";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import BN from "bn.js";
import { logger } from "./logger";
import { PriceMath, PoolUtil } from "@orca-so/whirlpools-sdk";

export class LiquidityRebalancer {
  constructor(private whirlpoolClient: WhirlpoolClient) {}

  async rebalancePosition(
    position: Position,
    whirlpool: Whirlpool
  ): Promise<{ newPositionMint: PublicKey; txIds: string[] }> {
    try {
      const poolData = whirlpool.getData();
      const positionData = position.getData();
      
      // Step 1: Remove liquidity from current position
      logger.info("Removing liquidity from current position...");
      const removeLiquidityTx = await this.removeLiquidity(position, positionData.liquidity);
      
      // Step 2: Close old position
      logger.info("Closing old position...");
      const closeTx = await position.close();
      
      // Step 3: Calculate new price range
      const currentPrice = PriceMath.sqrtPriceX64ToPrice(
        poolData.sqrtPrice,
        poolData.tokenMintA.decimals,
        poolData.tokenMintB.decimals
      );
      
      const rangePercent = 0.25; // 25% range on each side
      const lowerPrice = currentPrice * (1 - rangePercent);
      const upperPrice = currentPrice * (1 + rangePercent);
      
      // Step 4: Open new position
      logger.info("Opening new position with updated range...");
      const { positionMint, tx: openTx } = await whirlpool.openPosition(
        PriceMath.priceToTickIndex(
          DecimalUtil.fromNumber(lowerPrice),
          poolData.tokenMintA.decimals,
          poolData.tokenMintB.decimals
        ),
        PriceMath.priceToTickIndex(
          DecimalUtil.fromNumber(upperPrice),
          poolData.tokenMintA.decimals,
          poolData.tokenMintB.decimals
        ),
        await this.whirlpoolClient.getContext().wallet.publicKey
      );
      
      // Step 5: Add liquidity to new position
      const newPosition = await whirlpool.getPosition(positionMint);
      const addLiquidityTx = await this.addOptimalLiquidity(
        newPosition,
        whirlpool,
        positionData.liquidity
      );
      
      const txIds = [
        removeLiquidityTx,
        closeTx,
        openTx,
        addLiquidityTx
      ].filter(tx => tx !== null);
      
      logger.info(`Position rebalanced successfully. New position: ${positionMint.toString()}`);
      
      return {
        newPositionMint: positionMint,
        txIds
      };
      
    } catch (error) {
      logger.error("Error rebalancing position:", error);
      throw error;
    }
  }

  private async removeLiquidity(
    position: Position,
    liquidity: BN
  ): Promise<string> {
    try {
      const quote = await position.getDecreaseLiquidityQuote({
        liquidity,
        slippageTolerance: Percentage.fromFraction(1, 100), // 1% slippage
      });
      
      const tx = await position.decreaseLiquidity(quote);
      return await this.whirlpoolClient.getContext().connection.sendTransaction(tx);
      
    } catch (error) {
      logger.error("Error removing liquidity:", error);
      throw error;
    }
  }

  private async addOptimalLiquidity(
    position: Position,
    whirlpool: Whirlpool,
    targetLiquidity: BN
  ): Promise<string> {
    try {
      const poolData = whirlpool.getData();
      const positionData = position.getData();
      
      // Calculate optimal token amounts based on current price
      const optimalAmounts = PoolUtil.getTokenAmountsFromLiquidity({
        liquidity: targetLiquidity,
        currentSqrtPrice: poolData.sqrtPrice,
        lowerTickIndex: positionData.tickLowerIndex,
        upperTickIndex: positionData.tickUpperIndex,
        roundUp: true,
      });
      
      // Get increase liquidity quote
      const quote = await position.getIncreaseLiquidityQuote({
        inputTokenMint: poolData.tokenMintA,
        inputTokenAmount: optimalAmounts.tokenA,
        slippageTolerance: Percentage.fromFraction(1, 100),
      });
      
      const tx = await position.increaseLiquidity(quote);
      return await this.whirlpoolClient.getContext().connection.sendTransaction(tx);
      
    } catch (error) {
      logger.error("Error adding liquidity:", error);
      throw error;
    }
  }

  async emergencyWithdraw(position: Position): Promise<string[]> {
    try {
      logger.warn("Executing emergency withdrawal...");
      
      const positionData = position.getData();
      const txIds: string[] = [];
      
      // Remove all liquidity
      if (positionData.liquidity.gt(new BN(0))) {
        const removeTx = await this.removeLiquidity(position, positionData.liquidity);
        txIds.push(removeTx);
      }
      
      // Collect fees
      const feeTx = await position.collectFees();
      txIds.push(await this.whirlpoolClient.getContext().connection.sendTransaction(feeTx));
      
      // Close position
      const closeTx = await position.close();
      txIds.push(await this.whirlpoolClient.getContext().connection.sendTransaction(closeTx));
      
      logger.info("Emergency withdrawal completed");
      return txIds;
      
    } catch (error) {
      logger.error("Error during emergency withdrawal:", error);
      throw error;
    }
  }
}