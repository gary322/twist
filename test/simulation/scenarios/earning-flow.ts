/**
 * Earning Flow Scenario
 * Simulates users browsing websites and earning TWIST tokens
 */

import { User } from '../actors/user';
import { Publisher } from '../actors/publisher';
import { SimulationMetrics } from '../utils/metrics';

export class EarningFlowScenario {
  constructor(
    private users: User[],
    private publishers: Publisher[],
    private metrics: SimulationMetrics
  ) {}

  async run(): Promise<any> {
    const results = {
      usersBrowsed: 0,
      totalVAUs: 0,
      totalEarned: 0,
      avgEarningsPerUser: 0,
      publisherEarnings: 0,
      browsingPatterns: [] as any[]
    };

    // Simulate different browsing patterns
    const patterns = [
      { name: 'Casual', sites: 3, timePerSite: 120 }, // 2 min per site
      { name: 'Active', sites: 10, timePerSite: 300 }, // 5 min per site  
      { name: 'Power', sites: 20, timePerSite: 180 } // 3 min per site
    ];

    // Assign users to patterns
    const casualUsers = this.users.slice(0, 50);
    const activeUsers = this.users.slice(50, 80);
    const powerUsers = this.users.slice(80, 100);

    // Simulate casual users
    console.log('\n  Simulating casual users...');
    for (const user of casualUsers) {
      const earned = await this.simulateUserBrowsing(user, patterns[0]);
      results.totalEarned += earned;
      results.usersBrowsed++;
    }

    // Simulate active users
    console.log('  Simulating active users...');
    for (const user of activeUsers) {
      const earned = await this.simulateUserBrowsing(user, patterns[1]);
      results.totalEarned += earned;
      results.usersBrowsed++;
    }

    // Simulate power users
    console.log('  Simulating power users...');
    for (const user of powerUsers) {
      const earned = await this.simulateUserBrowsing(user, patterns[2]);
      results.totalEarned += earned;
      results.usersBrowsed++;
    }

    // Calculate publisher earnings
    for (const publisher of this.publishers) {
      results.publisherEarnings += publisher.getTotalEarnings();
    }

    results.avgEarningsPerUser = results.totalEarned / results.usersBrowsed;
    results.totalVAUs = this.metrics.getTotalVAUs();

    return results;
  }

  private async simulateUserBrowsing(user: User, pattern: any): Promise<number> {
    let totalEarned = 0;

    for (let i = 0; i < pattern.sites; i++) {
      // 30% chance to visit a publisher site
      if (Math.random() < 0.3 && this.publishers.length > 0) {
        const publisher = this.publishers[Math.floor(Math.random() * this.publishers.length)];
        const result = await user.visitPublisherSite(publisher);
        totalEarned += result.userEarned;
        
        this.metrics.recordVAU({
          userId: user.id,
          siteId: publisher.profile.domain,
          earned: result.userEarned,
          type: 'publisher'
        });
      } else {
        // Regular browsing
        const earned = await user.browseAndEarn();
        totalEarned += earned;
        
        this.metrics.recordVAU({
          userId: user.id,
          siteId: 'general',
          earned,
          type: 'regular'
        });
      }

      // Small delay between sites
      await this.delay(100);
    }

    return totalEarned;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}