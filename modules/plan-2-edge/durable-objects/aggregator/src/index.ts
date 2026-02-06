// VAU Aggregator Durable Object
import { Env } from '../../../shared/types/env';

interface AggregatedData {
  count: number;
  totalEarned: number;
  uniqueUsers: Set<string>;
  uniqueDevices: Set<string>;
  uniqueSites: Set<string>;
  trustScoreSum: number;
  lastUpdated: number;
}

interface AggregateSnapshot {
  timestamp: number;
  hourly: {
    count: number;
    totalEarned: number;
    uniqueUsers: number;
    uniqueDevices: number;
    uniqueSites: number;
    avgTrustScore: number;
  };
}

export class VAUAggregator implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private storage: DurableObjectStorage;
  private currentHour: AggregatedData | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/add':
          return await this.handleAddVAU(request);
        case '/snapshot':
          return await this.handleSnapshot(request);
        case '/query':
          return await this.handleQuery(request);
        case '/reset':
          return await this.handleReset(request);
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('VAU aggregator error:', error);
      return new Response(JSON.stringify({
        error: 'Internal error',
        message: (error as Error).message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleAddVAU(request: Request): Promise<Response> {
    const vau = await request.json() as {
      userId: string;
      deviceId: string;
      siteId: string;
      earned: number;
      trustScore: number;
    };

    // Get current hour key
    const hourKey = this.getHourKey();
    
    // Load or initialize current hour data
    if (!this.currentHour) {
      const stored = await this.storage.get<any>(`hour:${hourKey}`);
      if (stored) {
        // Reconstruct Sets from arrays
        this.currentHour = {
          count: stored.count,
          totalEarned: stored.totalEarned,
          uniqueUsers: new Set(stored.uniqueUsers),
          uniqueDevices: new Set(stored.uniqueDevices),
          uniqueSites: new Set(stored.uniqueSites),
          trustScoreSum: stored.trustScoreSum,
          lastUpdated: stored.lastUpdated
        };
      } else {
        this.currentHour = {
          count: 0,
          totalEarned: 0,
          uniqueUsers: new Set(),
          uniqueDevices: new Set(),
          uniqueSites: new Set(),
          trustScoreSum: 0,
          lastUpdated: Date.now()
        };
      }
    }

    // Update aggregates
    this.currentHour.count++;
    this.currentHour.totalEarned += vau.earned;
    this.currentHour.uniqueUsers.add(vau.userId);
    this.currentHour.uniqueDevices.add(vau.deviceId);
    this.currentHour.uniqueSites.add(vau.siteId);
    this.currentHour.trustScoreSum += vau.trustScore;
    this.currentHour.lastUpdated = Date.now();

    // Store updated data (convert Sets to arrays for storage)
    await this.storage.put(`hour:${hourKey}`, {
      count: this.currentHour.count,
      totalEarned: this.currentHour.totalEarned,
      uniqueUsers: Array.from(this.currentHour.uniqueUsers),
      uniqueDevices: Array.from(this.currentHour.uniqueDevices),
      uniqueSites: Array.from(this.currentHour.uniqueSites),
      trustScoreSum: this.currentHour.trustScoreSum,
      lastUpdated: this.currentHour.lastUpdated
    });

    return new Response(JSON.stringify({
      success: true,
      hourKey,
      aggregates: {
        count: this.currentHour.count,
        totalEarned: this.currentHour.totalEarned,
        uniqueUsers: this.currentHour.uniqueUsers.size,
        uniqueDevices: this.currentHour.uniqueDevices.size,
        uniqueSites: this.currentHour.uniqueSites.size,
        avgTrustScore: this.currentHour.count > 0 
          ? this.currentHour.trustScoreSum / this.currentHour.count 
          : 0
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleSnapshot(request: Request): Promise<Response> {
    const { hourKey } = await request.json() as { hourKey?: string };
    const key = hourKey || this.getHourKey();

    const data = await this.storage.get<any>(`hour:${key}`);
    if (!data) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No data for specified hour'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const snapshot: AggregateSnapshot = {
      timestamp: Date.now(),
      hourly: {
        count: data.count,
        totalEarned: data.totalEarned,
        uniqueUsers: data.uniqueUsers.length,
        uniqueDevices: data.uniqueDevices.length,
        uniqueSites: data.uniqueSites.length,
        avgTrustScore: data.count > 0 ? data.trustScoreSum / data.count : 0
      }
    };

    // Store snapshot
    await this.storage.put(`snapshot:${key}`, snapshot);

    return new Response(JSON.stringify({
      success: true,
      snapshot
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleQuery(request: Request): Promise<Response> {
    const { startHour, endHour } = await request.json() as {
      startHour: string;
      endHour: string;
    };

    const snapshots: AggregateSnapshot[] = [];
    const start = new Date(startHour);
    const end = new Date(endHour);

    // Iterate through hours
    const current = new Date(start);
    while (current <= end) {
      const hourKey = this.formatHourKey(current);
      const snapshot = await this.storage.get<AggregateSnapshot>(`snapshot:${hourKey}`);
      
      if (snapshot) {
        snapshots.push(snapshot);
      }

      current.setHours(current.getHours() + 1);
    }

    // Calculate totals
    const totals = snapshots.reduce((acc, snap) => ({
      count: acc.count + snap.hourly.count,
      totalEarned: acc.totalEarned + snap.hourly.totalEarned,
      avgTrustScore: acc.avgTrustScore + snap.hourly.avgTrustScore
    }), {
      count: 0,
      totalEarned: 0,
      avgTrustScore: 0
    });

    if (snapshots.length > 0) {
      totals.avgTrustScore = totals.avgTrustScore / snapshots.length;
    }

    return new Response(JSON.stringify({
      success: true,
      period: { startHour, endHour },
      snapshots,
      totals,
      count: snapshots.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleReset(request: Request): Promise<Response> {
    const { confirm } = await request.json() as { confirm: boolean };

    if (!confirm) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Confirmation required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Clear all data
    const keys = await this.storage.list();
    await this.storage.delete(Array.from(keys.keys()));
    this.currentHour = null;

    return new Response(JSON.stringify({
      success: true,
      message: 'All data cleared'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private getHourKey(): string {
    const now = new Date();
    return this.formatHourKey(now);
  }

  private formatHourKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCHours()).padStart(2, '0')}`;
  }
}

// Export for Cloudflare Workers
export default {
  VAUAggregator
};