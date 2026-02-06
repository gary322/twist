import { Connection, PublicKey, Transaction, TransactionSignature } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN, Idl } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import * as instructions from './instructions';
import * as accounts from './accounts';
import { TWIST_PROGRAM_ID } from './constants';
import { toDecimalAmount, toBNAmount } from './utils';
import IDL from '../idl/twist_token.json';

export interface TwistClientConfig {
  connection: Connection;
  wallet: Wallet;
  programId?: PublicKey;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export class TwistClient {
  public program: Program;
  public provider: AnchorProvider;
  
  constructor(config: TwistClientConfig) {
    this.provider = new AnchorProvider(
      config.connection,
      config.wallet,
      { commitment: config.commitment || 'confirmed' }
    );
    
    const programId = config.programId || TWIST_PROGRAM_ID;
    this.program = new Program(
      IDL as Idl,
      programId,
      this.provider
    );
  }
  
  // ========== Read Methods ==========
  
  async getProgramState(): Promise<accounts.ProgramState> {
    const [programState] = await PublicKey.findProgramAddress(
      [Buffer.from('program_state')],
      this.program.programId
    );
    
    const state = await this.program.account['programState'].fetch(programState);
    return accounts.parseProgramState(state);
  }
  
  async getStakeState(owner: PublicKey): Promise<accounts.StakeState | null> {
    const [stakeState] = await PublicKey.findProgramAddress(
      [Buffer.from('stake_state'), owner.toBuffer()],
      this.program.programId
    );
    
    try {
      const state = await this.program.account['stakeState'].fetch(stakeState);
      return accounts.parseStakeState(state);
    } catch {
      return null;
    }
  }
  
  async getVestingSchedule(
    beneficiary: PublicKey,
    authority: PublicKey
  ): Promise<accounts.VestingSchedule | null> {
    const [vestingSchedule] = await PublicKey.findProgramAddress(
      [Buffer.from('vesting'), beneficiary.toBuffer(), authority.toBuffer()],
      this.program.programId
    );
    
    try {
      const schedule = await this.program.account['vestingSchedule'].fetch(vestingSchedule);
      return accounts.parseVestingSchedule(schedule);
    } catch {
      return null;
    }
  }
  
  async getCurrentPrice(): Promise<number> {
    const state = await this.getProgramState();
    return state.lastOraclePrice;
  }
  
  async getFloorPrice(): Promise<number> {
    const state = await this.getProgramState();
    return state.floorPrice;
  }
  
  async getTokenMetrics(): Promise<{
    price: number;
    floorPrice: number;
    totalSupply: BN;
    circulatingSupply: BN;
    stakedSupply: BN;
    volume24h: number;
    marketCap: number;
  }> {
    const state = await this.getProgramState();
    const mintInfo = await this.provider.connection.getParsedAccountInfo(state.mint);
    
    let totalSupply = new BN(0);
    if (mintInfo.value && 'parsed' in mintInfo.value.data) {
      totalSupply = new BN(mintInfo.value.data.parsed.info.supply);
    }
    
    const stakedSupply = state.totalStaked;
    const circulatingSupply = totalSupply.sub(stakedSupply);
    const marketCap = toDecimalAmount(circulatingSupply) * state.lastOraclePrice;
    
    return {
      price: state.lastOraclePrice,
      floorPrice: state.floorPrice,
      totalSupply,
      circulatingSupply,
      stakedSupply,
      volume24h: state.volume24h,
      marketCap,
    };
  }
  
  // ========== Write Methods ==========
  
  async initialize(params: instructions.InitializeParams): Promise<TransactionSignature> {
    const ix = await instructions.createInitializeInstruction(
      this.program,
      params,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async stake(
    amount: number,
    lockPeriodDays: number
  ): Promise<TransactionSignature> {
    const amountBN = toBNAmount(amount);
    const lockPeriod = new BN(lockPeriodDays * 86400); // Convert to seconds
    
    const ix = await instructions.createStakeInstruction(
      this.program,
      amountBN,
      lockPeriod,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async unstake(
    stakeIndex: number
  ): Promise<TransactionSignature> {
    const ix = await instructions.createUnstakeInstruction(
      this.program,
      stakeIndex,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async claimRewards(): Promise<TransactionSignature> {
    const ix = await instructions.createClaimRewardsInstruction(
      this.program,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async applyDecay(): Promise<TransactionSignature> {
    const ix = await instructions.createApplyDecayInstruction(
      this.program,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async executeBuyback(
    usdcAmount: number
  ): Promise<TransactionSignature> {
    const amountBN = new BN(usdcAmount * 1e6); // USDC has 6 decimals
    
    const ix = await instructions.createExecuteBuybackInstruction(
      this.program,
      amountBN,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async createVestingSchedule(
    params: instructions.VestingParams,
    beneficiary: PublicKey
  ): Promise<TransactionSignature> {
    const ix = await instructions.createVestingScheduleInstruction(
      this.program,
      params,
      beneficiary,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async claimVested(
    authority: PublicKey
  ): Promise<TransactionSignature> {
    const ix = await instructions.createClaimVestedInstruction(
      this.program,
      authority,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async bridgeTokens(
    amount: number,
    targetChain: number,
    targetAddress: string
  ): Promise<TransactionSignature> {
    const amountBN = toBNAmount(amount);
    const targetAddressBytes = Buffer.from(targetAddress.replace('0x', ''), 'hex');
    
    const ix = await instructions.createBridgeTokensInstruction(
      this.program,
      amountBN,
      targetChain,
      Array.from(targetAddressBytes),
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  // ========== Admin Methods ==========
  
  async updateParameters(
    params: Partial<instructions.UpdateParametersParams>
  ): Promise<TransactionSignature> {
    const ix = await instructions.createUpdateParametersInstruction(
      this.program,
      params,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async emergencyPause(): Promise<TransactionSignature> {
    const ix = await instructions.createEmergencyPauseInstruction(
      this.program,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async unpause(): Promise<TransactionSignature> {
    const ix = await instructions.createUnpauseInstruction(
      this.program,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async transferAuthority(
    newAuthority: PublicKey
  ): Promise<TransactionSignature> {
    const ix = await instructions.createTransferAuthorityInstruction(
      this.program,
      newAuthority,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  // ========== Utility Methods ==========
  
  async getAssociatedTokenAddress(
    owner: PublicKey,
    mint?: PublicKey
  ): Promise<PublicKey> {
    const state = await this.getProgramState();
    const tokenMint = mint || state.mint;
    
    return await getAssociatedTokenAddress(
      tokenMint,
      owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }
  
  async getUserBalance(owner: PublicKey): Promise<number> {
    const ata = await this.getAssociatedTokenAddress(owner);
    
    try {
      const accountInfo = await this.provider.connection.getParsedAccountInfo(ata);
      if (accountInfo.value && 'parsed' in accountInfo.value.data) {
        const balance = accountInfo.value.data.parsed.info.tokenAmount.amount;
        return toDecimalAmount(new BN(balance));
      }
    } catch {
      // Account doesn't exist
    }
    
    return 0;
  }
  
  async estimateStakeRewards(
    amount: number,
    lockPeriodDays: number
  ): Promise<{
    apy: number;
    totalRewards: number;
    dailyRewards: number;
  }> {
    const apyBps = this.getAPYForLockPeriod(lockPeriodDays);
    const apy = apyBps / 100;
    
    // Account for decay in rewards calculation
    const dailyDecay = 0.005; // 0.5%
    const effectiveAPY = apy - (dailyDecay * 365);
    
    const totalRewards = amount * (effectiveAPY / 100) * (lockPeriodDays / 365);
    const dailyRewards = totalRewards / lockPeriodDays;
    
    return {
      apy: effectiveAPY,
      totalRewards,
      dailyRewards,
    };
  }
  
  private getAPYForLockPeriod(days: number): number {
    if (days >= 365) return 6700; // 67%
    if (days >= 180) return 3500; // 35%
    if (days >= 90) return 2000;  // 20%
    return 1000; // 10%
  }
  
  // ========== Circuit Breaker & Safety ==========
  
  async checkCircuitBreaker(): Promise<{
    active: boolean;
    reason?: string;
    autoResetTime?: number;
  }> {
    const state = await this.getProgramState();
    
    return {
      active: state.circuitBreakerActive,
      reason: state.circuitBreakerActive ? 'Manual trigger or automatic protection' : undefined,
      autoResetTime: state.circuitBreakerActive ? Date.now() + 3600000 : undefined, // 1 hour
    };
  }
  
  async triggerCircuitBreaker(
    reason: string
  ): Promise<TransactionSignature> {
    const ix = await instructions.createTriggerCircuitBreakerInstruction(
      this.program,
      reason,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async resetCircuitBreaker(): Promise<TransactionSignature> {
    const ix = await instructions.createResetCircuitBreakerInstruction(
      this.program,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  // ========== Multi-sig Operations ==========
  
  async proposeMultisigTransaction(
    instruction: Buffer,
    description: string
  ): Promise<TransactionSignature> {
    const ix = await instructions.createProposeMultisigInstruction(
      this.program,
      instruction,
      description,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async approveMultisigTransaction(
    transactionId: BN
  ): Promise<TransactionSignature> {
    const ix = await instructions.createApproveMultisigInstruction(
      this.program,
      transactionId,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
  
  async executeMultisigTransaction(
    transactionId: BN
  ): Promise<TransactionSignature> {
    const ix = await instructions.createExecuteMultisigInstruction(
      this.program,
      transactionId,
      this.provider.wallet.publicKey
    );
    
    const tx = new Transaction().add(ix);
    return await this.provider.sendAndConfirm(tx);
  }
}