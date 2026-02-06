import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface PushNotificationState {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  subscription: PushSubscription | null;
  error: string | null;
}

interface NotificationOptions {
  onNotificationReceived?: (notification: any) => void;
  onNotificationClicked?: (notification: any) => void;
  autoSubscribe?: boolean;
}

export const usePushNotifications = (options: NotificationOptions = {}) => {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: 'default',
    isSubscribed: false,
    subscription: null,
    error: null,
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkSupport();
    checkPermission();
    checkSubscription();
    setupServiceWorker();
  }, []);

  const checkSupport = () => {
    const isSupported =
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window;

    setState(prev => ({ ...prev, isSupported }));
  };

  const checkPermission = () => {
    if ('Notification' in window) {
      setState(prev => ({ ...prev, permission: Notification.permission }));
    }
  };

  const checkSubscription = async () => {
    if (!state.isSupported) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      setState(prev => ({
        ...prev,
        isSubscribed: !!subscription,
        subscription,
      }));

      if (subscription && options.autoSubscribe) {
        await syncSubscription(subscription);
      }
    } catch (error: any) {
      console.error('Failed to check subscription:', error);
      setState(prev => ({ ...prev, error: error.message }));
    }
  };

  const setupServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      logger.log('Service Worker registered:', registration);

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              logger.log('New service worker available');
            }
          });
        }
      });

      // Handle messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'notification-received') {
          options.onNotificationReceived?.(event.data.notification);
        } else if (event.data.type === 'notification-clicked') {
          options.onNotificationClicked?.(event.data.notification);
        }
      });
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  };

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      setState(prev => ({ ...prev, error: 'Push notifications are not supported' }));
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission }));

      if (permission === 'granted') {
        return true;
      } else if (permission === 'denied') {
        setState(prev => ({
          ...prev,
          error: 'Push notification permission denied',
        }));
      }
      return false;
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message }));
      return false;
    }
  }, [state.isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      setState(prev => ({ ...prev, error: 'Push notifications are not supported' }));
      return false;
    }

    if (state.permission !== 'granted') {
      const granted = await requestPermission();
      if (!granted) return false;
    }

    setLoading(true);
    setState(prev => ({ ...prev, error: null }));

    try {
      const registration = await navigator.serviceWorker.ready;

      // Get VAPID public key from server
      const response = await api.getVapidPublicKey();
      const vapidPublicKey = urlBase64ToUint8Array(response.publicKey);

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });

      // Send subscription to server
      await api.subscribeToPushNotifications({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
          auth: arrayBufferToBase64(subscription.getKey('auth')),
        },
        platform: 'web',
        deviceInfo: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
        },
      });

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        subscription,
      }));

      // Show success notification
      await showNotification(
        'Notifications Enabled!',
        'You will now receive updates about your stakes and rewards.',
        {
          icon: '/logo192.png',
          badge: '/badge-72x72.png',
          tag: 'subscription-success',
        }
      );

      return true;
    } catch (error: any) {
      console.error('Failed to subscribe:', error);
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to subscribe to push notifications',
      }));
      return false;
    } finally {
      setLoading(false);
    }
  }, [state.isSupported, state.permission, requestPermission]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.subscription) return false;

    setLoading(true);
    setState(prev => ({ ...prev, error: null }));

    try {
      // Unsubscribe from push manager
      await state.subscription.unsubscribe();

      // Notify server
      await api.unsubscribeFromPushNotifications({
        endpoint: state.subscription.endpoint,
      });

      setState(prev => ({
        ...prev,
        isSubscribed: false,
        subscription: null,
      }));

      return true;
    } catch (error: any) {
      console.error('Failed to unsubscribe:', error);
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to unsubscribe from push notifications',
      }));
      return false;
    } finally {
      setLoading(false);
    }
  }, [state.subscription]);

  const showNotification = useCallback(
    async (
      title: string,
      body: string,
      options?: NotificationOptions & {
        icon?: string;
        badge?: string;
        image?: string;
        tag?: string;
        data?: any;
        actions?: NotificationAction[];
        requireInteraction?: boolean;
        silent?: boolean;
        vibrate?: number[];
      }
    ) => {
      if (!state.isSupported || state.permission !== 'granted') {
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
          body,
          ...options,
        });
      } catch (error) {
        console.error('Failed to show notification:', error);
      }
    },
    [state.isSupported, state.permission]
  );

  const syncSubscription = async (subscription: PushSubscription) => {
    try {
      await api.syncPushSubscription({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
          auth: arrayBufferToBase64(subscription.getKey('auth')),
        },
      });
    } catch (error) {
      console.error('Failed to sync subscription:', error);
    }
  };

  const updatePreferences = useCallback(async (preferences: {
    enabled?: boolean;
    types?: Record<string, boolean>;
    quietHours?: {
      enabled: boolean;
      start: number;
      end: number;
    };
    frequencyLimit?: {
      max: number;
      window: number;
    };
  }) => {
    try {
      await api.updateNotificationPreferences(preferences);
      return true;
    } catch (error) {
      console.error('Failed to update preferences:', error);
      return false;
    }
  }, []);

  const testNotification = useCallback(async () => {
    await showNotification(
      'Test Notification',
      'This is a test notification from Twist',
      {
        icon: '/logo192.png',
        badge: '/badge-72x72.png',
        tag: 'test',
        actions: [
          { action: 'view', title: 'View' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
        requireInteraction: true,
      }
    );
  }, [showNotification]);

  return {
    ...state,
    loading,
    requestPermission,
    subscribe,
    unsubscribe,
    showNotification,
    updatePreferences,
    testNotification,
  };
};

// Utility functions
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  
  const bytes = new Uint8Array(buffer);
  let binary = '';
  
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return window.btoa(binary);
}