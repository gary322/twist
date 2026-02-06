// Extension popup main script
import { ExtensionApp } from './components/ExtensionApp.js';
import { extensionApi } from './api.js';

// Initialize the extension popup
document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('root');
  
  // Check wallet connection status
  const walletConnected = await checkWalletConnection();
  
  // Render the app
  const app = new ExtensionApp(root, {
    walletConnected,
    api: extensionApi,
  });
  
  app.render();
});

async function checkWalletConnection() {
  const result = await chrome.storage.local.get(['walletAddress']);
  return !!result.walletAddress;
}