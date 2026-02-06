/**
 * Mock Data Generator for Simulation
 */

export class MockDataGenerator {
  private userCounter = 0;
  private influencerCounter = 0;
  private publisherCounter = 0;
  private advertiserCounter = 0;

  generateUsers(count: number): any[] {
    const users = [];
    const interests = [
      'crypto', 'gaming', 'defi', 'nft', 'earning', 
      'rewards', 'technology', 'finance', 'social', 'entertainment'
    ];
    
    const countries = ['US', 'UK', 'CA', 'DE', 'FR', 'JP', 'KR', 'AU', 'BR', 'IN'];
    
    for (let i = 0; i < count; i++) {
      const userId = `user_${++this.userCounter}`;
      users.push({
        id: userId,
        email: `user${this.userCounter}@example.com`,
        profile: {
          id: userId,
          email: `user${this.userCounter}@example.com`,
          interests: this.pickRandom(interests, 3),
          demographics: {
            age: 18 + Math.floor(Math.random() * 40),
            country: this.pickRandom(countries, 1)[0],
            language: 'en'
          }
        },
        walletAddress: this.generateWalletAddress(),
        hasExtension: Math.random() > 0.3, // 70% have extension
        balance: 1000 + Math.floor(Math.random() * 9000) // 1000-10000 TWIST
      });
    }
    
    return users;
  }

  generateInfluencers(count: number): any[] {
    const influencers = [];
    const platforms = ['twitter', 'instagram', 'youtube', 'tiktok'];
    const categories = ['crypto', 'gaming', 'tech', 'finance', 'lifestyle'];
    
    for (let i = 0; i < count; i++) {
      const influencerId = `inf_${++this.influencerCounter}`;
      const platform = this.pickRandom(platforms, 1)[0];
      const followers = this.generateFollowerCount(i, count);
      
      influencers.push({
        id: influencerId,
        profile: {
          id: influencerId,
          username: `${platform}_influencer_${this.influencerCounter}`,
          platform,
          followers,
          verified: followers > 50000 || Math.random() > 0.7,
          category: this.pickRandom(categories, 1)[0],
          walletAddress: this.generateWalletAddress()
        },
        balance: 5000 + Math.floor(Math.random() * 45000), // 5000-50000 TWIST
        tier: this.calculateInfluencerTier(followers)
      });
    }
    
    return influencers.sort((a, b) => b.profile.followers - a.profile.followers);
  }

  generatePublishers(count: number): any[] {
    const publishers = [];
    const categories = ['news', 'gaming', 'crypto', 'tech', 'entertainment', 'education'];
    const tlds = ['.com', '.io', '.net', '.org', '.co'];
    
    for (let i = 0; i < count; i++) {
      const publisherId = `pub_${++this.publisherCounter}`;
      const category = this.pickRandom(categories, 1)[0];
      const domain = `${category}site${this.publisherCounter}${this.pickRandom(tlds, 1)[0]}`;
      
      publishers.push({
        id: publisherId,
        profile: {
          id: publisherId,
          domain,
          category,
          monthlyVisits: 10000 + Math.floor(Math.random() * 990000), // 10K-1M
          walletAddress: this.generateWalletAddress()
        },
        balance: 2000 + Math.floor(Math.random() * 18000) // 2000-20000 TWIST
      });
    }
    
    return publishers;
  }

  generateAdvertisers(count: number): any[] {
    const advertisers = [];
    const industries = ['gaming', 'crypto', 'fintech', 'ecommerce', 'saas', 'defi'];
    
    for (let i = 0; i < count; i++) {
      const advertiserId = `adv_${++this.advertiserCounter}`;
      const industry = this.pickRandom(industries, 1)[0];
      
      advertisers.push({
        id: advertiserId,
        profile: {
          id: advertiserId,
          company: `${industry.charAt(0).toUpperCase() + industry.slice(1)} Corp ${this.advertiserCounter}`,
          industry,
          website: `https://${industry}${this.advertiserCounter}.com`,
          walletAddress: this.generateWalletAddress()
        },
        balance: 50000 + Math.floor(Math.random() * 450000), // 50K-500K TWIST
        budget: 10000 + Math.floor(Math.random() * 90000) // $10K-100K
      });
    }
    
    return advertisers;
  }

  generatePlatformConfig(): any {
    return {
      decayRate: 0.001, // 0.1% daily
      transferFee: 0.003, // 0.3%
      stakingRewardRate: 0.0001, // 0.01% hourly
      minStake: 10,
      maxStake: 1000000,
      treasurySplit: {
        floor: 0.7,
        operations: 0.3
      }
    };
  }

  generateSites(count: number): string[] {
    const sites = [];
    const domains = ['example', 'test', 'demo', 'sample', 'mock'];
    const tlds = ['.com', '.net', '.org', '.io'];
    
    for (let i = 0; i < count; i++) {
      const domain = this.pickRandom(domains, 1)[0];
      const tld = this.pickRandom(tlds, 1)[0];
      sites.push(`https://${domain}${i}${tld}`);
    }
    
    return sites;
  }

  private generateWalletAddress(): string {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '';
    for (let i = 0; i < 44; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
  }

  private generateFollowerCount(index: number, total: number): number {
    // Power law distribution for follower counts
    const percentile = index / total;
    
    if (percentile < 0.1) {
      // Top 10% - 100K to 1M followers
      return 100000 + Math.floor(Math.random() * 900000);
    } else if (percentile < 0.3) {
      // Next 20% - 20K to 100K
      return 20000 + Math.floor(Math.random() * 80000);
    } else if (percentile < 0.6) {
      // Next 30% - 5K to 20K
      return 5000 + Math.floor(Math.random() * 15000);
    } else {
      // Bottom 40% - 1K to 5K
      return 1000 + Math.floor(Math.random() * 4000);
    }
  }

  private calculateInfluencerTier(followers: number): string {
    if (followers >= 100000) return 'PLATINUM';
    if (followers >= 50000) return 'GOLD';
    if (followers >= 10000) return 'SILVER';
    return 'BRONZE';
  }

  private pickRandom<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, array.length));
  }
}

// Create single instance for consistency
const generator = new MockDataGenerator();

// Export functions that use the generator
export const generateUsers = (count: number) => generator.generateUsers(count);
export const generateInfluencers = (count: number) => generator.generateInfluencers(count);
export const generatePublishers = (count: number) => generator.generatePublishers(count);
export const generateAdvertisers = (count: number) => generator.generateAdvertisers(count);