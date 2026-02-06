import React, { useState } from 'react';

interface SettingsViewProps {
  session: {
    email?: string;
    walletAddress?: string;
    isAuthenticated: boolean;
  };
  onUpdate: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ session, onUpdate }) => {
  const [notifications, setNotifications] = useState(true);
  const [privacy, setPrivacy] = useState('balanced');

  const handleConnectWallet = async () => {
    // Open wallet connection page
    chrome.tabs.create({ url: 'https://twist.io/connect-wallet' });
  };

  const handleLogout = async () => {
    await chrome.runtime.sendMessage({ type: 'LOGOUT' });
    onUpdate();
  };

  const copyWalletAddress = () => {
    if (session.walletAddress) {
      navigator.clipboard.writeText(session.walletAddress);
    }
  };

  return (
    <div className="settings-view p-4">
      <div className="setting-group">
        <h3 className="font-semibold mb-2">Wallet</h3>
        {session.walletAddress ? (
          <div className="wallet-connected flex items-center justify-between bg-gray-50 p-3 rounded">
            <span className="text-sm">
              Connected: {session.walletAddress.slice(0, 10)}...
            </span>
            <button 
              onClick={copyWalletAddress}
              className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700"
            >
              Copy
            </button>
          </div>
        ) : (
          <button 
            onClick={handleConnectWallet} 
            className="connect-wallet w-full bg-purple-600 text-white py-2 rounded hover:bg-purple-700"
          >
            Connect Wallet
          </button>
        )}
      </div>

      <div className="setting-group mt-4">
        <h3 className="font-semibold mb-2">Notifications</h3>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
            className="mr-2"
          />
          <span className="text-sm">Show earning notifications</span>
        </label>
      </div>

      <div className="setting-group mt-4">
        <h3 className="font-semibold mb-2">Privacy Mode</h3>
        <select 
          value={privacy} 
          onChange={(e) => setPrivacy(e.target.value)}
          className="w-full"
        >
          <option value="strict">Strict - No tracking on sensitive sites</option>
          <option value="balanced">Balanced - Smart detection</option>
          <option value="permissive">Permissive - Track all sites</option>
        </select>
      </div>

      <div className="setting-group mt-4">
        <h3 className="font-semibold mb-2">Account</h3>
        <button 
          onClick={handleLogout} 
          className="logout w-full bg-red-600 text-white py-2 rounded hover:bg-red-700"
        >
          Log Out
        </button>
      </div>

      <div className="setting-footer mt-6 flex justify-between text-xs text-gray-500">
        <a 
          href="https://twist.io/privacy" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-purple-600 hover:underline"
        >
          Privacy Policy
        </a>
        <span>v{chrome.runtime.getManifest().version}</span>
      </div>
    </div>
  );
};

export default SettingsView;