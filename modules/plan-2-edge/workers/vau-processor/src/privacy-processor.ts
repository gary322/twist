/**
 * Privacy Processor - Implements privacy protection for VAU data
 */

export interface PrivacyConfig {
  removePII: boolean;
  hashUserIds: boolean;
  generalizeLocation: boolean;
  addDifferentialPrivacy: boolean;
  kAnonymity: number;
}

export class PrivacyProcessor {
  private config: PrivacyConfig;
  
  constructor(config?: Partial<PrivacyConfig>) {
    this.config = {
      removePII: true,
      hashUserIds: true,
      generalizeLocation: true,
      addDifferentialPrivacy: true,
      kAnonymity: 5,
      ...config
    };
  }
  
  /**
   * Process VAU data for privacy
   */
  async process(data: any): Promise<any> {
    let processed = { ...data };
    
    if (this.config.removePII) {
      processed = this.removePII(processed);
    }
    
    if (this.config.hashUserIds && processed.userId) {
      processed.userId = await this.hashUserId(processed.userId);
    }
    
    if (this.config.generalizeLocation && processed.metadata?.location) {
      processed.metadata.location = this.generalizeLocation(processed.metadata.location);
    }
    
    if (this.config.addDifferentialPrivacy && processed.metadata) {
      processed.metadata = this.addDifferentialPrivacy(processed.metadata);
    }
    
    return processed;
  }
  
  /**
   * Remove personally identifiable information
   */
  private removePII(data: any): any {
    const piiFields = [
      'email', 'phone', 'name', 'firstName', 'lastName',
      'address', 'ssn', 'creditCard', 'ip', 'ipAddress'
    ];
    
    const cleaned = { ...data };
    
    // Remove from top level
    piiFields.forEach(field => {
      delete cleaned[field];
    });
    
    // Remove from metadata
    if (cleaned.metadata) {
      cleaned.metadata = { ...cleaned.metadata };
      piiFields.forEach(field => {
        delete cleaned.metadata[field];
      });
    }
    
    return cleaned;
  }
  
  /**
   * Hash user ID for privacy
   */
  private async hashUserId(userId: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(userId);
    const hash = await crypto.subtle.digest('SHA-256', data);
    
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16); // Use first 16 chars for brevity
  }
  
  /**
   * Generalize location data
   */
  private generalizeLocation(location: any): any {
    const generalized: any = {};
    
    // Keep only country and region/state
    if (location.country) {
      generalized.country = location.country;
    }
    
    if (location.region || location.state) {
      generalized.region = location.region || location.state;
    }
    
    // Round coordinates to reduce precision
    if (location.lat && location.lon) {
      generalized.lat = Math.round(location.lat * 100) / 100;
      generalized.lon = Math.round(location.lon * 100) / 100;
    }
    
    return generalized;
  }
  
  /**
   * Add differential privacy noise
   */
  private addDifferentialPrivacy(metadata: any): any {
    const processed = { ...metadata };
    
    // Add noise to numeric fields
    const numericFields = ['age', 'income', 'score', 'value', 'amount'];
    
    numericFields.forEach(field => {
      if (typeof processed[field] === 'number') {
        processed[field] = this.addLaplaceNoise(processed[field], 1.0);
      }
    });
    
    // Round timestamps to nearest hour
    if (processed.timestamp) {
      processed.timestamp = Math.floor(processed.timestamp / 3600000) * 3600000;
    }
    
    return processed;
  }
  
  /**
   * Add Laplace noise for differential privacy
   */
  private addLaplaceNoise(value: number, sensitivity: number, epsilon: number = 1.0): number {
    const scale = sensitivity / epsilon;
    const u = Math.random() - 0.5;
    const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    
    return Math.round(value + noise);
  }
  
  /**
   * Check k-anonymity
   */
  async checkKAnonymity(
    records: any[],
    quasiIdentifiers: string[]
  ): Promise<boolean> {
    const groups = new Map<string, number>();
    
    records.forEach(record => {
      const key = quasiIdentifiers
        .map(field => record[field] || 'null')
        .join('|');
      
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    
    // Check if all groups have at least k members
    for (const count of groups.values()) {
      if (count < this.config.kAnonymity) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Suppress records that don't meet k-anonymity
   */
  suppressNonAnonymous(
    records: any[],
    quasiIdentifiers: string[]
  ): any[] {
    const groups = new Map<string, any[]>();
    
    // Group records
    records.forEach(record => {
      const key = quasiIdentifiers
        .map(field => record[field] || 'null')
        .join('|');
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    });
    
    // Keep only groups with k or more members
    const anonymousRecords: any[] = [];
    
    groups.forEach(group => {
      if (group.length >= this.config.kAnonymity) {
        anonymousRecords.push(...group);
      }
    });
    
    return anonymousRecords;
  }
}