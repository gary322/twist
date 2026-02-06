import { WhirlpoolClient, Position, Whirlpool } from "@orca-so/whirlpools-sdk";
import { PublicKey, Connection } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";
import { logger } from "./logger";

export class PositionManager {
  private positions: Map<string, Position> = new Map();

  constructor(private whirlpoolClient: WhirlpoolClient) {}

  async getActivePositions(poolAddress: PublicKey): Promise<Position[]> {
    try {
      const whirlpool = await this.whirlpoolClient.getPool(poolAddress);
      const walletAddress = this.whirlpoolClient.getContext().wallet.publicKey;
      
      // Get position bundle if using bundled positions
      // Otherwise, enumerate individual positions
      const positions: Position[] = [];
      
      // This is a simplified version - in production, you'd query
      // the chain for all position token accounts owned by the wallet
      const positionMints = await this.getPositionMints(walletAddress);
      
      for (const mint of positionMints) {
        try {
          const position = await whirlpool.getPosition(mint);
          positions.push(position);
          this.positions.set(mint.toString(), position);
        } catch (error) {
          logger.warn(`Failed to fetch position ${mint.toString()}:`, error);
        }
      }
      
      return positions;
    } catch (error) {
      logger.error("Error fetching active positions:", error);
      throw error;
    }
  }

  async getTotalLiquidity(poolAddress: PublicKey): Promise<BN> {
    const positions = await this.getActivePositions(poolAddress);
    let totalLiquidity = new BN(0);
    
    for (const position of positions) {
      const data = position.getData();
      totalLiquidity = totalLiquidity.add(data.liquidity);
    }
    
    return totalLiquidity;
  }

  async openPosition(
    whirlpool: Whirlpool,
    lowerPrice: number,
    upperPrice: number,
    liquidityAmount: BN
  ): Promise<{ positionMint: PublicKey; txId: string }> {
    try {
      const poolData = whirlpool.getData();
      const walletAddress = this.whirlpoolClient.getContext().wallet.publicKey;
      
      // Convert prices to tick indices
      const lowerTick = this.priceToTickIndex(
        lowerPrice,
        poolData.tokenMintA.decimals,
        poolData.tokenMintB.decimals,
        poolData.tickSpacing
      );
      
      const upperTick = this.priceToTickIndex(
        upperPrice,
        poolData.tokenMintA.decimals,
        poolData.tokenMintB.decimals,
        poolData.tickSpacing
      );
      
      // Open position
      const { positionMint, tx } = await whirlpool.openPosition(
        lowerTick,
        upperTick,
        walletAddress
      );
      
      const openTxId = await this.whirlpoolClient.getContext().connection.sendTransaction(tx);
      
      // Add liquidity
      const position = await whirlpool.getPosition(positionMint);
      const quote = await position.getIncreaseLiquidityQuote({
        liquidity: liquidityAmount,
        slippageTolerance: { numerator: 1, denominator: 100 },
      });
      
      const increaseTx = await position.increaseLiquidity(quote);
      const increaseTxId = await this.whirlpoolClient.getContext().connection.sendTransaction(increaseTx);
      
      logger.info(`Opened new position ${positionMint.toString()} with liquidity ${liquidityAmount.toString()}`);
      
      return {
        positionMint,
        txId: increaseTxId,
      };
      
    } catch (error) {
      logger.error("Error opening position:", error);
      throw error;
    }
  }

  async collectAllFees(): Promise<{ totalFeesA: BN; totalFeesB: BN; txIds: string[] }> {
    const positions = Array.from(this.positions.values());
    let totalFeesA = new BN(0);
    let totalFeesB = new BN(0);
    const txIds: string[] = [];
    
    for (const position of positions) {
      try {
        const data = position.getData();
        
        if (data.feeOwedA.gt(new BN(0)) || data.feeOwedB.gt(new BN(0))) {
          const tx = await position.collectFees();
          const txId = await this.whirlpoolClient.getContext().connection.sendTransaction(tx);
          txIds.push(txId);
          
          totalFeesA = totalFeesA.add(data.feeOwedA);
          totalFeesB = totalFeesB.add(data.feeOwedB);
          
          logger.info(`Collected fees from position: A=${data.feeOwedA.toString()}, B=${data.feeOwedB.toString()}`);
        }
      } catch (error) {
        logger.error("Error collecting fees from position:", error);
      }
    }
    
    return { totalFeesA, totalFeesB, txIds };
  }

  private async getPositionMints(walletAddress: PublicKey): Promise<PublicKey[]> {
    // In production, this would query the chain for position NFTs
    // For now, return empty array or cached positions
    return Array.from(this.positions.keys()).map(key => new PublicKey(key));
  }

  private priceToTickIndex(
    price: number,
    decimalsA: number,
    decimalsB: number,
    tickSpacing: number
  ): number {
    // Simplified calculation - in production use SDK's PriceMath
    const tick = Math.log(price * Math.pow(10, decimalsA - decimalsB)) / Math.log(1.0001);
    return Math.round(tick / tickSpacing) * tickSpacing;
  }
}