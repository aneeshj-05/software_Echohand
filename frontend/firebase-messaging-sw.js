/**
 * ECHOHAND - Firebase Cloud Messaging Service Worker
 * Handles background push notifications, emergency alerts, and click routing.
 */

// Import Firebase compat libraries inside Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');
importScripts('/js/firebase-config.js');

let messagingInstance = null;

function setupBackgroundMessaging(messaging) {
  if (!messaging) return;

  messaging.onBackgroundMessage(payload => {
    console.log('[EchoHand SW] Background notification received:', payload);

    const data = payload.data || {};
    const notif = payload.notification || {};

    const title = notif.title || data.title || '🚨 EchoHand Emergency Alert';
    const body = notif.body || data.body || 'Emergency alert triggered. Immediate assistance may be required.';

    const mapsUrl = data.maps_url || (data.latitude && data.longitude ? `https://www.google.com/maps?q=${data.latitude},${data.longitude}` : '');

    const notificationOptions = {
      body: body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'echohand-emergency-alert',
      requireInteraction: true,
      renotify: true,
      vibrate: [300, 100, 300, 100, 500],
      data: {
        maps_url: mapsUrl,
        source: data.source || 'alert',
        user_name: data.user_name || 'EchoHand User',
        timestamp: Date.now()
      },
      actions: mapsUrl ? [
        { action: 'open_maps', title: '📍 Open Map' },
        { action: 'open_app', title: '✋ Open EchoHand' }
      ] : [
        { action: 'open_app', title: '✋ Open EchoHand' }
      ]
    };

    return self.registration.showNotification(title, notificationOptions);
  });
}

function tryInitFirebase(config) {
  if (messagingInstance) return messagingInstance;
  if (!config) return null;

  const validator = self.EchoHandValidateFirebaseConfig;
  if (validator) {
    const res = validator(config);
    if (!res.isValid) {
      console.warn('[EchoHand SW] Firebase Web Push not configured yet. Required fields missing:', res.missingFields);
      return null;
    }
  } else if (!config.apiKey || !config.projectId) {
    return null;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }
    messagingInstance = firebase.messaging();
    setupBackgroundMessaging(messagingInstance);
    console.log('[EchoHand SW] Firebase Messaging initialized successfully.');
    return messagingInstance;
  } catch (err) {
    console.error('[EchoHand SW] Firebase Messaging initialization failed:', err);
    return null;
  }
}

// Lifecycle events
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Try to initialize using config already in scope or fetch from backend
      if (!messagingInstance) {
        if (self.EchoHandFirebaseConfig && tryInitFirebase(self.EchoHandFirebaseConfig)) {
          return;
        }
        if (typeof fetch === 'function') {
          try {
            const res = await fetch('/api/notifications/config', { headers: { 'Accept': 'application/json' } });
            if (res.ok) {
              const data = await res.json();
              if (data && data.is_configured && data.config) {
                self.EchoHandFirebaseConfig = Object.assign({}, self.EchoHandFirebaseConfig || {}, data.config);
                tryInitFirebase(self.EchoHandFirebaseConfig);
              }
            }
          } catch (_) {}
        }
      }
    })()
  );
});

// Receive live configuration from active client pages
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SET_CONFIG' && event.data.config) {
    self.EchoHandFirebaseConfig = Object.assign({}, self.EchoHandFirebaseConfig || {}, event.data.config);
    tryInitFirebase(self.EchoHandFirebaseConfig);
  }
});

// Initial synchronous attempt with current scope config
tryInitFirebase(self.EchoHandFirebaseConfig);

// Notification click interaction handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  let targetUrl = '/dashboard.html';
  if (action === 'open_maps' && data.maps_url) {
    targetUrl = data.maps_url;
  } else if (data.maps_url) {
    targetUrl = data.maps_url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing EchoHand window if open
      for (const client of clientList) {
        if (client.url && client.url.includes('dashboard') && 'focus' in client) {
          if (targetUrl.startsWith('http') && targetUrl.includes('google.com/maps')) {
            return clients.openWindow(targetUrl);
          }
          return client.focus();
        }
      }
      // If no window open, open target URL
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
