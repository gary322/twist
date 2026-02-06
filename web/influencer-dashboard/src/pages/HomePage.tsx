import React from 'react';
import { Link } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { TrendingUp, Users, Shield, Zap } from 'lucide-react';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-purple-600">Twist Staking</h1>
          <div className="flex items-center gap-4">
            <Link
              to="/staking"
              className="px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
            >
              Browse Influencers
            </Link>
            <WalletMultiButton />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-gray-900 mb-4">
            Stake on Your Favorite Influencers
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Earn a share of influencer revenue by staking TWIST tokens. 
            Support creators while growing your portfolio with up to 50% revenue sharing.
          </p>
          <Link
            to="/staking"
            className="inline-block px-8 py-4 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
          >
            Start Staking Now
          </Link>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <FeatureCard
            icon={<TrendingUp className="w-8 h-8 text-purple-600" />}
            title="High APY Returns"
            description="Earn competitive yields through revenue sharing with top influencers"
          />
          <FeatureCard
            icon={<Users className="w-8 h-8 text-purple-600" />}
            title="Community Driven"
            description="Join thousands of stakers supporting the creator economy"
          />
          <FeatureCard
            icon={<Shield className="w-8 h-8 text-purple-600" />}
            title="Secure & Audited"
            description="Built on Solana with audited smart contracts for maximum security"
          />
          <FeatureCard
            icon={<Zap className="w-8 h-8 text-purple-600" />}
            title="Instant Rewards"
            description="Claim your rewards anytime with instant on-chain settlement"
          />
        </div>

        {/* Stats */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h3 className="text-2xl font-bold text-center mb-8">Platform Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <StatCard label="Total Value Staked" value="12.5M TWIST" />
            <StatCard label="Active Stakers" value="3,847" />
            <StatCard label="Average APY" value="14.2%" />
            <StatCard label="Verified Influencers" value="156" />
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <h3 className="text-3xl font-bold mb-4">Ready to Start Earning?</h3>
          <p className="text-gray-600 mb-8">
            Connect your wallet and start staking on top-performing influencers today
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/staking"
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Browse Influencers
            </Link>
            <a
              href="#"
              className="px-6 py-3 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors"
            >
              Learn More
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

const FeatureCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <div className="bg-white p-6 rounded-xl shadow-lg">
    <div className="mb-4">{icon}</div>
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-gray-600">{description}</p>
  </div>
);

const StatCard: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => (
  <div className="text-center">
    <p className="text-3xl font-bold text-purple-600 mb-2">{value}</p>
    <p className="text-gray-600">{label}</p>
  </div>
);

export default HomePage;