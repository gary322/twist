# TWIST No-Code Widget Implementation

> Technical implementation details for the Universal SDK / Pixel / Widget

## Overview

The TWIST no-code widget (served as `pixel.js`, `sdk.js`, or `widget.js` - all aliases) provides automatic token rewards with zero configuration required. This document details the internal implementation.

## Core Architecture

### Entry Point

```javascript
// cdn.twist.io/pixel.js (ahee_no_code_widget)
(function() {
    'use strict';
    
    // Parse configuration from script tag
    const script = document.currentScript || 
                  document.querySelector('script[src*="twist.io"]');
    
    const config = {
        productId: script.dataset.productId || detectProductId(),
        apiKey: script.dataset.apiKey || 'twist_pk_demo',
        apiEndpoint: 'https://edge.twist.io',
        debug: script.dataset.debug === 'true',
        rewards: JSON.parse(script.dataset.rewards || '{}')
    };
    
    // Initialize SDK
    window.TWIST = new TwistUniversalSDK(config);
})();
```

### Email Detection Engine

```javascript
class EmailDetector {
    constructor() {
        this.detectors = [
            // Popular Auth Providers
            () => this.detectAuth0(),
            () => this.detectFirebase(),
            () => this.detectSupabase(),
            () => this.detectClerk(),
            
            // E-commerce Platforms
            () => this.detectShopify(),
            () => this.detectWooCommerce(),
            () => this.detectBigCommerce(),
            
            // Common Patterns
            () => this.detectLocalStorage(),
            () => this.detectSessionStorage(),
            () => this.detectCookies(),
            () => this.detectDOM(),
            () => this.detectMeta(),
            
            // Framework Specific
            () => this.detectNextJS(),
            () => this.detectNuxt(),
            () => this.detectReact(),
            
            // API Interception
            () => this.detectFromAPI()
        ];
        
        this.email = null;
        this.startDetection();
    }
    
    async detectAuth0() {
        // Check Auth0 in multiple ways
        if (window.auth0) {
            const user = await window.auth0.getUser();
            return user?.email;
        }
        
        // Check localStorage
        const auth0Storage = Object.keys(localStorage)
            .find(key => key.includes('auth0'));
        if (auth0Storage) {
            try {
                const data = JSON.parse(localStorage[auth0Storage]);
                return data.user?.email || data.email;
            } catch {}
        }
    }
    
    async detectFirebase() {
        if (window.firebase?.auth) {
            const user = window.firebase.auth().currentUser;
            return user?.email;
        }
        
        // Check for Firebase in window
        if (window.firebaseUser) {
            return window.firebaseUser.email;
        }
    }
    
    detectShopify() {
        // Multiple Shopify detection methods
        return window.Shopify?.customer?.email ||
               window.ShopifyCustomer?.email ||
               window.__st?.cid?.email ||
               this.parseJSONLD('customer')?.email;
    }
    
    detectFromAPI() {
        // Intercept fetch/XHR to find emails
        this.interceptFetch();
        this.interceptXHR();
    }
    
    interceptFetch() {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            const clone = response.clone();
            
            try {
                const data = await clone.json();
                const email = this.findEmailInObject(data);
                if (email) this.setEmail(email);
            } catch {}
            
            return response;
        };
    }
    
    findEmailInObject(obj, depth = 0) {
        if (depth > 5) return null;
        
        for (const key in obj) {
            if (key.toLowerCase().includes('email') && 
                this.isValidEmail(obj[key])) {
                return obj[key];
            }
            
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                const found = this.findEmailInObject(obj[key], depth + 1);
                if (found) return found;
            }
        }
        
        return null;
    }
}
```

### Action Detection System

```javascript
class ActionDetector {
    constructor(sdk) {
        this.sdk = sdk;
        this.setupDetectors();
    }
    
    setupDetectors() {
        // Purchase Detection
        this.detectPurchases();
        
        // Authentication Detection  
        this.detectAuth();
        
        // Engagement Detection
        this.detectEngagement();
        
        // Social Detection
        this.detectSocial();
        
        // Custom Detection
        this.detectCustom();
    }
    
    detectPurchases() {
        // Stripe
        if (window.Stripe) {
            this.interceptStripe();
        }
        
        // PayPal
        if (window.paypal) {
            this.interceptPayPal();
        }
        
        // Thank you page detection
        this.detectThankYouPages();
        
        // E-commerce platform specific
        this.detectPlatformPurchases();
    }
    
    interceptStripe() {
        // Monitor Stripe checkout completion
        document.addEventListener('stripe:payment:success', (e) => {
            this.sdk.track('purchase', {
                amount: e.detail.amount,
                currency: e.detail.currency
            });
        });
        
        // Intercept confirmPayment
        if (window.Stripe) {
            const stripe = window.Stripe();
            const original = stripe.confirmPayment;
            stripe.confirmPayment = async (...args) => {
                const result = await original.apply(stripe, args);
                if (!result.error) {
                    this.sdk.track('purchase');
                }
                return result;
            };
        }
    }
    
    detectThankYouPages() {
        // Common thank you page patterns
        const patterns = [
            /\/thank[-_]?you/i,
            /\/order[-_]?complete/i,
            /\/success/i,
            /\/confirmation/i,
            /\/receipt/i
        ];
        
        if (patterns.some(p => p.test(window.location.pathname))) {
            // Extract order details if possible
            const amount = this.extractOrderAmount();
            this.sdk.track('purchase', { amount });
        }
    }
    
    detectAuth() {
        // Login detection
        this.monitorAuthChanges();
        
        // Signup detection
        this.monitorFormSubmissions();
    }
    
    monitorAuthChanges() {
        // Storage events
        window.addEventListener('storage', (e) => {
            if (e.key?.includes('auth') && e.newValue && !e.oldValue) {
                this.sdk.track('login');
            }
        });
        
        // Common auth state changes
        const checkAuth = () => {
            const isLoggedIn = 
                document.cookie.includes('session') ||
                localStorage.getItem('token') ||
                sessionStorage.getItem('user');
                
            if (isLoggedIn && !this.wasLoggedIn) {
                this.sdk.track('login');
            }
            this.wasLoggedIn = isLoggedIn;
        };
        
        setInterval(checkAuth, 1000);
    }
    
    detectSocial() {
        // Click handler for share buttons
        document.addEventListener('click', (e) => {
            const target = e.target.closest('a, button');
            if (!target) return;
            
            const sharePatterns = [
                'twitter.com/intent',
                'facebook.com/sharer',
                'linkedin.com/sharing',
                'whatsapp://send',
                'telegram.me/share',
                'reddit.com/submit'
            ];
            
            const href = target.href || '';
            const onclick = target.onclick?.toString() || '';
            const classes = target.className || '';
            
            const isShare = sharePatterns.some(pattern => 
                href.includes(pattern) || 
                onclick.includes(pattern) ||
                classes.includes('share')
            );
            
            if (isShare) {
                this.sdk.track('share', {
                    platform: this.detectSharePlatform(href)
                });
            }
        });
    }
}
```

### Event Transmission

```javascript
class EventTransmitter {
    constructor(config) {
        this.config = config;
        this.queue = [];
        this.batchSize = 10;
        this.flushInterval = 5000;
        
        this.startBatching();
    }
    
    async track(action, metadata = {}) {
        const event = {
            product_id: this.config.productId,
            action,
            metadata,
            email: await this.getEmail(),
            timestamp: Date.now(),
            session_id: this.getSessionId(),
            page_url: window.location.href
        };
        
        this.queue.push(event);
        
        if (this.queue.length >= this.batchSize) {
            this.flush();
        }
    }
    
    async flush() {
        if (this.queue.length === 0) return;
        
        const events = [...this.queue];
        this.queue = [];
        
        try {
            const response = await fetch(`${this.config.apiEndpoint}/pixel/track`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.config.apiKey,
                    'X-Signature': await this.sign(events)
                },
                body: JSON.stringify({ events })
            });
            
            if (!response.ok && response.status !== 429) {
                // Return events to queue for retry
                this.queue.unshift(...events);
            }
            
            if (response.status === 429) {
                // Rate limited - increase flush interval
                this.flushInterval = Math.min(this.flushInterval * 2, 60000);
            }
            
        } catch (error) {
            // Return events to queue for retry
            this.queue.unshift(...events);
            console.error('TWIST: Failed to send events', error);
        }
    }
    
    async sign(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(JSON.stringify(data));
        
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(this.config.apiKey),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        
        const signature = await crypto.subtle.sign(
            'HMAC',
            key,
            dataBuffer
        );
        
        return btoa(String.fromCharCode(...new Uint8Array(signature)));
    }
}
```

### Visual Feedback

```javascript
class TwistNotification {
    constructor() {
        this.container = this.createContainer();
    }
    
    createContainer() {
        const container = document.createElement('div');
        container.id = 'twist-notifications';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            pointer-events: none;
        `;
        document.body.appendChild(container);
        return container;
    }
    
    show(message, amount) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            background: linear-gradient(135deg, #00d4ff, #0099ff);
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            margin-bottom: 10px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            animation: slideIn 0.3s ease-out;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: -apple-system, system-ui;
        `;
        
        notification.innerHTML = `
            <div style="font-size: 24px;">🌀</div>
            <div>
                <div style="font-weight: 600;">+${amount} TWIST</div>
                <div style="font-size: 14px; opacity: 0.9;">${message}</div>
            </div>
        `;
        
        this.container.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}
```

### Platform-Specific Adapters

```javascript
// Shopify Adapter
class ShopifyAdapter {
    constructor(sdk) {
        this.sdk = sdk;
        this.init();
    }
    
    init() {
        // Listen for Shopify events
        document.addEventListener('shopify:cart:add', (e) => {
            this.sdk.track('add_to_cart', {
                product: e.detail.product,
                variant: e.detail.variant
            });
        });
        
        // Monitor checkout
        if (window.Shopify?.checkout) {
            this.monitorCheckout();
        }
    }
}

// WordPress Adapter
class WordPressAdapter {
    constructor(sdk) {
        this.sdk = sdk;
        this.detectUser();
        this.monitorActions();
    }
    
    detectUser() {
        // Check for logged in user
        const userEmail = 
            window.wpUser?.email ||
            document.querySelector('.logged-in-as a')?.href.split('mailto:')[1];
            
        if (userEmail) {
            this.sdk.identify(userEmail);
        }
    }
}
```

### Edge Worker Integration

```javascript
// edge_feature_pipe_worker handles all events
async function handlePixelTrack(request, env) {
    const { events } = await request.json();
    
    // Verify signature
    const signature = request.headers.get('X-Signature');
    if (!await verifyHMAC(signature, events, env)) {
        return new Response('Unauthorized', { status: 401 });
    }
    
    // Process each event
    for (const event of events) {
        // Map email to wallet
        const wallet = await mapEmailToWallet(event.email, env);
        
        // Calculate reward
        const rewardAmount = calculateReward(event.action, event.product_id);
        
        // Queue reward via campaign_reward_router
        await queueReward(wallet, rewardAmount, event, env);
    }
    
    return new Response('OK', { status: 200 });
}
```

## Security Considerations

1. **HMAC Authentication** - All requests signed
2. **Rate Limiting** - Per-product and per-email limits
3. **Email Validation** - Strict email format checking
4. **XSS Prevention** - No user input in DOM manipulation
5. **CORS Headers** - Properly configured on edge workers

## Performance Optimizations

1. **Lazy Loading** - Only load what's needed
2. **Event Batching** - Reduce API calls
3. **Local Caching** - Cache email detection
4. **Debouncing** - Prevent duplicate events
5. **Async Loading** - Non-blocking script

---

*This implementation ensures truly no-code integration while maintaining security and performance.*