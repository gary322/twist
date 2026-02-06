# Browser Extension Campaign Marketplace

## Overview

The Campaign Marketplace is the core interface within the AHEE browser extension where influencers discover advertising campaigns, create personalized referral codes, and track their earnings in real-time. This creates a decentralized marketplace connecting advertisers with influencers through transparent, instant-settling smart contracts.

## Architecture

### Component Structure

```
browser-extension/
├── marketplace/
│   ├── CampaignBrowser.tsx      # Main campaign listing
│   ├── CampaignDetails.tsx      # Individual campaign view
│   ├── CodeGenerator.tsx        # Referral code creation
│   ├── InfluencerDashboard.tsx  # Earnings & analytics
│   └── ActionTracker.tsx        # Real-time action monitoring
├── services/
│   ├── CampaignService.ts       # Campaign data fetching
│   ├── CodeService.ts           # Code generation/validation
│   └── SettlementService.ts     # Payment tracking
└── state/
    ├── campaignStore.ts         # Campaign state management
    └── influencerStore.ts       # Influencer data cache
```

## User Interface

### 1. Campaign Browser

```typescript
interface CampaignBrowserUI {
  // Main marketplace view
  sections: {
    featured: Campaign[];      // High-budget campaigns
    trending: Campaign[];      // High-activity campaigns
    newListings: Campaign[];   // Recently posted
    categories: Category[];    // Filter by industry
  };
  
  // Search and filter
  filters: {
    minBudget: number;
    maxBudget: number;
    rewardTypes: ActionType[];
    industries: string[];
    payoutRates: Range;
  };
  
  // Sort options
  sortBy: 'budget' | 'payoutRate' | 'timeRemaining' | 'popularity';
}
```

**UI Mock-up:**
```
┌─────────────────────────────────────────────────┐
│ 🛍️ Campaign Marketplace                          │
├─────────────────────────────────────────────────┤
│ [Search campaigns...]  [Filters ▼] [Sort: Best] │
├─────────────────────────────────────────────────┤
│ 💎 Featured Campaigns                           │
│ ┌─────────────────────────────────────────────┐ │
│ │ Nike Air Max 2024                           │ │
│ │ 📊 10,000 AC-D remaining | 💰 30-50 AC-D/action│
│ │ 👥 127 influencers active                   │ │
│ │ [View Details]                              │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ 🔥 Trending Now                                │
│ ┌─────────────────────────────────────────────┐ │
│ │ HelloFresh Spring Special                   │ │
│ │ 📊 5,420 AC-D remaining | 💰 20-100 AC-D/action│
│ │ ⏱️ 14 days left | 🎯 Food & Beverage       │ │
│ │ [Quick Join] [Details]                      │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 2. Campaign Details View

```typescript
interface CampaignDetailsUI {
  // Campaign info
  header: {
    brand: string;
    product: string;
    logo: string;
    totalBudget: number;
    remainingBudget: number;
    endDate: Date;
  };
  
  // Action rewards
  rewardStructure: {
    actions: Array<{
      type: 'visit' | 'signup' | 'trial' | 'purchase' | 'custom';
      description: string;
      reward: number;
      requirements: string[];
      trackingMethod: 'auto' | 'webhook' | 'manual';
    }>;
  };
  
  // Performance metrics
  stats: {
    activeInfluencers: number;
    totalConversions: number;
    avgEarningsPerInfluencer: number;
    topPerformers: InfluencerPreview[];
  };
  
  // Join campaign
  joinOptions: {
    codeCustomization: boolean;
    exclusivity: boolean;
    minimumFollowers: number;
  };
}
```

**UI Mock-up:**
```
┌─────────────────────────────────────────────────┐
│ ← Back to Marketplace                           │
├─────────────────────────────────────────────────┤
│ [Nike Logo] Nike Air Max 2024 Launch           │
│ 💰 10,000 / 25,000 AC-D remaining              │
│ ⏱️ Ends in 21 days                             │
├─────────────────────────────────────────────────┤
│ 📋 Reward Structure                             │
│ ┌─────────────────────────────────────────────┐ │
│ │ ✓ Store Visit (verified): 2 AC-D           │ │
│ │   • Min 30 seconds on site                  │ │
│ │   • Hardware attestation required           │ │
│ │                                             │ │
│ │ ✓ Email Signup: 30 AC-D                    │ │
│ │   • Valid email required                    │ │
│ │   • One per user                           │ │
│ │                                             │ │
│ │ ✓ Purchase: 50 AC-D + 2% of sale          │ │
│ │   • Tracked via checkout                    │ │
│ │   • Bonus scales with order size           │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ 📊 Campaign Performance                         │
│ Active Influencers: 127                        │
│ Total Conversions: 3,421                       │
│ Avg Earnings: 198 AC-D per influencer          │
├─────────────────────────────────────────────────┤
│ [Generate My Code] [View Contract]              │
└─────────────────────────────────────────────────┘
```

### 3. Code Generator

```typescript
interface CodeGeneratorUI {
  campaign: Campaign;
  
  // Code customization
  options: {
    suggestedCodes: string[];      // AI-generated suggestions
    customCode: {
      prefix: string;               // e.g., "NIKE"
      suffix: string;               // e.g., "SARAH"
      separator: string;            // e.g., "-"
      validation: RegExp;           // Code format rules
    };
  };
  
  // Generated assets
  output: {
    referralCode: string;           // e.g., "NIKE-SARAH-2024"
    trackingLinks: {
      website: string;              // nike.com?ref=NIKE-SARAH-2024
      deeplinkMobile: string;       // nike://ref/NIKE-SARAH-2024
      qrCode: string;               // Base64 QR image
    };
    socialAssets: {
      copyText: string[];           // Pre-written posts
      graphics: string[];           // Branded images
      videoTemplates: string[];     // Editable videos
    };
  };
}
```

**UI Mock-up:**
```
┌─────────────────────────────────────────────────┐
│ 🎯 Create Your Campaign Code                     │
├─────────────────────────────────────────────────┤
│ Campaign: Nike Air Max 2024                     │
├─────────────────────────────────────────────────┤
│ Choose or Create Your Code:                     │
│                                                 │
│ ○ NIKE-SARAH-24    (suggested)                 │
│ ○ AIRMAX-SARAH     (suggested)                 │
│ ○ SNEAKER-QUEEN    (suggested)                 │
│ ● Custom: [NIKE]-[MYSNEAKERS]                  │
│                                                 │
│ Preview: nike.com?ref=NIKE-MYSNEAKERS          │
├─────────────────────────────────────────────────┤
│ 📱 Your Tracking Links:                         │
│ ┌─────────────────────────────────────────────┐ │
│ │ Website Link:                               │ │
│ │ [nike.com?ref=NIKE-MYSNEAKERS] [Copy]      │ │
│ │                                             │ │
│ │ QR Code: [QR Image]                         │ │
│ │ [Download]                                  │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ 📝 Suggested Posts:                             │
│ "Check out the new Nike Air Max! Use my code   │
│  NIKE-MYSNEAKERS for exclusive access 👟"      │
│ [Copy] [Customize]                              │
├─────────────────────────────────────────────────┤
│ [Create Code & Start Earning]                   │
└─────────────────────────────────────────────────┘
```

### 4. Influencer Dashboard

```typescript
interface InfluencerDashboardUI {
  // Overview stats
  summary: {
    totalEarnings: {
      today: number;
      week: number;
      month: number;
      allTime: number;
    };
    activeCampaigns: number;
    pendingPayouts: number;
    performanceRank: number;  // Among all influencers
  };
  
  // Active campaigns
  campaigns: Array<{
    campaign: Campaign;
    myCode: string;
    stats: {
      clicks: number;
      conversions: Map<ActionType, number>;
      earnings: number;
      rank: number;  // Within campaign
    };
    recentActivity: Activity[];
  }>;
  
  // Earnings timeline
  earningsGraph: {
    period: 'day' | 'week' | 'month';
    data: Array<{
      timestamp: Date;
      amount: number;
      campaign: string;
      action: string;
    }>;
  };
  
  // Payout options
  payoutSettings: {
    autoConvert: boolean;
    threshold: number;
    destination: 'wallet' | 'bank' | 'paypal';
  };
}
```

**UI Mock-up:**
```
┌─────────────────────────────────────────────────┐
│ 💼 Influencer Dashboard                          │
├─────────────────────────────────────────────────┤
│ 💰 Earnings Overview                            │
│ Today: 234 AC-D | Week: 1,892 AC-D             │
│ Month: 7,234 AC-D | All-time: 45,291 AC-D      │
│ [Cash Out: $723.40]                             │
├─────────────────────────────────────────────────┤
│ 📊 Active Campaigns (3)                         │
│ ┌─────────────────────────────────────────────┐ │
│ │ Nike Air Max | Code: NIKE-MYSNEAKERS       │ │
│ │ Clicks: 342 | Signups: 28 | Purchases: 7   │ │
│ │ Earned: 456 AC-D | Rank: #12 of 127        │ │
│ │ [View Details] [Get Links] [Share]          │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ HelloFresh | Code: FRESH-SARAH             │ │
│ │ Clicks: 127 | Trials: 19                   │ │
│ │ Earned: 380 AC-D | Rank: #5 of 43          │ │
│ │ [View Details] [Get Links] [Share]          │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ 📈 Recent Activity                              │
│ • 2 min ago: Signup via NIKE-MYSNEAKERS (+30)  │
│ • 15 min ago: Visit via FRESH-SARAH (+2)       │
│ • 23 min ago: Purchase via NIKE-MYSNEAKERS (+52)│
│ [View All Activity]                             │
└─────────────────────────────────────────────────┘
```

## Core Functions

### 1. Campaign Discovery

```typescript
class CampaignService {
  async fetchAvailableCampaigns(filters?: CampaignFilters): Promise<Campaign[]> {
    // Query on-chain program for active campaigns
    const campaigns = await connection.getProgramAccounts(
      CAMPAIGN_ROUTER_PROGRAM,
      {
        filters: [
          { dataSize: CAMPAIGN_SIZE },
          { memcmp: { offset: 0, bytes: ACTIVE_STATUS } }
        ]
      }
    );
    
    // Apply client-side filters
    return campaigns
      .map(c => decodeCampaign(c.account.data))
      .filter(c => c.remainingBudget > 0)
      .filter(c => matchesFilters(c, filters))
      .sort((a, b) => sortCampaigns(a, b, filters?.sortBy));
  }
  
  async getCampaignDetails(campaignId: string): Promise<CampaignDetails> {
    const campaign = await connection.getAccountInfo(campaignId);
    const details = decodeCampaignDetails(campaign.data);
    
    // Fetch real-time stats
    const stats = await this.fetchCampaignStats(campaignId);
    
    return { ...details, stats };
  }
}
```

### 2. Code Generation

```typescript
class CodeGeneratorService {
  async generateCode(
    campaignId: string,
    influencerId: string,
    customCode?: string
  ): Promise<ReferralCode> {
    // Validate code uniqueness
    const code = customCode || this.generateUniqueCode(campaignId, influencerId);
    const isUnique = await this.checkCodeUniqueness(code);
    
    if (!isUnique) {
      throw new Error('Code already taken');
    }
    
    // Register code on-chain
    const tx = await program.methods
      .registerInfluencerCode({
        campaign: campaignId,
        influencer: influencerId,
        code: code
      })
      .rpc();
    
    // Generate tracking assets
    const trackingLinks = this.generateTrackingLinks(campaignId, code);
    const socialAssets = await this.generateSocialAssets(campaignId, code);
    
    return {
      code,
      campaignId,
      trackingLinks,
      socialAssets,
      transaction: tx
    };
  }
  
  private generateTrackingLinks(campaignId: string, code: string): TrackingLinks {
    const campaign = this.getCampaign(campaignId);
    const baseUrl = campaign.targetUrl;
    
    return {
      website: `${baseUrl}?ref=${code}`,
      deeplinkMobile: `${campaign.appScheme}://ref/${code}`,
      qrCode: QRCode.toDataURL(`${baseUrl}?ref=${code}`)
    };
  }
}
```

### 3. Real-Time Action Tracking

```typescript
class ActionTracker {
  private ws: WebSocket;
  private subscriptions: Map<string, Subscription>;
  
  async trackCampaignActions(
    campaignId: string,
    influencerCode: string,
    onAction: (action: Action) => void
  ) {
    // Subscribe to on-chain events
    const subscription = connection.onAccountChange(
      campaignId,
      (accountInfo) => {
        const campaign = decodeCampaign(accountInfo.data);
        const newActions = this.detectNewActions(campaign, influencerCode);
        
        newActions.forEach(action => {
          // Verify action is for this influencer
          if (action.referralCode === influencerCode) {
            onAction(action);
            this.processReward(action);
          }
        });
      }
    );
    
    this.subscriptions.set(campaignId, subscription);
    
    // Also listen to webhook events for faster updates
    this.ws.on('message', (data) => {
      const event = JSON.parse(data);
      if (event.type === 'action' && event.code === influencerCode) {
        onAction(event.action);
      }
    });
  }
  
  private async processReward(action: Action) {
    // Instant settlement
    const reward = this.calculateReward(action);
    
    await program.methods
      .settleInfluencerReward({
        campaign: action.campaignId,
        influencer: action.influencerId,
        action: action.type,
        amount: reward
      })
      .rpc();
  }
}
```

### 4. Earnings Management

```typescript
class EarningsService {
  async getInfluencerEarnings(
    influencerId: string,
    timeframe?: TimeFrame
  ): Promise<EarningsSummary> {
    // Fetch all settlements for influencer
    const settlements = await connection.getProgramAccounts(
      CAMPAIGN_ROUTER_PROGRAM,
      {
        filters: [
          { dataSize: SETTLEMENT_SIZE },
          { memcmp: { offset: 8, bytes: influencerId } }
        ]
      }
    );
    
    // Calculate earnings by period
    const earnings = settlements
      .map(s => decodeSettlement(s.account.data))
      .filter(s => isInTimeframe(s.timestamp, timeframe));
    
    return {
      total: earnings.reduce((sum, e) => sum + e.amount, 0),
      byCampaign: this.groupByCampaign(earnings),
      byAction: this.groupByAction(earnings),
      timeline: this.createTimeline(earnings)
    };
  }
  
  async requestPayout(
    influencerId: string,
    amount: number,
    destination: PayoutDestination
  ): Promise<PayoutResult> {
    // Check balance
    const balance = await this.getBalance(influencerId);
    if (balance < amount) {
      throw new Error('Insufficient balance');
    }
    
    // Process payout based on destination
    switch (destination.type) {
      case 'wallet':
        return this.payoutToWallet(influencerId, amount, destination.address);
      case 'bank':
        return this.payoutToBank(influencerId, amount, destination.account);
      case 'paypal':
        return this.payoutToPayPal(influencerId, amount, destination.email);
    }
  }
}
```

## Smart Contract Integration

### 1. Campaign Registration

```rust
// In campaign_reward_router_program
pub fn register_influencer_code(
    ctx: Context<RegisterCode>,
    params: RegisterCodeParams,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let influencer_record = &mut ctx.accounts.influencer_record;
    
    // Validate campaign is active
    require!(campaign.is_active(), ErrorCode::CampaignInactive);
    require!(campaign.remaining_budget > 0, ErrorCode::NoBudget);
    
    // Validate code uniqueness
    require!(
        !campaign.codes.contains(&params.code),
        ErrorCode::CodeAlreadyExists
    );
    
    // Register influencer
    influencer_record.campaign = campaign.key();
    influencer_record.influencer = ctx.accounts.influencer.key();
    influencer_record.code = params.code.clone();
    influencer_record.joined_at = Clock::get()?.unix_timestamp;
    influencer_record.total_earned = 0;
    
    // Add to campaign
    campaign.codes.push(params.code.clone());
    campaign.active_influencers += 1;
    
    // Emit event
    emit!(InfluencerJoinedEvent {
        campaign: campaign.key(),
        influencer: ctx.accounts.influencer.key(),
        code: params.code,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
```

### 2. Action Settlement

```rust
pub fn settle_action(
    ctx: Context<SettleAction>,
    params: SettleActionParams,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    let influencer_record = &mut ctx.accounts.influencer_record;
    
    // Verify action
    require!(
        params.referral_code == influencer_record.code,
        ErrorCode::CodeMismatch
    );
    
    // Get reward amount for action type
    let reward = match params.action_type {
        ActionType::Visit => campaign.rewards.visit,
        ActionType::Signup => campaign.rewards.signup,
        ActionType::Trial => campaign.rewards.trial,
        ActionType::Purchase => {
            campaign.rewards.purchase_base + 
            (params.purchase_amount * campaign.rewards.purchase_percentage / 10000)
        }
    };
    
    // Check campaign budget
    require!(
        campaign.remaining_budget >= reward,
        ErrorCode::InsufficientBudget
    );
    
    // Transfer reward
    let transfer_ix = spl_token::instruction::transfer(
        &spl_token::ID,
        &campaign.token_account,
        &influencer_record.token_account,
        &campaign.authority,
        &[],
        reward,
    )?;
    
    invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.token_program.to_account_info(),
            campaign.token_account.to_account_info(),
            influencer_record.token_account.to_account_info(),
            campaign.authority.to_account_info(),
        ],
        &[&campaign.authority_seeds()],
    )?;
    
    // Update state
    campaign.remaining_budget -= reward;
    influencer_record.total_earned += reward;
    influencer_record.actions.push(ActionRecord {
        action_type: params.action_type,
        amount: reward,
        timestamp: Clock::get()?.unix_timestamp,
        user_proof: params.user_proof,
    });
    
    Ok(())
}
```

## Security Considerations

### 1. Code Uniqueness
- Codes are globally unique across all campaigns
- Validated on-chain before registration
- Case-insensitive comparison

### 2. Action Verification
- Hardware attestation required for all actions
- Webhook signatures verified
- Rate limiting per user/IP

### 3. Budget Protection
- Campaigns can set daily/hourly limits
- Automatic pause when budget low
- Refund mechanism for unused budget

### 4. Influencer Verification
- Optional KYC for high-value campaigns
- Social media account linking
- Reputation scoring system

## Performance Optimization

### 1. Caching Strategy
```typescript
class CampaignCache {
  private cache: LRUCache<string, Campaign>;
  private subscriptions: Map<string, number>;
  
  async getCampaign(id: string): Promise<Campaign> {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }
    
    const campaign = await this.fetchCampaign(id);
    this.cache.set(id, campaign);
    this.subscribeToUpdates(id);
    
    return campaign;
  }
}
```

### 2. Batch Operations
```typescript
async function batchGetCampaigns(ids: string[]): Promise<Campaign[]> {
  const accounts = await connection.getMultipleAccountsInfo(ids);
  return accounts.map(a => decodeCampaign(a.data));
}
```

### 3. WebSocket Efficiency
- Single connection for all subscriptions
- Message deduplication
- Automatic reconnection

## Mobile Responsiveness

The marketplace is fully responsive with:
- Touch-optimized campaign cards
- Swipe gestures for navigation
- Native app deep linking
- Offline code generation

## Future Enhancements

### 1. AI-Powered Matching
- Recommend campaigns based on influencer's audience
- Predict campaign performance
- Optimize posting times

### 2. Advanced Analytics
- Audience overlap detection
- Cross-campaign attribution
- ROI predictions

### 3. Social Features
- Influencer teams/agencies
- Campaign collaboration
- Performance competitions

### 4. Automated Content
- AI-generated post captions
- Dynamic creative optimization
- A/B testing tools 