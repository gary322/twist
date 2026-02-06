import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Zap, Star, People, ArrowUpward, ArrowDownward, Info } from 'lucide-react';
import { extensionApi } from '../api';
import { formatToken, formatNumber, formatPercent } from '../utils/format';
import './InfluencerStaking.css';

interface Influencer {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  tier: string;
  verified: boolean;
  metrics: {
    totalStaked: string;
    stakerCount: number;
    apy: number;
    revenueSharePercent: number;
    stakingTrend: 'up' | 'down' | 'stable';
  };
}

interface UserStake {
  influencer: {
    id: string;
    displayName: string;
    avatar?: string;
  };
  stake: {
    amount: string;
    pendingRewards: string;
    apy: number;
  };
}

export const InfluencerStaking: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'portfolio'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Influencer[]>([]);
  const [portfolio, setPortfolio] = useState<UserStake[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortBy, setSortBy] = useState<'totalStaked' | 'apy' | 'stakerCount'>('totalStaked');

  useEffect(() => {
    if (activeTab === 'portfolio') {
      loadPortfolio();
    }
  }, [activeTab]);

  useEffect(() => {
    if (searchQuery.length > 2) {
      const delayDebounceFn = setTimeout(() => {
        handleSearch();
      }, 300);

      return () => clearTimeout(delayDebounceFn);
    } else {
      setResults([]);
    }
  }, [searchQuery]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const influencers = await extensionApi.searchInfluencers({
        query: searchQuery,
        sortBy,
        limit: 5,
      });
      setResults(influencers);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPortfolio = async () => {
    setLoading(true);
    try {
      const stakes = await extensionApi.getUserStakes();
      setPortfolio(stakes);
    } catch (error) {
      console.error('Failed to load portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStake = (influencer: Influencer) => {
    chrome.tabs.create({
      url: `https://twist.to/stake/${influencer.username}`,
    });
  };

  const handleManageStake = (influencerId: string) => {
    chrome.tabs.create({
      url: `https://twist.to/portfolio?highlight=${influencerId}`,
    });
  };

  const openDashboard = () => {
    chrome.tabs.create({
      url: 'https://twist.to/staking',
    });
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'PLATINUM':
        return '#b794f4';
      case 'GOLD':
        return '#f6e05e';
      case 'SILVER':
        return '#cbd5e0';
      case 'BRONZE':
        return '#ed8936';
      default:
        return '#718096';
    }
  };

  const getTotalPortfolioValue = () => {
    return portfolio.reduce((sum, stake) => sum + BigInt(stake.stake.amount), 0n);
  };

  const getTotalPendingRewards = () => {
    return portfolio.reduce((sum, stake) => sum + BigInt(stake.stake.pendingRewards), 0n);
  };

  const getAverageAPY = () => {
    if (portfolio.length === 0) return 0;
    const totalAPY = portfolio.reduce((sum, stake) => sum + stake.stake.apy, 0);
    return totalAPY / portfolio.length;
  };

  return (
    <div className="influencer-staking">
      {/* Header */}
      <div className="staking-header">
        <h3>Influencer Staking</h3>
        <button className="icon-button" onClick={openDashboard} title="Open Dashboard">
          <Info size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <Search size={14} />
          Search
        </button>
        <button
          className={`tab ${activeTab === 'portfolio' ? 'active' : ''}`}
          onClick={() => setActiveTab('portfolio')}
        >
          <Star size={14} />
          Portfolio
        </button>
      </div>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="tab-content">
          {/* Search Bar */}
          <div className={`search-container ${searchFocused ? 'focused' : ''}`}>
            <Search size={16} className="search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search influencers..."
              className="search-input"
            />
            {loading && <div className="search-spinner" />}
          </div>

          {/* Sort Options */}
          {results.length > 0 && (
            <div className="sort-options">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="sort-select"
              >
                <option value="totalStaked">Most Staked</option>
                <option value="apy">Highest APY</option>
                <option value="stakerCount">Most Stakers</option>
              </select>
            </div>
          )}

          {/* Search Results */}
          <div className="search-results">
            {results.length === 0 && searchQuery.length > 2 && !loading && (
              <div className="empty-state">
                <p>No influencers found</p>
              </div>
            )}

            {results.map((influencer) => (
              <div
                key={influencer.id}
                className="influencer-card"
                onClick={() => handleStake(influencer)}
              >
                <div className="influencer-header">
                  <div className="influencer-info">
                    <img
                      src={influencer.avatar || '/default-avatar.png'}
                      alt=""
                      className="influencer-avatar"
                    />
                    <div>
                      <div className="influencer-name">
                        {influencer.displayName}
                        {influencer.verified && (
                          <span className="verified-badge" title="Verified">✓</span>
                        )}
                      </div>
                      <div className="influencer-username">@{influencer.username}</div>
                    </div>
                  </div>
                  <div
                    className="tier-badge"
                    style={{ backgroundColor: getTierColor(influencer.tier) }}
                  >
                    {influencer.tier}
                  </div>
                </div>

                <div className="influencer-metrics">
                  <div className="metric">
                    <span className="metric-value">
                      {formatToken(influencer.metrics.totalStaked)}
                    </span>
                    <span className="metric-label">Staked</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">
                      {formatNumber(influencer.metrics.stakerCount)}
                    </span>
                    <span className="metric-label">Stakers</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value apy">
                      {formatPercent(influencer.metrics.apy / 100)}
                    </span>
                    <span className="metric-label">APY</span>
                  </div>
                </div>

                {influencer.metrics.stakingTrend !== 'stable' && (
                  <div className={`trend-indicator ${influencer.metrics.stakingTrend}`}>
                    {influencer.metrics.stakingTrend === 'up' ? (
                      <>
                        <ArrowUpward size={12} />
                        <span>Trending</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownward size={12} />
                        <span>Declining</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="quick-actions">
            <h4>Quick Actions</h4>
            <button
              onClick={() => {
                chrome.tabs.create({ url: 'https://twist.to/stake/top' });
              }}
              className="quick-action"
            >
              <Zap size={16} />
              Top Staked Influencers
            </button>
            <button
              onClick={() => {
                chrome.tabs.create({ url: 'https://twist.to/stake/trending' });
              }}
              className="quick-action"
            >
              <TrendingUp size={16} />
              Trending Now
            </button>
          </div>
        </div>
      )}

      {/* Portfolio Tab */}
      {activeTab === 'portfolio' && (
        <div className="tab-content">
          {portfolio.length > 0 ? (
            <>
              {/* Portfolio Summary */}
              <div className="portfolio-summary">
                <div className="summary-item">
                  <span className="summary-label">Total Staked</span>
                  <span className="summary-value">
                    {formatToken(getTotalPortfolioValue())}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Pending Rewards</span>
                  <span className="summary-value rewards">
                    {formatToken(getTotalPendingRewards())}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Avg APY</span>
                  <span className="summary-value">
                    {formatPercent(getAverageAPY() / 100)}
                  </span>
                </div>
              </div>

              {/* Stakes List */}
              <div className="stakes-list">
                {portfolio.map((stake) => (
                  <div
                    key={stake.influencer.id}
                    className="stake-item"
                    onClick={() => handleManageStake(stake.influencer.id)}
                  >
                    <div className="stake-header">
                      <img
                        src={stake.influencer.avatar || '/default-avatar.png'}
                        alt=""
                        className="stake-avatar"
                      />
                      <div className="stake-info">
                        <div className="stake-name">
                          {stake.influencer.displayName}
                        </div>
                        <div className="stake-amount">
                          {formatToken(stake.stake.amount)} staked
                        </div>
                      </div>
                      <div className="stake-apy">
                        {formatPercent(stake.stake.apy / 100)} APY
                      </div>
                    </div>
                    {BigInt(stake.stake.pendingRewards) > 0n && (
                      <div className="pending-rewards">
                        <span className="rewards-label">Pending:</span>
                        <span className="rewards-value">
                          {formatToken(stake.stake.pendingRewards)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Manage Button */}
              <button
                className="manage-portfolio-btn"
                onClick={() => {
                  chrome.tabs.create({ url: 'https://twist.to/portfolio' });
                }}
              >
                Manage Portfolio
              </button>
            </>
          ) : (
            <div className="empty-state">
              <Star size={48} className="empty-icon" />
              <h4>No Stakes Yet</h4>
              <p>Search for influencers and start staking to earn rewards</p>
              <button
                className="primary-button"
                onClick={() => setActiveTab('search')}
              >
                Find Influencers
              </button>
            </div>
          )}

          {loading && (
            <div className="loading-overlay">
              <div className="spinner" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};