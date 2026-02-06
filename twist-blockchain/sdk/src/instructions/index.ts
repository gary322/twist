import { PublicKey, TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';

// ========== Types ==========

export interface InitializeParams {
  decayRateBps: number;
  treasurySplitBps: number;
  initialFloorPrice: number;
  pythPriceFeed: PublicKey;
  switchboardFeed: PublicKey;
  chainlinkFeed?: PublicKey;
  maxDailyBuyback: number;
  mint?: PublicKey;
}

export interface VestingParams {
  totalAmount: BN;
  startTimestamp: BN;
  cliffTimestamp: BN;
  endTimestamp: BN;
  revocable: boolean;
}

export interface UpdateParametersParams {
  decayRateBps?: number;
  treasurySplitBps?: number;
  buybackEnabled?: boolean;
  maxDailyBuyback?: number;
  emergencyPause?: boolean;
}

// ========== Helper Functions ==========

async function getProgramState(program: Program): Promise<PublicKey> {
  const [programState] = await PublicKey.findProgramAddress(
    [Buffer.from('program_state')],
    program.programId
  );
  return programState;
}

async function getMintAddress(program: Program): Promise<PublicKey> {
  const [mintAddress] = await PublicKey.findProgramAddress(
    [Buffer.from('twist_mint')],
    program.programId
  );
  return mintAddress;
}

async function getStakeState(program: Program, owner: PublicKey): Promise<PublicKey> {
  const [stakeState] = await PublicKey.findProgramAddress(
    [Buffer.from('stake_state'), owner.toBuffer()],
    program.programId
  );
  return stakeState;
}

async function getStakeVault(program: Program): Promise<PublicKey> {
  const [stakeVault] = await PublicKey.findProgramAddress(
    [Buffer.from('stake_vault')],
    program.programId
  );
  return stakeVault;
}

// ========== Instructions ==========

export async function createInitializeInstruction(
  program: Program,
  params: InitializeParams,
  authority: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  
  const [floorTreasury] = await PublicKey.findProgramAddress(
    [Buffer.from('floor_treasury')],
    program.programId
  );
  
  const [opsTreasury] = await PublicKey.findProgramAddress(
    [Buffer.from('ops_treasury')],
    program.programId
  );
  
  const stakeVault = await getStakeVault(program);
  
  return await program.methods
    .initialize({
      decayRateBps: params.decayRateBps,
      treasurySplitBps: params.treasurySplitBps,
      initialFloorPrice: new BN(params.initialFloorPrice * 1e6),
      pythPriceFeed: params.pythPriceFeed,
      switchboardFeed: params.switchboardFeed,
      chainlinkFeed: params.chainlinkFeed || null,
      maxDailyBuyback: new BN(params.maxDailyBuyback * 1e6),
    })
    .accounts({
      authority,
      programState,
      mint: params.mint || (await getMintAddress(program)), // Use provided mint or derive from program
      floorTreasury,
      opsTreasury,
      stakeVault,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}

export async function createStakeInstruction(
  program: Program,
  amount: BN,
  lockPeriod: BN,
  owner: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  const stakeState = await getStakeState(program, owner);
  const stakeVault = await getStakeVault(program);
  
  const state = await program.account.programState.fetch(programState);
  const ownerTokenAccount = await getAssociatedTokenAddress(
    state.mint as PublicKey,
    owner
  );
  
  return await program.methods
    .stake(amount, lockPeriod)
    .accounts({
      owner,
      programState,
      stakeState,
      ownerTokenAccount,
      stakeVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function createUnstakeInstruction(
  program: Program,
  stakeIndex: number,
  owner: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  const stakeState = await getStakeState(program, owner);
  const stakeVault = await getStakeVault(program);
  
  const state = await program.account.programState.fetch(programState);
  const ownerTokenAccount = await getAssociatedTokenAddress(
    state.mint as PublicKey,
    owner
  );
  
  return await program.methods
    .unstake(new BN(stakeIndex))
    .accounts({
      owner,
      programState,
      stakeState,
      stakeVault,
      ownerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
}

export async function createClaimRewardsInstruction(
  program: Program,
  owner: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  const stakeState = await getStakeState(program, owner);
  const stakeVault = await getStakeVault(program);
  
  const state = await program.account.programState.fetch(programState);
  const ownerTokenAccount = await getAssociatedTokenAddress(
    state.mint as PublicKey,
    owner
  );
  
  return await program.methods
    .claimRewards()
    .accounts({
      owner,
      programState,
      stakeState,
      stakeVault,
      ownerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
}

export async function createApplyDecayInstruction(
  program: Program,
  caller: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  const state = await program.account.programState.fetch(programState);
  
  return await program.methods
    .applyDecay()
    .accounts({
      caller,
      programState,
      mint: state.mint as PublicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
}

export async function createExecuteBuybackInstruction(
  program: Program,
  usdcAmount: BN,
  authority: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  const state = await program.account.programState.fetch(programState);
  
  const [floorTreasury] = await PublicKey.findProgramAddress(
    [Buffer.from('floor_treasury')],
    program.programId
  );
  
  // Would need actual oracle accounts
  const pythPriceAccount = state.pythPriceFeed as PublicKey;
  const switchboardFeed = state.switchboardFeed as PublicKey;
  
  return await program.methods
    .executeBuyback(usdcAmount)
    .accounts({
      authority,
      programState,
      floorTreasury,
      pythPriceAccount,
      switchboardFeed,
      // Orca accounts would go here
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
}

export async function createVestingScheduleInstruction(
  program: Program,
  params: VestingParams,
  beneficiary: PublicKey,
  authority: PublicKey
): Promise<TransactionInstruction> {
  const [vestingSchedule] = await PublicKey.findProgramAddress(
    [Buffer.from('vesting'), beneficiary.toBuffer(), authority.toBuffer()],
    program.programId
  );
  
  const [vestingVault] = await PublicKey.findProgramAddress(
    [Buffer.from('vesting_vault'), vestingSchedule.toBuffer()],
    program.programId
  );
  
  const programState = await getProgramState(program);
  const state = await program.account.programState.fetch(programState);
  
  const sourceTokenAccount = await getAssociatedTokenAddress(
    state.mint as PublicKey,
    authority
  );
  
  return await program.methods
    .createVestingSchedule(params)
    .accounts({
      authority,
      beneficiary,
      vestingSchedule,
      sourceTokenAccount,
      vestingVault,
      mint: state.mint as PublicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function createClaimVestedInstruction(
  program: Program,
  authority: PublicKey,
  beneficiary: PublicKey
): Promise<TransactionInstruction> {
  const [vestingSchedule] = await PublicKey.findProgramAddress(
    [Buffer.from('vesting'), beneficiary.toBuffer(), authority.toBuffer()],
    program.programId
  );
  
  const [vestingVault] = await PublicKey.findProgramAddress(
    [Buffer.from('vesting_vault'), vestingSchedule.toBuffer()],
    program.programId
  );
  
  const programState = await getProgramState(program);
  const state = await program.account.programState.fetch(programState);
  
  const beneficiaryTokenAccount = await getAssociatedTokenAddress(
    state.mint as PublicKey,
    beneficiary
  );
  
  return await program.methods
    .claimVested()
    .accounts({
      beneficiary,
      vestingSchedule,
      vestingVault,
      beneficiaryTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
}

export async function createBridgeTokensInstruction(
  program: Program,
  amount: BN,
  targetChain: number,
  targetAddress: number[],
  owner: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  const state = await program.account.programState.fetch(programState);
  
  const [bridgeEscrow] = await PublicKey.findProgramAddress(
    [Buffer.from('bridge_escrow')],
    program.programId
  );
  
  const ownerTokenAccount = await getAssociatedTokenAddress(
    state.mint as PublicKey,
    owner
  );
  
  return await program.methods
    .initiateBridgeTransfer(amount, targetChain, targetAddress)
    .accounts({
      user: owner,
      userTokenAccount: ownerTokenAccount,
      bridgeEscrow,
      // Wormhole accounts would go here
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function createUpdateParametersInstruction(
  program: Program,
  params: UpdateParametersParams,
  authority: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  
  return await program.methods
    .updateParameters({
      decayRateBps: params.decayRateBps || null,
      treasurySplitBps: params.treasurySplitBps || null,
      buybackEnabled: params.buybackEnabled || null,
      maxDailyBuyback: params.maxDailyBuyback ? new BN(params.maxDailyBuyback * 1e6) : null,
      emergencyPause: params.emergencyPause || null,
    })
    .accounts({
      authority,
      programState,
    })
    .instruction();
}

export async function createEmergencyPauseInstruction(
  program: Program,
  authority: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  
  return await program.methods
    .emergencyPause()
    .accounts({
      authority,
      programState,
    })
    .instruction();
}

export async function createUnpauseInstruction(
  program: Program,
  authority: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  
  return await program.methods
    .unpause()
    .accounts({
      authority,
      programState,
    })
    .instruction();
}

export async function createTransferAuthorityInstruction(
  program: Program,
  newAuthority: PublicKey,
  currentAuthority: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  
  return await program.methods
    .transferAuthority(newAuthority)
    .accounts({
      currentAuthority,
      newAuthority,
      programState,
    })
    .instruction();
}

export async function createTriggerCircuitBreakerInstruction(
  program: Program,
  reason: string,
  authority: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  
  const [circuitBreaker] = await PublicKey.findProgramAddress(
    [Buffer.from('circuit_breaker')],
    program.programId
  );
  
  return await program.methods
    .triggerCircuitBreaker(reason)
    .accounts({
      authority,
      programState,
      circuitBreaker,
    })
    .instruction();
}

export async function createResetCircuitBreakerInstruction(
  program: Program,
  authority: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  
  const [circuitBreaker] = await PublicKey.findProgramAddress(
    [Buffer.from('circuit_breaker')],
    program.programId
  );
  
  return await program.methods
    .resetCircuitBreaker()
    .accounts({
      authority,
      programState,
      circuitBreaker,
    })
    .instruction();
}

export interface MultisigProposalParams {
  instruction: Buffer;
  programId: PublicKey;
  accounts: PublicKey[];
  title: string;
  description: string;
  executionDelay?: BN;
}

export async function createProposeMultisigInstruction(
  program: Program,
  params: MultisigProposalParams,
  proposer: PublicKey
): Promise<TransactionInstruction> {
  const programState = await getProgramState(program);
  
  const [multisigConfig] = await PublicKey.findProgramAddress(
    [Buffer.from('multisig')],
    program.programId
  );
  
  const state = await program.account.programState.fetch(programState);
  const multisig = await program.account.multisigConfig.fetch(multisigConfig);
  
  const [transaction] = await PublicKey.findProgramAddress(
    [Buffer.from('transaction'), (multisig.transactionCount as BN).toBuffer('le', 8)],
    program.programId
  );
  
  return await program.methods
    .proposeTransaction(
      params.instruction,
      params.programId,
      params.accounts,
      params.title,
      params.description,
      params.executionDelay || new BN(0)
    )
    .accounts({
      proposer,
      multisigConfig,
      transaction,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function createApproveMultisigInstruction(
  program: Program,
  transactionId: BN,
  approver: PublicKey
): Promise<TransactionInstruction> {
  const [multisigConfig] = await PublicKey.findProgramAddress(
    [Buffer.from('multisig')],
    program.programId
  );
  
  const [transaction] = await PublicKey.findProgramAddress(
    [Buffer.from('transaction'), transactionId.toBuffer('le', 8)],
    program.programId
  );
  
  return await program.methods
    .approveTransaction()
    .accounts({
      approver,
      multisigConfig,
      transaction,
    })
    .instruction();
}

export async function createExecuteMultisigInstruction(
  program: Program,
  transactionId: BN,
  executor: PublicKey
): Promise<TransactionInstruction> {
  const [multisigConfig] = await PublicKey.findProgramAddress(
    [Buffer.from('multisig')],
    program.programId
  );
  
  const [transaction] = await PublicKey.findProgramAddress(
    [Buffer.from('transaction'), transactionId.toBuffer('le', 8)],
    program.programId
  );
  
  return await program.methods
    .executeTransaction()
    .accounts({
      executor,
      multisigConfig,
      transaction,
    })
    .instruction();
}