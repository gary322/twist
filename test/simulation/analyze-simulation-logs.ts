/**
 * Analyzes simulation logs and generates comprehensive reports
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface AnalysisReport {
  summary: {
    duration: number;
    totalEvents: number;
    eventsPerSecond: number;
    uniqueUsers: Set<string>;
    uniqueInfluencers: Set<string>;
    uniquePublishers: Set<string>;
    uniqueProducts: Set<string>;
  };
  
  features: {
    browserExtension: {
      totalInstalls: number;
      totalSessions: number;
      totalVAUs: number;
      avgSessionDuration: number;
      tokensEarned: number;
      topSites: Map<string, number>;
    };
    
    staking: {
      totalStakes: number;
      influencerStakes: number;
      websiteStakes: number;
      totalValueStaked: number;
      avgStakeSize: number;
      topInfluencers: Map<string, { stakes: number; value: number }>;
      unstakes: number;
      rewardsClaimed: number;
      totalRewards: number;
    };
    
    referrals: {
      codesCreated: number;
      codesUsed: number;
      uniqueReferrers: Set<string>;
      conversionRate: number;
      totalBonuses: number;
      totalCommissions: number;
    };
    
    tokens: {
      totalMinted: number;
      totalBurned: number;
      totalTransferred: number;
      burnReasons: Map<string, number>;
      netSupplyChange: number;
    };
    
    mobile: {
      sdkBreakdown: Map<string, number>;
      totalSessions: number;
      avgSessionDuration: number;
      tokensEarned: number;
      topGames: Map<string, number>;
    };
    
    security: {
      twoFAEnabled: number;
      kycCompleted: number;
      hardwareWallets: number;
      securityMethods: Map<string, number>;
    };
  };
  
  hourlyMetrics: Map<number, {
    events: number;
    users: number;
    stakes: number;
    burns: number;
    earned: number;
  }>;
  
  errors: {
    total: number;
    byType: Map<string, number>;
    criticalErrors: any[];
  };
  
  performance: {
    peakEventsPerSecond: number;
    avgResponseTime: number;
    slowestOperations: any[];
  };
}

class SimulationAnalyzer {
  private report: AnalysisReport;
  
  constructor() {
    this.report = this.initializeReport();
  }
  
  private initializeReport(): AnalysisReport {
    return {
      summary: {
        duration: 0,
        totalEvents: 0,
        eventsPerSecond: 0,
        uniqueUsers: new Set(),
        uniqueInfluencers: new Set(),
        uniquePublishers: new Set(),
        uniqueProducts: new Set()
      },
      features: {
        browserExtension: {
          totalInstalls: 0,
          totalSessions: 0,
          totalVAUs: 0,
          avgSessionDuration: 0,
          tokensEarned: 0,
          topSites: new Map()
        },
        staking: {
          totalStakes: 0,
          influencerStakes: 0,
          websiteStakes: 0,
          totalValueStaked: 0,
          avgStakeSize: 0,
          topInfluencers: new Map(),
          unstakes: 0,
          rewardsClaimed: 0,
          totalRewards: 0
        },
        referrals: {
          codesCreated: 0,
          codesUsed: 0,
          uniqueReferrers: new Set(),
          conversionRate: 0,
          totalBonuses: 0,
          totalCommissions: 0
        },
        tokens: {
          totalMinted: 0,
          totalBurned: 0,
          totalTransferred: 0,
          burnReasons: new Map(),
          netSupplyChange: 0
        },
        mobile: {
          sdkBreakdown: new Map(),
          totalSessions: 0,
          avgSessionDuration: 0,
          tokensEarned: 0,
          topGames: new Map()
        },
        security: {
          twoFAEnabled: 0,
          kycCompleted: 0,
          hardwareWallets: 0,
          securityMethods: new Map()
        }
      },
      hourlyMetrics: new Map(),
      errors: {
        total: 0,
        byType: new Map(),
        criticalErrors: []
      },
      performance: {
        peakEventsPerSecond: 0,
        avgResponseTime: 0,
        slowestOperations: []
      }
    };
  }
  
  async analyzeSimulation(logDir: string): Promise<void> {
    console.log(`\n📊 Analyzing simulation logs in: ${logDir}\n`);
    
    const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
    let startTime = Infinity;
    let endTime = 0;
    
    // Process each log file
    for (const file of files) {
      console.log(`Processing ${file}...`);
      const filePath = path.join(logDir, file);
      
      await this.processLogFile(filePath);
    }
    
    // Calculate derived metrics
    this.calculateDerivedMetrics();
    
    // Generate report
    await this.generateReport(logDir);
  }
  
  private async processLogFile(filePath: string): Promise<void> {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let lineCount = 0;
    
    for await (const line of rl) {
      lineCount++;
      
      try {
        if (line.startsWith('{')) {
          const event = JSON.parse(line);
          this.processEvent(event);
        }
      } catch (error) {
        // Log parsing errors
        this.report.errors.total++;
      }
    }
    
    console.log(`  Processed ${lineCount} lines`);
  }
  
  private processEvent(event: any): void {
    this.report.summary.totalEvents++;
    
    // Track unique entities
    if (event.userId) this.report.summary.uniqueUsers.add(event.userId);
    if (event.influencerId) this.report.summary.uniqueInfluencers.add(event.influencerId);
    if (event.publisherId) this.report.summary.uniquePublishers.add(event.publisherId);
    if (event.productId) this.report.summary.uniqueProducts.add(event.productId);
    
    // Track hourly metrics
    const hour = Math.floor(event.elapsed / 3600);
    if (!this.report.hourlyMetrics.has(hour)) {
      this.report.hourlyMetrics.set(hour, {
        events: 0,
        users: 0,
        stakes: 0,
        burns: 0,
        earned: 0
      });
    }
    const hourMetrics = this.report.hourlyMetrics.get(hour)!;
    hourMetrics.events++;
    
    // Process by event type
    switch (event.type) {
      case 'EXTENSION_INSTALLED':
        this.report.features.browserExtension.totalInstalls++;
        break;
        
      case 'EXTENSION_BROWSING':
        this.report.features.browserExtension.totalSessions++;
        if (event.data?.tokensEarned) {
          this.report.features.browserExtension.tokensEarned += event.data.tokensEarned;
          hourMetrics.earned += event.data.tokensEarned;
        }
        if (event.data?.sites) {
          event.data.sites.forEach((site: string) => {
            const count = this.report.features.browserExtension.topSites.get(site) || 0;
            this.report.features.browserExtension.topSites.set(site, count + 1);
          });
        }
        break;
        
      case 'VAU_SUBMITTED':
        this.report.features.browserExtension.totalVAUs++;
        break;
        
      case 'STAKE_ON_INFLUENCER':
        this.report.features.staking.totalStakes++;
        this.report.features.staking.influencerStakes++;
        hourMetrics.stakes++;
        
        if (event.data?.amount) {
          this.report.features.staking.totalValueStaked += event.data.amount;
          
          // Track top influencers
          const influencerStats = this.report.features.staking.topInfluencers.get(event.influencerId) || 
            { stakes: 0, value: 0 };
          influencerStats.stakes++;
          influencerStats.value += event.data.amount;
          this.report.features.staking.topInfluencers.set(event.influencerId, influencerStats);
        }
        break;
        
      case 'STAKE_ON_WEBSITE':
        this.report.features.staking.totalStakes++;
        this.report.features.staking.websiteStakes++;
        hourMetrics.stakes++;
        
        if (event.data?.amount) {
          this.report.features.staking.totalValueStaked += event.data.amount;
        }
        break;
        
      case 'UNSTAKE':
        this.report.features.staking.unstakes++;
        break;
        
      case 'CLAIM_REWARDS':
        this.report.features.staking.rewardsClaimed++;
        if (event.data?.amount) {
          this.report.features.staking.totalRewards += event.data.amount;
        }
        break;
        
      case 'REFERRAL_CODE_CREATED':
        this.report.features.referrals.codesCreated++;
        if (event.influencerId) {
          this.report.features.referrals.uniqueReferrers.add(event.influencerId);
        }
        break;
        
      case 'REFERRAL_CODE_USED':
        this.report.features.referrals.codesUsed++;
        if (event.data?.bonus) {
          this.report.features.referrals.totalBonuses += event.data.bonus;
        }
        if (event.data?.commission) {
          this.report.features.referrals.totalCommissions += event.data.commission;
        }
        break;
        
      case 'TOKEN_BURN':
        this.report.features.tokens.totalBurned += event.data?.amount || 0;
        hourMetrics.burns += event.data?.amount || 0;
        
        if (event.data?.reason) {
          const count = this.report.features.tokens.burnReasons.get(event.data.reason) || 0;
          this.report.features.tokens.burnReasons.set(event.data.reason, count + 1);
        }
        break;
        
      case 'TOKEN_TRANSFER':
        this.report.features.tokens.totalTransferred += event.data?.amount || 0;
        break;
        
      case 'MOBILE_SDK_INIT':
        if (event.data?.sdk) {
          const count = this.report.features.mobile.sdkBreakdown.get(event.data.sdk) || 0;
          this.report.features.mobile.sdkBreakdown.set(event.data.sdk, count + 1);
        }
        break;
        
      case 'MOBILE_GAME_PLAY':
        this.report.features.mobile.totalSessions++;
        if (event.data?.tokensEarned) {
          this.report.features.mobile.tokensEarned += event.data.tokensEarned;
        }
        if (event.data?.gameId) {
          const count = this.report.features.mobile.topGames.get(event.data.gameId) || 0;
          this.report.features.mobile.topGames.set(event.data.gameId, count + 1);
        }
        break;
        
      case 'TWO_FA_ENABLED':
        this.report.features.security.twoFAEnabled++;
        if (event.data?.method) {
          const count = this.report.features.security.securityMethods.get(event.data.method) || 0;
          this.report.features.security.securityMethods.set(event.data.method, count + 1);
        }
        break;
        
      case 'KYC_COMPLETED':
        this.report.features.security.kycCompleted++;
        break;
        
      case 'HARDWARE_WALLET_CONNECTED':
        this.report.features.security.hardwareWallets++;
        break;
    }
  }
  
  private calculateDerivedMetrics(): void {
    // Calculate averages
    if (this.report.features.staking.totalStakes > 0) {
      this.report.features.staking.avgStakeSize = 
        this.report.features.staking.totalValueStaked / this.report.features.staking.totalStakes;
    }
    
    // Referral conversion rate
    if (this.report.features.referrals.codesCreated > 0) {
      this.report.features.referrals.conversionRate = 
        (this.report.features.referrals.codesUsed / this.report.features.referrals.codesCreated) * 100;
    }
    
    // Net supply change
    this.report.features.tokens.netSupplyChange = 
      this.report.features.tokens.totalMinted - this.report.features.tokens.totalBurned;
  }
  
  private async generateReport(logDir: string): Promise<void> {
    const reportPath = path.join(logDir, 'analysis-report.txt');
    const jsonReportPath = path.join(logDir, 'analysis-report.json');
    
    // Generate text report
    const textReport = this.generateTextReport();
    fs.writeFileSync(reportPath, textReport);
    
    // Generate JSON report
    const jsonReport = this.generateJSONReport();
    fs.writeFileSync(jsonReportPath, JSON.stringify(jsonReport, null, 2));
    
    console.log(`\n✅ Analysis complete!`);
    console.log(`📄 Text report: ${reportPath}`);
    console.log(`📊 JSON report: ${jsonReportPath}`);
  }
  
  private generateTextReport(): string {
    const report = [];
    
    report.push('========================================');
    report.push('SIMULATION ANALYSIS REPORT');
    report.push('========================================\n');
    
    report.push('SUMMARY');
    report.push('-------');
    report.push(`Total Events: ${this.report.summary.totalEvents.toLocaleString()}`);
    report.push(`Unique Users: ${this.report.summary.uniqueUsers.size.toLocaleString()}`);
    report.push(`Unique Influencers: ${this.report.summary.uniqueInfluencers.size.toLocaleString()}`);
    report.push(`Unique Publishers: ${this.report.summary.uniquePublishers.size.toLocaleString()}`);
    report.push(`Unique Products: ${this.report.summary.uniqueProducts.size.toLocaleString()}\n`);
    
    report.push('BROWSER EXTENSION');
    report.push('-----------------');
    report.push(`Total Installs: ${this.report.features.browserExtension.totalInstalls.toLocaleString()}`);
    report.push(`Total Sessions: ${this.report.features.browserExtension.totalSessions.toLocaleString()}`);
    report.push(`VAUs Submitted: ${this.report.features.browserExtension.totalVAUs.toLocaleString()}`);
    report.push(`Tokens Earned: ${this.report.features.browserExtension.tokensEarned.toFixed(2)}`);
    
    // Top sites
    report.push('\nTop Visited Sites:');
    const topSites = Array.from(this.report.features.browserExtension.topSites.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    topSites.forEach(([site, count]) => {
      report.push(`  ${site}: ${count.toLocaleString()} visits`);
    });
    
    report.push('\nSTAKING ACTIVITY');
    report.push('----------------');
    report.push(`Total Stakes: ${this.report.features.staking.totalStakes.toLocaleString()}`);
    report.push(`  - Influencer Stakes: ${this.report.features.staking.influencerStakes.toLocaleString()}`);
    report.push(`  - Website Stakes: ${this.report.features.staking.websiteStakes.toLocaleString()}`);
    report.push(`Total Value Staked: ${(this.report.features.staking.totalValueStaked / 1e6).toFixed(2)}M TWIST`);
    report.push(`Average Stake Size: ${this.report.features.staking.avgStakeSize.toFixed(2)} TWIST`);
    report.push(`Unstakes: ${this.report.features.staking.unstakes.toLocaleString()}`);
    report.push(`Rewards Claimed: ${this.report.features.staking.rewardsClaimed.toLocaleString()}`);
    report.push(`Total Rewards: ${this.report.features.staking.totalRewards.toFixed(2)} TWIST`);
    
    // Top influencers
    report.push('\nTop Influencers by Stake Value:');
    const topInfluencers = Array.from(this.report.features.staking.topInfluencers.entries())
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 10);
    topInfluencers.forEach(([id, stats]) => {
      report.push(`  ${id}: ${stats.stakes} stakes, ${(stats.value / 1e3).toFixed(1)}K TWIST`);
    });
    
    report.push('\nREFERRAL SYSTEM');
    report.push('---------------');
    report.push(`Codes Created: ${this.report.features.referrals.codesCreated.toLocaleString()}`);
    report.push(`Codes Used: ${this.report.features.referrals.codesUsed.toLocaleString()}`);
    report.push(`Conversion Rate: ${this.report.features.referrals.conversionRate.toFixed(1)}%`);
    report.push(`Unique Referrers: ${this.report.features.referrals.uniqueReferrers.size.toLocaleString()}`);
    report.push(`Total Bonuses: ${this.report.features.referrals.totalBonuses.toFixed(2)} TWIST`);
    report.push(`Total Commissions: ${this.report.features.referrals.totalCommissions.toFixed(2)} TWIST`);
    
    report.push('\nTOKEN ECONOMICS');
    report.push('---------------');
    report.push(`Total Burned: ${(this.report.features.tokens.totalBurned / 1e6).toFixed(2)}M TWIST`);
    report.push(`Total Transferred: ${(this.report.features.tokens.totalTransferred / 1e6).toFixed(2)}M TWIST`);
    
    report.push('\nBurn Reasons:');
    this.report.features.tokens.burnReasons.forEach((count, reason) => {
      report.push(`  ${reason}: ${count.toLocaleString()} burns`);
    });
    
    report.push('\nMOBILE SDK');
    report.push('----------');
    report.push(`Total Sessions: ${this.report.features.mobile.totalSessions.toLocaleString()}`);
    report.push(`Tokens Earned: ${this.report.features.mobile.tokensEarned.toFixed(2)} TWIST`);
    
    report.push('\nSDK Usage:');
    this.report.features.mobile.sdkBreakdown.forEach((count, sdk) => {
      report.push(`  ${sdk}: ${count.toLocaleString()} initializations`);
    });
    
    report.push('\nSECURITY');
    report.push('--------');
    report.push(`2FA Enabled: ${this.report.features.security.twoFAEnabled.toLocaleString()}`);
    report.push(`KYC Completed: ${this.report.features.security.kycCompleted.toLocaleString()}`);
    report.push(`Hardware Wallets: ${this.report.features.security.hardwareWallets.toLocaleString()}`);
    
    report.push('\nSecurity Methods:');
    this.report.features.security.securityMethods.forEach((count, method) => {
      report.push(`  ${method}: ${count.toLocaleString()}`);
    });
    
    report.push('\nHOURLY ACTIVITY');
    report.push('---------------');
    const hourlyData = Array.from(this.report.hourlyMetrics.entries()).sort((a, b) => a[0] - b[0]);
    hourlyData.slice(0, 10).forEach(([hour, metrics]) => {
      report.push(`Hour ${hour}: ${metrics.events.toLocaleString()} events, ${metrics.stakes} stakes, ${(metrics.earned / 1e3).toFixed(1)}K earned`);
    });
    
    if (this.report.errors.total > 0) {
      report.push('\nERRORS');
      report.push('------');
      report.push(`Total Errors: ${this.report.errors.total.toLocaleString()}`);
    }
    
    report.push('\n========================================');
    
    return report.join('\n');
  }
  
  private generateJSONReport(): any {
    return {
      summary: {
        totalEvents: this.report.summary.totalEvents,
        uniqueUsers: this.report.summary.uniqueUsers.size,
        uniqueInfluencers: this.report.summary.uniqueInfluencers.size,
        uniquePublishers: this.report.summary.uniquePublishers.size,
        uniqueProducts: this.report.summary.uniqueProducts.size
      },
      features: {
        browserExtension: {
          ...this.report.features.browserExtension,
          topSites: Object.fromEntries(
            Array.from(this.report.features.browserExtension.topSites.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 20)
          )
        },
        staking: {
          ...this.report.features.staking,
          topInfluencers: Object.fromEntries(
            Array.from(this.report.features.staking.topInfluencers.entries())
              .sort((a, b) => b[1].value - a[1].value)
              .slice(0, 20)
          )
        },
        referrals: {
          ...this.report.features.referrals,
          uniqueReferrers: this.report.features.referrals.uniqueReferrers.size
        },
        tokens: {
          ...this.report.features.tokens,
          burnReasons: Object.fromEntries(this.report.features.tokens.burnReasons)
        },
        mobile: {
          ...this.report.features.mobile,
          sdkBreakdown: Object.fromEntries(this.report.features.mobile.sdkBreakdown),
          topGames: Object.fromEntries(
            Array.from(this.report.features.mobile.topGames.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
          )
        },
        security: {
          ...this.report.features.security,
          securityMethods: Object.fromEntries(this.report.features.security.securityMethods)
        }
      },
      hourlyMetrics: Object.fromEntries(this.report.hourlyMetrics),
      errors: {
        total: this.report.errors.total,
        byType: Object.fromEntries(this.report.errors.byType)
      }
    };
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: ts-node analyze-simulation-logs.ts <log-directory>');
    process.exit(1);
  }
  
  const logDir = args[0];
  
  if (!fs.existsSync(logDir)) {
    console.error(`Log directory not found: ${logDir}`);
    process.exit(1);
  }
  
  const analyzer = new SimulationAnalyzer();
  
  analyzer.analyzeSimulation(logDir).catch(error => {
    console.error('Analysis error:', error);
    process.exit(1);
  });
}

export { SimulationAnalyzer };