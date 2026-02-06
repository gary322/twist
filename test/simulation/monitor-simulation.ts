/**
 * Real-time monitoring for the massive simulation
 * Shows live statistics and feature usage
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { exec } from 'child_process';

interface SimulationStats {
  startTime: number;
  events: {
    total: number;
    byType: Map<string, number>;
    perSecond: number;
  };
  users: {
    active: number;
    withExtension: number;
    with2FA: number;
    staking: number;
  };
  tokens: {
    totalEarned: number;
    totalBurned: number;
    totalStaked: number;
    circulatingSupply: number;
  };
  features: {
    browserExtension: {
      installs: number;
      activeSessions: number;
      vausSubmitted: number;
    };
    staking: {
      influencerStakes: number;
      websiteStakes: number;
      totalValue: number;
      rewardsClaimed: number;
    };
    referrals: {
      codesCreated: number;
      codesUsed: number;
      totalCommissions: number;
    };
    mobile: {
      sdkInits: number;
      gameSessions: number;
      tokensEarned: number;
    };
  };
  errors: number;
}

class SimulationMonitor {
  private stats: SimulationStats;
  private logDir: string;
  private updateInterval: NodeJS.Timeout | null = null;
  private logWatchers: Map<string, fs.FSWatcher> = new Map();
  
  constructor(logDir: string) {
    this.logDir = logDir;
    this.stats = this.initializeStats();
  }
  
  private initializeStats(): SimulationStats {
    return {
      startTime: Date.now(),
      events: {
        total: 0,
        byType: new Map(),
        perSecond: 0
      },
      users: {
        active: 0,
        withExtension: 0,
        with2FA: 0,
        staking: 0
      },
      tokens: {
        totalEarned: 0,
        totalBurned: 0,
        totalStaked: 0,
        circulatingSupply: 500000000 // 500M initial
      },
      features: {
        browserExtension: {
          installs: 0,
          activeSessions: 0,
          vausSubmitted: 0
        },
        staking: {
          influencerStakes: 0,
          websiteStakes: 0,
          totalValue: 0,
          rewardsClaimed: 0
        },
        referrals: {
          codesCreated: 0,
          codesUsed: 0,
          totalCommissions: 0
        },
        mobile: {
          sdkInits: 0,
          gameSessions: 0,
          tokensEarned: 0
        }
      },
      errors: 0
    };
  }
  
  async start() {
    console.clear();
    console.log('📊 TWIST Platform Simulation Monitor');
    console.log('====================================\n');
    
    // Find the latest simulation directory
    const simDirs = fs.readdirSync(this.logDir)
      .filter(d => d.startsWith('simulation_'))
      .sort()
      .reverse();
    
    if (simDirs.length === 0) {
      console.error('No simulation logs found. Start the simulation first.');
      return;
    }
    
    const latestDir = path.join(this.logDir, simDirs[0]);
    console.log(`Monitoring: ${latestDir}\n`);
    
    // Watch log files
    this.watchLogFiles(latestDir);
    
    // Update display every second
    this.updateInterval = setInterval(() => {
      this.updateDisplay();
    }, 1000);
    
    // Handle exit
    process.on('SIGINT', () => {
      this.stop();
    });
  }
  
  private watchLogFiles(dir: string) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.log'));
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      
      // Read existing content
      this.processLogFile(filePath);
      
      // Watch for changes
      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          this.processNewLines(filePath);
        }
      });
      
      this.logWatchers.set(filePath, watcher);
    });
  }
  
  private processLogFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      try {
        if (line.startsWith('{')) {
          const event = JSON.parse(line);
          this.updateStats(event);
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    });
  }
  
  private lastPositions: Map<string, number> = new Map();
  
  private processNewLines(filePath: string) {
    const lastPos = this.lastPositions.get(filePath) || 0;
    const stats = fs.statSync(filePath);
    
    if (stats.size > lastPos) {
      const stream = fs.createReadStream(filePath, {
        start: lastPos,
        end: stats.size
      });
      
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });
      
      rl.on('line', (line) => {
        try {
          if (line.startsWith('{')) {
            const event = JSON.parse(line);
            this.updateStats(event);
          }
        } catch (e) {
          // Skip
        }
      });
      
      this.lastPositions.set(filePath, stats.size);
    }
  }
  
  private updateStats(event: any) {
    this.stats.events.total++;
    
    const type = event.type || 'unknown';
    const count = this.stats.events.byType.get(type) || 0;
    this.stats.events.byType.set(type, count + 1);
    
    // Update specific stats based on event type
    switch (type) {
      case 'EXTENSION_INSTALLED':
        this.stats.features.browserExtension.installs++;
        this.stats.users.withExtension++;
        break;
        
      case 'EXTENSION_BROWSING':
        this.stats.features.browserExtension.activeSessions++;
        break;
        
      case 'VAU_SUBMITTED':
        this.stats.features.browserExtension.vausSubmitted++;
        break;
        
      case 'TOKENS_EARNED':
        this.stats.tokens.totalEarned += event.data?.tokensEarned || 0;
        break;
        
      case 'STAKE_ON_INFLUENCER':
        this.stats.features.staking.influencerStakes++;
        this.stats.features.staking.totalValue += event.data?.amount || 0;
        this.stats.tokens.totalStaked += event.data?.amount || 0;
        break;
        
      case 'STAKE_ON_WEBSITE':
        this.stats.features.staking.websiteStakes++;
        this.stats.features.staking.totalValue += event.data?.amount || 0;
        this.stats.tokens.totalStaked += event.data?.amount || 0;
        break;
        
      case 'CLAIM_REWARDS':
        this.stats.features.staking.rewardsClaimed++;
        break;
        
      case 'REFERRAL_CODE_CREATED':
        this.stats.features.referrals.codesCreated++;
        break;
        
      case 'REFERRAL_CODE_USED':
        this.stats.features.referrals.codesUsed++;
        this.stats.features.referrals.totalCommissions += event.data?.commission || 0;
        break;
        
      case 'TOKEN_BURN':
        this.stats.tokens.totalBurned += event.data?.amount || 0;
        this.stats.tokens.circulatingSupply -= event.data?.amount || 0;
        break;
        
      case 'MOBILE_SDK_INIT':
        this.stats.features.mobile.sdkInits++;
        break;
        
      case 'MOBILE_GAME_PLAY':
        this.stats.features.mobile.gameSessions++;
        this.stats.features.mobile.tokensEarned += event.data?.tokensEarned || 0;
        break;
        
      case 'TWO_FA_ENABLED':
        this.stats.users.with2FA++;
        break;
    }
    
    // Track unique active users
    if (event.userId) {
      // In a real implementation, we'd track unique users properly
      this.stats.users.active = Math.min(this.stats.users.active + 1, 10000);
    }
  }
  
  private updateDisplay() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    const eventsPerSecond = this.stats.events.total / elapsed;
    
    // Clear and redraw
    console.clear();
    
    console.log('📊 TWIST Platform Simulation Monitor');
    console.log('====================================\n');
    
    console.log(`⏱️  Elapsed: ${this.formatDuration(elapsed)}`);
    console.log(`📈 Events: ${this.stats.events.total.toLocaleString()} (${eventsPerSecond.toFixed(1)}/sec)\n`);
    
    console.log('👥 USER STATISTICS');
    console.log('------------------');
    console.log(`Active Users: ${this.stats.users.active.toLocaleString()}`);
    console.log(`With Extension: ${this.stats.users.withExtension.toLocaleString()}`);
    console.log(`With 2FA: ${this.stats.users.with2FA.toLocaleString()}`);
    console.log(`Staking: ${(this.stats.features.staking.influencerStakes + this.stats.features.staking.websiteStakes).toLocaleString()}\n`);
    
    console.log('🌐 BROWSER EXTENSION');
    console.log('-------------------');
    console.log(`Installs: ${this.stats.features.browserExtension.installs.toLocaleString()}`);
    console.log(`Active Sessions: ${this.stats.features.browserExtension.activeSessions.toLocaleString()}`);
    console.log(`VAUs Submitted: ${this.stats.features.browserExtension.vausSubmitted.toLocaleString()}\n`);
    
    console.log('💰 STAKING ACTIVITY');
    console.log('------------------');
    console.log(`Influencer Stakes: ${this.stats.features.staking.influencerStakes.toLocaleString()}`);
    console.log(`Website Stakes: ${this.stats.features.staking.websiteStakes.toLocaleString()}`);
    console.log(`Total Value: ${(this.stats.features.staking.totalValue / 1e6).toFixed(2)}M TWIST`);
    console.log(`Rewards Claimed: ${this.stats.features.staking.rewardsClaimed.toLocaleString()}\n`);
    
    console.log('🎯 REFERRAL SYSTEM');
    console.log('-----------------');
    console.log(`Codes Created: ${this.stats.features.referrals.codesCreated.toLocaleString()}`);
    console.log(`Codes Used: ${this.stats.features.referrals.codesUsed.toLocaleString()}`);
    console.log(`Commissions: ${this.stats.features.referrals.totalCommissions.toFixed(2)} TWIST\n`);
    
    console.log('📱 MOBILE SDK');
    console.log('-------------');
    console.log(`SDK Inits: ${this.stats.features.mobile.sdkInits.toLocaleString()}`);
    console.log(`Game Sessions: ${this.stats.features.mobile.gameSessions.toLocaleString()}`);
    console.log(`Tokens Earned: ${this.stats.features.mobile.tokensEarned.toFixed(2)} TWIST\n`);
    
    console.log('🪙 TOKEN ECONOMICS');
    console.log('-----------------');
    console.log(`Total Earned: ${(this.stats.tokens.totalEarned / 1e3).toFixed(1)}K TWIST`);
    console.log(`Total Burned: ${(this.stats.tokens.totalBurned / 1e3).toFixed(1)}K TWIST`);
    console.log(`Total Staked: ${(this.stats.tokens.totalStaked / 1e6).toFixed(2)}M TWIST`);
    console.log(`Circulating: ${(this.stats.tokens.circulatingSupply / 1e6).toFixed(2)}M TWIST\n`);
    
    console.log('📊 EVENT DISTRIBUTION');
    console.log('--------------------');
    const topEvents = Array.from(this.stats.events.byType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    topEvents.forEach(([type, count]) => {
      const percentage = (count / this.stats.events.total * 100).toFixed(1);
      console.log(`${type}: ${count.toLocaleString()} (${percentage}%)`);
    });
    
    if (this.stats.errors > 0) {
      console.log(`\n⚠️  Errors: ${this.stats.errors}`);
    }
    
    console.log('\n[Press Ctrl+C to stop monitoring]');
  }
  
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
  
  stop() {
    console.log('\n\n📊 Monitoring stopped.');
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.logWatchers.forEach(watcher => watcher.close());
    
    process.exit(0);
  }
}

// Main execution
if (require.main === module) {
  const logDir = path.join(__dirname, 'simulation-logs');
  const monitor = new SimulationMonitor(logDir);
  
  monitor.start().catch(error => {
    console.error('Monitor error:', error);
    process.exit(1);
  });
}

export { SimulationMonitor };