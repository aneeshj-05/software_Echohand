/**
 * ECHOHAND - Firebase Cloud Messaging Service Worker
 * Build: 20260408 — keep in sync with ECHOHAND_FCM_SW_VERSION in firebase-config.js
 */

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
    const body = notif.body || data.body || 'Emergency assistance is required.';

    const mapsUrl = data.maps_url || (
      data.latitude && data.longitude
        ? `https://www.google.com/maps?q=${data.latitude},${data.longitude}`
        : ''
    );

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
      return null;
    }
  } else if (!config.apiKey || !config.projectId) {
    return null;
  }

  try {
    const appOptions = self.EchoHandToFirebaseAppOptions
      ? self.EchoHandToFirebaseAppOptions(config)
      : config;
    if (!firebase.apps.length) {
      firebase.initializeApp(appOptions);
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

async function loadConfigFromBackend() {
  if (typeof self.EchoHandFetchFirebaseConfig !== 'function') {
    return null;
  }
  try {
    return await self.EchoHandFetchFirebaseConfig();
  } catch (_) {
    return null;
  }
}

function applyConfigFromClient(config, replyPort) {
  if (config && typeof config === 'object') {
    self.EchoHandFirebaseConfig = Object.assign({}, self.EchoHandFirebaseConfig || {}, config);
  }
  const ok = Boolean(tryInitFirebase(self.EchoHandFirebaseConfig));
  if (replyPort) {
    replyPort.postMessage({ type: 'CONFIG_APPLIED', ok: ok });
  }
  return ok;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await loadConfigFromBackend();
      tryInitFirebase(self.EchoHandFirebaseConfig);
    })()
  );
});

self.addEventListener('message', event => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SET_CONFIG') {
    const replyPort = (data.expectAck && event.ports && event.ports[0]) ? event.ports[0] : null;
    applyConfigFromClient(data.config, replyPort);
  } else if (data.type === 'FETCH_CONFIG') {
    event.waitUntil(
      loadConfigFromBackend().then(cfg => {
        tryInitFirebase(cfg || self.EchoHandFirebaseConfig);
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({
            type: 'CONFIG_FETCHED',
            ok: Boolean(messagingInstance),
            isConfigured: Boolean(self.EchoHandFirebaseConfig && self.EchoHandFirebaseConfig.isConfigured)
          });
        }
      })
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  let targetUrl = '/dashboard.html';
  if ((action === 'open_maps' || !action) && data.maps_url) {
    targetUrl = data.maps_url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url && client.url.includes('dashboard') && 'focus' in client) {
          if (targetUrl.startsWith('http') && targetUrl.includes('google.com/maps')) {
            return clients.openWindow(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
