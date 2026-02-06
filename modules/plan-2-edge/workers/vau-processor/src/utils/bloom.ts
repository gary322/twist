// Bloom Filter Implementation

export class BloomFilter {
  private bits: Uint8Array;
  private numHashes: number;
  private numBits: number;

  constructor(expectedElements: number = 10000, falsePositiveRate: number = 0.01) {
    // Calculate optimal parameters
    this.numBits = Math.ceil(-expectedElements * Math.log(falsePositiveRate) / Math.pow(Math.log(2), 2));
    this.numHashes = Math.ceil(this.numBits / expectedElements * Math.log(2));
    
    // Ensure minimum size
    this.numBits = Math.max(this.numBits, 64);
    this.numHashes = Math.max(this.numHashes, 1);

    // Initialize bit array
    this.bits = new Uint8Array(Math.ceil(this.numBits / 8));
  }

  async add(item: string): Promise<void> {
    const hashes = await this.getHashes(item);
    for (const hash of hashes) {
      const index = hash % this.numBits;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      this.bits[byteIndex] |= (1 << bitIndex);
    }
  }

  async contains(item: string): Promise<boolean> {
    const hashes = await this.getHashes(item);
    for (const hash of hashes) {
      const index = hash % this.numBits;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      if (!(this.bits[byteIndex] & (1 << bitIndex))) {
        return false;
      }
    }
    return true;
  }

  private async getHashes(item: string): Promise<number[]> {
    const hashes: number[] = [];
    const encoder = new TextEncoder();
    
    // Use deterministic hashing with item + index
    for (let i = 0; i < this.numHashes; i++) {
      const data = encoder.encode(`${item}:${i}`);
      const hash = await crypto.subtle.digest('SHA-256', data);
      
      // Convert first 4 bytes to number
      const view = new DataView(hash);
      const value = view.getUint32(0);
      hashes.push(value);
    }

    return hashes;
  }

  serialize(): string {
    // Serialize both the bit array and metadata
    const data = {
      bits: Array.from(this.bits),
      numBits: this.numBits,
      numHashes: this.numHashes
    };
    return btoa(JSON.stringify(data));
  }

  static deserialize(data: string): BloomFilter {
    // Deserialize the data
    const json = atob(data);
    const parsed = JSON.parse(json);
    
    const filter = Object.create(BloomFilter.prototype);
    filter.bits = new Uint8Array(parsed.bits);
    filter.numBits = parsed.numBits;
    filter.numHashes = parsed.numHashes;
    return filter;
  }

  // Calculate union of two filters
  union(other: BloomFilter): BloomFilter {
    if (this.numBits !== other.numBits) {
      throw new Error('Bloom filters must have same size');
    }

    const result = Object.create(BloomFilter.prototype);
    result.bits = new Uint8Array(this.bits.length);
    result.numBits = this.numBits;
    result.numHashes = this.numHashes;

    for (let i = 0; i < this.bits.length; i++) {
      result.bits[i] = this.bits[i] | other.bits[i];
    }

    return result;
  }
}

// Privacy-preserving cohort targeting
export class CohortTargeting {
  private saltRotator: SaltRotator;

  constructor(private env: any) {
    this.saltRotator = new SaltRotator(env);
  }

  async createCohortFilter(criteria: TargetingCriteria): Promise<string> {
    const filter = new BloomFilter(100000, 0.01);
    const salt = await this.saltRotator.getCurrentSalt();

    // Add hashed cohort identifiers
    for (const cohort of criteria.cohorts) {
      const encoder = new TextEncoder();
      const saltedCohort = encoder.encode(salt + cohort);
      const hashedCohort = await crypto.subtle.digest('SHA-256', saltedCohort);
      const hashHex = Array.from(new Uint8Array(hashedCohort))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      await filter.add(hashHex);
    }

    // Store filter with metadata
    const filterId = crypto.randomUUID();
    await this.env.BLOOM_FILTERS.put(
      `filter:${filterId}`,
      JSON.stringify({
        filter: filter.serialize(),
        criteria: criteria,
        created: Date.now(),
        salt: salt
      }),
      { expirationTtl: 7 * 24 * 3600 } // 7 days
    );

    return filterId;
  }

  async checkCohortMembership(
    userId: string,
    filterId: string
  ): Promise<boolean> {
    const filterData = await this.env.BLOOM_FILTERS.get(`filter:${filterId}`);
    if (!filterData) return false;

    const { filter: serialized, salt } = JSON.parse(filterData);
    const filter = BloomFilter.deserialize(serialized);

    // Hash user's cohort with same salt
    const userCohort = await this.getUserCohort(userId);
    const encoder = new TextEncoder();
    const saltedCohort = encoder.encode(salt + userCohort);
    const hashedCohort = await crypto.subtle.digest('SHA-256', saltedCohort);
    const hashHex = Array.from(new Uint8Array(hashedCohort))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return await filter.contains(hashHex);
  }

  private async getUserCohort(userId: string): Promise<string> {
    // Derive cohort from user attributes without storing PII
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(userId));
    const hashArray = new Uint8Array(hash);
    const cohortIndex = (hashArray[0] << 8 | hashArray[1]) % 1000;

    // Common cohorts (demographics + interests)
    const ageGroup = ['18-24', '25-34', '35-44', '45-54', '55+'][hashArray[2] % 5];
    const interest = ['gaming', 'fashion', 'tech', 'finance', 'sports'][hashArray[3] % 5];

    return `${ageGroup}:${interest}:${cohortIndex}`;
  }
}

// Salt rotation for privacy
export class SaltRotator {
  constructor(private env: any) {}

  async getCurrentSalt(): Promise<string> {
    const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
    const saltKey = `salt:week:${week}`;

    let salt = await this.env.KV.get(saltKey);
    if (!salt) {
      // Generate new salt for this week
      salt = crypto.randomUUID();
      await this.env.KV.put(saltKey, salt, {
        expirationTtl: 8 * 24 * 3600 // Keep for 8 days
      });
    }

    return salt;
  }

  async rotateSalts(): Promise<void> {
    const currentWeek = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
    const newSalt = crypto.randomUUID();

    await this.env.KV.put(`salt:week:${currentWeek + 1}`, newSalt, {
      expirationTtl: 8 * 24 * 3600
    });

    // Clean up old salts
    const oldWeek = currentWeek - 2;
    await this.env.KV.delete(`salt:week:${oldWeek}`);
  }
}

interface TargetingCriteria {
  cohorts: string[];
  excludeCohorts?: string[];
  minTrustScore?: number;
}