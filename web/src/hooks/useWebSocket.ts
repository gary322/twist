import { useEffect, useState, useCallback, useRef } from 'react';
import { websocketService, RealtimeMetrics, Notification } from '../services/websocket';
import { useAuth } from './useAuth';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnected?: () => void;
  onDisconnected?: (reason: string) => void;
  onReconnectFailed?: () => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const { autoConnect = true, onConnected, onDisconnected, onReconnectFailed } = options;
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !autoConnect) return;

    websocketService.connect(token);

    const handleConnected = () => {
      setIsConnected(true);
      setConnectionError(null);
      onConnected?.();
    };

    const handleDisconnected = (reason: string) => {
      setIsConnected(false);
      onDisconnected?.(reason);
    };

    const handleReconnectFailed = () => {
      setConnectionError('Failed to connect to server');
      onReconnectFailed?.();
    };

    websocketService.on('connected', handleConnected);
    websocketService.on('disconnected', handleDisconnected);
    websocketService.on('reconnect_failed', handleReconnectFailed);

    // Check initial connection state
    setIsConnected(websocketService.isConnected());

    return () => {
      websocketService.off('connected', handleConnected);
      websocketService.off('disconnected', handleDisconnected);
      websocketService.off('reconnect_failed', handleReconnectFailed);
    };
  }, [token, autoConnect, onConnected, onDisconnected, onReconnectFailed]);

  const disconnect = useCallback(() => {
    websocketService.disconnect();
    setIsConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    if (token) {
      setConnectionError(null);
      websocketService.connect(token);
    }
  }, [token]);

  return {
    isConnected,
    connectionError,
    disconnect,
    reconnect,
  };
};

// Hook for real-time staking updates
export const useStakingUpdates = (influencerId?: string) => {
  const [stats, setStats] = useState<any>(null);
  const [recentStakes, setRecentStakes] = useState<any[]>([]);
  const [recentRewards, setRecentRewards] = useState<any>(null);

  useEffect(() => {
    if (!influencerId) return;

    websocketService.subscribeToStaking(influencerId);

    const handleNewStake = (data: any) => {
      setRecentStakes(prev => [data, ...prev].slice(0, 10));
    };

    const handleStats = (data: any) => {
      setStats(data);
    };

    const handleRewards = (data: any) => {
      setRecentRewards(data);
    };

    websocketService.on('staking:new_stake', handleNewStake);
    websocketService.on('staking:stats', handleStats);
    websocketService.on('staking:rewards', handleRewards);

    return () => {
      websocketService.unsubscribeFromStaking(influencerId);
      websocketService.off('staking:new_stake', handleNewStake);
      websocketService.off('staking:stats', handleStats);
      websocketService.off('staking:rewards', handleRewards);
    };
  }, [influencerId]);

  return {
    stats,
    recentStakes,
    recentRewards,
  };
};

// Hook for real-time content updates
export const useContentUpdates = (contentId?: string) => {
  const [views, setViews] = useState(0);
  const [conversions, setConversions] = useState(0);
  const [shares, setShares] = useState(0);

  useEffect(() => {
    if (!contentId) return;

    websocketService.subscribeToContent(contentId);

    const handleView = (data: any) => {
      if (data.contentId === contentId) {
        setViews(data.views);
      }
    };

    const handleConversion = (data: any) => {
      if (data.contentId === contentId) {
        setConversions(data.conversions);
      }
    };

    const handleShare = (data: any) => {
      if (data.contentId === contentId) {
        setShares(data.shares);
      }
    };

    websocketService.on('content:view', handleView);
    websocketService.on('content:conversion', handleConversion);
    websocketService.on('content:share', handleShare);

    return () => {
      websocketService.off('content:view', handleView);
      websocketService.off('content:conversion', handleConversion);
      websocketService.off('content:share', handleShare);
    };
  }, [contentId]);

  return {
    views,
    conversions,
    shares,
  };
};

// Hook for real-time analytics
export const useRealtimeAnalytics = () => {
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [hourlyData, setHourlyData] = useState<any>(null);

  useEffect(() => {
    websocketService.subscribeToAnalytics('dashboard');

    const handleRealtimeMetrics = (data: RealtimeMetrics) => {
      setMetrics(data);
    };

    const handleHourlyUpdate = (data: any) => {
      setHourlyData(data);
    };

    websocketService.on('analytics:realtime', handleRealtimeMetrics);
    websocketService.on('analytics:hourly', handleHourlyUpdate);

    return () => {
      websocketService.off('analytics:realtime', handleRealtimeMetrics);
      websocketService.off('analytics:hourly', handleHourlyUpdate);
    };
  }, []);

  return {
    metrics,
    hourlyData,
  };
};

// Hook for notifications
export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create notification sound
    audioRef.current = new Audio('/notification-sound.mp3');

    const handleNotification = (notification: Notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      
      // Play sound
      audioRef.current?.play().catch(() => {
        // Handle autoplay restrictions
      });

      // Show browser notification if permitted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/logo192.png',
        });
      }
    };

    const handleNotificationRead = (data: { id: string }) => {
      setNotifications(prev =>
        prev.map(n => n.id === data.id ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    };

    websocketService.on('notification', handleNotification);
    websocketService.on('notification:read', handleNotificationRead);

    return () => {
      websocketService.off('notification', handleNotification);
      websocketService.off('notification:read', handleNotificationRead);
    };
  }, []);

  const markAsRead = useCallback((notificationId: string) => {
    websocketService.markNotificationAsRead(notificationId);
  }, []);

  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  return {
    notifications,
    unreadCount,
    markAsRead,
    requestPermission,
  };
};

// Hook for system messages
export const useSystemMessages = () => {
  const [systemMessage, setSystemMessage] = useState<any>(null);
  const [maintenanceInfo, setMaintenanceInfo] = useState<any>(null);

  useEffect(() => {
    const handleSystemMessage = (data: any) => {
      setSystemMessage(data);
    };

    const handleMaintenanceMessage = (data: any) => {
      setMaintenanceInfo(data);
    };

    websocketService.on('system:message', handleSystemMessage);
    websocketService.on('system:maintenance', handleMaintenanceMessage);

    return () => {
      websocketService.off('system:message', handleSystemMessage);
      websocketService.off('system:maintenance', handleMaintenanceMessage);
    };
  }, []);

  return {
    systemMessage,
    maintenanceInfo,
  };
};