import { InfluencerStaking } from './InfluencerStaking.js';

export class ExtensionApp {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.currentTab = 'search';
    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="container">
        <div class="header">
          <h1>TWIST Staking</h1>
          ${this.options.walletConnected ? `
            <div class="wallet-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <path d="M2 10h20"/>
              </svg>
              <span>Connected</span>
            </div>
          ` : ''}
        </div>
        <div class="tabs">
          <button class="tab ${this.currentTab === 'search' ? 'active' : ''}" data-tab="search">
            Search
          </button>
          <button class="tab ${this.currentTab === 'portfolio' ? 'active' : ''}" data-tab="portfolio">
            Portfolio
          </button>
        </div>
        <div class="content" id="content">
          <!-- Content will be rendered here -->
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.renderContent();
  }

  attachEventListeners() {
    // Tab switching
    this.container.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.currentTab = e.target.dataset.tab;
        this.updateTabs();
        this.renderContent();
      });
    });
  }

  updateTabs() {
    this.container.querySelectorAll('.tab').forEach(tab => {
      if (tab.dataset.tab === this.currentTab) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  }

  renderContent() {
    const contentContainer = this.container.querySelector('#content');
    
    if (!this.options.walletConnected) {
      this.renderWalletConnect(contentContainer);
      return;
    }

    switch (this.currentTab) {
      case 'search':
        this.renderSearch(contentContainer);
        break;
      case 'portfolio':
        this.renderPortfolio(contentContainer);
        break;
    }
  }

  renderWalletConnect(container) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          <path d="M9 9h6v6H9z"/>
        </svg>
        <h2 class="empty-title">Connect Your Wallet</h2>
        <p class="empty-text">Connect your wallet to start staking on influencers</p>
        <a href="https://twist.to/connect" target="_blank" class="action-button">
          Connect Wallet
        </a>
      </div>
    `;
  }

  renderSearch(container) {
    const stakingComponent = new InfluencerStaking(container, this.options);
    stakingComponent.render();
  }

  async renderPortfolio(container) {
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const stakes = await this.options.api.getUserStakes();
      
      if (stakes.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
            </svg>
            <h2 class="empty-title">No Active Stakes</h2>
            <p class="empty-text">You haven't staked on any influencers yet</p>
            <button class="action-button" onclick="document.querySelector('[data-tab="search"]').click()">
              Find Influencers
            </button>
          </div>
        `;
        return;
      }

      const totalStaked = stakes.reduce((sum, s) => sum + BigInt(s.stake.amount), 0n);
      const totalPending = stakes.reduce((sum, s) => sum + BigInt(s.stake.pendingRewards), 0n);

      container.innerHTML = `
        <div>
          <div class="portfolio-stats">
            <div class="stats-grid">
              <div class="stat">
                <div class="stat-label">Total Staked</div>
                <div class="stat-value">${this.formatToken(totalStaked)}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Pending Rewards</div>
                <div class="stat-value rewards">${this.formatToken(totalPending)}</div>
              </div>
            </div>
          </div>

          <div class="stakes-list">
            ${stakes.map(stake => this.renderStakeItem(stake)).join('')}
          </div>

          <div class="quick-actions">
            <div class="quick-actions-title">Quick Actions</div>
            <a href="https://twist.to/portfolio" target="_blank" class="quick-action">
              <svg class="quick-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              View Full Portfolio
            </a>
            <a href="https://twist.to/rewards" target="_blank" class="quick-action">
              <svg class="quick-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              Claim All Rewards
            </a>
          </div>
        </div>
      `;

      // Attach claim handlers
      container.querySelectorAll('.claim-button').forEach((btn, index) => {
        btn.addEventListener('click', () => this.handleClaim(stakes[index]));
      });
    } catch (error) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-text">Failed to load portfolio</p>
          <button class="action-button" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }

  renderStakeItem(stake) {
    return `
      <div class="stake-item">
        <div class="stake-header">
          <img src="${stake.influencer.avatar || '/default-avatar.png'}" alt="" class="avatar">
          <div class="stake-info">
            <div class="influencer-name">${stake.influencer.displayName}</div>
            <div class="stake-amount">${this.formatToken(stake.stake.amount)} staked</div>
          </div>
          <div class="apy">${stake.stake.apy.toFixed(1)}% APY</div>
        </div>
        <div class="rewards-section">
          <div class="rewards-info">
            <div class="rewards-label">Pending Rewards</div>
            <div class="rewards-value">${this.formatToken(stake.stake.pendingRewards)}</div>
          </div>
          <button class="claim-button" ${BigInt(stake.stake.pendingRewards) === 0n ? 'disabled' : ''}>
            Claim
          </button>
        </div>
      </div>
    `;
  }

  async handleClaim(stake) {
    const tab = await chrome.tabs.create({
      url: `https://twist.to/claim/${stake.influencer.id}`,
    });
  }

  formatToken(amount) {
    const value = BigInt(amount);
    const decimals = 9;
    const divisor = BigInt(10 ** decimals);
    
    const tokens = value / divisor;
    const remainder = value % divisor;
    
    const tokenStr = tokens.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    if (remainder > 0n) {
      const decimalStr = remainder.toString().padStart(decimals, '0');
      const trimmed = decimalStr.replace(/0+$/, '').slice(0, 2);
      if (trimmed) {
        return `${tokenStr}.${trimmed} TWIST`;
      }
    }
    
    return `${tokenStr} TWIST`;
  }

  render() {
    this.init();
  }
}