import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { api } from '../services/api';

interface WalletState {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
}

export const useWallet = () => {
  const [state, setState] = useState<WalletState>({
    publicKey: null,
    connected: false,
    connecting: false,
  });

  useEffect(() => {
    loadWallet();
  }, []);

  const loadWallet = async () => {
    try {
      const savedWallet = await AsyncStorage.getItem('wallet_address');
      if (savedWallet) {
        setState({
          publicKey: savedWallet,
          connected: true,
          connecting: false,
        });
      }
    } catch (error) {
      console.error('Failed to load wallet:', error);
    }
  };

  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, connecting: true }));

    try {
      // In a real app, this would integrate with a mobile wallet adapter
      // For demo purposes, we'll simulate wallet connection
      
      // Generate a message to sign
      const message = `Connect to TWIST Staking\nTimestamp: ${Date.now()}`;
      
      // In production, this would come from the wallet app
      const mockWalletAddress = 'DemoWa11etAddress' + Math.random().toString(36).substring(7);
      const mockSignature = 'DemoSignature' + Math.random().toString(36).substring(7);

      // Authenticate with backend
      await api.connectWallet({
        walletAddress: mockWalletAddress,
        signature: mockSignature,
        message,
      });

      // Save wallet info
      await AsyncStorage.setItem('wallet_address', mockWalletAddress);

      setState({
        publicKey: mockWalletAddress,
        connected: true,
        connecting: false,
      });
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setState(prev => ({ ...prev, connecting: false }));
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await api.disconnectWallet();
      await AsyncStorage.multiRemove(['wallet_address', 'auth_token']);
      
      setState({
        publicKey: null,
        connected: false,
        connecting: false,
      });
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }, []);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!state.connected) {
      throw new Error('Wallet not connected');
    }

    // In a real app, this would request signature from the wallet app
    // For demo purposes, we'll return a mock signature
    return 'MockSignature' + bs58.encode(Buffer.from(message));
  }, [state.connected]);

  const signTransaction = useCallback(async (transaction: any): Promise<any> => {
    if (!state.connected) {
      throw new Error('Wallet not connected');
    }

    // In a real app, this would request signature from the wallet app
    // For demo purposes, we'll return the transaction as-is
    return transaction;
  }, [state.connected]);

  return {
    publicKey: state.publicKey,
    connected: state.connected,
    connecting: state.connecting,
    connect,
    disconnect,
    signMessage,
    signTransaction,
  };
};