import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  Search,
  TrendingUp,
  Users,
  Award,
  Info,
  Filter,
  ChevronDown,
  Star,
  Shield,
  Zap
} from 'lucide-react';
import { api } from '../services/api';
import { formatNumber, formatToken } from '../utils/format';
import { StakingModal } from '../components/StakingModal';
import { InfluencerDetailsModal } from '../components/InfluencerDetailsModal';
import { motion, AnimatePresence } from 'framer-motion';

export const InfluencerStaking: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'totalStaked' | 'stakerCount' | 'apy'>('totalStaked');
  const [filters, setFilters] = useState({
    minStaked: 0,
    minApy: 0,
    tiers: [] as string[],
  });
  const [showFilters, setShowFilters] = useState(false);
  const [influencers, setInfluencers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [userStakes, setUserStakes] = useState([]);

  useEffect(() => {
    searchInfluencers();
    if (connected) {
      loadUserStakes();
    }
  }, [searchQuery, sortBy, filters, connected]);

  const searchInfluencers = async () => {
    setLoading(true);
    try {
      const results = await api.searchInfluencers({
        query: searchQuery,
        sortBy,
        filters: {
          minStaked: filters.minStaked,
          minApy: filters.minApy,
          tiers: filters.tiers.length > 0 ? filters.tiers : undefined,
        },
        limit: 20,
      });
      setInfluencers(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserStakes = async () => {
    try {
      const stakes = await api.getUserStakes();
      setUserStakes(stakes);
    } catch (error) {
      console.error('Failed to load user stakes:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Stake on Influencers
          </h1>
          <p className="mt-2 text-gray-600">
            Stake TWIST tokens on your favorite influencers and earn a share of their revenue
          </p>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-purple-200 text-sm">Total Value Staked</p>
              <p className="text-2xl font-bold">
                {formatToken(influencers.reduce((sum, inf) =>
                  sum + BigInt(inf.metrics.totalStaked), 0n
                ))}
              </p>
            </div>
            <div>
              <p className="text-purple-200 text-sm">Active Stakers</p>
              <p className="text-2xl font-bold">
                {formatNumber(influencers.reduce((sum, inf) =>
                  sum + inf.metrics.stakerCount, 0
                ))}
              </p>
            </div>
            <div>
              <p className="text-purple-200 text-sm">Average APY</p>
              <p className="text-2xl font-bold">
                {influencers.length > 0
                  ? (influencers.reduce((sum, inf) => sum + inf.metrics.apy, 0) / influencers.length).toFixed(1)
                  : 0}%
              </p>
            </div>
            <div>
              <p className="text-purple-200 text-sm">Your Stakes</p>
              <p className="text-2xl font-bold">{userStakes.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Search and Filters */}
        <div className="mb-8">
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search influencers by name or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-3 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <Filter size={20} />
              Filters
              <ChevronDown size={16} className={`transform transition-transform ${
                showFilters ? 'rotate-180' : ''
              }`} />
            </button>
          </div>

          {/* Sort Options */}
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('totalStaked')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                sortBy === 'totalStaked'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white border hover:bg-gray-50'
              }`}
            >
              <TrendingUp size={16} />
              Most Staked
            </button>
            <button
              onClick={() => setSortBy('stakerCount')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                sortBy === 'stakerCount'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white border hover:bg-gray-50'
              }`}
            >
              <Users size={16} />
              Most Stakers
            </button>
            <button
              onClick={() => setSortBy('apy')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                sortBy === 'apy'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white border hover:bg-gray-50'
              }`}
            >
              <Award size={16} />
              Highest APY
            </button>
          </div>

          {/* Filter Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-4 p-4 bg-white border rounded-lg"
              >
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Minimum Staked
                    </label>
                    <input
                      type="number"
                      value={filters.minStaked}
                      onChange={(e) => setFilters({
                        ...filters,
                        minStaked: Number(e.target.value),
                      })}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Minimum APY (%)
                    </label>
                    <input
                      type="number"
                      value={filters.minApy}
                      onChange={(e) => setFilters({
                        ...filters,
                        minApy: Number(e.target.value),
                      })}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Tiers
                    </label>
                    <div className="flex gap-2">
                      {['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'].map(tier => (
                        <button
                          key={tier}
                          onClick={() => {
                            const tiers = filters.tiers.includes(tier)
                              ? filters.tiers.filter(t => t !== tier)
                              : [...filters.tiers, tier];
                            setFilters({ ...filters, tiers });
                          }}
                          className={`px-3 py-1 rounded text-xs ${
                            filters.tiers.includes(tier)
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-200 hover:bg-gray-300'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Your Stakes */}
        {userStakes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Your Stakes</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {userStakes.map((stake) => (
                <div key={stake.influencer.id} className="bg-white rounded-lg p-4 border">
                  <div className="flex items-center gap-3 mb-3">
                    <img
                      src={stake.influencer.avatar}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <p className="font-medium">{stake.influencer.displayName}</p>
                      <p className="text-sm text-gray-500">
                        {formatToken(stake.stake.amount)} staked
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-600">Pending Rewards</p>
                      <p className="font-bold text-green-600">
                        {formatToken(stake.stake.pendingRewards)}
                      </p>
                    </div>
                    <button className="px-3 py-1 bg-purple-600 text-white rounded text-sm">
                      Claim
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Influencer Grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {influencers.map((influencer) => (
              <InfluencerCard
                key={influencer.id}
                influencer={influencer}
                onStake={() => setSelectedInfluencer(influencer)}
                onViewDetails={() => {
                  setSelectedInfluencer(influencer);
                  setShowDetails(true);
                }}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && influencers.length === 0 && (
          <div className="text-center py-12">
            <Search className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-600">No influencers found matching your criteria</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedInfluencer && !showDetails && (
        <StakingModal
          influencer={selectedInfluencer}
          onClose={() => setSelectedInfluencer(null)}
          onSuccess={() => {
            searchInfluencers();
            loadUserStakes();
            setSelectedInfluencer(null);
          }}
        />
      )}

      {selectedInfluencer && showDetails && (
        <InfluencerDetailsModal
          influencerId={selectedInfluencer.id}
          onClose={() => {
            setShowDetails(false);
            setSelectedInfluencer(null);
          }}
          onStake={() => {
            setShowDetails(false);
          }}
        />
      )}
    </div>
  );
};

const InfluencerCard: React.FC<{
  influencer: any;
  onStake: () => void;
  onViewDetails: () => void;
}> = ({ influencer, onStake, onViewDetails }) => {
  const tierColors = {
    BRONZE: 'bg-orange-100 text-orange-800 border-orange-200',
    SILVER: 'bg-gray-100 text-gray-800 border-gray-200',
    GOLD: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    PLATINUM: 'bg-purple-100 text-purple-800 border-purple-200',
  };

  const tierIcons = {
    BRONZE: '🥉',
    SILVER: '🥈',
    GOLD: '🥇',
    PLATINUM: '💎',
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={influencer.avatar || '/default-avatar.png'}
                alt={influencer.username}
                className="w-14 h-14 rounded-full"
              />
              {influencer.verified && (
                <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1">
                  <Shield className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                {influencer.displayName}
                {influencer.metrics.stakingTrend === 'up' && (
                  <Zap className="w-4 h-4 text-yellow-500" />
                )}
              </h3>
              <p className="text-gray-500 text-sm">@{influencer.username}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
            tierColors[influencer.tier]
          }`}>
            {tierIcons[influencer.tier]} {influencer.tier}
          </span>
        </div>

        {/* Bio */}
        {influencer.bio && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">
            {influencer.bio}
          </p>
        )}

        {/* Metrics */}
        <div className="space-y-3 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm">Total Staked</span>
            <span className="font-bold text-lg">
              {formatToken(influencer.metrics.totalStaked)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm">Stakers</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {formatNumber(influencer.metrics.stakerCount)}
              </span>
              {influencer.metrics.stakingTrend === 'up' && (
                <TrendingUp className="w-3 h-3 text-green-500" />
              )}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm">APY</span>
            <span className="font-medium text-green-600 text-lg">
              {influencer.metrics.apy.toFixed(2)}%
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm">Revenue Share</span>
            <span className="font-medium">
              {influencer.metrics.revenueSharePercent}%
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress to next tier</span>
            <span>75%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-purple-600 h-2 rounded-full"
              style={{ width: '75%' }}
            />
          </div>
        </div>

        {/* Recent Stakers */}
        {influencer.recentStakers.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">Recent stakers</p>
              {influencer.metrics.stakingTrend === 'up' && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <TrendingUp size={12} />
                  Rising
                </span>
              )}
            </div>
            <div className="flex -space-x-2">
              {influencer.recentStakers.slice(0, 5).map((staker, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                >
                  {staker.userId.substring(0, 2).toUpperCase()}
                </div>
              ))}
              {influencer.metrics.stakerCount > 5 && (
                <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center">
                  <span className="text-xs font-medium">
                    +{influencer.metrics.stakerCount - 5}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onStake}
            className="flex-1 bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition-colors font-medium"
          >
            Stake TWIST
          </button>
          <button
            onClick={onViewDetails}
            className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Info size={20} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default InfluencerStaking;