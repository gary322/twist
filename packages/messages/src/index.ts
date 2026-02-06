export interface Message {
  type: string;
  source: string;
  data: any;
  timestamp: Date;
  id: string;
}

export class MessageFactory {
  static createMessage(type: string, source: string, data: any): Message {
    return {
      type,
      source,
      data,
      timestamp: new Date(),
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }
}

export const MESSAGE_TOPICS = {
  INFLUENCER: {
    REGISTERED: 'influencer.registered',
    PROFILE_UPDATED: 'influencer.profile.updated',
    TIER_CHANGED: 'influencer.tier.changed',
    STAKED: 'influencer.staked',
    UNSTAKED: 'influencer.unstaked',
    REWARDS_CLAIMED: 'influencer.rewards.claimed',
  },
  STAKING: {
    POOL_CREATED: 'staking.pool.created',
    POOL_UPDATED: 'staking.pool.updated',
    REWARDS_DISTRIBUTED: 'staking.rewards.distributed',
  },
  LINK: {
    CREATED: 'link.created',
    CLICKED: 'link.clicked',
    CONVERTED: 'link.converted',
  },
};