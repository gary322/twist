import React, { useState } from 'react';
import { formatToken, formatTimeAgo } from '../utils/format';
import { UserStake, MessageType } from '../../../types';

interface WalletPageProps {
  balance: bigint;
  stakes: UserStake[];
}

export const WalletPage: React.FC<WalletPageProps> = ({ balance, stakes }) => {
  const [claimingRewards, setClaimingRewards] = useState<string | null>(null);

  const totalStaked = stakes.reduce(
    (sum, s) => sum + BigInt(s.stake.amount),
    BigInt(0)
  );

  const totalPendingRewards = stakes.reduce(
    (sum, s) => sum + BigInt(s.stake.pendingRewards),
    BigInt(0)
  );

  const handleClaimRewards = async (influencerId: string) => {
    setClaimingRewards(influencerId);
    try {
      await chrome.runtime.sendMessage({
        type: MessageType.CLAIM_REWARDS,
        payload: { influencerId }
      });
    } catch (error) {
      console.error('Failed to claim rewards:', error);
    } finally {
      setClaimingRewards(null);
    }
  };

  const handleClaimAll = async () => {
    for (const stake of stakes) {
      if (BigInt(stake.stake.pendingRewards) > BigInt(0)) {
        await handleClaimRewards(stake.influencer.id);
      }
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Balance Overview */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-lg p-4 text-white">
        <h2 className="text-sm opacity-90 mb-1">Total Balance</h2>
        <div className="text-2xl font-bold mb-2">
          {formatToken(balance)} TWIST
        </div>
        <div className="text-sm opacity-75">
          ≈ ${((Number(balance) / 10 ** 9) * 0.05).toFixed(2)} USD
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-600 text-sm">Staked</span>
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="font-semibold">{formatToken(totalStaked)}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-600 text-sm">Rewards</span>
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="font-semibold text-green-600">{formatToken(totalPendingRewards)}</p>
        </div>
      </div>

      {/* Claim All Button */}
      {totalPendingRewards > BigInt(0) && (
        <button
          onClick={handleClaimAll}
          className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          Claim All Rewards ({formatToken(totalPendingRewards)} TWIST)
        </button>
      )}

      {/* Stakes List */}
      <div className="space-y-3">
        <h3 className="font-semibold">Your Stakes</h3>
        {stakes.length > 0 ? (
          stakes.map((stake) => (
            <div key={stake.influencer.id} className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={stake.influencer.avatar || 'https://via.placeholder.com/48'}
                    alt=""
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <h4 className="font-medium">{stake.influencer.displayName}</h4>
                    <p className="text-sm text-gray-500">@{stake.influencer.username}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Staked {formatTimeAgo(stake.stake.stakedAt)}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  stake.influencer.tier === 'PLATINUM' ? 'bg-purple-100 text-purple-800' :
                  stake.influencer.tier === 'GOLD' ? 'bg-yellow-100 text-yellow-800' :
                  stake.influencer.tier === 'SILVER' ? 'bg-gray-100 text-gray-800' :
                  'bg-orange-100 text-orange-800'
                }`}>
                  {stake.influencer.tier}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Amount Staked</span>
                  <span className="font-medium">{formatToken(stake.stake.amount)} TWIST</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Current APY</span>
                  <span className="font-medium text-green-600">{stake.stake.apy}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pending Rewards</span>
                  <span className="font-medium text-green-600">
                    {formatToken(stake.stake.pendingRewards)} TWIST
                  </span>
                </div>
              </div>

              {BigInt(stake.stake.pendingRewards) > BigInt(0) && (
                <button
                  onClick={() => handleClaimRewards(stake.influencer.id)}
                  disabled={claimingRewards === stake.influencer.id}
                  className={`w-full mt-3 py-2 rounded-lg transition-colors ${
                    claimingRewards === stake.influencer.id
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {claimingRewards === stake.influencer.id ? 'Claiming...' : 'Claim Rewards'}
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            <svg className="mx-auto text-gray-300 mb-3 w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p>No active stakes yet</p>
            <button
              onClick={() => {
                // Switch to search tab
                const event = new CustomEvent('switchTab', { detail: 'search' });
                window.dispatchEvent(event);
              }}
              className="mt-3 text-purple-600 hover:underline text-sm"
            >
              Find influencers to stake on →
            </button>
          </div>
        )}
      </div>

      {/* Transaction History Link */}
      <div className="pt-2">
        <button
          onClick={() => {
            chrome.tabs.create({ url: 'https://twist.to/transactions' });
          }}
          className="w-full text-center text-purple-600 hover:underline text-sm"
        >
          View transaction history →
        </button>
      </div>
    </div>
  );
};