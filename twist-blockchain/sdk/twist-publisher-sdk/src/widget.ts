import { PSABClient } from './psab-client';
import { PSABConfig, WidgetEvent, BondPoolInfo } from './types';
import { WIDGET_STYLES, ANALYTICS_EVENTS } from './constants';
import { formatTwist, shortenAddress } from './utils';

export class PSABWidget {
  private client: PSABClient;
  private config: PSABConfig;
  private container?: HTMLDivElement;
  private isVisible: boolean = false;
  private poolInfo?: BondPoolInfo;

  constructor(config: PSABConfig) {
    this.config = config;
    this.client = new PSABClient(config);
  }

  /**
   * Initialize and mount the widget
   */
  async mount(elementId?: string): Promise<void> {
    // Initialize client
    await this.client.initialize();

    // Get pool info
    this.poolInfo = await this.client.getBondPoolInfo();

    // Create widget container
    this.createWidget();

    // Mount to DOM
    if (elementId) {
      const element = document.getElementById(elementId);
      if (element) {
        element.appendChild(this.container!);
      }
    } else {
      document.body.appendChild(this.container!);
    }

    // Track widget loaded
    this.trackEvent(ANALYTICS_EVENTS.WIDGET_LOADED, {
      poolExists: !!this.poolInfo,
    });

    this.isVisible = true;
  }

  /**
   * Create the widget HTML
   */
  private createWidget(): void {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'psab-widget';
    this.container.className = 'psab-widget-container';

    // Apply positioning
    const position = this.config.widgetPosition || 'bottom-right';
    this.applyPositioning(position);

    // Apply theme
    const theme = this.config.theme || 'default';
    const styles = this.config.customStyles || WIDGET_STYLES[theme];
    this.applyStyles(styles);

    // Create content
    if (this.poolInfo) {
      this.createStakingInterface();
    } else {
      this.createSetupInterface();
    }
  }

  /**
   * Create staking interface for active pools
   */
  private createStakingInterface(): void {
    const html = `
      <div class="psab-header">
        <h3>Stake on ${this.extractDomain(this.config.websiteUrl)}</h3>
        <button class="psab-close" onclick="window.psabWidget.hide()">×</button>
      </div>
      
      <div class="psab-stats">
        <div class="psab-stat">
          <span class="psab-stat-label">Total Staked</span>
          <span class="psab-stat-value">${formatTwist(this.poolInfo!.totalStaked)}</span>
        </div>
        <div class="psab-stat">
          <span class="psab-stat-label">APY</span>
          <span class="psab-stat-value">${this.poolInfo!.currentAPY.toFixed(2)}%</span>
        </div>
        <div class="psab-stat">
          <span class="psab-stat-label">Stakers</span>
          <span class="psab-stat-value">${this.poolInfo!.stakerCount}</span>
        </div>
      </div>
      
      <div class="psab-info">
        <p>🔥 90% of visitor burns are permanently destroyed</p>
        <p>💰 10% distributed to stakers like you!</p>
        <p>🔒 Minimum lock period: 30 days</p>
      </div>
      
      <div class="psab-actions">
        <button class="psab-button psab-button-primary" onclick="window.psabWidget.connectWallet()">
          Connect Wallet to Stake
        </button>
      </div>
      
      <div class="psab-footer">
        <a href="https://twist.finance/learn" target="_blank">Learn about PSAB</a>
      </div>
    `;

    this.container!.innerHTML = html;
  }

  /**
   * Create setup interface for websites without pools
   */
  private createSetupInterface(): void {
    const html = `
      <div class="psab-header">
        <h3>Enable Staking for Your Website</h3>
        <button class="psab-close" onclick="window.psabWidget.hide()">×</button>
      </div>
      
      <div class="psab-setup">
        <p>Page-Staked Attention Bonds (PSAB) are not yet enabled for this website.</p>
        
        <div class="psab-benefits">
          <h4>Benefits for Publishers:</h4>
          <ul>
            <li>✅ Earn from visitor engagement</li>
            <li>✅ Build a loyal community</li>
            <li>✅ Increase user retention</li>
            <li>✅ Access analytics dashboard</li>
          </ul>
        </div>
        
        <div class="psab-actions">
          <button class="psab-button psab-button-primary" onclick="window.psabWidget.setupPool()">
            Setup Staking Pool
          </button>
        </div>
      </div>
      
      <div class="psab-footer">
        <a href="https://docs.twist.finance/publishers" target="_blank">Publisher Documentation</a>
      </div>
    `;

    this.container!.innerHTML = html;
  }

  /**
   * Apply positioning styles
   */
  private applyPositioning(position: string): void {
    const baseStyles: any = {
      position: 'fixed',
      zIndex: '9999',
      width: '360px',
      maxHeight: '600px',
      overflow: 'auto',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    };

    switch (position) {
      case 'bottom-right':
        Object.assign(baseStyles, { bottom: '20px', right: '20px' });
        break;
      case 'bottom-left':
        Object.assign(baseStyles, { bottom: '20px', left: '20px' });
        break;
      case 'top-right':
        Object.assign(baseStyles, { top: '20px', right: '20px' });
        break;
      case 'top-left':
        Object.assign(baseStyles, { top: '20px', left: '20px' });
        break;
    }

    Object.assign(this.container!.style, baseStyles);
  }

  /**
   * Apply theme styles
   */
  private applyStyles(styles: any): void {
    // Apply container styles
    Object.assign(this.container!.style, {
      backgroundColor: styles.backgroundColor,
      color: styles.textColor,
      borderRadius: styles.borderRadius,
      fontFamily: styles.fontFamily,
      padding: '20px',
    });

    // Add CSS for internal elements
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      .psab-widget-container * {
        box-sizing: border-box;
      }
      
      .psab-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }
      
      .psab-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      
      .psab-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
      }
      
      .psab-close:hover {
        opacity: 1;
      }
      
      .psab-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-bottom: 20px;
      }
      
      .psab-stat {
        text-align: center;
      }
      
      .psab-stat-label {
        display: block;
        font-size: 12px;
        opacity: 0.8;
        margin-bottom: 4px;
      }
      
      .psab-stat-value {
        display: block;
        font-size: 16px;
        font-weight: 600;
      }
      
      .psab-info {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
      }
      
      .psab-info p {
        margin: 8px 0;
        font-size: 14px;
      }
      
      .psab-button {
        width: 100%;
        padding: 12px 20px;
        border: none;
        border-radius: 6px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .psab-button-primary {
        background: #8B5CF6;
        color: white;
      }
      
      .psab-button-primary:hover {
        background: #7C3AED;
      }
      
      .psab-footer {
        margin-top: 20px;
        text-align: center;
        font-size: 14px;
      }
      
      .psab-footer a {
        color: inherit;
        opacity: 0.8;
      }
    `;
    document.head.appendChild(styleSheet);
  }

  /**
   * Show the widget
   */
  show(): void {
    if (this.container) {
      this.container.style.display = 'block';
      this.isVisible = true;
    }
  }

  /**
   * Hide the widget
   */
  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Toggle widget visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Connect wallet handler
   */
  async connectWallet(): Promise<void> {
    this.trackEvent(ANALYTICS_EVENTS.STAKE_INITIATED, {});
    
    // This would integrate with wallet adapters
    console.log('Connecting wallet...');
    
    // In production, use @solana/wallet-adapter
  }

  /**
   * Setup pool handler
   */
  async setupPool(): Promise<void> {
    // Redirect to pool creation interface
    window.open(`https://twist.finance/publishers/create?url=${encodeURIComponent(this.config.websiteUrl)}`, '_blank');
  }

  /**
   * Track analytics event
   */
  private trackEvent(eventType: string, data: any): void {
    if (!this.config.analytics) return;

    const event: WidgetEvent = {
      type: eventType,
      data,
      timestamp: new Date(),
    };

    // Send to analytics
    if (this.config.debug) {
      console.log('Widget Event:', event);
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return url;
    }
  }
}

// Global widget instance
declare global {
  interface Window {
    psabWidget: PSABWidget;
  }
}