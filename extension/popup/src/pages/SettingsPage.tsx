import React, { useState, useEffect } from 'react';
import { UserIdentity } from '../../../types';

interface SettingsPageProps {
  userIdentity: UserIdentity | null;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ userIdentity }) => {
  const [notifications, setNotifications] = useState(true);
  const [stakingAlerts, setStakingAlerts] = useState(true);
  const [privacyMode, setPrivacyMode] = useState<'strict' | 'balanced' | 'permissive'>('balanced');
  const [autoClaimRewards, setAutoClaimRewards] = useState(false);
  const [minAPYAlert, setMinAPYAlert] = useState('5');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await chrome.storage.local.get([
      'notifications',
      'stakingAlerts',
      'privacyMode',
      'autoClaimRewards',
      'minAPYAlert'
    ]);
    
    if (settings.notifications !== undefined) setNotifications(settings.notifications);
    if (settings.stakingAlerts !== undefined) setStakingAlerts(settings.stakingAlerts);
    if (settings.privacyMode) setPrivacyMode(settings.privacyMode);
    if (settings.autoClaimRewards !== undefined) setAutoClaimRewards(settings.autoClaimRewards);
    if (settings.minAPYAlert) setMinAPYAlert(settings.minAPYAlert);
  };

  const saveSettings = async () => {
    await chrome.storage.local.set({
      notifications,
      stakingAlerts,
      privacyMode,
      autoClaimRewards,
      minAPYAlert
    });
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to log out?')) {
      await chrome.runtime.sendMessage({ type: 'LOGOUT' });
      window.location.reload();
    }
  };

  const handleExportData = async () => {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twist-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Account Info */}
      {userIdentity && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-3">Account</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Email</span>
              <span className="font-medium">{userIdentity.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">User ID</span>
              <span className="font-mono text-xs">{userIdentity.userId.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Member Since</span>
              <span className="font-medium">
                {new Date(userIdentity.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Notification Settings */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="font-semibold mb-3">Notifications</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm">Earning notifications</span>
            <input
              type="checkbox"
              checked={notifications}
              onChange={(e) => {
                setNotifications(e.target.checked);
                saveSettings();
              }}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm">Staking alerts</span>
            <input
              type="checkbox"
              checked={stakingAlerts}
              onChange={(e) => {
                setStakingAlerts(e.target.checked);
                saveSettings();
              }}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm">Auto-claim rewards</span>
            <input
              type="checkbox"
              checked={autoClaimRewards}
              onChange={(e) => {
                setAutoClaimRewards(e.target.checked);
                saveSettings();
              }}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
          </label>
        </div>
      </div>

      {/* Staking Settings */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="font-semibold mb-3">Staking Alerts</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600">Minimum APY change alert (%)</label>
            <input
              type="number"
              value={minAPYAlert}
              onChange={(e) => {
                setMinAPYAlert(e.target.value);
                saveSettings();
              }}
              min="1"
              max="50"
              className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Privacy Settings */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="font-semibold mb-3">Privacy Mode</h3>
        <select
          value={privacyMode}
          onChange={(e) => {
            setPrivacyMode(e.target.value as any);
            saveSettings();
          }}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="strict">Strict - No tracking on sensitive sites</option>
          <option value="balanced">Balanced - Smart detection (Recommended)</option>
          <option value="permissive">Permissive - Track all sites</option>
        </select>
        <p className="text-xs text-gray-500 mt-2">
          {privacyMode === 'strict' && 'Will not track banking, payment, or government sites'}
          {privacyMode === 'balanced' && 'Automatically detects and skips sensitive pages'}
          {privacyMode === 'permissive' && 'Tracks all websites (use with caution)'}
        </p>
      </div>

      {/* Data Management */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="font-semibold mb-3">Data Management</h3>
        <div className="space-y-3">
          <button
            onClick={handleExportData}
            className="w-full text-left px-3 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm">Export data backup</span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
          </button>
          <button
            onClick={() => {
              if (confirm('This will clear all local data. Are you sure?')) {
                chrome.storage.local.clear();
                window.location.reload();
              }
            }}
            className="w-full text-left px-3 py-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-red-600">Clear local data</span>
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
          </button>
        </div>
      </div>

      {/* Links */}
      <div className="space-y-2 pt-2">
        <a
          href="https://twist.to/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-sm text-purple-600 hover:underline"
        >
          Privacy Policy
        </a>
        <a
          href="https://twist.to/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-sm text-purple-600 hover:underline"
        >
          Terms of Service
        </a>
        <a
          href="https://twist.to/support"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-sm text-purple-600 hover:underline"
        >
          Support
        </a>
      </div>

      {/* Version */}
      <div className="text-center text-xs text-gray-400 pt-2">
        Version {chrome.runtime.getManifest().version}
      </div>

      {/* Logout Button */}
      {userIdentity && (
        <button
          onClick={handleLogout}
          className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          Log Out
        </button>
      )}
    </div>
  );
};