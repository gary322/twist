// Extension APIs for other modules
declare global {
  interface Window {
    TWIST?: {
      isAvailable: boolean;
      version?: string;
      connectWallet?: () => Promise<string>;
      getBalance?: () => Promise<number>;
    };
  }
}

export const ExtensionAPI = {
  // Check if extension is installed
  isInstalled: (): boolean => {
    return typeof window !== 'undefined' &&
           window.TWIST &&
           window.TWIST.isAvailable;
  },

  // Request wallet connection through extension
  requestWalletConnection: async (): Promise<string> => {
    if (!ExtensionAPI.isInstalled()) {
      throw new Error('TWIST extension not installed');
    }
    
    if (!window.TWIST?.connectWallet) {
      throw new Error('Wallet connection not available');
    }
    
    return window.TWIST.connectWallet();
  },

  // Get extension version
  getVersion: (): string | undefined => {
    return window.TWIST?.version;
  },

  // Get user balance
  getBalance: async (): Promise<number> => {
    if (!ExtensionAPI.isInstalled()) {
      throw new Error('TWIST extension not installed');
    }
    
    if (!window.TWIST?.getBalance) {
      throw new Error('Balance API not available');
    }
    
    return window.TWIST.getBalance();
  },

  // Send message to extension
  sendMessage: async (message: any): Promise<any> => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    }
    
    throw new Error('Extension messaging not available');
  },

  // Check if running in extension context
  isExtensionContext: (): boolean => {
    return typeof chrome !== 'undefined' && 
           chrome.runtime && 
           chrome.runtime.id !== undefined;
  },

  // Get extension install URL
  getInstallUrl: (browser: 'chrome' | 'firefox' | 'edge' | 'safari' = 'chrome'): string => {
    const urls = {
      chrome: 'https://chrome.google.com/webstore/detail/twist-extension/[EXTENSION_ID]',
      firefox: 'https://addons.mozilla.org/firefox/addon/twist-extension/',
      edge: 'https://microsoftedge.microsoft.com/addons/detail/twist-extension/[EXTENSION_ID]',
      safari: 'https://apps.apple.com/app/twist-extension/[APP_ID]'
    };
    
    return urls[browser];
  }
};

// Installation URLs
export const EXTENSION_URLS = {
  CHROME: 'https://chrome.google.com/webstore/detail/twist-extension/[EXTENSION_ID]',
  FIREFOX: 'https://addons.mozilla.org/firefox/addon/twist-extension/',
  EDGE: 'https://microsoftedge.microsoft.com/addons/detail/twist-extension/[EXTENSION_ID]',
  SAFARI: 'https://apps.apple.com/app/twist-extension/[APP_ID]'
};

// Extension events
export const ExtensionEvents = {
  INSTALLED: 'twist.extension.installed',
  UPDATED: 'twist.extension.updated',
  WALLET_CONNECTED: 'twist.wallet.connected',
  WALLET_DISCONNECTED: 'twist.wallet.disconnected',
  EARNINGS_UPDATED: 'twist.earnings.updated',
  SECURITY_ALERT: 'twist.security.alert'
};

// Browser detection helper
export const detectBrowser = (): 'chrome' | 'firefox' | 'edge' | 'safari' | 'unknown' => {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.includes('firefox')) {
    return 'firefox';
  } else if (userAgent.includes('edg/')) {
    return 'edge';
  } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
    return 'safari';
  } else if (userAgent.includes('chrome')) {
    return 'chrome';
  }
  
  return 'unknown';
};

// Extension installation helper
export const promptInstallExtension = (): void => {
  const browser = detectBrowser();
  const installUrl = ExtensionAPI.getInstallUrl(browser);
  
  if (confirm(`Install TWIST extension to start earning tokens while browsing?`)) {
    window.open(installUrl, '_blank');
  }
};

// Export types
export * from './types';

// Default export
export default ExtensionAPI;