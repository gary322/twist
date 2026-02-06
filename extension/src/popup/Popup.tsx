import React, { useState, useEffect } from 'react';
import { extensionApi } from '../api';
import { InfluencerStaking } from '../components/InfluencerStaking';
import './Popup.css';

interface User {
  id: string;
  email: string;
  username?: string;
  isInfluencer: boolean;
}

export const Popup: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'main' | 'staking'>('main');

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const authenticated = await extensionApi.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        // Get user data from storage
        chrome.storage.local.get(['user'], (result) => {
          if (result.user) {
            setUser(result.user);
          }
        });
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    chrome.tabs.create({
      url: 'https://twist.to/login?extension=true',
    });
    window.close();
  };

  const handleLogout = async () => {
    await extensionApi.logout();
    await chrome.storage.local.remove(['user', 'portfolio']);
    setIsAuthenticated(false);
    setUser(null);
  };

  const openDashboard = () => {
    chrome.tabs.create({
      url: 'https://twist.to/dashboard',
    });
  };

  if (loading) {
    return (
      <div className="popup-container loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="popup-container auth">
        <div className="logo">
          <img src="/logo.png" alt="Twist" />
        </div>
        <h2>Welcome to Twist</h2>
        <p>Sign in to access your portfolio and start staking on influencers</p>
        <button className="primary-button" onClick={handleLogin}>
          Sign In
        </button>
      </div>
    );
  }

  if (activeView === 'staking') {
    return (
      <div className="popup-container">
        <div className="popup-header">
          <button className="back-button" onClick={() => setActiveView('main')}>
            ← Back
          </button>
        </div>
        <InfluencerStaking />
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="popup-header">
        <div className="user-info">
          <div className="user-avatar">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <div className="user-name">{user?.username || 'User'}</div>
            <div className="user-email">{user?.email}</div>
          </div>
        </div>
        <button className="icon-button" onClick={handleLogout} title="Logout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>

      <div className="menu-section">
        <button className="menu-item" onClick={() => setActiveView('staking')}>
          <div className="menu-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="menu-content">
            <div className="menu-title">Influencer Staking</div>
            <div className="menu-description">Search and stake on influencers</div>
          </div>
          <div className="menu-arrow">→</div>
        </button>

        <button className="menu-item" onClick={openDashboard}>
          <div className="menu-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="9" x2="15" y2="9" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="13" y2="17" />
            </svg>
          </div>
          <div className="menu-content">
            <div className="menu-title">Dashboard</div>
            <div className="menu-description">View your full dashboard</div>
          </div>
          <div className="menu-arrow">↗</div>
        </button>

        {user?.isInfluencer && (
          <button className="menu-item" onClick={() => chrome.tabs.create({ url: 'https://twist.to/influencer' })}>
            <div className="menu-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <div className="menu-content">
              <div className="menu-title">Influencer Hub</div>
              <div className="menu-description">Manage your content and stats</div>
            </div>
            <div className="menu-arrow">↗</div>
          </button>
        )}
      </div>

      <div className="quick-stats">
        <h3>Quick Stats</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">--</div>
            <div className="stat-label">Portfolio Value</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">--</div>
            <div className="stat-label">Pending Rewards</div>
          </div>
        </div>
      </div>

      <div className="footer">
        <a href="https://twist.to/help" target="_blank" rel="noopener noreferrer">
          Help
        </a>
        <span>•</span>
        <a href="https://twist.to/privacy" target="_blank" rel="noopener noreferrer">
          Privacy
        </a>
        <span>•</span>
        <a href="https://twist.to/terms" target="_blank" rel="noopener noreferrer">
          Terms
        </a>
      </div>
    </div>
  );
};