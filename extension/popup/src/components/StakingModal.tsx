import React, { useState } from 'react';
import { formatToken } from '../utils/format';
import { Influencer, MessageType } from '../../../types';

interface StakingModalProps {
  influencer: Influencer;
  balance: bigint;
  onClose: () => void;
  onSuccess: () => void;
}

export const StakingModal: React.FC<StakingModalProps> = ({
  influencer,
  balance,
  onClose,
  onSuccess,
}) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const maxAmount = Number(balance) / 10 ** 9;
  const minAmount = 10; // Minimum 10 TWIST

  const handleStake = async () => {
    const stakeAmount = parseFloat(amount);
    
    if (isNaN(stakeAmount) || stakeAmount < minAmount) {
      setError(`Minimum stake amount is ${minAmount} TWIST`);
      return;
    }
    
    if (stakeAmount > maxAmount) {
      setError('Insufficient balance');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.STAKE,
        payload: {
          influencerId: influencer.id,
          amount: stakeAmount * 10 ** 9,
        },
      });

      if (response.success) {
        onSuccess();
      } else {
        setError(response.error || 'Failed to stake');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to stake');
    } finally {
      setLoading(false);
    }
  };

  const setPercentage = (percentage: number) => {
    const value = (maxAmount * percentage / 100).toFixed(2);
    setAmount(value);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Stake on {influencer.displayName}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Influencer Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <img
              src={influencer.avatar || 'https://via.placeholder.com/48'}
              alt=""
              className="w-12 h-12 rounded-full"
            />
            <div className="flex-1">
              <h3 className="font-medium">{influencer.displayName}</h3>
              <p className="text-sm text-gray-500">@{influencer.username}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              influencer.tier === 'PLATINUM' ? 'bg-purple-100 text-purple-800' :
              influencer.tier === 'GOLD' ? 'bg-yellow-100 text-yellow-800' :
              influencer.tier === 'SILVER' ? 'bg-gray-100 text-gray-800' :
              'bg-orange-100 text-orange-800'
            }`}>
              {influencer.tier}
            </span>
          </div>
          
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-gray-500">Total Staked</p>
              <p className="text-sm font-medium">{formatToken(influencer.metrics.totalStaked)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">APY</p>
              <p className="text-sm font-medium text-green-600">{influencer.metrics.apy}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Stakers</p>
              <p className="text-sm font-medium">{influencer.metrics.stakerCount}</p>
            </div>
          </div>
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Stake Amount
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 pr-16 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              step="0.01"
              min={minAmount}
              max={maxAmount}
            />
            <span className="absolute right-4 top-3.5 text-gray-500">TWIST</span>
          </div>
          
          {/* Quick Amount Buttons */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setPercentage(25)}
              className="flex-1 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
            >
              25%
            </button>
            <button
              onClick={() => setPercentage(50)}
              className="flex-1 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
            >
              50%
            </button>
            <button
              onClick={() => setPercentage(75)}
              className="flex-1 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
            >
              75%
            </button>
            <button
              onClick={() => setPercentage(100)}
              className="flex-1 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
            >
              MAX
            </button>
          </div>
          
          <p className="text-xs text-gray-500 mt-2">
            Available: {formatToken(balance)} TWIST
          </p>
        </div>

        {/* Estimated Returns */}
        {amount && parseFloat(amount) >= minAmount && (
          <div className="bg-green-50 rounded-lg p-3 mb-4">
            <p className="text-sm text-green-800">
              Estimated yearly return: {' '}
              <span className="font-medium">
                {formatToken(parseFloat(amount) * influencer.metrics.apy / 100 * 10 ** 9)} TWIST
              </span>
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleStake}
            disabled={loading || !amount || parseFloat(amount) < minAmount}
            className={`flex-1 py-2 rounded-lg transition-colors ${
              loading || !amount || parseFloat(amount) < minAmount
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {loading ? 'Staking...' : 'Stake'}
          </button>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-500 text-center mt-4">
          By staking, you agree to lock your tokens. APY rates may change.
        </p>
      </div>
    </div>
  );
};