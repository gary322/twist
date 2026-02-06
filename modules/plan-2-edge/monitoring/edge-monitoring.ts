// Production Monitoring Setup
import { logger } from './logger';

export class EdgeMonitoring {
  private meters: Map<string, MetricDefinition> = new Map();
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();

  constructor() {
    this.setupMetrics();
    this.setupAlerts();
  }

  private setupMetrics() {
    // Request metrics
    this.meters.set('requests_total', {
      name: 'edge_requests_total',
      description: 'Total number of requests',
      type: 'counter',
      labels: ['method', 'path', 'status', 'cache']
    });

    // VAU metrics
    this.meters.set('vau_processed', {
      name: 'edge_vau_processed_total',
      description: 'Total VAUs processed',
      type: 'counter',
      labels: ['site_id', 'trust_level']
    });

    // Error metrics
    this.meters.set('errors_total', {
      name: 'edge_errors_total',
      description: 'Total errors',
      type: 'counter',
      labels: ['type', 'code']
    });

    // Performance metrics
    this.meters.set('request_duration', {
      name: 'edge_request_duration_ms',
      description: 'Request duration in milliseconds',
      type: 'histogram',
      labels: ['method', 'path'],
      buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
    });

    // Rate limit metrics
    this.meters.set('rate_limit_hits', {
      name: 'edge_rate_limit_hits_total',
      description: 'Rate limit hits',
      type: 'counter',
      labels: ['endpoint', 'tier']
    });

    // Security metrics
    this.meters.set('security_blocks', {
      name: 'edge_security_blocks_total',
      description: 'Security blocks',
      type: 'counter',
      labels: ['rule', 'severity']
    });

    // Cache metrics
    this.meters.set('cache_hits', {
      name: 'edge_cache_hits_total',
      description: 'Cache hits',
      type: 'counter',
      labels: ['path']
    });

    this.meters.set('cache_misses', {
      name: 'edge_cache_misses_total',
      description: 'Cache misses',
      type: 'counter',
      labels: ['path']
    });

    // Queue metrics
    this.meters.set('queue_messages_processed', {
      name: 'edge_queue_messages_processed_total',
      description: 'Queue messages processed',
      type: 'counter',
      labels: ['queue', 'status']
    });

    this.meters.set('queue_processing_duration', {
      name: 'edge_queue_processing_duration_ms',
      description: 'Queue processing duration',
      type: 'histogram',
      labels: ['queue'],
      buckets: [100, 500, 1000, 5000, 10000]
    });

    // System metrics
    this.meters.set('memory_usage', {
      name: 'edge_memory_usage_bytes',
      description: 'Memory usage in bytes',
      type: 'gauge',
      labels: ['worker']
    });

    this.meters.set('cpu_time', {
      name: 'edge_cpu_time_ms',
      description: 'CPU time in milliseconds',
      type: 'histogram',
      labels: ['worker'],
      buckets: [1, 5, 10, 25, 50, 100]
    });
  }

  private setupAlerts() {
    // Define alert rules
    this.defineAlert({
      name: 'HighErrorRate',
      expression: 'rate(edge_errors_total[5m]) > 10',
      severity: 'critical',
      description: 'Error rate exceeds 10 per second',
      for: '2m'
    });

    this.defineAlert({
      name: 'HighLatency',
      expression: 'histogram_quantile(0.95, edge_request_duration_ms) > 1000',
      severity: 'warning',
      description: '95th percentile latency exceeds 1 second',
      for: '5m'
    });

    this.defineAlert({
      name: 'RateLimitExhaustion',
      expression: 'rate(edge_rate_limit_hits_total[5m]) > 100',
      severity: 'warning',
      description: 'High rate of rate limit hits',
      for: '2m'
    });

    this.defineAlert({
      name: 'SecurityAttack',
      expression: 'rate(edge_security_blocks_total{severity="high"}[5m]) > 5',
      severity: 'critical',
      description: 'Potential security attack detected',
      for: '1m'
    });

    this.defineAlert({
      name: 'CacheHitRate',
      expression: 'rate(edge_cache_hits_total[5m]) / (rate(edge_cache_hits_total[5m]) + rate(edge_cache_misses_total[5m])) < 0.8',
      severity: 'warning',
      description: 'Cache hit rate below 80%',
      for: '10m'
    });

    this.defineAlert({
      name: 'QueueBacklog',
      expression: 'edge_queue_backlog > 1000',
      severity: 'warning',
      description: 'Queue backlog exceeds 1000 messages',
      for: '5m'
    });

    this.defineAlert({
      name: 'HighCPUUsage',
      expression: 'histogram_quantile(0.95, edge_cpu_time_ms) > 50',
      severity: 'warning',
      description: 'CPU time exceeds 50ms (p95)',
      for: '5m'
    });
  }

  // Record metrics
  recordRequest(params: {
    method: string;
    path: string;
    status: number;
    duration: number;
    cache: 'hit' | 'miss' | 'bypass';
  }) {
    const labels = `method="${params.method}",path="${this.normalizePath(params.path)}",status="${params.status}",cache="${params.cache}"`;
    this.incrementCounter('requests_total', labels);
    
    const perfLabels = `method="${params.method}",path="${this.normalizePath(params.path)}"`;
    this.recordHistogram('request_duration', params.duration, perfLabels);
  }

  recordVAU(params: {
    siteId: string;
    trustLevel: 'low' | 'medium' | 'high';
    earned: number;
  }) {
    const labels = `site_id="${params.siteId}",trust_level="${params.trustLevel}"`;
    this.incrementCounter('vau_processed', labels);
  }

  recordError(type: string, code: string) {
    const labels = `type="${type}",code="${code}"`;
    this.incrementCounter('errors_total', labels);
  }

  recordRateLimit(endpoint: string, tier: string = 'default') {
    const labels = `endpoint="${endpoint}",tier="${tier}"`;
    this.incrementCounter('rate_limit_hits', labels);
  }

  recordSecurityBlock(rule: string, severity: string) {
    const labels = `rule="${rule}",severity="${severity}"`;
    this.incrementCounter('security_blocks', labels);
  }

  recordCache(path: string, hit: boolean) {
    const normalizedPath = this.normalizePath(path);
    const labels = `path="${normalizedPath}"`;
    
    if (hit) {
      this.incrementCounter('cache_hits', labels);
    } else {
      this.incrementCounter('cache_misses', labels);
    }
  }

  recordQueueProcessing(queue: string, status: 'success' | 'failure', duration: number) {
    const labels = `queue="${queue}",status="${status}"`;
    this.incrementCounter('queue_messages_processed', labels);
    
    const durationLabels = `queue="${queue}"`;
    this.recordHistogram('queue_processing_duration', duration, durationLabels);
  }

  recordSystemMetrics(worker: string, memoryUsage: number, cpuTime: number) {
    this.setGauge('memory_usage', memoryUsage, `worker="${worker}"`);
    this.recordHistogram('cpu_time', cpuTime, `worker="${worker}"`);
  }

  // Export metrics in Prometheus format
  async export(): Promise<string> {
    const lines: string[] = [];

    // Export counters
    for (const [key, definition] of this.meters) {
      if (definition.type === 'counter') {
        lines.push(`# HELP ${definition.name} ${definition.description}`);
        lines.push(`# TYPE ${definition.name} counter`);
        
        const counterKey = `counter:${key}`;
        for (const [labels, value] of this.getMetricsByPrefix(counterKey)) {
          lines.push(`${definition.name}{${labels}} ${value}`);
        }
      }
    }

    // Export histograms
    for (const [key, definition] of this.meters) {
      if (definition.type === 'histogram') {
        lines.push(`# HELP ${definition.name} ${definition.description}`);
        lines.push(`# TYPE ${definition.name} histogram`);
        
        const histogramKey = `histogram:${key}`;
        const buckets = definition.buckets || [10, 25, 50, 100, 250, 500, 1000];
        
        for (const [labels, values] of this.getHistogramsByPrefix(histogramKey)) {
          const sorted = (values as number[]).sort((a, b) => a - b);
          let cumulative = 0;
          
          for (const bucket of buckets) {
            cumulative += sorted.filter(v => v <= bucket).length;
            lines.push(`${definition.name}_bucket{${labels},le="${bucket}"} ${cumulative}`);
          }
          
          lines.push(`${definition.name}_bucket{${labels},le="+Inf"} ${sorted.length}`);
          lines.push(`${definition.name}_sum{${labels}} ${sorted.reduce((a, b) => a + b, 0)}`);
          lines.push(`${definition.name}_count{${labels}} ${sorted.length}`);
        }
      }
    }

    // Export gauges
    for (const [key, definition] of this.meters) {
      if (definition.type === 'gauge') {
        lines.push(`# HELP ${definition.name} ${definition.description}`);
        lines.push(`# TYPE ${definition.name} gauge`);
        
        const gaugeKey = `gauge:${key}`;
        for (const [labels, value] of this.getMetricsByPrefix(gaugeKey)) {
          lines.push(`${definition.name}{${labels}} ${value}`);
        }
      }
    }

    return lines.join('\n') + '\n';
  }

  // Helper methods
  private incrementCounter(metric: string, labels: string) {
    const key = `counter:${metric}:${labels}`;
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + 1);
  }

  private recordHistogram(metric: string, value: number, labels: string) {
    const key = `histogram:${metric}:${labels}`;
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  private setGauge(metric: string, value: number, labels: string) {
    const key = `gauge:${metric}:${labels}`;
    this.gauges.set(key, value);
  }

  private getMetricsByPrefix(prefix: string): Array<[string, number]> {
    const results: Array<[string, number]> = [];
    
    if (prefix.startsWith('counter:')) {
      for (const [key, value] of this.counters) {
        if (key.startsWith(prefix)) {
          const labels = key.substring(prefix.length + 1);
          results.push([labels, value]);
        }
      }
    } else if (prefix.startsWith('gauge:')) {
      for (const [key, value] of this.gauges) {
        if (key.startsWith(prefix)) {
          const labels = key.substring(prefix.length + 1);
          results.push([labels, value]);
        }
      }
    }
    
    return results;
  }

  private getHistogramsByPrefix(prefix: string): Array<[string, number[]]> {
    const results: Array<[string, number[]]> = [];
    
    for (const [key, values] of this.histograms) {
      if (key.startsWith(prefix)) {
        const labels = key.substring(prefix.length + 1);
        results.push([labels, values]);
      }
    }
    
    return results;
  }

  private normalizePath(path: string): string {
    // Normalize paths for metrics
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '/:id')
      .replace(/\/\d+/g, '/:id');
  }

  private defineAlert(alert: AlertDefinition) {
    // In production, this would be exported to Prometheus AlertManager
    logger.info(`Alert defined: ${alert.name}`);
  }

  // Get current alert status
  async getAlertStatus(): Promise<AlertStatus[]> {
    // In production, this would query Prometheus
    return [
      {
        name: 'HighErrorRate',
        state: 'inactive',
        severity: 'critical',
        lastActive: null
      },
      {
        name: 'HighLatency',
        state: 'inactive',
        severity: 'warning',
        lastActive: null
      }
    ];
  }
}

interface MetricDefinition {
  name: string;
  description: string;
  type: 'counter' | 'histogram' | 'gauge';
  labels: string[];
  buckets?: number[];
}

interface AlertDefinition {
  name: string;
  expression: string;
  severity: 'warning' | 'critical';
  description: string;
  for: string;
}

interface AlertStatus {
  name: string;
  state: 'inactive' | 'pending' | 'firing';
  severity: string;
  lastActive: Date | null;
}

// Singleton instance
export const monitoring = new EdgeMonitoring();