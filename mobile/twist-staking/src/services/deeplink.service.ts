import { Linking, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { NavigationContainerRef } from '@react-navigation/native';

export interface DeeplinkParams {
  action: 'stake' | 'claim' | 'view' | 'portfolio' | 'influencer';
  influencerId?: string;
  amount?: string;
  source?: string;
}

export class DeeplinkService {
  private navigation: NavigationContainerRef<any> | null = null;
  private initialUrl: string | null = null;

  constructor() {
    this.setupDeeplinks();
  }

  setNavigation(navigation: NavigationContainerRef<any>) {
    this.navigation = navigation;
    
    // Handle initial URL if app was opened via deeplink
    if (this.initialUrl) {
      this.handleDeeplink(this.initialUrl);
      this.initialUrl = null;
    }
  }

  private setupDeeplinks() {
    // Handle deeplinks when app is already open
    Linking.addEventListener('url', this.handleUrlEvent);

    // Handle deeplinks when app is launched
    Linking.getInitialURL().then(url => {
      if (url) {
        if (this.navigation) {
          this.handleDeeplink(url);
        } else {
          this.initialUrl = url;
        }
      }
    });

    // Handle notification deeplinks
    Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data.deeplink) {
        this.handleDeeplink(data.deeplink as string);
      }
    });
  }

  private handleUrlEvent = (event: { url: string }) => {
    this.handleDeeplink(event.url);
  };

  private handleDeeplink(url: string) {
    const params = this.parseDeeplink(url);
    if (!params) return;

    if (!this.navigation) {
      this.initialUrl = url;
      return;
    }

    switch (params.action) {
      case 'stake':
        this.handleStakeDeeplink(params);
        break;
      case 'claim':
        this.handleClaimDeeplink(params);
        break;
      case 'view':
        this.handleViewDeeplink(params);
        break;
      case 'portfolio':
        this.handlePortfolioDeeplink();
        break;
      case 'influencer':
        this.handleInfluencerDeeplink(params);
        break;
    }
  }

  private parseDeeplink(url: string): DeeplinkParams | null {
    try {
      // Handle different URL schemes
      // twist://stake/influencer123?amount=1000
      // https://twist.to/stake/influencer123?amount=1000
      
      const urlObj = new URL(url.replace('twist://', 'https://twist.to/'));
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (pathParts.length === 0) return null;

      const action = pathParts[0] as DeeplinkParams['action'];
      const influencerId = pathParts[1];
      const params = Object.fromEntries(urlObj.searchParams);

      return {
        action,
        influencerId,
        amount: params.amount,
        source: params.source || 'deeplink',
      };
    } catch (error) {
      console.error('Failed to parse deeplink:', error);
      return null;
    }
  }

  private handleStakeDeeplink(params: DeeplinkParams) {
    if (!params.influencerId) {
      this.navigation?.navigate('Staking');
      return;
    }

    // Navigate to staking screen with pre-filled data
    this.navigation?.navigate('Staking', {
      screen: 'StakingList',
      params: {
        influencerId: params.influencerId,
        prefilledAmount: params.amount,
        showStakeModal: true,
      },
    });

    // Track deeplink usage
    this.trackDeeplinkUsage('stake', params);
  }

  private handleClaimDeeplink(params: DeeplinkParams) {
    if (!params.influencerId) {
      this.navigation?.navigate('Portfolio');
      return;
    }

    // Navigate to portfolio and trigger claim
    this.navigation?.navigate('Portfolio', {
      claimInfluencerId: params.influencerId,
    });

    this.trackDeeplinkUsage('claim', params);
  }

  private handleViewDeeplink(params: DeeplinkParams) {
    if (!params.influencerId) return;

    this.navigation?.navigate('Staking', {
      screen: 'InfluencerDetails',
      params: {
        influencerId: params.influencerId,
      },
    });

    this.trackDeeplinkUsage('view', params);
  }

  private handlePortfolioDeeplink() {
    this.navigation?.navigate('Portfolio');
    this.trackDeeplinkUsage('portfolio', {});
  }

  private handleInfluencerDeeplink(params: DeeplinkParams) {
    if (!params.influencerId) return;

    this.navigation?.navigate('Staking', {
      screen: 'StakingList',
      params: {
        searchQuery: params.influencerId,
      },
    });

    this.trackDeeplinkUsage('influencer', params);
  }

  private trackDeeplinkUsage(action: string, params: any) {
    // Track analytics
    logger.log('Deeplink used:', { action, ...params });
  }

  // Public methods for generating deeplinks
  static generateStakeLink(influencerId: string, amount?: number): string {
    const base = 'https://twist.to/stake';
    const url = `${base}/${influencerId}`;
    return amount ? `${url}?amount=${amount}` : url;
  }

  static generateClaimLink(influencerId: string): string {
    return `https://twist.to/claim/${influencerId}`;
  }

  static generateInfluencerLink(influencerId: string): string {
    return `https://twist.to/view/${influencerId}`;
  }

  static generatePortfolioLink(): string {
    return 'https://twist.to/portfolio';
  }

  // Share functionality
  static async shareInfluencer(influencer: any) {
    const { Share } = await import('react-native');
    
    const link = this.generateInfluencerLink(influencer.id);
    const message = `Check out ${influencer.displayName} on TWIST! They have ${influencer.metrics.stakerCount} stakers and ${influencer.metrics.apy.toFixed(1)}% APY. Stake now: ${link}`;

    try {
      await Share.share({
        message,
        url: link,
        title: `Stake on ${influencer.displayName}`,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share');
    }
  }

  // QR Code generation for deeplinks
  static getQRCodeUrl(deeplink: string): string {
    const encoded = encodeURIComponent(deeplink);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`;
  }

  cleanup() {
    Linking.removeEventListener('url', this.handleUrlEvent);
  }
}