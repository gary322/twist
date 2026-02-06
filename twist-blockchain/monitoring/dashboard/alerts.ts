import { EventEmitter } from 'events';
import * as nodemailer from 'nodemailer';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  metadata?: Record<string, any>;
}

export interface AlertConfig {
  emailEnabled: boolean;
  slackEnabled: boolean;
  pagerDutyEnabled: boolean;
  webhookEnabled: boolean;
  emailRecipients?: string[];
  slackWebhookUrl?: string;
  pagerDutyIntegrationKey?: string;
  webhookUrl?: string;
  alertRetentionDays: number;
}

export class AlertManager extends EventEmitter {
  private alerts: Map<string, Alert> = new Map();
  private config: AlertConfig;
  private emailTransporter?: nodemailer.Transporter;
  
  constructor(config?: Partial<AlertConfig>) {
    super();
    
    this.config = {
      emailEnabled: false,
      slackEnabled: false,
      pagerDutyEnabled: false,
      webhookEnabled: false,
      alertRetentionDays: 30,
      ...config
    };
    
    this.setupNotificationChannels();
    this.startCleanupJob();
  }
  
  private setupNotificationChannels() {
    // Setup email if enabled
    if (this.config.emailEnabled && process.env.SMTP_HOST) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }
  
  private startCleanupJob() {
    // Clean up old alerts every hour
    setInterval(() => {
      const cutoffTime = Date.now() - (this.config.alertRetentionDays * 24 * 60 * 60 * 1000);
      
      for (const [id, alert] of this.alerts.entries()) {
        if (alert.timestamp < cutoffTime) {
          this.alerts.delete(id);
        }
      }
    }, 60 * 60 * 1000);
  }
  
  public async triggerAlert(params: {
    severity: Alert['severity'];
    type: string;
    message: string;
    timestamp: number;
    metadata?: Record<string, any>;
  }): Promise<Alert> {
    const alert: Alert = {
      id: uuidv4(),
      severity: params.severity,
      type: params.type,
      message: params.message,
      timestamp: params.timestamp,
      acknowledged: false,
      metadata: params.metadata,
    };
    
    this.alerts.set(alert.id, alert);
    this.emit('alert', alert);
    
    // Send notifications based on severity
    await this.sendNotifications(alert);
    
    // Track metrics
    const alertsTriggeredMetric = global.promClient?.Counter?.get('twist_alerts_triggered_total');
    if (alertsTriggeredMetric) {
      alertsTriggeredMetric.inc({
        severity: alert.severity,
        type: alert.type,
      });
    }
    
    return alert;
  }
  
  private async sendNotifications(alert: Alert) {
    const promises: Promise<void>[] = [];
    
    // Send based on severity
    if (alert.severity === 'critical' || alert.severity === 'high') {
      if (this.config.pagerDutyEnabled) {
        promises.push(this.sendPagerDutyAlert(alert));
      }
    }
    
    if (alert.severity !== 'low') {
      if (this.config.slackEnabled) {
        promises.push(this.sendSlackAlert(alert));
      }
      
      if (this.config.emailEnabled && alert.severity === 'critical') {
        promises.push(this.sendEmailAlert(alert));
      }
    }
    
    if (this.config.webhookEnabled) {
      promises.push(this.sendWebhookAlert(alert));
    }
    
    await Promise.allSettled(promises);
  }
  
  private async sendSlackAlert(alert: Alert): Promise<void> {
    if (!this.config.slackWebhookUrl) return;
    
    const color = {
      low: '#36a64f',
      medium: '#ff9900',
      high: '#ff6600',
      critical: '#ff0000',
    }[alert.severity];
    
    try {
      await axios.post(this.config.slackWebhookUrl, {
        attachments: [{
          color,
          title: `${alert.severity.toUpperCase()} Alert: ${alert.type}`,
          text: alert.message,
          fields: [
            {
              title: 'Alert ID',
              value: alert.id,
              short: true,
            },
            {
              title: 'Timestamp',
              value: new Date(alert.timestamp).toISOString(),
              short: true,
            },
          ],
          footer: 'TWIST Monitoring',
          ts: Math.floor(alert.timestamp / 1000),
        }],
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }
  
  private async sendEmailAlert(alert: Alert): Promise<void> {
    if (!this.emailTransporter || !this.config.emailRecipients) return;
    
    const subject = `[${alert.severity.toUpperCase()}] TWIST Alert: ${alert.type}`;
    const html = `
      <h2>TWIST Monitoring Alert</h2>
      <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
      <p><strong>Type:</strong> ${alert.type}</p>
      <p><strong>Message:</strong> ${alert.message}</p>
      <p><strong>Time:</strong> ${new Date(alert.timestamp).toISOString()}</p>
      <p><strong>Alert ID:</strong> ${alert.id}</p>
      ${alert.metadata ? `<p><strong>Additional Data:</strong> <pre>${JSON.stringify(alert.metadata, null, 2)}</pre></p>` : ''}
    `;
    
    try {
      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'alerts@twist.io',
        to: this.config.emailRecipients.join(','),
        subject,
        html,
      });
    } catch (error) {
      console.error('Failed to send email alert:', error);
    }
  }
  
  private async sendPagerDutyAlert(alert: Alert): Promise<void> {
    if (!this.config.pagerDutyIntegrationKey) return;
    
    try {
      await axios.post('https://events.pagerduty.com/v2/enqueue', {
        routing_key: this.config.pagerDutyIntegrationKey,
        event_action: 'trigger',
        dedup_key: alert.id,
        payload: {
          summary: alert.message,
          severity: alert.severity === 'critical' ? 'critical' : 'error',
          source: 'twist-monitoring',
          component: alert.type,
          custom_details: alert.metadata,
        },
      });
    } catch (error) {
      console.error('Failed to send PagerDuty alert:', error);
    }
  }
  
  private async sendWebhookAlert(alert: Alert): Promise<void> {
    if (!this.config.webhookUrl) return;
    
    try {
      await axios.post(this.config.webhookUrl, alert, {
        headers: {
          'Content-Type': 'application/json',
          'X-Alert-Source': 'twist-monitoring',
        },
      });
    } catch (error) {
      console.error('Failed to send webhook alert:', error);
    }
  }
  
  public async acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }
    
    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy || 'system';
    alert.acknowledgedAt = Date.now();
    
    this.emit('alert:acknowledged', alert);
    
    // If PagerDuty alert, resolve it
    if (this.config.pagerDutyEnabled && this.config.pagerDutyIntegrationKey) {
      try {
        await axios.post('https://events.pagerduty.com/v2/enqueue', {
          routing_key: this.config.pagerDutyIntegrationKey,
          event_action: 'resolve',
          dedup_key: alert.id,
        });
      } catch (error) {
        console.error('Failed to resolve PagerDuty alert:', error);
      }
    }
  }
  
  public async getActiveAlerts(): Promise<Alert[]> {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.acknowledged)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  
  public async getAlertHistory(
    filters?: {
      severity?: Alert['severity'];
      type?: string;
      startTime?: number;
      endTime?: number;
      acknowledged?: boolean;
    }
  ): Promise<Alert[]> {
    let alerts = Array.from(this.alerts.values());
    
    if (filters) {
      if (filters.severity) {
        alerts = alerts.filter(a => a.severity === filters.severity);
      }
      if (filters.type) {
        alerts = alerts.filter(a => a.type === filters.type);
      }
      if (filters.startTime) {
        alerts = alerts.filter(a => a.timestamp >= filters.startTime);
      }
      if (filters.endTime) {
        alerts = alerts.filter(a => a.timestamp <= filters.endTime);
      }
      if (filters.acknowledged !== undefined) {
        alerts = alerts.filter(a => a.acknowledged === filters.acknowledged);
      }
    }
    
    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }
  
  public getAlertStats(): {
    total: number;
    active: number;
    acknowledged: number;
    bySeverity: Record<Alert['severity'], number>;
    byType: Record<string, number>;
  } {
    const stats = {
      total: this.alerts.size,
      active: 0,
      acknowledged: 0,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      byType: {} as Record<string, number>,
    };
    
    for (const alert of this.alerts.values()) {
      if (alert.acknowledged) {
        stats.acknowledged++;
      } else {
        stats.active++;
      }
      
      stats.bySeverity[alert.severity]++;
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
    }
    
    return stats;
  }
  
  public clearAlert(alertId: string): void {
    this.alerts.delete(alertId);
  }
  
  public clearAllAlerts(): void {
    this.alerts.clear();
  }
}