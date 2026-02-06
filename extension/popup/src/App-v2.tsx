import React, { useState, useEffect } from 'react';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { WalletPage } from './pages/WalletPage';
import { SettingsPage } from './pages/SettingsPage';
import { StakingModal } from './components/StakingModal';
import { UserIdentity, UserStake, Influencer, MessageType } from '../../types';

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'home' | 'search' | 'wallet' | 'settings'>('home');
  const [userIdentity, setUserIdentity] = useState<UserIdentity | null>(null);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [stakes, setStakes] = useState<UserStake[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [detectedInfluencer, setDetectedInfluencer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
    setupMessageListeners();
  }, []);

  const loadUserData = async () => {
    try {
      // Get stored data
      const { identity, balance: storedBalance, stakes: storedStakes } = await chrome.storage.local.get([
        'identity',
        'balance',
        'stakes'
      ]);

      if (identity) {
        setUserIdentity(identity);
      }
      if (storedBalance) {
        setBalance(BigInt(storedBalance));
      }
      if (storedStakes) {
        setStakes(storedStakes);
      }

      // Get latest state from background
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_STATE });
      if (response && !response.error) {
        // Update with fresh data if available
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupMessageListeners = () => {
    // Listen for tab switch events
    window.addEventListener('switchTab', (event: any) => {
      setCurrentPage(event.detail);
    });

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.type) {
        case MessageType.INFLUENCER_DETECTED:
          setDetectedInfluencer(message.data);
          break;
        case MessageType.OPEN_STAKING_MODAL:
          setSelectedInfluencer(message.data);
          break;
      }
    });
  };

  const handleIdentify = async (email: string) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.AUTHENTICATE,
        payload: { email, password: '' } // Password would come from actual form
      });

      if (response.success) {
        await loadUserData();
      } else {
        alert('Failed to authenticate: ' + response.error);
      }
    } catch (error) {
      console.error('Authentication failed:', error);
    }
  };

  const handleStake = (influencer: Influencer) => {
    setSelectedInfluencer(influencer);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return (
          <HomePage
            userIdentity={userIdentity}
            balance={balance}
            stakes={stakes}
            detectedInfluencer={detectedInfluencer}
            onIdentify={handleIdentify}
            onStake={handleStake}
          />
        );
      case 'search':
        return <SearchPage onStake={handleStake} />;
      case 'wallet':
        return <WalletPage balance={balance} stakes={stakes} />;
      case 'settings':
        return <SettingsPage userIdentity={userIdentity} />;
    }
  };

  if (loading) {
    return (
      <div className="w-96 h-[600px] bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="w-96 h-[600px] bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/assets/icon-32.png" alt="TWIST" className="w-6 h-6" />
            <h1 className="text-lg font-bold">TWIST</h1>
          </div>
          {userIdentity && (
            <div className="text-sm text-gray-600">
              {formatToken(balance)} TWIST
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {renderPage()}
      </div>

      {/* Navigation */}
      {userIdentity && (
        <div className="bg-white border-t">
          <div className="flex">
            <button
              onClick={() => setCurrentPage('home')}
              className={`flex-1 py-3 flex flex-col items-center gap-1 ${
                currentPage === 'home' ? 'text-purple-600' : 'text-gray-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-xs">Home</span>
            </button>
            <button
              onClick={() => setCurrentPage('search')}
              className={`flex-1 py-3 flex flex-col items-center gap-1 ${
                currentPage === 'search' ? 'text-purple-600' : 'text-gray-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-xs">Search</span>
            </button>
            <button
              onClick={() => setCurrentPage('wallet')}
              className={`flex-1 py-3 flex flex-col items-center gap-1 ${
                currentPage === 'wallet' ? 'text-purple-600' : 'text-gray-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="text-xs">Wallet</span>
            </button>
            <button
              onClick={() => setCurrentPage('settings')}
              className={`flex-1 py-3 flex flex-col items-center gap-1 ${
                currentPage === 'settings' ? 'text-purple-600' : 'text-gray-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs">Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* Staking Modal */}
      {selectedInfluencer && (
        <StakingModal
          influencer={selectedInfluencer}
          balance={balance}
          onClose={() => setSelectedInfluencer(null)}
          onSuccess={() => {
            setSelectedInfluencer(null);
            loadUserData();
          }}
        />
      )}
    </div>
  );
};

// Helper function
function formatToken(amount: bigint): string {
  const whole = amount / BigInt(10 ** 9);
  const decimal = amount % BigInt(10 ** 9);
  
  if (decimal === BigInt(0)) {
    return whole.toString();
  }
  
  const decimalStr = decimal.toString().padStart(9, '0');
  const significantDecimals = decimalStr.substring(0, 2);
  
  return `${whole}.${significantDecimals}`;
}