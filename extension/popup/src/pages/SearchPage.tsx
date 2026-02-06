import React, { useState, useEffect } from 'react';
import { formatToken } from '../utils/format';
import { MessageType, Influencer } from '../../../types';

interface SearchPageProps {
  onStake: (influencer: Influencer) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({ onStake }) => {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'totalStaked' | 'stakerCount' | 'apy'>('totalStaked');
  const [results, setResults] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<any[]>([]);

  useEffect(() => {
    loadRecentSearches();
  }, []);

  useEffect(() => {
    if (query.length > 2) {
      searchInfluencers();
    }
  }, [query, sortBy]);

  const loadRecentSearches = async () => {
    const { recentSearches = [] } = await chrome.storage.local.get('recentSearches');
    setRecentSearches(recentSearches);
  };

  const searchInfluencers = async () => {
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.SEARCH_INFLUENCERS,
        payload: {
          query,
          sortBy,
          limit: 10,
        },
      });

      if (!response.error) {
        setResults(response);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSortIcon = (sort: string) => {
    switch (sort) {
      case 'totalStaked':
        return (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        );
      case 'stakerCount':
        return (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      case 'apy':
        return (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className="p-4">
      {/* Search Bar */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-2.5 text-gray-400 w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search influencers..."
          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Sort Options */}
      <div className="flex gap-2 mb-4">
        {[
          { value: 'totalStaked', label: 'Staked' },
          { value: 'stakerCount', label: 'Stakers' },
          { value: 'apy', label: 'APY' },
        ].map((option) => (
          <button
            key={option.value}
            onClick={() => setSortBy(option.value as any)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
              sortBy === option.value
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {getSortIcon(option.value)}
            {option.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-3">
          {results.map((influencer) => (
            <div
              key={influencer.id}
              className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onStake(influencer)}
            >
              <div className="flex items-start gap-3">
                <img
                  src={influencer.avatar || 'https://via.placeholder.com/48'}
                  alt=""
                  className="w-12 h-12 rounded-full"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{influencer.displayName}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      influencer.tier === 'PLATINUM' ? 'bg-purple-100 text-purple-800' :
                      influencer.tier === 'GOLD' ? 'bg-yellow-100 text-yellow-800' :
                      influencer.tier === 'SILVER' ? 'bg-gray-100 text-gray-800' :
                      'bg-orange-100 text-orange-800'
                    }`}>
                      {influencer.tier}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">@{influencer.username}</p>

                  <div className="flex items-center gap-4 mt-2 text-xs">
                    <div>
                      <span className="text-gray-500">Staked: </span>
                      <span className="font-medium">
                        {formatToken(influencer.metrics.totalStaked)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">APY: </span>
                      <span className="font-medium text-green-600">
                        {influencer.metrics.apy}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Stakers: </span>
                      <span className="font-medium">
                        {influencer.metrics.stakerCount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : query.length > 2 ? (
        <div className="text-center py-8 text-gray-500">
          No influencers found
        </div>
      ) : recentSearches.length > 0 ? (
        <div>
          <h3 className="font-medium text-gray-700 mb-3">Recent Searches</h3>
          <div className="space-y-2">
            {recentSearches.slice(0, 5).map((search, index) => (
              <button
                key={index}
                onClick={() => {
                  setQuery(search.params.query || '');
                  setSortBy(search.params.sortBy || 'totalStaked');
                }}
                className="w-full text-left px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100"
              >
                <p className="text-sm font-medium">{search.params.query}</p>
                <p className="text-xs text-gray-500">
                  {new Date(search.timestamp).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <svg className="mx-auto text-gray-300 mb-3 w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-gray-500">
            Search for influencers to stake on
          </p>
        </div>
      )}
    </div>
  );
};