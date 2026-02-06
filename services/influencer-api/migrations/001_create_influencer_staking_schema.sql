-- Influencer staking tables
CREATE TABLE influencer_staking_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id) UNIQUE,
  pool_address VARCHAR(44) NOT NULL UNIQUE,
  total_staked BIGINT DEFAULT 0,
  staker_count INTEGER DEFAULT 0,
  revenue_share_bps INTEGER NOT NULL CHECK (revenue_share_bps <= 5000),
  min_stake BIGINT DEFAULT 1000000000, -- 1 TWIST minimum
  total_rewards_distributed BIGINT DEFAULT 0,
  pending_rewards BIGINT DEFAULT 0,
  current_apy DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_stakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL, -- email hash
  pool_id UUID REFERENCES influencer_staking_pools(id),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  staked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_claim TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_claimed BIGINT DEFAULT 0,
  pending_rewards BIGINT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  unstake_requested_at TIMESTAMP,
  UNIQUE(user_id, pool_id)
);

CREATE TABLE staking_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES influencer_staking_pools(id),
  earning_amount BIGINT NOT NULL,
  staker_share BIGINT NOT NULL,
  influencer_share BIGINT NOT NULL,
  distributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  transaction_id VARCHAR(88)
);

CREATE TABLE staking_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL,
  pool_id UUID REFERENCES influencer_staking_pools(id),
  action VARCHAR(20) NOT NULL, -- 'stake', 'unstake', 'claim'
  amount BIGINT NOT NULL,
  transaction_id VARCHAR(88),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Influencer profiles and tiers
CREATE TABLE IF NOT EXISTS influencers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  email_hash VARCHAR(64) NOT NULL,
  wallet_address VARCHAR(44),
  tier VARCHAR(20) DEFAULT 'BRONZE',
  verified BOOLEAN DEFAULT false,
  total_conversions INTEGER DEFAULT 0,
  total_earned BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE influencer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id) UNIQUE,
  display_name VARCHAR(100),
  bio TEXT,
  avatar VARCHAR(500),
  cover_image VARCHAR(500),
  social_links JSONB DEFAULT '{}',
  categories TEXT[],
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE influencer_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id),
  product_id VARCHAR(100) NOT NULL,
  link_code VARCHAR(20) UNIQUE NOT NULL,
  promo_code VARCHAR(50),
  custom_url VARCHAR(200),
  qr_code_url VARCHAR(500),
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  earned BIGINT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

-- Analytics tables
CREATE TABLE influencer_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id),
  date DATE NOT NULL,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  earned BIGINT DEFAULT 0,
  new_stakers INTEGER DEFAULT 0,
  total_staked_change BIGINT DEFAULT 0,
  UNIQUE(influencer_id, date)
);

-- Indexes for performance
CREATE INDEX idx_staking_pools_active ON influencer_staking_pools(is_active, total_staked DESC);
CREATE INDEX idx_staking_pools_influencer ON influencer_staking_pools(influencer_id);
CREATE INDEX idx_user_stakes_user ON user_stakes(user_id, is_active);
CREATE INDEX idx_user_stakes_pool ON user_stakes(pool_id, is_active);
CREATE INDEX idx_staking_rewards_pool_date ON staking_rewards(pool_id, distributed_at DESC);
CREATE INDEX idx_staking_history_user ON staking_history(user_id, created_at DESC);
CREATE INDEX idx_influencers_tier ON influencers(tier, total_earned DESC);
CREATE INDEX idx_influencer_links_active ON influencer_links(influencer_id, is_active);
CREATE INDEX idx_influencer_analytics_date ON influencer_analytics_daily(influencer_id, date DESC);

-- Triggers
CREATE OR REPLACE FUNCTION update_influencer_tier()
RETURNS TRIGGER AS $$
DECLARE
  total_staked BIGINT;
  new_tier VARCHAR(20);
BEGIN
  SELECT total_staked INTO total_staked
  FROM influencer_staking_pools
  WHERE influencer_id = NEW.influencer_id;

  -- Calculate tier based on total staked (in smallest units)
  IF total_staked >= 50000000000000 THEN -- 50K TWIST
    new_tier := 'PLATINUM';
  ELSIF total_staked >= 10000000000000 THEN -- 10K TWIST
    new_tier := 'GOLD';
  ELSIF total_staked >= 1000000000000 THEN -- 1K TWIST
    new_tier := 'SILVER';
  ELSE
    new_tier := 'BRONZE';
  END IF;

  UPDATE influencers
  SET tier = new_tier, updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.influencer_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tier_on_stake_change
AFTER UPDATE OF total_staked ON influencer_staking_pools
FOR EACH ROW
EXECUTE FUNCTION update_influencer_tier();