// Enhanced Content Script with Influencer Detection
import { SecuritySandbox } from '../security/sandbox';
import { MessageType } from '../types';

(function() {
  'use strict';

  // Only run on http/https pages
  if (!window.location.protocol.startsWith('http')) {
    return;
  }

  // Initialize security sandbox
  const security = new SecuritySandbox();

  // Check if we should track this page
  if (!security.shouldTrackPage(window.location.href)) {
    // Skip tracking sensitive pages
    return;
  }

  class TwistContentScript {
    private lastActivity: number = Date.now();
    private activityBuffer: any[] = [];
    private observer: IntersectionObserver | null = null;
    private security: SecuritySandbox;
    private platform: string | null = null;
    private influencerCheckInterval: number | null = null;
    private lastDetectedInfluencer: string | null = null;

    constructor(securitySandbox: SecuritySandbox) {
      this.security = securitySandbox;
      this.detectPlatform();
      this.initializeActivityTracking();
      this.initializeMessageHandlers();
      this.injectVAUDetector();
      
      // Start influencer detection if on social media
      if (this.platform) {
        this.startInfluencerDetection();
      }
    }

    private detectPlatform(): void {
      const hostname = window.location.hostname;
      
      if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
        this.platform = 'twitter';
      } else if (hostname.includes('instagram.com')) {
        this.platform = 'instagram';
      } else if (hostname.includes('youtube.com')) {
        this.platform = 'youtube';
      } else if (hostname.includes('tiktok.com')) {
        this.platform = 'tiktok';
      } else if (hostname.includes('twitch.tv')) {
        this.platform = 'twitch';
      }
    }

    private startInfluencerDetection() {
      // Check immediately
      this.detectInfluencer();
      
      // Set up periodic checks for SPA navigation
      this.influencerCheckInterval = window.setInterval(() => {
        this.detectInfluencer();
      }, 2000);
      
      // Also listen for URL changes
      let lastUrl = location.href;
      new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;
          setTimeout(() => this.detectInfluencer(), 500);
        }
      }).observe(document, { subtree: true, childList: true });
    }

    private detectInfluencer() {
      let username: string | null = null;
      
      switch (this.platform) {
        case 'twitter':
          username = this.detectTwitterInfluencer();
          break;
        case 'instagram':
          username = this.detectInstagramInfluencer();
          break;
        case 'youtube':
          username = this.detectYoutubeInfluencer();
          break;
        case 'tiktok':
          username = this.detectTiktokInfluencer();
          break;
        case 'twitch':
          username = this.detectTwitchInfluencer();
          break;
      }
      
      if (username && username !== this.lastDetectedInfluencer) {
        this.lastDetectedInfluencer = username;
        this.checkInfluencerWithExtension(username);
      }
    }

    private detectTwitterInfluencer(): string | null {
      // Check URL pattern
      const urlMatch = window.location.pathname.match(/^\/(\w+)$/);
      if (urlMatch) {
        const username = urlMatch[1];
        // Skip navigation pages
        if (!['home', 'explore', 'notifications', 'messages', 'bookmarks', 'lists'].includes(username)) {
          return username;
        }
      }
      
      // Check profile header
      const profileName = document.querySelector('[data-testid="UserName"] span')?.textContent;
      if (profileName && profileName.startsWith('@')) {
        return profileName.substring(1);
      }
      
      return null;
    }

    private detectInstagramInfluencer(): string | null {
      // Check URL
      const urlMatch = window.location.pathname.match(/^\/([^\/]+)\/?$/);
      if (urlMatch) {
        const username = urlMatch[1];
        // Skip navigation pages
        if (!['explore', 'accounts', 'direct', 'stories'].includes(username)) {
          return username;
        }
      }
      
      // Check profile header
      const profileTitle = document.querySelector('h1')?.textContent;
      if (profileTitle) {
        return profileTitle;
      }
      
      return null;
    }

    private detectYoutubeInfluencer(): string | null {
      // Check for channel page
      const channelMatch = window.location.pathname.match(/\/@([^\/]+)/);
      if (channelMatch) {
        return channelMatch[1];
      }
      
      // Check for video page - get channel from video
      if (window.location.pathname.includes('/watch')) {
        const channelLink = document.querySelector('#owner a[href*="/@"]');
        if (channelLink) {
          const href = channelLink.getAttribute('href');
          const match = href?.match(/@([^\/]+)/);
          if (match) {
            return match[1];
          }
        }
      }
      
      return null;
    }

    private detectTiktokInfluencer(): string | null {
      // Check URL
      const urlMatch = window.location.pathname.match(/^\/@([^\/]+)/);
      if (urlMatch) {
        return urlMatch[1];
      }
      
      // Check profile header
      const profileName = document.querySelector('[data-e2e="user-title"]')?.textContent;
      if (profileName) {
        return profileName;
      }
      
      return null;
    }

    private detectTwitchInfluencer(): string | null {
      // Check URL
      const urlMatch = window.location.pathname.match(/^\/(\w+)$/);
      if (urlMatch) {
        const username = urlMatch[1];
        // Skip navigation pages
        if (!['directory', 'downloads', 'prime', 'turbo'].includes(username)) {
          return username;
        }
      }
      
      return null;
    }

    private async checkInfluencerWithExtension(username: string) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: MessageType.GET_INFLUENCER_ON_PAGE
        });
        
        if (response?.influencer) {
          this.showInfluencerBadge(response.influencer);
        }
      } catch (error) {
        // Extension might not have found the influencer
      }
    }

    private showInfluencerBadge(influencer: any) {
      // Remove existing badge
      const existing = document.getElementById('twist-influencer-badge');
      if (existing) existing.remove();

      // Create badge
      const badge = document.createElement('div');
      badge.id = 'twist-influencer-badge';
      badge.innerHTML = `
        <div style="
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          padding: 16px;
          width: 300px;
          z-index: 9999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          animation: slideIn 0.3s ease-out;
        ">
          <style>
            @keyframes slideIn {
              from { transform: translateX(400px); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            #twist-stake-button:hover {
              background: #7c3aed !important;
              transform: scale(1.02);
            }
          </style>
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <img src="${chrome.runtime.getURL('assets/icon-32.png')}" style="width: 24px; height: 24px;">
            <div style="flex: 1;">
              <div style="font-weight: 600; color: #1f2937;">
                ${influencer.displayName} is on TWIST!
              </div>
              <div style="font-size: 12px; color: #6b7280;">
                ${influencer.metrics.stakerCount} people staking • ${influencer.metrics.apy}% APY
              </div>
            </div>
            <button id="twist-badge-close" style="
              background: none;
              border: none;
              font-size: 20px;
              color: #9ca3af;
              cursor: pointer;
              padding: 0;
              width: 24px;
              height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
            ">×</button>
          </div>
          <button id="twist-stake-button" style="
            width: 100%;
            background: #8b5cf6;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px;
            font-weight: 500;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
          ">
            Stake ${(Number(influencer.metrics.totalStaked) / 10 ** 9).toFixed(0)} TWIST
          </button>
        </div>
      `;

      document.body.appendChild(badge);

      // Add event listeners
      document.getElementById('twist-badge-close')?.addEventListener('click', () => {
        badge.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => badge.remove(), 300);
      });

      document.getElementById('twist-stake-button')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: MessageType.OPEN_STAKING_MODAL,
          payload: { influencer }
        });
      });

      // Auto-hide after 10 seconds
      setTimeout(() => {
        if (document.getElementById('twist-influencer-badge')) {
          badge.style.opacity = '0';
          badge.style.transition = 'opacity 0.3s';
          setTimeout(() => badge.remove(), 300);
        }
      }, 10000);
    }

    private initializeActivityTracking() {
      // Track user interactions
      const events = ['click', 'scroll', 'keypress', 'mousemove'];

      events.forEach(event => {
        document.addEventListener(event, this.throttle(() => {
          this.lastActivity = Date.now();
          this.bufferActivity(event);
        }, 1000));
      });

      // Track viewport time
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.trackViewportTime(entry.target);
          }
        });
      });

      // Observe main content elements
      setTimeout(() => {
        const contentElements = document.querySelectorAll('main, article, [role="main"]');
        contentElements.forEach(el => this.observer?.observe(el));
      }, 1000);

      // Send activity updates every 30 seconds
      setInterval(() => {
        if (this.activityBuffer.length > 0) {
          this.sendActivityUpdate();
        }
      }, 30000);
    }

    private initializeMessageHandlers() {
      // Handle messages from extension
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.type) {
          case MessageType.CHECK_ACTIVITY:
            sendResponse({
              isActive: Date.now() - this.lastActivity < 60000,
              lastActivity: this.lastActivity
            });
            break;

          case MessageType.GET_PAGE_INFO:
            sendResponse(this.getPageInfo());
            break;

          case MessageType.INJECT_WALLET:
            this.injectWalletInterface();
            break;
        }
      });

      // Handle messages from page
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        if (event.data.type === 'TWIST_ACTION') {
          chrome.runtime.sendMessage({
            type: MessageType.USER_ACTION,
            payload: event.data.payload
          });
        }
      });
    }

    private injectVAUDetector() {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject/vau-detector.js');
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    }

    private injectPublisherWidget() {
      // Check if publisher
      chrome.runtime.sendMessage({
        type: MessageType.CHECK_PUBLISHER
      }).then(publisher => {
        if (publisher?.verified) {
          const widget = document.createElement('div');
          widget.id = 'twist-publisher-widget';
          widget.innerHTML = `
            <div style="
              position: fixed;
              bottom: 20px;
              left: 20px;
              background: #8b5cf6;
              color: white;
              padding: 8px 16px;
              border-radius: 20px;
              font-size: 12px;
              z-index: 9998;
              display: flex;
              align-items: center;
              gap: 8px;
              box-shadow: 0 2px 10px rgba(139, 92, 246, 0.3);
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
              <img src="${chrome.runtime.getURL('assets/icon-16.png')}" style="width: 16px; height: 16px;">
              <span>Earning TWIST tokens on ${publisher.name}</span>
            </div>
          `;
          
          document.body.appendChild(widget);
          
          // Pulse animation
          widget.style.animation = 'pulse 2s infinite';
          const style = document.createElement('style');
          style.textContent = `
            @keyframes pulse {
              0% { opacity: 0.8; }
              50% { opacity: 1; }
              100% { opacity: 0.8; }
            }
          `;
          document.head.appendChild(style);
        }
      }).catch(() => {
        // Not a publisher or error checking
      });
    }

    private throttle(func: Function, limit: number) {
      let inThrottle: boolean;
      return function(this: any) {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
          func.apply(context, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    }

    private bufferActivity(type: string) {
      this.activityBuffer.push({
        type,
        timestamp: Date.now(),
        url: window.location.href
      });

      // Keep buffer size manageable
      if (this.activityBuffer.length > 100) {
        this.activityBuffer = this.activityBuffer.slice(-50);
      }
    }

    private sendActivityUpdate() {
      // Sanitize data before sending
      const sanitizedPayload = this.security.sanitizeData({
        activities: this.activityBuffer,
        pageTime: Date.now() - performance.timing.navigationStart,
        isVisible: document.visibilityState === 'visible'
      });

      chrome.runtime.sendMessage({
        type: MessageType.USER_ACTIVITY,
        payload: sanitizedPayload
      });

      this.activityBuffer = [];
    }

    private trackViewportTime(element: Element) {
      const startTime = Date.now();

      const checkVisibility = setInterval(() => {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

        if (!isVisible) {
          clearInterval(checkVisibility);
          const timeInView = Date.now() - startTime;

          this.bufferActivity('viewport_time');

          // Track content engagement
          if (timeInView > 10000) {
            chrome.runtime.sendMessage({
              type: MessageType.CONTENT_ENGAGED,
              payload: {
                selector: this.getElementSelector(element),
                timeInView
              }
            });
          }
        }
      }, 1000);
    }

    private getPageInfo() {
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        author: document.querySelector('meta[name="author"]')?.getAttribute('content'),
        publishedTime: document.querySelector('meta[property="article:published_time"]')?.getAttribute('content'),
        modifiedTime: document.querySelector('meta[property="article:modified_time"]')?.getAttribute('content'),
        wordCount: this.getWordCount(),
        hasVideo: document.querySelectorAll('video').length > 0,
        hasPaywall: this.detectPaywall()
      };
    }

    private getWordCount(): number {
      const text = document.body.innerText || '';
      return text.trim().split(/\s+/).length;
    }

    private detectPaywall(): boolean {
      const paywallIndicators = [
        'paywall',
        'subscription',
        'subscribe-wall',
        'premium-content',
        'locked-content'
      ];

      return paywallIndicators.some(indicator =>
        document.body.className.toLowerCase().includes(indicator) ||
        document.body.innerHTML.toLowerCase().includes(indicator)
      );
    }

    private getElementSelector(element: Element): string {
      if (element.id) return `#${element.id}`;
      if (element.className) return `.${element.className.split(' ')[0]}`;
      return element.tagName.toLowerCase();
    }

    private injectWalletInterface() {
      // Inject wallet connection interface for sites that request it
      const walletScript = document.createElement('script');
      walletScript.textContent = `
        window.TWIST = {
          isAvailable: true,
          version: '${chrome.runtime.getManifest().version}',
          async connectWallet() {
            return new Promise((resolve, reject) => {
              window.postMessage({ 
                type: 'TWIST_CONNECT_WALLET',
                id: Date.now()
              }, '*');
              
              const handler = (event) => {
                if (event.data.type === 'TWIST_WALLET_CONNECTED') {
                  window.removeEventListener('message', handler);
                  resolve(event.data.address);
                }
              };
              
              window.addEventListener('message', handler);
            });
          },
          async getBalance() {
            return new Promise((resolve) => {
              window.postMessage({ type: 'TWIST_GET_BALANCE' }, '*');
              
              const handler = (event) => {
                if (event.data.type === 'TWIST_BALANCE') {
                  window.removeEventListener('message', handler);
                  resolve(event.data.balance);
                }
              };
              
              window.addEventListener('message', handler);
            });
          }
        };
      `;

      document.head.appendChild(walletScript);
    }

    public cleanup() {
      if (this.influencerCheckInterval) {
        clearInterval(this.influencerCheckInterval);
      }
      if (this.observer) {
        this.observer.disconnect();
      }
    }
  }

  // Initialize content script with security sandbox
  const contentScript = new TwistContentScript(security);

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    contentScript.cleanup();
  });
})();