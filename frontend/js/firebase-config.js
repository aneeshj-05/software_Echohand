/**
 * ECHOHAND - Firebase Client Configuration
 * Client-side configuration for the EchoHand Web Push / Firebase Cloud Messaging app.
 *
 * NOTE: Client-side Firebase configuration values (apiKey, appId, etc.) are public
 * identifiers and NEVER equivalent to Firebase Admin private keys.
 * NEVER place the Firebase Admin service-account private key in frontend code.
 */

(function () {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {});

  // Known placeholder tokens to detect unconfigured Firebase credentials
  const PLACEHOLDER_TOKENS = [
    'dummy', 'placeholder', 'your-', 'aizasydummy',
    '123456789012', 'abcdef1234567890', 'beldummy',
    'your-project-id', 'your-messaging-sender-id', 'your-vapid-key',
    'echohand-emergency'
  ];

  const APP_ID_PATTERN = /^1:\d+:web:[0-9a-fA-F]+$/;

  /**
   * Validates whether a Firebase client configuration object has real, non-placeholder credentials.
   * @param {Object} cfg
   * @returns {{ isValid: boolean, isPlaceholder: boolean, missingFields: string[] }}
   */
  function validateFirebaseConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      return { isValid: false, isPlaceholder: true, missingFields: ['apiKey', 'projectId', 'messagingSenderId', 'appId', 'vapidKey'] };
    }

    const requiredKeys = ['apiKey', 'projectId', 'messagingSenderId', 'appId', 'vapidKey'];
    const missing = [];

    requiredKeys.forEach(key => {
      const val = String(cfg[key] || '').trim();
      if (!val) {
        missing.push(key);
      } else {
        const valLower = val.toLowerCase();
        if (val.includes('...')) {
          missing.push(key);
        } else if (PLACEHOLDER_TOKENS.some(token => valLower === token || valLower.includes(token) && key !== 'messagingSenderId')) {
          missing.push(key);
        } else if (key === 'apiKey' && (!val.startsWith('AIzaSy') || val.length < 30)) {
          missing.push(key);
        } else if (key === 'appId' && !APP_ID_PATTERN.test(val)) {
          missing.push(key);
        } else if (key === 'messagingSenderId' && !/^\d+$/.test(val)) {
          missing.push(key);
        } else if (key === 'vapidKey' && val.length < 80) {
          missing.push(key);
        }
      }
    });

    const appId = String(cfg.appId || '').trim();
    const senderId = String(cfg.messagingSenderId || '').trim();
    if (appId && senderId && APP_ID_PATTERN.test(appId)) {
      const parts = appId.split(':');
      if (parts[1] !== senderId) {
        if (!missing.includes('appId')) missing.push('appId');
        if (!missing.includes('messagingSenderId')) missing.push('messagingSenderId');
      }
    }

    return {
      isValid: missing.length === 0,
      isPlaceholder: missing.length > 0,
      missingFields: missing
    };
  }

  /**
   * Firebase App options only (vapidKey is for getToken, not initializeApp).
   */
  function toFirebaseAppOptions(cfg) {
    const source = cfg || {};
    return {
      apiKey: source.apiKey,
      authDomain: source.authDomain,
      projectId: source.projectId,
      storageBucket: source.storageBucket,
      messagingSenderId: source.messagingSenderId,
      appId: source.appId
    };
  }

  // Initial client configuration object
  // Does NOT contain fake or dummy API keys that cause 400 INVALID_ARGUMENT from Google.
  const initialConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    vapidKey: ""
  };

  // Merge any user-injected overrides (e.g. from environment or script tags)
  const userOverride = globalScope.ECHOHAND_FIREBASE_CONFIG || globalScope.firebaseConfig || {};
  globalScope.EchoHandFirebaseConfig = Object.assign({}, initialConfig, userOverride);
  globalScope.EchoHandValidateFirebaseConfig = validateFirebaseConfig;
  globalScope.EchoHandToFirebaseAppOptions = toFirebaseAppOptions;

  /**
   * Resolves the API base URL.
   * Uses relative paths on HTTP/HTTPS (same origin for ngrok & localhost),
   * only falling back to http://127.0.0.1:5000 if opened directly as file://.
   */
  function getApiBase() {
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      return 'http://127.0.0.1:5000';
    }
    return '';
  }

  /**
   * Fetches live Firebase client configuration from Flask backend /api/notifications/config.
   * Can run in Window or ServiceWorker context.
   */
  /**
   * Merge API /notifications/config payload into the in-memory client config.
   */
  function applyFirebaseConfigPayload(data) {
    if (!data || typeof data !== 'object') {
      return globalScope.EchoHandFirebaseConfig;
    }

    globalScope.EchoHandFirebaseConfigMeta = {
      isConfigured: Boolean(data.is_configured),
      missingFields: data.missing_fields || [],
      configIssues: data.config_issues || [],
      adminProjectId: data.admin_project_id || null
    };

    if (data.config && typeof data.config === 'object') {
      Object.keys(data.config).forEach(k => {
        const val = String(data.config[k] || '').trim();
        if (val) {
          globalScope.EchoHandFirebaseConfig[k] = val;
        }
      });
    }

    const validation = validateFirebaseConfig(globalScope.EchoHandFirebaseConfig);
    globalScope.EchoHandFirebaseConfig.isConfigured = validation.isValid;
    globalScope.EchoHandFirebaseConfig.missingFields = validation.missingFields;

    return globalScope.EchoHandFirebaseConfig;
  }

  globalScope.EchoHandApplyFirebaseConfigPayload = applyFirebaseConfigPayload;

  globalScope.EchoHandFetchFirebaseConfig = async function () {
    if (typeof fetch !== 'function') {
      return globalScope.EchoHandFirebaseConfig;
    }

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/notifications/config`, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        applyFirebaseConfigPayload(data);
      }
    } catch (err) {
      console.warn('[EchoHand Firebase] Could not fetch runtime config from backend:', err);
    }

    return globalScope.EchoHandFirebaseConfig;
  };

  // Bump when service-worker / config delivery logic changes (cache bust for SW script URL).
  globalScope.ECHOHAND_FCM_SW_VERSION = '20260408';

  // Browser: eager fetch. Service worker: fetch on script load (SW has no window).
  if (typeof window !== 'undefined') {
    globalScope.EchoHandFetchFirebaseConfig().catch(() => {});
  } else if (typeof self !== 'undefined' && typeof importScripts === 'function') {
    self.EchoHandFetchFirebaseConfig().catch(() => {});
  }

})();
