import React from 'react';
import { formatToken } from '../utils/format';
import { UserIdentity, UserStake } from '../../../types';

interface HomePageProps {
  userIdentity: UserIdentity | null;
  balance: bigint;
  stakes: UserStake[];
  detectedInfluencer: any;
  onIdentify: (email: string) => void;
  onStake: (influencer: any) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  userIdentity,
  balance,
  stakes,
  detectedInfluencer,
  onIdentify,
  onStake,
}) => {
  const totalStaked = stakes.reduce(
    (sum, s) => sum + BigInt(s.stake.amount),
    BigInt(0)
  );

  const totalPendingRewards = stakes.reduce(
    (sum, s) => sum + BigInt(s.stake.pendingRewards),
    BigInt(0)
  );

  if (!userIdentity) {
    return (
      <div className="p-6 text-center">
        <img 
          src="/assets/icon-128.png" 
          alt="TWIST" 
          className="w-20 h-20 mx-auto mb-4"
        />
        <h2 className="text-xl font-bold mb-2">Welcome to TWIST</h2>
        <p className="text-gray-600 mb-6">
          Earn tokens while browsing and stake on influencers
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const email = (e.target as any).email.value;
            onIdentify(email);
          }}
          className="space-y-4"
        >
          <input
            type="email"
            name="email"
            placeholder="Enter your email"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          />
          <button
            type="submit"
            className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700"
          >
            Get Started
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Balance Card */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Your Balance</h2>
          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="text-2xl font-bold text-purple-600">
          {formatToken(balance)} TWIST
        </div>
        <div className="text-sm text-gray-500">
          ≈ ${((Number(balance) / 10 ** 9) * 0.05).toFixed(2)} USD
        </div>
      </div>

      {/* Staking Overview */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="font-semibold mb-3">Staking Overview</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Staked</span>
            <span className="font-medium">{formatToken(totalStaked)} TWIST</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Active Stakes</span>
            <span className="font-medium">{stakes.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Pending Rewards</span>
            <span className="font-medium text-green-600">
              {formatToken(totalPendingRewards)} TWIST
            </span>
          </div>
        </div>

        {totalPendingRewards > BigInt(10 * 10 ** 9) && (
          <button className="w-full mt-3 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700">
            Claim All Rewards
          </button>
        )}
      </div>

      {/* Detected Influencer */}
      {detectedInfluencer && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h4 className="font-semibold text-purple-900">
                Influencer Detected!
              </h4>
              <p className="text-sm text-purple-700 mt-1">
                {detectedInfluencer.influencer.displayName} is on TWIST
              </p>
              <div className="flex items-center gap-2 mt-2 text-sm">
                <span className="text-purple-600">
                  {detectedInfluencer.influencer.metrics.apy}% APY
                </span>
                <span className="text-purple-500">•</span>
                <span className="text-purple-600">
                  {detectedInfluencer.influencer.metrics.stakerCount} stakers
                </span>
              </div>
              <button
                onClick={() => onStake(detectedInfluencer.influencer)}
                className="mt-3 bg-purple-600 text-white px-4 py-1 rounded text-sm hover:bg-purple-700"
              >
                Stake Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Stakes */}
      {stakes.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-3">Your Stakes</h3>
          <div className="space-y-3">
            {stakes.slice(0, 3).map((stake) => (
              <div
                key={stake.influencer.id}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={stake.influencer.avatar || 'https://via.placeholder.com/40'}
                    alt=""
                    className="w-10 h-10 rounded-full"
                  />
                  <div>
                    <p className="font-medium text-sm">
                      {stake.influencer.displayName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatToken(stake.stake.amount)} staked
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-green-600">
                    +{formatToken(stake.stake.pendingRewards)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {stake.stake.apy}% APY
                  </p>
                </div>
              </div>
            ))}
          </div>

          {stakes.length > 3 && (
            <button
              className="w-full mt-3 text-purple-600 text-sm hover:underline"
            >
              View all {stakes.length} stakes →
            </button>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            chrome.tabs.create({ url: 'https://twist.to/influencers' });
          }}
          className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow"
        >
          <svg className="w-6 h-6 text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <p className="text-sm font-medium">Top Influencers</p>
        </button>
        <button
          onClick={() => {
            chrome.tabs.create({ url: 'https://twist.to/dashboard' });
          }}
          className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow"
        >
          <svg className="w-6 h-6 text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-sm font-medium">Dashboard</p>
        </button>
      </div>
    </div>
  );
};