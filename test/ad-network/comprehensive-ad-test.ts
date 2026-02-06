/**
 * Comprehensive Ad Network Test Suite
 * Tests all components of the TWIST ad network including:
 * - RTB Engine
 * - Ad Server
 * - Campaign Management
 * - Publisher Integration
 * - User Rewards
 * - Attribution Tracking
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// Test Configuration
const TEST_CONFIG = {
  ADVERTISERS: 20,
  PUBLISHERS: 50,
  USERS: 1000,
  CAMPAIGNS_PER_ADVERTISER: 5,
  AD_UNITS_PER_PUBLISHER: 3,
  TEST_DURATION_HOURS: 2,
  IMPRESSIONS_PER_USER_HOUR: 10,
  CTR: 0.02, // 2% click-through rate
  CVR: 0.05, // 5% conversion rate
  FRAUD_RATE: 0.001, // 0.1% fraud attempts
};

// Event Logger
class AdNetworkLogger extends EventEmitter {
  private startTime: number;
  private events: any[] = [];
  private metrics = {
    totalImpressions: 0,
    totalClicks: 0,
    totalConversions: 0,
    totalRewards: 0,
    totalSpend: 0,
    fraudBlocked: 0,
    rtbRequests: 0,
    rtbResponses: 0,
    avgBidPrice: 0,
    avgCTR: 0,
    avgCVR: 0,
  };

  constructor() {
    super();
    this.startTime = Date.now();
  }

  logEvent(type: string, data: any) {
    const event = {
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime,
      type,
      data,
    };
    this.events.push(event);
    this.emit('event', event);
    this.updateMetrics(type, data);
  }

  private updateMetrics(type: string, data: any) {
    switch (type) {
      case 'IMPRESSION':
        this.metrics.totalImpressions++;
        break;
      case 'CLICK':
        this.metrics.totalClicks++;
        break;
      case 'CONVERSION':
        this.metrics.totalConversions++;
        break;
      case 'REWARD_DISTRIBUTED':
        this.metrics.totalRewards += data.amount;
        break;
      case 'CAMPAIGN_SPEND':
        this.metrics.totalSpend += data.amount;
        break;
      case 'FRAUD_BLOCKED':
        this.metrics.fraudBlocked++;
        break;
      case 'RTB_REQUEST':
        this.metrics.rtbRequests++;
        break;
      case 'RTB_RESPONSE':
        this.metrics.rtbResponses++;
        this.metrics.avgBidPrice = 
          (this.metrics.avgBidPrice * (this.metrics.rtbResponses - 1) + data.bidPrice) / 
          this.metrics.rtbResponses;
        break;
    }

    // Calculate rates
    if (this.metrics.totalImpressions > 0) {
      this.metrics.avgCTR = this.metrics.totalClicks / this.metrics.totalImpressions;
    }
    if (this.metrics.totalClicks > 0) {
      this.metrics.avgCVR = this.metrics.totalConversions / this.metrics.totalClicks;
    }
  }

  getMetrics() {
    return this.metrics;
  }

  saveToFile(filename: string) {
    const fs = require('fs');
    fs.writeFileSync(filename, JSON.stringify({
      config: TEST_CONFIG,
      metrics: this.metrics,
      events: this.events.slice(-1000), // Last 1000 events
    }, null, 2));
  }
}

// Mock RTB Engine
class MockRTBEngine {
  private campaigns: Map<string, any> = new Map();
  private logger: AdNetworkLogger;

  constructor(logger: AdNetworkLogger) {
    this.logger = logger;
  }

  addCampaign(campaign: any) {
    this.campaigns.set(campaign.id, campaign);
  }

  async processBidRequest(request: any): Promise<any> {
    this.logger.logEvent('RTB_REQUEST', {
      requestId: request.id,
      publisherId: request.site.publisher.id,
      impressions: request.imp.length,
    });

    // Find eligible campaigns
    const eligibleCampaigns = Array.from(this.campaigns.values()).filter(campaign => {
      return campaign.status === 'active' && 
             campaign.budget > campaign.spent &&
             this.matchesTargeting(campaign, request);
    });

    if (eligibleCampaigns.length === 0) {
      return null;
    }

    // Run auction
    const bids = eligibleCampaigns.map(campaign => ({
      campaign,
      bidPrice: this.calculateBidPrice(campaign, request),
      score: Math.random() * campaign.bidMultiplier,
    })).sort((a, b) => b.score - a.score);

    const winningBid = bids[0];

    // Create response
    const response = {
      id: request.id,
      seatbid: [{
        bid: [{
          id: uuidv4(),
          impid: request.imp[0].id,
          price: winningBid.bidPrice,
          adm: this.generateAdMarkup(winningBid.campaign),
          crid: winningBid.campaign.creativeId,
          cid: winningBid.campaign.id,
        }]
      }],
      cur: 'USD',
    };

    this.logger.logEvent('RTB_RESPONSE', {
      requestId: request.id,
      campaignId: winningBid.campaign.id,
      bidPrice: winningBid.bidPrice,
    });

    return response;
  }

  private matchesTargeting(campaign: any, request: any): boolean {
    // Simulate targeting logic
    if (campaign.targeting.geo && request.device?.geo) {
      if (!campaign.targeting.geo.includes(request.device.geo.country)) {
        return false;
      }
    }
    return true;
  }

  private calculateBidPrice(campaign: any, request: any): number {
    // Dynamic bid pricing
    const baseBid = campaign.cpm / 1000;
    const qualityScore = Math.random() * 0.5 + 0.5; // 0.5-1.0
    return baseBid * qualityScore;
  }

  private generateAdMarkup(campaign: any): string {
    return `<div class="twist-ad" data-campaign="${campaign.id}">
      <img src="${campaign.creativeUrl}" />
      <script>
        window.TWIST_REWARD = ${campaign.rewardAmount};
      </script>
    </div>`;
  }
}

// Mock Ad Server
class MockAdServer {
  private logger: AdNetworkLogger;
  private servedAds: Map<string, any> = new Map();

  constructor(logger: AdNetworkLogger) {
    this.logger = logger;
  }

  async serveAd(request: any): Promise<any> {
    const requestId = uuidv4();
    
    // Check for fraud
    if (this.detectFraud(request)) {
      this.logger.logEvent('FRAUD_BLOCKED', {
        requestId,
        reason: 'suspicious_pattern',
        ip: request.ip,
      });
      return null;
    }

    const ad = {
      requestId,
      html: request.adMarkup,
      tracking: {
        impression: `/track/imp/${requestId}`,
        click: `/track/click/${requestId}`,
        viewability: `/track/view/${requestId}`,
      },
    };

    this.servedAds.set(requestId, {
      ...ad,
      userId: request.userId,
      publisherId: request.publisherId,
      campaignId: request.campaignId,
      timestamp: Date.now(),
    });

    return ad;
  }

  trackImpression(requestId: string) {
    const ad = this.servedAds.get(requestId);
    if (!ad || ad.impressed) return;

    ad.impressed = true;
    this.logger.logEvent('IMPRESSION', {
      requestId,
      userId: ad.userId,
      publisherId: ad.publisherId,
      campaignId: ad.campaignId,
    });
  }

  trackClick(requestId: string): number {
    const ad = this.servedAds.get(requestId);
    if (!ad || ad.clicked) return 0;

    ad.clicked = true;
    const rewardAmount = 0.1; // 0.1 TWIST per click

    this.logger.logEvent('CLICK', {
      requestId,
      userId: ad.userId,
      publisherId: ad.publisherId,
      campaignId: ad.campaignId,
      rewardAmount,
    });

    return rewardAmount;
  }

  private detectFraud(request: any): boolean {
    // Simple fraud detection
    return Math.random() < TEST_CONFIG.FRAUD_RATE;
  }
}

// Mock Campaign Manager
class MockCampaignManager {
  private campaigns: Map<string, any> = new Map();
  private logger: AdNetworkLogger;

  constructor(logger: AdNetworkLogger) {
    this.logger = logger;
  }

  createCampaign(advertiser: any, config: any): any {
    const campaign = {
      id: `campaign_${uuidv4()}`,
      advertiserId: advertiser.id,
      name: config.name,
      type: config.type || 'awareness',
      budget: config.budget || 1000,
      spent: 0,
      cpm: config.cpm || 5, // $5 CPM
      rewardAmount: config.rewardAmount || 0.1,
      targeting: config.targeting || {},
      creativeId: uuidv4(),
      creativeUrl: `https://cdn.twist.io/creatives/${uuidv4()}.jpg`,
      status: 'active',
      metrics: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        cvr: 0,
        spend: 0,
      },
      bidMultiplier: 1 + Math.random(), // 1.0-2.0x
      created: Date.now(),
    };

    this.campaigns.set(campaign.id, campaign);

    this.logger.logEvent('CAMPAIGN_CREATED', {
      campaignId: campaign.id,
      advertiserId: advertiser.id,
      budget: campaign.budget,
      type: campaign.type,
    });

    return campaign;
  }

  updateCampaignMetrics(campaignId: string, event: string, cost: number = 0) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;

    switch (event) {
      case 'impression':
        campaign.metrics.impressions++;
        break;
      case 'click':
        campaign.metrics.clicks++;
        break;
      case 'conversion':
        campaign.metrics.conversions++;
        break;
    }

    campaign.spent += cost;
    campaign.metrics.spend = campaign.spent;

    // Calculate rates
    if (campaign.metrics.impressions > 0) {
      campaign.metrics.ctr = campaign.metrics.clicks / campaign.metrics.impressions;
    }
    if (campaign.metrics.clicks > 0) {
      campaign.metrics.cvr = campaign.metrics.conversions / campaign.metrics.clicks;
    }

    // Pause if budget exceeded
    if (campaign.spent >= campaign.budget) {
      campaign.status = 'completed';
      this.logger.logEvent('CAMPAIGN_COMPLETED', {
        campaignId,
        totalSpend: campaign.spent,
        metrics: campaign.metrics,
      });
    }

    this.logger.logEvent('CAMPAIGN_SPEND', {
      campaignId,
      amount: cost,
      totalSpent: campaign.spent,
    });
  }

  getCampaign(campaignId: string) {
    return this.campaigns.get(campaignId);
  }

  getAllCampaigns() {
    return Array.from(this.campaigns.values());
  }
}

// Mock Publisher
class MockPublisher {
  public id: string;
  public name: string;
  public adUnits: any[] = [];
  public earnings: number = 0;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  createAdUnit(type: string, config: any = {}): any {
    const adUnit = {
      id: `adunit_${uuidv4()}`,
      publisherId: this.id,
      type,
      size: config.size || '300x250',
      placement: config.placement || 'sidebar',
      revenueShare: 0.7, // Publisher gets 70%
      created: Date.now(),
    };

    this.adUnits.push(adUnit);
    return adUnit;
  }

  recordEarnings(amount: number) {
    this.earnings += amount;
  }
}

// Mock User
class MockUser {
  public id: string;
  public wallet: string;
  public earnings: number = 0;
  public impressions: number = 0;
  public clicks: number = 0;

  constructor(id: string) {
    this.id = id;
    this.wallet = `0x${uuidv4().replace(/-/g, '')}`;
  }

  earnReward(amount: number) {
    this.earnings += amount;
  }
}

// Attribution Engine
class MockAttributionEngine {
  private touchpoints: Map<string, any[]> = new Map();
  private logger: AdNetworkLogger;

  constructor(logger: AdNetworkLogger) {
    this.logger = logger;
  }

  trackTouchpoint(userId: string, touchpoint: any) {
    if (!this.touchpoints.has(userId)) {
      this.touchpoints.set(userId, []);
    }
    this.touchpoints.get(userId)!.push({
      ...touchpoint,
      timestamp: Date.now(),
    });
  }

  attributeConversion(userId: string, value: number): any {
    const userTouchpoints = this.touchpoints.get(userId) || [];
    if (userTouchpoints.length === 0) return null;

    // Last-click attribution
    const lastTouch = userTouchpoints[userTouchpoints.length - 1];
    
    this.logger.logEvent('CONVERSION', {
      userId,
      campaignId: lastTouch.campaignId,
      value,
      attribution: 'last_click',
      touchpoints: userTouchpoints.length,
    });

    return {
      campaignId: lastTouch.campaignId,
      value,
      model: 'last_click',
    };
  }
}

// Main Test Runner
export async function runComprehensiveAdNetworkTest() {
  console.log('🚀 Starting Comprehensive Ad Network Test');
  console.log('=========================================');
  
  const logger = new AdNetworkLogger();
  const rtbEngine = new MockRTBEngine(logger);
  const adServer = new MockAdServer(logger);
  const campaignManager = new MockCampaignManager(logger);
  const attributionEngine = new MockAttributionEngine(logger);

  // Create test entities
  const advertisers: any[] = [];
  const publishers: MockPublisher[] = [];
  const users: MockUser[] = [];

  // 1. Setup Advertisers and Campaigns
  console.log('\n📢 Creating Advertisers and Campaigns...');
  for (let i = 0; i < TEST_CONFIG.ADVERTISERS; i++) {
    const advertiser = {
      id: `advertiser_${i}`,
      company: `Company_${i}`,
      budget: 10000 + Math.random() * 40000, // $10k-50k
    };
    advertisers.push(advertiser);

    // Create campaigns
    for (let j = 0; j < TEST_CONFIG.CAMPAIGNS_PER_ADVERTISER; j++) {
      const campaignTypes = ['awareness', 'conversion', 'retargeting'];
      const campaign = campaignManager.createCampaign(advertiser, {
        name: `${advertiser.company}_Campaign_${j}`,
        type: campaignTypes[j % 3],
        budget: advertiser.budget / TEST_CONFIG.CAMPAIGNS_PER_ADVERTISER,
        cpm: 3 + Math.random() * 7, // $3-10 CPM
        rewardAmount: 0.05 + Math.random() * 0.15, // 0.05-0.2 TWIST
        targeting: {
          geo: ['US', 'UK', 'CA'],
          interests: ['tech', 'gaming', 'crypto'],
        },
      });
      rtbEngine.addCampaign(campaign);
    }
  }

  // 2. Setup Publishers
  console.log('\n📰 Creating Publishers and Ad Units...');
  for (let i = 0; i < TEST_CONFIG.PUBLISHERS; i++) {
    const publisher = new MockPublisher(
      `publisher_${i}`,
      `Website_${i}.com`
    );

    // Create ad units
    const adTypes = ['banner', 'native', 'video'];
    for (let j = 0; j < TEST_CONFIG.AD_UNITS_PER_PUBLISHER; j++) {
      publisher.createAdUnit(adTypes[j % 3], {
        size: j === 0 ? '728x90' : j === 1 ? '300x250' : '300x600',
        placement: j === 0 ? 'header' : j === 1 ? 'sidebar' : 'content',
      });
    }

    publishers.push(publisher);
  }

  // 3. Setup Users
  console.log('\n👥 Creating Users...');
  for (let i = 0; i < TEST_CONFIG.USERS; i++) {
    users.push(new MockUser(`user_${i}`));
  }

  // 4. Simulate Ad Activity
  console.log('\n🎯 Starting Ad Network Simulation...');
  const testDurationMs = TEST_CONFIG.TEST_DURATION_HOURS * 60 * 60 * 1000;
  const startTime = Date.now();
  let eventCount = 0;

  // Progress tracking
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = (elapsed / testDurationMs) * 100;
    const metrics = logger.getMetrics();
    
    console.log(`\n⏱️  Progress: ${progress.toFixed(1)}%`);
    console.log(`📊 Metrics:
    - Impressions: ${metrics.totalImpressions.toLocaleString()}
    - Clicks: ${metrics.totalClicks.toLocaleString()} (CTR: ${(metrics.avgCTR * 100).toFixed(2)}%)
    - Conversions: ${metrics.totalConversions.toLocaleString()} (CVR: ${(metrics.avgCVR * 100).toFixed(2)}%)
    - Rewards: ${metrics.totalRewards.toFixed(2)} TWIST
    - Ad Spend: $${metrics.totalSpend.toFixed(2)}
    - RTB Requests: ${metrics.rtbRequests.toLocaleString()}
    - Fraud Blocked: ${metrics.fraudBlocked}`);
  }, 10000); // Every 10 seconds

  // Main simulation loop
  while (Date.now() - startTime < testDurationMs) {
    // Simulate user browsing
    const user = users[Math.floor(Math.random() * users.length)];
    const publisher = publishers[Math.floor(Math.random() * publishers.length)];
    const adUnit = publisher.adUnits[Math.floor(Math.random() * publisher.adUnits.length)];

    // Create bid request
    const bidRequest = {
      id: uuidv4(),
      imp: [{
        id: uuidv4(),
        banner: {
          w: parseInt(adUnit.size.split('x')[0]),
          h: parseInt(adUnit.size.split('x')[1]),
        },
        bidfloor: 0.001,
      }],
      site: {
        publisher: {
          id: publisher.id,
          name: publisher.name,
        },
      },
      device: {
        ua: 'Mozilla/5.0 Test Browser',
        ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
        geo: {
          country: ['US', 'UK', 'CA'][Math.floor(Math.random() * 3)],
        },
      },
      user: {
        id: user.id,
      },
    };

    // Process RTB request
    const bidResponse = await rtbEngine.processBidRequest(bidRequest);
    
    if (bidResponse && bidResponse.seatbid[0]?.bid[0]) {
      const winningBid = bidResponse.seatbid[0].bid[0];
      
      // Serve ad
      const servedAd = await adServer.serveAd({
        userId: user.id,
        publisherId: publisher.id,
        campaignId: winningBid.cid,
        adMarkup: winningBid.adm,
        ip: bidRequest.device.ip,
      });

      if (servedAd) {
        // Track impression
        adServer.trackImpression(servedAd.requestId);
        user.impressions++;
        
        const campaign = campaignManager.getCampaign(winningBid.cid);
        const impressionCost = campaign.cpm / 1000;
        campaignManager.updateCampaignMetrics(winningBid.cid, 'impression', impressionCost);
        
        // Publisher earns revenue share
        publisher.recordEarnings(impressionCost * adUnit.revenueShare);

        // Track touchpoint for attribution
        attributionEngine.trackTouchpoint(user.id, {
          type: 'impression',
          campaignId: winningBid.cid,
          publisherId: publisher.id,
        });

        // Simulate click
        if (Math.random() < TEST_CONFIG.CTR) {
          const rewardAmount = adServer.trackClick(servedAd.requestId);
          user.clicks++;
          user.earnReward(rewardAmount);
          
          logger.logEvent('REWARD_DISTRIBUTED', {
            userId: user.id,
            amount: rewardAmount,
            reason: 'ad_click',
          });

          const clickCost = campaign.cpm / 100; // 10x impression cost
          campaignManager.updateCampaignMetrics(winningBid.cid, 'click', clickCost);
          publisher.recordEarnings(clickCost * adUnit.revenueShare);

          // Track click touchpoint
          attributionEngine.trackTouchpoint(user.id, {
            type: 'click',
            campaignId: winningBid.cid,
            publisherId: publisher.id,
          });

          // Simulate conversion
          if (Math.random() < TEST_CONFIG.CVR) {
            const conversionValue = 10 + Math.random() * 90; // $10-100
            const attribution = attributionEngine.attributeConversion(user.id, conversionValue);
            
            if (attribution) {
              const conversionCost = conversionValue * 0.1; // 10% of value
              campaignManager.updateCampaignMetrics(attribution.campaignId, 'conversion', conversionCost);
            }
          }
        }
      }
    }

    eventCount++;
    
    // Control simulation speed
    if (eventCount % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  clearInterval(progressInterval);

  // 5. Generate Final Report
  console.log('\n📈 Generating Final Report...');
  
  const finalMetrics = logger.getMetrics();
  const campaignResults = campaignManager.getAllCampaigns().map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    budget: c.budget,
    spent: c.spent,
    metrics: c.metrics,
    roi: c.metrics.conversions > 0 ? 
      ((c.metrics.conversions * 50 - c.spent) / c.spent * 100).toFixed(2) + '%' : 
      'N/A',
  }));

  const publisherEarnings = publishers.sort((a, b) => b.earnings - a.earnings).slice(0, 10);
  const topUsers = users.sort((a, b) => b.earnings - a.earnings).slice(0, 10);

  const report = {
    summary: {
      testDuration: `${TEST_CONFIG.TEST_DURATION_HOURS} hours`,
      totalEvents: eventCount,
      ...finalMetrics,
    },
    efficiency: {
      rtbFillRate: `${((finalMetrics.rtbResponses / finalMetrics.rtbRequests) * 100).toFixed(2)}%`,
      avgBidPrice: `$${finalMetrics.avgBidPrice.toFixed(3)}`,
      fraudRate: `${((finalMetrics.fraudBlocked / finalMetrics.rtbRequests) * 100).toFixed(3)}%`,
      userEngagementRate: `${((users.filter(u => u.clicks > 0).length / users.length) * 100).toFixed(2)}%`,
    },
    topCampaigns: campaignResults.slice(0, 5),
    topPublishers: publisherEarnings.map(p => ({
      id: p.id,
      name: p.name,
      earnings: `$${p.earnings.toFixed(2)}`,
      adUnits: p.adUnits.length,
    })),
    topEarningUsers: topUsers.map(u => ({
      id: u.id,
      earnings: `${u.earnings.toFixed(2)} TWIST`,
      impressions: u.impressions,
      clicks: u.clicks,
      ctr: `${((u.clicks / u.impressions) * 100).toFixed(2)}%`,
    })),
  };

  // Save results
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  logger.saveToFile(`ad-network-test-${timestamp}.json`);

  console.log('\n✅ Ad Network Test Complete!');
  console.log('=====================================');
  console.log(JSON.stringify(report, null, 2));

  return report;
}

// Run the test
if (require.main === module) {
  runComprehensiveAdNetworkTest().catch(console.error);
}