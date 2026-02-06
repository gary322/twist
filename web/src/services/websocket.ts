import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';

export interface RealtimeMetrics {
  activeUsers: number;
  recentConversions: number;
  liveRevenue: string;
  topContent: Array<{
    id: string;
    title: string;
    views: number;
  }>;
}

export interface StakingUpdate {
  type: 'new_stake' | 'unstake' | 'rewards' | 'stats';
  data: any;
}

export interface ContentUpdate {
  type: 'view' | 'conversion' | 'share';
  contentId: string;
  data: any;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  timestamp: string;
}

class WebSocketService extends EventEmitter {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscriptions = new Set<string>();

  connect(token: string) {
    if (this.socket?.connected) {
      return;
    }

    const wsUrl = process.env.REACT_APP_WS_URL || 'http://${process.env.API_HOST}';

    this.socket = io(`${wsUrl}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
    });

    this.setupEventHandlers();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.subscriptions.clear();
    }
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      logger.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
      
      // Re-subscribe to all previous subscriptions
      this.subscriptions.forEach(sub => {
        const [type, id] = sub.split(':');
        this.subscribe(type, id);
      });
    });

    this.socket.on('disconnect', (reason) => {
      logger.log('WebSocket disconnected:', reason);
      this.emit('disconnected', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emit('reconnect_failed');
      }
    });

    // Staking events
    this.socket.on('staking:new_stake', (data) => {
      this.emit('staking:new_stake', data);
    });

    this.socket.on('staking:unstake', (data) => {
      this.emit('staking:unstake', data);
    });

    this.socket.on('staking:rewards', (data) => {
      this.emit('staking:rewards', data);
    });

    this.socket.on('staking:stats', (data) => {
      this.emit('staking:stats', data);
    });

    // Content events
    this.socket.on('content:view', (data) => {
      this.emit('content:view', data);
    });

    this.socket.on('content:conversion', (data) => {
      this.emit('content:conversion', data);
    });

    this.socket.on('content:share', (data) => {
      this.emit('content:share', data);
    });

    // Analytics events
    this.socket.on('analytics:realtime', (data: RealtimeMetrics) => {
      this.emit('analytics:realtime', data);
    });

    this.socket.on('analytics:hourly', (data) => {
      this.emit('analytics:hourly', data);
    });

    this.socket.on('analytics:dashboard', (data) => {
      this.emit('analytics:dashboard', data);
    });

    // Notification events
    this.socket.on('notification', (data: Notification) => {
      this.emit('notification', data);
    });

    this.socket.on('notification:read', (data) => {
      this.emit('notification:read', data);
    });

    // System events
    this.socket.on('system:message', (data) => {
      this.emit('system:message', data);
    });

    this.socket.on('system:maintenance', (data) => {
      this.emit('system:maintenance', data);
    });
  }

  // Subscription methods
  subscribeToStaking(influencerId: string) {
    if (!this.socket?.connected) return;
    
    this.socket.emit('subscribe:staking', { influencerId });
    this.subscriptions.add(`staking:${influencerId}`);
  }

  unsubscribeFromStaking(influencerId: string) {
    if (!this.socket?.connected) return;
    
    this.socket.emit('unsubscribe:staking', { influencerId });
    this.subscriptions.delete(`staking:${influencerId}`);
  }

  subscribeToContent(contentId: string) {
    if (!this.socket?.connected) return;
    
    this.socket.emit('subscribe:content', { contentId });
    this.subscriptions.add(`content:${contentId}`);
  }

  subscribeToCampaign(campaignId: string) {
    if (!this.socket?.connected) return;
    
    this.socket.emit('subscribe:content', { campaignId });
    this.subscriptions.add(`campaign:${campaignId}`);
  }

  subscribeToAnalytics(type: string = 'dashboard') {
    if (!this.socket?.connected) return;
    
    this.socket.emit('subscribe:analytics', { type });
    this.subscriptions.add(`analytics:${type}`);
  }

  // Action methods
  markNotificationAsRead(notificationId: string) {
    if (!this.socket?.connected) return;
    
    this.socket.emit('notification:markRead', { notificationId });
  }

  // Admin methods
  broadcastSystemMessage(message: any) {
    if (!this.socket?.connected) return;
    
    this.socket.emit('admin:broadcast', {
      type: 'system',
      message,
    });
  }

  broadcastMaintenanceMessage(message: any) {
    if (!this.socket?.connected) return;
    
    this.socket.emit('admin:broadcast', {
      type: 'maintenance',
      message,
    });
  }

  // Helper methods
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  private subscribe(type: string, id: string) {
    switch (type) {
      case 'staking':
        this.subscribeToStaking(id);
        break;
      case 'content':
        this.subscribeToContent(id);
        break;
      case 'campaign':
        this.subscribeToCampaign(id);
        break;
      case 'analytics':
        this.subscribeToAnalytics(id);
        break;
    }
  }
}

export const websocketService = new WebSocketService();