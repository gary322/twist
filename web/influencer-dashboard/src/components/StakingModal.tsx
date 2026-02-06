import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { api } from '../services/api';
import { formatToken } from '../utils/format';

interface StakingModalProps {
  influencer: any;
  onClose: () => void;
  onSuccess: () => void;
}

export const StakingModal: React.FC<StakingModalProps> = ({
  influencer,
  onClose,
  onSuccess,
}) => {
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const minStake = 1000; // 1000 TWIST minimum
  const estimatedApy = influencer.metrics.apy;

  const handleStake = async () => {
    if (!publicKey) {
      setError('Please connect your wallet');
      return;
    }

    const stakeAmount = parseFloat(amount);
    if (!stakeAmount || stakeAmount < minStake) {
      setError(`Minimum stake is ${minStake} TWIST`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Convert to smallest unit (9 decimals)
      const amountInSmallestUnit = (stakeAmount * 10 ** 9).toString();

      await api.stakeOnInfluencer({
        influencerId: influencer.id,
        amount: amountInSmallestUnit,
        wallet: publicKey.toString(),
      });

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Staking failed');
    } finally {
      setLoading(false);
    }
  };

  const calculateEstimatedRewards = () => {
    const stakeAmount = parseFloat(amount) || 0;
    const yearlyRewards = stakeAmount * (estimatedApy / 100);
    const monthlyRewards = yearlyRewards / 12;
    return {
      yearly: yearlyRewards.toFixed(2),
      monthly: monthlyRewards.toFixed(2),
    };
  };

  const rewards = calculateEstimatedRewards();

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
          className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold">Stake on {influencer.displayName}</h2>
              <p className="text-gray-600 mt-1">
                Earn {influencer.metrics.revenueSharePercent}% of their revenue
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Influencer Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <img
                src={influencer.avatar}
                alt={influencer.username}
                className="w-12 h-12 rounded-full"
              />
              <div>
                <p className="font-medium">{influencer.displayName}</p>
                <p className="text-sm text-gray-600">
                  {influencer.tier} Tier • {influencer.metrics.stakerCount} stakers
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-600">Total Staked</p>
                <p className="font-medium">{formatToken(influencer.metrics.totalStaked)}</p>
              </div>
              <div>
                <p className="text-gray-600">Current APY</p>
                <p className="font-medium text-green-600">{estimatedApy.toFixed(2)}%</p>
              </div>
            </div>
          </div>

          {/* Stake Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Amount to Stake
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Min ${minStake} TWIST`}
                className="w-full px-4 py-3 pr-20 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="absolute right-4 top-3.5 text-gray-500">
                TWIST
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Minimum stake: {minStake} TWIST
            </p>
          </div>

          {/* Estimated Rewards */}
          {amount && parseFloat(amount) >= minStake && (
            <div className="bg-purple-50 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-purple-900 mb-2">
                Estimated Rewards
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-purple-700">Monthly</p>
                  <p className="font-bold text-purple-900">
                    ~{rewards.monthly} TWIST
                  </p>
                </div>
                <div>
                  <p className="text-purple-700">Yearly</p>
                  <p className="font-bold text-purple-900">
                    ~{rewards.yearly} TWIST
                  </p>
                </div>
              </div>
              <p className="text-xs text-purple-700 mt-2">
                *Based on current {estimatedApy.toFixed(2)}% APY
              </p>
            </div>
          )}

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="text-red-600" size={20} />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="text-green-600" size={20} />
              <p className="text-sm text-green-800">
                Successfully staked! Redirecting...
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleStake}
              className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={loading || !amount || parseFloat(amount) < minStake}
            >
              {loading ? (
                <>
                  <Loader className="animate-spin" size={20} />
                  Processing...
                </>
              ) : (
                'Stake TWIST'
              )}
            </button>
          </div>

          {/* Info */}
          <p className="text-xs text-gray-500 text-center mt-4">
            You can unstake your tokens at any time
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};