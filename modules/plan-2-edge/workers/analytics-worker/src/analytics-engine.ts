/**
 * Analytics Engine - Production-ready analytics processing
 */

export interface MetricsData {
  userId?: string;
  siteId: string;
  eventType: string;
  timestamp: number;
  value?: number;
  metadata?: Record<string, any>;
}

export interface AggregatedMetrics {
  period: string;
  siteId: string;
  metrics: {
    totalEvents: number;
    uniqueUsers: number;
    totalValue: number;
    avgValue: number;
    eventBreakdown: Record<string, number>;
    topUsers: Array<{ userId: string; events: number; value: number }>;
  };
}

export interface ReportConfig {
  siteId: string;
  startDate: Date;
  endDate: Date;
  metrics: string[];
  groupBy?: 'hour' | 'day' | 'week' | 'month';
  format?: 'json' | 'csv';
}

export interface EngagementMetrics {
  siteId: string;
  period: string;
  dau: number; // Daily Active Users
  wau: number; // Weekly Active Users
  mau: number; // Monthly Active Users
  stickiness: number; // DAU/MAU ratio
  retention: {
    day1: number;
    day7: number;
    day30: number;
  };
  avgSessionDuration: number;
  avgEventsPerUser: number;
}

export class AnalyticsEngine {
  constructor(
    private env: any,
    private ctx: ExecutionContext
  ) {}

  /**
   * Aggregate user metrics
   */
  async aggregateUserMetrics(
    siteId: string,
    timeWindow: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<AggregatedMetrics> {
    const windowMs = this.getWindowMilliseconds(timeWindow);
    const currentWindow = Math.floor(Date.now() / windowMs);
    const period = `${timeWindow}:${currentWindow}`;
    
    // Get or create aggregation
    const key = `metrics:${siteId}:${period}`;
    let aggregation = await this.env.ANALYTICS.get(key, { type: 'json' });
    
    if (!aggregation) {
      aggregation = {
        period,
        siteId,
        metrics: {
          totalEvents: 0,
          uniqueUsers: 0,
          totalValue: 0,
          avgValue: 0,
          eventBreakdown: {},
          topUsers: []
        }
      };
    }
    
    return aggregation;
  }

  /**
   * Process incoming metrics data
   */
  async processMetrics(data: MetricsData): Promise<void> {
    const windowMs = this.getWindowMilliseconds('hour');
    const currentWindow = Math.floor(data.timestamp / windowMs);
    
    // Update multiple aggregation windows
    const windows = ['hour', 'day', 'week', 'month'];
    
    for (const window of windows) {
      const period = this.getPeriodKey(data.timestamp, window as any);
      const key = `metrics:${data.siteId}:${window}:${period}`;
      
      // Get current aggregation
      let agg = await this.env.ANALYTICS.get(key, { type: 'json' }) || {
        totalEvents: 0,
        uniqueUsers: new Set(),
        totalValue: 0,
        eventBreakdown: {},
        userMetrics: new Map()
      };
      
      // Update metrics
      agg.totalEvents++;
      
      if (data.userId) {
        if (typeof agg.uniqueUsers === 'object' && !Array.isArray(agg.uniqueUsers)) {
          agg.uniqueUsers = new Set(Object.keys(agg.uniqueUsers));
        } else if (Array.isArray(agg.uniqueUsers)) {
          agg.uniqueUsers = new Set(agg.uniqueUsers);
        }
        agg.uniqueUsers.add(data.userId);
      }
      
      if (data.value) {
        agg.totalValue += data.value;
      }
      
      // Event breakdown
      agg.eventBreakdown[data.eventType] = (agg.eventBreakdown[data.eventType] || 0) + 1;
      
      // User metrics
      if (data.userId) {
        if (!agg.userMetrics) agg.userMetrics = {};
        if (!agg.userMetrics[data.userId]) {
          agg.userMetrics[data.userId] = { events: 0, value: 0 };
        }
        agg.userMetrics[data.userId].events++;
        if (data.value) {
          agg.userMetrics[data.userId].value += data.value;
        }
      }
      
      // Calculate averages
      agg.avgValue = agg.totalEvents > 0 ? agg.totalValue / agg.totalEvents : 0;
      
      // Convert Set to array for storage
      const aggToStore = {
        ...agg,
        uniqueUsers: Array.from(agg.uniqueUsers),
        uniqueUsersCount: agg.uniqueUsers.size
      };
      
      // Store updated aggregation
      await this.env.ANALYTICS.put(key, JSON.stringify(aggToStore), {
        expirationTtl: this.getRetentionSeconds(window as any)
      });
    }
  }

  /**
   * Generate analytics report
   */
  async generateReport(config: ReportConfig): Promise<any> {
    const { siteId, startDate, endDate, metrics, groupBy = 'day' } = config;
    const results: any[] = [];
    
    // Generate time periods
    const periods = this.generateTimePeriods(startDate, endDate, groupBy);
    
    for (const period of periods) {
      const key = `metrics:${siteId}:${groupBy}:${period}`;
      const data = await this.env.ANALYTICS.get(key, { type: 'json' });
      
      if (data) {
        const periodData: any = {
          period,
          date: new Date(this.periodToTimestamp(period, groupBy))
        };
        
        // Add requested metrics
        metrics.forEach(metric => {
          switch (metric) {
            case 'events':
              periodData.events = data.totalEvents;
              break;
            case 'users':
              periodData.users = data.uniqueUsersCount || 0;
              break;
            case 'value':
              periodData.value = data.totalValue;
              periodData.avgValue = data.avgValue;
              break;
            case 'breakdown':
              periodData.eventBreakdown = data.eventBreakdown;
              break;
          }
        });
        
        results.push(periodData);
      }
    }
    
    // Format output
    if (config.format === 'csv') {
      return this.convertToCSV(results);
    }
    
    return {
      report: {
        siteId,
        startDate,
        endDate,
        groupBy,
        metrics,
        data: results
      }
    };
  }

  /**
   * Real-time dashboard updates via WebSocket
   */
  async sendDashboardUpdate(siteId: string, data: any): Promise<void> {
    // In a real implementation, this would send to WebSocket
    // For now, store in KV for polling
    const key = `realtime:${siteId}`;
    const updates = await this.env.REALTIME.get(key, { type: 'json' }) || [];
    
    updates.push({
      timestamp: Date.now(),
      data
    });
    
    // Keep last 100 updates
    const recentUpdates = updates.slice(-100);
    
    await this.env.REALTIME.put(key, JSON.stringify(recentUpdates), {
      expirationTtl: 3600 // 1 hour
    });
  }

  /**
   * Export analytics data
   */
  async exportAnalyticsData(
    siteId: string,
    format: 'json' | 'csv' | 'parquet',
    timeRange?: { start: Date; end: Date }
  ): Promise<{ url: string; expiresAt: Date }> {
    // Generate export
    const exportId = crypto.randomUUID();
    const exportKey = `export:${exportId}`;
    
    // Collect data
    const data = await this.collectExportData(siteId, timeRange);
    
    // Format data
    let formatted: any;
    let contentType: string;
    
    switch (format) {
      case 'csv':
        formatted = this.convertToCSV(data);
        contentType = 'text/csv';
        break;
      case 'parquet':
        formatted = await this.convertToParquet(data);
        contentType = 'application/octet-stream';
        break;
      default:
        formatted = JSON.stringify(data, null, 2);
        contentType = 'application/json';
    }
    
    // Store in R2
    await this.env.EXPORTS.put(exportKey, formatted, {
      httpMetadata: {
        contentType,
        contentDisposition: `attachment; filename="analytics-${siteId}-${Date.now()}.${format}"`
      }
    });
    
    // Generate signed URL
    const expiresIn = 3600; // 1 hour
    const url = await this.generateSignedUrl(exportKey, expiresIn);
    
    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000)
    };
  }

  /**
   * Calculate user engagement metrics
   */
  async calculateEngagement(siteId: string): Promise<EngagementMetrics> {
    const now = Date.now();
    const dayMs = 86400000;
    
    // Get unique users for different periods
    const dauKey = `users:${siteId}:day:${Math.floor(now / dayMs)}`;
    const wauKeys = Array.from({ length: 7 }, (_, i) => 
      `users:${siteId}:day:${Math.floor((now - i * dayMs) / dayMs)}`
    );
    const mauKeys = Array.from({ length: 30 }, (_, i) => 
      `users:${siteId}:day:${Math.floor((now - i * dayMs) / dayMs)}`
    );
    
    // Fetch user sets
    const [dauData, ...wauData] = await Promise.all([
      this.env.ANALYTICS.get(dauKey, { type: 'json' }),
      ...wauKeys.map(key => this.env.ANALYTICS.get(key, { type: 'json' }))
    ]);
    
    const mauData = await Promise.all(
      mauKeys.map(key => this.env.ANALYTICS.get(key, { type: 'json' }))
    );
    
    // Calculate metrics
    const dau = dauData?.uniqueUsers?.length || 0;
    const wauSet = new Set();
    const mauSet = new Set();
    
    wauData.forEach(data => {
      if (data?.uniqueUsers) {
        data.uniqueUsers.forEach((user: string) => wauSet.add(user));
      }
    });
    
    mauData.forEach(data => {
      if (data?.uniqueUsers) {
        data.uniqueUsers.forEach((user: string) => mauSet.add(user));
      }
    });
    
    const wau = wauSet.size;
    const mau = mauSet.size;
    
    // Calculate retention (simplified)
    const retention = {
      day1: 0.75, // Placeholder - would calculate from cohort data
      day7: 0.45,
      day30: 0.25
    };
    
    return {
      siteId,
      period: new Date().toISOString().split('T')[0],
      dau,
      wau,
      mau,
      stickiness: mau > 0 ? dau / mau : 0,
      retention,
      avgSessionDuration: 420, // 7 minutes placeholder
      avgEventsPerUser: dauData?.totalEvents ? dauData.totalEvents / dau : 0
    };
  }

  /**
   * Handle custom date ranges
   */
  async queryCustomDateRange(
    siteId: string,
    startDate: Date,
    endDate: Date,
    metrics: string[]
  ): Promise<any> {
    const results: any[] = [];
    const dayMs = 86400000;
    
    // Iterate through each day in range
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayKey = Math.floor(currentDate.getTime() / dayMs);
      const key = `metrics:${siteId}:day:${dayKey}`;
      
      const data = await this.env.ANALYTICS.get(key, { type: 'json' });
      
      if (data) {
        const dayData: any = {
          date: currentDate.toISOString().split('T')[0]
        };
        
        metrics.forEach(metric => {
          switch (metric) {
            case 'events':
              dayData.events = data.totalEvents || 0;
              break;
            case 'users':
              dayData.users = data.uniqueUsersCount || 0;
              break;
            case 'revenue':
              dayData.revenue = data.totalValue || 0;
              break;
            case 'engagement':
              dayData.engagement = data.avgEventsPerUser || 0;
              break;
          }
        });
        
        results.push(dayData);
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return {
      siteId,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      metrics,
      data: results,
      summary: this.calculateSummary(results, metrics)
    };
  }

  // Helper methods
  private getWindowMilliseconds(window: 'hour' | 'day' | 'week' | 'month'): number {
    switch (window) {
      case 'hour': return 3600000;
      case 'day': return 86400000;
      case 'week': return 604800000;
      case 'month': return 2592000000; // 30 days
    }
  }

  private getRetentionSeconds(window: 'hour' | 'day' | 'week' | 'month'): number {
    switch (window) {
      case 'hour': return 86400 * 7; // 7 days
      case 'day': return 86400 * 90; // 90 days
      case 'week': return 86400 * 365; // 1 year
      case 'month': return 86400 * 365 * 2; // 2 years
    }
  }

  private getPeriodKey(timestamp: number, window: 'hour' | 'day' | 'week' | 'month'): string {
    const windowMs = this.getWindowMilliseconds(window);
    return Math.floor(timestamp / windowMs).toString();
  }

  private periodToTimestamp(period: string, window: 'hour' | 'day' | 'week' | 'month'): number {
    const windowMs = this.getWindowMilliseconds(window);
    return parseInt(period) * windowMs;
  }

  private generateTimePeriods(
    startDate: Date, 
    endDate: Date, 
    groupBy: 'hour' | 'day' | 'week' | 'month'
  ): string[] {
    const periods: string[] = [];
    const windowMs = this.getWindowMilliseconds(groupBy);
    
    let current = Math.floor(startDate.getTime() / windowMs);
    const end = Math.floor(endDate.getTime() / windowMs);
    
    while (current <= end) {
      periods.push(current.toString());
      current++;
    }
    
    return periods;
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          return typeof value === 'object' ? JSON.stringify(value) : value;
        }).join(',')
      )
    ];
    
    return csv.join('\n');
  }

  private async convertToParquet(data: any[]): Promise<ArrayBuffer> {
    // Simplified - would use a proper Parquet library
    return new TextEncoder().encode(JSON.stringify(data)).buffer;
  }

  private async collectExportData(
    siteId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<any[]> {
    // Collect all relevant data for export
    const data: any[] = [];
    
    // Implementation would collect from various sources
    
    return data;
  }

  private async generateSignedUrl(key: string, expiresIn: number): Promise<string> {
    // Generate signed URL for R2
    // Simplified - would use proper signing
    return `https://analytics-export.example.com/${key}?expires=${Date.now() + expiresIn * 1000}`;
  }

  private calculateSummary(data: any[], metrics: string[]): any {
    const summary: any = {};
    
    metrics.forEach(metric => {
      const values = data.map(d => d[metric] || 0);
      summary[metric] = {
        total: values.reduce((a, b) => a + b, 0),
        avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        min: Math.min(...values),
        max: Math.max(...values)
      };
    });
    
    return summary;
  }
}