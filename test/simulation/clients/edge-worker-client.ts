/**
 * Mock Edge Worker Client for simulation
 */

import { VAUData } from '../types';

export class EdgeWorkerClient {
  private vauCount = 0;
  private bloomFilter = new Set<string>();

  async submitVAU(data: VAUData): Promise<{ success: boolean; earned: number; vauId: string }> {
    // Simulate edge worker processing
    
    // Check rate limit
    const rateLimitKey = `${data.userId}:${Date.now() / 60000 | 0}`; // Per minute
    
    // Check uniqueness
    const vauKey = `${data.userId}:${data.siteId}:${Date.now() / 3600000 | 0}`; // Per hour
    const isUnique = !this.bloomFilter.has(vauKey);
    
    if (isUnique) {
      this.bloomFilter.add(vauKey);
    }

    // Calculate reward
    const baseReward = 0.1; // 0.1 TWIST base
    const timeMultiplier = Math.min(data.timeSpent / 300, 2); // Cap at 2x for 5+ minutes
    const uniqueMultiplier = isUnique ? 1.0 : 0.1; // 10% for duplicates
    
    const earned = baseReward * timeMultiplier * uniqueMultiplier;
    
    this.vauCount++;

    return {
      success: true,
      earned,
      vauId: `vau_${this.vauCount}_${Date.now()}`
    };
  }

  async batchSubmitVAUs(vaus: VAUData[]): Promise<any[]> {
    const results = [];
    for (const vau of vaus) {
      const result = await this.submitVAU(vau);
      results.push(result);
    }
    return results;
  }
}