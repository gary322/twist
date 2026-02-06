import { NavigateFunction } from 'react-router-dom';

export interface DeeplinkParams {
  action?: string;
  id?: string;
  referrer?: string;
  promo?: string;
  campaign?: string;
  [key: string]: string | undefined;
}

class DeeplinkService {
  private navigate: NavigateFunction | null = null;
  private pendingDeeplink: string | null = null;

  // Initialize with navigation function
  initialize(navigate: NavigateFunction) {
    this.navigate = navigate;
    
    // Process any pending deeplink
    if (this.pendingDeeplink) {
      this.handleDeeplink(this.pendingDeeplink);
      this.pendingDeeplink = null;
    }

    // Listen for deeplinks
    this.setupListeners();
  }

  private setupListeners() {
    // Handle initial deeplink from URL
    this.handleInitialDeeplink();

    // Handle browser back/forward navigation
    window.addEventListener('popstate', () => {
      this.handleCurrentUrl();
    });

    // Handle custom protocol links (twist://)
    if ('registerProtocolHandler' in navigator) {
      try {
        navigator.registerProtocolHandler(
          'web+twist',
          `${window.location.origin}/?deeplink=%s`,
          'Twist Protocol Handler'
        );
      } catch (error) {
        console.error('Failed to register protocol handler:', error);
      }
    }

    // Handle app links from notifications
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'navigate' && event.data?.url) {
        this.handleDeeplink(event.data.url);
      }
    });
  }

  private handleInitialDeeplink() {
    const urlParams = new URLSearchParams(window.location.search);
    const deeplink = urlParams.get('deeplink');
    const action = urlParams.get('action');
    
    if (deeplink) {
      this.handleDeeplink(decodeURIComponent(deeplink));
    } else if (action) {
      this.handleActionLink(action, Object.fromEntries(urlParams));
    } else {
      // Check if current path is a deeplink
      this.handleCurrentUrl();
    }
  }

  private handleCurrentUrl() {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    
    // Map common paths to deeplink actions
    const pathMappings: Record<string, string> = {
      '/stake': 'staking',
      '/portfolio': 'portfolio',
      '/influencer': 'influencer',
      '/content': 'content',
    };

    for (const [pathPrefix, action] of Object.entries(pathMappings)) {
      if (path.startsWith(pathPrefix)) {
        const id = path.split('/')[2];
        this.handleActionLink(action, { id, ...Object.fromEntries(params) });
        break;
      }
    }
  }

  handleDeeplink(url: string) {
    if (!this.navigate) {
      this.pendingDeeplink = url;
      return;
    }

    try {
      const parsed = this.parseDeeplink(url);
      this.routeToDestination(parsed);
    } catch (error) {
      console.error('Failed to handle deeplink:', error);
    }
  }

  private parseDeeplink(url: string): DeeplinkParams {
    // Handle different URL formats
    let cleanUrl = url;
    
    // Remove protocol if present
    cleanUrl = cleanUrl.replace(/^(twist:\/\/|web\+twist:\/\/|https?:\/\/[^\/]+)/, '');
    
    // Parse path and query
    const [path, query] = cleanUrl.split('?');
    const segments = path.split('/').filter(Boolean);
    const params = new URLSearchParams(query || '');
    
    // Determine action from path
    const action = segments[0] || 'home';
    const id = segments[1];
    
    return {
      action,
      id,
      ...Object.fromEntries(params),
    };
  }

  private handleActionLink(action: string, params: DeeplinkParams) {
    this.routeToDestination({ action, ...params });
  }

  private routeToDestination(params: DeeplinkParams) {
    if (!this.navigate) return;

    const { action, id, ...queryParams } = params;
    
    switch (action) {
      // Staking Actions
      case 'stake':
      case 'staking':
        if (id) {
          this.navigate(`/staking/influencer/${id}`);
        } else if (params.username) {
          this.navigate(`/staking/influencer/${params.username}`);
        } else {
          this.navigate('/staking');
        }
        break;
        
      case 'portfolio':
        if (params.tab) {
          this.navigate(`/portfolio?tab=${params.tab}`);
        } else if (params.highlight) {
          this.navigate(`/portfolio?highlight=${params.highlight}`);
        } else {
          this.navigate('/portfolio');
        }
        break;
        
      case 'claim':
        this.navigate('/portfolio?action=claim');
        break;
        
      // Influencer Actions
      case 'influencer':
        if (id) {
          this.navigate(`/influencer/${id}`);
        } else if (params.username) {
          this.navigate(`/influencer/${params.username}`);
        } else {
          this.navigate('/influencer/dashboard');
        }
        break;
        
      case 'content':
        if (id) {
          this.navigate(`/content/${id}`);
        } else if (params.campaign) {
          this.navigate(`/content?campaign=${params.campaign}`);
        } else {
          this.navigate('/content');
        }
        break;
        
      // Authentication
      case 'login':
        this.navigate(`/login?${this.buildQueryString(queryParams)}`);
        break;
        
      case 'register':
      case 'signup':
        this.navigate(`/register?${this.buildQueryString(queryParams)}`);
        break;
        
      case 'verify':
        if (params.token) {
          this.navigate(`/verify-email?token=${params.token}`);
        }
        break;
        
      // Settings
      case 'settings':
        if (params.section) {
          this.navigate(`/settings/${params.section}`);
        } else {
          this.navigate('/settings');
        }
        break;
        
      case 'notifications':
        this.navigate('/settings/notifications');
        break;
        
      // Marketing/Campaign Links
      case 'promo':
      case 'campaign':
        if (params.code || params.promo) {
          this.navigate(`/staking?promo=${params.code || params.promo}`);
        } else if (params.campaign) {
          this.navigate(`/campaign/${params.campaign}`);
        }
        break;
        
      // Special Actions
      case 'referral':
        if (params.code) {
          // Store referral code
          localStorage.setItem('referralCode', params.code);
          this.navigate('/register?ref=' + params.code);
        }
        break;
        
      case 'invite':
        if (params.code) {
          this.navigate(`/invite/${params.code}`);
        }
        break;
        
      // Default
      case 'home':
      default:
        this.navigate('/');
        break;
    }
    
    // Track deeplink usage
    this.trackDeeplinkUsage(action, params);
  }

  private buildQueryString(params: Record<string, string | undefined>): string {
    const filtered = Object.entries(params)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`);
    
    return filtered.length > 0 ? filtered.join('&') : '';
  }

  private trackDeeplinkUsage(action: string, params: DeeplinkParams) {
    // Send analytics event
    if (window.gtag) {
      window.gtag('event', 'deeplink_opened', {
        deeplink_action: action,
        deeplink_source: params.referrer || 'direct',
        deeplink_campaign: params.campaign,
      });
    }
  }

  // Generate deeplinks
  generateDeeplink(
    action: string,
    params?: Record<string, string | number | boolean>
  ): string {
    const baseUrl = window.location.origin;
    const queryParams = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [key, value]) => {
        acc[key] = String(value);
        return acc;
      }, {} as Record<string, string>)
    ).toString() : '';
    
    return `${baseUrl}/${action}${queryParams}`;
  }

  generateShareableLink(
    type: 'stake' | 'content' | 'referral',
    id: string,
    additionalParams?: Record<string, string>
  ): string {
    const params = {
      ...additionalParams,
      utm_source: 'share',
      utm_medium: 'link',
    };
    
    switch (type) {
      case 'stake':
        return this.generateDeeplink(`stake/${id}`, params);
      case 'content':
        return this.generateDeeplink(`content/${id}`, params);
      case 'referral':
        return this.generateDeeplink('referral', { code: id, ...params });
      default:
        return this.generateDeeplink('', params);
    }
  }

  // QR Code generation for deeplinks
  async generateQRCode(
    deeplink: string,
    options: {
      size?: number;
      logo?: boolean;
      color?: string;
    } = {}
  ): Promise<string> {
    const { size = 256, logo = true, color = '#805ad5' } = options;
    
    try {
      const response = await fetch('/api/qrcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: deeplink,
          size,
          logo,
          color,
        }),
      });
      
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      throw error;
    }
  }

  // Social sharing with deeplinks
  shareDeeplink(
    deeplink: string,
    platform: 'twitter' | 'facebook' | 'whatsapp' | 'telegram' | 'copy',
    options: {
      title?: string;
      description?: string;
    } = {}
  ) {
    const { title = 'Check this out on Twist!', description = '' } = options;
    const encodedUrl = encodeURIComponent(deeplink);
    const encodedText = encodeURIComponent(`${title} ${description}`.trim());
    
    switch (platform) {
      case 'twitter':
        window.open(
          `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
          '_blank'
        );
        break;
        
      case 'facebook':
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
          '_blank'
        );
        break;
        
      case 'whatsapp':
        window.open(
          `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
          '_blank'
        );
        break;
        
      case 'telegram':
        window.open(
          `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
          '_blank'
        );
        break;
        
      case 'copy':
      default:
        navigator.clipboard.writeText(deeplink).then(() => {
          // Show success message
          const event = new CustomEvent('deeplink:copied', { detail: deeplink });
          window.dispatchEvent(event);
        });
        break;
    }
  }
}

export const deeplinkService = new DeeplinkService();

// React hook for using deeplinks
export const useDeeplink = () => {
  const generateLink = (action: string, params?: Record<string, string | number | boolean>) => {
    return deeplinkService.generateDeeplink(action, params);
  };

  const generateShareLink = (
    type: 'stake' | 'content' | 'referral',
    id: string,
    params?: Record<string, string>
  ) => {
    return deeplinkService.generateShareableLink(type, id, params);
  };

  const share = (
    deeplink: string,
    platform: 'twitter' | 'facebook' | 'whatsapp' | 'telegram' | 'copy',
    options?: { title?: string; description?: string }
  ) => {
    deeplinkService.shareDeeplink(deeplink, platform, options);
  };

  return {
    generateLink,
    generateShareLink,
    share,
  };
};