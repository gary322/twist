// Wallet Integration Test Fixes
// This file contains the fixes for the UI wallet integration test failures

import { PublicKey } from '@solana/web3.js';

// Fix for wallet button test selectors
export const WALLET_TEST_SELECTORS = {
  connectButton: '.wallet-connect-button',
  modalOverlay: '.wallet-modal-overlay',
  modalContent: '.wallet-modal-content',
  providerList: '.wallet-provider-list',
  providerItem: '.wallet-provider-item',
  connectedContainer: '.wallet-connected-container',
  addressDisplay: '.wallet-address',
  balanceDisplay: '.wallet-balance',
  disconnectButton: '.wallet-disconnect-button',
  loadingSpinner: '.wallet-spinner',
  errorMessage: '.wallet-error',
  txStatus: '.wallet-tx-status'
};

// Fix for wallet connection test helper
export async function waitForWalletConnection(timeout = 5000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const connectedElement = document.querySelector(WALLET_TEST_SELECTORS.connectedContainer);
    if (connectedElement) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return false;
}

// Fix for wallet modal test helper
export async function waitForModalToAppear(timeout = 3000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const modalElement = document.querySelector(WALLET_TEST_SELECTORS.modalContent);
    if (modalElement && getComputedStyle(modalElement).opacity === '1') {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return false;
}

// Fix for wallet provider selection test helper
export async function selectWalletProvider(providerName: string): Promise<boolean> {
  const providers = document.querySelectorAll(WALLET_TEST_SELECTORS.providerItem);
  
  for (const provider of providers) {
    const nameElement = provider.querySelector('.wallet-provider-name');
    if (nameElement && nameElement.textContent === providerName) {
      (provider as HTMLElement).click();
      return true;
    }
  }
  
  return false;
}

// Fix for wallet balance display test helper
export function formatWalletBalance(balance: number): string {
  if (balance === 0) return '0 TWIST';
  if (balance < 0.01) return '<0.01 TWIST';
  if (balance >= 1000000) return `${(balance / 1000000).toFixed(2)}M TWIST`;
  if (balance >= 1000) return `${(balance / 1000).toFixed(2)}K TWIST`;
  return `${balance.toFixed(2)} TWIST`;
}

// Fix for wallet address display test helper
export function formatWalletAddress(address: PublicKey | string): string {
  const addr = typeof address === 'string' ? address : address.toString();
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

// Fix for transaction status display test helper
export interface TransactionStatus {
  type: 'pending' | 'success' | 'error';
  message: string;
  txId?: string;
}

export function displayTransactionStatus(status: TransactionStatus): void {
  const existingStatus = document.querySelector(WALLET_TEST_SELECTORS.txStatus);
  if (existingStatus) {
    existingStatus.remove();
  }
  
  const statusElement = document.createElement('div');
  statusElement.className = 'wallet-tx-status';
  statusElement.innerHTML = `
    <div class="wallet-tx-icon wallet-tx-icon-${status.type}"></div>
    <div class="wallet-tx-message">${status.message}</div>
    ${status.txId ? `<a href="https://solscan.io/tx/${status.txId}" target="_blank" rel="noopener">View</a>` : ''}
  `;
  
  document.body.appendChild(statusElement);
  
  // Auto-remove after 5 seconds for success, keep for errors
  if (status.type === 'success') {
    setTimeout(() => statusElement.remove(), 5000);
  }
}

// Fix for responsive design test helper
export function isWalletUIResponsive(): boolean {
  const button = document.querySelector(WALLET_TEST_SELECTORS.connectButton) as HTMLElement;
  if (!button) return false;
  
  const buttonStyles = getComputedStyle(button);
  const isMobile = window.innerWidth <= 640;
  
  if (isMobile) {
    // Check mobile-specific styles
    return (
      parseInt(buttonStyles.minWidth) <= 140 &&
      parseInt(buttonStyles.fontSize) <= 14 &&
      parseInt(buttonStyles.height) <= 44
    );
  } else {
    // Check desktop styles
    return (
      parseInt(buttonStyles.minWidth) >= 160 &&
      parseInt(buttonStyles.fontSize) >= 16 &&
      parseInt(buttonStyles.height) >= 48
    );
  }
}

// Fix for dark mode test helper
export function isWalletUIDarkModeCompatible(): boolean {
  const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const modal = document.querySelector(WALLET_TEST_SELECTORS.modalContent) as HTMLElement;
  
  if (!modal || !isDarkMode) return true;
  
  const modalStyles = getComputedStyle(modal);
  const bgColor = modalStyles.backgroundColor;
  
  // Check if background is dark in dark mode
  const rgb = bgColor.match(/\d+/g);
  if (rgb) {
    const [r, g, b] = rgb.map(Number);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128; // Dark background
  }
  
  return false;
}

// Export test utilities
export const WalletTestUtils = {
  selectors: WALLET_TEST_SELECTORS,
  waitForConnection: waitForWalletConnection,
  waitForModal: waitForModalToAppear,
  selectProvider: selectWalletProvider,
  formatBalance: formatWalletBalance,
  formatAddress: formatWalletAddress,
  showTxStatus: displayTransactionStatus,
  checkResponsive: isWalletUIResponsive,
  checkDarkMode: isWalletUIDarkModeCompatible
};