import { Connection, PublicKey, ParsedTransactionWithMeta, ParsedInstruction } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';

export interface TradeDetails {
  trader: PublicKey;
  tokenA: string;
  tokenB: string;
  amountA: number;
  amountB: number;
  amountIn: number;
  amountOut: number;
  executionPrice: number;
  fee: number;
  dex: string;
}

export class TradeAnalyzer {
  constructor(
    private connection: Connection,
    private dexPrograms: Array<{
      name: string;
      programId: PublicKey;
      poolAddress?: PublicKey;
    }>
  ) {}
  
  async analyzeTransaction(
    tx: ParsedTransactionWithMeta,
    dex: any
  ): Promise<TradeDetails | null> {
    if (!tx.transaction || !tx.meta) {
      return null;
    }
    
    // Find the swap instruction
    const swapInstruction = this.findSwapInstruction(tx, dex.programId);
    if (!swapInstruction) {
      return null;
    }
    
    // Extract trade details based on DEX
    switch (dex.name) {
      case 'Orca':
        return this.analyzeOrcaSwap(tx, swapInstruction);
      case 'Raydium':
        return this.analyzeRaydiumSwap(tx, swapInstruction);
      default:
        return null;
    }
  }
  
  private findSwapInstruction(
    tx: ParsedTransactionWithMeta,
    programId: PublicKey
  ): ParsedInstruction | null {
    const instructions = tx.transaction.message.instructions;
    
    for (const ix of instructions) {
      if ('programId' in ix && ix.programId.equals(programId)) {
        // Check if this is a swap instruction
        if (this.isSwapInstruction(ix)) {
          return ix as ParsedInstruction;
        }
      }
    }
    
    // Also check inner instructions
    if (tx.meta?.innerInstructions) {
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          if ('programId' in ix && ix.programId.equals(programId)) {
            if (this.isSwapInstruction(ix)) {
              return ix as ParsedInstruction;
            }
          }
        }
      }
    }
    
    return null;
  }
  
  private isSwapInstruction(ix: any): boolean {
    // Check common swap instruction patterns
    if ('parsed' in ix) {
      const type = ix.parsed.type;
      return type === 'swap' || type === 'swapBaseIn' || type === 'swapBaseOut';
    }
    
    // For non-parsed instructions, check data
    if ('data' in ix) {
      // Check instruction discriminator (first 8 bytes typically)
      // This would need actual discriminators for each DEX
      return true; // Simplified for now
    }
    
    return false;
  }
  
  private async analyzeOrcaSwap(
    tx: ParsedTransactionWithMeta,
    swapIx: ParsedInstruction
  ): Promise<TradeDetails | null> {
    try {
      // Get pre and post token balances
      const preBalances = tx.meta!.preTokenBalances || [];
      const postBalances = tx.meta!.postTokenBalances || [];
      
      // Find the trader (fee payer)
      const trader = tx.transaction.message.accountKeys[0].pubkey;
      
      // Analyze balance changes
      const balanceChanges = this.calculateBalanceChanges(preBalances, postBalances, trader);
      
      if (balanceChanges.length < 2) {
        return null; // Not a valid swap
      }
      
      // Determine tokens and amounts
      const tokenIn = balanceChanges.find(c => c.change < 0);
      const tokenOut = balanceChanges.find(c => c.change > 0);
      
      if (!tokenIn || !tokenOut) {
        return null;
      }
      
      // Determine if TWIST is involved
      const twistMint = 'TWSTmintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // Would be actual mint
      const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mainnet
      
      let tokenA, tokenB, amountA, amountB;
      
      if (tokenIn.mint === twistMint || tokenOut.mint === twistMint) {
        // TWIST trade
        if (tokenIn.mint === twistMint) {
          tokenA = 'TWIST';
          tokenB = 'USDC';
          amountA = Math.abs(tokenIn.change);
          amountB = Math.abs(tokenOut.change);
        } else {
          tokenA = 'USDC';
          tokenB = 'TWIST';
          amountA = Math.abs(tokenIn.change);
          amountB = Math.abs(tokenOut.change);
        }
      } else {
        // Not a TWIST trade
        return null;
      }
      
      // Calculate execution price
      const executionPrice = tokenA === 'TWIST' ? amountB / amountA : amountA / amountB;
      
      // Estimate fee (Orca typically 0.3%)
      const fee = Math.abs(tokenIn.change) * 0.003;
      
      return {
        trader,
        tokenA,
        tokenB,
        amountA,
        amountB,
        amountIn: Math.abs(tokenIn.change),
        amountOut: Math.abs(tokenOut.change),
        executionPrice,
        fee,
        dex: 'Orca',
      };
    } catch (error) {
      console.error('Error analyzing Orca swap:', error);
      return null;
    }
  }
  
  private async analyzeRaydiumSwap(
    tx: ParsedTransactionWithMeta,
    swapIx: ParsedInstruction
  ): Promise<TradeDetails | null> {
    try {
      // Similar to Orca but with Raydium-specific logic
      // Raydium has different instruction format and fee structure
      
      const preBalances = tx.meta!.preTokenBalances || [];
      const postBalances = tx.meta!.postTokenBalances || [];
      
      const trader = tx.transaction.message.accountKeys[0].pubkey;
      const balanceChanges = this.calculateBalanceChanges(preBalances, postBalances, trader);
      
      if (balanceChanges.length < 2) {
        return null;
      }
      
      const tokenIn = balanceChanges.find(c => c.change < 0);
      const tokenOut = balanceChanges.find(c => c.change > 0);
      
      if (!tokenIn || !tokenOut) {
        return null;
      }
      
      // Similar token determination logic
      const twistMint = 'TWSTmintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      
      if (tokenIn.mint !== twistMint && tokenOut.mint !== twistMint) {
        return null; // Not a TWIST trade
      }
      
      // Calculate details
      const tokenA = tokenIn.mint === twistMint ? 'TWIST' : 'USDC';
      const tokenB = tokenA === 'TWIST' ? 'USDC' : 'TWIST';
      const amountA = Math.abs(tokenIn.change);
      const amountB = Math.abs(tokenOut.change);
      const executionPrice = tokenA === 'TWIST' ? amountB / amountA : amountA / amountB;
      const fee = Math.abs(tokenIn.change) * 0.0025; // Raydium 0.25% fee
      
      return {
        trader,
        tokenA,
        tokenB,
        amountA,
        amountB,
        amountIn: Math.abs(tokenIn.change),
        amountOut: Math.abs(tokenOut.change),
        executionPrice,
        fee,
        dex: 'Raydium',
      };
    } catch (error) {
      console.error('Error analyzing Raydium swap:', error);
      return null;
    }
  }
  
  private calculateBalanceChanges(
    preBalances: any[],
    postBalances: any[],
    trader: PublicKey
  ): Array<{ mint: string; change: number }> {
    const changes: Array<{ mint: string; change: number }> = [];
    
    // Map pre-balances by account
    const preMap = new Map<string, any>();
    preBalances.forEach(b => {
      const key = `${b.accountIndex}-${b.mint}`;
      preMap.set(key, b);
    });
    
    // Calculate changes
    postBalances.forEach(postBalance => {
      const key = `${postBalance.accountIndex}-${postBalance.mint}`;
      const preBalance = preMap.get(key);
      
      if (preBalance && postBalance.owner === trader.toBase58()) {
        const preAmount = parseFloat(preBalance.uiTokenAmount.uiAmount);
        const postAmount = parseFloat(postBalance.uiTokenAmount.uiAmount);
        const change = postAmount - preAmount;
        
        if (Math.abs(change) > 0.000001) { // Ignore dust
          changes.push({
            mint: postBalance.mint,
            change,
          });
        }
      }
    });
    
    return changes;
  }
  
  async identifyDexFromTransaction(tx: ParsedTransactionWithMeta): Promise<string | null> {
    if (!tx.transaction) return null;
    
    const instructions = tx.transaction.message.instructions;
    
    for (const dex of this.dexPrograms) {
      for (const ix of instructions) {
        if ('programId' in ix && ix.programId.equals(dex.programId)) {
          return dex.name;
        }
      }
    }
    
    return null;
  }
  
  async getTokenMetadata(mint: PublicKey): Promise<{
    symbol: string;
    decimals: number;
  }> {
    // In production, would fetch from token registry or on-chain metadata
    const knownTokens = new Map([
      ['TWSTmintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', { symbol: 'TWIST', decimals: 9 }],
      ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', { symbol: 'USDC', decimals: 6 }],
      ['So11111111111111111111111111111111111111112', { symbol: 'SOL', decimals: 9 }],
    ]);
    
    const mintStr = mint.toBase58();
    return knownTokens.get(mintStr) || { symbol: 'UNKNOWN', decimals: 9 };
  }
}