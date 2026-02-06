// Audit Logger for Security Events
import { Env } from '@workers/vau-processor/src/types';
import { SecurityEvent } from './types';

export class AuditLogger {
  constructor(private env: Env) {}

  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0];
    const hour = timestamp.split(':')[0].split('T')[1];

    // Add timestamp if not present
    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp || Date.now(),
      isoTimestamp: timestamp,
      environment: this.env.ENVIRONMENT
    };

    // Batch events by hour
    const key = `security-logs/${date}/${hour}/${crypto.randomUUID()}.json`;

    try {
      await this.env.AUDIT_LOGS.put(key, JSON.stringify(eventWithTimestamp));

      // Alert on critical events
      if (event.severity === 'critical') {
        await this.sendAlert(eventWithTimestamp);
      }

      // Update metrics
      await this.updateSecurityMetrics(event);
    } catch (error) {
      console.error('Failed to log security event:', error);
      // In production, we might want to have a fallback logging mechanism
    }
  }

  private async sendAlert(event: SecurityEvent): Promise<void> {
    // Check if PagerDuty is configured
    if (!this.env.PAGERDUTY_TOKEN || !this.env.PAGERDUTY_ROUTING_KEY) {
      console.warn('PagerDuty not configured, skipping alert');
      return;
    }

    try {
      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token token=${this.env.PAGERDUTY_TOKEN}`
        },
        body: JSON.stringify({
          routing_key: this.env.PAGERDUTY_ROUTING_KEY,
          event_action: 'trigger',
          dedup_key: `security-${event.type}-${event.ruleId}`,
          payload: {
            summary: `Critical security event: ${event.type}`,
            severity: 'error',
            source: 'twist-edge-security',
            component: 'waf',
            group: 'security',
            class: event.type,
            custom_details: {
              rule_id: event.ruleId,
              request_url: event.request.url,
              user_agent: event.request.headers?.['user-agent'],
              ip_address: event.request.headers?.['cf-connecting-ip'],
              country: event.request.cf?.country,
              timestamp: new Date(event.timestamp || Date.now()).toISOString()
            }
          },
          client: 'TWIST Edge Security',
          client_url: `https://dashboard.twist.io/security/events/${event.ruleId}`
        })
      });

      if (!response.ok) {
        throw new Error(`PagerDuty API error: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to send PagerDuty alert:', error);
    }
  }

  private async updateSecurityMetrics(event: SecurityEvent): Promise<void> {
    const metricsKey = `metrics:security:${new Date().toISOString().slice(0, 10)}`;
    
    try {
      // Get current metrics
      const currentMetrics = await this.env.KV.get(metricsKey);
      const metrics = currentMetrics ? JSON.parse(currentMetrics) : {
        total_events: 0,
        by_type: {},
        by_severity: {},
        by_rule: {},
        by_country: {}
      };

      // Update metrics
      metrics.total_events++;
      
      // By type
      metrics.by_type[event.type] = (metrics.by_type[event.type] || 0) + 1;
      
      // By severity
      if (event.severity) {
        metrics.by_severity[event.severity] = (metrics.by_severity[event.severity] || 0) + 1;
      }
      
      // By rule
      if (event.ruleId) {
        metrics.by_rule[event.ruleId] = (metrics.by_rule[event.ruleId] || 0) + 1;
      }
      
      // By country
      if (event.country) {
        metrics.by_country[event.country] = (metrics.by_country[event.country] || 0) + 1;
      }

      // Store updated metrics with TTL
      await this.env.KV.put(metricsKey, JSON.stringify(metrics), {
        expirationTtl: 30 * 24 * 3600 // 30 days
      });
    } catch (error) {
      console.error('Failed to update security metrics:', error);
    }
  }

  async getSecurityMetrics(date?: string): Promise<any> {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const metricsKey = `metrics:security:${targetDate}`;
    
    try {
      const metrics = await this.env.KV.get(metricsKey);
      return metrics ? JSON.parse(metrics) : null;
    } catch (error) {
      console.error('Failed to get security metrics:', error);
      return null;
    }
  }

  async querySecurityLogs(params: {
    startTime: number;
    endTime: number;
    ruleId?: string;
    severity?: string;
    limit?: number;
  }): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];
    
    try {
      // Calculate date range
      const startDate = new Date(params.startTime);
      const endDate = new Date(params.endTime);
      
      // Iterate through days
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // List objects for this date
        const prefix = `security-logs/${dateStr}/`;
        const objects = await this.env.AUDIT_LOGS.list({ prefix, limit: 1000 });
        
        // Fetch and filter events
        for (const object of objects.objects) {
          const eventData = await this.env.AUDIT_LOGS.get(object.key);
          if (eventData) {
            const event = JSON.parse(await eventData.text());
            
            // Apply filters
            if (params.ruleId && event.ruleId !== params.ruleId) continue;
            if (params.severity && event.severity !== params.severity) continue;
            if (event.timestamp < params.startTime || event.timestamp > params.endTime) continue;
            
            events.push(event);
            
            if (params.limit && events.length >= params.limit) {
              return events;
            }
          }
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Sort by timestamp descending
      events.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      // Apply limit if not already reached
      if (params.limit && events.length > params.limit) {
        return events.slice(0, params.limit);
      }
      
      return events;
    } catch (error) {
      console.error('Failed to query security logs:', error);
      return [];
    }
  }
}