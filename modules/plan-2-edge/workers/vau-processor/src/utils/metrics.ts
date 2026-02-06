// Metrics collection utilities

interface Metric {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class MetricsCollector {
  private metrics: Map<string, Metric[]> = new Map();
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  recordVAU(params: {
    deviceId: string;
    siteId: string;
    processingTime: number;
    earned: number;
  }) {
    this.incrementCounter('vau_processed_total', {
      site_id: params.siteId,
      trust_level: this.getTrustLevel(params.earned)
    });

    this.recordHistogram('vau_processing_time_ms', params.processingTime, {
      site_id: params.siteId
    });

    this.recordGauge('vau_earned_amount', params.earned, {
      site_id: params.siteId
    });
  }

  incrementCounter(name: string, labels: Record<string, string> = {}) {
    const key = this.getMetricKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + 1);
  }

  recordHistogram(name: string, value: number, labels: Record<string, string> = {}) {
    const key = this.getMetricKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  recordGauge(name: string, value: number, labels: Record<string, string> = {}) {
    const key = this.getMetricKey(name, labels);
    const metric: Metric = {
      name,
      value,
      labels,
      timestamp: Date.now()
    };
    
    const metrics = this.metrics.get(key) || [];
    metrics.push(metric);
    this.metrics.set(key, metrics);
  }

  async export(): Promise<string> {
    const lines: string[] = [];
    const timestamp = Date.now();

    // Export counters
    for (const [key, value] of this.counters) {
      const [name, labelsStr] = key.split('|');
      const labels = labelsStr ? this.parseLabels(labelsStr) : {};
      lines.push(this.formatMetric(name, value, labels, timestamp));
    }

    // Export histograms
    for (const [key, values] of this.histograms) {
      const [name, labelsStr] = key.split('|');
      const labels = labelsStr ? this.parseLabels(labelsStr) : {};
      
      if (values.length > 0) {
        const sorted = values.sort((a, b) => a - b);
        const quantiles = [0.5, 0.9, 0.95, 0.99];
        
        for (const q of quantiles) {
          const index = Math.floor(sorted.length * q);
          const value = sorted[index];
          lines.push(this.formatMetric(
            `${name}_quantile`,
            value,
            { ...labels, quantile: q.toString() },
            timestamp
          ));
        }
        
        // Also export sum and count
        const sum = values.reduce((a, b) => a + b, 0);
        lines.push(this.formatMetric(`${name}_sum`, sum, labels, timestamp));
        lines.push(this.formatMetric(`${name}_count`, values.length, labels, timestamp));
      }
    }

    // Export gauges (latest value only)
    for (const [key, metrics] of this.metrics) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        lines.push(this.formatMetric(latest.name, latest.value, latest.labels, timestamp));
      }
    }

    return lines.join('\n');
  }

  private getMetricKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}|${labelStr}` : name;
  }

  private parseLabels(labelsStr: string): Record<string, string> {
    const labels: Record<string, string> = {};
    const pairs = labelsStr.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        labels[key] = value.replace(/"/g, '');
      }
    }
    return labels;
  }

  private formatMetric(name: string, value: number, labels: Record<string, string>, timestamp: number): string {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}} ${value} ${timestamp}` : `${name} ${value} ${timestamp}`;
  }

  private getTrustLevel(earned: number): string {
    if (earned > 100) return 'high';
    if (earned > 50) return 'medium';
    return 'low';
  }
}