# TWIST Mobile Implementation Guide

> Complete implementation guide for TWIST on mobile devices without requiring app installation

## Overview

TWIST works seamlessly on mobile browsers through:
- WebAuthn API for biometric attestation
- Progressive Web App for enhanced features
- In-page UI instead of browser extension
- SDK-based integration requiring no app download

## Mobile SDK Implementation

### Core SDK Setup
```javascript
// twist-sdk.js - Mobile compatible version
class TwistMobileSDK {
    constructor(config) {
        this.siteEmail = config.siteEmail;
        this.apiEndpoint = 'https://api.twist.io';
        this.badge = null;
        this.attestation = null;
        
        // Detect mobile environment
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        // Initialize based on platform
        if (this.isMobile) {
            this.initMobile();
        } else {
            this.initDesktop();
        }
    }
    
    async initMobile() {
        // Create in-page badge
        this.createMobileBadge();
        
        // Setup WebAuthn for mobile
        await this.setupMobileAttestation();
        
        // Initialize VAU emission
        this.startVAUEmission();
        
        // Check for PWA prompt
        this.checkPWAEligibility();
    }
    
    createMobileBadge() {
        const badge = document.createElement('div');
        badge.id = 'twist-mobile-badge';
        badge.innerHTML = `
            <div class="twist-badge-container">
                <div class="twist-logo">🌀</div>
                <div class="twist-earnings">+0.0</div>
                <div class="twist-status">Connecting...</div>
            </div>
        `;
        
        // Mobile-optimized styles
        const styles = `
            #twist-mobile-badge {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 12px 16px;
                border-radius: 24px;
                font-family: -apple-system, system-ui;
                font-size: 14px;
                z-index: 999999;
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                -webkit-tap-highlight-color: transparent;
                user-select: none;
                transition: all 0.3s ease;
            }
            
            #twist-mobile-badge.earning {
                background: linear-gradient(135deg, #00d4ff, #0099ff);
            }
            
            #twist-mobile-badge.burning {
                background: linear-gradient(135deg, #ff6b6b, #ff0066);
            }
            
            .twist-badge-container {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .twist-logo {
                font-size: 20px;
                animation: spin 3s linear infinite;
            }
            
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            .twist-earnings {
                font-weight: 600;
                font-size: 16px;
            }
            
            .twist-status {
                font-size: 12px;
                opacity: 0.8;
            }
            
            /* Expand on tap */
            #twist-mobile-badge.expanded {
                bottom: 20px;
                right: 20px;
                left: 20px;
                border-radius: 16px;
                flex-direction: column;
                align-items: stretch;
                padding: 20px;
            }
        `;
        
        // Inject styles
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
        
        // Add to page
        document.body.appendChild(badge);
        this.badge = badge;
        
        // Add tap handler
        badge.addEventListener('click', () => this.toggleBadgeExpanded());
    }
    
    async setupMobileAttestation() {
        try {
            // Mobile-specific WebAuthn options
            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: new Uint8Array(32),
                    rp: {
                        name: "TWIST",
                        id: window.location.hostname
                    },
                    user: {
                        id: new TextEncoder().encode(this.siteEmail),
                        name: this.siteEmail,
                        displayName: "TWIST User"
                    },
                    pubKeyCredParams: [
                        { alg: -7, type: "public-key" }
                    ],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "preferred",
                        residentKey: "preferred"
                    },
                    attestation: "direct",
                    timeout: 60000
                }
            });
            
            this.attestation = {
                credentialId: credential.id,
                attestationObject: credential.response.attestationObject,
                clientDataJSON: credential.response.clientDataJSON,
                trustLevel: 'trusted'
            };
            
            this.updateBadge('Connected', 'earning');
            
        } catch (error) {
            console.log('Attestation failed, falling back to untrusted mode');
            this.attestation = { trustLevel: 'untrusted' };
            this.updateBadge('Limited Mode', 'normal');
        }
    }
}
```

### VAU Emission for Mobile
```javascript
class MobileVAUEmitter {
    constructor(sdk) {
        this.sdk = sdk;
        this.lastEmission = 0;
        this.visibilityAPI = this.getVisibilityAPI();
    }
    
    getVisibilityAPI() {
        // Handle vendor prefixes
        if (typeof document.hidden !== "undefined") {
            return {
                hidden: "hidden",
                visibilityChange: "visibilitychange"
            };
        } else if (typeof document.webkitHidden !== "undefined") {
            return {
                hidden: "webkitHidden",
                visibilityChange: "webkitvisibilitychange"
            };
        }
    }
    
    startEmission() {
        // Listen for visibility changes (important on mobile)
        document.addEventListener(
            this.visibilityAPI.visibilityChange,
            () => this.handleVisibilityChange()
        );
        
        // Start emission loop
        this.emissionLoop();
    }
    
    async emissionLoop() {
        if (!document[this.visibilityAPI.hidden]) {
            const now = Date.now();
            
            if (now - this.lastEmission >= 5000) {
                await this.emitVAU();
                this.lastEmission = now;
            }
        }
        
        // Schedule next emission
        setTimeout(() => this.emissionLoop(), 1000);
    }
    
    async emitVAU() {
        const vau = {
            siteHash: await this.hashSite(window.location.origin),
            secs: 5,
            ctr: this.generateCounter(),
            attestation: this.sdk.attestation,
            timestamp: Date.now(),
            isMobile: true
        };
        
        // Send to Edge Worker
        try {
            const response = await fetch(`${this.sdk.apiEndpoint}/vau`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(vau)
            });
            
            const result = await response.json();
            this.sdk.updateEarnings(result.earned);
            
        } catch (error) {
            console.error('VAU emission failed:', error);
        }
    }
}
```

## Progressive Web App Implementation

### PWA Manifest
```json
{
  "name": "TWIST Wallet",
  "short_name": "TWIST",
  "description": "Earn from your attention",
  "start_url": "/wallet",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#0099ff",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/twist-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/twist-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "categories": ["finance", "productivity"],
  "shortcuts": [
    {
      "name": "View Balance",
      "url": "/wallet/balance",
      "icons": [{"src": "/icons/balance.png", "sizes": "96x96"}]
    },
    {
      "name": "Refer Friend",
      "url": "/wallet/refer",
      "icons": [{"src": "/icons/refer.png", "sizes": "96x96"}]
    }
  ]
}
```

### Service Worker
```javascript
// sw.js - Service worker for offline & notifications
const CACHE_NAME = 'twist-v1';
const urlsToCache = [
    '/wallet',
    '/wallet/offline.html',
    '/icons/twist-192.png',
    '/css/wallet.css',
    '/js/wallet.js'
];

// Install event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
            .catch(() => {
                if (event.request.destination === 'document') {
                    return caches.match('/wallet/offline.html');
                }
            })
    );
});

// Push notifications
self.addEventListener('push', event => {
    const options = {
        body: event.data.text(),
        icon: '/icons/twist-192.png',
        badge: '/icons/badge.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'view',
                title: 'View Balance',
                icon: '/icons/checkmark.png'
            },
            {
                action: 'close',
                title: 'Close',
                icon: '/icons/xmark.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('TWIST Update', options)
    );
});
```

### PWA Installation Prompt
```javascript
class PWAInstallManager {
    constructor() {
        this.deferredPrompt = null;
        this.installButton = null;
        
        // Listen for install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPromotion();
        });
        
        // Listen for successful install
        window.addEventListener('appinstalled', () => {
            this.hideInstallPromotion();
            this.trackInstallation();
        });
    }
    
    showInstallPromotion() {
        // Only show after user has earned some TWIST
        const earnings = localStorage.getItem('twistEarnings') || 0;
        if (earnings < 10) return;
        
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.innerHTML = `
            <div class="install-content">
                <div class="install-icon">📱</div>
                <div class="install-text">
                    <h3>Install TWIST Wallet</h3>
                    <p>Track earnings & get notifications</p>
                </div>
                <button class="install-button">Install</button>
                <button class="dismiss-button">✕</button>
            </div>
        `;
        
        // Styles
        const styles = `
            #pwa-install-banner {
                position: fixed;
                bottom: 80px;
                left: 20px;
                right: 20px;
                background: white;
                border-radius: 12px;
                padding: 16px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                display: flex;
                align-items: center;
                gap: 12px;
                z-index: 999998;
                animation: slideUp 0.3s ease-out;
            }
            
            @keyframes slideUp {
                from {
                    transform: translateY(100%);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            
            .install-content {
                display: flex;
                align-items: center;
                gap: 12px;
                width: 100%;
            }
            
            .install-icon {
                font-size: 32px;
            }
            
            .install-text {
                flex: 1;
            }
            
            .install-text h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
            }
            
            .install-text p {
                margin: 4px 0 0 0;
                font-size: 14px;
                color: #666;
            }
            
            .install-button {
                background: #0099ff;
                color: white;
                border: none;
                padding: 8px 20px;
                border-radius: 20px;
                font-weight: 600;
                font-size: 14px;
            }
            
            .dismiss-button {
                background: none;
                border: none;
                font-size: 20px;
                color: #999;
                padding: 4px;
            }
        `;
        
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
        
        document.body.appendChild(banner);
        
        // Add event listeners
        banner.querySelector('.install-button').addEventListener('click', () => {
            this.promptInstall();
        });
        
        banner.querySelector('.dismiss-button').addEventListener('click', () => {
            this.hideInstallPromotion();
        });
    }
    
    async promptInstall() {
        if (!this.deferredPrompt) return;
        
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('PWA installed');
        }
        
        this.deferredPrompt = null;
    }
}
```

## Mobile-Specific Features

### Touch Gestures
```javascript
class TouchInteractionManager {
    constructor(badge) {
        this.badge = badge;
        this.startY = 0;
        this.currentY = 0;
        
        this.initTouchHandlers();
    }
    
    initTouchHandlers() {
        // Swipe up to expand
        this.badge.addEventListener('touchstart', (e) => {
            this.startY = e.touches[0].clientY;
        });
        
        this.badge.addEventListener('touchmove', (e) => {
            this.currentY = e.touches[0].clientY;
            const deltaY = this.startY - this.currentY;
            
            if (deltaY > 50) {
                this.expandBadge();
            }
        });
        
        // Long press for options
        let pressTimer;
        this.badge.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => {
                this.showQuickActions();
            }, 500);
        });
        
        this.badge.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });
    }
    
    showQuickActions() {
        // Haptic feedback if available
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
        
        // Show action menu
        const actions = [
            { icon: '💰', label: 'View Balance', action: 'balance' },
            { icon: '🔗', label: 'Refer Friend', action: 'refer' },
            { icon: '📊', label: 'Stats', action: 'stats' }
        ];
        
        // Implementation of action menu...
    }
}
```

### Battery & Performance Optimization
```javascript
class MobileOptimizer {
    constructor() {
        this.reducedMode = false;
        this.batteryLevel = 1.0;
        
        this.initBatteryMonitoring();
        this.initNetworkMonitoring();
    }
    
    async initBatteryMonitoring() {
        if ('getBattery' in navigator) {
            const battery = await navigator.getBattery();
            
            battery.addEventListener('levelchange', () => {
                this.batteryLevel = battery.level;
                this.adjustPerformance();
            });
            
            battery.addEventListener('chargingchange', () => {
                this.adjustPerformance();
            });
        }
    }
    
    initNetworkMonitoring() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            
            connection.addEventListener('change', () => {
                this.adjustForNetwork();
            });
        }
    }
    
    adjustPerformance() {
        // Reduce VAU frequency on low battery
        if (this.batteryLevel < 0.2) {
            window.TWIST_VAU_INTERVAL = 10000; // 10s instead of 5s
            this.reducedMode = true;
        } else {
            window.TWIST_VAU_INTERVAL = 5000;
            this.reducedMode = false;
        }
    }
    
    adjustForNetwork() {
        const connection = navigator.connection;
        
        // Batch VAUs on slow connections
        if (connection.effectiveType === '2g' || connection.saveData) {
            window.TWIST_BATCH_VAUS = true;
        } else {
            window.TWIST_BATCH_VAUS = false;
        }
    }
}
```

## Testing Mobile Implementation

### Device Testing Matrix
```javascript
const testDevices = [
    // iOS
    { name: 'iPhone 14', os: 'iOS 16', browser: 'Safari' },
    { name: 'iPhone SE', os: 'iOS 15', browser: 'Safari' },
    { name: 'iPad Pro', os: 'iPadOS 16', browser: 'Safari' },
    
    // Android
    { name: 'Pixel 7', os: 'Android 13', browser: 'Chrome' },
    { name: 'Samsung S23', os: 'Android 13', browser: 'Samsung Internet' },
    { name: 'OnePlus 11', os: 'Android 13', browser: 'Chrome' },
    
    // Edge cases
    { name: 'iPhone 8', os: 'iOS 14', browser: 'Safari' },
    { name: 'Pixel 3a', os: 'Android 12', browser: 'Chrome' }
];
```

### Mobile-Specific Test Cases
```javascript
describe('Mobile Implementation', () => {
    test('WebAuthn works with platform authenticators', async () => {
        const result = await mobileSDK.setupMobileAttestation();
        expect(result.trustLevel).toBe('trusted');
    });
    
    test('Badge renders correctly on small screens', () => {
        const badge = document.querySelector('#twist-mobile-badge');
        expect(badge.offsetWidth).toBeLessThan(screen.width);
        expect(badge.offsetHeight).toBeLessThan(100);
    });
    
    test('PWA installs successfully', async () => {
        const event = new Event('beforeinstallprompt');
        window.dispatchEvent(event);
        
        const banner = document.querySelector('#pwa-install-banner');
        expect(banner).toBeTruthy();
    });
    
    test('Touch gestures work correctly', () => {
        const badge = document.querySelector('#twist-mobile-badge');
        
        // Simulate swipe up
        badge.dispatchEvent(new TouchEvent('touchstart', {
            touches: [{ clientY: 100 }]
        }));
        
        badge.dispatchEvent(new TouchEvent('touchmove', {
            touches: [{ clientY: 20 }]
        }));
        
        expect(badge.classList.contains('expanded')).toBe(true);
    });
});
```

## Performance Guidelines

### Mobile Optimization Checklist
- [ ] Minimize JavaScript bundle size (<100KB gzipped)
- [ ] Use CSS containment for badge rendering
- [ ] Implement virtual scrolling for long lists
- [ ] Lazy load non-critical resources
- [ ] Use IndexedDB for offline data storage
- [ ] Implement request batching
- [ ] Add loading skeletons
- [ ] Optimize images with WebP
- [ ] Use CSS transforms for animations
- [ ] Implement touch-friendly tap targets (44x44px minimum)

---

*This implementation ensures TWIST works seamlessly on all mobile devices without requiring app installation.*