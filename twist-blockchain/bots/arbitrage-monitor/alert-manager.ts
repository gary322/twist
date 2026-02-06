import { ArbitrageOpportunity } from './arbitrage-calculator';

export interface AlertConfig {
  webhookUrl?: string;
  discordWebhook?: string;
  slackWebhook?: string;
  minAlertProfit?: number;
  cooldownMs?: number;
}

export class AlertManager {
  private lastAlertTime: Map<string, number> = new Map();
  private alertHistory: Array<{
    timestamp: number;
    opportunity: ArbitrageOpportunity;
    sent: boolean;
  }> = [];
  
  constructor(
    private webhookUrl?: string,
    private config: AlertConfig = {}
  ) {}
  
  public async sendArbitrageAlert(opportunity: ArbitrageOpportunity): Promise<boolean> {
    // Check cooldown
    const lastAlert = this.lastAlertTime.get(opportunity.buyDex + opportunity.sellDex);
    const cooldown = this.config.cooldownMs || 60000; // 1 minute default
    
    if (lastAlert && Date.now() - lastAlert < cooldown) {
      return false; // Skip due to cooldown
    }
    
    // Record alert attempt
    this.alertHistory.push({
      timestamp: Date.now(),
      opportunity,
      sent: false,
    });
    
    try {
      // Send to multiple channels
      const promises: Promise<void>[] = [];
      
      if (this.config.discordWebhook) {
        promises.push(this.sendDiscordAlert(opportunity));
      }
      
      if (this.config.slackWebhook) {
        promises.push(this.sendSlackAlert(opportunity));
      }
      
      if (this.webhookUrl) {
        promises.push(this.sendGenericWebhook(opportunity));
      }
      
      await Promise.all(promises);
      
      // Update last alert time
      this.lastAlertTime.set(opportunity.buyDex + opportunity.sellDex, Date.now());
      
      // Mark as sent
      this.alertHistory[this.alertHistory.length - 1].sent = true;
      
      return true;
    } catch (error) {
      console.error('Failed to send alert:', error);
      return false;
    }
  }
  
  private async sendDiscordAlert(opp: ArbitrageOpportunity): Promise<void> {
    if (!this.config.discordWebhook) return;
    
    const color = opp.confidence === 'high' ? 0x00ff88 : 
                  opp.confidence === 'medium' ? 0xffaa00 : 0xff4444;
    
    const embed = {
      embeds: [{
        title: '💰 Arbitrage Opportunity Detected',
        color,
        fields: [
          {
            name: 'Route',
            value: `${opp.buyDex} → ${opp.sellDex}`,
            inline: true,
          },
          {
            name: 'Profit',
            value: `${opp.profitPercent.toFixed(2)}% ($${opp.netProfit.toFixed(2)})`,
            inline: true,
          },
          {
            name: 'Confidence',
            value: opp.confidence.toUpperCase(),
            inline: true,
          },
          {
            name: 'Buy Price',
            value: `$${opp.buyPrice.toFixed(4)}`,
            inline: true,
          },
          {
            name: 'Sell Price',
            value: `$${opp.sellPrice.toFixed(4)}`,
            inline: true,
          },
          {
            name: 'Max Volume',
            value: `$${opp.volumeAvailable.toFixed(0)}`,
            inline: true,
          },
          {
            name: 'Time Window',
            value: `${(opp.ttl / 1000).toFixed(0)}s`,
            inline: true,
          },
          {
            name: 'Est. Gas',
            value: `$${opp.estimatedGas.toFixed(2)}`,
            inline: true,
          },
        ],
        footer: {
          text: 'TWIST Arbitrage Monitor',
        },
        timestamp: new Date().toISOString(),
      }],
    };
    
    await fetch(this.config.discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
    });
  }
  
  private async sendSlackAlert(opp: ArbitrageOpportunity): Promise<void> {
    if (!this.config.slackWebhook) return;
    
    const message = {
      text: 'Arbitrage Opportunity Detected',
      attachments: [{
        color: opp.confidence === 'high' ? 'good' : 
                opp.confidence === 'medium' ? 'warning' : 'danger',
        fields: [
          {
            title: 'Route',
            value: `${opp.buyDex} → ${opp.sellDex}`,
            short: true,
          },
          {
            title: 'Profit',
            value: `${opp.profitPercent.toFixed(2)}% ($${opp.netProfit.toFixed(2)})`,
            short: true,
          },
          {
            title: 'Volume Available',
            value: `$${opp.volumeAvailable.toFixed(0)}`,
            short: true,
          },
          {
            title: 'Confidence',
            value: opp.confidence.toUpperCase(),
            short: true,
          },
        ],
        footer: 'TWIST Arbitrage Monitor',
        ts: Math.floor(Date.now() / 1000),
      }],
    };
    
    await fetch(this.config.slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  }
  
  private async sendGenericWebhook(opp: ArbitrageOpportunity): Promise<void> {
    if (!this.webhookUrl) return;
    
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'arbitrage_opportunity',
        timestamp: Date.now(),
        data: opp,
      }),
    });
  }
  
  public async sendSummaryReport(
    opportunities: ArbitrageOpportunity[],
    stats: any
  ): Promise<void> {
    if (!this.config.discordWebhook) return;
    
    const topOpps = opportunities
      .sort((a, b) => b.netProfit - a.netProfit)
      .slice(0, 5);
    
    const embed = {
      embeds: [{
        title: '📊 Arbitrage Monitor Daily Summary',
        color: 0x0099ff,
        fields: [
          {
            name: 'Active Opportunities',
            value: stats.activeOpportunities.toString(),
            inline: true,
          },
          {
            name: 'Total Potential Profit',
            value: `$${stats.totalPotentialProfit.toFixed(2)}`,
            inline: true,
          },
          {
            name: 'Avg Profit %',
            value: `${stats.avgProfitPercent.toFixed(2)}%`,
            inline: true,
          },
          {
            name: 'Top Opportunities',
            value: topOpps.map(o => 
              `${o.buyDex}→${o.sellDex}: $${o.netProfit.toFixed(2)}`
            ).join('\n') || 'None',
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      }],
    };
    
    try {
      await fetch(this.config.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embed),
      });
    } catch (error) {
      console.error('Failed to send summary report:', error);
    }
  }
  
  public getAlertHistory(
    hoursBack: number = 24
  ): Array<{
    timestamp: number;
    opportunity: ArbitrageOpportunity;
    sent: boolean;
  }> {
    const cutoff = Date.now() - (hoursBack * 60 * 60 * 1000);
    return this.alertHistory.filter(a => a.timestamp > cutoff);
  }
  
  public getAlertStats(): {
    totalAlerts: number;
    successfulAlerts: number;
    alertsByDexPair: Map<string, number>;
    avgProfitAlerted: number;
  } {
    const successful = this.alertHistory.filter(a => a.sent);
    const alertsByDexPair = new Map<string, number>();
    
    let totalProfit = 0;
    successful.forEach(alert => {
      const pair = `${alert.opportunity.buyDex}-${alert.opportunity.sellDex}`;
      alertsByDexPair.set(pair, (alertsByDexPair.get(pair) || 0) + 1);
      totalProfit += alert.opportunity.netProfit;
    });
    
    return {
      totalAlerts: this.alertHistory.length,
      successfulAlerts: successful.length,
      alertsByDexPair,
      avgProfitAlerted: successful.length > 0 ? totalProfit / successful.length : 0,
    };
  }
}