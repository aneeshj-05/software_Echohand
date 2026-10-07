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
    '123456789012', 'abcdef1234567890', 'beldummy'
  ];

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
        if (PLACEHOLDER_TOKENS.some(token => valLower.includes(token))) {
          missing.push(key);
        } else if (key === 'apiKey' && !val.startsWith('AIzaSy')) {
          missing.push(key);
        }
      }
    });

    return {
      isValid: missing.length === 0,
      isPlaceholder: missing.length > 0,
      missingFields: missing
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
  globalScope.EchoHandFetchFirebaseConfig = async function () {
    if (typeof fetch !== 'function') {
      return globalScope.EchoHandFirebaseConfig;
    }

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/notifications/config`, {
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.config) {
          Object.keys(data.config).forEach(k => {
            const val = String(data.config[k] || '').trim();
            if (val) {
              globalScope.EchoHandFirebaseConfig[k] = val;
            }
          });
        }
      }
    } catch (err) {
      console.warn('[EchoHand Firebase] Could not fetch runtime config from backend:', err);
    }

    const validation = validateFirebaseConfig(globalScope.EchoHandFirebaseConfig);
    globalScope.EchoHandFirebaseConfig.isConfigured = validation.isValid;
    globalScope.EchoHandFirebaseConfig.missingFields = validation.missingFields;

    return globalScope.EchoHandFirebaseConfig;
  };

  // If running in browser window, trigger eager background fetch of config
  if (typeof window !== 'undefined') {
    globalScope.EchoHandFetchFirebaseConfig().catch(() => {});
  }

})();
