import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
} from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@project-serum/anchor';
import { IDL } from '../programs/twist_staking';
import { RedisService } from './redis.service';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

@Injectable()
export class SolanaService {
  private readonly logger = new Logger(SolanaService.name);
  private connection: Connection;
  private program: Program | null = null;
  private provider: AnchorProvider | null = null;

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    void this.initializeConnection();
  }

  private async initializeConnection() {
    const rpcUrl =
      this.configService.get<string>('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');

    const programId = this.configService.get<string>('STAKING_PROGRAM_ID');
    const privateKey = this.configService.get<string>('WALLET_PRIVATE_KEY');
    if (!programId || !privateKey) {
      this.logger.warn(
        'Solana program not configured (missing STAKING_PROGRAM_ID and/or WALLET_PRIVATE_KEY)',
      );
      this.program = null;
      this.provider = null;
      return;
    }

    try {
      // Initialize Anchor provider
      const wallet = this.loadWallet();
      this.provider = new AnchorProvider(this.connection, wallet, { commitment: 'confirmed' });
      this.program = new Program(IDL, new PublicKey(programId), this.provider);
      this.logger.log('Solana program initialized');
    } catch (err) {
      this.logger.error(
        `Failed to initialize Solana program: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.program = null;
      this.provider = null;
    }
  }

  private loadWallet(): any {
    const privateKey = this.configService.get<string>('WALLET_PRIVATE_KEY') || '';
    const secretKey = Uint8Array.from(JSON.parse(privateKey));
    const keypair = Keypair.fromSecretKey(secretKey);
    
    return {
      publicKey: keypair.publicKey,
      signTransaction: async (tx: Transaction) => {
        tx.partialSign(keypair);
        return tx;
      },
      signAllTransactions: async (txs: Transaction[]) => {
        txs.forEach(tx => tx.partialSign(keypair));
        return txs;
      },
    };
  }

  async createStakingPool(params: {
    influencer: PublicKey;
    revenueShareBps: number;
    minStake: number | bigint;
  }): Promise<PublicKey> {
    try {
      if (!this.program || !this.provider) {
        throw new Error('Solana staking program is not configured');
      }

      // Generate pool PDA
      const [poolPda] = await PublicKey.findProgramAddress(
        [
          Buffer.from('staking_pool'),
          params.influencer.toBuffer(),
        ],
        this.program.programId,
      );

      // Create the staking pool on-chain
      const tx = await this.program.methods
        .createPool(
          params.influencer,
          new BN(params.revenueShareBps),
          new BN(params.minStake.toString()),
        )
        .accounts({
          pool: poolPda,
          authority: this.provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Cache pool data
      await this.redisService.set(
        `pool:${params.influencer.toString()}`,
        JSON.stringify({
          address: poolPda.toString(),
          revenueShareBps: params.revenueShareBps,
          minStake: params.minStake.toString(),
          createdAt: new Date().toISOString(),
          transactionId: tx,
        }),
        3600 // 1 hour cache
      );

      this.logger.log(`Created staking pool: ${poolPda.toString()}`);
      return poolPda;
    } catch (error) {
      this.logger.error(`Failed to create staking pool: ${error.message}`);
      throw error;
    }
  }

  async getPoolData(poolAddress: string): Promise<any> {
    try {
      if (!this.program) {
        throw new Error('Solana staking program is not configured');
      }

      // Check cache first
      const cached = await this.redisService.get(`pool:data:${poolAddress}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Fetch from blockchain
      const poolPubkey = new PublicKey(poolAddress);
      const poolAccount = await this.program.account.stakingPool.fetch(poolPubkey);

      const poolData = {
        address: poolAddress,
        influencerId: poolAccount.influencerId,
        totalStaked: poolAccount.totalStaked.toString(),
        stakerCount: poolAccount.stakerCount.toNumber(),
        revenueShare: poolAccount.revenueShare.toNumber(),
        minStake: poolAccount.minStake.toString(),
        isActive: poolAccount.isActive,
        createdAt: new Date(poolAccount.createdAt.toNumber() * 1000).toISOString(),
        apy: this.calculateAPY(poolAccount),
      };

      // Cache for 5 minutes
      await this.redisService.set(
        `pool:data:${poolAddress}`,
        JSON.stringify(poolData),
        300
      );

      return poolData;
    } catch (error) {
      this.logger.error(`Failed to fetch pool data: ${error.message}`);
      throw error;
    }
  }

  async getStakingPool(poolAddress: string): Promise<any> {
    return await this.getPoolData(poolAddress);
  }

  async validateWalletAddress(walletAddress: string): Promise<boolean> {
    try {
      // PublicKey constructor validates base58 + length.
      // eslint-disable-next-line no-new
      new PublicKey(walletAddress);
      return true;
    } catch {
      return false;
    }
  }

  async verifyWalletSignature(walletAddress: string, message: string, signature: string): Promise<boolean> {
    try {
      const publicKeyBytes = bs58.decode(walletAddress);
      const messageBytes = Buffer.from(message, 'utf8');

      let signatureBytes: Uint8Array;
      try {
        signatureBytes = bs58.decode(signature);
      } catch {
        signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
      }

      if (publicKeyBytes.length !== 32 || signatureBytes.length !== nacl.sign.signatureLength) {
        return false;
      }

      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (err) {
      this.logger.warn(`Signature verification failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async stake(
    userWallet: string,
    poolAddress: string,
    amount: string,
  ): Promise<string> {
    try {
      if (!this.program) {
        throw new Error('Solana staking program is not configured');
      }

      const userPubkey = new PublicKey(userWallet);
      const poolPubkey = new PublicKey(poolAddress);
      const amountBN = new BN(amount);

      // Create stake account PDA
      const [stakeAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from('stake'),
          poolPubkey.toBuffer(),
          userPubkey.toBuffer(),
        ],
        this.program.programId
      );

      const tx = await this.program.methods
        .stake(amountBN)
        .accounts({
          stakeAccount,
          pool: poolPubkey,
          staker: userPubkey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      this.logger.log(`Stake transaction completed: ${tx}`);
      return tx;
    } catch (error) {
      this.logger.error(`Stake transaction failed: ${error.message}`);
      throw error;
    }
  }

  async unstake(
    userWallet: string,
    poolAddress: string,
    amount: string,
  ): Promise<string> {
    try {
      if (!this.program) {
        throw new Error('Solana staking program is not configured');
      }

      const userPubkey = new PublicKey(userWallet);
      const poolPubkey = new PublicKey(poolAddress);
      const amountBN = new BN(amount);

      const [stakeAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from('stake'),
          poolPubkey.toBuffer(),
          userPubkey.toBuffer(),
        ],
        this.program.programId
      );

      const tx = await this.program.methods
        .unstake(amountBN)
        .accounts({
          stakeAccount,
          pool: poolPubkey,
          staker: userPubkey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      this.logger.log(`Unstake transaction completed: ${tx}`);
      return tx;
    } catch (error) {
      this.logger.error(`Unstake transaction failed: ${error.message}`);
      throw error;
    }
  }

  async claimRewards(
    userWallet: string,
    poolAddress: string,
  ): Promise<string> {
    try {
      if (!this.program) {
        throw new Error('Solana staking program is not configured');
      }

      const userPubkey = new PublicKey(userWallet);
      const poolPubkey = new PublicKey(poolAddress);

      const [stakeAccount] = await PublicKey.findProgramAddress(
        [
          Buffer.from('stake'),
          poolPubkey.toBuffer(),
          userPubkey.toBuffer(),
        ],
        this.program.programId
      );

      const tx = await this.program.methods
        .claimRewards()
        .accounts({
          stakeAccount,
          pool: poolPubkey,
          staker: userPubkey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      this.logger.log(`Claim rewards transaction completed: ${tx}`);
      return tx;
    } catch (error) {
      this.logger.error(`Claim rewards transaction failed: ${error.message}`);
      throw error;
    }
  }

  async distributeRewards(
    poolAddress: string,
    amount: string,
  ): Promise<string> {
    try {
      if (!this.program || !this.provider) {
        throw new Error('Solana staking program is not configured');
      }

      const poolPubkey = new PublicKey(poolAddress);
      const amountBN = new BN(amount);

      const tx = await this.program.methods
        .distributeRewards(amountBN)
        .accounts({
          pool: poolPubkey,
          authority: this.provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      this.logger.log(`Reward distribution transaction completed: ${tx}`);
      return tx;
    } catch (error) {
      this.logger.error(`Reward distribution failed: ${error.message}`);
      throw error;
    }
  }

  private calculateAPY(poolAccount: any): number {
    // Calculate APY based on pool performance
    const totalStaked = poolAccount.totalStaked.toNumber();
    const totalRewards = poolAccount.totalRewards.toNumber();
    const timeElapsed = Date.now() / 1000 - poolAccount.createdAt.toNumber();
    
    if (totalStaked === 0 || timeElapsed === 0) return 0;
    
    const annualizedReturn = (totalRewards / totalStaked) * (365 * 24 * 60 * 60 / timeElapsed);
    return Math.round(annualizedReturn * 10000) / 100; // Return as percentage with 2 decimals
  }

  async getTransaction(signature: string): Promise<any> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      return tx;
    } catch (error) {
      this.logger.error(`Failed to fetch transaction: ${error.message}`);
      throw error;
    }
  }

  async getBalance(address: string): Promise<number> {
    try {
      const pubkey = new PublicKey(address);
      const balance = await this.connection.getBalance(pubkey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      this.logger.error(`Failed to fetch balance: ${error.message}`);
      throw error;
    }
  }
}
