import { Injectable, BadRequestException } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import * as bs58 from 'bs58';

@Injectable()
export class WalletValidationService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    );
  }

  /**
   * Validate a Solana wallet address
   */
  isValidAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify wallet ownership through signature
   */
  async verifyWalletOwnership(params: {
    walletAddress: string;
    message: string;
    signature: string;
  }): Promise<boolean> {
    try {
      const publicKey = new PublicKey(params.walletAddress);
      const messageBytes = new TextEncoder().encode(params.message);
      const signatureBytes = bs58.decode(params.signature);
      const publicKeyBytes = publicKey.toBytes();

      return nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes,
      );
    } catch (error) {
      throw new BadRequestException('Invalid signature verification');
    }
  }

  /**
   * Check if wallet has minimum balance for staking
   */
  async checkWalletBalance(
    walletAddress: string,
    minBalance: bigint,
  ): Promise<boolean> {
    try {
      const publicKey = new PublicKey(walletAddress);
      const balance = await this.connection.getBalance(publicKey);
      
      // Convert lamports to SOL for comparison
      const balanceInSol = BigInt(balance);
      return balanceInSol >= minBalance;
    } catch (error) {
      throw new BadRequestException('Failed to check wallet balance');
    }
  }

  /**
   * Get wallet's token balance (for TWIST tokens)
   */
  async getTokenBalance(
    walletAddress: string,
    tokenMint: string,
  ): Promise<bigint> {
    try {
      const publicKey = new PublicKey(walletAddress);
      const mintPublicKey = new PublicKey(tokenMint);

      // Get token accounts for this wallet
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        publicKey,
        { mint: mintPublicKey },
      );

      if (tokenAccounts.value.length === 0) {
        return 0n;
      }

      const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount;
      return BigInt(balance);
    } catch (error) {
      throw new BadRequestException('Failed to get token balance');
    }
  }

  /**
   * Generate a message for wallet signature verification
   */
  generateVerificationMessage(userId: string): string {
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 15);
    return `Twist Platform Verification\nUser: ${userId}\nTimestamp: ${timestamp}\nNonce: ${nonce}`;
  }

  /**
   * Connect wallet to influencer account
   */
  async connectWallet(params: {
    influencerId: string;
    walletAddress: string;
    signature: string;
    message: string;
  }): Promise<boolean> {
    // Validate address format
    if (!this.isValidAddress(params.walletAddress)) {
      throw new BadRequestException('Invalid wallet address format');
    }

    // Verify ownership
    const isValid = await this.verifyWalletOwnership({
      walletAddress: params.walletAddress,
      message: params.message,
      signature: params.signature,
    });

    if (!isValid) {
      throw new BadRequestException('Wallet ownership verification failed');
    }

    return true;
  }
}