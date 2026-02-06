# Influencer User Journey Guide

## Overview

This guide walks through the complete user journey for influencers using the AHEE Campaign Marketplace, from discovery to payout. It covers the step-by-step process, user interface interactions, and best practices for maximizing earnings.

## Journey Stages

1. **Discovery** - Finding and evaluating campaigns
2. **Onboarding** - Setting up profile and wallet
3. **Joining** - Selecting campaigns and generating codes
4. **Promoting** - Sharing content and tracking performance
5. **Earning** - Monitoring rewards and requesting payouts

## Stage 1: Discovery

### Initial Landing

When an influencer first discovers AHEE, they typically arrive through:
- Social media posts about earning opportunities
- Referral from other influencers
- Direct outreach from brands
- Search results for "influencer monetization"

### First Interaction

**Landing Page Experience:**
```
Welcome to AHEE Campaign Marketplace
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 Earn instantly for promoting brands you love
✅ No fake followers or bots - only real engagement pays
⚡ Get paid immediately, not in 30-90 days
🔒 Your audience data stays private

[Browse Campaigns] [How It Works] [Sign Up]

Featured Campaign:
┌─────────────────────────────────┐
│ Nike Air Max 2024               │
│ Earn up to $5 per signup        │
│ 127 influencers earning now     │
└─────────────────────────────────┘
```

### Exploring Without Account

Influencers can browse campaigns before signing up:

```typescript
// Anonymous browsing flow
const publicCampaigns = await marketplace.getPublicCampaigns({
  sort: 'popular',
  limit: 20
});

// Each campaign shows:
interface CampaignPreview {
  brand: string;
  product: string;
  potentialEarnings: {
    perAction: number;
    averageMonthly: number;
    topEarner: number;
  };
  requirements: {
    minFollowers?: number;
    platforms?: string[];
    geoRestrictions?: string[];
  };
  spotsRemaining: number;
}
```

## Stage 2: Onboarding

### Account Creation

**Step 1: Basic Information**
```
Create Your Influencer Profile
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Display Name: [@username]
Primary Platform:
  ○ Instagram
  ○ TikTok  
  ○ YouTube
  ○ Twitter
  ○ Other: [___________]

Email: [your@email.com]

[Continue →]
```

**Step 2: Social Verification**
```
Connect Your Social Accounts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This helps brands match you with relevant campaigns
and prevents fake accounts.

[Connect Instagram]  ✓ Connected: @sneakerqueen (45.2k)
[Connect TikTok]     ✓ Connected: @sarahkicks (23.1k)
[Connect YouTube]    ○ Connect

Your Influence Score: 8.7/10 🌟

[Continue →]
```

**Step 3: Wallet Setup**
```
Set Up Your Earnings Wallet
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

How would you like to receive payments?

○ Create New Wallet (Recommended)
  We'll create a secure wallet for you

○ Connect Existing Solana Wallet
  [Phantom] [Solflare] [Backpack]

○ Use Email Wallet
  Manage funds via email (easiest)

[Set Up Wallet →]
```

### Browser Extension Installation

```
Install AHEE Extension
━━━━━━━━━━━━━━━━━━━━━

The browser extension unlocks:
✓ One-click campaign joining
✓ Real-time earning notifications
✓ Auto-tracking of referrals
✓ Performance analytics

[Add to Chrome] [Add to Firefox] [Add to Brave]

Or continue without extension (limited features)
```

### Profile Completion

```javascript
// Profile data structure
interface InfluencerProfile {
  // Basic info
  id: string;
  displayName: string;
  email: string;
  wallet: string;
  
  // Social accounts
  socials: {
    instagram?: {
      handle: string;
      followers: number;
      verified: boolean;
      engagement: number;
    };
    tiktok?: SocialAccount;
    youtube?: SocialAccount;
    twitter?: SocialAccount;
  };
  
  // Audience insights
  audience: {
    interests: string[];
    demographics: {
      age: Range[];
      gender: Distribution;
      location: GeoDistribution;
    };
    authenticity: number; // 0-1 score
  };
  
  // Preferences
  preferences: {
    categories: string[];
    minPayout: number;
    autoJoinSimilar: boolean;
    notifications: NotificationSettings;
  };
}
```

## Stage 3: Joining Campaigns

### Campaign Discovery in Extension

**Extension Popup Interface:**
```
AHEE Campaigns 🚀                    [@sneakerqueen]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 Today's Earnings: 234 AC-D ($23.40)

🔥 Hot Campaigns for You:
┌─────────────────────────────────────────────────┐
│ Nike Air Max 2024                               │
│ Perfect match for your audience!                │
│ 📊 $3-5 per signup | 🎯 98% match              │
│ [View Details] [Quick Join]                     │
├─────────────────────────────────────────────────┤
│ Gymshark Summer Collection                      │
│ Fitness brands perform well with your audience  │
│ 📊 $2-8 per action | 🎯 91% match             │
│ [View Details] [Quick Join]                     │
└─────────────────────────────────────────────────┘

[Browse All] [My Campaigns] [Settings]
```

### Detailed Campaign View

```
Nike Air Max 2024 Campaign
━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Campaign Overview
Budget Remaining: $6,579 of $10,000
Active Influencers: 127
Your Potential: $500-2000/month
Ends: March 31, 2024 (21 days)

💰 How You Earn:
┌─────────────────────────────────────┐
│ Store Visit    → $0.20 per visitor │
│ Email Signup   → $3.00 per signup  │
│ Purchase       → $5.00 + 2% of sale│
└─────────────────────────────────────┘

✅ Requirements:
• Hardware-verified visitors only (no bots)
• Minimum 30 seconds on site
• Available in: US, CA, UK, AU
• FTC disclosure required

🏆 Top Performers:
1. @kicksaddict - $892 (1.2k actions)
2. @sneakerlove - $734 (980 actions)
3. @shoegame - $623 (834 actions)

📈 Success Tips:
• Post during 6-9 PM for best engagement
• Use provided graphics for 40% better CTR
• Story posts convert 3x better than feed

[Join Campaign] [Save for Later]
```

### Code Generation Process

**Step 1: Choose Your Code**
```
Create Your Unique Code
━━━━━━━━━━━━━━━━━━━━━━

Suggested codes based on your brand:
○ NIKE-SARAH ✓ Available
○ AIRMAX-QUEEN ✓ Available  
○ SNEAKER-SARAH ✓ Available
● Custom: [NIKE-MYSNEAKS] ✓ Available

Your link preview:
nike.com/airmax?ref=NIKE-MYSNEAKS

[Generate Code →]
```

**Step 2: Customize Assets**
```
Customize Your Campaign Assets
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Select graphics to personalize:
☑ Instagram Post (Feed)
☑ Instagram Story
☐ TikTok Video Thumbnail
☑ Twitter Header

Add your personal touch:
Text overlay: ["My favorite kicks! 👟"]
Color scheme: [Match my brand v]

[Generate Assets →]
```

**Step 3: Confirmation**
```
✅ You're All Set!
━━━━━━━━━━━━━━━━━

Campaign: Nike Air Max 2024
Your Code: NIKE-MYSNEAKS
Status: Active

📱 Your Tracking Links:
Web: nike.com/airmax?ref=NIKE-MYSNEAKS [Copy]
Mobile: nike://ref=NIKE-MYSNEAKS [Copy]
Short: ahee.link/nm24 [Copy]
QR Code: [Download]

📊 Your Dashboard:
https://dashboard.ahee.io/campaigns/nike-air-max

[Download Assets] [Share Now] [View Dashboard]
```

## Stage 4: Promoting

### Content Creation Workflow

**In-Extension Content Helper:**
```javascript
// Content generation assistant
interface ContentAssistant {
  generateCaption(params: {
    campaign: Campaign;
    platform: Platform;
    tone: 'casual' | 'professional' | 'excited';
    includeHashtags: boolean;
  }): string;
  
  suggestPostingTime(params: {
    platform: Platform;
    audience: AudienceData;
    campaign: Campaign;
  }): Date[];
  
  checkCompliance(content: string): {
    hasDisclosure: boolean;
    suggestions: string[];
  };
}

// Example output
const caption = assistant.generateCaption({
  campaign: nikeAirMax,
  platform: 'instagram',
  tone: 'excited',
  includeHashtags: true
});

// Result:
"Just got my hands on the new Nike Air Max 2024! 😍
The comfort is unreal and the design is 🔥

Use my code NIKE-MYSNEAKS for exclusive access ✨
Link in bio!

#NikeAirMax #Ad #SneakerHead #Nike2024"
```

### Real-Time Performance Tracking

**Live Dashboard in Extension:**
```
Current Performance - Nike Air Max
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Last updated: 2 seconds ago

📊 Today's Stats:
Clicks: 47 (+12 in last hour)
Signups: 4 💰 $12.00
Purchases: 1 💰 $7.34
Total Earned: $19.34

📈 Conversion Funnel:
Clicks     ████████████ 47
Views      ████████░░░░ 34 (72%)
Signups    ██░░░░░░░░░░  4 (12%)
Purchases  █░░░░░░░░░░░  1 (3%)

🔥 Hot Right Now:
"Your story post is getting 3x normal engagement!"
[Post Another Story]

💡 Optimization Tip:
"Your audience is most active now. Perfect time to post!"
```

### Multi-Campaign Management

```
My Active Campaigns
━━━━━━━━━━━━━━━━━━━

Total Earnings Today: $67.23 (+23% vs yesterday)

┌──────────────────────────────────────┐
│ 👟 Nike Air Max                     │
│ NIKE-MYSNEAKS | Rank: #12/127       │
│ Today: $19.34 | Total: $456.78      │
│ [📊 Stats] [🔗 Links] [📤 Share]    │
├──────────────────────────────────────┤
│ 🥗 HelloFresh Spring                │
│ FRESH-SARAH | Rank: #5/43           │
│ Today: $38.00 | Total: $892.34      │
│ [📊 Stats] [🔗 Links] [📤 Share]    │
├──────────────────────────────────────┤
│ 💪 Gymshark Sale                    │
│ GYM-QUEEN | Rank: #8/89             │
│ Today: $9.89 | Total: $234.56       │
│ ⚠️ Ending in 2 days!                │
│ [📊 Stats] [🔗 Links] [📤 Share]    │
└──────────────────────────────────────┘

[Find More Campaigns] [Earnings Report]
```

## Stage 5: Earning & Payouts

### Earnings Accumulation

**Real-Time Notifications:**
```javascript
// Browser notification on earning
new Notification("💰 You just earned $3.00!", {
  body: "Email signup via NIKE-MYSNEAKS",
  icon: "/icon-money.png",
  badge: "/badge.png",
  tag: "earning",
  requireInteraction: false
});

// In-extension earning ticker
interface EarningTicker {
  show(earning: {
    amount: number;
    action: string;
    campaign: string;
    code: string;
  }): void;
}

// Visual feedback
ticker.show({
  amount: 3.00,
  action: "Email Signup",
  campaign: "Nike Air Max",
  code: "NIKE-MYSNEAKS"
});
// Shows: "+$3.00 ✨" with animation
```

### Detailed Analytics

```
Earnings Analytics
━━━━━━━━━━━━━━━━━

📊 Performance Overview (Last 30 Days)

Total Earned: $1,847.23
Best Day: March 15 ($234.56)
Avg Daily: $61.57

📈 Earnings Trend:
$250 ┤      ╭─╮
$200 ┤   ╭──╯ ╰╮
$150 ┤ ╭─╯     ╰─╮
$100 ┤╭╯         ╰─╮
$50  ┼╯            ╰──
     └─────────────────────
     Mar 1         Mar 30

🏆 Top Performing:
1. HelloFresh    $623.45 (33.7%)
2. Nike          $456.78 (24.7%)
3. Gymshark      $234.56 (12.7%)

💡 Insights:
• Story posts earn 3.2x more than feed posts
• Your audience converts best 6-9 PM EST
• Fashion campaigns match your audience best

[Download Report] [Share Results]
```

### Payout Process

**Step 1: Review Balance**
```
Your Earnings Balance
━━━━━━━━━━━━━━━━━━━━

Available to Withdraw:
2,341 AC-D = $234.10 USD

Exchange Rate: 1 AC-D = $0.10
Last Updated: 2 minutes ago

Pending Earnings: 
123 AC-D ($12.30) - Clearing in 1 hour

Lifetime Earnings:
18,134 AC-D ($1,813.40)

[Request Payout] [Transaction History]
```

**Step 2: Choose Payout Method**
```
How would you like to receive payment?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

○ Bank Transfer (ACH)
  2-3 business days | No fees
  
○ Instant Debit Card
  Within minutes | $0.50 fee
  
● PayPal
  Within 1 hour | 2% fee
  
○ Crypto Wallet (USDC)
  Instant | Network fees only
  
Amount to Receive: $229.41
(After 2% PayPal fee)

[Continue →]
```

**Step 3: Confirmation**
```
Confirm Your Payout
━━━━━━━━━━━━━━━━━━

Amount: 2,341 AC-D
USD Value: $234.10
Method: PayPal
Fee: $4.68 (2%)
You Receive: $229.42

Destination: sarah***@gmail.com

Estimated Arrival: Within 1 hour

[Confirm Payout] [Cancel]
```

**Step 4: Success**
```
✅ Payout Processed!
━━━━━━━━━━━━━━━━━━━

Transaction ID: PAY-2024-X7K9M2P
Amount: $229.42
Status: Processing

You'll receive an email confirmation
when funds arrive at your PayPal.

Track status anytime in your dashboard.

[View Transaction] [Request Another]
```

## Best Practices Throughout Journey

### Content Strategy

1. **Authenticity First**
   - Only promote products you genuinely use/like
   - Share real experiences, not just links
   - Respond to audience questions

2. **Optimal Timing**
   - Post when your audience is most active
   - Use analytics to find best times
   - Schedule posts for consistency

3. **Disclosure Compliance**
   - Always include #ad or #sponsored
   - Be transparent about partnerships
   - Follow FTC guidelines

### Performance Optimization

```javascript
// Performance tracking utilities
class PerformanceOptimizer {
  // Analyze best performing content
  async analyzeContent(influencerId: string) {
    const posts = await this.getRecentPosts(influencerId);
    
    return {
      bestFormat: this.calculateBestFormat(posts),
      optimalLength: this.findOptimalCaptionLength(posts),
      topHashtags: this.extractTopHashtags(posts),
      bestTiming: this.analyzeBestPostTimes(posts)
    };
  }
  
  // Suggest improvements
  suggestImprovements(metrics: PerformanceMetrics): Suggestion[] {
    const suggestions = [];
    
    if (metrics.storyConversion > metrics.feedConversion * 2) {
      suggestions.push({
        type: 'format',
        message: 'Your stories convert 2x better - post more stories!',
        priority: 'high'
      });
    }
    
    if (metrics.avgEngagementTime < 30) {
      suggestions.push({
        type: 'content',
        message: 'Add more context to keep visitors engaged longer',
        priority: 'medium'
      });
    }
    
    return suggestions;
  }
}
```

### Campaign Selection

1. **Audience Alignment**
   - Choose brands your audience already likes
   - Check demographic match scores
   - Review similar influencer success

2. **Earning Potential**
   - Calculate realistic monthly earnings
   - Consider effort vs reward
   - Factor in content creation time

3. **Brand Reputation**
   - Research brand reviews
   - Check previous influencer experiences
   - Ensure values alignment

## Common Pitfalls to Avoid

### During Onboarding
- Don't use fake follower counts
- Don't skip wallet security setup
- Don't ignore audience insights

### When Joining Campaigns
- Don't join incompatible brands
- Don't choose confusing codes
- Don't ignore campaign requirements

### While Promoting
- Don't spam your audience
- Don't hide sponsorship disclosure
- Don't buy fake engagement

### Managing Earnings
- Don't let earnings accumulate too long (daily decay)
- Don't ignore tax obligations
- Don't share wallet credentials

## Support Resources

### In-Extension Help
```
Need Help? 💬
━━━━━━━━━━━━━

📚 Knowledge Base
🎥 Video Tutorials
💬 Live Chat (9am-6pm EST)
📧 Email Support
🎯 Success Coaching

Common Questions:
• How do I increase conversions?
• When do I get paid?
• How are earnings calculated?
• What's my influence score?

[Search Help] [Contact Support]
```

### Community Resources

- Discord: https://discord.gg/ahee-influencers
- Success Stories: https://ahee.io/success
- Best Practices: https://learn.ahee.io
- Tax Guide: https://ahee.io/tax-guide

## Metrics for Success

### Key Performance Indicators

```typescript
interface InfluencerKPIs {
  // Engagement metrics
  clickThroughRate: number;      // Clicks / Impressions
  conversionRate: number;        // Actions / Clicks
  averageOrderValue: number;     // For purchase campaigns
  
  // Earning metrics
  earningsPerPost: number;       // Average per post
  earningsPerFollower: number;   // Monthly / followers
  campaignROI: number;          // Time value analysis
  
  // Growth metrics
  followerGrowth: number;       // Monthly growth %
  engagementTrend: number;      // Engagement trajectory
  repeatPurchaseRate: number;   // Audience loyalty
}
```

### Success Milestones

1. **First Week**: First campaign joined, first earning
2. **First Month**: $100+ earned, 3+ active campaigns
3. **Three Months**: $500+ monthly, top 25% performer
4. **Six Months**: $1000+ monthly, brand partnerships
5. **One Year**: Consistent 4-figure monthly income

## Conclusion

The influencer journey on AHEE is designed to be intuitive, rewarding, and transparent. By following this guide and best practices, influencers can build sustainable income streams while maintaining authentic relationships with their audiences. 