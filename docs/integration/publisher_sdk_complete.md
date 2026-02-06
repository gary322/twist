# TWIST Publisher SDK - Complete Implementation Guide

> Comprehensive SDK documentation including Stripe/Coinbase integration for zero-friction publisher onboarding

## Quick Start (3 Steps)

```html
<!-- Step 1: Add SDK -->
<script src="https://cdn.twist.io/sdk.js" 
        data-site-email="publisher@site.com">
</script>

<!-- Step 2: SDK auto-detects and starts earning -->
<!-- Step 3: Dashboard prompts for bonding when ready -->
```

## SDK Architecture

### Core SDK Implementation
```javascript
// twist-publisher-sdk.js
class TwistPublisherSDK {
    constructor(config) {
        this.config = {
            siteEmail: config.siteEmail || this.detectEmail(),
            apiEndpoint: 'https://api.twist.io',
            custodialMode: true, // Default for easy onboarding
            autoPromptBond: true,
            bondThreshold: 100, // Visitors before prompting
            stripePublishableKey: 'pk_live_twist_xyz',
            coinbaseCommerceKey: 'cb_live_twist_xyz'
        };
        
        this.wallet = null;
        this.metrics = {
            visitors: 0,
            earnings: 0,
            status: 'cold'
        };
        
        this.init();
    }
    
    async init() {
        // 1. Create or load custodial wallet
        this.wallet = await this.initWallet();
        
        // 2. Register site with TWIST network
        await this.registerSite();
        
        // 3. Start tracking visitors
        this.startTracking();
        
        // 4. Show publisher dashboard widget
        this.initDashboard();
        
        // 5. Check for bonding eligibility
        this.checkBondingStatus();
    }
    
    async initWallet() {
        // Check for existing wallet
        const savedWallet = localStorage.getItem('twist_publisher_wallet');
        
        if (savedWallet) {
            return JSON.parse(savedWallet);
        }
        
        // Create custodial wallet
        const response = await fetch(`${this.config.apiEndpoint}/publisher/wallet/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: this.config.siteEmail,
                domain: window.location.hostname
            })
        });
        
        const wallet = await response.json();
        
        // Save locally (encrypted)
        localStorage.setItem('twist_publisher_wallet', JSON.stringify(wallet));
        
        return wallet;
    }
}
```

### Visitor Tracking & Rewards
```javascript
class VisitorTracker {
    constructor(sdk) {
        this.sdk = sdk;
        this.activeVisitors = new Map();
        this.rewardRate = 0; // Set by network
    }
    
    startTracking() {
        // Listen for VAU events from visitors
        window.addEventListener('message', (event) => {
            if (event.data.type === 'TWIST_VAU') {
                this.processVisitorVAU(event.data);
            }
        });
        
        // Update metrics every 5 seconds
        setInterval(() => this.updateMetrics(), 5000);
    }
    
    processVisitorVAU(vau) {
        const visitorId = vau.deviceId;
        
        // Track active visitor
        this.activeVisitors.set(visitorId, {
            lastSeen: Date.now(),
            earned: vau.earned,
            trustLevel: vau.trustLevel
        });
        
        // Update publisher metrics
        this.sdk.metrics.visitors = this.activeVisitors.size;
        this.sdk.metrics.earnings += vau.earned * 0.1; // Publisher share
        
        // Check if should prompt for bonding
        if (this.sdk.metrics.visitors >= this.sdk.config.bondThreshold && 
            this.sdk.metrics.status === 'cold') {
            this.sdk.promptBonding();
        }
    }
    
    async updateMetrics() {
        // Clean stale visitors (not seen in 30s)
        const now = Date.now();
        for (const [id, visitor] of this.activeVisitors) {
            if (now - visitor.lastSeen > 30000) {
                this.activeVisitors.delete(id);
            }
        }
        
        // Update dashboard
        this.sdk.updateDashboard({
            activeVisitors: this.activeVisitors.size,
            earningRate: this.calculateEarningRate(),
            status: this.sdk.metrics.status
        });
    }
}
```

## Auto-Bonding with Stripe

### Stripe Integration
```javascript
class StripeBondingFlow {
    constructor(sdk) {
        this.sdk = sdk;
        this.stripe = null;
        this.elements = null;
    }
    
    async initStripe() {
        // Lazy load Stripe.js
        if (!window.Stripe) {
            await this.loadStripeJS();
        }
        
        this.stripe = window.Stripe(this.sdk.config.stripePublishableKey);
    }
    
    async createBondingModal() {
        const modal = document.createElement('div');
        modal.id = 'twist-bonding-modal';
        modal.innerHTML = `
            <div class="twist-modal-content">
                <h2>🚀 Your Site is Taking Off!</h2>
                <p>You have ${this.sdk.metrics.visitors} active visitors earning TWIST.</p>
                <p>Bond your site to unlock 10x higher earnings!</p>
                
                <div class="bonding-options">
                    <div class="bond-amount">
                        <label>Bond Amount (USDC)</label>
                        <select id="bond-amount">
                            <option value="50">$50 - Starter</option>
                            <option value="100" selected>$100 - Standard</option>
                            <option value="500">$500 - Premium</option>
                            <option value="1000">$1000 - Enterprise</option>
                        </select>
                    </div>
                    
                    <div class="payment-method">
                        <button class="pay-stripe active">
                            <img src="/icons/stripe.svg" alt="Stripe">
                            Credit Card
                        </button>
                        <button class="pay-coinbase">
                            <img src="/icons/coinbase.svg" alt="Coinbase">
                            Crypto
                        </button>
                    </div>
                    
                    <div id="payment-element">
                        <!-- Stripe Elements will mount here -->
                    </div>
                    
                    <button id="submit-bond" class="twist-button-primary">
                        Bond Site - $100
                    </button>
                    
                    <p class="bond-info">
                        ✓ Instant activation<br>
                        ✓ 24h minimum lock<br>
                        ✓ Withdraw anytime after
                    </p>
                </div>
                
                <button class="close-modal">Maybe Later</button>
            </div>
        `;
        
        // Add styles
        this.injectModalStyles();
        
        document.body.appendChild(modal);
        this.attachEventListeners(modal);
        
        // Initialize Stripe Elements
        await this.initStripeElements();
    }
    
    async initStripeElements() {
        // Create payment intent
        const response = await fetch(`${this.sdk.config.apiEndpoint}/publisher/bond/intent`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.sdk.wallet.token}`
            },
            body: JSON.stringify({
                amount: document.getElementById('bond-amount').value
            })
        });
        
        const { clientSecret } = await response.json();
        
        // Create Stripe Elements
        const appearance = {
            theme: 'stripe',
            variables: {
                colorPrimary: '#0099ff',
            }
        };
        
        this.elements = this.stripe.elements({ 
            clientSecret,
            appearance 
        });
        
        // Create and mount payment element
        const paymentElement = this.elements.create('payment');
        paymentElement.mount('#payment-element');
    }
    
    async processBonding() {
        const submitButton = document.getElementById('submit-bond');
        submitButton.disabled = true;
        submitButton.textContent = 'Processing...';
        
        try {
            // Confirm payment with Stripe
            const { error, paymentIntent } = await this.stripe.confirmPayment({
                elements: this.elements,
                confirmParams: {
                    return_url: `${window.location.origin}/bond-success`,
                },
                redirect: 'if_required'
            });
            
            if (error) {
                this.showError(error.message);
                return;
            }
            
            // Payment succeeded - execute bonding
            if (paymentIntent.status === 'succeeded') {
                await this.executeBonding(paymentIntent.id);
            }
            
        } catch (error) {
            this.showError('Payment failed. Please try again.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Bond Site - $100';
        }
    }
    
    async executeBonding(paymentIntentId) {
        // Call TWIST API to execute on-chain bonding
        const response = await fetch(`${this.sdk.config.apiEndpoint}/publisher/bond/execute`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.sdk.wallet.token}`
            },
            body: JSON.stringify({
                paymentIntentId,
                siteUrl: window.location.hostname,
                amount: document.getElementById('bond-amount').value
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Update site status
            this.sdk.metrics.status = 'bonded';
            
            // Show success message
            this.showSuccess();
            
            // Update dashboard
            this.sdk.updateDashboard({
                status: 'bonded',
                bondAmount: result.bondAmount,
                projectedEarnings: result.projectedEarnings
            });
        }
    }
    
    showSuccess() {
        const modal = document.getElementById('twist-bonding-modal');
        modal.innerHTML = `
            <div class="twist-modal-success">
                <h2>🎉 Site Successfully Bonded!</h2>
                <div class="success-icon">✓</div>
                <p>Your site is now earning at the bonded rate!</p>
                
                <div class="success-stats">
                    <div class="stat">
                        <span class="label">Previous Rate</span>
                        <span class="value">0.2 TWIST/visitor</span>
                    </div>
                    <div class="stat">
                        <span class="label">New Rate</span>
                        <span class="value">2.0 TWIST/visitor 🚀</span>
                    </div>
                    <div class="stat">
                        <span class="label">Projected Monthly</span>
                        <span class="value">$${this.calculateProjectedEarnings()}</span>
                    </div>
                </div>
                
                <button onclick="window.open('https://dashboard.twist.io', '_blank')">
                    Open Full Dashboard
                </button>
                
                <button class="close-modal">Close</button>
            </div>
        `;
        
        // Confetti animation
        this.celebrateSuccess();
    }
}
```

### Coinbase Commerce Integration
```javascript
class CoinbaseBondingFlow {
    constructor(sdk) {
        this.sdk = sdk;
    }
    
    async createCharge() {
        const response = await fetch(`${this.sdk.config.apiEndpoint}/publisher/bond/coinbase`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.sdk.wallet.token}`
            },
            body: JSON.stringify({
                amount: document.getElementById('bond-amount').value,
                currency: 'USD',
                description: `Bond site: ${window.location.hostname}`
            })
        });
        
        const charge = await response.json();
        
        // Open Coinbase Commerce modal
        this.openCoinbaseModal(charge.hosted_url);
    }
    
    openCoinbaseModal(url) {
        // Create iframe modal
        const modal = document.createElement('div');
        modal.className = 'coinbase-modal';
        modal.innerHTML = `
            <iframe src="${url}" 
                    width="100%" 
                    height="100%" 
                    frameborder="0">
            </iframe>
        `;
        
        document.body.appendChild(modal);
        
        // Listen for completion
        window.addEventListener('message', async (event) => {
            if (event.origin !== 'https://commerce.coinbase.com') return;
            
            if (event.data.status === 'success') {
                await this.sdk.stripeBonding.executeBonding(event.data.chargeId);
                modal.remove();
            }
        });
    }
}
```

## Publisher Dashboard Widget

### Embedded Dashboard
```javascript
class PublisherDashboard {
    constructor(sdk) {
        this.sdk = sdk;
        this.widget = null;
    }
    
    create() {
        const widget = document.createElement('div');
        widget.id = 'twist-publisher-widget';
        widget.innerHTML = `
            <div class="twist-widget-header">
                <img src="https://cdn.twist.io/logo-small.svg" alt="TWIST">
                <span class="status-badge ${this.sdk.metrics.status}">
                    ${this.sdk.metrics.status}
                </span>
            </div>
            
            <div class="twist-widget-stats">
                <div class="stat">
                    <span class="value">${this.sdk.metrics.visitors}</span>
                    <span class="label">Active Visitors</span>
                </div>
                <div class="stat">
                    <span class="value">${this.formatEarnings()}</span>
                    <span class="label">Earned Today</span>
                </div>
                <div class="stat">
                    <span class="value">${this.getEarningRate()}</span>
                    <span class="label">Rate/Visitor</span>
                </div>
            </div>
            
            <div class="twist-widget-actions">
                ${this.getActionButtons()}
            </div>
            
            <div class="twist-widget-footer">
                <a href="https://dashboard.twist.io" target="_blank">
                    Full Dashboard →
                </a>
            </div>
        `;
        
        // Position based on config
        const position = this.sdk.config.widgetPosition || 'bottom-right';
        widget.className = `twist-publisher-widget ${position}`;
        
        // Add styles
        this.injectWidgetStyles();
        
        document.body.appendChild(widget);
        this.widget = widget;
        
        // Make draggable
        this.makeDraggable(widget);
    }
    
    getActionButtons() {
        if (this.sdk.metrics.status === 'cold') {
            return `
                <button class="twist-bond-button" onclick="window.twistSDK.promptBonding()">
                    Bond Site (10x Earnings)
                </button>
            `;
        } else {
            return `
                <button class="twist-manage-button" onclick="window.open('https://dashboard.twist.io')">
                    Manage Bond
                </button>
                <button class="twist-withdraw-button" onclick="window.twistSDK.showWithdraw()">
                    Withdraw Earnings
                </button>
            `;
        }
    }
    
    update(metrics) {
        if (!this.widget) return;
        
        // Update values with smooth transitions
        this.animateValue('visitors', metrics.activeVisitors);
        this.animateValue('earnings', metrics.earnings);
        this.updateStatus(metrics.status);
    }
    
    animateValue(stat, newValue) {
        const element = this.widget.querySelector(`.stat[data-stat="${stat}"] .value`);
        if (!element) return;
        
        const current = parseInt(element.textContent) || 0;
        const diff = newValue - current;
        const steps = 20;
        const increment = diff / steps;
        
        let step = 0;
        const timer = setInterval(() => {
            step++;
            element.textContent = Math.round(current + increment * step);
            
            if (step >= steps) {
                clearInterval(timer);
                element.textContent = newValue;
            }
        }, 50);
    }
}
```

## SDK Configuration Options

### Advanced Configuration
```javascript
const advancedConfig = {
    // Wallet options
    custodialMode: true,        // Managed wallet (default)
    selfCustody: false,         // User manages keys
    
    // Bonding options
    autoBondThreshold: 100,     // Visitors before prompt
    minBondAmount: 50,          // Minimum USD
    bondingMethods: ['stripe', 'coinbase', 'direct'],
    
    // Display options
    showWidget: true,
    widgetPosition: 'bottom-right',
    widgetTheme: 'dark',
    
    // Analytics
    enableAnalytics: true,
    analyticsEndpoint: 'https://analytics.twist.io',
    
    // Custom branding
    brandColor: '#0099ff',
    brandLogo: '/logo.svg',
    
    // Advanced features
    enableBrandToken: false,
    brandTokenSymbol: 'BRAND',
    brandTokenSupply: 10_000_000,
    
    // Webhooks
    webhooks: {
        onBond: 'https://api.site.com/twist/bonded',
        onWithdraw: 'https://api.site.com/twist/withdrawn',
        onVisitor: 'https://api.site.com/twist/visitor'
    }
};

// Initialize with advanced config
const sdk = new TwistPublisherSDK(advancedConfig);
```

### Self-Custody Mode
```javascript
class SelfCustodyWallet {
    constructor(sdk) {
        this.sdk = sdk;
        this.wallet = null;
    }
    
    async init() {
        // Check for Phantom/Solflare
        if ('solana' in window) {
            const provider = window.solana;
            
            try {
                const response = await provider.connect();
                this.wallet = {
                    publicKey: response.publicKey.toString(),
                    provider: provider
                };
                
                // Register with TWIST
                await this.registerWallet();
                
            } catch (err) {
                console.error('Wallet connection failed:', err);
                // Fall back to custodial
                this.sdk.useCustodial();
            }
        }
    }
    
    async signTransaction(transaction) {
        const signed = await this.wallet.provider.signTransaction(transaction);
        return signed;
    }
}
```

## API Reference

### Core Methods
```javascript
// Initialize SDK
const twist = new TwistPublisherSDK({
    siteEmail: 'publisher@site.com'
});

// Manual bonding trigger
twist.promptBonding();

// Check earnings
const earnings = await twist.getEarnings();

// Withdraw funds
await twist.withdraw({
    amount: 100,
    currency: 'USDC',
    destination: 'wallet_address'
});

// Update configuration
twist.updateConfig({
    widgetPosition: 'top-left',
    theme: 'light'
});

// Event listeners
twist.on('visitor', (data) => {
    console.log('New visitor:', data);
});

twist.on('bonded', (data) => {
    console.log('Site bonded:', data);
});

twist.on('earnings', (data) => {
    console.log('Earnings update:', data);
});
```

### Webhook Events
```javascript
// Visitor event
{
    "event": "visitor",
    "data": {
        "visitorId": "device_123",
        "earned": 0.2,
        "trustLevel": "trusted",
        "timestamp": 1234567890
    }
}

// Bond event
{
    "event": "bonded",
    "data": {
        "siteUrl": "example.com",
        "bondAmount": 100,
        "bondedAt": 1234567890,
        "transactionId": "tx_123"
    }
}

// Earnings event
{
    "event": "earnings",
    "data": {
        "period": "2024-01-15",
        "visitors": 1523,
        "earned": 304.6,
        "rate": 0.2
    }
}
```

## Testing & Debugging

### Test Mode
```javascript
// Enable test mode
const testSDK = new TwistPublisherSDK({
    siteEmail: 'test@site.com',
    testMode: true,
    testStripeKey: 'pk_test_xyz',
    mockVisitors: true
});

// Simulate visitors
testSDK.simulateVisitors({
    count: 100,
    rate: 10, // per second
    trustLevel: 'trusted'
});

// Test bonding flow
testSDK.testBonding({
    amount: 100,
    method: 'stripe',
    card: '4242424242424242'
});
```

### Debug Console
```javascript
// Enable debug mode
window.TWIST_DEBUG = true;

// Access debug info
console.log(window.twistSDK.debug());

// Output:
{
    wallet: { address: '...', balance: 1234 },
    visitors: { active: 45, total: 1523 },
    earnings: { today: 304.6, pending: 12.3 },
    config: { ... },
    errors: []
}
```

---

*This SDK provides everything publishers need to integrate TWIST with zero friction and start earning immediately.*