import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, Users, DollarSign, Award, Calendar, BarChart3 } from 'lucide-react';
import { api } from '../services/api';
import { formatToken, formatNumber, formatDate } from '../utils/format';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface InfluencerDetailsModalProps {
  influencerId: string;
  onClose: () => void;
  onStake: () => void;
}

export const InfluencerDetailsModal: React.FC<InfluencerDetailsModalProps> = ({
  influencerId,
  onClose,
  onStake,
}) => {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'stakers'>('overview');

  useEffect(() => {
    loadInfluencerDetails();
  }, [influencerId]);

  const loadInfluencerDetails = async () => {
    try {
      const data = await api.getInfluencerDetails(influencerId);
      setDetails(data);
    } catch (error) {
      console.error('Failed to load details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      >
        <div className="bg-white rounded-xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </motion.div>
    );
  }

  if (!details) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <img
                  src={details.influencer.avatar}
                  alt={details.influencer.username}
                  className="w-16 h-16 rounded-full"
                />
                <div>
                  <h2 className="text-2xl font-bold">{details.influencer.displayName}</h2>
                  <p className="text-gray-600">@{details.influencer.username}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      getTierColor(details.influencer.tier)
                    }`}>
                      {details.influencer.tier} TIER
                    </span>
                    {details.influencer.verified && (
                      <span className="text-blue-600 text-sm flex items-center gap-1">
                        ✓ Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mt-6">
              {(['overview', 'analytics', 'stakers'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? 'text-purple-600 border-b-2 border-purple-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Bio */}
                {details.influencer.bio && (
                  <div>
                    <h3 className="font-semibold mb-2">About</h3>
                    <p className="text-gray-700">{details.influencer.bio}</p>
                  </div>
                )}

                {/* Pool Stats */}
                <div>
                  <h3 className="font-semibold mb-4">Staking Pool Details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                      icon={<DollarSign />}
                      label="Total Staked"
                      value={formatToken(details.pool.totalStaked)}
                    />
                    <StatCard
                      icon={<Users />}
                      label="Stakers"
                      value={formatNumber(details.pool.stakerCount)}
                    />
                    <StatCard
                      icon={<TrendingUp />}
                      label="Current APY"
                      value={`${details.metrics.apy.toFixed(2)}%`}
                      valueClass="text-green-600"
                    />
                    <StatCard
                      icon={<Award />}
                      label="Revenue Share"
                      value={`${details.pool.revenueSharePercent}%`}
                    />
                  </div>
                </div>

                {/* Pool Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Pool Address</p>
                      <p className="font-mono">{details.pool.address.slice(0, 8)}...{details.pool.address.slice(-8)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Created</p>
                      <p>{formatDate(details.pool.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Minimum Stake</p>
                      <p>{formatToken(details.pool.minStake)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Total Rewards Distributed</p>
                      <p className="font-medium">{formatToken(details.metrics.totalRewardsDistributed)}</p>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                {details.recentActivity?.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-4">Recent Activity</h3>
                    <div className="space-y-2">
                      {details.recentActivity.slice(0, 5).map((activity: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${
                              activity.action === 'stake' ? 'bg-green-100' :
                              activity.action === 'unstake' ? 'bg-red-100' :
                              'bg-blue-100'
                            }`}>
                              {activity.action === 'stake' ? '➕' :
                               activity.action === 'unstake' ? '➖' : '💰'}
                            </div>
                            <div>
                              <p className="font-medium capitalize">{activity.action}</p>
                              <p className="text-sm text-gray-600">{activity.userId}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatToken(activity.amount)}</p>
                            <p className="text-sm text-gray-600">{formatDate(activity.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="space-y-6">
                {/* APY Chart */}
                {details.historicalApy?.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-4">Historical APY (30 days)</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={details.historicalApy}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Line 
                            type="monotone" 
                            dataKey="apy" 
                            stroke="#8B5CF6" 
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Metrics Summary */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-2">Last 7 Days</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Avg APY</span>
                        <span className="font-medium">12.4%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">New Stakers</span>
                        <span className="font-medium">23</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Staked</span>
                        <span className="font-medium">+45,230 TWIST</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Last 30 Days</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Avg APY</span>
                        <span className="font-medium">11.8%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">New Stakers</span>
                        <span className="font-medium">87</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Staked</span>
                        <span className="font-medium">+125,450 TWIST</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'stakers' && (
              <div className="space-y-6">
                {/* Top Stakers */}
                {details.topStakers?.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-4">Top Stakers</h3>
                    <div className="space-y-2">
                      {details.topStakers.map((staker: any) => (
                        <div key={staker.rank} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                              {staker.rank}
                            </div>
                            <div>
                              <p className="font-medium">{staker.userId}</p>
                              <p className="text-sm text-gray-600">{staker.percentage}% of pool</p>
                            </div>
                          </div>
                          <p className="font-bold">{formatToken(staker.amount)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Distribution Chart */}
                <div>
                  <h3 className="font-semibold mb-4">Stake Distribution</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 text-center">
                      Distribution visualization coming soon
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t">
            <button
              onClick={onStake}
              className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              Stake on {details.influencer.displayName}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}> = ({ icon, label, value, valueClass = '' }) => (
  <div className="bg-gray-50 rounded-lg p-4">
    <div className="flex items-center gap-2 text-gray-600 mb-2">
      <div className="w-5 h-5">{icon}</div>
      <p className="text-sm">{label}</p>
    </div>
    <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
  </div>
);

const getTierColor = (tier: string) => {
  const colors = {
    BRONZE: 'bg-orange-100 text-orange-800 border-orange-200',
    SILVER: 'bg-gray-100 text-gray-800 border-gray-200',
    GOLD: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    PLATINUM: 'bg-purple-100 text-purple-800 border-purple-200',
  };
  return colors[tier as keyof typeof colors] || colors.BRONZE;
};