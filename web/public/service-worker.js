/* eslint-disable no-restricted-globals */

// Service Worker for Push Notifications
const CACHE_NAME = 'twist-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js',
  '/logo192.png',
  '/offline.html',
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      logger.log('Opened cache');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            logger.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }
      return fetch(event.request).catch(() => {
        // Return offline page for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
      });
    })
  );
});

// Push event - handle push notifications
self.addEventListener('push', (event) => {
  logger.log('Push notification received:', event);

  let data = {
    title: 'Twist Notification',
    body: 'You have a new notification',
    icon: '/logo192.png',
    badge: '/badge-72x72.png',
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/logo192.png',
    badge: data.badge || '/badge-72x72.png',
    image: data.image,
    tag: data.tag || 'default',
    data: data.data || {},
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false,
    vibrate: data.vibrate || [200, 100, 200],
    timestamp: data.timestamp || Date.now(),
    actions: data.actions || [],
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );

  // Track notification display
  if (data.data?.trackingId) {
    fetch('/api/notifications/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: data.data.trackingId,
        event: 'displayed',
      }),
    }).catch(() => {
      // Silently fail tracking
    });
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  logger.log('Notification clicked:', event);
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  // Handle action clicks
  if (event.action) {
    switch (event.action) {
      case 'view':
        url = data.viewUrl || '/dashboard';
        break;
      case 'explore':
        url = '/staking';
        break;
      case 'claim':
        url = '/portfolio?action=claim';
        break;
      case 'open':
        url = data.url || '/';
        break;
      default:
        url = data.actionUrl || '/';
    }
  } else if (data.url) {
    // Default click action
    url = data.url;
  }

  // Handle notification type specific actions
  if (data.type) {
    switch (data.type) {
      case 'staking_new_stake':
        url = `/staking/pool/${data.influencerId}`;
        break;
      case 'staking_rewards_distributed':
        url = '/portfolio?tab=rewards';
        break;
      case 'content_published':
        url = `/content/${data.contentId}`;
        break;
      case 'system':
        url = data.url || '/announcements';
        break;
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if needed
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );

  // Track notification click
  if (data.trackingId) {
    fetch('/api/notifications/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: data.trackingId,
        event: 'clicked',
        action: event.action || 'default',
      }),
    }).catch(() => {
      // Silently fail tracking
    });
  }
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  const data = event.notification.data || {};
  
  // Track notification dismissal
  if (data.trackingId) {
    fetch('/api/notifications/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: data.trackingId,
        event: 'dismissed',
      }),
    }).catch(() => {
      // Silently fail tracking
    });
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

async function syncNotifications() {
  try {
    const response = await fetch('/api/notifications/unread');
    const notifications = await response.json();
    
    // Show notifications that were missed while offline
    for (const notification of notifications) {
      await self.registration.showNotification(notification.title, {
        body: notification.body,
        icon: notification.icon || '/logo192.png',
        badge: '/badge-72x72.png',
        tag: notification.id,
        data: notification.data,
        timestamp: new Date(notification.createdAt).getTime(),
      });
    }
  } catch (error) {
    console.error('Failed to sync notifications:', error);
  }
}

// Periodic background sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-notifications') {
    event.waitUntil(checkForNewNotifications());
  }
});

async function checkForNewNotifications() {
  try {
    const response = await fetch('/api/notifications/check');
    const data = await response.json();
    
    if (data.hasNew) {
      // Show a summary notification
      await self.registration.showNotification('Twist Updates', {
        body: `You have ${data.count} new notifications`,
        icon: '/logo192.png',
        badge: '/badge-72x72.png',
        tag: 'summary',
        data: { url: '/notifications' },
      });
    }
  } catch (error) {
    console.error('Failed to check notifications:', error);
  }
}

// Message event for communication with app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type) {
    switch (event.data.type) {
      case 'SKIP_WAITING':
        self.skipWaiting();
        break;
      case 'CLIENTS_CLAIM':
        self.clients.claim();
        break;
      case 'CHECK_NOTIFICATIONS':
        event.waitUntil(checkForNewNotifications());
        break;
    }
  }
});