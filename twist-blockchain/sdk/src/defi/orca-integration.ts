import { PublicKey, Connection, Transaction, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  WhirlpoolClient,
  PDAUtil,
  PriceMath,
  increaseLiquidityQuoteByInputTokenWithParams,
  swapQuoteByInputToken,
  TickUtil,
  ORCA_WHIRLPOOL_PROGRAM_ID as WHIRLPOOL_PROGRAM,
  ORCA_WHIRLPOOLS_CONFIG,
} from "@orca-so/whirlpools-sdk";
import {
  Percentage,
  DecimalUtil,
  MathUtil,
} from "@orca-so/common-sdk";
import Decimal from "decimal.js";

export const ORCA_WHIRLPOOL_PROGRAM_ID = WHIRLPOOL_PROGRAM;
export const WHIRLPOOLS_CONFIG_ADDRESS = ORCA_WHIRLPOOLS_CONFIG;

export interface PoolInitParams {
  tokenMintA: PublicKey;
  tokenMintB: PublicKey;
  tickSpacing: number;
  initialPrice: number;
  feeRate: number;
}

export interface LiquidityParams {
  poolAddress: PublicKey;
  lowerPrice: number;
  upperPrice: number;
  twistAmount: BN;
  usdcAmount: BN;
  slippageTolerance: number;
}

export interface SwapParams {
  inputToken: "TWIST" | "USDC";
  inputAmount: BN;
  minOutputAmount: BN;
  priceLimit?: number;
}

export class OrcaLiquidityManager {
  private _connection: Connection;
  private _wallet: Wallet;
  private _whirlpoolPubkey: PublicKey;
  private _client: WhirlpoolClient;
  private _ctx: WhirlpoolContext;

  constructor(
    connection: Connection,
    wallet: Wallet,
    whirlpoolAddress: string
  ) {
    this._connection = connection;
    this._wallet = wallet;
    this._whirlpoolPubkey = new PublicKey(whirlpoolAddress);
    
    this._ctx = WhirlpoolContext.from(
      connection,
      wallet,
      WHIRLPOOL_PROGRAM
    );
    this._client = buildWhirlpoolClient(this._ctx);
  }

  async initializePool(params: PoolInitParams): Promise<{ poolAddress: PublicKey; txId: string }> {
    try {
      // Get token order (smaller pubkey is tokenA)
      const [tokenA, tokenB] = TickUtil.getFullRangeTickIndex(params.tickSpacing);
      const tokenMintA = params.tokenMintA.toBase58() < params.tokenMintB.toBase58() 
        ? params.tokenMintA 
        : params.tokenMintB;
      const tokenMintB = params.tokenMintA.toBase58() < params.tokenMintB.toBase58() 
        ? params.tokenMintB 
        : params.tokenMintA;

      // Derive whirlpool PDA
      const whirlpoolPda = PDAUtil.getWhirlpool(
        WHIRLPOOL_PROGRAM,
        WHIRLPOOLS_CONFIG_ADDRESS,
        tokenMintA,
        tokenMintB,
        params.tickSpacing
      );

      // Calculate initial sqrt price
      const price = params.tokenMintA.equals(tokenMintA) 
        ? params.initialPrice 
        : 1 / params.initialPrice;
      const sqrtPrice = PriceMath.priceToSqrtPriceX64(
        new Decimal(price),
        6, // USDC decimals
        9  // TWIST decimals
      );

      // Create initialize pool instruction
      const initPoolIx = await this._client.createInitializePoolInstruction({
        tickSpacing: params.tickSpacing,
        tokenMintA,
        tokenMintB,
        funder: this._wallet.publicKey,
        initialSqrtPrice: sqrtPrice,
        feeRate: params.feeRate,
      });

      // Build and send transaction
      const tx = new Transaction().add(initPoolIx);
      const txId = await this._ctx.sendTransaction(tx);

      return {
        poolAddress: whirlpoolPda.publicKey,
        txId,
      };
    } catch (error) {
      console.error("Error initializing pool:", error);
      throw error;
    }
  }

  async addConcentratedLiquidity(params: LiquidityParams): Promise<{
    positionMint: PublicKey;
    liquidity: BN;
    txId: string;
  }> {
    try {
      const whirlpool = await this._client.getPool(params.poolAddress);
      const whirlpoolData = whirlpool.getData();

      // Convert prices to ticks
      const lowerTick = PriceMath.priceToInitializableTickIndex(
        new Decimal(params.lowerPrice),
        whirlpoolData.tokenMintA.decimals,
        whirlpoolData.tokenMintB.decimals,
        whirlpoolData.tickSpacing
      );

      const upperTick = PriceMath.priceToInitializableTickIndex(
        new Decimal(params.upperPrice),
        whirlpoolData.tokenMintA.decimals,
        whirlpoolData.tokenMintB.decimals,
        whirlpoolData.tickSpacing
      );

      // Create position mint
      const positionMintKeypair = Keypair.generate();

      // Open position
      const openPositionIx = await whirlpool.openPosition(
        lowerTick,
        upperTick,
        positionMintKeypair.publicKey
      );

      // Calculate liquidity quote
      const quote = increaseLiquidityQuoteByInputTokenWithParams({
        tokenMintA: whirlpoolData.tokenMintA.address,
        tokenMintB: whirlpoolData.tokenMintB.address,
        sqrtPrice: whirlpoolData.sqrtPrice,
        tickCurrentIndex: whirlpoolData.tickCurrentIndex,
        tickLowerIndex: lowerTick,
        tickUpperIndex: upperTick,
        inputTokenMint: whirlpoolData.tokenMintA.address, // TWIST
        inputTokenAmount: params.twistAmount,
        slippageTolerance: Percentage.fromFraction(params.slippageTolerance * 100, 10000),
      });

      // Get position
      const positionAddress = PDAUtil.getPosition(
        WHIRLPOOL_PROGRAM,
        positionMintKeypair.publicKey
      ).publicKey;
      const position = await this._client.getPosition(positionAddress);

      // Increase liquidity
      const increaseLiquidityIx = await position.increaseLiquidity({
        liquidityAmount: quote.liquidityAmount,
        tokenMaxA: quote.tokenMaxA,
        tokenMaxB: quote.tokenMaxB,
      });

      // Build and send transaction
      const tx = new Transaction()
        .add(openPositionIx.instructions[0])
        .add(increaseLiquidityIx);

      const txId = await this._ctx.sendTransaction(tx, [positionMintKeypair]);

      return {
        positionMint: positionMintKeypair.publicKey,
        liquidity: new BN(quote.liquidityAmount.toString()),
        txId,
      };
    } catch (error) {
      console.error("Error adding liquidity:", error);
      throw error;
    }
  }

  async rebalancePosition(params: {
    positionMint: PublicKey;
    newLowerPrice: number;
    newUpperPrice: number;
  }): Promise<{
    newPositionMint: PublicKey;
    txIds: string[];
  }> {
    try {
      const txIds: string[] = [];

      // Get position
      const positionAddress = PDAUtil.getPosition(
        WHIRLPOOL_PROGRAM,
        params.positionMint
      ).publicKey;
      const position = await this._client.getPosition(positionAddress);
      const positionData = position.getData();

      // Get whirlpool
      const whirlpool = await this._client.getPool(positionData.whirlpool);
      const whirlpoolData = whirlpool.getData();

      // Close current position
      const decreaseLiquidityIx = await position.decreaseLiquidity({
        liquidityAmount: positionData.liquidity,
        tokenMinA: new BN(0),
        tokenMinB: new BN(0),
      });

      const collectFeesIx = await position.collectFees();
      const collectRewardsIx = await position.collectRewards();
      const closePositionIx = await position.close();

      const closeTx = new Transaction()
        .add(decreaseLiquidityIx)
        .add(collectFeesIx)
        .add(...collectRewardsIx);
      
      if (closePositionIx) {
        closeTx.add(closePositionIx);
      }

      const closeTxId = await this._ctx.sendTransaction(closeTx);
      txIds.push(closeTxId);

      // Open new position with updated range
      const newPositionMintKeypair = Keypair.generate();

      const lowerTick = PriceMath.priceToInitializableTickIndex(
        new Decimal(params.newLowerPrice),
        whirlpoolData.tokenMintA.decimals,
        whirlpoolData.tokenMintB.decimals,
        whirlpoolData.tickSpacing
      );

      const upperTick = PriceMath.priceToInitializableTickIndex(
        new Decimal(params.newUpperPrice),
        whirlpoolData.tokenMintA.decimals,
        whirlpoolData.tokenMintB.decimals,
        whirlpoolData.tickSpacing
      );

      const openPositionIx = await whirlpool.openPosition(
        lowerTick,
        upperTick,
        newPositionMintKeypair.publicKey
      );

      const openTx = new Transaction().add(openPositionIx.instructions[0]);
      const openTxId = await this._ctx.sendTransaction(openTx, [newPositionMintKeypair]);
      txIds.push(openTxId);

      return {
        newPositionMint: newPositionMintKeypair.publicKey,
        txIds,
      };
    } catch (error) {
      console.error("Error rebalancing position:", error);
      throw error;
    }
  }

  async executeSwap(params: SwapParams): Promise<{
    outputAmount: BN;
    priceImpact: number;
    txId: string;
  }> {
    try {
      const whirlpool = await this._client.getPool(this._whirlpoolPubkey);
      const whirlpoolData = whirlpool.getData();

      // Determine input/output tokens
      const aToB = params.inputToken === "TWIST";
      const inputMint = aToB ? whirlpoolData.tokenMintA : whirlpoolData.tokenMintB;

      // Get swap quote
      const quote = await swapQuoteByInputToken(
        whirlpool,
        inputMint.address,
        params.inputAmount,
        Percentage.fromFraction(1, 100), // 1% slippage
        WHIRLPOOL_PROGRAM,
        this._ctx.fetcher,
        true // refresh
      );

      // Calculate price impact
      const priceImpact = quote.estimatedEndSqrtPrice
        .sub(quote.estimatedStartSqrtPrice)
        .div(quote.estimatedStartSqrtPrice)
        .mul(new BN(10000))
        .toNumber() / 10000;

      // Build swap instruction
      const swapIx = await whirlpool.swap({
        amount: quote.amount,
        otherAmountThreshold: quote.otherAmountThreshold,
        sqrtPriceLimit: quote.sqrtPriceLimit,
        amountSpecifiedIsInput: true,
        aToB: quote.aToB,
      });

      // Send transaction
      const tx = new Transaction().add(swapIx);
      const txId = await this._ctx.sendTransaction(tx);

      return {
        outputAmount: quote.estimatedAmountOut,
        priceImpact: Math.abs(priceImpact),
        txId,
      };
    } catch (error) {
      console.error("Error executing swap:", error);
      throw error;
    }
  }

  async getPoolInfo(): Promise<{
    price: number;
    liquidity: BN;
    volume24h: BN;
    fee24h: BN;
  }> {
    try {
      const whirlpool = await this._client.getPool(this._whirlpoolPubkey);
      const whirlpoolData = whirlpool.getData();

      // Calculate current price
      const price = PriceMath.sqrtPriceX64ToPrice(
        whirlpoolData.sqrtPrice,
        whirlpoolData.tokenMintA.decimals,
        whirlpoolData.tokenMintB.decimals
      );

      // Get 24h volume and fees
      // Note: This would typically come from an indexer or analytics service
      // For now, we'll calculate based on current liquidity and fee rate
      const estimatedDailyVolume = whirlpoolData.liquidity
        .mul(new BN(2)) // Rough estimate: 2x liquidity as daily volume
        .div(new BN(1000000));

      const estimatedDailyFees = estimatedDailyVolume
        .mul(new BN(whirlpoolData.feeRate))
        .div(new BN(1000000)); // Fee rate is in hundredths of a basis point

      return {
        price: price.toNumber(),
        liquidity: whirlpoolData.liquidity,
        volume24h: estimatedDailyVolume,
        fee24h: estimatedDailyFees,
      };
    } catch (error) {
      console.error("Error getting pool info:", error);
      throw error;
    }
  }
}