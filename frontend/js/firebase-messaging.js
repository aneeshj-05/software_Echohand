/**
 * ECHOHAND - Firebase Cloud Messaging (FCM) Client Module
 * Manages notification permissions, FCM device tokens, Service Worker registration,
 * and backend token association for emergency contacts.
 */

(function () {
  'use strict';

  let messagingInstance = null;
  let swRegistration = null;
  let currentToken = null;

  // Use relative URLs on HTTP/HTTPS so ngrok and same-origin ports always work
  const API_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:')
    ? 'http://127.0.0.1:5000'
    : '';

  /**
   * Check if push notifications and service workers are supported.
   */
  function isSupported() {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      typeof firebase !== 'undefined'
    );
  }

  /**
   * Get current Notification permission status ('default', 'granted', 'denied').
   */
  function getPermissionStatus() {
    return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  }

  /**
   * Initialize Firebase client and register Service Worker.
   */
  async function init() {
    if (!isSupported()) {
      console.warn('[EchoHand FCM] Push notifications not fully supported in this browser environment.');
      return false;
    }

    try {
      // 1. Fetch latest runtime config from backend
      if (window.EchoHandFetchFirebaseConfig) {
        await window.EchoHandFetchFirebaseConfig();
      }

      const config = window.EchoHandFirebaseConfig || {};
      const validation = window.EchoHandValidateFirebaseConfig
        ? window.EchoHandValidateFirebaseConfig(config)
        : { isValid: Boolean(config.apiKey && config.projectId), missingFields: [] };

      if (!validation.isValid) {
        console.warn(
          '[EchoHand FCM] Firebase client configuration is incomplete or missing. Required fields:',
          validation.missingFields
        );
        return false;
      }

      // 2. Initialize Firebase client app if not already initialized
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      messagingInstance = firebase.messaging();

      // 3. Register Service Worker
      swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });
      console.log('[EchoHand FCM] Service Worker registered with scope:', swRegistration.scope);

      // Pass configuration to active Service Worker
      if (swRegistration.active) {
        swRegistration.active.postMessage({ type: 'SET_CONFIG', config: config });
      }

      // 4. Listen for foreground notifications
      messagingInstance.onMessage(payload => {
        console.log('[EchoHand FCM] Foreground notification received:', payload);
        handleForegroundAlert(payload);
      });

      return true;
    } catch (err) {
      console.error('[EchoHand FCM] Initialization error:', err);
      return false;
    }
  }

  /**
   * Request user permission and obtain FCM device token.
   */
  async function requestToken() {
    if (!isSupported()) {
      throw new Error('Push notifications are not supported in this browser.');
    }

    // Refresh configuration from backend
    if (window.EchoHandFetchFirebaseConfig) {
      await window.EchoHandFetchFirebaseConfig();
    }

    const config = window.EchoHandFirebaseConfig || {};
    const validation = window.EchoHandValidateFirebaseConfig
      ? window.EchoHandValidateFirebaseConfig(config)
      : { isValid: Boolean(config.apiKey && config.projectId), missingFields: [] };

    if (!validation.isValid) {
      const missingList = validation.missingFields && validation.missingFields.length
        ? validation.missingFields.join(', ')
        : 'apiKey, projectId, messagingSenderId, appId, vapidKey';
      throw new Error(
        `Firebase Web Push is not configured yet. Missing or placeholder fields: [${missingList}]. ` +
        `Please configure your Firebase Web App credentials in backend/.env.`
      );
    }

    if (!messagingInstance || !swRegistration) {
      const initialized = await init();
      if (!initialized) {
        throw new Error('Failed to initialize Firebase Messaging with the provided configuration.');
      }
    }

    // Request browser notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission was denied. Please allow notifications in your browser settings.');
    }

    const vapidKey = config.vapidKey;

    try {
      const tokenOptions = {
        serviceWorkerRegistration: swRegistration
      };
      if (vapidKey) {
        tokenOptions.vapidKey = vapidKey;
      }

      const token = await messagingInstance.getToken(tokenOptions);
      if (!token) {
        throw new Error('Unable to retrieve FCM registration token from Firebase.');
      }

      currentToken = token;
      localStorage.setItem('echohand_fcm_token', token);
      return token;
    } catch (err) {
      console.error('[EchoHand FCM] Error getting device token:', err);

      const errMsg = err.message || '';
      if (errMsg.includes('INVALID_ARGUMENT') || errMsg.includes('API key not valid')) {
        throw new Error(
          'Invalid Firebase Web API key. Please check FIREBASE_API_KEY in backend/.env matches your Firebase Console Web App.'
        );
      } else if (errMsg.includes('installations/request-failed')) {
        throw new Error(
          'Firebase Installations failed. Please verify FIREBASE_PROJECT_ID, FIREBASE_APP_ID, and FIREBASE_API_KEY in backend/.env.'
        );
      }
      throw err;
    }
  }

  /**
   * Register the device FCM token with the backend.
   * Options can specify: { contactId: number, inviteToken: string }
   */
  async function registerWithBackend(options = {}) {
    const token = await requestToken();

    const headers = { 'Content-Type': 'application/json' };
    const authToken = localStorage.getItem('echohand_token');
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const bodyPayload = {
      fcm_token: token,
      contact_id: options.contactId || null,
      invite_token: options.inviteToken || null
    };

    const response = await fetch(`${API_BASE}/api/notifications/register`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(bodyPayload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to register notification token on server.');
    }

    return data;
  }

  /**
   * Generate an invite token/link for an emergency contact.
   */
  async function generateInviteLink(contactId) {
    const authToken = localStorage.getItem('echohand_token');
    if (!authToken) {
      throw new Error('Please log in to generate contact registration links.');
    }

    const response = await fetch(`${API_BASE}/api/notifications/invite-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ contact_id: contactId })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to generate invite link.');
    }

    const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
    const inviteUrl = `${origin}/dashboard.html?invite=${encodeURIComponent(data.invite_token)}`;
    return {
      inviteToken: data.invite_token,
      inviteUrl: inviteUrl,
      contactId: data.contact_id
    };
  }

  /**
   * Verify an invite token from the URL query params.
   */
  async function verifyInviteToken(token) {
    const response = await fetch(`${API_BASE}/api/notifications/verify-invite?token=${encodeURIComponent(token)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Invalid or expired invite token.');
    }
    return data;
  }

  /**
   * Handle incoming alert when page is active in foreground.
   */
  function handleForegroundAlert(payload) {
    const notif = payload.notification || {};
    const data = payload.data || {};
    const title = notif.title || data.title || '🚨 Emergency Alert';
    const body = notif.body || data.body || 'Immediate assistance may be required.';

    // Show toast if EchoHand toast is available
    if (window.EchoHand?.showToast) {
      window.EchoHand.showToast(`${title}: ${body}`, 'crimson', 8000);
    }

    // Play speech alert if speech module is active
    if (window.EchoHandSpeech?.speak) {
      window.EchoHandSpeech.speak('Emergency alert received.');
    }

    // Display browser notification if granted
    if (Notification.permission === 'granted' && swRegistration) {
      swRegistration.showNotification(title, {
        body: body,
        icon: '/favicon.ico',
        tag: 'echohand-emergency-alert',
        requireInteraction: true,
        data: data
      });
    }
  }

  // Auto-init when document is ready
  document.addEventListener('DOMContentLoaded', () => {
    init();
  });

  // Expose public API
  window.EchoHandFCM = {
    init,
    isSupported,
    getPermissionStatus,
    requestToken,
    registerWithBackend,
    generateInviteLink,
    verifyInviteToken,
    getStoredToken: () => currentToken || localStorage.getItem('echohand_fcm_token')
  };

})();
